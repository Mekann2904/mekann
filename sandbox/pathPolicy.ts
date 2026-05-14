/**
 * Path Policy — realpath ベースのパス検証・エスケープ防止。
 *
 * symlink escape を潰すため、SBPL に入れるパスは原則 realpath 済みにする。
 */

import { realpath } from "node:fs/promises";
import { relative, isAbsolute, resolve } from "node:path";

/**
 * 指定パスが root 配下にあることを検証する。
 * symlink 経由の脱出も検出する（realpath で解決後 relative で判定）。
 */
export async function assertPathInsideRoot(
	path: string,
	root: string,
): Promise<void> {
	const realPath = await realpath(path);
	const realRoot = await realpath(root);

	const rel = relative(realRoot, realPath);
	if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
		return;
	}

	throw new Error(`path escapes sandbox root: ${path}`);
}

/**
 * 文字列配列を realpath 済みの絶対パス配列に変換する。
 * 存在しないパスは resolve だけ行い realpath はスキップする。
 */
export async function resolveRealPaths(
	paths: string[],
): Promise<string[]> {
	const results: string[] = [];
	for (const p of paths) {
		const abs = resolve(p);
		try {
			results.push(await realpath(abs));
		} catch {
			// 存在しないパスは resolve 済みの絶対パスをそのまま使用
			results.push(abs);
		}
	}
	return results;
}

/** 保護すべきメタデータディレクトリパターン。 */
const PROTECTED_DIRS = [".git", ".codex", ".agents"];

/**
 * パスが保護対象（.git, .codex, .agents 配下）かどうかを判定する。
 */
export function isProtectedPath(path: string): boolean {
	// パスを正規化して各セグメントをチェック
	const normalized = resolve(path);
	const segments = normalized.split("/").filter(Boolean);

	for (const seg of segments) {
		if (PROTECTED_DIRS.includes(seg)) {
			return true;
		}
	}
	return false;
}

/**
 * Check if a path is an unsafe workspace root (/, $HOME, /Users, /Users/<user>).
 * Returns an error message string if unsafe, null if safe.
 * Shared by validateWorkspaceRoot and macSeatbelt validatePolicy.
 */
export async function checkUnsafeRoot(root: string): Promise<string | null> {
	const resolved = await resolveSafeRealPath(root);

	if (resolved === "/") {
		return "workspace root cannot be /";
	}

	const home = process.env.HOME;
	if (home) {
		const resolvedHome = await resolveSafeRealPath(home);
		if (resolved === resolvedHome) {
			return "workspace root cannot be $HOME — use a project subdirectory";
		}
	}

	if (resolved === "/Users" || resolved.match(/^\/Users\/[^/]+$/)) {
		return "workspace root cannot be /Users or a user home directory — use a project subdirectory";
	}

	return null;
}

/**
 * Workspace root のバリデーション。
 *
 * - `/` を workspace root にできない
 * - `$HOME` 全体を workspace root にできない
 * - 広すぎるパスは警告または拒否する
 */
export async function validateWorkspaceRoot(root: string): Promise<void> {
	const reason = await checkUnsafeRoot(root);
	if (reason) throw new Error(reason);
}

/** realpath を試み、失敗したら resolve の結果を返す。 */
export async function resolveSafeRealPath(p: string): Promise<string> {
	try {
		return await realpath(resolve(p));
	} catch {
		return resolve(p);
	}
}
