/**
 * ValidationRunner — abstracts validation command resolution and execution.
 *
 * Decouples the patch application pipeline from direct execFile calls
 * and validation allowlist logic.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type {
	RequiredCheck,
	StoredSubagentResult,
	ValidationCommand,
	ValidationResult,
} from "./types.js";

const execFile = promisify(execFileCb);

export interface ValidationRunner {
	resolveRequiredChecks(
		required: RequiredCheck[],
		suggested: ValidationCommand[],
	): { ok: true; commands: ValidationCommand[] } | { ok: false; missing: RequiredCheck[] };

	dedupe(commands: ValidationCommand[]): ValidationCommand[];

	isAllowed(cmd: ValidationCommand, stored: StoredSubagentResult): boolean;

	run(cmd: ValidationCommand): Promise<ValidationResult>;
}

export class ExecFileValidationRunner implements ValidationRunner {
	constructor(
		private readonly cwd: string,
		private readonly shellAllowlist: Record<string, string> = {},
	) {}

	resolveRequiredChecks(
		required: RequiredCheck[],
		suggested: ValidationCommand[],
	): { ok: true; commands: ValidationCommand[] } | { ok: false; missing: RequiredCheck[] } {
		const commands: ValidationCommand[] = [];
		const missing: RequiredCheck[] = [];
		for (const check of required) {
			if (check.command) {
				commands.push(check.command);
				continue;
			}
			const byConvention = suggested.find(
				(cmd) => cmd.kind === "npm_script" && cmd.script === check.kind,
			);
			if (byConvention) commands.push(byConvention);
			else missing.push(check);
		}
		return missing.length ? { ok: false, missing } : { ok: true, commands };
	}

	dedupe(commands: ValidationCommand[]): ValidationCommand[] {
		const seen = new Set<string>();
		const out: ValidationCommand[] = [];
		for (const c of commands) {
			const k = commandKey(c);
			if (!seen.has(k)) {
				seen.add(k);
				out.push(c);
			}
		}
		return out;
	}

	isAllowed(cmd: ValidationCommand, stored: StoredSubagentResult): boolean {
		const allowed = stored.authority?.allowed_commands ?? [];
		return allowed.some((a) => commandKey(a) === commandKey(cmd));
	}

	async run(cmd: ValidationCommand): Promise<ValidationResult> {
		try {
			if (cmd.kind === "npm_script") {
				const r = await execFile("npm", ["run", cmd.script, "--", ...(cmd.args ?? [])], {
					cwd: this.cwd,
				});
				return { ok: true, command: cmd, output: `${r.stdout}${r.stderr}` };
			}
			const bin = this.shellAllowlist[cmd.command_id];
			if (!bin) return { ok: false, command: cmd, error: "command_id not configured" };
			const r = await execFile(bin, cmd.args ?? [], { cwd: this.cwd });
			return { ok: true, command: cmd, output: `${r.stdout}${r.stderr}` };
		} catch (err) {
			return {
				ok: false,
				command: cmd,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}

function commandKey(cmd: ValidationCommand): string {
	return cmd.kind === "npm_script"
		? JSON.stringify({ kind: "npm_script", script: cmd.script, args: cmd.args ?? [] })
		: JSON.stringify({
				kind: "shell_allowlisted",
				command_id: cmd.command_id,
				args: cmd.args ?? [],
			});
}
