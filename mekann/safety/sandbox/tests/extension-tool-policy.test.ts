/**
 * extension-tool-policy.test.ts — tool execute (Case 1-4) と buildCurrentPolicy / resolveRealPaths / getLocalBash のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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

	it("yolo モードでは request_elevation を active tool surface から外す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "yolo" };
		await loadExtension(mock);
		expect(mock._activeTools).toContain("request_elevation");

		await mock._hooks.session_start({}, createMockCtx());
		expect(mock._activeTools).not.toContain("request_elevation");

		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(false);
	});

	it("read_only モードでは request_elevation を active tool surface に残す", async () => {
		const { isMacSandboxAvailable } = await import("../macSeatbelt.js");
		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const mock = createMockApi();
		mock._flags = { "sandbox-mode": "read_only" };
		await loadExtension(mock);
		await mock._hooks.session_start({}, createMockCtx());

		expect(mock._activeTools).toContain("request_elevation");

		(isMacSandboxAvailable as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(false);
	});
});

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
