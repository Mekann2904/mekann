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
 * writableRoots のバリデーション。
 *
 * - 各 writableRoot が workspaceRoots 配下にあることを確認
 * - symlink 経由の脱出も検出する
 * - danger_full_access 以外で / や $HOME 全体を writable にできない
 */
export async function validateWritableRoots(
	writableRoots: string[],
	workspaceRoots: string[],
	mode: string,
): Promise<void> {
	if (mode === "danger_full_access") return;

	const resolvedWorkspaceRoots = await resolveRealPaths(workspaceRoots);

	for (const wr of writableRoots) {
		const resolvedWr = await resolveSafe(wr);

		// / や $HOME 全体は不可
		if (resolvedWr === "/") {
			throw new Error("writable root cannot be /");
		}
		const home = process.env.HOME;
		if (home) {
			const resolvedHome = await resolveSafe(home);
			if (resolvedWr === resolvedHome) {
				throw new Error("writable root cannot be $HOME");
			}
		}

		// workspaceRoots 配下かチェック
		const isInside = resolvedWorkspaceRoots.some((root) => {
			const rel = relative(root, resolvedWr);
			return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
		});

		if (!isInside) {
			throw new Error(
				`writable root "${wr}" (resolved: "${resolvedWr}") is outside workspace roots`,
			);
		}
	}
}

/**
 * Workspace root のバリデーション。
 *
 * - `/` を workspace root にできない
 * - `$HOME` 全体を workspace root にできない
 * - 広すぎるパスは警告または拒否する
 */
export async function validateWorkspaceRoot(root: string): Promise<void> {
	const resolved = await resolveSafe(root);

	if (resolved === "/") {
		throw new Error("workspace root cannot be /");
	}

	const home = process.env.HOME;
	if (home) {
		const resolvedHome = await resolveSafe(home);
		if (resolved === resolvedHome) {
			throw new Error("workspace root cannot be $HOME — use a project subdirectory");
		}
	}

	// Reject /Users or /Users/<user> as too broad
	if (resolved === "/Users" || resolved.match(/^\/Users\/[^/]+$/)) {
		throw new Error(
			"workspace root cannot be /Users or a user home directory — use a project subdirectory",
		);
	}
}

/** realpath を試み、失敗したら resolve の結果を返す。 */
async function resolveSafe(p: string): Promise<string> {
	try {
		return await realpath(resolve(p));
	} catch {
		return resolve(p);
	}
}
