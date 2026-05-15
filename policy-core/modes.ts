/**
 * Policy Core — Shared Mode Definitions.
 *
 * Single source of truth for sandbox mode types, parsing, labels,
 * plan-mode tool lists, capability profile names, and inter-extension event payloads.
 */

// ─── Capability profiles ──────────────────────────────────────────

/** Well-known capability profile names. */
export type CapabilityProfileName =
	| "plan_read_only"
	| "sandbox_read_only"
	| "workspace_write"
	| "yolo";

// ─── Plan mode tools ──────────────────────────────────────────────

/**
 * Tools available in plan mode.
 * Includes bash for read-only investigation commands;
 * bash intent is filtered by classifyCommandIntent() as a UX guard,
 * and enforced by sandbox's OS-level policy as the security boundary.
 */
export const PLAN_MODE_TOOLS = new Set(["read", "grep", "find", "ls", "bash"]);

// ─── Sandbox modes ────────────────────────────────────────────────

/** The canonical set of sandbox mode names. */
export const SANDBOX_MODES = ["read_only", "workspace_write", "yolo"] as const;

/** Sandbox mode type — the single definition used by both sandbox and plan-mode. */
export type SandboxMode = (typeof SANDBOX_MODES)[number];

/** Default sandbox mode. */
export const DEFAULT_SANDBOX_MODE: SandboxMode = "yolo";

/** Parse a string into a SandboxMode. Returns undefined for invalid values. */
export function parseSandboxMode(value: string): SandboxMode | undefined {
	switch (value) {
		case "read_only":
		case "workspace_write":
		case "yolo":
			return value;
		default:
			return undefined;
	}
}

/** Human-readable label for a sandbox mode. */
export function modeLabel(mode: SandboxMode): string {
	switch (mode) {
		case "read_only":
			return "読み取り専用";
		case "workspace_write":
			return "ワークスペース書き込み可能";
		case "yolo":
			return "yolo";
	}
}

// ─── Inter-extension events ───────────────────────────────────────

/** Event names for plan-mode ↔ sandbox coordination via pi.events. */
export const SANDBOX_PUSH_PROFILE_EVENT = "mekann:sandbox:push-profile";
export const SANDBOX_POP_PROFILE_EVENT = "mekann:sandbox:pop-profile";

/** Payload for pushing a profile override onto the sandbox stack. */
export interface SandboxPushProfileEvent { owner: string; token: string; profile: CapabilityProfileName; }

/** Payload for popping a profile override from the sandbox stack. */
export interface SandboxPopProfileEvent { owner: string; token: string; }

/** Event name for plan-mode → sandbox mode status coordination. */
export const PLAN_MODE_STATUS_EVENT = "mekann:plan-mode:status";

/** Payload for plan-mode status broadcast. */
export interface PlanModeStatusEvent { mode: "main" | "plan"; }
