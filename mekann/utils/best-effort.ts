/**
 * Structured best-effort execution helper (issue #146).
 *
 * Many Mekann side-effects (cleanup, evidence recording, state transitions,
 * ledger maintenance) are "must not break the primary flow" operations that
 * were historically wrapped in bare `catch { /* best-effort *\/ }` blocks or
 * `.catch(() => undefined)`. Those bare catches hid the failures entirely: a
 * disk-full ledger rotation, a corrupt result JSON, a zombie worker that would
 * not shut down, or a broken contract file all vanished without a trace,
 * producing debug-resistant silent failures.
 *
 * This module replaces those bare catches with thin wrappers that still
 * swallow the error (so the primary flow is preserved) but first emit a
 * structured `best-effort-failure` event through the same JSON-to-stderr sink
 * used by {@link ./atomic-append.ts}. Callers can wire the sink into a
 * metrics/observability backend via {@link configureBestEffortLogging}.
 *
 * * The helper intentionally does NOT introduce a new logging backend; it
 * duplicates the ~7-line stderr-JSON sink also used by
 * {@link ./atomic-append.ts}. They are deliberately kept separate rather than
 * sharing one module: `atomic-append.ts` is imported directly by a cross-process
 * test that spawns child Node processes using native TS type-stripping, which
 * cannot resolve nested relative `.js`→`.ts` imports — so that file must remain
 * free of local relative imports. Duplicating the trivial sink here keeps both
 * files self-contained. See the issue's "Out of scope: 新たなログ基盤の構築".
 */

import * as fs from "node:fs";

export interface BestEffortLogEvent {
	level: "warn" | "error";
	/** Stable event name so log sinks can filter/grep best-effort failures. */
	event: "best-effort-failure";
	/** Human-readable label identifying the call site (e.g. "ledger-rotate"). */
	label: string;
	/** Error message stringified; structured detail can be added by the sink. */
	message: string;
	pid: number;
	timestamp: number;
}

let logSink: (event: BestEffortLogEvent) => void = defaultLogSink;

function defaultLogSink(event: BestEffortLogEvent): void {
	// One JSON object per line on stderr so it is machine-parseable and greppable
	// without interfering with pi's stdout IPC. Logging must never throw.
	try {
		process.stderr.write(JSON.stringify(event) + "\n");
	} catch {
		/* ignore */
	}
}

/**
 * Override structured-failure logging (e.g. wire into a metrics backend) or
 * pass `null` to restore the stderr default. The sink receives one
 * {@link BestEffortLogEvent} per failure. A throwing sink is swallowed so
 * observability can never break the primary flow it is meant to observe.
 */
export function configureBestEffortLogging(sink: ((event: BestEffortLogEvent) => void) | null): void {
	logSink = sink ?? defaultLogSink;
}

function emit(label: string, error: unknown, level: "warn" | "error"): void {
	const event: BestEffortLogEvent = {
		level,
		event: "best-effort-failure",
		label,
		message: error instanceof Error ? error.message : String(error),
		pid: process.pid,
		timestamp: Date.now(),
	};
	try {
		logSink(event);
	} catch {
		/* a broken sink must not propagate */
	}
}

function isENOENT(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: string }).code === "ENOENT";
}

export interface BestEffortOptions {
	/** Log level for the emitted event; defaults to "warn". */
	level?: "warn" | "error";
	/**
	 * When true, a missing file (ENOENT) is treated as a normal "nothing to do"
	 * case and is NOT logged. Use for read-style helpers that legitimately run
	 * before the file exists (e.g. reading state on a fresh repo). Defaults to
	 * false so genuine ENOENT surprises remain visible.
	 */
	silentOnMissing?: boolean;
}

/**
 * Run a synchronous best-effort operation. If `fn` throws, the failure is
 * emitted as a structured event and `undefined` is returned instead of
 * propagating — the primary flow is never broken. Callers that need a
 * fallback value use the `??` operator:
 *
 * ```ts
 * const state = bestEffort("read-state", () => JSON.parse(readFileSync(p))) ?? DEFAULT;
 * ```
 */
export function bestEffort<T>(label: string, fn: () => T, options: BestEffortOptions = {}): T | undefined {
	try {
		return fn();
	} catch (error) {
		if (!(options.silentOnMissing && isENOENT(error))) {
			emit(label, error, options.level ?? "warn");
		}
		return undefined;
	}
}

/**
 * Async twin of {@link bestEffort}. Use for promise-returning side-effects
 * (e.g. replacing `.catch(() => undefined)` or `try/await/catch`).
 */
export async function bestEffortAsync<T>(
	label: string,
	fn: () => Promise<T>,
	options: BestEffortOptions = {},
): Promise<T | undefined> {
	try {
		return await fn();
	} catch (error) {
		if (!(options.silentOnMissing && isENOENT(error))) {
			emit(label, error, options.level ?? "warn");
		}
		return undefined;
	}
}

/**
 * Emit a structured best-effort failure without running any operation. Use at
 * call sites that already split the error path (e.g. distinguishing a parse
 * failure from a schema-validation failure) but still want the failure
 * surfaced through the shared observability sink.
 */
export function logBestEffortFailure(label: string, error: unknown, level: "warn" | "error" = "warn"): void {
	emit(label, error, level);
}

/**
 * Quarantine a corrupt/unreadable file by renaming it to
 * `<path>.corrupt.<timestamp>` so it is preserved for human inspection but no
 * longer picked up by readers. Best-effort: a missing file returns
 * `undefined` silently (nothing to quarantine); any other rename failure is
 * logged and swallowed.
 *
 * Returns the quarantine destination path on success, or `undefined` if the
 * rename did not happen.
 */
export function quarantineCorrupt(filePath: string, label = "quarantine-corrupt"): string | undefined {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const dest = `${filePath}.corrupt.${stamp}`;
	try {
		fs.renameSync(filePath, dest);
		return dest;
	} catch (error) {
		if (!isENOENT(error)) emit(label, error, "error");
		return undefined;
	}
}

/** @internal For tests: reset to the default stderr sink. */
export function __resetBestEffortLoggingForTests(): void {
	logSink = defaultLogSink;
}
