/**
 * index-test-utils.ts — autoresearch/index.test.ts 由来の共有 test helpers。
 *
 * 拡張機能ファクトリのテストに必要な Mock ExtensionAPI 構築、
 * git リポジトリのセットアップ、共通 fixture 操作を提供する。
 * 各 focused test suite はこれらを import して利用する。
 */

import { vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import { clearPromptProvidersForTests } from "../../core/prompt-core/index.js";

// Mock peer dependencies before importing the extension.
// vi.mock hoists to the top of this module so the import below resolves mocks.
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

// Import after mocks are set up
import autoresearchExtension from "./index.js";

// ─── Mock infrastructure ─────────────────────────────────────────

export interface MockUi {
	notify: ReturnType<typeof vi.fn>;
	setWidget: ReturnType<typeof vi.fn>;
}

export interface MockCtx {
	cwd: string;
	hasUI: boolean;
	ui: MockUi;
}

/** Init git repo. Test identity comes from env vars (vitest.setup.ts, issue #39). */
export function gitInitForTest(cwd: string): void {
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
}

export function createMockPi() {
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
// Kept as a module-level value so createMockCtx() picks up the directory
// prepared by autoresearchTestSetup() even when tests build a fresh ctx.
let _sharedTestDir = "/tmp/test-autoresearch";

/** Create a temp dir with git repo + initial commit (for tests needing init). */
export function createGitTestDir(prefix = "test-ar"): string {
	const testDir = `/tmp/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	fs.mkdirSync(testDir, { recursive: true });
	gitInitForTest(testDir);
	fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
	childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
	childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });
	return testDir;
}

export function createMockCtx(overrides?: Partial<MockCtx>): MockCtx {
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

export async function runBenchmark(
	tools: Array<{ name: string; [k: string]: unknown }>,
	ctx: MockCtx,
	command: string = "echo METRIC ms=100",
): Promise<void> {
	const runTool = tools.find((t) => t.name === "autoresearch_run") as
		{ name: string; execute: (...args: any[]) => Promise<any> };
	await runTool.execute(
		"tc-run-pre",
		{ command },
		undefined,
		undefined,
		ctx,
	);
}

/**
 * Per-test setup: reset prompt providers, spin up a clean git repo as the
 * shared working directory, then build a fresh mock pi + ctx and register
 * the autoresearch extension against that pi. Returns the objects tests
 * bind into their own `let` bindings.
 *
 * Pass `{ initGit: false }` when EVERY test in the suite creates its own git
 * repo via {@link createGitTestDir} and passes an explicit `cwd` to the tools.
 * Skipping the ~47ms `git init + commit` here avoids wasted work on the
 * critical path (the shared dir is created but never used as a git repo).
 * Default is `true` for backward compatibility.
 */
export function autoresearchTestSetup(
	opts?: { initGit?: boolean },
): { pi: ReturnType<typeof createMockPi>; ctx: MockCtx } {
	clearPromptProvidersForTests();
	const initGit = opts?.initGit ?? true;
	// Create a unique temp dir for each test and initialize as a clean git repo
	const testDir = `/tmp/autoresearch-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	fs.mkdirSync(testDir, { recursive: true });
	if (initGit) {
		gitInitForTest(testDir);
		// Make an initial commit so HEAD exists and working tree is clean
		fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
		childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
		childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });
	}

	_sharedTestDir = testDir;
	const ctx = createMockCtx();
	const pi = createMockPi();
	autoresearchExtension(pi as unknown as any);
	return { pi, ctx };
}
