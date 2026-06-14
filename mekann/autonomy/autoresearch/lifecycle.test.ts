/**
 * lifecycle.test.ts — セッションライフサイクル (session_start, active guard, auto loop, init, widget) のテスト
 *
 * autoresearch/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./index-test-utils.ts を参照。
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";

import {
	autoresearchTestSetup,
	createMockPi,
	createMockCtx,
	createGitTestDir,
	gitInitForTest,
	type MockCtx,
} from "./index-test-utils.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: MockCtx;

	beforeEach(() => {
		({ pi, ctx } = autoresearchTestSetup());
	});

	describe("tool labels", () => {
		it("all tools have Japanese labels", () => {
			for (const tool of pi.tools) {
				expect(tool.label).toBeTruthy();
				expect(typeof tool.label).toBe("string");
			}
		});

		it("all tools have descriptions in Japanese", () => {
			for (const tool of pi.tools) {
				expect(tool.description).toBeTruthy();
				expect(typeof tool.description).toBe("string");
			}
		});
	});

	describe("Ralph-style auto loop", () => {
		it("queues a follow-up after a logged iteration", async () => {
			const testDir = createGitTestDir("test-ar-loop");
			const ctx = createMockCtx({ cwd: testDir });

			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.eventHandlers.get("agent_start")!({}, ctx);

			await pi.tools.find((t) => t.name === "autoresearch_init")!.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);
			await pi.tools.find((t) => t.name === "autoresearch_log")!.execute(
				"tc-log",
				{ metric: 100, status: "discard", description: "baseline" },
				undefined,
				undefined,
				ctx,
			);

			pi.sentMessages.length = 0;
			await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);

			expect(pi.sendUserMessage).toHaveBeenCalled();
			expect(pi.sentMessages[0].msg).toContain("Ralph 方式");
			expect(pi.sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("does not queue after /autoresearch off", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.eventHandlers.get("agent_start")!({}, ctx);
			await pi.commands.get("autoresearch")!.handler("off", ctx);

			pi.sentMessages.length = 0;
			await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);

			expect(pi.sentMessages).toHaveLength(0);
		});

		it("continues after repeated no-progress agent ends and only warns once", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			pi.sentMessages.length = 0;

			// NO_PROGRESS_LIMIT=10: warn at the threshold, but keep looping because
			// subagent waits / research notes / candidate review can be real progress
			// without incrementing runCount.
			for (let i = 0; i < 11; i++) {
				await pi.eventHandlers.get("agent_start")!({}, ctx);
				await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);
			}

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("benchmark/log 進捗がありません"),
				"warning",
			);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("停止するには"),
				"warning",
			);
			expect(pi.sentMessages.length).toBeGreaterThanOrEqual(11);
		});

		it("stops at max loop iterations", async () => {
			const testDir = createGitTestDir("test-ar-loop-max");
			const ctx = createMockCtx({ cwd: testDir });

			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.commands.get("autoresearch")!.handler("loop max 1", ctx);
			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await pi.eventHandlers.get("agent_start")!({}, ctx);
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);
			await logTool.execute("tc-log1", { metric: 100, status: "discard", description: "one" }, undefined, undefined, ctx);
			pi.sentMessages.length = 0;
			await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);
			expect(pi.sentMessages).toHaveLength(1);

			await pi.eventHandlers.get("agent_start")!({}, ctx);
			await logTool.execute("tc-log2", { metric: 90, status: "discard", description: "two" }, undefined, undefined, ctx);
			pi.sentMessages.length = 0;
			await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);

			expect(pi.sentMessages).toHaveLength(0);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("上限 1 回"),
				"info",
			);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("stops when the completion marker is present", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.eventHandlers.get("agent_start")!({}, ctx);
			pi.sentMessages.length = 0;

			await pi.eventHandlers.get("agent_end")!(
				{ messages: [{ role: "assistant", content: "<autoresearch>COMPLETE</autoresearch>" }] },
				ctx,
			);

			expect(pi.sentMessages).toHaveLength(0);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("完了マーカー"),
				"info",
			);
		});
	});

	describe("active guard (tools reject when inactive)", () => {
		it("autoresearch_init rejects when not active", async () => {
			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc1",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				createMockCtx(),
			);
			expect(result.content[0].text).toContain("autoresearch モードが無効です");
			expect(result.details).toEqual({});
		});

		it("autoresearch_run rejects when not active", async () => {
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc2",
				{ command: "echo hello" },
				undefined,
				undefined,
				createMockCtx(),
			);
			expect(result.content[0].text).toContain("autoresearch モードが無効です");
			expect(result.details).toEqual({});
		});

		it("autoresearch_log rejects when not active", async () => {
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc3",
				{ metric: 100, status: "keep", description: "test" },
				undefined,
				undefined,
				createMockCtx(),
			);
			expect(result.content[0].text).toContain("autoresearch モードが無効です");
			expect(result.details).toEqual({});
		});

		it("autoresearch_evaluate_query succeeds even when not active", async () => {
			const evalTool = pi.tools.find((t) => t.name === "autoresearch_evaluate_query")!;
			const result = await evalTool.execute(
				"tc-eval",
				{ query: "prepush を速くしたい" },
				undefined,
				undefined,
				createMockCtx(),
			);
			expect(result.content[0].text).not.toContain("autoresearch モードが無効です");
			expect(result.content[0].text).toContain("クエリ評価結果");
			expect(result.content[0].text).toContain("段階別 readiness");
			expect(result.content[0].text).toContain("measurementMethod");
			expect(result.content[0].text).toContain("checks policy");
			expect(result.details).toMatchObject({
				decision: expect.any(String),
				readiness: expect.objectContaining({
					initReady: expect.any(Boolean),
					runReady: expect.any(Boolean),
				}),
			});
		});

		it("autoresearch_init succeeds after /autoresearch on", async () => {
			// テスト用ディレクトリを作成 (git repo)
			const testDir = "/tmp/test-autoresearch-init-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			gitInitForTest(testDir);
			fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
			childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc4",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("初期化完了");

			// クリーンアップ
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("session_start handler", () => {
		it("sets active to false and updates widget when no JSONL exists", async () => {
			const handler = pi.eventHandlers.get("session_start")!;
			const testDir = createGitTestDir("test-ar-session");
			const ctx = createMockCtx({ cwd: testDir });
			await handler({}, ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("reconstructs state from existing JSONL", async () => {
			const handler = pi.eventHandlers.get("session_start")!;
			const testDir = createGitTestDir("test-ar-session");
			const jsonlContent =
				JSON.stringify({ type: "config", name: "perf", metricName: "ms", metricUnit: "ms", direction: "lower" }) + "\n" +
				JSON.stringify({ type: "run", run: 1, commit: "abc", metric: 100, status: "keep", description: "baseline", timestamp: Date.now() }) + "\n";
			fs.writeFileSync(path.join(testDir, "autoresearch.jsonl"), jsonlContent);
			const ctx = createMockCtx({ cwd: testDir });
			await handler({}, ctx);
			// After session_start, active is false; widget should be undefined
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("falls back to freshState on corrupt JSONL", async () => {
			const handler = pi.eventHandlers.get("session_start")!;
			const testDir = createGitTestDir("test-ar-session");
			// Write invalid JSON that causes reconstructState to throw
			fs.writeFileSync(path.join(testDir, "autoresearch.jsonl"), "NOT VALID JSON!!!");
			const ctx = createMockCtx({ cwd: testDir });
			// Should not throw; falls back to freshState
			await handler({}, ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("falls back to freshState when JSONL is a directory (EISDIR)", async () => {
			const handler = pi.eventHandlers.get("session_start")!;
			const testDir = createGitTestDir("test-ar-session");
			// Create a directory named autoresearch.jsonl — readFileSync throws EISDIR
			fs.mkdirSync(path.join(testDir, "autoresearch.jsonl"));
			const ctx = createMockCtx({ cwd: testDir });
			await handler({}, ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("autoresearch_init execute (active)", () => {
		it("initializes with name, metric_name, metric_unit, direction and writes JSONL", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc-init1",
				{ name: "perf test", metric_name: "total_ms", metric_unit: "ms", direction: "lower" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("初期化完了");
			expect(result.content[0].text).toContain("perf test");
			expect(result.content[0].text).toContain("total_ms");
			expect(result.details).toMatchObject({
				name: "perf test",
				metricName: "total_ms",
				metricUnit: "ms",
				direction: "lower",
			});

			// Verify JSONL file was written
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const configLine = JSON.parse(jsonl.trim());
			expect(configLine.type).toBe("config");
			expect(configLine.name).toBe("perf test");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("uses default direction=lower and empty unit when not specified", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc-init2",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.details).toMatchObject({
				direction: "lower",
				metricUnit: "",
			});
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("accepts direction=higher", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc-init3",
				{ name: "test", metric_name: "score", direction: "higher" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.details).toMatchObject({ direction: "higher" });
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("updateWidget with hasUI=false", () => {
		it("does not call setWidget when hasUI is false", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir, hasUI: false });
			await cmdHandler("on", ctx);
			expect(ctx.ui.setWidget).not.toHaveBeenCalled();
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

		describe("autoresearch_init JSONL write error", () => {
		it("returns error when JSONL write fails", async () => {
			const testDir = createGitTestDir();
			// Create a directory where autoresearch.jsonl would be — appendFileSync gets EISDIR
			// This works regardless of user permissions (no chmod needed)
			fs.mkdirSync(path.join(testDir, "autoresearch.jsonl"));

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const result = await initTool.execute(
				"tc-init-err",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("WARNING");
			expect(result.content[0].text).toContain("autoresearch.jsonl");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});
});
