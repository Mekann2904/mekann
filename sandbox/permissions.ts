/** Sandbox Permissions — 権限モデルとデフォルトポリシービルダー。
 * read_only: 読み取りのみ、workspace_write: workspace 内書き込み (.git deny), yolo: sandbox なし (要承認)
 *
 * SandboxMode, parseSandboxMode, modeLabel の実体は policy-core/modes.ts。
 * ここから re-export して既存 import の互換性を保つ。 */

// Re-export from single source of truth
export type { SandboxMode } from "../policy-core/modes.js";
export { parseSandboxMode, modeLabel, SANDBOX_MODES, DEFAULT_SANDBOX_MODE } from "../policy-core/modes.js";
import type { SandboxMode } from "../policy-core/modes.js";

export interface SandboxPolicy {
	mode: SandboxMode;
	cwd: string;
	workspaceRoots: string[];
	writableRoots: string[];
	network: boolean;
	allowHomebrewPaths?: boolean;
	_isolatedTempDir?: string;
	_resolvedGitdirs?: string[];
}

/** read_only ポリシーを生成する。 */
export function readOnlyPolicy(
	cwd: string,
	workspaceRoots: string[] = [],
): SandboxPolicy {
	return {
		mode: "read_only",
		cwd,
		workspaceRoots,
		writableRoots: [],
		network: false,
	};
}

/** workspace_write ポリシーを生成する。 */
export function workspaceWritePolicy(
	cwd: string,
	workspaceRoots: string[] = [],
	writableRoots: string[] = [],
	network = false,
): SandboxPolicy {
	return {
		mode: "workspace_write",
		cwd,
		workspaceRoots,
		writableRoots,
		network,
	};
}

/** yolo ポリシーを生成する。 */
export function yoloPolicy(): SandboxPolicy {
	return {
		mode: "yolo",
		cwd: "/",
		workspaceRoots: [],
		writableRoots: [],
		network: true,
	};
}

// ─── Approval logic (UX layer, NOT security boundary) ───────────────

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

/** 承認要否の判定結果。 */
export interface ApprovalDecision { needsApproval: boolean; reason?: string; }

/** yolo の承認状態。 */
export interface YoloApprovalState { yoloApproved: boolean; yoloApprovedAt?: Date; yoloApprovedReason?: string; }

/** UX-level approval check (NOT security). */
export function shouldRequestApproval(mode: SandboxMode, command: string, approvalState?: Partial<YoloApprovalState>): ApprovalDecision {
	if (mode === "yolo") return approvalState?.yoloApproved ? { needsApproval: false } : { needsApproval: true, reason: "yolo モードではコマンドを実行する前にユーザーの明示的な承認が必要です" };
	for (const { pattern, reason } of DANGEROUS_PATTERNS) if (pattern.test(command)) return { needsApproval: true, reason };
	return { needsApproval: false };
}

/** yolo 切り替え時の承認メッセージ。 */
export function yoloApprovalMessage(): string {
	return "[!]  サンドボックスを完全に無効化しようとしています。\n\nこれによりエージェントは以下の制限なしのアクセスを得ます:\n  • システム上のすべてのファイル（読み取り + 書き込み）\n  • 完全なネットワークアクセス\n  • いかなる制限もないコマンド実行\n\nエージェントの動作を完全に信頼できる場合にのみ使用してください。";
}