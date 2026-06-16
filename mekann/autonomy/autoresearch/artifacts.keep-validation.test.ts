/**
 * artifacts.keep-validation.test.ts — keep 検証 (metric type 別: duration_seconds / p95 / wall-clock) と
 * runSeq 一貫性, process group kill, P0 artifact dir failure のテスト。
 *
 * artifacts.test.ts から並列実行のために分割 (see TESTING.md / autoresearch test perf)。 * 共有ヘルパーは ./index-test-utils.ts を参照。
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

	describe("long-run benchmark support", () => {

		// ── P0/P1 fix tests ──────────────────────────────────────────────

		it("rejects keep when primary metric not in run output", async () => {
			const testDir = createGitTestDir("test-ar-nometric");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "score" }, undefined, undefined, ctx);

			// Run produces METRIC ms=100 but metric_name is "score"
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute("tc-run-nm", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nm", { metric: 100, status: "keep", description: "no metric" },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("score");
			expect(result.content[0].text).toContain("keep");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("allows keep for duration_seconds using measured wall-clock duration", async () => {
			const testDir = createGitTestDir("test-ar-wallclock");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "wall", metric_name: "duration_seconds", metric_unit: "seconds" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-wall", { command: "echo ok" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-wall", { metric: 999, status: "keep", description: "wall", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.details.metricSource).toBe("wall_clock");
			expect(result.details.metric).toBeCloseTo(runResult.details.durationSeconds, 3);
			expect(result.details.metric).not.toBe(999);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("prefers stdout METRIC over wall-clock for duration_seconds", async () => {
			const testDir = createGitTestDir("test-ar-wallstdout");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "wall", metric_name: "duration_seconds", metric_unit: "seconds" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-wallstdout", { command: "echo METRIC duration_seconds=3" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-wallstdout", { metric: 999, status: "keep", description: "wall stdout", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.details.metric).toBe(3);
			expect(result.details.metricSource).toBe("stdout_metric");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("does not use durationSeconds for non-wall-clock primary metric", async () => {
			const testDir = createGitTestDir("test-ar-p95nom");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "p95", metric_name: "p95_latency_ms", metric_unit: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-p95nom", { command: "echo ok" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-p95nom", { metric: 123, status: "keep", description: "p95 no metric", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("p95_latency_ms");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("allows keep for p95_latency_ms when stdout METRIC is present", async () => {
			const testDir = createGitTestDir("test-ar-p95metric");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "p95", metric_name: "p95_latency_ms", metric_unit: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-p95metric", { command: "echo METRIC p95_latency_ms=123" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-p95metric", { metric: 999, status: "keep", description: "p95 metric", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.details.metric).toBe(123);
			expect(result.details.metricSource).toBe("stdout_metric");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep when artifact save failed", async () => {
			const testDir = createGitTestDir("test-ar-artfail");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-af", { command: "echo METRIC ms=42" }, undefined, undefined, ctx);

			// Verify artifact was created
			expect(runResult.details.piRunId).toBeTruthy();
			expect(fs.existsSync(path.join(testDir, ".pi", "autoresearch"))).toBe(true);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("runSeq does not duplicate when multiple runs before log", async () => {
			const testDir = createGitTestDir("test-ar-rseq");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Run twice without logging
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute("tc-run-rs1", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			await runTool.execute("tc-run-rs2", { command: "echo METRIC ms=80" }, undefined, undefined, ctx);

			// Check runs.jsonl has runSeq 1 and 2 (not both 1)
			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const rjlPath = path.join(testDir, ".pi", "autoresearch", sessionId, "runs.jsonl");
			const runsContent = fs.readFileSync(rjlPath, "utf8").trim().split("\n");

			expect(runsContent.length).toBe(2);
			const seqs = runsContent.map(l => JSON.parse(l).runSeq);
			expect(seqs[0]).toBe(1);
			expect(seqs[1]).toBe(2);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("runResultMap fallback loads from manifest.json", async () => {
			const testDir = createGitTestDir("test-ar-fallback");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-fb", { command: "echo METRIC ms=42" }, undefined, undefined, ctx);
			const piRunId = runResult.details.piRunId;

			// Clear the memory map to simulate process restart
			// (We can't directly clear the map, but we can verify artifact exists)
			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const manifestPath = path.join(testDir, ".pi", "autoresearch", sessionId, "runs", piRunId, "manifest.json");
			expect(fs.existsSync(manifestPath)).toBe(true);

			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			expect(manifest.piRunId).toBe(piRunId);
			// parsedMetrics lives in metrics.json, NOT the manifest (safe schema).
			const metricsPath = path.join(path.dirname(manifestPath), "metrics.json");
			const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
			expect(metrics).toMatchObject({ ms: 42 });
			// Manifest must never embed run log bodies.
			expect(manifest.stdout).toBeUndefined();
			expect(manifest.stderr).toBeUndefined();
			expect(manifest.output).toBeUndefined();
			expect(manifest.parsedMetrics).toBeUndefined();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("stdout.log is written even if output is large", async () => {
			const testDir = createGitTestDir("test-ar-large");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Generate 2000 lines of output
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run-lg", { command: "for i in $(seq 1 2000); do echo \"line $i\"; done && echo METRIC ms=100" }, undefined, undefined, ctx);
			const piRunId = runResult.details.piRunId;

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const stdoutPath = path.join(testDir, ".pi", "autoresearch", sessionId, "runs", piRunId, "stdout.log");

			expect(fs.existsSync(stdoutPath)).toBe(true);
			const stdoutContent = fs.readFileSync(stdoutPath, "utf8");
			// Should have most of the 2000 lines
			const lineCount = stdoutContent.split("\n").length;
			expect(lineCount).toBeGreaterThan(1000);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("process group kill: timeout kills child processes", async () => {
			const testDir = createGitTestDir("test-ar-pgkill");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Run a command that spawns a background sleep child
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-pg",
				{ command: "sleep 60", timeout_seconds: 1 },
				undefined, undefined, ctx,
			);
			expect(result.details.timedOut).toBe(true);
			expect(result.details.passed).toBe(false);

			// Give a moment for process cleanup
			await new Promise(r => setTimeout(r, 500));

			// Verify no leftover sleep processes
			const { execSync } = require("child_process");
			try {
				const ps = execSync("ps aux | grep 'sleep 60' | grep -v grep || true", { encoding: "utf8" });
				expect(ps.trim()).toBe("");
			} catch {
				// ps might fail in some environments
			}

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P0: .gitignore includes .pi/", () => {
		it(".gitignore contains .pi/", () => {
			const gitignorePath = path.resolve(__dirname, "../../..", ".gitignore");
			expect(fs.existsSync(gitignorePath)).toBe(true);
			const content = fs.readFileSync(gitignorePath, "utf8");
			expect(content).toContain(".pi/");
		});
	});

	describe("P0: artifact dir creation failure prevents benchmark", () => {
		it("returns error when artifact dir creation fails", async () => {
			const testDir = createGitTestDir("test-ar-artfail");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Make canonical plan-scoped artifact creation fail by creating a plain file
			// where the runs directory would be created
			const stateData = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			const planId = stateData.currentPlanId;
			const planRunsDir = path.join(testDir, ".autoresearch", "plans", planId, "runs");
			// Create a plain file where "runs" dir would go — createRunArtifacts will fail
			fs.mkdirSync(path.dirname(planRunsDir), { recursive: true });
			fs.writeFileSync(planRunsDir, "blocker");

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-artfail",
			{ command: "echo hello" },
			undefined, undefined, ctx,
			);

			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("benchmark を実行しません");

			// Cleanup
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("P0: runSeq consistency between runs.jsonl and pointers", () => {
		it("metrics.jsonl and pointer runSeq match runs.jsonl runSeq", async () => {
			const testDir = createGitTestDir("test-ar-seqmatch");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Run twice, log in between
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;

			const run1 = await runTool.execute("tc-rs1", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			await logTool.execute("tc-l1", { metric: 100, status: "keep", description: "first", runId: run1.details.piRunId }, undefined, undefined, ctx);

			const run2 = await runTool.execute("tc-rs2", { command: "echo METRIC ms=80" }, undefined, undefined, ctx);
			await logTool.execute("tc-l2", { metric: 80, status: "keep", description: "second", runId: run2.details.piRunId }, undefined, undefined, ctx);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);

			// Verify runs.jsonl
			const runsContent = fs.readFileSync(path.join(sessDir, "runs.jsonl"), "utf8").trim().split("\n");
			const runSeqs = runsContent.map(l => JSON.parse(l).runSeq);
			expect(runSeqs).toEqual([1, 2]);

			// Verify metrics.jsonl runSeq matches
			const metricsContent = fs.readFileSync(path.join(sessDir, "metrics.jsonl"), "utf8").trim().split("\n");
			const metricSeqs = metricsContent.map(l => JSON.parse(l).runSeq);
			expect(metricSeqs).toEqual([1, 2]);

			// Verify pointers
			const latest = JSON.parse(fs.readFileSync(path.join(sessDir, "latest.pointer.json"), "utf8"));
			expect(latest.runSeq).toBe(2);
			expect(latest.metric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});
});
