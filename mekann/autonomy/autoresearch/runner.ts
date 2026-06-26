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
import { truncateTail as truncateTailShared } from "../../utils/truncate-utils/index.js";
import { redactSecrets } from "../../context/tool-output/redact.js";
import {
	createStreamingParseState,
	finalizeParsedRunOutput,
	parseExternalInfo,
	parseStreamingChunk,
} from "./runOutputParser.js";
export { parseExternalInfo, type ExternalInfo } from "./runOutputParser.js";
import { writeFileAtomicSync } from "./layout.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** execFileSync wrapper for git commands with standard options. */
function gitExecSync(args: string[], cwd: string, timeout = 5_000): string {
	return execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

/** execFileSync wrapper for git commands that only checks exit code. */
function gitCheckSync(args: string[], cwd: string, timeout = 5_000): void {
	execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Safety threshold for {@link gitAutoCommit} (issue #39).
 *
 * Maximum number of tracked files a single auto-commit may delete before the safety
 * guard refuses. Legitimate autoresearch candidate patches touch a handful of files;
 * the catastrophic pollution commit observed in issue #39 deleted 642 files. The
 * threshold sits well above any reasonable candidate patch and well below that.
 */
const GIT_AUTOCOMMIT_MAX_DELETIONS = 50;

/** Count currently-staged deleted files (diff-filter=D on the cached diff). */
function countStagedDeletions(cwd: string): number {
	const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=D"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
	return out.split("\n").filter(Boolean).length;
}

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

// ---------------------------------------------------------------------------
// Artifact manifest schema
// ---------------------------------------------------------------------------

/**
 * Checks summary stored in the run manifest. Metadata only — NEVER contains
 * log bodies (stdout/stderr/output). Those live in checks-result.json plus
 * checks.stdout.log / checks.stderr.log.
 */
export interface RunManifestChecks {
	/** null = checks not run */
	passed: boolean | null;
	timedOut: boolean;
	durationSeconds: number;
	/** Whether checks.stdout.log / checks.stderr.log were written. */
	logFilesWritten: boolean;
}

/**
 * Safe artifact manifest schema.
 *
 * DESIGN: small, explicit metadata only. The full run/checks log bodies
 * (stdout, stderr, output, parsedMetrics) live in their own files
 * (stdout.log, stderr.log, metrics.json, checks-result.json, ...) and MUST
 * NOT be stored here — otherwise large or secret-containing text would be
 * duplicated into the manifest, blurring the boundary between artifact
 * metadata and run output.
 *
 * The narrow, explicit field list (deliberately no `...result` spread) makes
 * it hard to accidentally reintroduce body leakage. Add new metadata fields
 * here BY NAME rather than spreading a RunResult.
 */
export interface RunManifest {
	/** Schema version for forward-compatible reads. */
	schemaVersion: 1;
	/** Run identity */
	piRunId: string;
	runSeq?: number;
	command: string;
	/** Timing in epoch milliseconds. */
	startedAt: number;
	completedAt: number;
	durationSeconds: number;
	/** Run status. `passed` is derivable: exitCode===0 && !timedOut. */
	exitCode: number | null;
	timedOut: boolean;
	signal: string | null;
	/** artifactComplete=true means ALL artifact writes succeeded. */
	artifactComplete: boolean;
	/** Whether streaming stdout.log/stderr.log were written during the run. */
	logFilesWritten: boolean;
	/** Non-null if a stream write error occurred. */
	streamError: string | null;
	/** Size of stdout.log/stderr.log in bytes (audit metadata; no body). */
	stdoutLogSize: number;
	stderrLogSize: number;
	/** External artifact references (CI run id, artifact dirs, report paths). */
	externalRunId: string | null;
	externalArtifactDir: string | null;
	externalSummaryPath: string | null;
	externalViewlogPath: string | null;
	externalMetricsPath: string | null;
	/** Checks summary (metadata only). Present after writeChecksArtifacts. */
	checks?: RunManifestChecks;
}


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTPUT_MAX_LINES = 10;
const OUTPUT_MAX_BYTES = 4 * 1024; // 4KB
const CAPTURE_MAX_BYTES = 1024 * 1024; // 1MB
const CHECKS_OUTPUT_MAX_LINES = 80;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;
const GIT_SHORT_HASH_CACHE_MS = 1_000;
const gitShortHashCache = new Map<string, { value: string; expiresAt: number }>();

// ---------------------------------------------------------------------------
// Truncation
// ---------------------------------------------------------------------------

/** 末尾を残して切り詰め。行数 → バイト数の順で適用。 */
export function truncateTail(text: string, maxLines: number, maxBytes: number): string {
	return truncateTailShared(text, { maxLines, maxBytes }).content;
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
// Shared spawn helpers (extracted from runCommand / runArgvCommand)
// ---------------------------------------------------------------------------

interface SpawnParams {
	spawnArgs: Parameters<typeof spawn>;
	commandLabel: string;
}

/** Setup streaming log files for stdout/stderr. Returns nulls when logDir is unset. */
interface LogStreamState {
	stdoutStream: fs.WriteStream | null;
	stderrStream: fs.WriteStream | null;
	logFilesWritten: boolean;
	streamError: string | null;
}

function setupLogStreams(logDir: string | undefined): LogStreamState {
	const state: LogStreamState = {
		stdoutStream: null,
		stderrStream: null,
		logFilesWritten: false,
		streamError: null,
	};

	if (logDir) {
		try {
			if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
			state.stdoutStream = fs.createWriteStream(path.join(logDir, "stdout.log"), { flags: "w" });
			state.stderrStream = fs.createWriteStream(path.join(logDir, "stderr.log"), { flags: "w" });
			state.logFilesWritten = true;
		} catch (error) {
			state.logFilesWritten = false;
			state.streamError = error instanceof Error ? error.message : String(error);
		}
	}

	const markStreamError = (error: Error) => {
		state.streamError = error.message;
		state.logFilesWritten = false;
	};
	state.stdoutStream?.on("error", markStreamError);
	state.stderrStream?.on("error", markStreamError);

	return state;
}

/** Shared spawn execution used by both runCommand and runArgvCommand. */
function runSpawn(params: SpawnParams, timeoutMs: number, signal: AbortSignal | undefined, logDir: string | undefined): Promise<RunResult> {
	return new Promise<RunResult>((resolve) => {
		const t0 = Date.now();
		let resolved = false;
		let timedOut = false;
		let killSignal: string | null = null;

		const logStreams = setupLogStreams(logDir);
		const child = spawn(...params.spawnArgs);

		let stdout = "";
		let stderr = "";
		const sp = createStreamingParseState();

		child.stdout!.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stdout, "utf8") < CAPTURE_MAX_BYTES) stdout += str;
			if (logStreams.stdoutStream) logStreams.stdoutStream.write(redactSecrets(str).text);
			parseStreamingChunk(sp, str, "stdoutBuf");
		});

		child.stderr!.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stderr, "utf8") < CAPTURE_MAX_BYTES) stderr += str;
			if (logStreams.stderrStream) logStreams.stderrStream.write(redactSecrets(str).text);
			parseStreamingChunk(sp, str, "stderrBuf");
		});

		function killGroup(sig: string): void {
			killSignal = sig;
			try { if (child.pid) process.kill(-child.pid, sig as NodeJS.Signals); } catch { /* already exited */ }
		}

		let graceTimer: NodeJS.Timeout | null = null;
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup("SIGTERM");
			graceTimer = setTimeout(() => killGroup("SIGKILL"), 5_000);
		}, timeoutMs);

		const abortHandler = () => killGroup("SIGTERM");
		signal?.addEventListener("abort", abortHandler, { once: true });

		function finish(code: number | null, sig: string | null) {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			if (graceTimer) clearTimeout(graceTimer);
			signal?.removeEventListener("abort", abortHandler);

			const durationSeconds = (Date.now() - t0) / 1000;
			const combined = stdout + (stderr ? "\n" + stderr : "");
			const { parsedMetrics: parsed, externalInfo } = finalizeParsedRunOutput(sp, stdout, stderr);

			const result: RunResult = {
				command: params.commandLabel,
				exitCode: code, durationSeconds, timedOut,
				passed: code === 0 && !timedOut,
				output: truncateTail(combined, OUTPUT_MAX_LINES, OUTPUT_MAX_BYTES),
				parsedMetrics: Object.keys(parsed).length > 0 ? parsed : null,
				checks: { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 },
				stdout, stderr, signal: sig, logFilesWritten: logStreams.logFilesWritten, streamError: logStreams.streamError,
				...externalInfo,
			};

			const flushes: Promise<void>[] = [];
			if (logStreams.stdoutStream && !logStreams.stdoutStream.destroyed) {
				flushes.push(new Promise<void>(r => { logStreams.stdoutStream!.end(() => r()); }));
			}
			if (logStreams.stderrStream && !logStreams.stderrStream.destroyed) {
				flushes.push(new Promise<void>(r => { logStreams.stderrStream!.end(() => r()); }));
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
	return runSpawn(
		{
			spawnArgs: ["bash", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"], detached: true }],
			commandLabel: command,
		},
		timeoutMs,
		signal,
		logDir,
	);
}

// ---------------------------------------------------------------------------
// Argv-based command execution (contract mode)
// ---------------------------------------------------------------------------

export interface ArgvCommand {
	argv: string[];
	cwd: string;
	env?: {
		allow?: string[];
		set?: Record<string, string>;
	};
}

/**
 * Execute a command using argv array (no shell interpolation).
 * Uses spawn(file, args, { cwd, env }) directly.
 */
export async function runArgvCommand(
	cmd: ArgvCommand,
	timeoutMs: number,
	signal?: AbortSignal,
	logDir?: string,
): Promise<RunResult> {
	// Build env: if allow list specified, start empty; otherwise inherit process.env
	const spawnEnv: Record<string, string | undefined> = cmd.env?.allow
		? {}
		: { ...process.env };
	if (cmd.env?.allow) {
		for (const key of cmd.env.allow) {
			if (process.env[key] !== undefined) spawnEnv[key] = process.env[key];
		}
	}
	if (cmd.env?.set) {
		Object.assign(spawnEnv, cmd.env.set);
	}

	return runSpawn(
		{
			spawnArgs: [cmd.argv[0], cmd.argv.slice(1), { cwd: cmd.cwd, env: spawnEnv, stdio: ["ignore", "pipe", "pipe"], detached: true }],
			commandLabel: cmd.argv.join(" "),
		},
		timeoutMs,
		signal,
		logDir,
	);
}


// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

export function getGitShortHash(cwd: string): string {
	const key = path.resolve(cwd);
	const cached = gitShortHashCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	let value = "unknown";
	try {
		value = gitExecSync(["rev-parse", "--short", "HEAD"], cwd).trim();
	} catch {
		value = "unknown";
	}
	gitShortHashCache.set(key, { value, expiresAt: Date.now() + GIT_SHORT_HASH_CACHE_MS });
	return value;
}

/** Get the full commit hash. */
export function getGitFullHash(cwd: string): string {
	try {
		return gitExecSync(["rev-parse", "HEAD"], cwd).trim();
	} catch {
		return "unknown";
	}
}

/** Check if the working tree has uncommitted changes. */
export function isGitDirty(cwd: string): boolean {
	try {
		gitCheckSync(["diff", "--quiet"], cwd);
		gitCheckSync(["diff", "--cached", "--quiet"], cwd);
		const untracked = gitExecSync(["ls-files", "--others", "--exclude-standard"], cwd).trim();
		return untracked.length > 0;
	} catch {
		return true;
	}
}

/** Get list of changed files (staged + unstaged + untracked). */
export function getChangedFiles(cwd: string): string[] {
	try {
		const result = gitExecSync(["status", "--porcelain"], cwd).trim();
		if (!result) return [];
		return result.split("\n").map((line: string) => {
			const file = line.length >= 3 && line[2] === " " ? line.slice(3) : line.slice(2).trimStart();
			return file.includes(" -> ") ? file.split(" -> ").pop()! : file;
		}).filter(Boolean);
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

/** Best-effort file size in bytes; 0 if missing or unreadable. */
function fileSize(filePath: string): number {
	try {
		return fs.statSync(filePath).size;
	} catch {
		return 0;
	}
}

/** Normalize a parsed checks object (legacy full body OR new summary) into a summary. */
function normalizeChecksSummary(raw: unknown): RunManifestChecks | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const c = raw as Record<string, unknown>;
	const logFilesWritten =
		typeof c.logFilesWritten === "boolean"
			? c.logFilesWritten
			: (typeof c.stdout === "string" && c.stdout.length > 0) ||
			  (typeof c.stderr === "string" && c.stderr.length > 0);
	return {
		passed: typeof c.passed === "boolean" || c.passed === null ? (c.passed as boolean | null) : null,
		timedOut: typeof c.timedOut === "boolean" ? c.timedOut : false,
		durationSeconds: typeof c.durationSeconds === "number" ? c.durationSeconds : 0,
		logFilesWritten,
	};
}

function normalizeParsedMetrics(raw: unknown): Record<string, number> | null {
	if (!raw || typeof raw !== "object") return null;
	const entries = Object.entries(raw as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === "number");
	return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/**
 * Coerce an arbitrary parsed manifest (possibly from the legacy `...result`
 * layout) into a clean RunManifest, DROPPING any body fields
 * (stdout/stderr/output/parsedMetrics). This guarantees that re-writes never
 * persist leaked bodies, even when upgrading an old artifact in place.
 */
function normalizeManifest(raw: unknown): RunManifest {
	const m = (raw ?? {}) as Record<string, unknown>;
	return {
		schemaVersion: 1,
		piRunId: typeof m.piRunId === "string" ? m.piRunId : "",
		runSeq: typeof m.runSeq === "number" ? m.runSeq : undefined,
		command: typeof m.command === "string" ? m.command : "",
		startedAt: typeof m.startedAt === "number" ? m.startedAt : 0,
		completedAt: typeof m.completedAt === "number" ? m.completedAt : 0,
		durationSeconds: typeof m.durationSeconds === "number" ? m.durationSeconds : 0,
		exitCode: typeof m.exitCode === "number" ? m.exitCode : null,
		timedOut: typeof m.timedOut === "boolean" ? m.timedOut : false,
		signal: typeof m.signal === "string" ? m.signal : null,
		artifactComplete: typeof m.artifactComplete === "boolean" ? m.artifactComplete : false,
		logFilesWritten: typeof m.logFilesWritten === "boolean" ? m.logFilesWritten : false,
		streamError: typeof m.streamError === "string" ? m.streamError : null,
		stdoutLogSize: typeof m.stdoutLogSize === "number" ? m.stdoutLogSize : 0,
		stderrLogSize: typeof m.stderrLogSize === "number" ? m.stderrLogSize : 0,
		externalRunId: typeof m.externalRunId === "string" ? m.externalRunId : null,
		externalArtifactDir: typeof m.externalArtifactDir === "string" ? m.externalArtifactDir : null,
		externalSummaryPath: typeof m.externalSummaryPath === "string" ? m.externalSummaryPath : null,
		externalViewlogPath: typeof m.externalViewlogPath === "string" ? m.externalViewlogPath : null,
		externalMetricsPath: typeof m.externalMetricsPath === "string" ? m.externalMetricsPath : null,
		checks: normalizeChecksSummary(m.checks),
	};
}

/** Read + normalize an existing manifest. Returns null if missing or unparseable. */
function readManifest(runDir: string): RunManifest | null {
	const manifestPath = path.join(runDir, "manifest.json");
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return normalizeManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
	} catch {
		return null;
	}
}

/**
 * Persist a manifest, refreshing stdout/stderr log sizes from disk first.
 * Log bodies are never written here — only sizes.
 */
function writeManifest(runDir: string, manifest: RunManifest): void {
	manifest.stdoutLogSize = fileSize(path.join(runDir, "stdout.log"));
	manifest.stderrLogSize = fileSize(path.join(runDir, "stderr.log"));
	writeFileAtomicSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

/**
 * Build a fresh RunManifest from a RunResult. Only metadata fields are mapped
 * BY NAME — no `...result` spread, so stdout/stderr/output/parsedMetrics
 * cannot leak in.
 */
function buildRunManifest(
	result: RunResult,
	piRunId: string,
	startedAt: number,
	completedAt: number,
	runSeq: number | undefined,
): RunManifest {
	return {
		schemaVersion: 1,
		piRunId,
		runSeq,
		command: result.command,
		startedAt,
		completedAt,
		durationSeconds: result.durationSeconds,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		signal: result.signal,
		artifactComplete: false,
		logFilesWritten: result.logFilesWritten,
		streamError: result.streamError,
		stdoutLogSize: 0, // refreshed by writeManifest
		stderrLogSize: 0,
		externalRunId: result.externalRunId,
		externalArtifactDir: result.externalArtifactDir,
		externalSummaryPath: result.externalSummaryPath,
		externalViewlogPath: result.externalViewlogPath,
		externalMetricsPath: result.externalMetricsPath,
	};
}

/** Get the base artifact directory for all autoresearch sessions. */
function getArtifactBaseDir(cwd: string): string {
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

	writeFileAtomicSync(path.join(runDir, "command.txt"), command, "utf8");

	try {
		const status = gitExecSync(["status", "--porcelain"], cwd);
		writeFileAtomicSync(path.join(runDir, "git.status.txt"), status, "utf8");
	} catch {
		writeFileAtomicSync(path.join(runDir, "git.status.txt"), "(git unavailable)", "utf8");
	}

	try {
		const diffUnstaged = gitExecSync(["diff"], cwd, 10_000);
		const diffStaged = gitExecSync(["diff", "--cached"], cwd, 10_000);
		writeFileAtomicSync(path.join(runDir, "git.diff"), diffUnstaged + (diffStaged ? "\n--- staged ---\n" + diffStaged : ""), "utf8");
	} catch {
		writeFileAtomicSync(path.join(runDir, "git.diff"), "(git diff unavailable)", "utf8");
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
		writeFileAtomicSync(stdoutPath, redactSecrets(result.stdout).text, "utf8");
	}

	// stderr.log — skip if streaming already wrote content
	const stderrPath = path.join(runDir, "stderr.log");
	if (!fs.existsSync(stderrPath) || fs.statSync(stderrPath).size === 0) {
		writeFileAtomicSync(stderrPath, redactSecrets(result.stderr).text, "utf8");
	}

	// metrics.json
	writeFileAtomicSync(
		path.join(runDir, "metrics.json"),
		JSON.stringify(result.parsedMetrics ?? {}, null, 2),
		"utf8",
	);

	// result.json
	writeFileAtomicSync(path.join(runDir, "result.json"), JSON.stringify({
		piRunId,
		passed: result.passed,
		exitCode: result.exitCode,
		timedOut: result.timedOut,
		durationSeconds: result.durationSeconds,
		parsedMetrics: result.parsedMetrics,
	}, null, 2), "utf8");

	// manifest.json — written LAST. Metadata only: identity, timing, status,
	// artifact completion, log-file presence/sizes, and external refs. Log bodies
	// (stdout/stderr/output/parsedMetrics) are intentionally excluded — they
	// live in their own files. See RunManifest for the schema rationale.
	// artifactComplete=true means ALL artifact writes succeeded; if this file is
	// missing or artifactComplete !== true, the artifact is incomplete.
	const manifest = buildRunManifest(result, piRunId, startedAt, completedAt, runSeq);
	writeManifest(runDir, manifest);
}

/** Write checks result to the artifact directory.
 *  Also marks the manifest as artifactComplete=true (all artifacts written). */
export function writeChecksArtifacts(runDir: string, checksResult: ChecksResult): void {
	// Save checks stdout/stderr logs (already filtered)
	if (checksResult.stdout) {
		writeFileAtomicSync(path.join(runDir, "checks.stdout.log"), redactSecrets(checksResult.stdout).text, "utf8");
	}
	if (checksResult.stderr) {
		writeFileAtomicSync(path.join(runDir, "checks.stderr.log"), redactSecrets(checksResult.stderr).text, "utf8");
	}

	const safeChecksResult = {
		...checksResult,
		stdout: redactSecrets(checksResult.stdout ?? "").text,
		stderr: redactSecrets(checksResult.stderr ?? "").text,
		output: redactSecrets(checksResult.output ?? "").text,
	};
	writeFileAtomicSync(path.join(runDir, "checks-result.json"), JSON.stringify(safeChecksResult, null, 2), "utf8");

	// Update the manifest with a checks SUMMARY only (no body), then mark
	// complete. The full filtered checks body stays in checks-result.json /
	// checks.*.log; it must never be embedded in the manifest.
	const manifest = readManifest(runDir);
	if (manifest) {
		manifest.checks = {
			passed: checksResult.passed,
			timedOut: checksResult.timedOut,
			durationSeconds: checksResult.durationSeconds,
			logFilesWritten: Boolean(checksResult.stdout) || Boolean(checksResult.stderr),
		};
		manifest.artifactComplete = manifest.logFilesWritten && !manifest.streamError;
		writeManifest(runDir, manifest);
	}
}

/** Mark artifact as complete (called when no checks are needed). */
export function markArtifactComplete(runDir: string): void {
	const manifest = readManifest(runDir);
	if (manifest) {
		manifest.artifactComplete = manifest.logFilesWritten && !manifest.streamError;
		writeManifest(runDir, manifest);
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

		// Read checks result from its dedicated body file when available.
		let checks: ChecksResult = { passed: null, timedOut: false, output: "", stdout: "", stderr: "", durationSeconds: 0 };
		const checksPath = path.join(runDir, "checks-result.json");
		if (fs.existsSync(checksPath)) {
			try {
				checks = JSON.parse(fs.readFileSync(checksPath, "utf8"));
			} catch { /* leave default checks */ }
		} else {
			// Fallback: restore summary-only checks from the manifest (no body).
			const cs = normalizeChecksSummary(m.checks);
			if (cs) {
				checks = {
					passed: cs.passed,
					timedOut: cs.timedOut,
					durationSeconds: cs.durationSeconds,
					output: "",
					stdout: "",
					stderr: "",
				};
			}
		}

		// Read metrics from the dedicated file. Legacy manifests may still carry
		// parsedMetrics from the old `...result` spread; use that as a read-only
		// fallback, but never re-save it into manifest.json.
		let parsedMetrics: Record<string, number> | null = null;
		const metricsPath = path.join(runDir, "metrics.json");
		if (fs.existsSync(metricsPath)) {
			parsedMetrics = normalizeParsedMetrics(JSON.parse(fs.readFileSync(metricsPath, "utf8")));
		} else {
			parsedMetrics = normalizeParsedMetrics(m.parsedMetrics);
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
 * Root-level autoresearch report artifacts.
 *
 * These are audit/publish artifacts (generated reports and benchmark/checks wrappers), NOT
 * candidate patches. They are deliberately kept out of {@link gitAutoCommit} so the candidate-
 * patch commit boundary stays clean. Stage them explicitly via
 * {@link stageAutoresearchReportArtifacts} only when a report commit is intended.
 */
const ROOT_AUTORESEARCH_REPORT_ARTIFACTS = [
	"autoresearch.jsonl",
	"autoresearch.md",
	"autoresearch.sh",
	"autoresearch.checks.sh",
] as const;

/**
 * 候補パッチを stage して commit する。
 *
 * 責務は「候補パッチの commit」のみ。`git add -A` したあと、internal/audit 系パス
 * (`.pi/`, `.autoresearch/`, `autoresearch.plan.md`) を unstage してから commit する。
 *
 * root 直下の autoresearch report artifact (`autoresearch.jsonl`, `autoresearch.md`,
 * `autoresearch.sh`, `autoresearch.checks.sh`) は監査/publish 用であり候補パッチではない
 * ため、ここでは暗黙に stage しない。それらを同じ commit に含めたい場合だけ
 * `includeAutoresearchReportArtifacts: true` を明示すること。
 *
 * `.pi/` は監査用 artifact であり git 管理対象外。
 */
export function gitAutoCommit(cwd: string, message: string, options: { includeAutoresearchReportArtifacts?: boolean; allowDestructiveCommit?: boolean } = {}): { committed: boolean; commit?: string; error?: string } {
	try {
		// Check if we're in a git repo first. If not, no error — just nothing to commit.
		gitCheckSync(["rev-parse", "--git-dir"], cwd);
	} catch {
		return { committed: false };
	}

	try {
		// Internal artifacts are discussion/audit state, not candidate patches.
		// Avoid pathspec magic exclusions here: older Git versions and some shells/environments
		// have proven brittle with `:(exclude)` during auto-commit. Stage normally, then
		// unstage internal paths (audit dirs + root report artifacts) using portable pathspecs.
		execFileSync("git", ["add", "-A", "--", "."], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		execFileSync("git", ["reset", "--", ".pi", ".autoresearch", "autoresearch.plan.md", ...ROOT_AUTORESEARCH_REPORT_ARTIFACTS], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		if (options.includeAutoresearchReportArtifacts) {
			const stagedReports = stageAutoresearchReportArtifacts(cwd);
			if (stagedReports.error) return { committed: false, error: stagedReports.error };
		}

		try {
			gitCheckSync(["diff", "--cached", "--quiet"], cwd);
			return { committed: false };
		} catch { /* diff あり → commit */ }

		// Safety guard (issue #39): refuse to commit a catastrophic mass deletion.
		// This backstops test/worktree races where a corrupted index would stage the
		// deletion of hundreds of tracked files in one commit. Legitimate candidate
		// patches never delete this many files at once; opt out with
		// `allowDestructiveCommit: true` only when a large deletion is intentional.
		if (!options.allowDestructiveCommit) {
			const deletions = countStagedDeletions(cwd);
			if (deletions > GIT_AUTOCOMMIT_MAX_DELETIONS) {
				return {
					committed: false,
					error: `gitAutoCommit safety guard: ${deletions} tracked files would be deleted by this commit (threshold ${GIT_AUTOCOMMIT_MAX_DELETIONS}). This usually means the cwd index is corrupted (e.g. a worktree race, see issue #39). Refusing to commit. Inspect with: git -C ${JSON.stringify(cwd)} diff --cached --name-only --diff-filter=D`,
				};
			}
		}

		gitCheckSync(["commit", "-m", message], cwd, 10_000);
		gitShortHashCache.delete(path.resolve(cwd));
		return { committed: true, commit: getGitShortHash(cwd) };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * root 直下の autoresearch report artifact を明示的に stage する。
 *
 * これは候補パッチの staging ではなく、監査/publish 用 report artifact の明示的な
 * export step である。`-f` で ignore を貫通する挙動はこの関数に閉じ込めている。
 * report artifact だけを別途 publish したい場合は、この関数を呼んでから任意の commit
 * 手順で commit すること。候補パッチ commit に明示的に同梱したい場合は
 * {@link gitAutoCommit} に `includeAutoresearchReportArtifacts: true` を渡すこと。
 *
 * 戻り値 `staged` は実際に stage した (存在した) ファイル名のリスト。
 */
export function stageAutoresearchReportArtifacts(cwd: string): { staged: string[]; error?: string } {
	try {
		gitCheckSync(["rev-parse", "--git-dir"], cwd);
	} catch {
		return { staged: [] };
	}

	const existing = ROOT_AUTORESEARCH_REPORT_ARTIFACTS.filter((f) => fs.existsSync(path.join(cwd, f)));
	if (existing.length === 0) {
		return { staged: [] };
	}

	try {
		execFileSync("git", ["add", "-f", "--", ...existing], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		return { staged: [...existing] };
	} catch (e) {
		return { staged: [], error: e instanceof Error ? e.message : String(e) };
	}
}

/** 作業ツリーを revert（root internal artifacts と .autoresearch/.pi は保護）。 */
export function gitAutoRevert(cwd: string): { reverted: boolean; error?: string } {
	try {
		const checkoutExcludes = [
			":(exclude)autoresearch.plan.md",
			":(exclude)autoresearch.md",
			":(exclude)autoresearch.jsonl",
			":(exclude)autoresearch.ideas.md",
			":(exclude).autoresearch/**",
			":(exclude).pi/**",
		];
		execFileSync("git", ["checkout", "--", ".", ...checkoutExcludes], {
			cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "ignore"],
		});
		// Preserve only root discussion artifacts and internal audit directories.
		execFileSync("git", [
			"clean", "-fd",
			"-e", "autoresearch.plan.md",
			"-e", "autoresearch.md",
			"-e", "autoresearch.jsonl",
			"-e", "autoresearch.ideas.md",
			"-e", ".autoresearch",
			"-e", ".autoresearch/**",
			"-e", ".pi",
			"-e", ".pi/**",
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
		"- まず autoresearch の dynamic context / state / current.plan / contract / journal を確認し、現在の目的・指標・進捗・未探索領域を把握する",
		"- autoresearch.md と autoresearch.ideas.md（存在する場合）を読み、過去の学びを踏まえる",
		"- 前回結果から「次に何を試すべきか」を明示してから実験する",
		"- 原則として1ターンで1つの具体的な実験だけを行う",
		"- コード変更後は autoresearch_run → autoresearch_log を必ず実行する",
		"- subagent が利用可能なら、書き込みを伴わないコード調査・ログ要約・失敗原因分析・次実験案の探索に積極的に使う",
		"- subagent にはファイル編集、autoresearch_run / autoresearch_log、git操作を任せない。実験実行と記録は root が行う",
		"- subagent の結果は参考情報として統合し、実際に試す実験は1ターンにつき1つだけにする",
		"- 学んだことを autoresearch.md の Codebase Patterns / 試したこと、または memo に残す",
		"- 改善余地・未検証候補・不確実性が残る場合は継続する",
		"- COMPLETE を返す前に、未探索候補がないことを journal / autoresearch.md に記録して確認する",
		`- 有望な実験が尽きた場合だけ ${COMPLETE_MARKER} を返す`, 
		"ユーザーに継続確認せず進めてください。",
	].join("\n");
}
