/**
 * autoresearch/state.ts — 純粋関数による JSONL 解析・状態管理。
 *
 * pi API に依存しないため unit test が容易。
 * 長時間 benchmark 対応のため、append-only ledger と pointer 管理を追加。
 */

import * as fs from "node:fs";
import { appendJsonlLineSync } from "../../utils/atomic-append.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus = "keep" | "discard" | "crash" | "checks_failed" | "revert_failed";

export interface RunEntry {
	type: "run";
	run: number;
	runId?: string;
	commit: string;
	metric: number;
	metrics?: Record<string, number>;
	status: RunStatus;
	description: string;
	timestamp: number;
	memo?: string;
	// --- Provenance fields (added in v1.1) ---
	command?: string;
	exitCode?: number | null;
	timedOut?: boolean;
	checksPassed?: boolean | null;
	preCommit?: string;
	postCommit?: string;
	dirtyBefore?: boolean;
	dirtyAfter?: boolean;
	changedFiles?: string[];
	notes?: string;
	// --- Long-run benchmark fields (added in v2.0) ---
	piRunId?: string;
	createdAt?: number;
	startedAt?: number;
	completedAt?: number;
	durationSeconds?: number;
	externalRunId?: string | null;
	externalArtifactDir?: string | null;
	externalSummaryPath?: string | null;
	externalViewlogPath?: string | null;
	externalMetricsPath?: string | null;
	signal?: string | null;
	metricSource?: "stdout_metric" | "wall_clock";
}

export interface ExperimentState {
	name: string | null;
	metricName: string;
	metricUnit: string;
	direction: "lower" | "higher";
	bestMetric: number | null;
	results: RunEntry[];
	runCount: number;
	/** Session ID for artifact directory organization */
	sessionId: string;
}

// ---------------------------------------------------------------------------
// Ledger entry types
// ---------------------------------------------------------------------------

export interface RunsLedgerEntry {
	schemaVersion: 1;
	runSeq: number;
	piRunId: string;
	externalRunId: string | null;
	createdAt: number;
	startedAt: number;
	completedAt: number;
	durationSeconds: number;
	command: string;
	exitCode: number | null;
	timedOut: boolean;
	signal: string | null;
	gitCommit: string;
}

export interface MetricsLedgerEntry {
	schemaVersion: 1;
	runSeq: number;
	piRunId: string;
	externalRunId: string | null;
	createdAt: number;
	startedAt: number;
	completedAt: number;
	durationSeconds: number;
	command: string;
	gitCommit: string;
	exitCode: number | null;
	timedOut: boolean;
	primaryMetricName: string;
	primaryMetricValue: number;
	metrics: Record<string, number>;
	externalArtifactDir: string | null;
	externalSummaryPath: string | null;
	externalViewlogPath: string | null;
	externalMetricsPath: string | null;
	status: string;
}

export interface DecisionLedgerEntry {
	schemaVersion: 1;
	piRunId: string;
	externalRunId: string | null;
	status: string;
	metric: number;
	preCommit: string;
	postCommit: string;
	dirtyBefore: boolean;
	dirtyAfter: boolean;
	changedFiles: string[];
	timestamp: number;
	description: string;
	notes?: string;
}

export interface EventLedgerEntry {
	schemaVersion: 1;
	event: string; // "started" | "completed" | "timed_out" | "logged"
	piRunId: string;
	timestamp: number;
	details?: Record<string, unknown>;
}

export interface PointerEntry {
	piRunId: string;
	runSeq: number;
	metric: number;
	timestamp: number;
	gitCommit: string;
}

// ---------------------------------------------------------------------------
// JSONL parsing
// ---------------------------------------------------------------------------

/** 1 行の JSON をパース。壊れた行や非オブジェクトは null を返す。 */
export function parseJsonlLine(line: string): Record<string, unknown> | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const parsed = JSON.parse(trimmed);
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Ledger file management (append-only)
// ---------------------------------------------------------------------------

/** Append a line to a JSONL file. Creates the file if it doesn't exist. */
export function appendToJsonl(filePath: string, data: Record<string, unknown>): void {
	// Atomic across processes (issue #139): plain appendFileSync can interleave
	// JSONL lines when several pi processes write ledgers in one cwd, and
	// readers silently drop the torn rows. appendJsonlLineSync serialises
	// writers with an O_EXCL lockfile sibling.
	appendJsonlLineSync(filePath, JSON.stringify(data) + "\n");
}

/** Read all entries from a JSONL file. Returns empty array if file doesn't exist. */
export function readJsonlEntries<T = Record<string, unknown>>(filePath: string): T[] {
	if (!fs.existsSync(filePath)) return [];
	const content = fs.readFileSync(filePath, "utf8");
	const entries: T[] = [];
	for (const line of content.split("\n")) {
		const entry = parseJsonlLine(line);
		if (entry) entries.push(entry as T);
	}
	return entries;
}

// ---------------------------------------------------------------------------
// Pointer management
// ---------------------------------------------------------------------------

