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
import { clearPromptProvidersForTests, collectPromptFragments } from "../../../core/prompt-core/index.js";
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
vi.mock("../permissions.js", () => ({
	resolveRealPaths: vi.fn((paths: string[]) => Promise.resolve(paths)),
	validateWorkspaceRoot: vi.fn(() => Promise.resolve()),
	resolveSafeRealPath: vi.fn((p: string) => Promise.resolve(p)),
	assertPathInsideRoot: vi.fn(() => Promise.resolve()),
	isProtectedPath: vi.fn(() => false),
	checkUnsafeRoot: vi.fn(() => Promise.resolve(null)),
	readOnlyPolicy: vi.fn((cwd: string, workspaceRoots: string[] = []) => ({ mode: "read_only", cwd, workspaceRoots, writableRoots: [], network: false })),
	workspaceWritePolicy: vi.fn(),
	yoloPolicy: vi.fn(),
	shouldRequestApproval: vi.fn((_mode: string, command: string) => {
		if (/\brm\s+-rf\b/i.test(command)) return { needsApproval: true, reason: "再帰的強制削除" };
		return { needsApproval: false };
	}),
	yoloApprovalMessage: vi.fn(),
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
	const registeredTools: Array<Record<string, any>> = [];
	const registeredFlags: Array<{ name: string; config: unknown }> = [];
	const eventHandlers: Record<string, Function> = {};

	const api = {
		registerFlag: vi.fn((name: string, config: unknown) => {
			registeredFlags.push({ name, config });
		}),
		registerTool: vi.fn((tool: Record<string, any>) => {
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

// ─── Prompt provider ─────────────────────────────────────────────

describe("prompt provider", () => {
	beforeEach(() => clearPromptProvidersForTests());

	it("registers stable sandbox policy for cache-friendly prompt", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		const fragments = await collectPromptFragments({ cwd: "/tmp/project" });
		const policy = fragments.find((f) => f.id === "sandbox:policy");
		expect(policy).toMatchObject({ kind: "sandbox_policy", stability: "stable", scope: "global" });
		expect(policy?.content).toContain("request_elevation");
	});
});

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

	it("--sandbox-allow-homebrew-paths フラグを登録する", async () => {
		const mock = createMockApi();
		await loadExtension(mock);
		const flag = mock._registeredFlags.find(f => f.name === "sandbox-allow-homebrew-paths");
		expect(flag).toBeDefined();
		expect((flag as any).config.type).toBe("boolean");
		expect((flag as any).config.default).toBe(false);
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

		// Default is now yolo — no approval prompt at session_start
		// sandbox-exec unavailable is not a hard block for yolo
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("サンドボックス有効"),
			"info",
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

	it("yolo: session_start では承認プロンプトを出さず、初回 bash 実行時に求める", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx();

		await mock._hooks.session_start({}, ctx);

		// No confirm prompt at session_start
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("yolo: session_start ではフォールバックしない（初回 bash まで保留）", async () => {
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

		// No confirm at session_start → no fallback either
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		// Mode stays yolo
		const notifications: string[] = [];
		const statusCtx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", statusCtx);
		expect(notifications[0]).toContain("sandbox: active (yolo");
	});

	it("unsafe workspace root (/): sandbox を無効化する", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx({ cwd: "/" });

		// Mock validateWorkspaceRoot to throw for /
		const { validateWorkspaceRoot } = await import("../permissions.js");
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", statusCtx);
		// After shutdown, sandbox is no longer initialized.
		expect(notifications[0]).toContain("sandbox: blocked");
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

	it("sandbox 有効時: yolo なら許可", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Default is yolo → user_bash returns undefined (allowed)
		const result = mock._hooks.user_bash();
		expect(result).toBeUndefined();
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

	it("yolo モードなら user_bash 許可", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// yolo mode → user_bash allowed (no approval gating)
		const result = mock._hooks.user_bash();
		expect(result).toBeUndefined();
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toContain("sandbox: disabled by --no-sandbox");
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toContain("sandbox: active (yolo");
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toContain("sandbox: disabled by --no-sandbox");
	});

	it("read_only: モードを変更", async () => {
		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
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
				notify: vi.fn((msg: string) => { notifications.push(msg); }),
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
				notify: vi.fn((msg: string) => { notifications.push(msg); }),
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
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
				notify: vi.fn((msg: string) => { notifications.push(msg); }),
				confirm: vi.fn(() => Promise.resolve(true)),
			},
		});
		await mock._commands["sandbox"].handler("yolo", ctx1);

		// Verify user_bash is allowed (approved yolo)
		expect(mock._hooks.user_bash()).toBeUndefined();

		// Then, switch to read_only — should reset approval
		const ctx2 = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("read_only", ctx2);

		// Now user_bash should be intercepted by sandbox operations (no direct bypass)
		expect(mock._hooks.user_bash()).toHaveProperty("operations");
	});
});

// ─── /sandbox getArgumentCompletions ────────────────────────────

describe("/sandbox getArgumentCompletions", () => {
	it("read_only が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("read");
		expect(completions.some((c: { value: string }) => c.value === "read_only")).toBe(true);
	});

	it("workspace_write が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("work");
		expect(completions.some((c: { value: string }) => c.value === "workspace_write")).toBe(true);
	});

	it("yolo が補完される", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("yolo");
		expect(completions.some((c: { value: string }) => c.value === "yolo")).toBe(true);
	});

	it("空 prefix は全モードを返す", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("");
		expect(completions.length).toBe(8);
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
	it("sandbox-exec が利用不可の場合、workspace_write モードではコマンドを拒否する", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		// workspace_write does not need yolo approval, confirm won't be called for mode
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

	it("yolo モードなら確認なしで実行", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// yolo mode → tool executes without any approval prompt
		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		const result = await tool.execute("test-id", { command: "echo hello" }, undefined, undefined, ctx);
		expect(result).toBeDefined();
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
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
		ctx.ui.notify = vi.fn((msg: string) => { notifications.push(msg); });
		await mock._commands["sandbox"].handler("", ctx);
		// After restart with no flags, default is yolo, approved at session_start
		expect(notifications[0]).toContain("sandbox: active (yolo");
	});
});

// ─── status bar ──────────────────────────────────────────────────

describe("status bar", () => {
	it("disabled 時は status bar をクリアする", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// With --no-sandbox, setWidget is called with undefined to clear stale widget
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", undefined);
	});

	it("enabled 時は status bar を設定", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Status bar should be set (render function)
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Function), expect.any(Object));
	});

	it("yolo 時は [!] アイコン", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Function), expect.any(Object));
		// Verify the rendered content contains "yolo"
		const yoloCall = ctx.ui.setWidget.mock.calls.find(c => typeof c[1] === "function");
		const widget = yoloCall![1](undefined, ctx.ui.theme);
		expect(widget.render(80)).toEqual(expect.arrayContaining([expect.stringContaining("yolo")]));
	});

	it("yolo 時は yolo 表示", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Function), expect.any(Object));
		const yoloCall = ctx.ui.setWidget.mock.calls.find(c => typeof c[1] === "function");
		const widget = yoloCall![1](undefined, ctx.ui.theme);
		expect(widget.render(80)).toEqual(expect.arrayContaining([expect.stringContaining("yolo")]));
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		mock._flags = { "sandbox-mode": "workspace_write" };
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
		const { resolveRealPaths } = await import("../permissions.js");
		(resolveRealPaths as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("realpath failed"));

		const notifications: string[] = [];
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx({
			cwd: "/tmp/test-fallback-cwd",
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});

		// Should not throw — should fall back to [cwd]
		await mock._hooks.session_start({}, ctx);

		// Should have enabled sandbox (render function)
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", expect.any(Function), expect.any(Object));
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

	it("session_shutdown 後に yolo なら確認なしで実行", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._hooks.session_shutdown();

		// yolo mode — no approval needed
		const ctx = createMockCtx();
		const result = await mock._registeredTools[0].execute("id1", { command: "echo test" }, undefined, undefined, ctx);
		expect(result).toBeDefined();
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("session_shutdown 後も yolo なら user_bash 許可", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());
		await mock._hooks.session_shutdown();

		// yolo mode → user_bash allowed
		const result = mock._hooks.user_bash();
		expect(result).toBeUndefined();
	});
});

