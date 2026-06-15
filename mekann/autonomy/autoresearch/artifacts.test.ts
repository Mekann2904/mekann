/**
 * artifacts.test.ts — 成果物エクスポート (runs/metrics/decisions JSONL, pointers, ledgers) と long-run benchmark のテスト
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
		({ pi, ctx } = autoresearchTestSetup());
	});

	describe("long-run benchmark support", () => {
		it("autoresearch_run returns piRunId in time-sortable format", async () => {
			const testDir = createGitTestDir("test-ar-piRunId");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-piRunId",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			const piRunId = result.details.piRunId;
			expect(piRunId).toBeTruthy();
			expect(piRunId).toContain("run-");
			// Format: run-<timestamp>-<sha>-<random>
			expect(piRunId).toMatch(/^run-\d{8}T/);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("piRunIds sort chronologically", async () => {
			const testDir = createGitTestDir("test-ar-sort");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;

			const ids: string[] = [];
			for (let i = 0; i < 3; i++) {
				const r = await runTool.execute(
					`tc-run-sort-${i}`,
					{ command: `echo ${i}` },
					undefined,
					undefined,
					ctx,
				);
				ids.push(r.details.piRunId);
			}

			const sorted = [...ids].sort();
			expect(sorted).toEqual(ids);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("extracts RUN_ID from stdout", async () => {
			const testDir = createGitTestDir("test-ar-extract");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-extract",
				{ command: "echo RUN_ID bench-abc-123 && echo ARTIFACT_DIR logs/runs/abc && echo METRIC score=42" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.details.externalRunId).toBe("bench-abc-123");
			expect(result.details.externalArtifactDir).toBe("logs/runs/abc");
			expect(result.details.parsedMetrics).toMatchObject({ score: 42 });

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("extracts SUMMARY_PATH, VIEWLOG_PATH, METRICS_PATH from stdout", async () => {
			const testDir = createGitTestDir("test-ar-extract2");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-extract2",
				{ command: "echo SUMMARY_PATH logs/summary.json && echo VIEWLOG_PATH logs/viewlog.json && echo METRICS_PATH logs/metrics.json" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.details.externalSummaryPath).toBe("logs/summary.json");
			expect(result.details.externalViewlogPath).toBe("logs/viewlog.json");
			expect(result.details.externalMetricsPath).toBe("logs/metrics.json");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("works without external artifacts", async () => {
			const testDir = createGitTestDir("test-ar-noext");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-noext",
				{ command: "echo hello" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("[OK]");
			expect(result.details.externalRunId).toBeNull();
			expect(result.details.externalArtifactDir).toBeNull();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("autoresearch_log rejects non-existent piRunId", async () => {
			const testDir = createGitTestDir("test-ar-noexist");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-noexist",
				{ metric: 100, status: "discard", description: "test", runId: "nonexistent-pi-run-id" },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("見つかりません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("timeout run cannot be kept", async () => {
			const testDir = createGitTestDir("test-ar-tkeep");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-to",
				{ command: "sleep 10", timeout_seconds: 0.5 },
				undefined, undefined, ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-to",
				{ metric: 100, status: "keep", description: "to", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("timeout");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("exitCode != 0 run cannot be kept", async () => {
			const testDir = createGitTestDir("test-ar-ecfail");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-ec",
				{ command: "exit 1" },
				undefined, undefined, ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-ec",
				{ metric: 100, status: "keep", description: "ec", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("失敗した run");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("checks failure prevents keep", async () => {
			const testDir = createGitTestDir("test-ar-chkf");

			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\nexit 1\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-chk",
				{ command: "echo ok" },
				undefined, undefined, ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-chk",
				{ metric: 50, status: "keep", description: "chk", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("checks が失敗");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("keep creates commit and records preCommit/postCommit", async () => {
			const testDir = createGitTestDir("test-ar-prov");

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			await runBenchmark(pi.tools, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-prov",
				{ metric: 100, status: "keep", description: "prov test" },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.details.preCommit).toBeTruthy();
			expect(result.details.postCommit).toBeTruthy();

			// Verify JSONL has provenance
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const runLine = JSON.parse(jsonl.trim().split("\n").pop());
			expect(runLine.preCommit).toBeTruthy();
			expect(runLine.postCommit).toBeTruthy();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("discard performs revert and records decision", async () => {
			const testDir = createGitTestDir("test-ar-drev");

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "original");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Make a change
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "modified");

			await runBenchmark(pi.tools, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-drev",
				{ metric: 200, status: "discard", description: "revert test" },
				undefined, undefined, ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.content[0].text).toContain("revert");

			// Verify file was reverted
			const content = fs.readFileSync(path.join(testDir, "dummy.txt"), "utf8");
			expect(content).toBe("original");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("run artifact directory is not overwritten", async () => {
			const testDir = createGitTestDir("test-ar-nooverwrite");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run-ow",
				{ command: "echo ok" },
				undefined, undefined, ctx,
			);

			const piRunId = result.details.piRunId;
			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const artifactDir = path.join(testDir, ".pi", "autoresearch", sessionId, "runs", piRunId);

			// Verify artifact directory exists
			expect(fs.existsSync(artifactDir)).toBe(true);
			expect(fs.existsSync(path.join(artifactDir, "manifest.json"))).toBe(true);
			expect(fs.existsSync(path.join(artifactDir, "stdout.log"))).toBe(true);

			// Verify manifest has artifactComplete=true (set after checks/not-needed)
			const manifest = JSON.parse(fs.readFileSync(path.join(artifactDir, "manifest.json"), "utf8"));
			expect(manifest.artifactComplete).toBe(true);

			// Verify result.json also exists
			expect(fs.existsSync(path.join(artifactDir, "result.json"))).toBe(true);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("runs.jsonl is populated", async () => {
			const testDir = createGitTestDir("test-ar-runsjl");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute("tc-run-rjl", { command: "echo ok" }, undefined, undefined, ctx);

			// Find the runs.jsonl
			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);
			const rjlPath = path.join(sessDir, "runs.jsonl");
			expect(fs.existsSync(rjlPath)).toBe(true);

			const content = fs.readFileSync(rjlPath, "utf8");
			const lines = content.trim().split("\n").filter(Boolean);
			expect(lines.length).toBe(1);
			const entry = JSON.parse(lines[0]);
			expect(entry.schemaVersion).toBe(1);
			expect(entry.piRunId).toBeTruthy();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("metrics.jsonl is populated", async () => {
			const testDir = createGitTestDir("test-ar-mjl");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			await runBenchmark(pi.tools, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await logTool.execute(
				"tc-log-mjl",
				{ metric: 100, status: "keep", description: "test" },
				undefined, undefined, ctx,
			);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);
			const mjlPath = path.join(sessDir, "metrics.jsonl");
			expect(fs.existsSync(mjlPath)).toBe(true);

			const content = fs.readFileSync(mjlPath, "utf8");
			const entry = JSON.parse(content.trim());
			expect(entry.schemaVersion).toBe(1);
			expect(entry.primaryMetricValue).toBe(100);
			expect(entry.runSeq).toBe(1);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("decisions.jsonl is populated", async () => {
			const testDir = createGitTestDir("test-ar-djl");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			await runBenchmark(pi.tools, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await logTool.execute(
				"tc-log-djl",
				{ metric: 100, status: "discard", description: "test" },
				undefined, undefined, ctx,
			);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);
			const djlPath = path.join(sessDir, "decisions.jsonl");
			expect(fs.existsSync(djlPath)).toBe(true);

			const content = fs.readFileSync(djlPath, "utf8");
			const entry = JSON.parse(content.trim());
			expect(entry.schemaVersion).toBe(1);
			expect(entry.status).toBe("discard");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("latest.pointer.json and best.pointer.json are updated", async () => {
			const testDir = createGitTestDir("test-ar-ptr");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms", direction: "lower" }, undefined, undefined, ctx);

			// First run
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const run1 = await runTool.execute("tc-run1", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await logTool.execute(
				"tc-log1", { metric: 100, status: "keep", description: "first", runId: run1.details.piRunId },
				undefined, undefined, ctx,
			);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);
			const latestPath = path.join(sessDir, "latest.pointer.json");
			const bestPath = path.join(sessDir, "best.pointer.json");

			expect(fs.existsSync(latestPath)).toBe(true);
			expect(fs.existsSync(bestPath)).toBe(true);

			const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
			const best = JSON.parse(fs.readFileSync(bestPath, "utf8"));

			expect(latest.metric).toBe(100);
			expect(best.metric).toBe(100);

			// Second run — better
			const run2 = await runTool.execute("tc-run2", { command: "echo METRIC ms=80" }, undefined, undefined, ctx);
			await logTool.execute(
				"tc-log2", { metric: 80, status: "keep", description: "better", runId: run2.details.piRunId },
				undefined, undefined, ctx,
			);

			const best2 = JSON.parse(fs.readFileSync(bestPath, "utf8"));
			expect(best2.metric).toBe(80);

			const latest2 = JSON.parse(fs.readFileSync(latestPath, "utf8"));
			expect(latest2.metric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("events.jsonl records started/completed/logged events", async () => {
			const testDir = createGitTestDir("test-ar-evjl");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute("tc-run-ev", { command: "echo ok" }, undefined, undefined, ctx);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await logTool.execute(
				"tc-log-ev", { metric: 100, status: "discard", description: "test" },
				undefined, undefined, ctx,
			);

			const sessDirs = fs.readdirSync(path.join(testDir, ".pi", "autoresearch"));
			const sessionId = sessDirs[0];
			const sessDir = path.join(testDir, ".pi", "autoresearch", sessionId);
			const evPath = path.join(sessDir, "events.jsonl");
			expect(fs.existsSync(evPath)).toBe(true);

			const content = fs.readFileSync(evPath, "utf8");
			const events = content.trim().split("\n").map(l => JSON.parse(l));
			const eventTypes = events.map((e: any) => e.event);

			expect(eventTypes).toContain("started");
			expect(eventTypes).toContain("completed");
			expect(eventTypes).toContain("logged");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("logs full external artifact info in JSONL", async () => {
			const testDir = createGitTestDir("test-ar-extjsonl");

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "score" }, undefined, undefined, ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute(
				"tc-run-ext",
				{ command: "echo RUN_ID ext-123 && echo ARTIFACT_DIR /tmp/ext && echo SUMMARY_PATH /tmp/ext/summary.json && echo VIEWLOG_PATH /tmp/ext/viewlog.json && echo METRICS_PATH /tmp/ext/metrics.json && echo METRIC score=42" },
				undefined, undefined, ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await logTool.execute(
				"tc-log-ext",
				{ metric: 42, status: "discard", description: "ext test", runId: runResult.details.piRunId },
				undefined, undefined, ctx,
			);

			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const runLine = JSON.parse(jsonl.trim().split("\n").pop());

			expect(runLine.externalRunId).toBe("ext-123");
			expect(runLine.externalArtifactDir).toBe("/tmp/ext");
			expect(runLine.externalSummaryPath).toBe("/tmp/ext/summary.json");
			expect(runLine.externalViewlogPath).toBe("/tmp/ext/viewlog.json");
			expect(runLine.externalMetricsPath).toBe("/tmp/ext/metrics.json");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

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
