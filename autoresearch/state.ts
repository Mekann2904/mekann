/**
 * autoresearch/state.ts — 純粋関数による JSONL 解析・状態管理。
 *
 * pi API に依存しないため unit test が容易。
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus = "keep" | "discard" | "crash" | "checks_failed";

export interface RunEntry {
	type: "run";
	run: number;
	commit: string;
	metric: number;
	metrics?: Record<string, number>;
	status: RunStatus;
	description: string;
	timestamp: number;
	memo?: string;
}

export interface ExperimentState {
	name: string | null;
	metricName: string;
	metricUnit: string;
	direction: "lower" | "higher";
	bestMetric: number | null;
	results: RunEntry[];
	runCount: number;
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
	};
}

/** JSONL ファイル全体から ExperimentState を復元。 */
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
			// 新セグメント: リセット
			state.bestMetric = null;
			state.results = [];
			state.runCount = 0;
			continue;
		}

		if (entry.type === "run" && typeof entry.run === "number") {
			const run: RunEntry = {
				type: "run",
				run: entry.run as number,
				commit: typeof entry.commit === "string" ? entry.commit : "unknown",
				metric: typeof entry.metric === "number" ? entry.metric as number : 0,
				status: validateStatus(entry.status),
				description: typeof entry.description === "string" ? entry.description : "",
				timestamp: typeof entry.timestamp === "number" ? entry.timestamp as number : Date.now(),
				memo: typeof entry.memo === "string" ? entry.memo : undefined,
			};

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
	if (value === "keep" || value === "discard" || value === "crash" || value === "checks_failed") return value;
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
		if (!trimmed.startsWith("METRIC ")) continue;
		const rest = trimmed.slice(7); // "METRIC ".length === 7
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