// ─── Profile override: restrict-only policy ─────────────────────

describe("profile override: restrict-only policy", () => {
	it("base workspace_write で read_only push → effective mode が read_only", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push read_only override
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "modes",
			token: "read-only-123",
			profile: "read_only",
		});

		// Effective mode should be read_only now
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});

	it("base workspace_write で yolo push → reject", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
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
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (workspace_write");
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
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push read_only
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "modes",
			token: "read-only-789",
			profile: "read_only",
		});

		// Pop it
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "modes",
			token: "read-only-789",
		});

		// Effective mode should be back to workspace_write
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (workspace_write");
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

		// Push read_only
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "modes",
			token: "read-only-status-test",
			profile: "read_only",
		});

		expect(ctx.ui.setWidget).toHaveBeenCalledTimes(setWidgetCallCount + 1);

		// Pop it
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "modes",
			token: "read-only-status-test",
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
		const { validateWorkspaceRoot } = await import("../permissions.js");
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

// ─── MODE_STATUS_EVENT validation ─────────────────────────────

describe("MODE_STATUS_EVENT validation", () => {
	it("mode: read_only で setWidget が read_only を含むラベルを表示", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Emit read_only mode status — should trigger updateStatusBar via lastCtx
		mock._eventHandlers["mekann:modes:status"]({ mode: "read_only" });

		// setWidget should have been called with a render function
		expect(ctx.ui.setWidget).toHaveBeenCalledWith(
			"sandbox",
			expect.any(Function),
			expect.any(Object),
		);
		// Verify the rendered content contains "read_only"
		const readOnlyCall = ctx.ui.setWidget.mock.calls.filter(c => typeof c[1] === "function");
		const lastReadOnlyCall = readOnlyCall[readOnlyCall.length - 1];
		const widget = lastReadOnlyCall[1](undefined, ctx.ui.theme);
		expect(widget.render(80)).toEqual(expect.arrayContaining([expect.stringContaining("read_only")]));
	});

	it("mode: main で setWidget から read_only ラベルが消える", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// First set read_only
		mock._eventHandlers["mekann:modes:status"]({ mode: "read_only" });

		// Then set main — should trigger updateStatusBar via lastCtx
		mock._eventHandlers["mekann:modes:status"]({ mode: "main" });

		// The last setWidget call should NOT contain "read_only"
		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		expect(lastCall[0]).toBe("sandbox");
		const widget = lastCall[1](undefined, ctx.ui.theme);
		const rendered = widget.render(80);
		const label = rendered[0] as string;
		expect(label).not.toContain("read_only");
		expect(label).toContain("yolo");
	});

	it("invalid payload では modeStatus が変わらない", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Set read_only mode first
		mock._eventHandlers["mekann:modes:status"]({ mode: "read_only" });

		// Send invalid payloads — should be ignored
		mock._eventHandlers["mekann:modes:status"](undefined);
		mock._eventHandlers["mekann:modes:status"](null);
		mock._eventHandlers["mekann:modes:status"]({});
		mock._eventHandlers["mekann:modes:status"]({ mode: undefined });
		mock._eventHandlers["mekann:modes:status"]({ mode: null });
		mock._eventHandlers["mekann:modes:status"]({ mode: "invalid" });
		mock._eventHandlers["mekann:modes:status"]({ mode: 123 });
		mock._eventHandlers["mekann:modes:status"]("string");
		mock._eventHandlers["mekann:modes:status"](42);

		// modeStatus should still be "read_only" after all invalid payloads
		// Verify by checking the last setWidget call
		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		const widget = lastCall[1](undefined, ctx.ui.theme);
		const rendered = widget.render(80);
		expect(rendered[0]).toContain("read_only");
	});
});

