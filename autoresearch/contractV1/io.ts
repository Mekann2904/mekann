/**
 * autoresearch/contractV1/io.ts — Lock file types, path helpers, file I/O, event/decision/run/metric logging.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AutoresearchContractV1 } from "./schema.js";
import { validateContractV1 } from "./schema.js";
import { canonicalJsonPretty } from "./crypto.js";
import type { BaselineNoiseSummary, EnvironmentFingerprint } from "./crypto.js";

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
	try {
		const data = JSON.parse(fs.readFileSync(fp, "utf8"));
		const validation = validateContractV1(data);
		if (validation.valid) return data as AutoresearchContractV1;
		return null;
	} catch {
		return null;
	}
}

export function writeLockFile(cwd: string, lock: LockFile): void {
	ensureAutoresearchDir(cwd);
	fs.writeFileSync(currentLockPath(cwd), JSON.stringify(lock, null, 2), "utf8");
}

export function readLockFile(cwd: string): LockFile | null {
	const fp = currentLockPath(cwd);
	if (!fs.existsSync(fp)) return null;
	try {
		return JSON.parse(fs.readFileSync(fp, "utf8")) as LockFile;
	} catch {
		return null;
	}
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
}

export function appendContractMetric(cwd: string, entry: ContractMetricEntry): void {
	ensureAutoresearchDir(cwd);
	const line = JSON.stringify(entry) + "\n";
	fs.appendFileSync(metricsPath(cwd), line, "utf8");
}
