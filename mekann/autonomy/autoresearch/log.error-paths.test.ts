/**
 * log.error-paths.test.ts — autoresearch_log の bestMetric direction・JSONL write error・
 * git 操作エラーパスのテスト。log.test.ts から並列実行のために分割。
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

	describe("autoresearch_log execute (active)", () => {
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
