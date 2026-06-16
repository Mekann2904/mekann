/**
 * autoresearch/index.test.ts — 拡張機能ファクトリとコマンドのテスト。
 *
 * Mock ExtensionAPI を構築し、tool / command / event の登録と
 * コマンドハンドラの挙動を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import { clearPromptProvidersForTests } from "../../core/prompt-core/index.js";

// Mock peer dependencies before importing the extension
vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-ai", () => ({
	StringEnum: (values: string[]) => values,
}));
vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: (props: unknown) => props,
		String: (opts?: unknown) => opts ?? {},
		Number: (opts?: unknown) => opts ?? {},
		Boolean: (opts?: unknown) => opts ?? {},
		Optional: (schema: unknown) => schema,
		Array: (schema: unknown) => schema,
		Literal: (value: unknown) => value,
		Union: (schemas: unknown) => schemas,
		Record: (key: unknown, value: unknown) => value,
	},
}));
vi.mock("@sinclair/typebox/value", () => ({
	Value: {
		Errors: () => [],
		Check: () => true,
	},
}));

// ─── Mock infrastructure ─────────────────────────────────────────

interface MockUi {
	notify: ReturnType<typeof vi.fn>;
	setWidget: ReturnType<typeof vi.fn>;
}

interface MockCtx {
	cwd: string;
	hasUI: boolean;
	ui: MockUi;
}

/** Init git repo. Test identity comes from env vars (vitest.setup.ts, issue #39). */
function gitInitForTest(cwd: string): void {
	// Test git identity is injected via env vars in vitest.setup.ts (issue #39).
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
}

function createMockPi() {
	const tools: Array<{ name: string; [k: string]: unknown }> = [];
	const commands: Map<string, { handler: Function; description?: string }> = new Map();
	const eventHandlers: Map<string, Function> = new Map();
	const sentMessages: Array<{ msg: string; opts: unknown }> = [];

	return {
		tools,
		commands,
		eventHandlers,
		sentMessages,
		registerTool: vi.fn((def: { name: string; [k: string]: unknown }) => {
			tools.push(def);
		}),
		registerCommand: vi.fn((name: string, config: { handler: Function; description?: string }) => {
			commands.set(name, config);
		}),
		on: vi.fn((event: string, handler: Function) => {
			eventHandlers.set(event, handler);
		}),
		sendUserMessage: vi.fn((msg: string, opts: unknown) => {
			sentMessages.push({ msg, opts });
		}),
		appendEntry: vi.fn(),
		events: { emit: vi.fn(), on: vi.fn() },
	};
}

// ─── Shared test directory (initialized per test suite) ─────────────
let _sharedTestDir = "/tmp/test-autoresearch";

/** Create a temp dir with git repo + initial commit (for tests needing init). */
function createGitTestDir(prefix = "test-ar"): string {
	const testDir = `/tmp/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	fs.mkdirSync(testDir, { recursive: true });
	gitInitForTest(testDir);
	fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
	childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
	childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });
	return testDir;
}

function createMockCtx(overrides?: Partial<MockCtx>): MockCtx {
	return {
		cwd: _sharedTestDir,
		hasUI: true,
		ui: {
			notify: vi.fn(),
			setWidget: vi.fn(),
		},
		...overrides,
	};
}

// ─── Helper: run a benchmark before logging (for keep validation) ────

async function runBenchmark(
	tools: Array<{ name: string; [k: string]: unknown }>,
	ctx: MockCtx,
	command: string = "echo METRIC ms=100",
): Promise<void> {
	const runTool = tools.find((t) => t.name === "autoresearch_run")!;
	await runTool.execute(
		"tc-run-pre",
		{ command },
		undefined,
		undefined,
		ctx,
	);
}

/** Helper: activate autoresearch + init session. Call after pi is created. */
async function activateAndInit(
	pi: ReturnType<typeof createMockPi>,
	ctx: MockCtx,
	opts?: { metric_name?: string; direction?: string },
): Promise<{ result: any }> {
	// 1. Trigger session_start to reset state
	const sessionStart = pi.eventHandlers.get("session_start")!;
	await sessionStart({}, ctx);

	// 2. Activate via /autoresearch on
	const cmdHandler = pi.commands.get("autoresearch")!.handler;
	await cmdHandler("on", ctx);

	// 3. Init
	const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
	return initTool.execute(
		"tc-init",
		{
			name: "test-session",
			metric_name: opts?.metric_name ?? "ms",
			direction: opts?.direction ?? "lower",
		},
		undefined,
		undefined,
		ctx,
	);
}

// ─── Tests ───────────────────────────────────────────────────────

// Import after mocks are set up
import autoresearchExtension from "./index.js";

describe("autoresearch contract and state isolation", () => {
	let pi: ReturnType<typeof createMockPi>;

	let ctx: MockCtx;

	beforeEach(() => {
		clearPromptProvidersForTests();
		// Create a unique temp dir for each test and initialize as a clean git repo
		const testDir = `/tmp/autoresearch-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		fs.mkdirSync(testDir, { recursive: true });
		gitInitForTest(testDir);
		// Make an initial commit so HEAD exists and working tree is clean
		fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
		childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });

		_sharedTestDir = testDir;
		ctx = createMockCtx();

		pi = createMockPi();
		autoresearchExtension(pi as unknown as any);
	});

