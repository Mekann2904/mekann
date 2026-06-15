/**
 * extension-profile-override.test.ts — profile override (restrict-only, read_only, pop, stack, invalid, escalation) のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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
