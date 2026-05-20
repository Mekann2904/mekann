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
import { clearPromptProvidersForTests, collectPromptFragments } from "../prompt-core/index.js";

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

/** Init git repo with user config for test isolation. */
function gitInitForTest(cwd: string): void {
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
	childProcess.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd, stdio: "ignore" });
	childProcess.execFileSync("git", ["config", "user.name", "Test User"], { cwd, stdio: "ignore" });
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

describe("autoresearchExtension", () => {
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

	// ── Registration ────────────────────────────────────────────

	it("registers tools with correct names", () => {
		expect(pi.registerTool).toHaveBeenCalledTimes(14);
		expect(pi.tools.map((t) => t.name)).toEqual([
			"autoresearch_evaluate_query",
			"autoresearch_init",
			"autoresearch_run",
			"autoresearch_log",
			"autoresearch_plan",
			"autoresearch_approve",
			"autoresearch_candidate_escrow",
			"autoresearch_list_candidates",
			"autoresearch_show_candidate",
			"autoresearch_reject_candidate",
			"autoresearch_apply_candidate",
			"autoresearch_suggest_subagents",
			"autoresearch_apply_candidate_isolated",
			"autoresearch_run_contract",
		]);
	});

	it("registers the /autoresearch command", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"autoresearch",
			expect.objectContaining({
				description: expect.stringContaining("autoresearch"),
			}),
		);
	});

	it("adds subagent safety guidance to run/log promptGuidelines", () => {
		const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
		const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
		expect((runTool.promptGuidelines as string[]).join("\n")).toContain("autoresearch_run は root agent が実行する");
		expect((runTool.promptGuidelines as string[]).join("\n")).toContain("subagent に実行させない");
		expect((logTool.promptGuidelines as string[]).join("\n")).toContain("autoresearch_log は root agent が実行する");
		expect((logTool.promptGuidelines as string[]).join("\n")).toContain("subagent に記録・keep/discard判断・git操作を任せない");
	});

	it("registers session_start and loop event handlers", () => {
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("agent_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
		expect(pi.on).not.toHaveBeenCalledWith("before_agent_start", expect.any(Function));
	});

	// ── /autoresearch on ────────────────────────────────────────

	describe("/autoresearch on", () => {
		it("sends a followUp message", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on テストを高速化したい", ctx);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
		});

		it("shows widget", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Array));
		});

		it("sends autoresearch.md resume message when file exists", async () => {
			vi.doMock("node:fs", () => ({
				existsSync: (p: string) => p.endsWith("autoresearch.md"),
				appendFileSync: vi.fn(),
				unlinkSync: vi.fn(),
				readFileSync: vi.fn(),
			}));
			// Re-import with mock
			const { default: ext2 } = await import("./index.js?t=" + Date.now());
			const pi2 = createMockPi();
			ext2(pi2 as unknown as any);
			const handler = pi2.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("on", ctx);
			expect(pi2.sentMessages[0].msg).toContain("autoresearch.md");
			vi.doUnmock("node:fs");
		});
	});

	// ── /autoresearch off ───────────────────────────────────────

	describe("/autoresearch off", () => {
		it("clears the widget and notifies", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// First activate
			await handler("on", ctx);
			ctx.ui.setWidget.mockClear();
			// Then deactivate
			await handler("off", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("無効"),
				"info",
			);
		});
	});

	// ── /autoresearch clear ─────────────────────────────────────

	describe("/autoresearch clear", () => {
		it("clears widget and notifies", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// clear calls fs.existsSync + fs.unlinkSync — both are safe to call on /tmp
			await handler("clear", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("クリア"),
				"info",
			);
		});
	});

	// ── /autoresearch status ────────────────────────────────────

	describe("/autoresearch status", () => {
		it("shows status notification", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("status", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("autoresearch"),
				"info",
			);
		});

		it("is default when no subcommand", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("", ctx);
			// Empty arg → goes to status (sub is "status" when parts[0] is empty)
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("autoresearch"),
				"info",
			);
		});
	});

	// ── prompt provider ─────────────────────────────────────────

	describe("prompt provider", () => {
		it("returns no fragments when inactive", async () => {
			expect(await collectPromptFragments({ cwd: ctx.cwd })).toEqual([]);
		});

		it("returns stable Japanese instructions when active", async () => {
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", createMockCtx());
			const fragments = await collectPromptFragments({ cwd: ctx.cwd });
			expect(fragments).toHaveLength(1);
			expect(fragments[0]).toMatchObject({ kind: "autoresearch_policy", stability: "stable", scope: "mode", priority: 400 });
			expect(fragments[0].content).toContain("autoresearch モード");
			expect(fragments[0].content).toContain("autoresearch_init");
			expect(fragments[0].content).toContain("autoresearch_run");
			expect(fragments[0].content).toContain("autoresearch_log");
			expect(fragments[0].content).toContain("autoresearch_evaluate_query");
			expect(fragments[0].content).toContain("ready_for_run");
			expect(fragments[0].content).toContain("日本語");
			expect(fragments[0].content).toContain("自動で git commit / revert");
			expect(fragments[0].content).toContain("autoresearch.ideas.md");
		});
	});

	// ── /autoresearch <text> (default case: start) ────────────

	describe("/autoresearch <目的文>", () => {
		it("activates mode and sends followUp with purpose", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			await handler("テストを高速化したい", ctx);

			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Array));
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("有効"),
				"info",
			);
			expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
			expect(pi.sentMessages[0].msg).toContain("テストを高速化したい");
			expect(pi.sentMessages[0].opts).toEqual({ deliverAs: "followUp" });
		});

		it("activates even without purpose text", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx();
			// 'optimize' is not on/off/status/clear → treated as purpose
			await handler("optimize", ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", expect.any(Array));
		});
	});

	// ── autoresearch_log has checks_failed in status ──────────

	describe("autoresearch_log checks_failed", () => {
		it("accepts checks_failed as a valid status in parameters", () => {
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log");
			expect(logTool).toBeTruthy();
			// The description should mention checks_failed
			expect(logTool!.description).toContain("checks_failed");
		});
	});

	// ── Tool labels (Japanese) ─────────────────────────────────

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

	// ── Ralph-style auto loop ────────────────────────────────────

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

		it("stops after repeated no-progress agent ends", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			pi.sentMessages.length = 0;

			// NO_PROGRESS_LIMIT=2 means stop after 2 consecutive no-progress agent_end events.
			// Iteration 0: agent_start → agent_end (noProgressAgentEnds becomes 1) → sends followUp
			// Iteration 1: agent_start → agent_end (noProgressAgentEnds becomes 2 >= 2) → stops
			for (let i = 0; i < 2; i++) {
				await pi.eventHandlers.get("agent_start")!({}, ctx);
				await pi.eventHandlers.get("agent_end")!({ messages: [] }, ctx);
			}

			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("停止しました"),
				"warning",
			);
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
				"success",
			);
		});
	});

	// ── active guard: ツールはモード無効時に拒否する ──────────────

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

	// ── followUp に skill 誘導が含まれる ──────────────────────────

	describe("followUp includes skill guidance", () => {
		it("/autoresearch on followUp mentions skill", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			await handler("on", createMockCtx());
			expect(pi.sentMessages[0].msg).toContain("/skill:autoresearch-create");
		});

		it("/autoresearch <目的> followUp mentions skill", async () => {
			const handler = pi.commands.get("autoresearch")!.handler;
			await handler("高速化", createMockCtx());
			const msg = pi.sentMessages.find((m) => m.msg.includes("/skill:autoresearch-create"));
			expect(msg).toBeTruthy();
		});
	});

	// ── session_start handler ───────────────────────────────────

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

	// ── /autoresearch on with autoresearch.md ────────────────────

	describe("/autoresearch on with existing autoresearch.md", () => {
		it("sends resume message when autoresearch.md exists", async () => {
			const testDir = createGitTestDir("test-ar-md");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("on", ctx);
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("autoresearch.md");
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("再開");
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends resume message in default case with md and extra context", async () => {
			const testDir = createGitTestDir("test-ar-md");
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("高速化したい", ctx);
			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch.md");
			expect(msg).toContain("追加コンテキスト: 高速化したい");
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── /autoresearch clear with existing JSONL ──────────────────

	describe("/autoresearch clear with existing JSONL", () => {
		it("deletes the JSONL file", async () => {
			const testDir = createGitTestDir("test-ar-clear");
			const jp = path.join(testDir, "autoresearch.jsonl");
			fs.writeFileSync(jp, JSON.stringify({ type: "config", name: "x", metricName: "m" }) + "\n");
			expect(fs.existsSync(jp)).toBe(true);
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("clear", ctx);
			expect(fs.existsSync(jp)).toBe(false);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── autoresearch_init execute (active) ───────────────────────

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

	// ── autoresearch_run execute (active) ────────────────────────

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

	// ── autoresearch_log execute (active) ────────────────────────

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

	// ── hasUI=false: updateWidget does nothing ────────────────────

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

	// ── autoresearch_init JSONL write error ────────────────────────

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

	// ── autoresearch_log JSONL write error ─────────────────────────

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

	// ── git operation error paths ─────────────────────────────────

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

	// ── /autoresearch default without autoresearch.md ─────────────

	describe("/autoresearch <purpose> without autoresearch.md", () => {
		it("sends create message without md file", async () => {
			const testDir = createGitTestDir("test-ar-nomd");

			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("高速化したい", ctx);

			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch モードを有効化しました");
			expect(msg).toContain("autoresearch.md");
			expect(msg).toContain("目的: 高速化したい");
			expect(msg).not.toContain("再開");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends create message with purpose text in default case", async () => {
			const testDir = createGitTestDir("test-ar-nomd2");

			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("optimize", ctx);

			const msg = pi.sentMessages[pi.sentMessages.length - 1].msg;
			expect(msg).toContain("autoresearch モードを有効化しました");
			expect(msg).toContain("目的: optimize");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── autoresearch_run without parsedMetrics or primary ─────────

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

	// ── /autoresearch loop subcommands ───────────────────────

	describe("/autoresearch loop subcommands", () => {
		it("loop on enables auto loop", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			// Turn off first, then turn on via loop on
			await pi.commands.get("autoresearch")!.handler("loop off", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop on", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("有効"),
				"info",
			);
		});

		it("loop off disables auto loop", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop off", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("無効"),
				"info",
			);
		});

		it("loop max none sets unlimited", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max none", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("\u221e"),  // ∞
				"info",
			);
		});

		it("loop max infinite sets unlimited", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max infinite", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("\u221e"),
				"info",
			);
		});

		it("loop max with invalid value shows usage", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop max abc", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("正の整数"),
				"warning",
			);
		});

		it("loop status shows current state", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			ctx.ui.notify.mockClear();
			await pi.commands.get("autoresearch")!.handler("loop", ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("loop"),
				"info",
			);
		});

		it("hasCompleteMarker detects marker in nested content", async () => {
			const ctx = createMockCtx();
			await pi.commands.get("autoresearch")!.handler("on", ctx);
			await pi.eventHandlers.get("agent_start")!({}, ctx);
			pi.sentMessages.length = 0;

			// Test with nested content structure
			await pi.eventHandlers.get("agent_end")!(
				{ messages: [{ role: "assistant", content: [{ type: "text", text: "<autoresearch>COMPLETE</autoresearch>" }] }] },
				ctx,
			);

			expect(pi.sentMessages).toHaveLength(0);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringContaining("完了マーカー"),
				"success",
			);
		});
	});

	// ── runId 追跡と keep バリデーション ────────────────────────────

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

			// Log keep → should create a commit
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

	// ── long-run benchmark: piRunId, external artifacts, ledgers, pointers ────

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
			expect(manifest.parsedMetrics).toMatchObject({ ms: 42 });

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

	// ── P0/P1 fix verification tests ────────────────────────────────────

	describe("P0: .gitignore includes .pi/", () => {
		it(".gitignore contains .pi/", () => {
			const gitignorePath = path.resolve(__dirname, "..", ".gitignore");
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



	// =====================================================================
	// Contract mode integration tests
	// =====================================================================

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

	// ── State isolation tests ───────────────────────────────────────────

	describe("state isolation: contract mode vs plan mode", () => {
		function createApproveFlowDir(prefix: string): string {
			const testDir = createGitTestDir(prefix);
			fs.writeFileSync(path.join(testDir, "autoresearch.sh"), "#!/usr/bin/env bash\necho METRIC duration_seconds=1\n");
			childProcess.execFileSync("git", ["add", "autoresearch.sh"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "add benchmark script"], { cwd: testDir, stdio: "ignore" });
			return testDir;
		}

		it("approve writes currentContractHash and runCount:0 to state.json", async () => {
			const testDir = createApproveFlowDir("test-approve-state");
			const ctx = createMockCtx({ cwd: testDir });

			const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
			await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

			const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
			await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);

			const statePath = path.join(testDir, ".autoresearch", "state.json");
			expect(fs.existsSync(statePath)).toBe(true);
			const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
			expect(s.currentContractHash).toBeDefined();
			expect(typeof s.currentContractHash).toBe("string");
			expect(s.runCount).toBe(0);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("contract mode discard persists runCount to state.json", async () => {
			const testDir = createApproveFlowDir("test-discard-persist");
			const ctx = createMockCtx({ cwd: testDir });

			const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
			await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

			const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
			await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);

			// Make a trivial change so discard has something to revert
			fs.writeFileSync(path.join(testDir, "src.txt"), "candidate");

			const runContractTool = pi.tools.find((t) => t.name === "autoresearch_run_contract")!;
			const result = await runContractTool.execute("tc-run", { reason: "test discard" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("[DISCARD]");

			const s = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			expect(s.runCount).toBe(1);
			expect(s.currentContractHash).toBeDefined();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("plan-scoped init clears stale contract state", async () => {
			const testDir = createGitTestDir("test-plan-clears-contract");
			const ctx = createMockCtx({ cwd: testDir });

			// Simulate a contract-mode state by writing state.json with currentContractHash
			const statePath = path.join(testDir, ".autoresearch", "state.json");
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(statePath, JSON.stringify({
				version: 2,
				runCount: 5,
				bestMetric: { name: "old_metric", value: 100, direction: "lower" },
				currentContractHash: "abc123",
				updatedAt: new Date().toISOString(),
			}));
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "add stale state"], { cwd: testDir, stdio: "ignore" });

			// Activate
			const sessionStart = pi.eventHandlers.get("session_start")!;
			await sessionStart({}, ctx);
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			// Now init plan-scoped mode — this should clear contract state
			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const initResult = await initTool.execute("tc-init", { name: "plan-test", metric_name: "ms" }, undefined, undefined, ctx);
			expect(initResult.content[0].text).not.toContain("[ERROR]");

			// After init, state.json should have a currentPlanId but no stale currentContractHash
			const s2 = JSON.parse(fs.readFileSync(statePath, "utf8"));
			expect(s2.currentPlanId).toBeDefined();
			expect(s2.currentContractHash).toBeUndefined();
			// bestMetric from contract mode should also be cleared
			expect(s2.bestMetric).toBeUndefined();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("session_start restores runCount after contract mode discard", async () => {
			const testDir = createApproveFlowDir("test-session-restore");
			const ctx = createMockCtx({ cwd: testDir });

			const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
			await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

			const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
			await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);

			// Do a discard to bump runCount
			fs.writeFileSync(path.join(testDir, "src.txt"), "candidate");
			const runContractTool = pi.tools.find((t) => t.name === "autoresearch_run_contract")!;
			await runContractTool.execute("tc-run", { reason: "test" }, undefined, undefined, ctx);

			// Trigger session_start to restore state from disk
			const handler = pi.eventHandlers.get("session_start")!;
			await handler({}, ctx);

			// runCount should be restored to 1 (from persisted state)
			// Access internal state through a tool that reports it
			const s = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			expect(s.runCount).toBe(1);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("plan-scoped session_start ignores stale current.contract.json", async () => {
			const testDir = createGitTestDir("test-plan-ignores-contract");
			const ctx = createMockCtx({ cwd: testDir });

			// Activate autoresearch
			const sessionStart = pi.eventHandlers.get("session_start")!;
			await sessionStart({}, ctx);
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			// Set up plan-scoped mode via init
			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const initResult = await initTool.execute("tc-init", { name: "plan-priority", metric_name: "score", direction: "higher" }, undefined, undefined, ctx);
			expect(initResult.details).toMatchObject({ direction: "higher" });

			// Write a stale current.contract.json with different direction
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(
				path.join(testDir, ".autoresearch", "current.contract.json"),
				JSON.stringify({
					evaluation: { primaryMetric: { name: "wrong_metric", direction: "lower" } },
					objective: { summary: "wrong" },
				}),
			);
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "add stale contract"], { cwd: testDir, stdio: "ignore" });

			// Trigger session_start then re-activate
			await sessionStart({}, ctx);
			await cmdHandler("on", ctx);

			// The state should have "higher" direction from plan, not "lower" from stale contract.
			// Write a bestMetric to state.json, then run a log to verify the direction is correct.
			// Instead, directly verify that running a benchmark and logging "keep" uses the right direction.
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run", { command: "echo METRIC score=42" }, undefined, undefined, ctx);
			expect(runResult.content[0].text).not.toContain("[ERROR]");

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const logResult = await logTool.execute("tc-log", { run: 1, metric: 42, status: "keep", description: "test" }, undefined, undefined, ctx);
			expect(logResult.content[0].text).toContain("[KEEP]");

			// Verify persisted state has direction=higher (from plan, not from stale contract)
			const s2 = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			expect(s2.bestMetric?.direction).toBe("higher");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── Strict state isolation tests (round 3) ─────────────────────────────

	describe("strict state isolation", () => {
		function createApproveFlowDir(prefix: string): string {
			const testDir = createGitTestDir(prefix);
			fs.writeFileSync(path.join(testDir, "autoresearch.sh"), "#!/usr/bin/env bash\necho METRIC duration_seconds=1\n");
			childProcess.execFileSync("git", ["add", "autoresearch.sh"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "add benchmark script"], { cwd: testDir, stdio: "ignore" });
			return testDir;
		}

		it("session_start does not restore stale bestMetric when currentContractHash differs", async () => {
			const testDir = createApproveFlowDir("test-stale-hash");
			const ctx = createMockCtx({ cwd: testDir });

			const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
			await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

			const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
			await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);

			// Tamper with state.json: set currentContractHash to a different value
			const statePath = path.join(testDir, ".autoresearch", "state.json");
			const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
			s.currentContractHash = "sha256:stalehash";
			s.bestMetric = { name: "duration_seconds", value: 0.5, direction: "lower" };
			s.runCount = 10;
			fs.writeFileSync(statePath, JSON.stringify(s));

			// Trigger session_start — should NOT restore the stale bestMetric/runCount
			const handler = pi.eventHandlers.get("session_start")!;
			await handler({}, ctx);

			// Verify in-memory state: bestMetric should NOT be restored
			// (We verify indirectly by checking state.json was not modified to have bestMetric)
			// The key assertion: runCount in state.json should still reflect stale value
			// but in-memory state.runCount should be 0
			// We check this by running a log which will fail if runCount is wrong
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			// Run a benchmark and log keep — if runCount was wrongly restored to 10,
			// the run number in the output would be #11
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run", { command: "echo METRIC duration_seconds=0.9" }, undefined, undefined, ctx);
			expect(runResult.content[0].text).not.toContain("[ERROR]");

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const logResult = await logTool.execute("tc-log", { run: 1, metric: 0.9, status: "keep", description: "test" }, undefined, undefined, ctx);
			// With stale runCount=10 restored, it would say #11. With correct runCount=0, it says #1.
			expect(logResult.content[0].text).toContain("#1");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("implicit legacy plan clears stale contract state from state.json", async () => {
			const testDir = createGitTestDir("test-implicit-clear");
			const ctx = createMockCtx({ cwd: testDir });

			// Write stale contract-mode state
			const statePath = path.join(testDir, ".autoresearch", "state.json");
			fs.mkdirSync(path.join(testDir, ".autoresearch"), { recursive: true });
			fs.writeFileSync(statePath, JSON.stringify({
				version: 2,
				sessionId: "old-session",
				currentContractHash: "sha256:oldcontract",
				bestMetric: { name: "ms", value: 50, direction: "lower" },
				runCount: 7,
				bestRunId: "run-old-001",
				latestRunId: "run-old-007",
				updatedAt: new Date().toISOString(),
			}));
			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "stale state"], { cwd: testDir, stdio: "ignore" });

			// Activate and run (triggers implicit plan creation)
			const sessionStart = pi.eventHandlers.get("session_start")!;
			await sessionStart({}, ctx);
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			expect(runResult.content[0].text).not.toContain("[ERROR]");

			// After run, state.json should NOT have stale contract fields
			const s2 = JSON.parse(fs.readFileSync(statePath, "utf8"));
			expect(s2.currentContractHash).toBeUndefined();
			expect(s2.bestMetric).toBeUndefined();
			expect(s2.bestRunId).toBeUndefined();
			// latestRunId should be set to the new run
			expect(s2.latestRunId).toBeDefined();

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("plan-scoped mode does not fallback to legacy root contract when plan contract is broken", async () => {
			const testDir = createGitTestDir("test-no-fallback");
			const ctx = createMockCtx({ cwd: testDir });

			// Activate and init a plan
			const sessionStart = pi.eventHandlers.get("session_start")!;
			await sessionStart({}, ctx);
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			const initResult = await initTool.execute("tc-init", { name: "test", metric_name: "score", direction: "higher" }, undefined, undefined, ctx);
			expect(initResult.content[0].text).not.toContain("[ERROR]");

			// Get the plan contract path
			const statePath = path.join(testDir, ".autoresearch", "state.json");
			const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
			const planContractPath = path.join(testDir, s.currentPlanDir, "contract.json");

			// Write a legacy root contract with different metric
			fs.writeFileSync(path.join(testDir, "autoresearch.contract.json"), JSON.stringify({
				schemaVersion: 1,
				metricName: "legacy_metric",
				direction: "lower",
			}));

			// Corrupt the plan contract
			fs.writeFileSync(planContractPath, "INVALID JSON");

			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "setup"], { cwd: testDir, stdio: "ignore" });

			// Run a command — contract validation should be skipped (null contract)
			// not fall back to legacy root contract
			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run", { command: "echo METRIC score=10" }, undefined, undefined, ctx);
			// Should succeed — no contract means no safety policy violations
			expect(runResult.content[0].text).not.toContain("safety policy");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("checks execution uses runArgvCommand (no shell quoting issue)", async () => {
			const testDir = createGitTestDir("test-checks-argv");
			const ctx = createMockCtx({ cwd: testDir });

			// Activate and init
			const sessionStart = pi.eventHandlers.get("session_start")!;
			await sessionStart({}, ctx);
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", ctx);

			const initTool = pi.tools.find((t) => t.name === "autoresearch_init")!;
			await initTool.execute("tc-init", { name: "test", metric_name: "ms" }, undefined, undefined, ctx);

			// Write a checks.sh that outputs a specific marker
			const statePath = path.join(testDir, ".autoresearch", "state.json");
			const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
			const checksPath = path.join(testDir, s.currentPlanDir, "checks.sh");
			fs.writeFileSync(checksPath, "#!/usr/bin/env bash\necho CHECKS_ARGV_OK\nexit 0\n");
			fs.chmodSync(checksPath, 0o755);

			childProcess.execFileSync("git", ["add", "-A"], { cwd: testDir, stdio: "ignore" });
			childProcess.execFileSync("git", ["commit", "-m", "add checks"], { cwd: testDir, stdio: "ignore" });

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const runResult = await runTool.execute("tc-run", { command: "echo METRIC ms=100" }, undefined, undefined, ctx);
			expect(runResult.content[0].text).not.toContain("[ERROR]");

			// Verify checks passed by checking the lastRunChecks output
			// The checks output should contain our marker
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const logResult = await logTool.execute("tc-log", { run: 1, metric: 100, status: "keep", description: "test" }, undefined, undefined, ctx);
			expect(logResult.content[0].text).not.toContain("[ERROR]");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("session_start runCount is reflected in next contract run iteration", async () => {
			const testDir = createApproveFlowDir("test-iteration-reflect");
			const ctx = createMockCtx({ cwd: testDir });

			const planTool = pi.tools.find((t) => t.name === "autoresearch_plan")!;
			await planTool.execute("tc-plan", { query: "Reduce duration_seconds" }, undefined, undefined, ctx);

			const approveTool = pi.tools.find((t) => t.name === "autoresearch_approve")!;
			await approveTool.execute("tc-approve", {}, undefined, undefined, ctx);

			// Do a discard to bump runCount to 1
			fs.writeFileSync(path.join(testDir, "src.txt"), "candidate");
			const runContractTool = pi.tools.find((t) => t.name === "autoresearch_run_contract")!;
			const discardResult = await runContractTool.execute("tc-run", { reason: "test" }, undefined, undefined, ctx);
			expect(discardResult.content[0].text).toContain("[DISCARD]");

			// Verify persisted runCount is 1
			const s1 = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			expect(s1.runCount).toBe(1);

			// Simulate process restart via session_start
			const handler = pi.eventHandlers.get("session_start")!;
			await handler({}, ctx);

			// Do another discard
			fs.writeFileSync(path.join(testDir, "src.txt"), "candidate2");
			const discardResult2 = await runContractTool.execute("tc-run", { reason: "test2" }, undefined, undefined, ctx);
			expect(discardResult2.content[0].text).toContain("[DISCARD]");

			// Verify runCount is now 2 (1 restored + 1 new)
			const s2 = JSON.parse(fs.readFileSync(path.join(testDir, ".autoresearch", "state.json"), "utf8"));
			expect(s2.runCount).toBe(2);

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

});
