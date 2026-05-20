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
/**
 * Policy Core — Command Intent Classification.
 *
 * This module is a UX filter, NOT a security boundary.
 * The actual enforcement is performed by the sandbox extension's
 * OS-level Seatbelt policy. These heuristics provide early UX feedback
 * in plan mode (and other read-only workflows) before a command reaches
 * the sandbox layer.
 */

// ─── Pattern definitions ──────────────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
	/\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|chgrp|ln|tee|truncate|dd|shred)\b/i,
	/(^|[^<])(?:>>|>(?!>))/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish|audit\b.*(?:\bfix\b|--fix\b))/i,
	/\b(yarn|pnpm)\s+(add|remove|install|publish)/i,
	/\b(pip|brew)\s+(install|uninstall|upgrade)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bgit\s+diff\b.*--output\b/i,
	/\bfind\b.*\s+(?:-delete|-exec\b|-execdir\b|-ok\b|-fls\b|-fprint\b|-fprint0\b|-fprintf)\b/i,
	/\bsed\b.*-i\b/i,
	/\b(sudo|su|kill|pkill|killall)\b/i,
	/\b(reboot|shutdown)\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
];
const SAFE_PATTERNS = [
	/^\s*(cat|head|tail|less|more|grep|ls|pwd|echo|printf|wc|sort|uniq|diff|file|stat|du|df|tree|which|whereis|type|env|printenv|uname|whoami|id|date|cal|uptime|ps|top|htop|free)\b/,
	/^\s*find\b(?!.*\b(?:-delete|-exec|-execdir|-ok|-fls|-fprint|-fprintf)\b)/i,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get|ls-\S+|submodule\s+(?:status|summary))/i,
	/^\s*(npm|yarn)\s+(list|ls|view|info|search|outdated|audit|why)/i,
	/^\s*(node|python)\s+--version/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*(jq|awk|rg|fd|bat|eza)\b/,
	/^\s*sed\s+-n/i,
];
const SHELL_META_PATTERNS = [
	/&&|\|\|/,
	/[;|`]/,
	/\$\(/,
	/<\(/,
	/(^|[^&])&([^&]|$)/,
	/[\r\n]/,
];

const SAFE_REDIRECT_PATTERN = /\s*2>\/dev\/null\b|\s*2>&1\b|\s*>\/dev\/null\b/g;

// ─── Types ────────────────────────────────────────────────────────

/** Classification result for a command's intent. */
export type CommandIntentKind =
	| "plan_read_only"   // Read-only command suitable for plan mode
	| "destructive"      // Matches a known destructive pattern
	| "shell_meta"       // Contains shell metacharacters (pipes, chains, etc.)
	| "unknown"          // Does not match any known safe pattern
	| "empty";           // Empty or whitespace-only string

/** Structured result of command intent classification. */
export interface CommandIntent {
	/** Whether this command is allowed in plan read-only mode. */
	allowedInPlanReadOnly: boolean;
	/** The classified intent kind. */
	kind: CommandIntentKind;
	/** Human-readable reason for the classification. */
	reason: string;
}

// ─── Classification functions ─────────────────────────────────────

/**
 * Classify a shell command's intent.
 *
 * This is a UX filter for plan-mode workflows, NOT a security boundary.
 * Security enforcement is handled by the sandbox extension's OS-level policy.
 */
export function classifyCommandIntent(command: string): CommandIntent {
	const stripped = command.trim();
	if (!stripped) return { allowedInPlanReadOnly: false, kind: "empty", reason: "空のコマンドです" };
	const cleaned = stripped.replace(SAFE_REDIRECT_PATTERN, "");
	if (SHELL_META_PATTERNS.some((p) => p.test(cleaned))) return { allowedInPlanReadOnly: false, kind: "shell_meta", reason: "シェルメタ文字を含みます（パイプ・チェーン・コマンド置換・リダイレクト等）" };
	if (DESTRUCTIVE_PATTERNS.some((p) => p.test(cleaned))) return { allowedInPlanReadOnly: false, kind: "destructive", reason: "破壊的または変更を伴うコマンドパターンに一致します" };
	if (SAFE_PATTERNS.some((p) => p.test(cleaned))) return { allowedInPlanReadOnly: true, kind: "plan_read_only", reason: "読み取り専用コマンド" };
	return { allowedInPlanReadOnly: false, kind: "unknown", reason: "既知の安全なコマンドパターンに一致しません" };
}

/**
 * Quick boolean check: is this command allowed in plan read-only mode?
 *
 * Convenience wrapper around classifyCommandIntent().
 * This is a UX guard, NOT a security boundary.
 */
export function isPlanReadOnlyCommandIntent(command: string): boolean {
	return classifyCommandIntent(command).allowedInPlanReadOnly;
}

/**
 * @deprecated Use isPlanReadOnlyCommandIntent() instead.
 * This alias exists for backward compatibility during migration.
 */
export function isSafeCommand(command: string): boolean {
	return isPlanReadOnlyCommandIntent(command);
}