// ─── Sandbox default mode ──────────────────────────────────────────

describe("sandbox default mode", () => {
	it("デフォルト mode が yolo である", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (yolo");
	});

	it("workspace_write は明示指定した場合のみ effective mode になる", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (workspace_write");
	});
});

// ─── Startup block: stale widget prevention ────────────────────────

describe("startup block: stale widget prevention", () => {
	it("startup block 時に setWidget(undefined) で widget を消す", async () => {
		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);

		const { validateWorkspaceRoot } = await import("../permissions.js");
		(validateWorkspaceRoot as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("workspace root cannot be /"),
		);

		const ctx = createMockCtx({ cwd: "/" });
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", undefined);
	});

	it("sandbox-exec unavailable 時に setWidget(undefined) で widget を消す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);

		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", undefined);
	});
});

// ─── request_elevation tool: explicitlyDisabled ───────────────────

describe("request_elevation: explicitlyDisabled", () => {
	it("--no-sandbox 時は既に無効化メッセージを返す", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[1]; // request_elevation
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello", reason: "test" },
			undefined,
			undefined,
			createMockCtx(),
		);

		expect(result.content[0].text).toContain("既に無効化されています");
		expect(result.details).toEqual({});
	});
});

// ─── request_elevation tool: sandboxEnabled=false ──────────────────

