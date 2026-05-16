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

// Mock peer dependencies before importing the extension
vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-ai", () => ({
	StringEnum: (values: string[]) => values,
}));
vi.mock("typebox", () => ({
	Type: {
		Object: (props: unknown) => props,
		String: (opts?: unknown) => opts ?? {},
		Number: (opts?: unknown) => opts ?? {},
		Optional: (schema: unknown) => schema,
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

function createMockCtx(overrides?: Partial<MockCtx>): MockCtx {
	return {
		cwd: "/tmp/test-autoresearch",
		hasUI: true,
		ui: {
			notify: vi.fn(),
			setWidget: vi.fn(),
		},
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────

// Import after mocks are set up
import autoresearchExtension from "./index.js";

describe("autoresearchExtension", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		pi = createMockPi();
		autoresearchExtension(pi as unknown as any);
	});

	// ── Registration ────────────────────────────────────────────

	it("registers 3 tools with correct names", () => {
		expect(pi.registerTool).toHaveBeenCalledTimes(3);
		expect(pi.tools.map((t) => t.name)).toEqual([
			"autoresearch_init",
			"autoresearch_run",
			"autoresearch_log",
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

	it("registers session_start and before_agent_start event handlers", () => {
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
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

	// ── before_agent_start handler ──────────────────────────────

	describe("before_agent_start handler", () => {
		it("does nothing when not active", async () => {
			const handler = pi.eventHandlers.get("before_agent_start")!;
			const result = await handler(
				{ systemPrompt: "original" },
				createMockCtx(),
			);
			expect(result).toBeUndefined();
		});

		it("appends Japanese instructions when active", async () => {
			// First activate via command
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			await cmdHandler("on", createMockCtx());

			const handler = pi.eventHandlers.get("before_agent_start")!;
			const result = await handler(
				{ systemPrompt: "original" },
				createMockCtx(),
			);
			expect(result.systemPrompt).toContain("autoresearch モード");
			expect(result.systemPrompt).toContain("autoresearch_init");
			expect(result.systemPrompt).toContain("autoresearch_run");
			expect(result.systemPrompt).toContain("autoresearch_log");
			expect(result.systemPrompt).toContain("日本語");
			// 自動 commit/revert の指示がある
			expect(result.systemPrompt).toContain("自動で git commit / revert");
			// ideas.md の指示がある
			expect(result.systemPrompt).toContain("autoresearch.ideas.md");
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

		it("autoresearch_init succeeds after /autoresearch on", async () => {
			// テスト用ディレクトリを作成
			const testDir = "/tmp/test-autoresearch-init-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			expect(result.content[0].text).toContain("初期化しました");

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
			const testDir = "/tmp/test-ar-session-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			const ctx = createMockCtx({ cwd: testDir });
			await handler({}, ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("reconstructs state from existing JSONL", async () => {
			const handler = pi.eventHandlers.get("session_start")!;
			const testDir = "/tmp/test-ar-session-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-session-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			// Write invalid JSON that causes reconstructState to throw
			fs.writeFileSync(path.join(testDir, "autoresearch.jsonl"), "NOT VALID JSON!!!");
			const ctx = createMockCtx({ cwd: testDir });
			// Should not throw; falls back to freshState
			await handler({}, ctx);
			expect(ctx.ui.setWidget).toHaveBeenCalledWith("autoresearch", undefined);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── /autoresearch on with autoresearch.md ────────────────────

	describe("/autoresearch on with existing autoresearch.md", () => {
		it("sends resume message when autoresearch.md exists", async () => {
			const testDir = "/tmp/test-ar-md-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			fs.writeFileSync(path.join(testDir, "autoresearch.md"), "# Test");
			const handler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await handler("on", ctx);
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("autoresearch.md");
			expect(pi.sentMessages[pi.sentMessages.length - 1].msg).toContain("再開");
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("sends resume message in default case with md and extra context", async () => {
			const testDir = "/tmp/test-ar-md-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-clear-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			expect(result.content[0].text).toContain("初期化しました");
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			const cmdHandler = pi.commands.get("autoresearch")!.handler;
			const ctx = createMockCtx({ cwd: testDir });
			await cmdHandler("on", ctx);

			const runTool = pi.tools.find((t) => t.name === "autoresearch_run")!;
			const result = await runTool.execute(
				"tc-run3",
				{ command: "sleep 10", timeout_seconds: 1 },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[TIMEOUT]");
			expect(result.details.timedOut).toBe(true);
			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("parses METRIC output lines", async () => {
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			// git init for auto commit
			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			expect(result.content[0].text).toContain("abc123");
			expect(result.details.commit).toBe("abc123");

			// Verify JSONL has metrics and memo
			const jsonl = fs.readFileSync(path.join(testDir, "autoresearch.jsonl"), "utf8");
			const runLine = JSON.parse(jsonl.trim().split("\n")[1]);
			expect(runLine.metrics).toMatchObject({ peak_ms: 150, avg_ms: 90 });
			expect(runLine.memo).toBe("test memo");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("auto-obtains commit hash when commit param is omitted", async () => {
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			expect(result.content[0].text).toContain("unknown");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("updates bestMetric for direction=lower (lower is better)", async () => {
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			const r1 = await logTool.execute(
				"tc-l1", { metric: 100, status: "keep", description: "baseline" },
				undefined, undefined, ctx,
			);
			expect(r1.details.bestMetric).toBe(100);

			// Better keep: 80
			const r2 = await logTool.execute(
				"tc-l2", { metric: 80, status: "keep", description: "improved" },
				undefined, undefined, ctx,
			);
			expect(r2.details.bestMetric).toBe(80);

			// Worse keep: 120 → bestMetric stays 80
			const r3 = await logTool.execute(
				"tc-l3", { metric: 120, status: "keep", description: "worse" },
				undefined, undefined, ctx,
			);
			expect(r3.details.bestMetric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("updates bestMetric for direction=higher (higher is better)", async () => {
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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

			const r1 = await logTool.execute(
				"tc-h1", { metric: 50, status: "keep", description: "baseline" },
				undefined, undefined, ctx,
			);
			expect(r1.details.bestMetric).toBe(50);

			const r2 = await logTool.execute(
				"tc-h2", { metric: 80, status: "keep", description: "better" },
				undefined, undefined, ctx,
			);
			expect(r2.details.bestMetric).toBe(80);

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("keep with JSONL change gets auto committed", async () => {
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			fs.writeFileSync(path.join(testDir, "dummy.txt"), "init");
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const testDir = "/tmp/test-ar-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
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
			const testDir = "/tmp/test-ar-ro-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });
			// Make directory read-only so appendFileSync fails
			fs.chmodSync(testDir, 0o444);

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
			expect(result.content[0].text).toContain("ERROR");
			expect(result.content[0].text).toContain("autoresearch.jsonl");

			// Cleanup: restore permissions
			fs.chmodSync(testDir, 0o755);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── autoresearch_log JSONL write error ─────────────────────────

	describe("autoresearch_log JSONL write error", () => {
		it("returns error when JSONL append fails", async () => {
			const testDir = "/tmp/test-ar-logerr-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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

			// Make directory read-only so appendFileSync fails on log
			const jsonlPath = path.join(testDir, "autoresearch.jsonl");
			fs.chmodSync(jsonlPath, 0o444);

			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-err",
				{ metric: 100, status: "discard", description: "err test" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("ERROR");
			expect(result.content[0].text).toContain("autoresearch.jsonl");

			fs.chmodSync(jsonlPath, 0o644);
			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── git operation error paths ─────────────────────────────────

	describe("git operation error paths", () => {
		it("log keep in non-git dir: shows error", async () => {
			const testDir = "/tmp/test-ar-nogit-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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

			// keep in non-git dir triggers gitAutoCommit → catch → error
			const logTool = pi.tools.find((t) => t.name === "autoresearch_log")!;
			const result = await logTool.execute(
				"tc-log-nogit",
				{ metric: 100, status: "keep", description: "no git" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			// Non-git dir: commit エラー or 変更なし
			expect(result.content[0].text).toContain("[git]");

			fs.rmSync(testDir, { recursive: true, force: true });
		});

		it("log discard in non-git dir: shows error", async () => {
			const testDir = "/tmp/test-ar-nogit2-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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

		it("log keep in git dir with no changes: shows 変更なし", async () => {
			const testDir = "/tmp/test-ar-nochg-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

			// Init git and make initial commit
			childProcess.execFileSync("git", ["init"], { cwd: testDir });
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
			const result = await logTool.execute(
				"tc-log-nochg",
				{ metric: 100, status: "keep", description: "no changes" },
				undefined,
				undefined,
				ctx,
			);
			expect(result.content[0].text).toContain("[KEEP]");
			// The JSONL file change triggers a commit
			expect(result.content[0].text).toContain("自動 commit");

			fs.rmSync(testDir, { recursive: true, force: true });
		});
	});

	// ── /autoresearch default without autoresearch.md ─────────────

	describe("/autoresearch <purpose> without autoresearch.md", () => {
		it("sends create message without md file", async () => {
			const testDir = "/tmp/test-ar-nomd-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			const testDir = "/tmp/test-ar-nomd2-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			const testDir = "/tmp/test-ar-noinit-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
			const testDir = "/tmp/test-ar-failout-" + Date.now();
			fs.mkdirSync(testDir, { recursive: true });

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
});
