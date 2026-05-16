/**
 * autoresearch/runner.ts — コマンド実行と出力の切り詰め。
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseMetricLines } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecksResult {
	/** null = checks not run (no file or benchmark failed) */
	passed: boolean | null;
	timedOut: boolean;
	output: string;
	durationSeconds: number;
}

export interface RunResult {
	command: string;
	exitCode: number | null;
	durationSeconds: number;
	timedOut: boolean;
	passed: boolean;
	output: string;
	parsedMetrics: Record<string, number> | null;
	checks: ChecksResult;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_MAX_LINES = 10;
const OUTPUT_MAX_BYTES = 4 * 1024; // 4KB
const CAPTURE_MAX_BYTES = 1024 * 1024; // 1MB
const CHECKS_OUTPUT_MAX_LINES = 80;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/** 末尾を残して切り詰め。行数 → バイト数の順で適用。 */
export function truncateTail(text: string, maxLines: number, maxBytes: number): string {
	let lines = text.split("\n");
	if (lines.length > maxLines) {
		lines = lines.slice(-maxLines);
	}
	let result = lines.join("\n");
	if (Buffer.byteLength(result, "utf8") > maxBytes) {
		const buf = Buffer.from(result, "utf8");
		const sliced = buf.subarray(buf.length - maxBytes);
		result = sliced.toString("utf8");
		const nlIdx = result.indexOf("\n");
		if (nlIdx >= 0) result = result.slice(nlIdx + 1);
	}
	return result;
}

// ---------------------------------------------------------------------------
// Checks execution
// ---------------------------------------------------------------------------

/**
 * autoresearch.checks.sh を実行する。
 * ファイルが存在しない場合は { passed: null } を返す。
 */
export async function runChecks(
	cwd: string,
	signal?: AbortSignal,
	timeoutSeconds: number = DEFAULT_CHECKS_TIMEOUT_SECONDS,
): Promise<ChecksResult> {
	const checksPath = path.join(cwd, "autoresearch.checks.sh");

	if (!fs.existsSync(checksPath)) {
		return { passed: null, timedOut: false, output: "", durationSeconds: 0 };
	}

	const result = await runCommand(`bash "${checksPath}"`, cwd, timeoutSeconds * 1000, signal);

	const outputLines = result.output.split("\n");
	const tailOutput = outputLines.slice(-CHECKS_OUTPUT_MAX_LINES).join("\n");

	return {
		passed: result.passed,
		timedOut: result.timedOut,
		output: tailOutput,
		durationSeconds: result.durationSeconds,
	};
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/** シェルコマンドを spawn で実行し、結果を返す。 */
export async function runCommand(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<RunResult> {
	return new Promise<RunResult>((resolve) => {
		const t0 = Date.now();
		let resolved = false;
		let timedOut = false;

		const child = spawn("bash", ["-c", command], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: Buffer) => {
			if (Buffer.byteLength(stdout, "utf8") < CAPTURE_MAX_BYTES) {
				stdout += chunk.toString("utf8");
			}
		});

		child.stderr.on("data", (chunk: Buffer) => {
			if (Buffer.byteLength(stderr, "utf8") < CAPTURE_MAX_BYTES) {
				stderr += chunk.toString("utf8");
			}
		});

		const timer = setTimeout(() => {
			timedOut = true;
			try { child.kill("SIGTERM"); } catch { /* already exited */ }
			setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5_000);
		}, timeoutMs);

		const abortHandler = () => {
			try { child.kill("SIGTERM"); } catch {}
		};
		signal?.addEventListener("abort", abortHandler, { once: true });

		function finish(code: number | null) {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", abortHandler);

			const durationSeconds = (Date.now() - t0) / 1000;
			const combined = stdout + (stderr ? "\n" + stderr : "");
			const parsed = parseMetricLines(combined);

			resolve({
				command,
				exitCode: code,
				durationSeconds,
				timedOut,
				passed: code === 0 && !timedOut,
				output: truncateTail(combined, OUTPUT_MAX_LINES, OUTPUT_MAX_BYTES),
				parsedMetrics: Object.keys(parsed).length > 0 ? parsed : null,
				checks: { passed: null, timedOut: false, output: "", durationSeconds: 0 },
			});
		}

		child.on("close", (code) => finish(code));
		child.on("error", (err) => {
			stderr += `\n${err.message}`;
			finish(null);
		});
	});
}
