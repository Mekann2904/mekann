/**
 * extension-session-hooks.test.ts — session_start / session_shutdown / session lifecycle / startup block のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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
