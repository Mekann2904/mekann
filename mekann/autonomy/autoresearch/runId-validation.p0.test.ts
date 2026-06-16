/**
 * runId-validation.p0.test.ts — keep バリデーション (JSONL entry, P0 manifest/metrics/result,
 * P1 out-of-order runSeq) のテスト。runId-validation.test.ts から並列実行のために分割。
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
		it("JSONL entry includes command and exitCode", async () => {
			const testDir = createGitTestDir("test-ar-jsonlcmd");

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
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute(
				"tc-run",
				{ command: "echo hello world" },
				undefined,
				undefined,
				ctx,
			);

			// Log discard
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const logResult = await logTool.execute(
				"tc-log",
				{ metric: 100, status: "discard", description: "jsonl cmd test" },
				undefined,
				undefined,
				ctx,
			);
			expect(logResult.content[0].text).toContain("[DISCARD]");

			// Verify JSONL
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const lines = jsonl.trim().split("\n");
			const runLine = JSON.parse(lines[lines.length - 1]);

			expect(runLine.command).toBe("echo hello world");
			expect(runLine.exitCode).toBe(0);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("discard performs revert", async () => {
			const testDir = createGitTestDir("test-ar-revert");

			// git init
			gitInitForTest(testDir);
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "original");
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

			// Make a change to the tracked file
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "modified");

			// Run benchmark
			await runBenchmark(pi.tools, ctx);

			// Log discard → should revert
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-revert",
				{ metric: 200, status: "discard", description: "revert test" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.content[0].text).toContain("revert");

			// Verify file was reverted
			const content = fs.readFileSync(path.join(testDir, "dummy.txt"), "utf8");
			expect(content).toBe("original");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("keep creates a commit", async () => {
			const testDir = createGitTestDir("test-ar-commit");

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

			// Log keep → should create a commit. 候補変更を用意する
			// (V1 移行で init は .autoresearch/ 内に contract を書くため commit 対象外。
			// 代わりに dummy.txt の候補変更が commit される)
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "candidate change");
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-commit",
				{ metric: 100, status: "keep", description: "commit test" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.content[0].text).toContain("[git]");

			// Verify new commit was created
			const logOutput = childProcess.execFileSync("git", ["log", "--oneline"], { cwd: testDir, encoding: "utf8" });
			const commits = logOutput.trim().split("\n");
			expect(commits.length).toBeGreaterThanOrEqual(2); // init + keep commit
			expect(commits[0]).toContain("commit test");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P0: keep validation requires manifest.json and metrics.json", () => {
		it("rejects keep when manifest.json is missing", async () => {
			const testDir = createGitTestDir("test-ar-nomanifest");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Run a benchmark — this creates artifacts normally
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-nm", { command: "echo METRIC ms=42" }, undefined, undefined, ctx,
			);

			// Delete manifest.json from canonical artifact to simulate partial failure
			const stateData = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = stateData.currentPlanId;
			const manifestPath = path.join(testDir, ".autoresearch", "plans", planId, "runs", runResult.details.piRunId, "manifest.json");
			if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nm", { metric: 42, status: "keep", description: "no manifest", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("manifest.json");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep when metrics.json is missing", async () => {
			const testDir = createGitTestDir("test-ar-nometrics");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-nometrics", { command: "echo METRIC ms=42" }, undefined, undefined, ctx,
			);

			// Delete metrics.json from canonical artifact
			const stateData = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = stateData.currentPlanId;
			const metricsPath = path.join(testDir, ".autoresearch", "plans", planId, "runs", runResult.details.piRunId, "metrics.json");
			if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nometrics", { metric: 42, status: "keep", description: "no metrics", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("metrics.json");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep when manifest has no artifactComplete", async () => {
			const testDir = createGitTestDir("test-ar-nocomplete");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-noc", { command: "echo METRIC ms=42" }, undefined, undefined, ctx,
			);

			// Overwrite manifest.json without artifactComplete to simulate partial write
			const stateData = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = stateData.currentPlanId;
			const manifestPath = path.join(testDir, ".autoresearch", "plans", planId, "runs", runResult.details.piRunId, "manifest.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			delete manifest.artifactComplete;
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-noc", { metric: 42, status: "keep", description: "no complete", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("artifactComplete");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P1: run→run→log out-of-order uses run-time runSeq", () => {
		it("logs run2 first then run1 — runSeq is based on run order, not log order", async () => {
			const testDir = createGitTestDir("test-ar-ootest");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;

			// Run two benchmarks without logging in between
			const run1 = await runTool.execute("tc-r1", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			const run2 = await runTool.execute("tc-r2", { command: "echo METRIC ms=80" }, undefined, undefined, ctx);

			// Log run2 first, then run1
			const log2 = await logTool.execute(
				"tc-l2", { metric: 80, status: "keep", description: "second run logged first", runId: run2.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(log2.content[0].text).toContain("[KEEP]");

			const log1 = await logTool.execute(
				"tc-l1", { metric: 100, status: "discard", description: "first run logged second", runId: run1.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(log1.content[0].text).toContain("[DISCARD]");

			// Verify runs.jsonl has sequential runSeq
			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);

			const runsContent = fs.readFileSync(path.join(sessDir, "runs.jsonl"), "utf8").trim().split("\n");
			const runSeqs = runsContent.map(l => JSON.parse(l).runSeq);
			expect(runSeqs).toEqual([1, 2]);

			// metrics.jsonl: first entry is run2 (logged first), but runSeq should be 2 (run order)
			const metricsContent = fs.readFileSync(path.join(sessDir, "metrics.jsonl"), "utf8").trim().split("\n");
			const metricEntries = metricsContent.map(l => JSON.parse(l));
			// run2 was logged first → metricSeqs[0] = 2, run1 logged second → metricSeqs[1] = 1
			expect(metricEntries[0].runSeq).toBe(2); // run2
			expect(metricEntries[0].primaryMetricValue).toBe(80);
			expect(metricEntries[1].runSeq).toBe(1); // run1
			expect(metricEntries[1].primaryMetricValue).toBe(100);

			// latest pointer should reflect the last LOG (run1), with runSeq=1
			const latest = JSON.parse(fs.readFileSync(path.join(sessDir, "latest.pointer.json"), "utf8"));
			expect(latest.runSeq).toBe(1);

			// best pointer should reflect the best keep (run2 with metric=80), with runSeq=2
			const best = JSON.parse(fs.readFileSync(path.join(sessDir, "best.pointer.json"), "utf8"));
			expect(best.runSeq).toBe(2);
			expect(best.metric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P0: keep validation requires result.json", () => {
		it("rejects keep when result.json is missing", async () => {
			const testDir = createGitTestDir("test-ar-noresult");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-nr", { command: "echo METRIC ms=42" }, undefined, undefined, ctx,
			);

			// Delete result.json from canonical artifact
			const stateData = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = stateData.currentPlanId;
			const resultPath = path.join(testDir, ".autoresearch", "plans", planId, "runs", runResult.details.piRunId, "result.json");
			if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nr", { metric: 42, status: "keep", description: "no result", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("result.json");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});
});
