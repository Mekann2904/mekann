/**
 * autoresearch/acceptance.ts — Acceptance policy 判定 (V1)。
 *
 * P0-2: keep 判定を tool 側で metric 比較する
 * P0-3: noisy benchmark 用の acceptance policy を入れる
 *
 * agent の status=keep は「希望」であり、
 * acceptance policy を満たさなければ tool 側で keep を拒否する。
 *
 * 本モジュールは V1 acceptance shape (`AutoresearchContractV1["acceptance"]`) を扱う。
 * acceptance mode は `better_than_baseline | better_than_best` のみ(manual/improvement_threshold は
 * V1 schema で禁止済み)。
 *
 * contractEvaluator.ts は lock file や repeats/noise floor を使うフル評価器であり、
 * 本モジュールは plan-scoped init→log フロー向けの単発 metric 評価を担う。
 * 改善判定の基準 (reference 選択 + minRelativeImprovement) は contractEvaluator と整合する。
 */

import type { AutoresearchContractV1 } from "./contractV1.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** V1 acceptance policy。contract.acceptance の shape。 */
export type AcceptancePolicy = AutoresearchContractV1["acceptance"];
export type AcceptanceMode = AcceptancePolicy["mode"];

/**
 * V1 benchmark aggregate。legacy "single" は V1 に存在しない(builder が median に正規化)。
 * acceptance 集計用に single 相当(1 サンプル)も受け入れる。
 */
export type AggregateMethod = "single" | "median" | "mean" | "min" | "max";

export interface AcceptanceInput {
	/** 候補 metric 値 */
	candidateMetric: number;
	/** 現在の best metric 値。null = 初回/baseline 未確立 */
	bestMetric: number | null;
	/** baseline metric 値(初回確立時)。null = baseline 未測定 */
	baselineMetric: number | null;
	/** 改善方向 */
	direction: "lower" | "higher";
	/** acceptance policy (V1) */
	policy: AcceptancePolicy;
	/** 繰り返し実行の全測定値。省略時は candidateMetric をそのまま使う */
	allMeasurements?: number[];
	/**
	 * 測定値の集計方法。省略時は "single" (allMeasurements の先頭)。
	 * contract の benchmark.aggregate を渡すこと(legacy "single" は V1 に存在しない)。
	 */
	aggregate?: AggregateMethod;
	/** baseline の noise relativeRange。requireImprovementAboveNoiseFloor 時に閾値に上乗せする。省略時は 0 */
	baselineNoiseRelativeRange?: number;
}

export interface AcceptanceResult {
	/** keep を許可するか */
	accepted: boolean;
	/** 集計後の代表値 (aggregate に従う)。測定値が空なら null */
	representativeMetric: number | null;
	/** 改善量 (reference → candidate)。reference=null の場合は 0 */
	improvement: number;
	/** 改善率 (0.02 = 2%)。reference=null の場合は Infinity */
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

	// 符号付き改善率 (正 = 改善、負 = 悪化)
	const signedRate = direction === "lower"
		? (best - candidate) / Math.abs(best || 1)
		: (candidate - best) / Math.abs(best || 1);

	return { improvement, improvementRate: signedRate };
}

// ---------------------------------------------------------------------------
// Reference selection (V1: better_than_baseline / better_than_best)
// ---------------------------------------------------------------------------

/**
 * V1 acceptance mode に従い、改善判定の reference を選ぶ。
 * - better_than_baseline: baseline metric を reference にする。baseline が無い場合は candidate が
 *   baseline 確立として許可される(初回)。
 * - better_than_best: best metric を reference にする。best が無い場合は baseline、どちらも無ければ初回。
 *
 * manual / improvement_threshold は V1 schema で禁止済みのため扱わない。
 */
function selectReference(
	policy: AcceptancePolicy,
	bestMetric: number | null,
	baselineMetric: number | null,
): { reference: number | null; label: string } {
	if (policy.mode === "better_than_best") {
		if (bestMetric !== null) return { reference: bestMetric, label: "best" };
		if (baselineMetric !== null) return { reference: baselineMetric, label: "baseline" };
		return { reference: null, label: "first" };
	}
	// better_than_baseline (default)
	if (baselineMetric !== null) return { reference: baselineMetric, label: "baseline" };
	if (bestMetric !== null) return { reference: bestMetric, label: "best" };
	return { reference: null, label: "first" };
}

// ---------------------------------------------------------------------------
// Acceptance evaluation
// ---------------------------------------------------------------------------

/**
 * Acceptance policy に従って keep の可否を判定する (V1)。
 *
 * mode:
 * - better_than_baseline: baseline より改善が必要。
 * - better_than_best: best より改善が必要。
 *
 * どちらも minRelativeImprovement (改善率の最小閾値) を適用する。
 * requireImprovementAboveNoiseFloor=true の場合は baseline の noise relativeRange を閾値に上乗せする。
 */
export function evaluateAcceptance(input: AcceptanceInput): AcceptanceResult {
	const { policy, direction } = input;

	// 集計: contract の aggregate に従う。省略時は "single" (plan-scoped init→log の単発評価との後方互換)。
	const measurements = input.allMeasurements ?? [input.candidateMetric];
	const representative = aggregateMeasurements(measurements, input.aggregate ?? "single");
	if (representative === null) {
		return {
			accepted: false,
			representativeMetric: null,
			improvement: 0,
			improvementRate: 0,
			reason: "測定値が空のため acceptance を評価できません",
		};
	}

	const { reference, label } = selectReference(policy, input.bestMetric, input.baselineMetric);

	// 初回 (reference = null): ベースライン確立として常に許可
	if (reference === null) {
		return {
			accepted: true,
			representativeMetric: representative,
			improvement: 0,
			improvementRate: Infinity,
			reason: `初回ベースライン測定として許可 (mode=${policy.mode})`,
		};
	}

	const { improvement, improvementRate } = calculateImprovement(representative, reference, direction);

	// 改善判定
	const isImprovement = direction === "lower"
		? representative < reference
		: representative > reference;

	if (!isImprovement) {
		return {
			accepted: false,
			representativeMetric: representative,
			improvement,
			improvementRate,
			reason: `指標が悪化または変化なし: ${representative} vs ${label} ${reference} (direction=${direction})`,
		};
	}

	// 必要改善率: minRelativeImprovement と (要求時は) noise floor の大きい方
	let requiredImprovement = policy.minRelativeImprovement;
	if (policy.requireImprovementAboveNoiseFloor) {
		const noise = input.baselineNoiseRelativeRange ?? 0;
		requiredImprovement = Math.max(requiredImprovement, noise);
	}

	// 改善率チェック
	if (Math.abs(improvementRate) < requiredImprovement) {
		return {
			accepted: false,
			representativeMetric: representative,
			improvement,
			improvementRate,
			reason: `改善率 ${(Math.abs(improvementRate) * 100).toFixed(2)}% が最小閾値 ${(requiredImprovement * 100).toFixed(2)}% を下回っています。ノイズの可能性があります。`,
		};
	}

	return {
		accepted: true,
		representativeMetric: representative,
		improvement,
		improvementRate,
		reason: `指標改善: ${representative} vs ${label} ${reference} (改善率 ${(Math.abs(improvementRate) * 100).toFixed(2)}%)`,
	};
}