describe("contract mode: autoresearch_plan", () => {
	it("generates plan with direct script argv (no bash -c)", async () => {
		const testDir = createGitTestDir("test-plan-argv");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		const result = await planTool.execute(
			"tc-plan", { query: "Reduce build time of this TypeScript project" },
			undefined, undefined, ctx,
		);
		expect(result.content[0].text).toContain("[OK]");

		// Read plan file and verify no bash -c in contract block
		const planContent = fs.readFileSync(path.join(testDir, "autoresearch.plan.md"), "utf8");
		const contractMatch = planContent.match(/```autoresearch-contract jsonc\n([\s\S]*?)```/);
		expect(contractMatch).not.toBeNull();
		const contractJson = JSON.parse(contractMatch![1]);
		expect(contractJson.evaluation.benchmark.command.argv).not.toContain("-c");
		// Should use direct script invocation
		expect(contractJson.evaluation.benchmark.command.argv[0]).toBe("bash");
		expect(contractJson.evaluation.benchmark.command.argv[1]).toBe("./autoresearch.sh");

		// Verify default scope fixes benchmark harness files
		expect(contractJson.scope.allowedWritePaths.length).toBeGreaterThan(0);
		expect(contractJson.scope.forbiddenWritePaths).toContain("autoresearch.sh");
		expect(contractJson.scope.forbiddenWritePaths).toContain("checks.sh");
		expect(contractJson.scope.immutableReadPaths).toContain("autoresearch.sh");
		expect(contractJson.scope.immutableReadPaths).toContain("checks.sh");
		expect(result.content[0].text).toContain("benchmark: bash ./autoresearch.sh");
		expect(result.content[0].text).toContain("Suggested by query evaluation");

		fs.rmSync(testDir, { recursive: true, force: true });
	});
});

