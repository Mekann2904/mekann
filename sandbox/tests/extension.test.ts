/**
 * Sandbox Extension — index.ts のフックテスト。
 *
 * Mock ExtensionAPI を構築し、session_start, session_shutdown,
 * user_bash, /sandbox コマンドの挙動を検証する。
 *
 * テスト可能なロジック:
 *   - フラグ解析 (--no-sandbox, --sandbox-mode)
 *   - セッション開始時のモード初期化
 *   - ワークスペースルート検証
 *   - yolo 承認フロー
 *   - user_bash ブロック/許可
 *   - /sandbox status 表示
 *   - /sandbox コマンド
 *   - session_shutdown リセット
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock peer dependencies
vi.mock("@earendil-works/pi-coding-agent", () => ({
	createBashTool: (_cwd: string) => ({
		execute: vi.fn(() => ({
			content: [{ type: "text", text: "mock output" }],
		})),
	}),
}));

// Mock macSeatbelt — isMacSandboxAvailable returns false by default (unit tests)
vi.mock("../macSeatbelt.js", () => ({
	isMacSandboxAvailable: vi.fn(() => Promise.resolve(false)),
	runSandboxedShellMac: vi.fn(() => Promise.resolve({
		code: 0,
		signal: null,
		stdout: "mock stdout",
		stderr: "",
	})),
	buildMacSeatbeltPolicy: vi.fn(() => "(version 1)\n(deny default)\n"),
	escapeSbplString: vi.fn((s: string) => s),
	pathLiteral: vi.fn((p: string) => `(literal "${p}")`),
	pathSubpath: vi.fn((p: string) => `(subpath "${p}")`),
	buildSandboxEnv: vi.fn(() => ({
		PATH: "/usr/bin:/bin",
		HOME: "/tmp/mock-home",
	})),
	validatePolicy: vi.fn(() => Promise.resolve()),
	resolveGitdirPaths: vi.fn(() => Promise.resolve([])),
}));

// Mock pathPolicy
vi.mock("../pathPolicy.js", () => ({
	resolveRealPaths: vi.fn((paths: string[]) => Promise.resolve(paths)),
	validateWorkspaceRoot: vi.fn(() => Promise.resolve()),
	resolveSafeRealPath: vi.fn((p: string) => Promise.resolve(p)),
	assertPathInsideRoot: vi.fn(() => Promise.resolve()),
	isProtectedPath: vi.fn(() => false),
	checkUnsafeRoot: vi.fn(() => Promise.resolve(null)),
}));

// ─── Mock infrastructure ─────────────────────────────────────────

interface MockCtx {
	cwd: string;
	model: null;
	modelRegistry: { find: () => undefined };
	ui: {
		notify: ReturnType<typeof vi.fn>;
		confirm: ReturnType<typeof vi.fn>;
		theme: { fg: (c: string, t: string) => string };
		setWidget: ReturnType<typeof vi.fn>;
	};
}

function createMockCtx(overrides?: Partial<MockCtx>): MockCtx {
	return {
		cwd: "/tmp/sandbox-test-project",
		model: null,
		modelRegistry: { find: () => undefined },
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(() => Promise.resolve(true)),
			theme: { fg: (_c: string, t: string) => t },
			setWidget: vi.fn(),
		},
		...overrides,
	};
}

function createMockApi() {
	const hooks: Record<string, Function> = {};
	const commands: Record<string, { handler: Function; getArgumentCompletions?: Function }> = {};
	let flags: Record<string, unknown> = {};
	const registeredTools: Array<Record<string, unknown>> = [];
	const registeredFlags: Array<{ name: string; config: unknown }> = [];
	const eventHandlers: Record<string, Function> = {};

	const api = {
		registerFlag: vi.fn((name: string, config: unknown) => {
			registeredFlags.push({ name, config });
		}),
		registerTool: vi.fn((tool: Record<string, unknown>) => {
			registeredTools.push(tool);
		}),
		registerCommand: vi.fn((name: string, config: { handler: Function; getArgumentCompletions?: Function }) => {
			commands[name] = config;
		}),
		on: vi.fn((event: string, handler: Function) => {
			hooks[event] = handler;
		}),
		getFlag: (name: string) => flags[name],
		setActiveTools: vi.fn(),
		sendUserMessage: vi.fn(),
		appendEntry: vi.fn(),
		events: {
			on: vi.fn((name: string, handler: Function) => {
				eventHandlers[name] = handler;
			}),
			emit: vi.fn((name: string, data: unknown) => {
				eventHandlers[name]?.(data);
			}),
		},
		// Test accessors
		get _hooks() { return hooks; },
		get _commands() { return commands; },
		set _flags(f: Record<string, unknown>) { flags = f; },
		get _registeredTools() { return registeredTools; },
		get _registeredFlags() { return registeredFlags; },
		get _eventHandlers() { return eventHandlers; },
	};

	return api;
}

async function loadExtension(mockApi: ReturnType<typeof createMockApi>) {
	const { default: sandboxExtension } = await import("../index.js");
	sandboxExtension(mockApi as any);
}

// ─── Flag registration ───────────────────────────────────────────

describe("flag registration", () => {
	it("--no-sandbox フラグを登録する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		expect(mock._registeredFlags.some(f => f.name === "no-sandbox")).toBe(true);
	});

	it("--sandbox-mode フラグを登録する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		expect(mock._registeredFlags.some(f => f.name === "sandbox-mode")).toBe(true);
	});
});

// ─── session_start hook ──────────────────────────────────────────

describe("session_start hook", () => {
	it("--no-sandbox: sandbox を無効化する", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("明示的に無効化"),
			"warning",
		);
	});

	it("正常起動: sandbox が有効になる (macOS以外なので REFUSED)", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		// Non-macOS → sandbox unavailable → commands refused
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("sandbox-exec"),
			"error",
		);
	});

	it("--sandbox-mode read_only: read_only モードで開始", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		// Should acknowledge mode even though sandbox is unavailable
		expect(ctx.ui.notify).toHaveBeenCalled();
	});

	it("--sandbox-mode invalid: 警告して workspace_write にフォールバック", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "invalid_mode" };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("無効な --sandbox-mode"),
			"warning",
		);
	});

	it("yolo: 承認プロンプトが表示される (approve)", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.confirm).toHaveBeenCalledWith(
			expect.stringContaining("フルアクセス"),
			expect.any(String),
		);
	});

	it("yolo: 承認拒否で workspace_write にフォールバック", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		});

		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("フォールバック"),
			"warning",
		);
	});

	it("unsafe workspace root (/): sandbox を無効化する", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx({ cwd: "/" });

		// Mock validateWorkspaceRoot to throw for /
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		(validateWorkspaceRoot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("workspace root cannot be /"),
		);

		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("安全でない workspace root"),
			"error",
		);
	});
});

// ─── session_shutdown hook ───────────────────────────────────────

describe("session_shutdown hook", () => {
	it("状態をリセットする", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		const ctx = createMockCtx();

		// Start session first
		mock._flags = {};
		await mock._hooks.session_start({}, ctx);

		// Shutdown
		await mock._hooks.session_shutdown();

		// After shutdown, state is reset. /sandbox shows the current effective mode.
		const notifications: string[] = [];
		const statusCtx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", statusCtx);
		// After shutdown, effectiveMode() returns currentMode (workspace_write by default)
		expect(notifications[0]).toBe("workspace_write");
	});
});

// ─── user_bash hook ──────────────────────────────────────────────

describe("user_bash hook", () => {
	it("--no-sandbox 時: undefined を返す (許可)", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const result = mock._hooks.user_bash();
		expect(result).toBeUndefined();
	});

	it("sandbox 有効時: エラーを投げる (ブロック)", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// sandbox-exec unavailable → startupBlockedReason set → user_bash throws startup block
		expect(() => mock._hooks.user_bash()).toThrow("sandbox-exec");
	});

	it("yolo 承認済み: undefined を返す (許可)", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// yolo approved at session_start (confirm returns true)
		const result = mock._hooks.user_bash();
		expect(result).toBeUndefined();
	});

	it("yolo 未承認: エラーを投げる", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		});
		await mock._hooks.session_start({}, ctx);

		// yolo was rejected → fallback to workspace_write
		// sandbox-exec unavailable → startupBlockedReason set → user_bash throws startup block
		expect(() => mock._hooks.user_bash()).toThrow("sandbox-exec");
	});
});

// ─── /sandbox command ───────────────────────────────────────────

describe("/sandbox command", () => {
	it("ステータスを表示する", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);

		// When explicitly disabled, effectiveMode() returns currentMode (workspace_write)
		expect(notifications[0]).toBe("workspace_write");
	});

	it("sandbox 有効時のステータス", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toBe("workspace_write");
	});
});

// ─── /sandbox mode change command ────────────────────────────────

describe("/sandbox mode change", () => {
	it("引数なし: 現在のモードを表示", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toBe("workspace_write");
	});

	it("read_only: モードを変更", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("read_only", ctx);

		expect(notifications[0]).toContain("read_only");
	});

	it("workspace_write: モードを変更", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("workspace_write", ctx);

		expect(notifications[0]).toContain("workspace_write");
	});

	it("yolo: 承認プロンプト (approve)", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				notify: (msg: string) => { notifications.push(msg); },
				confirm: vi.fn(() => Promise.resolve(true)),
			},
		});
		await mock._commands["sandbox"].handler("yolo", ctx);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(notifications[0]).toContain("yolo");
	});

	it("yolo: 承認拒否", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				notify: (msg: string) => { notifications.push(msg); },
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		});
		await mock._commands["sandbox"].handler("yolo", ctx);

		expect(notifications[0]).toContain("キャンセル");
	});

	it("invalid: エラーメッセージ", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("invalid", ctx);

		expect(notifications[0]).toContain("無効なモード");
	});

	it("yolo → read_only: 承認状態をリセット", async () => {
		const notifications: string[] = [];
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// First, set to yolo (approve)
		const ctx1 = createMockCtx({
			ui: {
				...createMockCtx().ui,
				notify: (msg: string) => { notifications.push(msg); },
				confirm: vi.fn(() => Promise.resolve(true)),
			},
		});
		await mock._commands["sandbox"].handler("yolo", ctx1);

		// Verify user_bash is allowed (approved yolo)
		expect(mock._hooks.user_bash()).toBeUndefined();

		// Then, switch to read_only — should reset approval
		const ctx2 = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("read_only", ctx2);

		// Now user_bash should block (no longer approved yolo)
		expect(() => mock._hooks.user_bash()).toThrow("サンドボックスがアクティブ");
	});
});

// ─── /sandbox getArgumentCompletions ────────────────────────────

describe("/sandbox getArgumentCompletions", () => {
	it("read_only が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"].getArgumentCompletions("read");
		expect(completions.some((c: { value: string }) => c.value === "read_only")).toBe(true);
	});

	it("workspace_write が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"].getArgumentCompletions("work");
		expect(completions.some((c: { value: string }) => c.value === "workspace_write")).toBe(true);
	});

	it("yolo が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"].getArgumentCompletions("yolo");
		expect(completions.some((c: { value: string }) => c.value === "yolo")).toBe(true);
	});

	it("空 prefix は全モードを返す", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"].getArgumentCompletions("");
		expect(completions.length).toBe(3);
	});
});

// ─── tool execute: Case 1 (--no-sandbox) ─────────────────────────

describe("tool execute: Case 1 (--no-sandbox)", () => {
	it("unsandboxed で実行する", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello" },
			undefined, // signal
			undefined, // onUpdate
			createMockCtx(),
		);

		expect(result).toBeDefined();
	});
});

// ─── tool execute: Case 3 (sandbox unavailable) ──────────────────

describe("tool execute: Case 3 (sandbox unavailable, refuse)", () => {
	it("sandbox-exec が利用不可の場合、コマンドを拒否する", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("test-id", { command: "echo hello" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("sandbox-exec");
	});
});

// ─── tool execute: Case 2 (yolo unapproved) ────────

describe("tool execute: Case 2 (yolo)", () => {
	it("未承認: 承認プロンプト → 承認で実行", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);

		// session_start already approves yolo (confirm returns true)
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		// Already approved at session_start, so no confirm prompt in execute
		const result = await tool.execute("test-id", { command: "echo hello" }, undefined, undefined, ctx);

		expect(result).toBeDefined();
	});

	it("未承認: 承認拒否でエラー", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		// Reject the session_start approval
		await mock._hooks.session_start({}, createMockCtx({
			ui: {
				...createMockCtx().ui,
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		}));
		// yolo was rejected at session_start → fallback to workspace_write
		// But since sandbox is unavailable, it will refuse
		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("test-id", { command: "echo hello" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow();
	});
});

// ─── session_start + session_shutdown lifecycle ──────────────────

describe("session lifecycle", () => {
	it("start → shutdown → start: 状態がリセットされる", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);

		// Start
		await mock._hooks.session_start({}, createMockCtx());

		// Shutdown
		await mock._hooks.session_shutdown();

		// Restart with different flags
		mock._flags = {};
		await mock._hooks.session_start({}, createMockCtx());

		// Should not have "explicitly disabled" message
		const ctx = createMockCtx();
		const notifications: string[] = [];
		ctx.ui.notify = (msg: string) => { notifications.push(msg); };
		await mock._commands["sandbox"].handler("", ctx);
		// After restart with no flags, sandbox-exec unavailable → startup blocked
		expect(notifications[0]).toContain("blocked:");
		expect(notifications[0]).toContain("sandbox-exec");
	});
});

// ─── status bar ──────────────────────────────────────────────────

describe("status bar", () => {
	it("disabled 時は status bar を設定しない", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// With --no-sandbox, session_start returns early and doesn't reach updateStatusBar
		// Status bar should not be set
		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
	});

	it("enabled 時は status bar を設定", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Status bar should be set
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Array), expect.any(Object));
	});

	it("yolo 時は [!] アイコン", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.arrayContaining([expect.stringContaining("yolo")]), expect.any(Object));
	});

	it("workspace_write 時は [o] アイコン", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.arrayContaining([expect.stringContaining("workspace_write")]), expect.any(Object));
	});
});

// ─── tool execute: Case 4 (sandboxed execution) ──────────────────

describe("tool execute: Case 4 (sandboxed execution)", () => {
	it("sandboxed command が成功する", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "hello world",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "echo hello" }, undefined, undefined, createMockCtx());

		expect(result.content[0].text).toBe("hello world");
		expect(result.details.sandboxed).toBe(true);
	});

	it("sandboxed command の stderr も出力に含まれる", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "stdout output",
			stderr: "stderr output",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "cmd" }, undefined, undefined, createMockCtx());

		expect(result.content[0].text).toContain("stdout output");
		expect(result.content[0].text).toContain("stderr output");
	});

	it("sandboxed command が非ゼロ終了コードの場合はエラー", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "some output",
			stderr: "error message",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("id1", { command: "fail" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("終了コード 1");
	});

	it("sandboxed command 出力なしの場合は (no output)", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "true" }, undefined, undefined, createMockCtx());

		expect(result.content[0].text).toBe("(出力なし)");
	});

	it("危険コマンド (rm -rf) は承認プロンプトを表示 (approve)", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		const result = await tool.execute("id1", { command: "rm -rf ./node_modules" }, undefined, undefined, ctx);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(result).toBeDefined();
	});

	it("危険コマンド (rm -rf) は承認拒否でエラー", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		});
		await expect(
			tool.execute("id1", { command: "rm -rf ./node_modules" }, undefined, undefined, ctx),
		).rejects.toThrow("ブロックされました");
	});

	it("安全コマンドは承認プロンプトなし", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "output",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		await tool.execute("id1", { command: "ls -la" }, undefined, undefined, ctx);

		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});
});

// ─── resolveRealPaths error fallback ──────────────────────────────

describe("resolveRealPaths error fallback", () => {
	it("realpath が失敗した場合、cwd をそのまま使用する", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		const { resolveRealPaths } = await import("../pathPolicy.js");
		(resolveRealPaths as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("realpath failed"));

		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx({
			cwd: "/tmp/test-fallback-cwd",
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});

		// Should not throw — should fall back to [cwd]
		await mock._hooks.session_start({}, ctx);

		// Should have enabled sandbox
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Array), expect.any(Object));
	});
});

// ─── buildCurrentPolicy: read_only and yolo paths ───

describe("buildCurrentPolicy: all mode paths", () => {
	it("read_only モードで sandboxed command が正しい policy を使う", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0,
			signal: null,
			stdout: "output",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Explicitly switch to read_only (in case previous test left another mode)
		await mock._commands["sandbox"].handler("read_only", createMockCtx());

		// Now execute a tool command
		const tool = mock._registeredTools[0];
		await tool.execute("id1", { command: "cat file.txt" }, undefined, undefined, createMockCtx());

		expect(runSandboxedShellMac).toHaveBeenCalled();
		const callArgs = (runSandboxedShellMac as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(callArgs[1].mode).toBe("read_only");

		// Reset
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(false);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0, signal: null, stdout: "mock stdout", stderr: "",
		});
	});

	it("yolo モード (承認済み) で unsandboxed 実行", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "echo hello" }, undefined, undefined, createMockCtx());

		expect(result).toBeDefined();

		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(false);
	});
});

// ─── tool execute: Case 2 inline approval ────────────────────────

describe("tool execute: Case 2 inline approval flow", () => {
	it("/sandbox で yolo 承認 → 次の tool 実行はプロンプトなし", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Switch to yolo via command (approve)
		await mock._commands["sandbox"].handler("yolo", createMockCtx());

		// Now tool execute should work without confirm (approved via command)
		const ctx = createMockCtx();
		const result = await mock._registeredTools[0].execute("id1", { command: "echo test" }, undefined, undefined, ctx);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(result).toBeDefined();
	});

	it("session_shutdown 後に mode が残っている場合、execute 内でインライン承認", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);

		// session_start approves yolo
		await mock._hooks.session_start({}, createMockCtx());

		// session_shutdown resets yoloApproved to false, but currentMode stays
		await mock._hooks.session_shutdown();

		// Now execute should hit the inline approval path
		const confirmFn = vi.fn(() => Promise.resolve(true));
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, confirm: confirmFn },
		});
		const result = await mock._registeredTools[0].execute("id1", { command: "echo test" }, undefined, undefined, ctx);

		// Should have prompted for approval
		expect(confirmFn).toHaveBeenCalledTimes(1);
		expect(confirmFn).toHaveBeenCalledWith(
			"[!] フルアクセスが必要です",
			expect.stringContaining("無効化"),
		);
		expect(result).toBeDefined();
	});

	it("session_shutdown 後に inline approval 拒否 → エラー", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);

		// session_start approves
		await mock._hooks.session_start({}, createMockCtx());

		// session_shutdown resets approval
		await mock._hooks.session_shutdown();

		// Execute with confirm rejecting
		const confirmFn = vi.fn(() => Promise.resolve(false));
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, confirm: confirmFn },
		});

		await expect(
			mock._registeredTools[0].execute("id1", { command: "echo test" }, undefined, undefined, ctx),
		).rejects.toThrow("明示的な承認");

		expect(confirmFn).toHaveBeenCalledTimes(1);
	});
});

// ─── Profile override: restrict-only policy ─────────────────────

describe("profile override: restrict-only policy", () => {
	it("base workspace_write で plan_read_only push → effective mode が read_only", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push plan_read_only override
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "plan-mode",
			token: "plan-123",
			profile: "plan_read_only",
		});

		// Effective mode should be read_only now
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toBe("read_only");
	});

	it("base read_only で workspace_write push → reject", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Try to push workspace_write (escalation)
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "evil-extension",
			token: "evil-123",
			profile: "workspace_write" as any,
		});

		// Should be rejected — appendEntry called
		expect(mock.appendEntry).toHaveBeenCalledWith(
			"sandbox-profile-override-rejected",
			expect.objectContaining({ reason: "unsupported-profile-for-event-override" }),
		);

		// Effective mode should still be read_only
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toBe("read_only");
	});

	it("base workspace_write で yolo push → reject", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Try to push yolo (escalation)
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "evil-extension",
			token: "evil-456",
			profile: "yolo" as any,
		});

		expect(mock.appendEntry).toHaveBeenCalledWith(
			"sandbox-profile-override-rejected",
			expect.objectContaining({ reason: "unsupported-profile-for-event-override" }),
		);

		// Effective mode should still be workspace_write
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toBe("workspace_write");
	});

	it("unknown profile は reject", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const prevCallCount = mock.appendEntry.mock.calls.length;

		// Push unknown profile
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "test-unknown",
			profile: "nonexistent_profile" as any,
		});

		// Should be rejected (unsupported profile)
		expect(mock.appendEntry).toHaveBeenCalledTimes(prevCallCount + 1);
	});

	it("pop で override が外れ、base mode に戻る", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push plan_read_only
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "plan-mode",
			token: "plan-789",
			profile: "plan_read_only",
		});

		// Pop it
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "plan-mode",
			token: "plan-789",
		});

		// Effective mode should be back to workspace_write
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: (msg: string) => { notifications.push(msg); } },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toBe("workspace_write");
	});

	it("push/pop 後に setWidget が呼ばれる (lastCtx がある場合)", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		const setWidgetCallCount = ctx.ui.setWidget.mock.calls.length;

		// Push plan_read_only
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "plan-mode",
			token: "plan-status-test",
			profile: "plan_read_only",
		});

		expect(ctx.ui.setWidget).toHaveBeenCalledTimes(setWidgetCallCount + 1);

		// Pop it
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "plan-mode",
			token: "plan-status-test",
		});

		expect(ctx.ui.setWidget).toHaveBeenCalledTimes(setWidgetCallCount + 2);
	});
});

// ─── request_elevation: startup block ────────────────────────────

describe("request_elevation: startup block", () => {
	it("startupBlockedReason がある場合、権限昇格不可メッセージを返す", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);

		// Trigger startup block by setting workspace root to /
		const { validateWorkspaceRoot } = await import("../pathPolicy.js");
		(validateWorkspaceRoot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("workspace root cannot be /"),
		);

		await mock._hooks.session_start({}, createMockCtx({ cwd: "/" }));

		// Now request_elevation should return the startup block message
		const tool = mock._registeredTools[1]; // request_elevation is the second tool
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello", reason: "test" },
			undefined,
			undefined,
			createMockCtx(),
		);

		const text = result.content[0].text;
		expect(text).toContain("権限昇格では回避できません");
		expect(text).not.toContain("bash ツールを直接使用してください");
		expect(result.details).toEqual({});
	});
});
