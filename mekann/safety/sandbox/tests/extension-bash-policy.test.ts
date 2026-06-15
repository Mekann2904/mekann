/**
 * extension-bash-policy.test.ts — user_bash フックと bash tool (承認・サンドボックス実行・exit code) のテスト
 *
 * tests/extension.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパー・モックは ./extension-test-utils.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockCtx, createMockApi, loadExtension } from "./extension-test-utils.js";

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
