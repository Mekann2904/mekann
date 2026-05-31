import type { SandboxMode } from "./permissions.js";
import { modeLabel } from "../policy-core/modes.js";

export type SandboxRecoveryAction = "none" | "request_elevation" | "restart_with_no_sandbox" | "change_mode_or_restart";

export type SandboxRuntimeStatus =
	| { kind: "disabled_by_setting" }
	| { kind: "disabled_by_flag"; flag: "--no-sandbox" }
	| { kind: "blocked"; reason: string; recoverableBy: SandboxRecoveryAction }
	| { kind: "unavailable"; reason: string; recoverableBy: SandboxRecoveryAction }
	| { kind: "active"; mode: SandboxMode; sandboxAvailable: boolean; profileOverrides: number; workspaceRoots: string[] };

export function formatSandboxRuntimeStatus(status: SandboxRuntimeStatus): string {
	switch (status.kind) {
		case "disabled_by_setting":
			return "sandbox: disabled by mekann.json setting (sandbox.enabled=false)";
		case "disabled_by_flag":
			return `sandbox: disabled by ${status.flag}`;
		case "blocked":
			return `sandbox: blocked — ${status.reason}${formatRecovery(status.recoverableBy)}`;
		case "unavailable":
			return `sandbox: unavailable — ${status.reason}${formatRecovery(status.recoverableBy)}`;
		case "active":
			return [
				`sandbox: active (${status.mode} / ${modeLabel(status.mode)})`,
				`sandbox-exec: ${status.sandboxAvailable ? "available" : "not required"}`,
				`profile overrides: ${status.profileOverrides}`,
				`workspace roots: ${status.workspaceRoots.length ? status.workspaceRoots.join(", ") : "(unresolved)"}`,
			].join("\n");
	}
}

export function formatSandboxBlockMessage(status: Extract<SandboxRuntimeStatus, { kind: "blocked" | "unavailable" }>, hint = ""): string {
	return `${formatSandboxRuntimeStatus(status)}${hint}`;
}

function formatRecovery(action: SandboxRecoveryAction): string {
	switch (action) {
		case "none": return "";
		case "request_elevation": return "\nRecovery: request_elevation can be used for a legitimate blocked command.";
		case "restart_with_no_sandbox": return "\nRecovery: restart with --no-sandbox only if you intentionally accept disabling the safety boundary.";
		case "change_mode_or_restart": return "\nRecovery: switch to yolo after approval, or restart with --no-sandbox if you intentionally disable the safety boundary.";
	}
}
