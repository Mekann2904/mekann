/**
 * extension-approval.test.ts — request_elevation (startup block, confirm, deny, explicitlyDisabled) のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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
