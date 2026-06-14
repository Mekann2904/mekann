/**
 * extension-command.test.ts — /sandbox コマンド (mode change, getArgumentCompletions, startup block) のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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

describe("/sandbox getArgumentCompletions: no match", () => {
	it("マッチしない prefix は null を返す", async () => {
		const mock = createMockApi();
		await loadExtension(mock);

		const completions = mock._commands["sandbox"]!.getArgumentCompletions!("xyz");
		expect(completions).toBeNull();
	});
});
