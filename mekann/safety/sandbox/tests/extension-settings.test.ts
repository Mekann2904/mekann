/**
 * extension-settings.test.ts — 設定・フラグ登録・プロンプトプロバイダのテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../../core/prompt-core/index.js";

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
