import { describe, expect, it } from "vitest";
import { formatSandboxRuntimeStatus, type SandboxRuntimeStatus } from "../runtimeStatus.js";

describe("formatSandboxRuntimeStatus", () => {
	it("formats disabled-by-setting status", () => {
		expect(formatSandboxRuntimeStatus({ kind: "disabled_by_setting" })).toContain("sandbox.enabled=false");
	});

	it("formats unavailable status with recovery", () => {
		const status: SandboxRuntimeStatus = {
			kind: "unavailable",
			reason: "sandbox-exec missing",
			recoverableBy: "change_mode_or_restart",
		};
		const text = formatSandboxRuntimeStatus(status);
		expect(text).toContain("sandbox: unavailable");
		expect(text).toContain("sandbox-exec missing");
		expect(text).toContain("Recovery:");
	});

	it("formats active status with mode and roots", () => {
		const text = formatSandboxRuntimeStatus({
			kind: "active",
			mode: "workspace_write",
			sandboxAvailable: true,
			profileOverrides: 1,
			workspaceRoots: ["/repo"],
		});
		expect(text).toContain("sandbox: active");
		expect(text).toContain("workspace_write");
		expect(text).toContain("/repo");
	});
});
