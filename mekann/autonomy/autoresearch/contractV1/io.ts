/**
 * autoresearch/contractV1/io.ts — Lock file types, path helpers, file I/O, event/decision/run/metric logging.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AutoresearchContractV1 } from "./schema.js";
import { validateContractV1 } from "./schema.js";
import { canonicalJsonPretty } from "./crypto.js";
import type { BaselineNoiseSummary, EnvironmentFingerprint } from "./crypto.js";
import { bestEffort, logBestEffortFailure, quarantineCorrupt } from "../../../utils/best-effort.js";

// ---------------------------------------------------------------------------
// Lock file types
// ---------------------------------------------------------------------------

export interface LockFile {
	schemaVersion: "autoresearch-lock/v1";
	contractId: string;
	contractHash: string;
	approvedAt: number;
	approvedBy: string;
	baseline: {
		gitCommit: string;
		runs: Array<{
			runId: string;
			metric: number;
			durationSeconds: number;
		}>;
		aggregate: "median" | "mean" | "min" | "max";
		primaryMetricValue: number;
		noise: BaselineNoiseSummary;
	};
	environment: EnvironmentFingerprint;
}

// ---------------------------------------------------------------------------
// Lock file validation (symmetric with validateContractV1)
// ---------------------------------------------------------------------------

export interface LockFileV1ValidationResult {
	valid: boolean;
	errors: string[];
}

const LOCK_AGGREGATES = new Set(["median", "mean", "min", "max"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && !Number.isNaN(value);
}

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((v) => isNumber(v));
}

/**
 * Validate a parsed value against the autoresearch-lock/v1 lock file shape.
 * Returns all structural errors as human-readable strings.
 *
 * Mirrors readCurrentContract / validateContractV1 symmetry: a lock file that
 * fails validation must not be handed back as a `LockFile` via raw `as` casts,
 * otherwise corrupted/partial files yield undefined fields (e.g. contractHash)
 * and silently trigger "contract hash mismatch" pauses on every run.
 */
export function validateLockFileV1(value: unknown): LockFileV1ValidationResult {
	const errors: string[] = [];

	if (!isPlainObject(value)) {
		errors.push("lock file must be a JSON object");
		return { valid: false, errors };
	}

	const lock = value as Record<string, unknown>;

	if (lock.schemaVersion !== "autoresearch-lock/v1") {
		errors.push(
			'schemaVersion must be "autoresearch-lock/v1" (got ' +
			JSON.stringify(lock.schemaVersion) + ")",
		);
	}
	if (!isString(lock.contractId)) errors.push("contractId must be a string");
	if (!isString(lock.contractHash)) errors.push("contractHash must be a string");
	if (!isNumber(lock.approvedAt)) errors.push("approvedAt must be a number");
	if (!isString(lock.approvedBy)) errors.push("approvedBy must be a string");

	const baseline = lock.baseline;
	if (!isPlainObject(baseline)) {
		errors.push("baseline must be an object");
	} else {
		if (!isString(baseline.gitCommit)) errors.push("baseline.gitCommit must be a string");
		if (!LOCK_AGGREGATES.has(baseline.aggregate as string)) {
			errors.push(
				'baseline.aggregate must be one of median|mean|min|max (got ' +
				JSON.stringify(baseline.aggregate) + ")",
			);
		}
		if (!isNumber(baseline.primaryMetricValue)) {
			errors.push("baseline.primaryMetricValue must be a number");
		}
		if (!Array.isArray(baseline.runs)) {
			errors.push("baseline.runs must be an array");
		} else {
			baseline.runs.forEach((run, i) => {
				if (!isPlainObject(run)) {
					errors.push("baseline.runs[" + i + "] must be an object");
					return;
				}
				if (!isString(run.runId)) errors.push("baseline.runs[" + i + "].runId must be a string");
				if (!isNumber(run.metric)) errors.push("baseline.runs[" + i + "].metric must be a number");
				if (!isNumber(run.durationSeconds)) {
					errors.push("baseline.runs[" + i + "].durationSeconds must be a number");
				}
			});
		}
		const noise = baseline.noise;
		if (!isPlainObject(noise)) {
			errors.push("baseline.noise must be an object");
		} else {
			if (!isNumberArray(noise.samples)) errors.push("baseline.noise.samples must be an array of numbers");
			for (const field of ["aggregate", "min", "max", "mean", "stddev", "relativeRange"] as const) {
				if (!isNumber(noise[field])) {
					errors.push("baseline.noise." + field + " must be a number");
				}
			}
		}
	}

	const env = lock.environment;
	if (!isPlainObject(env)) {
		errors.push("environment must be an object");
	} else {
		for (const field of [
			"platform", "arch", "nodeVersion", "npmVersion", "timezone",
			"packageJsonHash", "packageLockHash", "immutableReadSetHash",
		] as const) {
			if (!isString(env[field])) {
				errors.push("environment." + field + " must be a string");
			}
		}
	}

	return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// .autoresearch path helpers
// ---------------------------------------------------------------------------

const AUTORESEARCH_DIR = ".autoresearch";

export function autoresearchDir(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR);
}

