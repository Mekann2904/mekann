/**
 * autoresearch/runner.ts — コマンド実行と出力の切り詰め。
 *
 * 長時間・高コストな評価 run も安全に扱える実験コントローラの実行層。
 * - プロセスグループ単位の kill
 * - streaming stdout/stderr 保存
 * - .pi/ の git commit 除外
 */

import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { parseMetricLines } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecksResult {
	/** null = checks not run (no file or benchmark failed) */
	passed: boolean | null;
	timedOut: boolean;
	output: string;
	stdout: string;
	stderr: string;
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
	// --- Long-run benchmark support ---
	stdout: string;
	stderr: string;
	signal: string | null;
	externalRunId: string | null;
	externalArtifactDir: string | null;
	externalSummaryPath: string | null;
	externalViewlogPath: string | null;
	externalMetricsPath: string | null;
	/** Whether streaming log files were written during execution */
	logFilesWritten: boolean;
	/** Non-null if a stream write error occurred (disk full, permission, etc.) */
	streamError: string | null;
}

export interface ExternalInfo {
	externalRunId: string | null;
	externalArtifactDir: string | null;
	externalSummaryPath: string | null;
	externalViewlogPath: string | null;
	externalMetricsPath: string | null;
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
// Secret filtering
// ---------------------------------------------------------------------------

const SECRET_REPLACEMENTS: Array<[RegExp, (...args: string[]) => string]> = [
	[/(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)[\s]*[=:]\s*\S+/gi, (_match, key) => `${key}=***REDACTED***`],
	[/(Authorization\s*:\s*Bearer)\s+\S+/gi, (_match, prefix) => `${prefix} ***REDACTED***`],
];

/** Filter lines that look like they contain secrets. */
export function filterSecrets(text: string): string {
	let result = text;
	for (const [pattern, replace] of SECRET_REPLACEMENTS) {
		result = result.replace(pattern, replace);
	}
	return result;
}

// ---------------------------------------------------------------------------
// External info parsing
// ---------------------------------------------------------------------------

/** Parse RUN_ID / ARTIFACT_DIR / SUMMARY_PATH / VIEWLOG_PATH / METRICS_PATH from stdout. */
export function parseExternalInfo(output: string): ExternalInfo {
	const info: ExternalInfo = {
		externalRunId: null,
		externalArtifactDir: null,
		externalSummaryPath: null,
		externalViewlogPath: null,
		externalMetricsPath: null,
	};

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const match = trimmed.match(
			/^(RUN_ID|ARTIFACT_DIR|SUMMARY_PATH|VIEWLOG_PATH|METRICS_PATH)\s+(.+)$/,
		);
		if (!match) continue;

		const [, key, value] = match;
		switch (key) {
			case "RUN_ID": info.externalRunId = value.trim(); break;
			case "ARTIFACT_DIR": info.externalArtifactDir = value.trim(); break;
			case "SUMMARY_PATH": info.externalSummaryPath = value.trim(); break;
			case "VIEWLOG_PATH": info.externalViewlogPath = value.trim(); break;
			case "METRICS_PATH": info.externalMetricsPath = value.trim(); break;
		}
	}

	return info;
}

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

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * シェルコマンドを spawn で実行し、結果を返す。
 *
 * @param logDir 指定すると stdout.log / stderr.log に streaming 保存する。
 *               プロセスクラッシュ時も部分ログが残る。
 */
