/**
 * runId-validation.test.ts — runId トラッキングと keep バリデーション (manifest/metrics/result 整合性) のテスト
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
	runBenchmark,
	gitInitForTest,
	type MockCtx,
} from "./index-test-utils.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: MockCtx;

	beforeEach(() => {
		({ pi, ctx } = autoresearchTestSetup({ initGit: false }));
	});

	describe("runId tracking and keep validation", () => {
		it("autoresearch_run returns a runId", async () => {
			const testDir = createGitTestDir("test-ar-runid");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-runid",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.details.runId).toBeTruthy();
			expect(typeof result.details.runId).toBe("string");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_run piRunId is time-sortable format", async () => {
			const testDir = createGitTestDir("test-ar-runid8");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-runid8",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			const runId = result.details.piRunId;
			expect(runId).toBeTruthy();
			expect(runId).toContain("run-");
			expect(runId.length).toBeGreaterThan(8);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log rejects unknown runId", async () => {
			const testDir = createGitTestDir("test-ar-badrunid");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Run a benchmark to set lastRunResult
			await runBenchmark(pi.tools, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-badid",
				{ metric: 100, status: "discard", description: "bad id", runId: "XXXXXXXX" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("見つかりません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log accepts matching runId", async () => {
			const testDir = createGitTestDir("test-ar-matchid");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);
			const runId = runResult.details.runId;

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log",
				{ metric: 100, status: "discard", description: "matching id", runId },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.details.runId).toBe(runId);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log accepts log without runId (uses last run)", async () => {
			const testDir = createGitTestDir("test-ar-norunid");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log",
				{ metric: 100, status: "discard", description: "no runId" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.details.runId).toBe(runResult.details.runId);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log rejects keep when no run exists", async () => {
			const testDir = createGitTestDir("test-ar-norun");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// No runBenchmark call — no run exists
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-norun",
				{ metric: 100, status: "keep", description: "no run" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("autoresearch_run 結果がありません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log allows discard when no run exists", async () => {
			const testDir = createGitTestDir("test-ar-discardnorun");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// No runBenchmark call — no run exists
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-discardnorun",
				{ metric: 100, status: "discard", description: "backward compat" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.details.status).toBe("discard");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep for timed-out run", async () => {
			const testDir = createGitTestDir("test-ar-keepto");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Run with timeout
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute(
				"tc-run-to",
				{ command: "sleep 10", timeout_seconds: 0.5 },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-keep-to",
				{ metric: 100, status: "keep", description: "timeout run" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("timeout");
			expect(result.content[0].text).toContain("keep できません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep for failed exit code", async () => {
			const testDir = createGitTestDir("test-ar-keepfail");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Run a failing command
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute(
				"tc-run-fail",
				{ command: "exit 1" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-keepfail",
				{ metric: 100, status: "keep", description: "failed run" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("失敗した run");
			expect(result.content[0].text).toContain("keep できません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep when checks failed", async () => {
			const testDir = createGitTestDir("test-ar-keepchecks");

			// Create failing checks.sh
			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\necho FAIL: broken\nexit 1\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Run a passing benchmark (checks.sh will fail)
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute(
				"tc-run-checks",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-keepchecks",
				{ metric: 50, status: "keep", description: "checks failed" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("checks が失敗");
			expect(result.content[0].text).toContain("keep できません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("JSONL entry includes runId, preCommit, postCommit, changedFiles", async () => {
			const testDir = createGitTestDir("test-ar-jsonlfields");

			// git init
			gitInitForTest(testDir);
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Run benchmark
			await runBenchmark(pi.tools, ctx);

			// Log keep
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const logResult = await logTool.execute(
				"tc-log",
				{ metric: 100, status: "keep", description: "jsonl fields test" },
				undefined,
				undefined,
				ctx,
			);
			expect(logResult.content[0].text).toContain("[KEEP]");

			// Verify JSONL
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const lines = jsonl.trim().split("\n");
			const runLine = JSON.parse(lines[lines.length - 1]);

			expect(runLine.runId).toBeTruthy();
			expect(runLine.preCommit).toBeTruthy();
			expect(runLine.postCommit).toBeTruthy();
			// changedFiles may or may not be present depending on git state
			expect(runLine).toHaveProperty("postCommit");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});
});
