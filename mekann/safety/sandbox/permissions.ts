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
import { relative, isAbsolute, resolve, posix } from "node:path";

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

function mkPolicy(mode: SandboxMode, cwd: string, workspaceRoots: string[], writableRoots: string[], network: boolean, allowHomebrewPaths = false): SandboxPolicy {
	return { mode, cwd, workspaceRoots, writableRoots, network, allowHomebrewPaths: allowHomebrewPaths || undefined };
}

/** read_only ポリシーを生成する。 */
export function readOnlyPolicy(
	cwd: string,
	workspaceRoots: string[] = [],
	allowHomebrewPaths = false,
): SandboxPolicy {
	return mkPolicy("read_only", cwd, workspaceRoots, [], false, allowHomebrewPaths);
}

/** workspace_write ポリシーを生成する。 */
export function workspaceWritePolicy(
	cwd: string,
	workspaceRoots: string[] = [],
	writableRoots: string[] = [],
	network = false,
	allowHomebrewPaths = false,
): SandboxPolicy {
	return mkPolicy("workspace_write", cwd, workspaceRoots, writableRoots, network, allowHomebrewPaths);
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
	{ pattern: /\bgit\s+(?:-C\s+\S+\s+)?config\b(?![^\n;&|]*(?:\s--get\b|\s--get-regexp\b|\s--list\b|\s-l\b))/i, reason: "Git 設定変更" },
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

/**
 * 保護すべきリポジトリメタデータディレクトリ（単一ソース: single source of truth）。
 *
 * SECURITY: 3つの enforcement 表面がすべてこのリストから派生し、整合性を自動保持する:
 *   1. sandbox SBPL deny regex (macSeatbelt) — workspace_write での書き込み deny
 *   2. isProtectedPath() — 絶対パスの任意階層の保護判定
 *   3. safeRepoRelativePath() — repo-relative patch path の検証 (candidate.ts / fingerprint.ts 共有)
 *
 * `.pi` を含むのは、CONTEXT.md の "Context control plane" (.pi/ 配下に subagent-results /
 * ledger / output-gate artifact を置く) を workspace_write による書き換えから守るため。
 * 参考: GitHub issue #80 (C-004 / C-005)。
 */
export const PROTECTED_DIRS: readonly string[] = [".git", ".pi", ".codex", ".agents"];

/** PROTECTED_DIRS から SBPL regex の選択肢文字列を生成する（例: "\\.git|\\.pi|\\.codex|\\.agents"）。 */
export function protectedDirsSbplAlternation(): string {
	return PROTECTED_DIRS.map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

/**
 * repo-relative path を安全に検証する単一ヘルパー。
 * null byte / 絶対パス / ドライブレター / 親ディレクトリ逸脱 / 保護メタデータディレクトリ
 * (.git/.pi/.codex/.agents のトップレベル) を拒否し、正規化された POSIX 相対パスを返す。
 * 不安全な場合は undefined を返す。
 *
 * SECURITY: autoresearch (candidate.ts) と subagent (fingerprint.ts) がこの単一ヘルパーを共有。
 * 保護対象は PROTECTED_DIRS から派生するため、sandbox SBPL regex / isProtectedPath と一致する。
 * 参考: GitHub issue #80 (C-004 — safeRepoRelativePath の複数実装と保護度の不一致)。
 */
export function safeRepoRelativePath(p: string): string | undefined {
	if (!p || p.includes("\0")) return undefined;
	const forwardSlashed = p.replace(/\\/g, "/");
	if (forwardSlashed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) return undefined;
	const normalized = posix.normalize(forwardSlashed);
	if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/") || normalized.includes("/../")) return undefined;
	const firstSegment = normalized.split("/")[0];
	if (firstSegment && PROTECTED_DIRS.includes(firstSegment)) return undefined;
	return normalized;
}

/** パスが保護メタデータディレクトリ (.git/.pi/.codex/.agents) 配下か判定。 */
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