export async function runCommand(
	command: string,
	cwd: string,
	timeoutMs: number,
	signal?: AbortSignal,
	logDir?: string,
): Promise<RunResult> {
	return new Promise<RunResult>((resolve) => {
		const t0 = Date.now();
		let resolved = false;
		let timedOut = false;
		let killSignal: string | null = null;

		// Streaming log files — created before spawn so partial logs survive crashes
		let stdoutStream: fs.WriteStream | null = null;
		let stderrStream: fs.WriteStream | null = null;
		let logFilesWritten = false;
		let streamError: string | null = null;

		if (logDir) {
			try {
				if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
				stdoutStream = fs.createWriteStream(path.join(logDir, "stdout.log"), { flags: "w" });
				stderrStream = fs.createWriteStream(path.join(logDir, "stderr.log"), { flags: "w" });
				logFilesWritten = true;
			} catch {
				logFilesWritten = false;
			}
		}

		// P0-3: Handle stream errors (disk full, permission error, etc.)
		if (stdoutStream) {
			stdoutStream.on("error", (e) => {
				streamError = e.message;
				logFilesWritten = false;
			});
		}
		if (stderrStream) {
			stderrStream.on("error", (e) => {
				streamError = e.message;
				logFilesWritten = false;
			});
		}

		// detached: true で新しいプロセスグループを作成。
		// 子プロセスが孫プロセスをspawnしていてもグループ全体をkillできる。
		const child = spawn("bash", ["-c", command], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		});

		let stdout = "";
		let stderr = "";

		// --- Streaming parse state (captures METRIC/RUN_ID/etc even after 1MB) ---
		const sp = {
			metrics: {} as Record<string, number>,
			extRunId: null as string | null,
			extArtifactDir: null as string | null,
			extSummaryPath: null as string | null,
			extViewlogPath: null as string | null,
			extMetricsPath: null as string | null,
			stdoutBuf: "",
			stderrBuf: "",
		};

		function spLine(line: string): void {
			const t = line.trim();
			if (t.startsWith("METRIC ")) {
				const rest = t.slice(7);
				const eq = rest.indexOf("=");
				if (eq >= 0) {
					const n = rest.slice(0, eq).trim();
					const v = Number(rest.slice(eq + 1).trim());
					if (n && !isNaN(v)) sp.metrics[n] = v;
				}
			}
			const m = t.match(/^(RUN_ID|ARTIFACT_DIR|SUMMARY_PATH|VIEWLOG_PATH|METRICS_PATH)\s+(.+)$/);
			if (m) switch (m[1]) {
				case "RUN_ID": sp.extRunId = m[2].trim(); break;
				case "ARTIFACT_DIR": sp.extArtifactDir = m[2].trim(); break;
				case "SUMMARY_PATH": sp.extSummaryPath = m[2].trim(); break;
				case "VIEWLOG_PATH": sp.extViewlogPath = m[2].trim(); break;
				case "METRICS_PATH": sp.extMetricsPath = m[2].trim(); break;
			}
		}

		function spChunk(chunk: string, bufKey: "stdoutBuf" | "stderrBuf"): void {
			sp[bufKey] += chunk;
			const lines = sp[bufKey].split("\n");
			sp[bufKey] = lines.pop() ?? "";
			for (const l of lines) spLine(l);
		}

		child.stdout.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stdout, "utf8") < CAPTURE_MAX_BYTES) {
				stdout += str;
			}
			// Stream to file (filter secrets)
			if (stdoutStream) {
				stdoutStream.write(filterSecrets(str));
			}
			// Streaming parse for metrics/external info
			spChunk(str, "stdoutBuf");
		});

		child.stderr.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stderr, "utf8") < CAPTURE_MAX_BYTES) {
				stderr += str;
			}
			if (stderrStream) {
				stderrStream.write(filterSecrets(str));
			}
			// Streaming parse for metrics (can appear in stderr too)
			spChunk(str, "stderrBuf");
		});

		/** Kill the entire process group (leader + all descendants). */
		function killGroup(sig: string): void {
			killSignal = sig;
			try {
				if (child.pid) process.kill(-child.pid, sig as NodeJS.Signals);
			} catch { /* already exited */ }
		}

		let graceTimer: NodeJS.Timeout | null = null;
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup("SIGTERM");
			// Grace period then SIGKILL
			graceTimer = setTimeout(() => killGroup("SIGKILL"), 5_000);
		}, timeoutMs);

		const abortHandler = () => {
			killGroup("SIGTERM");
		};
		signal?.addEventListener("abort", abortHandler, { once: true });

		function finish(code: number | null, sig: string | null) {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			if (graceTimer) clearTimeout(graceTimer);
			signal?.removeEventListener("abort", abortHandler);

			const durationSeconds = (Date.now() - t0) / 1000;

			// Flush remaining streaming line buffers
			if (sp.stdoutBuf) spLine(sp.stdoutBuf);
			if (sp.stderrBuf) spLine(sp.stderrBuf);

			// Merge: streaming captures everything including >1MB content
			const combined = stdout + (stderr ? "\n" + stderr : "");
			const inMemParsed = parseMetricLines(combined);
			const inMemExt = parseExternalInfo(stdout);
			const parsed = { ...inMemParsed, ...sp.metrics };
			const externalInfo: ExternalInfo = {
				externalRunId: sp.extRunId ?? inMemExt.externalRunId,
				externalArtifactDir: sp.extArtifactDir ?? inMemExt.externalArtifactDir,
				externalSummaryPath: sp.extSummaryPath ?? inMemExt.externalSummaryPath,
				externalViewlogPath: sp.extViewlogPath ?? inMemExt.externalViewlogPath,
				externalMetricsPath: sp.extMetricsPath ?? inMemExt.externalMetricsPath,
			};

			const result: RunResult = {
				command,
				exitCode: code,
				durationSeconds,
				timedOut,
				passed: code === 0 && !timedOut,
				output: truncateTail(combined, OUTPUT_MAX_LINES, OUTPUT_MAX_BYTES),
				parsedMetrics: Object.keys(parsed).length > 0 ? parsed : null,
				checks: { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 },
				stdout,
				stderr,
				signal: sig,
				logFilesWritten,
				streamError,
				...externalInfo,
			};

			// Wait for stream flush before resolving
			const flushes: Promise<void>[] = [];
			if (stdoutStream && !stdoutStream.destroyed) {
				flushes.push(new Promise<void>(r => { stdoutStream!.end(() => r()); }));
			}
			if (stderrStream && !stderrStream.destroyed) {
				flushes.push(new Promise<void>(r => { stderrStream!.end(() => r()); }));
			}

			if (flushes.length > 0) {
				Promise.all(flushes).then(() => resolve(result));
			} else {
				resolve(result);
			}
		}

		child.on("close", (code, sig) => finish(code, sig ?? killSignal));
		child.on("error", (err) => {
			stderr += `\n${err.message}`;
			finish(null, null);
		});
	});
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function getGitShortHash(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "unknown";
	}
}