/** Write a pointer file (overwrites existing). */
export function writePointer(filePath: string, pointer: PointerEntry): void {
	fs.writeFileSync(filePath, JSON.stringify(pointer, null, 2), "utf8");
}

/** Read a pointer file. Returns null if file doesn't exist or is invalid. */
export function readPointer(filePath: string): PointerEntry | null {
	if (!fs.existsSync(filePath)) return null;
	try {
		const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (data && typeof data === "object" && typeof data.piRunId === "string") {
			return data as PointerEntry;
		}
		return null;
	} catch {
		return null;
	}
}

/** Determine if a candidate metric is better than the current best pointer. */
export function isBestPointerMetric(
	candidate: number,
	bestPointer: PointerEntry | null,
	direction: "lower" | "higher",
): boolean {
	if (!bestPointer) return true;
	return direction === "lower" ? candidate < bestPointer.metric : candidate > bestPointer.metric;
}

// ---------------------------------------------------------------------------
// State reconstruction
// ---------------------------------------------------------------------------

/** 初期状態を生成。 */
export function freshState(): ExperimentState {
	return {
		name: null,
		metricName: "metric",
		metricUnit: "",
		direction: "lower",
		bestMetric: null,
		results: [],
		runCount: 0,
		sessionId: "default",
	};
}

/** JSONL ファイル全体から ExperimentState を復元。 */
function parseRunEntry(entry: Record<string, unknown>): RunEntry {
	const result: RunEntry = {
		type: "run",
		run: entry.run as number,
		commit: typeof entry.commit === "string" ? entry.commit : "unknown",
		metric: typeof entry.metric === "number" ? entry.metric as number : 0,
		status: validateStatus(entry.status),
		description: typeof entry.description === "string" ? entry.description : "",
		timestamp: typeof entry.timestamp === "number" ? entry.timestamp as number : Date.now(),
		memo: typeof entry.memo === "string" ? entry.memo : undefined,
	};
	// Optional provenance fields
	if (typeof entry.runId === "string") result.runId = entry.runId;
	if (typeof entry.command === "string") result.command = entry.command;
	if (entry.exitCode === null || typeof entry.exitCode === "number") result.exitCode = entry.exitCode as number | null;
	if (typeof entry.timedOut === "boolean") result.timedOut = entry.timedOut;
	if (entry.checksPassed === null || typeof entry.checksPassed === "boolean") result.checksPassed = entry.checksPassed as boolean | null;
	if (typeof entry.preCommit === "string") result.preCommit = entry.preCommit;
	if (typeof entry.postCommit === "string") result.postCommit = entry.postCommit;
	if (typeof entry.dirtyBefore === "boolean") result.dirtyBefore = entry.dirtyBefore;
	if (typeof entry.dirtyAfter === "boolean") result.dirtyAfter = entry.dirtyAfter;
	if (Array.isArray(entry.changedFiles)) result.changedFiles = entry.changedFiles.filter((f: unknown) => typeof f === "string");
	if (typeof entry.notes === "string") result.notes = entry.notes;
	// Long-run benchmark fields
	if (typeof entry.piRunId === "string") result.piRunId = entry.piRunId;
	if (typeof entry.createdAt === "number") result.createdAt = entry.createdAt;
	if (typeof entry.startedAt === "number") result.startedAt = entry.startedAt;
	if (typeof entry.completedAt === "number") result.completedAt = entry.completedAt;
	if (typeof entry.durationSeconds === "number") result.durationSeconds = entry.durationSeconds;
	if (typeof entry.externalRunId === "string" || entry.externalRunId === null) result.externalRunId = entry.externalRunId as string | null;
	if (typeof entry.externalArtifactDir === "string" || entry.externalArtifactDir === null) result.externalArtifactDir = entry.externalArtifactDir as string | null;
	if (typeof entry.externalSummaryPath === "string" || entry.externalSummaryPath === null) result.externalSummaryPath = entry.externalSummaryPath as string | null;
	if (typeof entry.externalViewlogPath === "string" || entry.externalViewlogPath === null) result.externalViewlogPath = entry.externalViewlogPath as string | null;
	if (typeof entry.externalMetricsPath === "string" || entry.externalMetricsPath === null) result.externalMetricsPath = entry.externalMetricsPath as string | null;
	if (typeof entry.signal === "string" || entry.signal === null) result.signal = entry.signal as string | null;
	if (entry.metricSource === "stdout_metric" || entry.metricSource === "wall_clock") result.metricSource = entry.metricSource;
	return result;
}