describe("contract mode: approve clean worktree filtering", () => {
	function createApproveFlowDir(prefix: string): string {
		const testDir = createGitTestDir(prefix);
		fs.writeFileSync(path.join(testDir, "autoresearch.sh"), "#!/usr/bin/env bash\necho METRIC duration_seconds=1\n");
		childProcess.execFileSync("git", ["add", "autoresearch.sh"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add benchmark script"], { cwd: testDir, stdio: "ignore" });
		return testDir;
	}

	it("approves immediately after autoresearch_plan even when plan file is uncommitted", async () => {
		const testDir = createApproveFlowDir("test-approve-plan-dirty");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[OK]");
		expect(fs.existsSync(path.join(testDir, ".autoresearch", "current.lock.json"))).toBe(true);

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("rejects approve when src/** has uncommitted changes", async () => {
		const testDir = createApproveFlowDir("test-approve-src-dirty");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);
		fs.mkdirSync(path.join(testDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(testDir, "src", "candidate.ts"), "export const x = 1;\n");

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("contract-relevant");
		expect(result.content[0].text).toContain("src/");

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("allows approve when only .autoresearch/** is dirty", async () => {
		const testDir = createApproveFlowDir("test-approve-ar-dirty");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);
		childProcess.execFileSync("git", ["add", "autoresearch.plan.md"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });
		fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
		fs.writeFileSync(path.join(testDir, ".autoresearch", "scratch.json"), "{}\n");

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[OK]");

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("allows approve when only autoresearch.plan.md is modified", async () => {
		const testDir = createApproveFlowDir("test-approve-plan-modified");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);
		childProcess.execFileSync("git", ["add", "autoresearch.plan.md"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });
		fs.appendFileSync(path.join(testDir, "autoresearch.plan.md"), "\n<!-- discussion note -->\n");

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[OK]");

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("rejects approve when baseline benchmark mutates immutableReadPaths", async () => {
		const testDir = createApproveFlowDir("test-approve-immutable-drift");
		const ctx = createMockCtx({ cwd: testDir });
		fs.writeFileSync(path.join(testDir, "package.json"), "{\"name\":\"test\"}\n");
		fs.writeFileSync(path.join(testDir, "autoresearch.sh"), "#!/usr/bin/env bash\necho '{\"name\":\"mutated\"}' > package.json\necho METRIC duration_seconds=1\n");
		childProcess.execFileSync("git", ["add", "package.json", "autoresearch.sh"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "mutating benchmark"], { cwd: testDir, stdio: "ignore" });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("mutated immutableReadPaths");

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("rejects approve when baseline benchmark creates contract-relevant dirty files", async () => {
		const testDir = createApproveFlowDir("test-approve-baseline-dirty");
		const ctx = createMockCtx({ cwd: testDir });
		fs.writeFileSync(path.join(testDir, "autoresearch.sh"), "#!/usr/bin/env bash\nmkdir -p src\necho 'export const generated = true;' > src/generated.ts\necho METRIC duration_seconds=1\n");
		childProcess.execFileSync("git", ["add", "autoresearch.sh"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "dirty benchmark"], { cwd: testDir, stdio: "ignore" });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("contract-relevant dirty files");
		expect(result.content[0].text).toContain("src/");

		fs.rmSync(testDir, { recursive: true, force: true });
	});
});

describe("contract mode: approve rejects bad baseline", () => {
	it("rejects approve when benchmark exits non-zero", async () => {
		const testDir = createGitTestDir("test-approve-fail");
		const ctx = createMockCtx({ cwd: testDir });

		// Generate plan first
		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "test" }, undefined, undefined, ctx);

		// Commit plan + .autoresearch so tree is clean
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });

		// Edit the plan to use a command that will fail
		const planPath_ = path.join(testDir, "autoresearch.plan.md");
		let planContent = fs.readFileSync(planPath_, "utf8");
		// JSON.stringify formats arrays across multiple lines
		planContent = planContent.replace(
			/bash"\s*,\s*"\.\/autoresearch\.sh"/,
			'bash",\n          "-c",\n          "exit 1"',
		);
		fs.writeFileSync(planPath_, planContent, "utf8");

		// Commit the edited plan so tree is clean for approve
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "edit plan"], { cwd: testDir, stdio: "ignore" });

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("fail");

		// Lock file should NOT exist
		expect(fs.existsSync(path.join(testDir, ".autoresearch", "current.lock.json"))).toBe(false);

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("rejects approve when metric missing and no wall_clock fallback", async () => {
		const testDir = createGitTestDir("test-approve-nometric");
		const ctx = createMockCtx({ cwd: testDir });

		// Generate plan first
		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "test" }, undefined, undefined, ctx);

		// Commit plan + .autoresearch so tree is clean
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });

		// Edit the plan: command succeeds but outputs no METRIC, and source has no fallback
		const planPath_ = path.join(testDir, "autoresearch.plan.md");
		let planContent = fs.readFileSync(planPath_, "utf8");
		// Replace command to just echo hello (no METRIC line)
		// JSON.stringify formats arrays across multiple lines
		planContent = planContent.replace(
			/bash"\s*,\s*"\.\/autoresearch\.sh"/,
			'echo",\n          "hello"',
		);
		// Remove fallback: "wall_clock" → none
		planContent = planContent.replace(
			/"fallback": "wall_clock"/,
			'"fallback": "none"',
		);
		fs.writeFileSync(planPath_, planContent, "utf8");

		// Commit the edited plan so tree is clean for approve
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "edit plan"], { cwd: testDir, stdio: "ignore" });

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("not found");

		fs.rmSync(testDir, { recursive: true, force: true });
	});

	it("accepts approve when metric missing but wall_clock fallback", async () => {
		const testDir = createGitTestDir("test-approve-wc");
		const ctx = createMockCtx({ cwd: testDir });

		// Generate plan first
		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "test" }, undefined, undefined, ctx);

		// Commit plan + .autoresearch so tree is clean
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });

		// Edit the plan: command succeeds but outputs no METRIC, but fallback=wall_clock
		const planPath_ = path.join(testDir, "autoresearch.plan.md");
		let planContent = fs.readFileSync(planPath_, "utf8");
		// JSON.stringify formats arrays across multiple lines
		planContent = planContent.replace(
			/bash"\s*,\s*"\.\/autoresearch\.sh"/,
			'echo",\n          "hello"',
		);
		// Keep fallback: "wall_clock" as-is
		fs.writeFileSync(planPath_, planContent, "utf8");

		// Commit the edited plan so tree is clean for approve
		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "edit plan"], { cwd: testDir, stdio: "ignore" });

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[OK]");
		expect(fs.existsSync(path.join(testDir, ".autoresearch", "current.lock.json"))).toBe(true);

		fs.rmSync(testDir, { recursive: true, force: true });
	});
});

