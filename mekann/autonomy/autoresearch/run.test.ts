/**
 * run.test.ts — autoresearch_run ツール (benchmark 実行, METRIC 解析, timeout, secret redaction) のテスト
 *
 * autoresearch/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./index-test-utils.ts を参照。
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import {
	autoresearchTestSetup,
	createMockPi,
	createMockCtx,
	createGitTestDir,
	type MockCtx,
} from "./index-test-utils.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;
	let ctx: MockCtx;

	beforeEach(() => {
		({ pi, ctx } = autoresearchTestSetup());
	});

	describe("autoresearch_run execute (active)", () => {
		it("runs a successful command and returns [OK]", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run1",
				{ command: "echo hello" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[OK]");
			expect(result.content[0].text).toContain("実行時間");
			expect(result.details).toMatchObject({ passed: true });
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("runs a failing command and returns [FAIL]", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run2",
				{ command: "exit 1" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[FAIL]");
			expect(result.details.passed).toBe(false);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("times out and returns [TIMEOUT]", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run3",
				{ command: "sleep 10", timeout_seconds: 0.5 },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[TIMEOUT]");
			expect(result.details.timedOut).toBe(true);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("redacts secrets from response details and artifact logs", async () => {
			const testDir = createGitTestDir("test-ar-secret");
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-secret",
				{ command: "echo API_KEY=abc123; echo 'Authorization: Bearer bearer123'; echo METRIC ms=1; echo TOKEN=tok123 >&2; echo PASSWORD=pw123 >&2" },
				undefined,
				undefined,
				ctx,
			);

			const text = result.content[0].text;
			expect(text).not.toContain("abc123");
			expect(text).not.toContain("bearer123");
			expect(text).not.toContain("tok123");
			expect(text).not.toContain("pw123");
			expect(text).toContain("***REDACTED***");

			expect(result.details.stdout).toBeUndefined();
			expect(result.details.stderr).toBeUndefined();
			expect(result.details.output).not.toContain("abc123");
			expect(result.details.output).not.toContain("bearer123");
			expect(result.details.output).not.toContain("tok123");
			expect(result.details.output).not.toContain("pw123");

			const runDir = result.details.artifactDir as string;
			const stdoutLog = fs.readFileSync(path.join(runDir, "stdout.log"), "utf8");
			const stderrLog = fs.readFileSync(path.join(runDir, "stderr.log"), "utf8");
			expect(stdoutLog).not.toContain("abc123");
			expect(stdoutLog).not.toContain("bearer123");
			expect(stderrLog).not.toContain("tok123");
			expect(stderrLog).not.toContain("pw123");
			expect(stdoutLog + stderrLog).toContain("***REDACTED***");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("parses METRIC output lines", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			// First init to set metric name
			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "total_ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run4",
				{ command: "echo METRIC total_ms=42.5 && echo METRIC other=10" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("METRIC total_ms=42.5");
			expect(result.content[0].text).toContain("METRIC other=10");
			expect(result.content[0].text).toContain("主指標 total_ms=42.5ms");
			expect(result.details.parsedMetrics).toMatchObject({ total_ms: 42.5, other: 10 });
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("parses METRIC: output lines (colon format)", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "total_ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-colon",
				{ command: "echo 'METRIC: total_ms=42.5' && echo 'METRIC: other=10'" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("METRIC: total_ms=42.5");
			expect(result.content[0].text).toContain("METRIC: other=10");
			expect(result.content[0].text).toContain("主指標 total_ms=42.5ms");
			expect(result.details.parsedMetrics).toMatchObject({ total_ms: 42.5, other: 10 });
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("runs checks.sh when benchmark passes", async () => {
			const testDir = createGitTestDir();
			// Create a checks.sh that exits 0
			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\necho checks passed\nexit 0\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run5",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[OK]");
			expect(result.content[0].text).toContain("checks: 成功");
			expect(result.details.checks.passed).toBe(true);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("reports checks failure when checks.sh exits non-zero", async () => {
			const testDir = createGitTestDir();
			// Create a checks.sh that fails
			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\necho FAIL: broken\nexit 1\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run6",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("checks: 失敗");
			expect(result.details.checks.passed).toBe(false);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("does not run checks when benchmark fails", async () => {
			const testDir = createGitTestDir();
			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\nexit 0\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run7",
				{ command: "exit 1" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[FAIL]");
			expect(result.content[0].text).not.toContain("checks:");
			expect(result.details.checks.passed).toBeNull();
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("shows widget during execution", async () => {
			const testDir = createGitTestDir();
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			ctx.ui.setWidget.mockClear();
			await runTool.execute(
				"tc-run8",
				{ command: "echo hi" },
				undefined,
				undefined,
				ctx,
			);
			// setWidget called: once for running, once for idle after
			const calls = ctx.ui.setWidget.mock.calls;
			expect(calls.length).toBeGreaterThanOrEqual(2);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("autoresearch_run edge cases", () => {
		it("does not show primary metric hint when not initialized", async () => {
			const testDir = createGitTestDir("test-ar-noinit");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			// Run without init → state.metricName is "metric" (default)
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-noinit",
				{ command: "echo METRIC other=10" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("METRIC other=10");
			// Primary metric hint should NOT appear because metricName is "metric" and there's no "metric" in parsedMetrics
			expect(result.content[0].text).not.toContain("主指標");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("shows output for failed commands", async () => {
			const testDir = createGitTestDir("test-ar-failout");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-failout",
				{ command: "echo 'error msg' >&2 && exit 1" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[FAIL]");
			expect(result.content[0].text).toContain("error msg");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P0: streaming parse captures METRIC after 1MB in tool context", () => {
		it("captures METRIC emitted after large output", async () => {
			const testDir = createGitTestDir("test-ar-stream");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "score" }, undefined, undefined, ctx);

			// Generate >1MB output, then emit METRIC
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-stream",
			{ command: "for i in $(seq 1 150000); do echo \"padding $i\"; done && echo METRIC score=99 && echo RUN_ID stream-test" },
			undefined, undefined, ctx,
			);

			expect(result.content[0].text).toContain("METRIC score=99");
			expect(result.details.parsedMetrics).toMatchObject({ score: 99 });
			expect(result.details.externalRunId).toBe("stream-test");

			fs.rmSync(testDir, { recursive: true, force: true });
		}, 35000);
	});
});
