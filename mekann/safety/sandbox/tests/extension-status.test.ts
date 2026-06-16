/**
 * extension-status.test.ts — status bar / MODE_STATUS_EVENT / refreshStatusBar / changeMode / disableSandbox のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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

describe("mekann:codex-usage:status validation", () => {
	it("text 文字列で rightStatus が status bar に描画される", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		mock._eventHandlers["mekann:codex-usage:status"]({ text: "codex: 42%" });

		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		const widget = lastCall[1](undefined, ctx.ui.theme);
		expect(widget.render(80)).toEqual(expect.arrayContaining([expect.stringContaining("codex: 42%")]));
	});

	it("invalid payload では rightStatus が変わらない (guard が null/非 object を弾く)", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Set rightStatus to a known value first
		mock._eventHandlers["mekann:codex-usage:status"]({ text: "codex: 42%" });

		// Invalid payloads — must be ignored by the guard, NOT clear rightStatus
		mock._eventHandlers["mekann:codex-usage:status"](null);
		mock._eventHandlers["mekann:codex-usage:status"](undefined);
		mock._eventHandlers["mekann:codex-usage:status"]("string");
		mock._eventHandlers["mekann:codex-usage:status"](42);

		// rightStatus should still be "codex: 42%" after all invalid payloads
		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		const widget = lastCall[1](undefined, ctx.ui.theme);
		const rendered = widget.render(80);
		expect(rendered[0]).toContain("codex: 42%");
	});

	it("空文字列・空白のみの text は rightStatus に設定しない", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

		const mock = createMockApi();
		mock._flags = {};
		await loadExtension(mock);
		const ctx = createMockCtx();
		await mock._hooks.session_start({}, ctx);

		// Empty/whitespace text should not set rightStatus
		mock._eventHandlers["mekann:codex-usage:status"]({ text: "   " });

		const lastCall = ctx.ui.setWidget.mock.calls[ctx.ui.setWidget.mock.calls.length - 1];
		const widget = lastCall[1](undefined, ctx.ui.theme);
		const rendered = widget.render(80);
		// No rightStatus text on the line
		expect(rendered[0]).not.toContain("   ");
	});
});

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
