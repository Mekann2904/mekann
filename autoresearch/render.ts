/**
 * autoresearch/render.ts — Widget 表示文字列の生成。
 */

import type { ExperimentState } from "./state.js";

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

/** 方向の日本語ラベル。 */
export function directionLabel(direction: "lower" | "higher"): string {
	return direction === "lower" ? "低い方が良い ↓" : "高い方が良い ↑";
}

/** Widget 用の矢印記号。 */
export function directionArrow(direction: "lower" | "higher"): string {
	return direction === "lower" ? "↓" : "↑";
}

// ---------------------------------------------------------------------------
// Widget rendering
// ---------------------------------------------------------------------------

/**
 * ステータス widget の文字列を返す。
 * 非アクティブ時や結果がない場合は undefined を返す。
 */
export function renderWidget(
	state: ExperimentState,
	isActive: boolean,
	runningInfo?: { startedAt: number; command: string },
): string[] | undefined {
	if (!isActive) return undefined;

	// 実行中
	if (runningInfo) {
		const elapsed = ((Date.now() - runningInfo.startedAt) / 1000).toFixed(1);
		return [`🔬 自動研究: 実験実行中 ${elapsed}秒 / ${runningInfo.command}`];
	}

	// 結果なし（初期化直後）
	if (state.runCount === 0) {
		return ["🔬 自動研究: 初期化済み / ベースライン測定待ち"];
	}

	// 待機中
	const kept = state.results.filter((r) => r.status === "keep").length;
	const bestStr =
		state.bestMetric !== null
			? `最良 ${state.metricName}=${state.bestMetric}${state.metricUnit} ${directionArrow(state.direction)}`
			: "最良 未測定";

	return [`🔬 自動研究: ${state.runCount}回 / 採用${kept} / ${bestStr} / 待機中`];
}