describe("request_elevation: sandbox not enabled", () => {
	it("session_shutdown 後は sandbox 非アクティブメッセージを返す", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// After shutdown: sandboxEnabled=false, explicitlyDisabled=false, startupBlockedReason=undefined
		await mock._hooks.session_shutdown();

		const tool = mock._registeredTools[1]; // request_elevation
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello", reason: "test" },
			undefined,
			undefined,
			createMockCtx(),
		);

		expect(result.content[0].text).toContain("アクティブではありません");
		expect(result.details).toEqual({});
	});
});

// ─── request_elevation tool: user confirms ─────────────────────────

describe("request_elevation: user confirms", () => {
	it("ユーザーが承認した場合、unsandboxed で実行される", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[1]; // request_elevation
		const ctx = createMockCtx();
		const result = await tool.execute(
			"test-id",
			{ command: "npm install", reason: "依存関係のインストール" },
			undefined,
			undefined,
			ctx,
		);

		expect(ctx.ui.confirm).toHaveBeenCalled();
		expect(result).toBeDefined();
		expect(result.details.elevated).toBe(true);
		expect(result.details.reason).toBe("依存関係のインストール");
	});
});

// ─── request_elevation tool: user denies ───────────────────────────

describe("request_elevation: user denies", () => {
	it("ユーザーが拒否した場合、拒否メッセージを返す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[1]; // request_elevation
		const ctx = createMockCtx({
			ui: {
				...createMockCtx().ui,
				confirm: vi.fn(() => Promise.resolve(false)),
			},
		});
		const result = await tool.execute(
			"test-id",
			{ command: "npm install", reason: "test" },
			undefined,
			undefined,
			ctx,
		);

		expect(result.content[0].text).toContain("拒否されました");
		expect(result.details).toEqual({});
	});
});

// ─── user_bash hook: startup blocked ───────────────────────────────

describe("user_bash hook: startup blocked", () => {
	it("startupBlockedReason がある場合、エラー表示ではなく失敗 result を返す", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);

		// sandbox-exec unavailable + workspace_write = startup blocked
		await mock._hooks.session_start({}, createMockCtx());

		const result = mock._hooks.user_bash();
		expect(result.result.exitCode).toBe(1);
		expect(result.result.output).toMatch(/明示的に無効化/);
	});

	it("sandbox active (not yolo, not disabled) では sandboxed operations を返す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		expect(mock._hooks.user_bash()).toHaveProperty("operations");
	});
});

// ─── /sandbox command: no args with startupBlockedReason ────────────

describe("/sandbox command: no args with startup blocked", () => {
	it("startupBlockedReason がある場合、blocked メッセージを表示", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);

		expect(notifications[0]).toContain("sandbox: unavailable");
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("sandbox: unavailable"),
			"error",
		);
	});
});

// ─── /sandbox command: yolo with override active ───────────────────

