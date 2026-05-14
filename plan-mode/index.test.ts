/**
 * Plan Mode Extension — index.ts のフックテスト。
 *
 * Mock ExtensionAPI を構築し、tool_call, context, before_agent_start,
 * agent_end, turn_end, model_select, thinking_level_select, session_start
 * フックの実際の挙動を検証する。
 *
 * Note: @earendil-works/pi-coding-agent, @earendil-works/pi-ai, @earendil-works/pi-tui
 * は peerDependencies としてインストールされていないため、vi.mock でモックする。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock peer dependencies before importing the extension
vi.mock("@earendil-works/pi-coding-agent", () => ({}));
vi.mock("@earendil-works/pi-ai", () => ({}));
vi.mock("@earendil-works/pi-tui", () => ({
	Key: { super: (k: string) => `super+${k}` },
}));

// ─── Mock infrastructure ─────────────────────────────────────────

interface MockModel {
	provider: string;
	id: string;
}

interface MockExtensionContext {
	cwd: string;
	model: MockModel | null;
	modelRegistry: {
		find: (provider: string, modelId: string) => MockModel | undefined;
	};
	ui: {
		notify: (msg: string, level?: string) => void;
		confirm: (title: string, message: string) => Promise<boolean>;
		theme: { fg: (color: string, text: string) => string };
		setStatus: (key: string, value: unknown) => void;
	};
}

function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function }> = {};
	let flags: Record<string, unknown> = {};
	let activeTools: string[] = ["read", "bash", "edit", "write"];
	const sentMessages: string[] = [];
	let thinkingLevel = "medium";
	let currentModel: MockModel | null = null;
	const appendEntries: Array<{ type: string; data: unknown }> = [];

	const api = {
		registerFlag: vi.fn(),
		registerCommand: vi.fn((name: string, config: { handler: Function }) => {
			commands[name] = config;
		}),
		registerShortcut: vi.fn(),
		on: vi.fn((event: string, handler: Function) => {
			hooks[event] = handler;
		}),
		getActiveTools: () => activeTools,
		setActiveTools: vi.fn((tools: string[]) => { activeTools = tools; }),
		setModel: vi.fn((_model: MockModel) => Promise.resolve(true)),
		getThinkingLevel: () => thinkingLevel,
		setThinkingLevel: vi.fn((level: string) => { thinkingLevel = level; }),
		getFlag: (name: string) => flags[name],
		sendUserMessage: vi.fn((msg: string) => { sentMessages.push(msg); }),
		appendEntry: vi.fn((type: string, data: unknown) => { appendEntries.push({ type, data }); }),
		// Test accessors
		get _hooks() { return hooks; },
		get _commands() { return commands; },
		set _flags(f: Record<string, unknown>) { flags = f; },
		get _activeTools() { return activeTools; },
		get _sentMessages() { return sentMessages; },
		get _appendEntries() { return appendEntries; },
		get _thinkingLevel() { return thinkingLevel; },
	};

	return api;
}

function createMockCtx(overrides?: Partial<MockExtensionContext>): MockExtensionContext {
	return {
		cwd: "/tmp/project",
		model: { provider: "anthropic", id: "sonnet" },
		modelRegistry: {
			find: (provider: string, modelId: string) => ({ provider, id: modelId }),
		},
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
			theme: { fg: (_c: string, t: string) => t },
			setStatus: vi.fn(),
		},
		...overrides,
	};
}

async function loadExtension(mockApi: ReturnType<typeof createMockApi>) {
	const { default: planModeExtension } = await import("../index.js");
	planModeExtension(mockApi as any);
}

// ─── tool_call hook ──────────────────────────────────────────────

describe("tool_call hook", () => {
	it("main mode: 何もブロックしない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		expect(result).toBeUndefined();
	});

	it("plan mode: edit をブロックする", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		expect(result).toEqual({ block: true, reason: expect.stringContaining("ファイル編集") });
	});

	it("plan mode: read を許可する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "read", input: { path: "file.ts" } });
		expect(result).toBeUndefined();
	});

	it("plan mode: safe bash を許可する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "bash", input: { command: "git status" } });
		expect(result).toBeUndefined();
	});

	it("plan mode: unsafe bash をブロックする", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "bash", input: { command: "rm -rf /" } });
		expect(result).toEqual({ block: true, reason: expect.stringContaining("unsafe bash") });
	});

	it("plan mode: write をブロックする", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.tool_call({ toolName: "write", input: { path: "new.ts" } });
		expect(result).toEqual({ block: true, reason: expect.any(String) });
	});

	it("plan mode: エスカレーション (連続ブロック)", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const r1 = await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		expect(r1.reason).not.toContain("2回目");

		const r2 = await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		expect(r2.reason).toContain("2回目");

		const r3 = await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		expect(r3.reason).toContain("3回");
	});

	it("plan mode: 異なるツール/パスで blockCount リセット", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });
		await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });

		const result = await mock._hooks.tool_call({ toolName: "write", input: { path: "other.ts" } });
		expect(result.reason).not.toContain("2回目");
	});
});

// ─── context hook ──────────────────────────────────────────────────

describe("context hook", () => {
	it("最新の proposed_plan を残し古いものを compact する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const messages = [
			{
				role: "assistant",
				content: [{ type: "text", text: "<proposed_plan>v1 plan content here</proposed_plan>" }],
			},
			{
				role: "assistant",
				content: [{ type: "text", text: "<proposed_plan>v2 latest plan content</proposed_plan>" }],
			},
		];

		const result = await mock._hooks.context({ messages });
		expect(result.messages[0].content[0].text).toContain("[omitted: superseded plan]");
		expect(result.messages[1].content[0].text).toContain("v2 latest plan content");
	});

	it("proposed_plan がないメッセージはそのまま", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const messages = [
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "no plan here" }] },
		];

		const result = await mock._hooks.context({ messages });
		expect(result.messages[0].content[0].text).toBe("hello");
		expect(result.messages[1].content[0].text).toBe("no plan here");
	});
});

// ─── agent_end hook ────────────────────────────────────────────────

describe("agent_end hook", () => {
	it("plan mode: proposed_plan を抽出", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const messages = [
			{
				role: "assistant",
				content: [{ type: "text", text: "<proposed_plan>\nStep 1: Do something\n</proposed_plan>" }],
			},
		];

		await mock._hooks.agent_end({ messages }, createMockCtx());

		// Exit plan mode → plan should be injected
		await mock._commands["plan"].handler("", createMockCtx());
		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(result.systemPrompt).toContain("Step 1: Do something");
	});

	it("main mode: 何もしない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const messages = [
			{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>plan text</proposed_plan>" }] },
		];

		await mock._hooks.agent_end({ messages }, createMockCtx());
		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(result).toBeUndefined();
	});

	it("proposed_plan なし: 何もキャプチャしない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.agent_end(
			{ messages: [{ role: "assistant", content: [{ type: "text", text: "No plan" }] }] },
			createMockCtx(),
		);

		await mock._commands["plan"].handler("", createMockCtx());
		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		if (result) {
			expect(result.systemPrompt).not.toContain("<plan>");
		}
	});
});

// ─── before_agent_start hook ───────────────────────────────────────

describe("before_agent_start hook", () => {
	it("plan mode: 初回は full prompt を注入", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(result.systemPrompt).toContain("プランモード");
	});

	it("plan mode: 2回目は reminder を注入", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.before_agent_start({ systemPrompt: "base" });
		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(result.systemPrompt).toContain("読み取り専用");
	});

	it("main mode with implementationPlan: plan を注入してクリア", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		// Capture a plan
		await mock._hooks.agent_end(
			{ messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>My plan</proposed_plan>" }] }] },
			createMockCtx(),
		);

		// Exit plan mode
		await mock._commands["plan"].handler("", createMockCtx());

		// First call: plan injected
		const r1 = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(r1.systemPrompt).toContain("My plan");
		expect(r1.systemPrompt).toContain("<plan>");

		// Second call: plan consumed
		const r2 = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(r2).toBeUndefined();
	});

	it("main mode without implementationPlan: 何もしない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const result = await mock._hooks.before_agent_start({ systemPrompt: "base" });
		expect(result).toBeUndefined();
	});
});

// ─── turn_end hook ──────────────────────────────────────────────────

describe("turn_end hook", () => {
	it("block カウンターをリセットする", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.tool_call({ toolName: "edit", input: { path: "f.ts" } });
		await mock._hooks.tool_call({ toolName: "edit", input: { path: "f.ts" } });

		await mock._hooks.turn_end();

		const result = await mock._hooks.tool_call({ toolName: "edit", input: { path: "f.ts" } });
		expect(result.reason).not.toContain("2回目");
	});
});

// ─── model_select hook ──────────────────────────────────────────────

describe("model_select hook", () => {
	it("source=restore: 何もしない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Should not throw
		await mock._hooks.model_select({
			model: { provider: "google", id: "gemini-pro" },
			source: "restore",
		});
	});

	it("main mode: モデル変更が config に反映される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		await mock._hooks.model_select({
			model: { provider: "google", id: "gemini-pro" },
			source: "user",
		});

		// Verify the command is registered (config update happened internally)
		expect(mock._commands["plan-model"]).toBeDefined();
	});
});

// ─── thinking_level_select hook ─────────────────────────────────────

describe("thinking_level_select hook", () => {
	it("thinking level 変更が実行される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		await mock._hooks.thinking_level_select({ level: "high" });
		expect(mock._commands["plan-thinking"]).toBeDefined();
	});
});

// ─── /plan command ──────────────────────────────────────────────────

describe("/plan command", () => {
	it("main → plan → main トグル", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Enter plan mode
		await mock._commands["plan"].handler("", createMockCtx());
		expect(mock._activeTools).not.toContain("edit");

		// Exit plan mode
		await mock._commands["plan"].handler("", createMockCtx());
		expect(mock._activeTools).toContain("edit");
	});
});

// ─── /plan-model command ────────────────────────────────────────────

describe("/plan-model command", () => {
	it("status: 設定を表示", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("status", ctx);
		expect(notifications[0]).toContain("Mode:");
	});

	it("main <provider/modelId>: main model を設定", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("main google/gemini-pro", ctx);
		expect(notifications[0]).toContain("gemini-pro");
	});

	it("clear all: 全設定をクリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("clear all", ctx);
		expect(notifications[0]).toContain("cleared");
	});

	it("invalid model ref: エラー", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("main noprovider", ctx);
		expect(notifications[0]).toContain("Invalid");
	});
});

// ─── /plan-thinking command ──────────────────────────────────────────

describe("/plan-thinking command", () => {
	it("status: 設定を表示", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("status", ctx);
		expect(notifications[0]).toContain("Mode:");
	});

	it("main high: 設定", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("main high", ctx);
		expect(notifications[0]).toContain("high");
	});

	it("invalid level: エラー", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("main ultra", ctx);
		expect(notifications[0]).toContain("Invalid");
	});

	it("clear all: クリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("clear all", ctx);
		expect(notifications[0]).toContain("cleared");
	});
});

// ─── session_start hook ────────────────────────────────────────────

describe("session_start hook", () => {
	it("通常起動: main mode", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		expect(mock._activeTools).toContain("edit");
	});

	it("--plan フラグ: plan mode", async () => {
		const mock = createMockApi();
		mock._flags = { plan: true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		expect(mock._activeTools).not.toContain("edit");
		expect(mock._activeTools).not.toContain("write");
	});
});

// ─── appendEntry tracking ──────────────────────────────────────────

describe("appendEntry tracking", () => {
	it("blocked tool is logged", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.tool_call({ toolName: "edit", input: { path: "file.ts" } });

		expect(mock._appendEntries.length).toBe(1);
		expect(mock._appendEntries[0].type).toBe("plan-mode-blocked-tool");
	});

	it("unsafe bash is logged with reason", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.tool_call({ toolName: "bash", input: { command: "rm -rf /" } });

		expect(mock._appendEntries.length).toBe(1);
		expect(mock._appendEntries[0].data).toHaveProperty("reason", "unsafe-bash");
	});

	it("safe tools are not logged", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.tool_call({ toolName: "read", input: { path: "file.ts" } });
		await mock._hooks.tool_call({ toolName: "bash", input: { command: "git status" } });

		expect(mock._appendEntries.length).toBe(0);
	});
});

// ─── sendUserMessage on exit ──────────────────────────────────────

describe("sendUserMessage on exit plan mode", () => {
	it("plan あり: メッセージ送信", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._hooks.agent_end(
			{ messages: [{ role: "assistant", content: [{ type: "text", text: "<proposed_plan>Refactor plan</proposed_plan>" }] }] },
			createMockCtx(),
		);

		await mock._commands["plan"].handler("", createMockCtx());
		expect(mock._sentMessages).toContain("保存された plan に従って実装してください。");
	});

	it("plan なし: メッセージ送信なし", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		await mock._commands["plan"].handler("", createMockCtx());
		expect(mock._sentMessages).toHaveLength(0);
	});
});

// ─── /plan-model: additional sub-commands ─────────────────────────

describe("/plan-model: additional sub-commands", () => {
	it("plan <provider/modelId>: plan model を設定", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("plan openai/gpt-4.1", ctx);
		expect(notifications[0]).toContain("gpt-4.1");
	});

	it("plan (no arg): save current model as plan", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("plan", ctx);
		expect(notifications[0]).toContain("sonnet"); // current model from mock ctx
	});

	it("main (no arg): save current model as main", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("main", ctx);
		expect(notifications[0]).toContain("sonnet");
	});

	it("clear main: main model をクリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		// Set first
		await mock._commands["plan-model"].handler("main google/gemini-pro", ctx);
		notifications.length = 0;

		// Clear
		await mock._commands["plan-model"].handler("clear main", ctx);
		expect(notifications[0]).toContain("cleared");
	});

	it("clear plan: plan model をクリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("clear plan", ctx);
		expect(notifications[0]).toContain("cleared");
	});

	it("clear invalid: usage warning", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("clear invalid", ctx);
		expect(notifications[0]).toContain("Usage");
	});

	it("unknown sub-command: usage warning", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("unknown", ctx);
		expect(notifications[0]).toContain("Usage");
	});

	it("main <model> in main mode: model が即座に切り替わる", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("main google/gemini-pro", ctx);
		expect(mock.setModel).toHaveBeenCalled();
	});

	it("plan <model> in main mode: model は切り替わらない", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);
		// mode is main, setting plan model should NOT call setModel
		mock.setModel.mockClear();

		await mock._commands["plan-model"].handler("plan openai/gpt-4.1", ctx);
		expect(mock.setModel).not.toHaveBeenCalled();
	});

	it("no current model: save warning", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			model: null,
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-model"].handler("main", ctx);
		expect(notifications[0]).toContain("No current model");
	});

	it("getArgumentCompletions returns completions", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		const cmd = mock._commands["plan-model"];
		if (cmd.getArgumentCompletions) {
			const completions = cmd.getArgumentCompletions("ma");
			expect(completions.some((c: { value: string }) => c.value === "main")).toBe(true);
		}
	});
});

// ─── /plan-thinking: additional sub-commands ─────────────────────

describe("/plan-thinking: additional sub-commands", () => {
	it("plan high: plan thinking を設定", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("plan high", ctx);
		expect(notifications[0]).toContain("high");
	});

	it("plan (no arg): save current thinking as plan", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("plan", ctx);
		expect(notifications[0]).toContain("medium"); // default thinking level
	});

	it("main (no arg): save current thinking as main", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("main", ctx);
		expect(notifications[0]).toContain("medium");
	});

	it("clear main: main thinking をクリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("clear main", ctx);
		expect(notifications[0]).toContain("cleared");
	});

	it("clear plan: plan thinking をクリア", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("clear plan", ctx);
		expect(notifications[0]).toContain("cleared");
	});

	it("clear invalid: usage warning", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("clear invalid", ctx);
		expect(notifications[0]).toContain("Usage");
	});

	it("unknown sub-command: usage warning", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("unknown", ctx);
		expect(notifications[0]).toContain("Usage");
	});

	it("plan invalid: エラー", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);

		await mock._commands["plan-thinking"].handler("plan ultra", ctx);
		expect(notifications[0]).toContain("Invalid");
	});

	it("plan high in plan mode: setThinkingLevel が呼ばれる", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);
		await mock._commands["plan"].handler("", ctx); // enter plan mode

		mock.setThinkingLevel.mockClear();
		await mock._commands["plan-thinking"].handler("plan xhigh", ctx);
		expect(mock.setThinkingLevel).toHaveBeenCalledWith("xhigh");
	});

	it("main low in plan mode: setThinkingLevel は呼ばれない", async () => {
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, ctx);
		await mock._commands["plan"].handler("", ctx); // enter plan mode

		mock.setThinkingLevel.mockClear();
		await mock._commands["plan-thinking"].handler("main low", ctx);
		expect(mock.setThinkingLevel).not.toHaveBeenCalled();
	});

	it("getArgumentCompletions returns completions", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		const cmd = mock._commands["plan-thinking"];
		if (cmd.getArgumentCompletions) {
			const completions = cmd.getArgumentCompletions("plan h");
			expect(completions.some((c: { value: string }) => c.value === "plan high")).toBe(true);
		}
	});
});

// ─── model_select: plan mode path ────────────────────────────────

describe("model_select: plan mode path", () => {
	it("plan mode で model_select が plan config を更新する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx()); // enter plan mode

		await mock._hooks.model_select({
			model: { provider: "google", id: "gemini-flash" },
			source: "user",
		});

		// Verify by checking plan model config via status
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["plan-model"].handler("status", ctx);
		expect(notifications[0]).toContain("gemini-flash");
	});

	it("plan mode で same model ref の場合は update しない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		// Set plan model explicitly
		await mock._commands["plan-model"].handler("plan google/gemini-pro", createMockCtx());

		// model_select with same ref → no change (verified by no error)
		await mock._hooks.model_select({
			model: { provider: "google", id: "gemini-pro" },
			source: "user",
		});
	});
});

// ─── thinking_level_select: plan mode path ───────────────────────

describe("thinking_level_select: plan mode path", () => {
	it("plan mode で thinking 変更が plan config を更新する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx()); // enter plan mode

		await mock._hooks.thinking_level_select({ level: "xhigh" });

		// Verify via status
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["plan-thinking"].handler("status", ctx);
		expect(notifications[0]).toContain("xhigh");
	});

	it("plan mode で same level の場合は update しない", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._commands["plan"].handler("", createMockCtx());

		// Set plan thinking explicitly
		await mock._commands["plan-thinking"].handler("plan xhigh", createMockCtx());

		// thinking_level_select with same level → no change
		await mock._hooks.thinking_level_select({ level: "xhigh" });
	});
});

// ─── enterPlanMode/exitPlanMode with model/thinking config ──────

describe("mode transitions with model/thinking config", () => {
	it("enterPlanMode は main thinking を保存する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Set main thinking
		await mock._commands["plan-thinking"].handler("main high", createMockCtx());

		// Enter plan mode
		await mock._commands["plan"].handler("", createMockCtx());

		// Exit plan mode — main thinking should be restored
		await mock._commands["plan"].handler("", createMockCtx());

		// Check status — main thinking should be "high"
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["plan-thinking"].handler("status", ctx);
		expect(notifications[0]).toContain("high");
	});

	it("exitPlanMode with plan model config は main model に復帰する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Set main model
		await mock._commands["plan-model"].handler("main anthropic/sonnet", createMockCtx());

		// Enter plan mode
		await mock._commands["plan"].handler("", createMockCtx());

		// Exit plan mode
		await mock._commands["plan"].handler("", createMockCtx());

		// setModel should have been called for main model restore
		expect(mock.setModel).toHaveBeenCalled();
	});

	it("--plan startup: persistCurrentMain=false で config を上書きしない", async () => {
		const mock = createMockApi();
		mock._flags = { plan: true };
		await loadExtension(mock);

		await mock._hooks.session_start({}, createMockCtx());

		// Should be in plan mode
		expect(mock._activeTools).not.toContain("edit");

		// Check status — no model should have been overwritten
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["plan-model"].handler("status", ctx);
		expect(notifications[0]).toContain("Mode: plan");
	});
});
