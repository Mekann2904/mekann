/**
 * Approvals — ユーザー承認フロー。
 *
 * IMPORTANT: The approval layer is a UX convenience, NOT a security boundary.
 * The regex-based command detection below is trivially bypassable.
 * It exists solely to add friction and prompt the user before executing
 * potentially destructive commands. Actual security enforcement is done
 * by the macOS Seatbelt sandbox (macSeatbelt.ts).
 *
 * SECURITY: danger_full_access は「mode である」だけでは承認済みとみなさない。
 * 明示的なユーザー承認 (fullAccessApproved) が必要。
 *
 * Do NOT add more regex patterns expecting comprehensive coverage.
 * This is not and cannot be a complete command filter.
 */

import type { SandboxMode } from "./permissions.js";

/**
 * 承認要否の判定結果。
 */
export interface ApprovalDecision {
	/** 承認が必要かどうか。 */
	needsApproval: boolean;
	/** 承認が必要な理由（UI 表示用）。 */
	reason?: string;
}

/**
 * danger_full_access の承認状態。
 */
export interface FullAccessApprovalState {
	/** ユーザーが明示的に承認したか。 */
	fullAccessApproved: boolean;
	/** 承認日時。 */
	fullAccessApprovedAt?: Date;
	/** 承認理由（UI 操作等の記録）。 */
	fullAccessApprovedReason?: string;
}

/**
 * Dangerous command patterns for UX-level approval prompts.
 *
 * WARNING: These patterns are NOT a security boundary.
 * They are trivially bypassable (e.g. base64 decode, variable expansion).
 * The purpose is purely to add user confirmation friction.
 * Actual command restriction is done by the Seatbelt sandbox.
 */
const DANGEROUS_PATTERNS = [
	{ pattern: /\brm\s+-rf\b/i, reason: "Recursive force delete" },
	{ pattern: /\brm\s+-r\b/i, reason: "Recursive delete" },
	{ pattern: /\bsudo\b/i, reason: "Elevated privileges" },
	{ pattern: /\bchmod\s+[0-7]{3,4}\b/i, reason: "Permission change" },
	{ pattern: /\bchown\b/i, reason: "Ownership change" },
	{ pattern: /\bshutdown\b/i, reason: "System shutdown" },
	{ pattern: /\breboot\b/i, reason: "System reboot" },
	{ pattern: /\bmkfs\b/i, reason: "Filesystem format" },
	{ pattern: /\bdd\s+/i, reason: "Raw disk operation" },
];

/**
 * Determine whether user approval should be requested.
 *
 * IMPORTANT: This is a UX convenience layer, NOT a security boundary.
 * The regex-based detection is trivially bypassable.
 * Approval adds friction; the Seatbelt sandbox provides actual enforcement.
 *
 * SECURITY: danger_full_access requires fullAccessApproved=true regardless.
 * The mode alone does NOT constitute approval.
 *
 * @param mode - 現在の sandbox mode
 * @param command - 実行するコマンド文字列
 * @param approvalState - danger_full_access の承認状態（省略時は未承認扱い）
 */
export function shouldRequestApproval(
	mode: SandboxMode,
	command: string,
	approvalState?: Partial<FullAccessApprovalState>,
): ApprovalDecision {
	// SECURITY: danger_full_access でも明示承認が必要
	if (mode === "danger_full_access") {
		if (approvalState?.fullAccessApproved) {
			return { needsApproval: false };
		}
		return {
			needsApproval: true,
			reason: "danger_full_access mode requires explicit user approval before any command can execute",
		};
	}

	// 危険パターンのチェック
	for (const { pattern, reason } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) {
			return { needsApproval: true, reason };
		}
	}

	return { needsApproval: false };
}

/**
 * danger_full_access への切り替えに必要な承認メッセージを生成する。
 */
export function fullAccessApprovalMessage(): string {
	return [
		"⚠️  You are about to disable sandboxing entirely.",
		"",
		"This grants the agent unrestricted access to:",
		"  • All files on your system (read + write)",
		"  • Full network access",
		"  • Any command without restrictions",
		"",
		"This should only be used when you fully trust the agent's behavior.",
	].join("\n");
}
