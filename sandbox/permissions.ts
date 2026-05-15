/** Sandbox Permissions — 権限モデルとデフォルトポリシービルダー。
 * read_only: 読み取りのみ、workspace_write: workspace 内書き込み (.git deny), yolo: sandbox なし (要承認)
 *
 * SandboxMode, parseSandboxMode, modeLabel の実体は policy-core/modes.ts。
 * ここから re-export して既存 import の互換性を保つ。 */

// Re-export from single source of truth
export type { SandboxMode } from "../policy-core/modes.js";
export { parseSandboxMode, modeLabel, SANDBOX_MODES, DEFAULT_SANDBOX_MODE } from "../policy-core/modes.js";
import type { SandboxMode } from "../policy-core/modes.js";
import { realpath } from "node:fs/promises";
import { relative, isAbsolute, resolve } from "node:path";

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

function mkPolicy(mode: SandboxMode, cwd: string, workspaceRoots: string[], writableRoots: string[], network: boolean): SandboxPolicy {
	return { mode, cwd, workspaceRoots, writableRoots, network };
}

/** read_only ポリシーを生成する。 */
export function readOnlyPolicy(
	cwd: string,
	workspaceRoots: string[] = [],
): SandboxPolicy {
	return mkPolicy("read_only", cwd, workspaceRoots, [], false);
}

/** workspace_write ポリシーを生成する。 */
export function workspaceWritePolicy(
	cwd: string,
	workspaceRoots: string[] = [],
	writableRoots: string[] = [],
	network = false,
): SandboxPolicy {
	return mkPolicy("workspace_write", cwd, workspaceRoots, writableRoots, network);
}

/** yolo ポリシーを生成する。 */
export function yoloPolicy(): SandboxPolicy {
	return mkPolicy("yolo", "/", [], [], true);
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
// ─── Path validation (realpath-based escape prevention) ──────────────

/** symlink 逸脱も検出する（realpath + relative）。 */
export async function assertPathInsideRoot(
	path: string,
	root: string,
): Promise<void> {
	const realPath = await realpath(path);
	const realRoot = await realpath(root);
	const rel = relative(realRoot, realPath);
	if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;

	throw new Error(`path escapes sandbox root: ${path}`);
}

/** 文字列配列を realpath 済みの絶対パスに変換。存在しないパスは resolve のみ。 */
export async function resolveRealPaths(
	paths: string[],
): Promise<string[]> {
	const results: string[] = [];
	for (const p of paths) {
		const abs = resolve(p);
		try {
			results.push(await realpath(abs));
		} catch {
			results.push(abs);
		}
	}
	return results;
}

/** 保護すべきメタデータディレクトリパターン。 */
const PROTECTED_DIRS = [".git", ".codex", ".agents"];

/** パスが .git/.codex/.agents 配下か判定。 */
export function isProtectedPath(path: string): boolean {
	const normalized = resolve(path);
	const segments = normalized.split("/").filter(Boolean);
	for (const seg of segments) if (PROTECTED_DIRS.includes(seg)) return true;
	return false;
}

/** unsafe root (/, $HOME, /Users) ならエラーメッセージ、safe なら null。 */
export async function checkUnsafeRoot(root: string): Promise<string | null> {
	const resolved = await resolveSafeRealPath(root);
	if (resolved === "/") return "workspace root cannot be /";
	const home = process.env.HOME;
	if (home) {
		const resolvedHome = await resolveSafeRealPath(home);
		if (resolved === resolvedHome) return "workspace root cannot be $HOME — use a project subdirectory";
	}
	if (resolved === "/Users" || resolved.match(/^\/Users\/[^/]+$/)) return "workspace root cannot be /Users or a user home directory — use a project subdirectory";
	return null;
}

/** Workspace root のバリデーション（/, $HOME, /Users を拒否）。 */
export async function validateWorkspaceRoot(root: string): Promise<void> {
	const reason = await checkUnsafeRoot(root); if (reason) throw new Error(reason);
}

/** realpath を試み、失敗したら resolve の結果を返す。 */
export async function resolveSafeRealPath(p: string): Promise<string> {
	try {
		return await realpath(resolve(p));
	} catch {
		return resolve(p);
	}
}