/** Get the full commit hash. */
export function getGitFullHash(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "unknown";
	}
}

/** Check if the working tree has uncommitted changes. */
export function isGitDirty(cwd: string): boolean {
	try {
		execFileSync("git", ["diff", "--quiet"], { cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
		execFileSync("git", ["diff", "--cached", "--quiet"], { cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
		const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		return untracked.length > 0;
	} catch {
		return true;
	}
}

/** Get list of changed files (staged + unstaged + untracked). */
export function getChangedFiles(cwd: string): string[] {
	try {
		const result = execFileSync(
			"git", ["status", "--porcelain"],
			{ cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] },
		).trim();
		if (!result) return [];
		return result.split("\n").map((line: string) => line.slice(3)).filter(Boolean);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Run ID generation
// ---------------------------------------------------------------------------

/**
 * Generate a time-sortable unique run ID.
 * Format: `<UTC timestamp>-pi-<gitShortSha>-<random6hex>`
 */
export function generatePiRunId(cwd: string): string {
	const now = new Date();
	const ts = now.toISOString().replace(/-/g, "").replace(/:/g, "").replace(/\.(?=\d{3}Z)/, ".");
	const gitSha = getGitShortHash(cwd);
	const random = randomBytes(3).toString("hex");
	return `${ts}-pi-${gitSha}-${random}`;
}

/** @deprecated Use generatePiRunId(cwd) instead. */
export function generateRunId(): string {
	return generatePiRunId(".");
}

// ---------------------------------------------------------------------------
// Artifact directory management
// ---------------------------------------------------------------------------

/** Get the base artifact directory for all autoresearch sessions. */
export function getArtifactBaseDir(cwd: string): string {
	return path.join(cwd, ".pi", "autoresearch");
}

/** Get the run-specific artifact directory. */
export function getRunArtifactDir(cwd: string, sessionId: string, piRunId: string): string {
	return path.join(getArtifactBaseDir(cwd), sessionId, "runs", piRunId);
}

/**
 * Create run artifact directory and write initial files.
 * Throws if the piRunId subdirectory already exists.
 * Returns the directory path.
 */
export function createRunArtifactDir(
	cwd: string,
	sessionId: string,
	piRunId: string,
	command: string,
	startedAt: number,
): string {
	const runDir = getRunArtifactDir(cwd, sessionId, piRunId);

	if (fs.existsSync(runDir)) {
		throw new Error(`Run artifact directory already exists: ${runDir}`);
	}

	// Create parent only (recursive), then runDir exclusively (non-recursive)
	const parentDir = path.dirname(runDir);
	if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
	fs.mkdirSync(runDir, { recursive: false });

	fs.writeFileSync(path.join(runDir, "command.txt"), command, "utf8");

	try {
		const status = execFileSync("git", ["status", "--porcelain"], {
			cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"],
		});
		fs.writeFileSync(path.join(runDir, "git.status.txt"), status, "utf8");
	} catch {
		fs.writeFileSync(path.join(runDir, "git.status.txt"), "(git unavailable)", "utf8");
	}

	try {
		const diffUnstaged = execFileSync("git", ["diff"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
		const diffStaged = execFileSync("git", ["diff", "--cached"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
		fs.writeFileSync(path.join(runDir, "git.diff"), diffUnstaged + (diffStaged ? "\n--- staged ---\n" + diffStaged : ""), "utf8");
	} catch {
		fs.writeFileSync(path.join(runDir, "git.diff"), "(git diff unavailable)", "utf8");
	}

	return runDir;
}

/**
 * Write run result files to the artifact directory.
 * Skips stdout.log/stderr.log if streaming already wrote them (file exists with content).
 */
export function writeRunArtifacts(
	runDir: string,
	result: RunResult,
	piRunId: string,
	startedAt: number,
	completedAt: number,
	runSeq?: number,
): void {
	// stdout.log — skip if streaming already wrote content
	const stdoutPath = path.join(runDir, "stdout.log");
	if (!fs.existsSync(stdoutPath) || fs.statSync(stdoutPath).size === 0) {
		fs.writeFileSync(stdoutPath, filterSecrets(result.stdout), "utf8");
	}

	// stderr.log — skip if streaming already wrote content
	const stderrPath = path.join(runDir, "stderr.log");
	if (!fs.existsSync(stderrPath) || fs.statSync(stderrPath).size === 0) {
		fs.writeFileSync(stderrPath, filterSecrets(result.stderr), "utf8");
	}

	// metrics.json
	fs.writeFileSync(
		path.join(runDir, "metrics.json"),
		JSON.stringify(result.parsedMetrics ?? {}, null, 2),
		"utf8",
	);

	// result.json
	fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify({
		piRunId,
		passed: result.passed,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		durationSeconds: result.durationSeconds,
		parsedMetrics: result.parsedMetrics,
	}, null, 2), "utf8");

	// manifest.json — written LAST. artifactComplete=true means ALL artifact writes succeeded.
	// If this file is missing or artifactComplete !== true, the artifact is incomplete.
	const manifest = {
		artifactComplete: false as boolean, // will be set to true after checks
		piRunId,
		runSeq,
		command: result.command,
		startedAt,
		completedAt,
		durationSeconds: result.durationSeconds,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		signal: result.signal,
		externalRunId: result.externalRunId,
		externalArtifactDir: result.externalArtifactDir,
		externalSummaryPath: result.externalSummaryPath,
		externalViewlogPath: result.externalViewlogPath,
		externalMetricsPath: result.externalMetricsPath,
		parsedMetrics: result.parsedMetrics,
		checks: result.checks,
		logFilesWritten: result.logFilesWritten,
		streamError: result.streamError,
	};
	fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

/** Write checks result to the artifact directory.
 *  Also marks the manifest as artifactComplete=true (all artifacts written). */
export function writeChecksArtifacts(runDir: string, checksResult: ChecksResult): void {
	// Save checks stdout/stderr logs (already filtered)
	if (checksResult.stdout) {
		fs.writeFileSync(path.join(runDir, "checks.stdout.log"), filterSecrets(checksResult.stdout), "utf8");
	}
	if (checksResult.stderr) {
		fs.writeFileSync(path.join(runDir, "checks.stderr.log"), filterSecrets(checksResult.stderr), "utf8");
	}

	const safeChecksResult = {
		...checksResult,
		stdout: filterSecrets(checksResult.stdout ?? ""),
		stderr: filterSecrets(checksResult.stderr ?? ""),
		output: filterSecrets(checksResult.output ?? ""),
	};
	fs.writeFileSync(path.join(runDir, "checks-result.json"), JSON.stringify(safeChecksResult, null, 2), "utf8");

	const manifestPath = path.join(runDir, "manifest.json");
	if (fs.existsSync(manifestPath)) {
		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			manifest.checks = safeChecksResult;
			manifest.artifactComplete =
				manifest.logFilesWritten === true &&
				!manifest.streamError;
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
		} catch { /* best effort */ }
	}
}

/** Mark artifact as complete (called when no checks are needed). */
export function markArtifactComplete(runDir: string): void {
	const manifestPath = path.join(runDir, "manifest.json");
	if (fs.existsSync(manifestPath)) {
		try {
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
			manifest.artifactComplete =
				manifest.logFilesWritten === true &&
				!manifest.streamError;
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
		} catch { /* best effort */ }
	}
}

/**
 * Load run data from artifact manifest.json.
 * Used when runResultMap is empty (e.g. after process restart).
 * Returns null if artifact not found.
 */
export function loadRunFromArtifact(
	cwd: string,
	sessionId: string,
	piRunId: string,
): {
	result: RunResult;
	startedAt: number;
	completedAt: number;
	createdAt: number;
	artifactDir: string;
	runSeq?: number;
} | null {
	const runDir = getRunArtifactDir(cwd, sessionId, piRunId);
	const manifestPath = path.join(runDir, "manifest.json");
	if (!fs.existsSync(manifestPath)) return null;

	try {
		const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

		// Read checks result if available
		let checks: ChecksResult = { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
		const checksPath = path.join(runDir, "checks-result.json");
		if (fs.existsSync(checksPath)) {
			checks = JSON.parse(fs.readFileSync(checksPath, "utf8"));
		}

		// Read metrics
		let parsedMetrics: Record<string, number> | null = null;
		const metricsPath = path.join(runDir, "metrics.json");
		if (fs.existsSync(metricsPath)) {
			const parsed = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
			if (Object.keys(parsed).length > 0) parsedMetrics = parsed;
		}

		const result: RunResult = {
			command: m.command ?? "",
			exitCode: m.exitCode ?? null,
			durationSeconds: m.durationSeconds ?? 0,
			timedOut: m.timedOut ?? false,
			passed: (m.exitCode === 0) && !m.timedOut,
			output: "",
			parsedMetrics,
			checks,
			stdout: "",
			stderr: "",
			signal: m.signal ?? null,
			externalRunId: m.externalRunId ?? null,
			externalArtifactDir: m.externalArtifactDir ?? null,
			externalSummaryPath: m.externalSummaryPath ?? null,
			externalViewlogPath: m.externalViewlogPath ?? null,
			externalMetricsPath: m.externalMetricsPath ?? null,
			logFilesWritten: m.logFilesWritten ?? false,
			streamError: m.streamError ?? null,
		};

		return {
			result,
			startedAt: m.startedAt ?? 0,
			completedAt: m.completedAt ?? 0,
			createdAt: m.startedAt ?? 0,
			artifactDir: runDir,
			runSeq: m.runSeq,
		};
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Auto git operations
// ---------------------------------------------------------------------------

/**
 * `git add -A` (excluding .pi/) → staged diff check → commit.
 * .pi/ は監査用 artifact であり git 管理対象外。
 */
export function gitAutoCommit(cwd: string, message: string): { committed: boolean; commit?: string; error?: string } {
	try {
		// Check if we're in a git repo first. If not, no error — just nothing to commit.
		execFileSync("git", ["rev-parse", "--git-dir"], { cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		return { committed: false };
	}

	try {
		// .pi/ を除外して git add
		execFileSync("bash", ["-c", "git add -A -- . ':(exclude).pi/**'"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });

		try {
			execFileSync("git", ["diff", "--cached", "--quiet"], { cwd, encoding: "utf8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] });
			return { committed: false };
		} catch { /* diff あり → commit */ }

		execFileSync("git", ["commit", "-m", message], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
		return { committed: true, commit: getGitShortHash(cwd) };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** 作業ツリーを revert（autoresearch.* と .pi/ は保護）。 */
export function gitAutoRevert(cwd: string): { reverted: boolean; error?: string } {
	try {
		execFileSync("bash", ["-c",
			"git checkout -- . " +
			":'(exclude,glob)**/autoresearch.*' " +
			":'(exclude,glob)**/autoresearch.*/**' " +
			":'(exclude,glob)**/.pi/**' && " +
			"git clean -fd " +
			"-e 'autoresearch.*' -e '**/autoresearch.*/**' " +
			"-e '.pi' -e '**/.pi/**' " +
			"2>/dev/null || true",
		], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] });
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
	if (typeof value === "string") { out.push(value); return; }
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) { for (const item of value) appendTextFragments(item, out); return; }
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