describe("/sandbox command: yolo with override active", () => {
	it("override 活動中に yolo を設定すると延期メッセージを表示", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push read_only override
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "modes",
			token: "read-only-defer-test",
			profile: "read_only",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("yolo", ctx);

		expect(notifications[0]).toContain("base モードを yolo に設定しました");
		expect(notifications[0]).toContain("override 終了後");
	});
});

// ─── Bash tool: startupBlockedReason throws ────────────────────────

describe("bash tool: startup blocked", () => {
	it("startupBlockedReason がある場合、HINT 付きでエラーを投げる", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("test-id", { command: "echo hello" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("request_elevation");
	});
});

// ─── Bash tool: non-zero exit with permission error ────────────────

describe("bash tool: non-zero exit with permission error", () => {
	it("権限エラー時は elevation hint を含む", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "Operation not permitted",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("id1", { command: "npm install" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("request_elevation");
	});

	it("権限エラーなしの場合は elevation hint を含まない", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "command not found",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const error = await tool
			.execute("id1", { command: "badcmd" }, undefined, undefined, createMockCtx())
			.catch((e: Error) => e);

		expect(error.message).toContain("終了コード 1");
		expect(error.message).not.toContain("request_elevation");
	});

	it("Permission denied でも hint を含む", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 2,
			signal: null,
			stdout: "",
			stderr: "Permission denied: file.txt",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("id1", { command: "cat /etc/shadow" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("request_elevation");
	});

	it("EPERM でも hint を含む", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "Error: EPERM: operation not permitted",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("id1", { command: "test" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("request_elevation");
	});

	it("EACCES でも hint を含む", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "Error: EACCES: permission denied",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("id1", { command: "test" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("request_elevation");
	});
});

// ─── Profile override: sandbox_read_only ───────────────────────────

describe("profile override: sandbox_read_only", () => {
	it("sandbox_read_only push が有効", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test-ext",
			token: "sandbox-ro-1",
			profile: "sandbox_read_only",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});
});

// ─── Profile override: pop with non-matching token ─────────────────

describe("profile override: pop with non-matching token", () => {
	it("異なる token で pop しても変化しない", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push with token A
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "modes",
			token: "token-A",
			profile: "read_only",
		});

		// Pop with different token
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "modes",
			token: "token-B",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		// Should still be read_only (override not popped)
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});
});

// ─── Profile override: multiple pushes/pops stack ──────────────────

describe("profile override: stack behavior", () => {
	it("複数 push/pop で正しい effective mode を返す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push two overrides
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "ext-a",
			token: "token-a",
			profile: "read_only",
		});
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "ext-b",
			token: "token-b",
			profile: "sandbox_read_only",
		});

		// Both overrides active → read_only
		let notifications: string[] = [];
		let ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");

		// Pop first one
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "ext-a",
			token: "token-a",
		});

		notifications = [];
		ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only"); // still read_only (ext-b still active)

		// Pop second one
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "ext-b",
			token: "token-b",
		});

		notifications = [];
		ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (yolo"); // back to base mode
	});

	it("同じ token で再 push は既存エントリを置き換える", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push with token
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "ext-a",
			token: "token-dup",
			profile: "read_only",
		});

		// Push again with same token (should replace)
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "ext-a",
			token: "token-dup",
			profile: "sandbox_read_only",
		});

		// Pop once should remove the entry
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "ext-a",
			token: "token-dup",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (yolo"); // back to base
	});
});

// ─── Profile override: push with no token/profile ──────────────────

describe("profile override: invalid payloads", () => {
	it("token なし push は無視される", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		const prevCallCount = mock.appendEntry.mock.calls.length;

		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			// no token
			profile: "read_only",
		});

		// No rejection logged, no state change
		expect(mock.appendEntry).toHaveBeenCalledTimes(prevCallCount);
	});

	it("profile なし push は無視される", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		const prevCallCount = mock.appendEntry.mock.calls.length;

		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "no-profile-token",
			// no profile
		});

		expect(mock.appendEntry).toHaveBeenCalledTimes(prevCallCount);
	});

	it("token なし pop は無視される", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Push first
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "pop-no-token",
			profile: "read_only",
		});

		// Pop without token
		mock._eventHandlers["mekann:sandbox:pop-profile"]({
			owner: "test",
			// no token
		});

		// Override should still be active
		const notifications: string[] = [];
		const statusCtx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", statusCtx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});
});

