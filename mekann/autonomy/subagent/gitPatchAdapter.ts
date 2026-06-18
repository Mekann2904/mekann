/**
 * GitPatchAdapter — abstracts git apply/rollback/check operations.
 *
 * Decouples the patch application pipeline from direct execFile calls.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

/** Outcome of a rollback attempt (issue #152 / IC-092). */
export interface RollbackResult {
	/** True when the working tree shows no residual changes on the affected paths. */
	fullyReverted: boolean;
	/** Paths still dirty after the rollback attempt (partial-apply residue). */
	residual: string[];
	/** Which strategy reverted the patch. */
	method: "reverse" | "restore" | "none";
}

export interface GitPatchAdapter {
	/** Dry-run check: throws if the patch would not apply cleanly. */
	check(ref: string): Promise<void>;
	/** Apply the patch to the working tree. */
	apply(ref: string): Promise<void>;
	/**
	 * Reverse-apply (rollback) the patch. Detects partial-apply residue and,
	 * when `paths` is supplied, falls back to `git checkout` to clean up,
	 * reporting any paths that remain dirty (issue #152 / IC-092).
	 */
	rollback(ref: string, paths?: string[]): Promise<RollbackResult>;
}

/** Parse `git status --porcelain` lines into path names. */
function porcelainPaths(stdout: string): string[] {
	return stdout
		.split("\n")
		.map((line) => line.slice(3).trim())
		.filter(Boolean)
		// Drop the "->" rename target half that porcelain emits for renames.
		.map((p) => (p.includes(" -> ") ? p.split(" -> ")[1]! : p));
}

export class ExecFileGitPatchAdapter implements GitPatchAdapter {
	constructor(private readonly cwd: string) {}

	async check(ref: string): Promise<void> {
		await execFile("git", ["apply", "--check", ref], { cwd: this.cwd });
	}

	async apply(ref: string): Promise<void> {
		await execFile("git", ["apply", ref], { cwd: this.cwd });
	}

	async rollback(ref: string, paths: string[] = []): Promise<RollbackResult> {
		// 1. Try a clean reverse-apply. `git apply -R` silently no-ops on an
		//    already-reverted tree but throws on a partial-apply state, so guard
		//    it with `--check` to distinguish the two.
		let reversed = false;
		try {
			await execFile("git", ["apply", "-R", "--check", ref], { cwd: this.cwd });
			await execFile("git", ["apply", "-R", ref], { cwd: this.cwd });
			reversed = true;
		} catch {
			/* partial or already reverted — fall through to residue detection */
		}

		// 2. Detect residual changes on the affected paths. Without `paths` we
		//    cannot scope the check, so we report the reverse outcome only.
		if (paths.length === 0) {
			return { fullyReverted: reversed, residual: [], method: reversed ? "reverse" : "none" };
		}
		const residual = await this.dirtyPaths(paths);
		if (residual.length === 0) {
			return { fullyReverted: true, residual: [], method: reversed ? "reverse" : "none" };
		}

		// 3. Partial-apply residue remains. Best-effort restore the affected
		//    paths from the index/HEAD and report anything still dirty so the
		//    caller can surface it for review instead of silently trusting the
		//    tree (issue #152 / IC-092).
		try {
			await execFile("git", ["checkout", "--", ...paths], { cwd: this.cwd });
		} catch {
			/* restore unavailable or paths untracked — best-effort */
		}
		const afterResidual = await this.dirtyPaths(paths);
		return { fullyReverted: afterResidual.length === 0, residual: afterResidual, method: "restore" };
	}

	private async dirtyPaths(paths: string[]): Promise<string[]> {
		try {
			const { stdout } = await execFile("git", ["status", "--porcelain", "--", ...paths], { cwd: this.cwd });
			return porcelainPaths(stdout);
		} catch {
			// If status itself fails, assume all requested paths may be dirty so
			// the caller is nudged to review rather than trust a silent pass.
			return paths.slice();
		}
	}
}
