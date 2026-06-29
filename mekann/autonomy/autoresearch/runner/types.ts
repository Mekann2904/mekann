/**
 * autoresearch/runner/types.ts — runner 公開型。
 *
 * 責務別モジュール分割 (git / checks / secrets / spawn / artifacts / loop) のうち、
 * 複数モジュールから参照されるデータ構造をここに集約し import cycle を防ぐ。
 * これらの型は {@link "../runner.js"} (barrel) 経由で外部公開される。
 */

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
