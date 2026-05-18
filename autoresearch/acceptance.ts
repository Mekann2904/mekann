/**
 * autoresearch/acceptance.ts — Acceptance policy 判定。
 *
 * P0-2: keep 判定を tool 側で metric 比較する
 * P0-3: noisy benchmark 用の acceptance policy を入れる
 *
 * agent の status=keep は「希望」であり、
 * acceptance policy を満たさなければ tool 側で keep を拒否する。
 */

import type { AcceptancePolicy, AcceptanceMode, AggregateMethod } from "./contract.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AcceptanceInput {
	/** 候補 metric 値 */
	candidateMetric: number;
	/** 現在の best metric 値。null = 初回 */
	bestMetric: number | null;
	/** 改善方向 */
	direction: "lower" | "higher";
	/** acceptance policy */
	policy: AcceptancePolicy;
	/** 繰り返し実行の全測定値 (repeat > 1 の場合)。省略時は candidateMetric をそのまま使う */
	allMeasurements?: number[];
}

export interface AcceptanceResult {
	/** keep を許可するか */
	accepted: boolean;
	/** 集計後の代表値 (aggregate に従う)。測定値が空なら null */
	representativeMetric: number | null;
	/** 改善量 (best → candidate)。best=null の場合は 0 */
	improvement: number;
	/** 改善率 (0.02 = 2%改善)。best=null の場合は Infinity */
	improvementRate: number;
	/** 拒否理由 */
	reason?: string;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** 測定値を集計して代表値を返す */
export function aggregateMeasurements(
	values: number[],
	method: AggregateMethod,
): number | null {
	if (values.length === 0) return null;
	if (values.length === 1) return values[0];

	const sorted = [...values].sort((a, b) => a - b);

	switch (method) {
		case "single":
			return values[0];
		case "median": {
			const mid = Math.floor(sorted.length / 2);
			return sorted.length % 2 === 0
				? (sorted[mid - 1] + sorted[mid]) / 2
				: sorted[mid];
		}
		case "mean":
			return values.reduce((s, v) => s + v, 0) / values.length;
		case "min":
			return sorted[0];
		case "max":
			return sorted[sorted.length - 1];
		default:
			return values[0];
	}
}

// ---------------------------------------------------------------------------
// Improvement calculation
// ---------------------------------------------------------------------------

/** 改善量と改善率を計算する */
export function calculateImprovement(
	candidate: number,
	best: number | null,
	direction: "lower" | "higher",
): { improvement: number; improvementRate: number } {
	if (best === null) {
		// 初回 = 常に「改善」(ベースライン確立)
		return { improvement: 0, improvementRate: Infinity };
	}

	// lower: improvement = best - candidate (正 = 改善)
	// higher: improvement = candidate - best (正 = 改善)
	const improvement = direction === "lower"
		? best - candidate
		: candidate - best;

	// 改善率 = |improvement| / |best|
	const improvementRate = best === 0
		? (improvement > 0 ? Infinity : improvement < 0 ? -Infinity : 0)
		: Math.abs(improvement) / Math.abs(best);

	// 符号付き改善率 (正 = 改善、負 = 悪化)
	const signedRate = direction === "lower"
		? (best - candidate) / Math.abs(best || 1)
		: (candidate - best) / Math.abs(best || 1);

	return { improvement, improvementRate: signedRate };
}

// ---------------------------------------------------------------------------
// Acceptance evaluation
// ---------------------------------------------------------------------------

/**
 * Acceptance policy に従って keep の可否を判定する。
 *
 * mode:
 * - better_than_best: best より厳密に良い場合のみ許可。minImprovement も適用。
 * - improvement_threshold: minImprovement 以上の改善が必要。
 * - manual: agent の判断をそのまま信頼する(acceptance check は通す)。
 */
export function evaluateAcceptance(input: AcceptanceInput): AcceptanceResult {
	const { policy, direction, bestMetric } = input;

	// manual mode: agent の判断を信頼
	if (policy.mode === "manual") {
		return {
			accepted: true,
			representativeMetric: input.candidateMetric,
			improvement: 0,
			improvementRate: bestMetric === null ? Infinity : 0,
			reason: "acceptance.mode=manual: agent の判断を信頼します",
		};
	}

	// 集計
	const measurements = input.allMeasurements ?? [input.candidateMetric];
	const representative = aggregateMeasurements(measurements, policy.aggregate);
	if (representative === null) {
		return {
			accepted: false,
			representativeMetric: null,
			improvement: 0,
			improvementRate: 0,
			reason: "測定値が空のため acceptance を評価できません",
		};
	}
	const { improvement, improvementRate } = calculateImprovement(representative, bestMetric, direction);

	// 初回 (best = null): ベースライン確立として常に許可
	if (bestMetric === null) {
		return {
			accepted: true,
			representativeMetric: representative,
			improvement: 0,
			improvementRate: Infinity,
			reason: "初回ベースライン測定として許可",
		};
	}

	// 改善判定
	const isImprovement = direction === "lower"
		? representative < bestMetric
		: representative > bestMetric;

	if (!isImprovement) {
		return {
			accepted: false,
			representativeMetric: representative,
			improvement,
			improvementRate,
			reason: `指標が悪化または変化なし: ${representative} vs best ${bestMetric} (direction=${direction})`,
		};
	}

	// minImprovement チェック
	if (policy.minImprovement > 0) {
		if (Math.abs(improvementRate) < policy.minImprovement) {
			return {
				accepted: false,
				representativeMetric: representative,
				improvement,
				improvementRate,
				reason: `改善率 ${(improvementRate * 100).toFixed(2)}% が最小閾値 ${(policy.minImprovement * 100).toFixed(2)}% を下回っています。ノイズの可能性があります。`,
			};
		}
	}

	return {
		accepted: true,
		representativeMetric: representative,
		improvement,
		improvementRate,
		reason: `指標改善: ${representative} vs best ${bestMetric} (改善率 ${(Math.abs(improvementRate) * 100).toFixed(2)}%)`,
	};
}
