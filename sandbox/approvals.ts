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
	{ pattern: /\brm\s+-rf\b/i, reason: "再帰的強制削除" },
	{ pattern: /\brm\s+-r\b/i, reason: "再帰的削除" },
	{ pattern: /\bsudo\b/i, reason: "権限昇格" },
	{ pattern: /\bchmod\s+[0-7]{3,4}\b/i, reason: "権限変更" },
	{ pattern: /\bchown\b/i, reason: "所有者変更" },
	{ pattern: /\bshutdown\b/i, reason: "システムシャットダウン" },
	{ pattern: /\breboot\b/i, reason: "システム再起動" },
	{ pattern: /\bmkfs\b/i, reason: "ファイルシステム初期化" },
	{ pattern: /\bdd\s+/i, reason: "RAW ディスク操作" },
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
	if (mode === "yolo") return approvalState?.yoloApproved ? { needsApproval: false } : { needsApproval: true, reason: "yolo モードではコマンドを実行する前にユーザーの明示的な承認が必要です" };

	// 危険パターンのチェック
	for (const { pattern, reason } of DANGEROUS_PATTERNS) if (pattern.test(command)) return { needsApproval: true, reason };

	return { needsApproval: false };
}

/** yolo 切り替え時の承認メッセージ。 */
export function yoloApprovalMessage(): string {
	return "[!]  サンドボックスを完全に無効化しようとしています。\n\nこれによりエージェントは以下の制限なしのアクセスを得ます:\n  • システム上のすべてのファイル（読み取り + 書き込み）\n  • 完全なネットワークアクセス\n  • いかなる制限もないコマンド実行\n\nエージェントの動作を完全に信頼できる場合にのみ使用してください。";
}
