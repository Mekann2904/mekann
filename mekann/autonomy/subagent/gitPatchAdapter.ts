/**
 * GitPatchAdapter — abstracts git apply/rollback/check operations.
 *
 * Decouples the patch application pipeline from direct execFile calls.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface GitPatchAdapter {
	/** Dry-run check: throws if the patch would not apply cleanly. */
	check(ref: string): Promise<void>;
	/** Apply the patch to the working tree. */
	apply(ref: string): Promise<void>;
	/** Reverse-apply (rollback) the patch. Best-effort. */
	rollback(ref: string): Promise<void>;
}

export class ExecFileGitPatchAdapter implements GitPatchAdapter {
	constructor(private readonly cwd: string) {}

	async check(ref: string): Promise<void> {
		await execFile("git", ["apply", "--check", ref], { cwd: this.cwd });
	}

	async apply(ref: string): Promise<void> {
		await execFile("git", ["apply", ref], { cwd: this.cwd });
	}

	async rollback(ref: string): Promise<void> {
		await execFile("git", ["apply", "-R", ref], { cwd: this.cwd });
	}
}
