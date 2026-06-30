import { describe, expect, it } from "vitest";
import { isSandboxPermissionError, SANDBOX_PERMISSION_ERROR_PATTERN } from "../executionControl.js";

describe("isSandboxPermissionError (IC-166: locale-agnostic permission detection)", () => {
	it("detects English macOS permission messages", () => {
		expect(isSandboxPermissionError("sandbox-exec: Operation not permitted")).toBe(true);
		expect(isSandboxPermissionError("cat: /etc/sudoers: Permission denied")).toBe(true);
	});

	it("detects POSIX error codes regardless of surrounding prose", () => {
		expect(isSandboxPermissionError("errno 1 EPERM")).toBe(true);
		expect(isSandboxPermissionError("Error: EACCES")).toBe(true);
	});

	it("detects Japanese-locale permission messages so the request_elevation hint still fires", () => {
		// These are the kinds of messages a Japanese-localized tool/shell emits.
		expect(isSandboxPermissionError("操作は許可されません")).toBe(true);
		expect(isSandboxPermissionError("操作は許可されていません")).toBe(true);
		expect(isSandboxPermissionError("権限がありません")).toBe(true);
		expect(isSandboxPermissionError("アクセスが拒否されました")).toBe(true);
		expect(isSandboxPermissionError("アクセス権がありません")).toBe(true);
		expect(isSandboxPermissionError("アクセスできません")).toBe(true);
		expect(isSandboxPermissionError("権限が不足しています")).toBe(true);
	});

	it("does not flag ordinary non-zero failures", () => {
		expect(isSandboxPermissionError("command not found")).toBe(false);
		expect(isSandboxPermissionError("No such file or directory")).toBe(false);
		expect(isSandboxPermissionError("syntax error near unexpected token")).toBe(false);
		expect(isSandboxPermissionError("")).toBe(false);
	});

	it("pattern is a single global regex (no stateful lastIndex drift)", () => {
		// Reusing the same RegExp across calls must not skip matches.
		expect(SANDBOX_PERMISSION_ERROR_PATTERN.test("Permission denied")).toBe(true);
		expect(SANDBOX_PERMISSION_ERROR_PATTERN.test("all good")).toBe(false);
		expect(SANDBOX_PERMISSION_ERROR_PATTERN.test("操作は許可されません")).toBe(true);
	});
});
