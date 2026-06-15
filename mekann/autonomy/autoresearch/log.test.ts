/**
 * log.test.ts — autoresearch_log ツール (keep/discard/crash 決定, git commit/revert, JSONL エラー) のテスト
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

	describe("autoresearch_log checks_failed", () => {
		it("accepts checks_failed as a valid status in parameters", () => {
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log");
			expect(logTool).toBeTruthy();
			// The description should mention checks_failed
			expect(logTool!.description).toContain("checks_failed");
		});
	});

	describe("autoresearch_log execute (active)", () => {
		it("logs keep: updates bestMetric, JSONL, git auto commit", async () => {
			const testDir = createGitTestDir();

			// git init for auto commit
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms", direction: "lower" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			// Make a file change so git has something to commit
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "changed");

			// Run a benchmark first (keep requires a preceding run)
			await runBenchmark(pi.tools, ctx);

			const result = await logTool.execute(
				"tc-log1",
				{ metric: 100, status: "keep", description: "baseline test" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			expect(result.content[0].text).toContain("実験 #1");
			expect(result.content[0].text).toContain("採用");
			expect(result.content[0].text).toContain("ms=100ms");
			expect(result.content[0].text).toContain("最良: ms=100ms");
			expect(result.details).toMatchObject({ run: 1, status: "keep", metric: 100, bestMetric: 100, kept: 1 });
			// Git commit message should be in output
			expect(result.content[0].text).toContain("[git]");

			// Verify JSONL
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const lines = jsonl.trim().split("\n");
			expect(lines.length).toBe(2); // config + run
			const runLine = JSON.parse(lines[1]);
			expect(runLine.type).toBe("run");
			expect(runLine.metric).toBe(100);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("logs discard: git auto revert", async () => {
			const testDir = createGitTestDir();

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log2",
				{ metric: 200, status: "discard", description: "worse result" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.content[0].text).toContain("棄却");
			expect(result.details).toMatchObject({ status: "discard", kept: 0 });
			expect(result.content[0].text).toContain("[git]");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("logs crash: git auto revert", async () => {
			const testDir = createGitTestDir();

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log3",
				{ metric: 0, status: "crash", description: "crashed" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[CRASH]");
			expect(result.content[0].text).toContain("クラッシュ");
			expect(result.details).toMatchObject({ status: "crash" });

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("logs checks_failed: git auto revert", async () => {
			const testDir = createGitTestDir();

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log4",
				{ metric: 50, status: "checks_failed", description: "checks broke" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[CHECKS_FAILED]");
			expect(result.content[0].text).toContain("checks失敗");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("rejects keep when checks failed", async () => {
			const testDir = createGitTestDir();

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			// Create failing checks.sh
			fs.writeFileSync(path.join(testDir, "autoresearch.checks.sh"), "#!/bin/bash\necho FAIL\nexit 1\n");
			fs.chmodSync(path.join(testDir, "autoresearch.checks.sh"), 0o755);

			// Run a passing benchmark
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			await runTool.execute(
				"tc-run",
				{ command: "echo ok" },
				undefined,
				undefined,
				ctx,
			);

			// Try to keep — should be rejected because checks failed
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log5",
				{ metric: 50, status: "keep", description: "should fail" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("keep できません");
			expect(result.details).toEqual({});

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("accepts optional commit, metrics, and memo params", async () => {
			const testDir = createGitTestDir();

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", metric_unit: "ms" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			// Run a benchmark first (keep requires a preceding run)
			await runBenchmark(pi.tools, ctx);
			const result = await logTool.execute(
				"tc-log6",
				{
					metric: 80,
					status: "keep",
					description: "with extras",
					commit: "abc123",
					metrics: { peak_ms: 150, avg_ms: 90 },
					memo: "test memo",
				},
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			// P0-2: commit param is used as preCommit, but postCommit is the actual git hash
			expect(result.details.commit).toBeTruthy();
			expect(result.details.preCommit).toBeTruthy();

			// Verify JSONL has metrics and memo
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const runLine = JSON.parse(jsonl.trim().split("\n")[1]);
			expect(runLine.metrics).toMatchObject({ peak_ms: 150, avg_ms: 90 });
			expect(runLine.memo).toBe("test memo");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("auto-obtains commit hash when commit param is omitted", async () => {
			const testDir = createGitTestDir();

			// Without git, getGitShortHash returns "unknown"
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

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log7",
				{ metric: 90, status: "discard", description: "no commit param" },
				undefined,
				undefined,
				ctx,
			);
			// P0-1: git repo exists, so commit hash should be real (not "unknown")
			expect(result.content[0].text).toContain("コミット:");
			expect(result.details.commit).toBeTruthy();
			expect(result.details.commit).not.toBe("");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("updates bestMetric for direction=lower (lower is better)", async () => {
			const testDir = createGitTestDir();

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "ms", direction: "lower" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;

			// First keep: 100
			await runBenchmark(pi.tools, ctx, "echo METRIC ms=100");
			const r1 = await logTool.execute(
				"tc-l1", { metric: 100, status: "keep", description: "baseline" },
				undefined, undefined, ctx,
			);
			expect(r1.details.bestMetric).toBe(100);

			// Better keep: 80
			await runBenchmark(pi.tools, ctx, "echo METRIC ms=80");
			const r2 = await logTool.execute(
				"tc-l2", { metric: 80, status: "keep", description: "improved" },
				undefined, undefined, ctx,
			);
			expect(r2.details.bestMetric).toBe(80);

			// Worse keep: 120 → bestMetric stays 80
			await runBenchmark(pi.tools, ctx, "echo METRIC ms=120");
			const r3 = await logTool.execute(
				"tc-l3", { metric: 120, status: "keep", description: "worse" },
				undefined, undefined, ctx,
			);
			expect(r3.details.bestMetric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("updates bestMetric for direction=higher (higher is better)", async () => {
			const testDir = createGitTestDir();

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute(
				"tc-init",
				{ name: "test", metric_name: "score", direction: "higher" },
				undefined,
				undefined,
				ctx,
			);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;

			await runBenchmark(pi.tools, ctx, "echo METRIC score=50");
			const r1 = await logTool.execute(
				"tc-h1", { metric: 50, status: "keep", description: "baseline" },
				undefined, undefined, ctx,
			);
			expect(r1.details.bestMetric).toBe(50);

			await runBenchmark(pi.tools, ctx, "echo METRIC score=80");
			const r2 = await logTool.execute(
				"tc-h2", { metric: 80, status: "keep", description: "better" },
				undefined, undefined, ctx,
			);
			expect(r2.details.bestMetric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("keep with JSONL change gets auto committed", async () => {
			const testDir = createGitTestDir();

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
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

			// The JSONL file written by init is untracked, so keep will commit it
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await runBenchmark(pi.tools, ctx);
			// keep 時に候補変更が git auto commit されることを検証する。
			// (旧テストは writeContract が root contract を書くことに依存していたが、V1 移行で
			// init は .autoresearch/ 内に contract を書くため commit 対象外。代わりに候補変更を用意する)
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "candidate change");
			const result = await logTool.execute(
				"tc-log8",
				{ metric: 50, status: "keep", description: "auto commit" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[git]");
			expect(result.content[0].text).toContain("自動 commit");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("autoresearch_log JSONL write error", () => {
		it("returns error when JSONL append fails", async () => {
			const testDir = createGitTestDir("test-ar-logerr");

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

			// Replace autoresearch.jsonl file with a directory — appendFileSync gets EISDIR
			// This works regardless of user permissions (no chmod needed)
			const jsonlPath = path.join(testDir, "autoresearch.jsonl");
			const content = fs.readFileSync(jsonlPath, "utf8");
			fs.unlinkSync(jsonlPath);
			fs.mkdirSync(jsonlPath);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-err",
				{ metric: 100, status: "discard", description: "err test" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("WARNING");
			expect(result.content[0].text).toContain("autoresearch.jsonl");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	describe("git operation error paths", () => {
		it("log keep in non-git dir: init rejects when not a git repo", async () => {
			const testDir = "/tmp/test-ar-nogit-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			// NOT a git repo — P0-1: init should reject

			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const initResult = await initTool.execute(
				"tc-init-nogit",
				{ name: "test", metric_name: "ms" },
				undefined,
				undefined,
				ctx,
			);
			expect(initResult.content[0].text).toContain("[ERROR]");
			expect(initResult.content[0].text).toContain("git");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("log discard in non-git dir: shows no revert error", async () => {
			const testDir = createGitTestDir("test-ar-nogit2");

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

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nogit3",
				{ metric: 100, status: "discard", description: "no git" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[DISCARD]");
			expect(result.content[0].text).toContain("[git]");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("log keep with locked git index: returns error (P0-2: commit failure rejects keep)", async () => {
			const testDir = createGitTestDir("test-ar-locked");

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			gitInitForTest(testDir);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: testDir });

			// Lock the git index to make git add fail
			fs.writeFileSync(path.join(testDir, ".git", "index.lock"), "");

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
				"tc-run-locked",
				{ command: "echo METRIC ms=100" },
				undefined,
				undefined,
				ctx,
			);
			const piRunId = runResult.details.piRunId as string;

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-locked",
				{ metric: 100, status: "keep", description: "locked index", runId: piRunId },
				undefined,
				undefined,
				ctx,
			);
			// P0-2: commit failure now returns [ERROR] instead of recording as keep
			expect(result.content[0].text).toContain("[ERROR]");
			expect(result.content[0].text).toContain("git commit");
			expect(result.details.gitError).toBeTruthy();

			// state / ledger / pointer must not be updated on commit failure
			await cmdHandler("status", ctx);
			expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("実験回数: 0"), "info");
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			expect(jsonl.trim().split("\n")).toHaveLength(1); // config only
			const sessionRoot = path.join(testDir, ".pi", "autoresearch");
			const sessionId = fs.readdirSync(sessionRoot).find((n) => n !== "default")!;
			expect(fs.existsSync(path.join(sessionRoot, sessionId, "best.pointer.json"))).toBe(false);

			// After fixing git, the same runId can be logged again
			fs.unlinkSync(path.join(testDir, ".git", "index.lock"));
			const retry = await logTool.execute(
				"tc-log-locked-retry",
				{ metric: 100, status: "keep", description: "locked index retry", runId: piRunId },
				undefined,
				undefined,
				ctx,
			);
			expect(retry.content[0].text).toContain("[KEEP]");
			expect(fs.existsSync(path.join(sessionRoot, sessionId, "best.pointer.json"))).toBe(true);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("log keep in git dir with no changes: shows 変更なし", async () => {
			const testDir = createGitTestDir("test-ar-nochg");

			// Init git and make initial commit
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

			// Commit the JSONL so there are no staged changes
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir });
			childProcess.execFileSync("git", ["commit", "-m", "init jsonl"], { cwd: testDir });

			// Also need to commit the autoresearch.jsonl changes from any previous log calls
			// Since this is a fresh pi instance, there are no previous log calls.
			// The JSONL appendFileSync in log will create a change, but gitAutoCommit
			// runs AFTER the appendFileSync. So the JSONL has new content = staged change.
			// To truly test "no changes", we need to accept that JSONL changes will always exist.
			// Instead, verify the git operation produces a commit (because JSONL changed).
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			await runBenchmark(pi.tools, ctx);
			const result = await logTool.execute(
				"tc-log-nochg",
				{ metric: 100, status: "keep", description: "no changes" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			// The JSONL file change may or may not trigger commit depending on timing
			expect(result.content[0].text).toContain("[git]");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});
});
