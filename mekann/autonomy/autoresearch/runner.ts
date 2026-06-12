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
import {
	createStreamingParseState,
	finalizeParsedRunOutput,
	parseExternalInfo,
	parseStreamingChunk,
} from "./runOutputParser.js";
export { parseExternalInfo, type ExternalInfo } from "./runOutputParser.js";

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
			if (logStreams.stdoutStream) logStreams.stdoutStream.write(filterSecrets(str));
			parseStreamingChunk(sp, str, "stdoutBuf");
		});

		child.stderr!.on("data", (chunk: Buffer) => {
			const str = chunk.toString("utf8");
			if (Buffer.byteLength(stderr, "utf8") < CAPTURE_MAX_BYTES) stderr += str;
			if (logStreams.stderrStream) logStreams.stderrStream.write(filterSecrets(str));
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

	fs.writeFileSync(path.join(runDir, "command.txt"), command, "utf8");

	try {
		const status = gitExecSync(["status", "--porcelain"], cwd);
		fs.writeFileSync(path.join(runDir, "git.status.txt"), status, "utf8");
	} catch {
		fs.writeFileSync(path.join(runDir, "git.status.txt"), "(git unavailable)", "utf8");
	}

	try {
		const diffUnstaged = gitExecSync(["diff"], cwd, 10_000);
		const diffStaged = gitExecSync(["diff", "--cached"], cwd, 10_000);
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
		startedAt,
		completedAt,
		...result,
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
		gitCheckSync(["rev-parse", "--git-dir"], cwd);
	} catch {
		return { committed: false };
	}

	try {
		// Internal artifacts are discussion/audit state, not candidate patches.
		// Avoid pathspec magic exclusions here: older Git versions and some shells/environments
		// have proven brittle with `:(exclude)` during auto-commit. Stage normally, then
		// unstage internal paths using portable pathspecs.
		execFileSync("git", ["add", "-A", "--", "."], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		execFileSync("git", ["reset", "--", ".pi", ".autoresearch", "autoresearch.plan.md"], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });

		const rootAutoresearchFiles = [
			"autoresearch.jsonl",
			"autoresearch.md",
			"autoresearch.sh",
			"autoresearch.checks.sh",
		].filter((f) => fs.existsSync(path.join(cwd, f)));
		if (rootAutoresearchFiles.length > 0) {
			execFileSync("git", ["add", "-f", "--", ...rootAutoresearchFiles], { cwd, encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
		}

		try {
			gitCheckSync(["diff", "--cached", "--quiet"], cwd);
			return { committed: false };
		} catch { /* diff あり → commit */ }

		gitCheckSync(["commit", "-m", message], cwd, 10_000);
		gitShortHashCache.delete(path.resolve(cwd));
		return { committed: true, commit: getGitShortHash(cwd) };
	} catch (e) {
		return { committed: false, error: e instanceof Error ? e.message : String(e) };
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