export function reconstructState(jsonlContent: string): ExperimentState {
	const state = freshState();

	for (const line of jsonlContent.split("\n")) {
		const entry = parseJsonlLine(line);
		if (!entry) continue;

		if (entry.type === "config") {
			if (typeof entry.name === "string") state.name = entry.name;
			if (typeof entry.metricName === "string") state.metricName = entry.metricName;
			if (typeof entry.metricUnit === "string") state.metricUnit = entry.metricUnit;
			if (entry.direction === "higher" || entry.direction === "lower") {
				state.direction = entry.direction;
			}
			if (typeof entry.sessionId === "string") state.sessionId = entry.sessionId;
			state.bestMetric = null;
			state.results = [];
			state.runCount = 0;
			continue;
		}

		if (entry.type === "run" && typeof entry.run === "number") {
			const run = parseRunEntry(entry as Record<string, unknown>);

			if (typeof entry.metrics === "object" && entry.metrics !== null) {
				const metrics: Record<string, number> = {};
				for (const [k, v] of Object.entries(entry.metrics as Record<string, unknown>)) {
					if (typeof v === "number") metrics[k] = v;
				}
				if (Object.keys(metrics).length > 0) run.metrics = metrics;
			}

			state.results.push(run);
			state.runCount++;

			if (run.status === "keep" && isBestMetric(state.bestMetric, run.metric, state.direction)) {
				state.bestMetric = run.metric;
			}
		}
	}

	return state;
}

function validateStatus(value: unknown): RunEntry["status"] {
	if (value === "keep" || value === "discard" || value === "crash" || value === "checks_failed" || value === "revert_failed") return value;
	return "crash";
}

// ---------------------------------------------------------------------------
// Best metric
// ---------------------------------------------------------------------------

/** 現在の best より候補が良いか判定。best が null なら常に true。 */
export function isBestMetric(
	best: number | null,
	candidate: number,
	direction: "lower" | "higher",
): boolean {
	if (best === null) return true;
	return direction === "lower" ? candidate < best : candidate > best;
}

// ---------------------------------------------------------------------------
// METRIC line parsing
// ---------------------------------------------------------------------------

/** `METRIC name=value` 行をパースして { name: value } を返す。 */
export function parseMetricLines(output: string): Record<string, number> {
	const metrics: Record<string, number> = {};
	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		// Accept both "METRIC name=value" and "METRIC: name=value"
		let rest: string;
		if (trimmed.startsWith("METRIC: ")) rest = trimmed.slice(8); // "METRIC: ".length === 8
		else if (trimmed.startsWith("METRIC ")) rest = trimmed.slice(7); // "METRIC ".length === 7
		else continue;
		const eqIdx = rest.indexOf("=");
		if (eqIdx < 0) continue;
		const name = rest.slice(0, eqIdx).trim();
		const valueStr = rest.slice(eqIdx + 1).trim();
		const value = Number(valueStr);
		if (name && !isNaN(value)) {
			metrics[name] = value;
		}
	}
	return metrics;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** 指定ステータスのエントリ数を集計。 */
export function countByStatus(results: RunEntry[], status: RunEntry["status"]): number {
	return results.filter((r) => r.status === status).length;
}

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

/** 方向の日本語ラベル。 */
export function directionLabel(direction: "lower" | "higher"): string {
	return direction === "lower" ? "低い方が良い (min)" : "高い方が良い (max)";
}

/** Widget 用の矢印記号。 */
export function directionArrow(direction: "lower" | "higher"): string {
	return direction === "lower" ? "(min)" : "(max)";
}

export interface LoopInfo {
	enabled: boolean;
	iteration: number;
	maxIterations: number | null;
	noProgress: number;
	noProgressLimit: number;
}

export function renderWidget(
	state: ExperimentState,
	isActive: boolean,
	runningInfo?: { startedAt: number; command: string },
	loopInfo?: LoopInfo,
): string[] | undefined {
	if (!isActive) return undefined;

	// 実行中
	if (runningInfo) {
		const elapsed = ((Date.now() - runningInfo.startedAt) / 1000).toFixed(1);
		return [`autoresearch: 実験実行中 ${elapsed}秒 / ${runningInfo.command}${loopSuffix(loopInfo)}`];
	}

	// 結果なし（初期化直後）
	if (state.runCount === 0) {
		return [`autoresearch: 初期化済み / ベースライン測定待ち${loopSuffix(loopInfo)}`];
	}

	// 待機中
	const kept = state.results.filter((r) => r.status === "keep").length;
	const bestStr =
		state.bestMetric !== null
			? `最良 ${state.metricName}=${state.bestMetric}${state.metricUnit} ${directionArrow(state.direction)}`
			: "最良 未測定";

	return [`autoresearch: ${state.runCount}回 / 採用${kept} / ${bestStr} / 待機中${loopSuffix(loopInfo)}`];
}

function loopSuffix(loopInfo?: LoopInfo): string {
	if (!loopInfo) return "";
	if (!loopInfo.enabled) return " / loop paused";
	const max = loopInfo.maxIterations === null ? "∞" : String(loopInfo.maxIterations);
	const noProgress = loopInfo.noProgress > 0 ? ` / no progress ${loopInfo.noProgress}/${loopInfo.noProgressLimit}` : "";
	return ` / loop ON ${loopInfo.iteration}/${max}${noProgress}`;
}
