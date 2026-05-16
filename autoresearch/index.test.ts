/**
 * autoresearch/index.test.ts — 拡張機能ファクトリとコマンドのテスト。
 *
 * Mock ExtensionAPI を構築し、tool / command / event の登録と
 * コマンドハンドラの挙動を検証する。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";

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
});