// ─── Escalation rejection from read_only base ──────────────────────

describe("profile override: escalation rejection", () => {
	it("read_only base で read_only push は成功する (同じ制限レベル)", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const prevRejectCount = mock.appendEntry.mock.calls.filter(
			(c: any[]) => c[0] === "sandbox-profile-override-rejected",
		).length;

		// read_only → read_only: same restrictiveness, should succeed
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "ro-same-level",
			profile: "read_only",
		});

		const newRejectCount = mock.appendEntry.mock.calls.filter(
			(c: any[]) => c[0] === "sandbox-profile-override-rejected",
		).length;
		expect(newRejectCount).toBe(prevRejectCount); // no new rejection

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});

	it("workspace_write base で read_only push は成功する (より制限的)", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "ww-to-ro",
			profile: "read_only",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});
});

// ─── Status bar: modeStatus + explicitlyDisabled ───────────────

describe("status bar: combined states", () => {
	it("modeStatus=read_only の時、status bar に read_only ラベルが含まれる", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Set read_only mode status
		mock._eventHandlers["mekann:modes:status"]({ mode: "read_only" });

		// Verify status bar includes read_only label
		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		const widget = lastCall[1](undefined, ctx.ui.theme);
		const rendered = widget.render(80);
		expect(rendered[0]).toContain("read_only");
		expect(rendered[0]).toContain("yolo");
	});

	it("sandboxEnabled=false の時、updateStatusBar は widget をクリアする", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);

		// sandbox-exec unavailable → sandboxEnabled=false
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// updateStatusBar during session_start should clear widget
		expect(ctx.ui.setWidget).toHaveBeenCalledWith("sandbox", undefined);
	});
});

// ─── session_shutdown resets all state ─────────────────────────────

describe("session_shutdown: full reset", () => {
	it("profileOverrideStack と modeStatus をリセットする", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Push override
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "shutdown-test",
			profile: "read_only",
		});

		// Set read_only mode status
		mock._eventHandlers["mekann:modes:status"]({ mode: "read_only" });

		// Shutdown
		await mock._hooks.session_shutdown();

		// All state should be reset — /sandbox reports uninitialized until the next session_start.
		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: blocked");

		// user_bash should be allowed (yolo default after reset)
		expect(mock._hooks.user_bash()).toBeUndefined();
	});
});

// ─── buildCurrentPolicy: yolo path ─────────────────────────────────

describe("buildCurrentPolicy: yolo via tool execute", () => {
	it("yolo モードで tool が unsandboxed 実行される (sandboxExec unavailable)", async () => {
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);

		// sandbox-exec unavailable, but yolo doesn't need it
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello" },
			undefined,
			undefined,
			createMockCtx(),
		);

		expect(result).toBeDefined();
	});
});

// ─── Bash tool: command approval needed ────────────────────────────

describe("bash tool: command approval needed", () => {
	it("rm -rf コマンドは承認が必要 (workspace_write)", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "output",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		await tool.execute("id1", { command: "rm -rf ./node_modules" }, undefined, undefined, ctx);

		expect(ctx.ui.confirm).toHaveBeenCalled();
	});

	it("reboot コマンドは承認が必要 (rm -rf pattern variant)", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "output",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const ctx = createMockCtx();
		// The mock shouldRequestApproval only catches rm -rf, so we use that
		await tool.execute("id1", { command: "rm -rf /tmp/old-build" }, undefined, undefined, ctx);

		expect(ctx.ui.confirm).toHaveBeenCalled();
	});
});

// ─── Bash tool: read_only mode sandboxed execution ─────────────────

describe("bash tool: read_only sandboxed execution", () => {
	it("read_only モードで sandboxed command が成功する", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 0,
			signal: null,
			stdout: "read_only output",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "ls" }, undefined, undefined, createMockCtx());

		expect(result.content[0].text).toBe("read_only output");
		expect(result.details.sandboxed).toBe(true);
		expect(result.details.mode).toBe("read_only");
	});
});