export function currentContractPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "current.contract.json");
}

export function currentLockPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "current.lock.json");
}

export function eventsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "events.jsonl");
}

function runsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "runs.jsonl");
}

export function metricsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "metrics.jsonl");
}

export function decisionsPath(cwd: string): string {
	return path.join(cwd, AUTORESEARCH_DIR, "decisions.jsonl");
}

export function planPath(cwd: string): string {
	return path.join(cwd, "autoresearch.plan.md");
}

export function ensureAutoresearchDir(cwd: string): void {
	const dir = autoresearchDir(cwd);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

}

// ---------------------------------------------------------------------------
// File I/O for new contract mode
// ---------------------------------------------------------------------------

export function writeCurrentContract(cwd: string, contract: AutoresearchContractV1): void {
	ensureAutoresearchDir(cwd);
	const canonical = canonicalJsonPretty(contract);
	fs.writeFileSync(currentContractPath(cwd), canonical, "utf8");
}

export function readCurrentContract(cwd: string): AutoresearchContractV1 | null {
	const fp = currentContractPath(cwd);
	if (!fs.existsSync(fp)) return null;
	// Distinguish a truly corrupt file (unparseable JSON → quarantine for human
	// inspection) from a structurally-invalid one (parses but fails schema → log
	// only, since it may be a recoverable hand-edit or forward-compat case).
	// Both used to collapse to a silent `null` (issue #146).
	const data = bestEffort("autoresearch-read-current-contract:parse", () =>
		JSON.parse(fs.readFileSync(fp, "utf8")), { level: "error" });
	if (data === undefined) {
		quarantineCorrupt(fp, "autoresearch-contract-corrupt");
		return null;
	}
	const validation = validateContractV1(data);
	if (validation.valid) return data as AutoresearchContractV1;
	logBestEffortFailure(
		"autoresearch-read-current-contract:validate",
		new Error(`schema invalid: ${validation.errors.join("; ")}`),
	);
	return null;
}

export function writeLockFile(cwd: string, lock: LockFile): void {
	ensureAutoresearchDir(cwd);
	fs.writeFileSync(currentLockPath(cwd), JSON.stringify(lock, null, 2), "utf8");
}

export function readLockFile(cwd: string): LockFile | null {
	const fp = currentLockPath(cwd);
	if (!fs.existsSync(fp)) return null;
	// See readCurrentContract: corrupt JSON is quarantined; schema-invalid is
	// logged but left in place (issue #146).
	const data = bestEffort("autoresearch-read-lock-file:parse", () =>
		JSON.parse(fs.readFileSync(fp, "utf8")), { level: "error" });
	if (data === undefined) {
		quarantineCorrupt(fp, "autoresearch-lock-file-corrupt");
		return null;
	}
	const validation = validateLockFileV1(data);
	if (validation.valid) return data as LockFile;
	logBestEffortFailure(
		"autoresearch-read-lock-file:validate",
		new Error(`schema invalid: ${validation.errors.join("; ")}`),
	);
	return null;
}

// ---------------------------------------------------------------------------
// Event logging
// ---------------------------------------------------------------------------

export interface ContractEvent {
	timestamp: number;
	contractId: string;
	contractHash: string;
	event: string;
	details?: Record<string, unknown>;
}

export function appendEvent(cwd: string, event: ContractEvent): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(event) + "\n";
	fs.appendFileSync(eventsPath(cwd), line, "utf8");
}

// ---------------------------------------------------------------------------
// Decision logging
// ---------------------------------------------------------------------------

export interface DecisionEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	decision: "keep" | "discard" | "pause";
	reason: string;
	metric: number | null;
	reference: number | null;
	details: Record<string, unknown>;
}

export function appendDecision(cwd: string, entry: DecisionEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(decisionsPath(cwd), line, "utf8");
}

// ---------------------------------------------------------------------------
// Contract-mode run / metric logging
// ---------------------------------------------------------------------------

export interface ContractRunEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	iteration: number;
	decision: "keep" | "discard" | "pause";
	measurements: number[];
	representativeMetric: number | null;
	reference: number | null;
	changedFiles: string[];
	checkResults: Record<string, boolean>;
	durationSeconds: number;
	details?: Record<string, unknown>;
}

export function appendContractRun(cwd: string, entry: ContractRunEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(runsPath(cwd), line, "utf8");
}

export interface ContractMetricEntry {
	timestamp: number;
	contractId: string;
	contractHash: string;
	iteration: number;
	metricName: string;
	metricValue: number | null;
	allMeasurements: number[];
	aggregateMethod: string;
	decision: "keep" | "discard" | "pause";
	details?: Record<string, unknown>;
}

export function appendContractMetric(cwd: string, entry: ContractMetricEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(metricsPath(cwd), line, "utf8");
}
