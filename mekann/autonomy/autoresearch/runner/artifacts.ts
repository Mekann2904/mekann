/**
 * autoresearch/runner/artifacts.ts — 成果物ディレクトリと manifest の読み書き。
 *
 * 各 run の artifact ディレクトリ生成・stdout/stderr/metrics/result/manifest の
 * 書き出し・checks 成果物書き出し・manifest 再読込を行う。
 *
 * 設計上の重要な不変量: manifest.json には log body (stdout/stderr/output/parsedMetrics)
 * を絶対に含めない。body は専用ファイル (stdout.log / metrics.json / checks-result.json)
 * に置き、manifest は size 含む metadata のみを持つ。redactText で秘密情報をマスクして
 * から disk に書く。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ChecksResult, RunManifest, RunManifestChecks, RunResult } from "./types.js";
import { gitExecSync } from "./git.js";
import { redactText } from "./secrets.js";
import { writeFileAtomicSync } from "../layout.js";

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
		writeFileAtomicSync(stdoutPath, redactText(result.stdout), "utf8");
	}

	// stderr.log — skip if streaming already wrote content
	const stderrPath = path.join(runDir, "stderr.log");
	if (!fs.existsSync(stderrPath) || fs.statSync(stderrPath).size === 0) {
		writeFileAtomicSync(stderrPath, redactText(result.stderr), "utf8");
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
		writeFileAtomicSync(path.join(runDir, "checks.stdout.log"), redactText(checksResult.stdout), "utf8");
	}
	if (checksResult.stderr) {
		writeFileAtomicSync(path.join(runDir, "checks.stderr.log"), redactText(checksResult.stderr), "utf8");
	}

	const safeChecksResult = {
		...checksResult,
		stdout: redactText(checksResult.stdout ?? ""),
		stderr: redactText(checksResult.stderr ?? ""),
		output: redactText(checksResult.output ?? ""),
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
