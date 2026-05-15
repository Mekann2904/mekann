/**
 * Approvals — ユーザー承認フロー（UX layer、NOT security boundary）。
 * regex 検出は容易にバイパス可能。実際のセキュリティは Seatbelt sandbox が担当。
 */

import type { SandboxMode } from "./permissions.js";

/** 承認要否の判定結果。 */
export interface ApprovalDecision {
	needsApproval: boolean;
	reason?: string;
}

/** yolo の承認状態。 */
export interface YoloApprovalState {
	yoloApproved: boolean;
	yoloApprovedAt?: Date;
	yoloApprovedReason?: string;
}

/** UX-level dangerous command patterns (NOT security — trivially bypassable). */
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
 * UX-level approval check (NOT security). yolo requires explicit approval.
 */
export function shouldRequestApproval(
	mode: SandboxMode,
	command: string,
	approvalState?: Partial<YoloApprovalState>,
): ApprovalDecision {
	// SECURITY: yolo でも明示承認が必要
	if (mode === "yolo") {
		if (approvalState?.yoloApproved) {
			return { needsApproval: false };
		}
		return {
			needsApproval: true,
			reason: "yolo mode requires explicit user approval before any command can execute",
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

/** yolo 切り替え時の承認メッセージ。 */
export function yoloApprovalMessage(): string {
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
