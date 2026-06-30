/**
 * autoresearch/runner/checks.ts — autoresearch.checks.sh 実行。
 *
 * checks スクリプトが存在しない場合は { passed: null } を返し、存在する場合は
 * {@link "./spawn.js"} の runCommand で実行して stdout の末尾を返す。
 * spawn 実行層には依存しない純粋な checks ラッパー。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ChecksResult } from "./types.js";
import { runCommand } from "./spawn.js";

const CHECKS_OUTPUT_MAX_LINES = 80;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;

// ---------------------------------------------------------------------------
// Checks execution
// ---------------------------------------------------------------------------

/** autoresearch.checks.sh を実行する。ファイルが存在しない場合は { passed: null } を返す。 */
export async function runChecks(
	cwd: string,
	signal?: AbortSignal,
	timeoutSeconds: number = DEFAULT_CHECKS_TIMEOUT_SECONDS,
): Promise<ChecksResult> {
	const checksPath = path.join(cwd, "autoresearch.checks.sh");

	if (!fs.existsSync(checksPath)) {
		return { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
	}

	const result = await runCommand(`bash "${checksPath}"`, cwd, timeoutSeconds * 1000, signal);

	const outputLines = result.output.split("\n");
	const tailOutput = outputLines.slice(-CHECKS_OUTPUT_MAX_LINES).join("\n");

	return {
		passed: result.passed,
		timedOut: result.timedOut,
		output: tailOutput,
		stdout: result.stdout,
		stderr: result.stderr,
		durationSeconds: result.durationSeconds,
	};
}