describe("contract mode: .autoresearch excluded from git ops", () => {
	it("commit does not stage .autoresearch/**", async () => {
		const testDir = createGitTestDir("test-git-exclude");
		try {
			// Create .autoresearch dir with files
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(path.join(testDir, ".autoresearch", "test.json"), "{}");
			// Also create a real change
			fs.writeFileSync(path.join(testDir, "src.txt"), "changed");

			const { gitAutoCommit } = await import("./runner.js");
			const result = gitAutoCommit(testDir, "test commit");
			expect(result.committed).toBe(true);

			// Verify .autoresearch/test.json is NOT in the commit
			const showOutput = childProcess.execFileSync(
				"git", ["show", "--name-only", "--pretty=format:", "HEAD"],
				{ cwd: testDir, encoding: "utf8" },
			).trim();
			expect(showOutput).not.toContain(".autoresearch");
			expect(showOutput).toContain("src.txt");
		} finally {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("revert preserves .autoresearch/current.lock.json", async () => {
		const testDir = createGitTestDir("test-revert-preserve");
		try {
			// Create .autoresearch dir with lock file
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(
				path.join(testDir, ".autoresearch", "current.lock.json"),
				JSON.stringify({ test: true }),
			);
			// Create a change that revert should undo
			fs.writeFileSync(path.join(testDir, "src.txt"), "dirty");

			const { gitAutoRevert } = await import("./runner.js");
			const result = gitAutoRevert(testDir);
			expect(result.reverted).toBe(true);

			// .autoresearch/current.lock.json should still exist
			expect(fs.existsSync(path.join(testDir, ".autoresearch", "current.lock.json"))).toBe(true);
			// src.txt should be reverted (clean)
			expect(fs.existsSync(path.join(testDir, "src.txt"))).toBe(false);
		} finally {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});
});

describe("contract mode: command safety validation", () => {
	it("rejects approve with bash -c in benchmark", async () => {
		const testDir = createGitTestDir("test-cmd-safety");
		const ctx = createMockCtx({ cwd: testDir });

		const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
		await planTool.execute("tc-plan", { query: "test" }, undefined, undefined, ctx);

		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "add plan"], { cwd: testDir, stdio: "ignore" });

		// Edit plan to use bash -c
		const planPath_ = path.join(testDir, "autoresearch.plan.md");
		let planContent = fs.readFileSync(planPath_, "utf8");
		planContent = planContent.replace(
			/bash"\s*,\s*"\.\/autoresearch\.sh"/,
			'bash",\n          "-c",\n          "echo hello"',
		);
		fs.writeFileSync(planPath_, planContent, "utf8");

		childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "edit plan"], { cwd: testDir, stdio: "ignore" });

		const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
		const result = await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);
		expect(result.content[0].text).toContain("[ERROR]");
		expect(result.content[0].text).toContain("bash -c");

		fs.rmSync(testDir, { recursive: true, force: true });
	});
});

describe("contract mode: env allow list", () => {
	it("env allow list actually restricts env vars", async () => {
		const { runArgvCommand } = await import("./runner.js");
		// Run with allow list containing only PATH
		const result = await runArgvCommand(
			{
				argv: ["env"],
				cwd: ".",
				env: {
					allow: ["PATH", "HOME"],
				},
			},
			5000,
		);
		expect(result.passed).toBe(true);
		expect(result.stdout).toContain("PATH=");
		expect(result.stdout).toContain("HOME=");
		// Most other env vars should be missing
		expect(result.stdout).not.toContain("SHELL=");
	});
});
});