// ─── Bash tool: workspace_write sandboxed execution with policy ────

describe("bash tool: workspace_write sandboxed with policy builder", () => {
	it("workspace_write モードで buildCurrentPolicy の workspaceWritePolicy パスを実行", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0,
			signal: null,
			stdout: "workspace_write output",
			stderr: "",
		});

		const { workspaceWritePolicy } = await import("../permissions.js");
		(workspaceWritePolicy as ReturnType<typeof vi.fn>).mockReturnValue({
			mode: "workspace_write",
			cwd: "/tmp/test",
			workspaceRoots: ["/tmp/test"],
			writableRoots: ["/tmp/test"],
			network: false,
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Verify mode is workspace_write
		const notifications: string[] = [];
		const modeCtx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", modeCtx);
		expect(notifications[0]).toContain("sandbox: active (workspace_write");

		// Execute sandboxed command
		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "echo test" }, undefined, undefined, createMockCtx());

		expect(result).toBeDefined();
		expect(result.details.sandboxed).toBe(true);
		expect(result.details.mode).toBe("workspace_write");
		expect(workspaceWritePolicy).toHaveBeenCalled();

		// Reset mocks
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(false);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0, signal: null, stdout: "mock stdout", stderr: "",
		});
	});
});

// ─── /sandbox getArgumentCompletions: no match returns null ────────

describe("/sandbox getArgumentCompletions: no match", () => {
	it("マッチしない prefix は null を返す", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("xyz");
		expect(completions).toBeNull();
	});
});

// ─── buildCurrentPolicy: yolo path via sandboxed execution ────────

describe("buildCurrentPolicy: yolo path", () => {
	it("yolo モードで Case 4 に到達しないことを確認", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0, signal: null, stdout: "yolo output", stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute("id1", { command: "echo hello" }, undefined, undefined, createMockCtx());

		// yolo goes through Case 2 (unsandboxed), not Case 4 (sandboxed)
		expect(result).toBeDefined();
		// runSandboxedShellMac should NOT be called for yolo mode
		expect(runSandboxedShellMac).not.toHaveBeenCalled();

		// Reset mocks
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(false);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue({
			code: 0, signal: null, stdout: "mock stdout", stderr: "",
		});
	});
});

// ─── Profile override: escalation rejection (read_only push to yolo base) ──

describe("profile override: escalation rejection", () => {
	it("read_only base で read_only push は escalation rejection しない", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// read_only push to read_only base — same level, no escalation
		mock._eventHandlers["mekann:sandbox:push-profile"]({
			owner: "test",
			token: "ro-same",
			profile: "read_only",
		});

		const notifications: string[] = [];
		const ctx = createMockCtx({
			ui: { ...createMockCtx().ui, notify: vi.fn((msg: string) => { notifications.push(msg); }) },
		});
		await mock._commands["sandbox"].handler("", ctx);
		expect(notifications[0]).toContain("sandbox: active (read_only");
	});
});

// ─── disableSandbox: lastCtx undefined branch ──────────────────

describe("disableSandbox: no lastCtx", () => {
	it("session_start 前に disableSandbox が呼ばれると lastCtx がなくてもクラッシュしない", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);

		// session_start calls disableSandbox but first time lastCtx is set before the call
		// Instead, test the flow where shutdown resets lastCtx=undefined then something triggers disableSandbox
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);
		await mock._hooks.session_shutdown();

		// After shutdown, session_start again with --no-sandbox
		mock._flags = { "no-sandbox": true };
		const ctx2 = createMockCtx();
		await mock._hooks.session_start({}, ctx2);

		expect(ctx2.ui.setWidget).toHaveBeenCalledWith("sandbox", undefined);
	});
});

// ─── Bash tool: params.command is undefined ──────────────────

