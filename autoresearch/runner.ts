/**
 * autoresearch/runner.ts — コマンド実行と出力の切り詰め。
 */

import { spawn, execFileSync } from "node:child_process";
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

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function getGitShortHash(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd,
			encoding: "utf8",
			timeout: 5_000,
		}).trim();
	} catch {
		return "unknown";
	}
}

/** `git add -A && git diff --cached --quiet` を実行し staged diff があれば commit。 */
export function gitAutoCommit(cwd: string, message: string): { committed: boolean; commit?: string; error?: string } {
	try {
		execFileSync("git", ["add", "-A"], { cwd, encoding: "utf8", timeout: 10_000 });

		// staged diff があるか確認
		try {
			execFileSync("git", ["diff", "--cached", "--quiet"], { cwd, encoding: "utf8", timeout: 5_000 });
			return { committed: false }; // 変更なし
		} catch {
			// diff あり → commit
		}

		execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf8", timeout: 10_000 });

		const newHash = getGitShortHash(cwd);
		return { committed: true, commit: newHash };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** 作業ツリーを revert（autoresearch.* は保護）。 */
export function gitAutoRevert(cwd: string): { reverted: boolean; error?: string } {
	try {
		execFileSync(
			"bash",
			[
				"-c",
				"git checkout -- . ':(exclude,glob)**/autoresearch.*' ':(exclude,glob)**/autoresearch.*/**' && " +
				"git clean -fd -e 'autoresearch.*' -e '**/autoresearch.*/**' 2>/dev/null || true",
			],
			{ cwd, encoding: "utf8", timeout: 10_000 },
		);
		return { reverted: true };
	} catch (e) {
		return { reverted: false, error: e instanceof Error ? e.message : String(e) };
	}
}

// ---------------------------------------------------------------------------
// Loop helpers
// ---------------------------------------------------------------------------

export const COMPLETE_MARKER = "<autoresearch>COMPLETE</autoresearch>";

function appendTextFragments(value: unknown, out: string[]): void {
	if (typeof value === "string") {
		out.push(value);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) {
		for (const item of value) appendTextFragments(item, out);
		return;
	}
	const record = value as Record<string, unknown>;
	if (typeof record.text === "string") out.push(record.text);
	if (typeof record.content === "string") out.push(record.content);
	if (Array.isArray(record.content)) appendTextFragments(record.content, out);
	if (Array.isArray(record.messages)) appendTextFragments(record.messages, out);
}

export function hasCompleteMarker(event: unknown): boolean {
	const fragments: string[] = [];
	appendTextFragments(event, fragments);
	return fragments.join("\n").includes(COMPLETE_MARKER);
}

export function loopFollowUpMessage(noProgress: boolean): string {
	const prefix = noProgress
		? "前ターンでは autoresearch_log まで進みませんでした。"
		: "前ターンの実験記録が完了しました。";
	return [
		prefix,
		"Ralph 方式で次のイテレーションを継続してください。",
		"- autoresearch.md と autoresearch.ideas.md（存在する場合）を読み、過去の学びを踏まえる",
		"- 原則として1ターンで1つの具体的な実験だけを行う",
		"- コード変更後は autoresearch_run → autoresearch_log を必ず実行する",
		"- 学んだことを autoresearch.md の Codebase Patterns / 試したこと、または memo に残す",
		`- 有望な実験が尽きた場合だけ ${COMPLETE_MARKER} を返す`,
		"ユーザーに継続確認せず進めてください。",
	].join("\n");
}
