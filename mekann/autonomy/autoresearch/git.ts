/**
 * autoresearch/git.ts — Git ユーティリティ関数。
 *
 * contract.ts から抽出。旧・新両方の contract フローから利用される。
 * git repo 判定、working tree 状態、commit hash 取得。
 */

import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Git utilities
// ---------------------------------------------------------------------------

/** git repo かどうかを判定 */
export function isGitRepo(cwd: string): boolean {
	try {
		execFileSync("git", ["rev-parse", "--git-dir"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

/** working tree が clean かどうかを判定 (staged + unstaged + untracked) */
export function isWorkingTreeClean(cwd: string): boolean {
	try {
		const result = execFileSync("git", ["status", "--porcelain"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return result.length === 0;
	} catch {
		return false;
	}
}

/** 現在の HEAD commit hash (full) */
export function getBaselineCommit(cwd: string): string | null {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}