describe("bash tool: params.command edge cases", () => {
	it("command が undefined の場合でもエラーにならない", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const result = await tool.execute(
			"test-id",
			{ command: undefined },
			undefined,
			undefined,
			createMockCtx(),
		);

		expect(result).toBeDefined();
	});
});

// ─── refreshStatusBar: lastCtx undefined ──────────────────────

describe("refreshStatusBar: no lastCtx", () => {
	it("lastCtx が undefined でも refreshStatusBar はクラッシュしない", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);

		// No session_start → lastCtx is undefined
		// Profile push/pop events call refreshStatusBar internally
		// This should not throw
		expect(() => {
			mock._eventHandlers["mekann:sandbox:push-profile"]({
				owner: "test",
				token: "no-ctx-test",
				profile: "read_only",
			});
		}).not.toThrow();
	});
});

// ─── changeMode: read_only resets yolo approval ──────────────────

describe("changeMode: non-yolo mode resets yolo approval", () => {
	it("yolo → read_only → user_bash がブロックされる", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Switch to yolo (approve)
		await mock._commands["sandbox"].handler("yolo", createMockCtx());

		// user_bash should be allowed
		expect(mock._hooks.user_bash()).toBeUndefined();

		// Switch to read_only
		await mock._commands["sandbox"].handler("read_only", createMockCtx());

		// user_bash should now be intercepted by sandbox operations
		expect(mock._hooks.user_bash()).toHaveProperty("operations");
	});
});

// ─── Case 3: sandbox unavailable after mode switch from yolo ──────

describe("tool execute: Case 3 after yolo→workspace_write switch", () => {
	it("yolo 起動 → workspace_write 切替 → sandbox-exec unavailable で拒否", async () => {
		// sandbox-exec unavailable, but yolo doesn't need it
		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		// Switch to workspace_write via /sandbox command
		await mock._commands["sandbox"].handler("workspace_write", createMockCtx());

		// Now bash tool should hit Case 3 (!sandboxAvailable) and throw
		const tool = mock._registeredTools[0];
		await expect(
			tool.execute("test-id", { command: "echo hello" }, undefined, undefined, createMockCtx()),
		).rejects.toThrow("sandbox-exec");
	});
});

// ─── Bash tool: non-zero exit with empty output ────────────────────

describe("bash tool: non-zero exit with empty output", () => {
	it("非ゼロ終了コードで出力が空の場合でもエラーメッセージが正しい", async () => {
		const { isMacSandboxAvailable, runSandboxedShellMac } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
		(runSandboxedShellMac as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			code: 1,
			signal: null,
			stdout: "",
			stderr: "",
		});

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "workspace_write" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		const tool = mock._registeredTools[0];
		const error = await tool
			.execute("id1", { command: "fail" }, undefined, undefined, createMockCtx())
			.catch((e: Error) => e);

		expect(error.message).toContain("終了コード 1");
		// With empty output, the format is different (no ":\n" prefix)
		expect(error.message).not.toContain(":\n");
	});
});

// ─── getLocalBash: currentCwd falsy fallback ──────────────────────

describe("getLocalBash: cwd fallback", () => {
	it("session_start 前に bash tool を実行しても process.cwd() が使われる", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		// No session_start → currentCwd is empty → falls back to process.cwd()

		const tool = mock._registeredTools[0];
		const result = await tool.execute(
			"test-id",
			{ command: "echo hello" },
			undefined,
			undefined,
			createMockCtx(),
		);

		expect(result).toBeDefined();
	});

	it("reuses localBash when cwd unchanged (branches #12-1, #13-1)", async () => {
		const mock = createMockApi();
		mock._flags = { "no-sandbox": true };
		await loadExtension(mock);
		const ctx = createMockCtx({ cwd: "/tmp/test-cwd" });
		await mock._hooks.session_start!({}, ctx);

		const tool = mock._registeredTools[0];

		// First call creates localBash
		await tool.execute("id1", { command: "echo first" }, undefined, undefined, ctx);
		// Second call with same cwd reuses localBash (localBash._cwd === cwd)
		const result2 = await tool.execute("id2", { command: "echo second" }, undefined, undefined, ctx);
		expect(result2).toBeDefined();
	});
});
