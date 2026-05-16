/**
 * autoresearch/render.ts — Widget 表示文字列の生成。
 */

import type { ExperimentState } from "./state.js";

export interface LoopInfo {
	enabled: boolean;
	iteration: number;
	maxIterations: number | null;
	noProgress: number;
	noProgressLimit: number;
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

// ---------------------------------------------------------------------------
// Widget rendering
// ---------------------------------------------------------------------------

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
