/**
 * @abdd.meta
 * path: .pi/lib/model-timeouts.ts
 * role: モデル別タイムアウト設定の定義および適切なタイムアウト時間の計算
 * why: モデルごとの処理速度差や思考レベルによる負荷変動に応じて、LLMリクエストの最適な待機時間を動的に決定するため
 * related: .pi/lib/executor.ts, .pi/lib/model-config.ts
 * public_api: MODEL_TIMEOUT_BASE_MS, THINKING_LEVEL_MULTIPLIERS, ComputeModelTimeoutOptions, getModelBaseTimeoutMs, computeModelTimeoutMs
 * invariants: computeModelTimeoutMsの戻り値は正の整数、userTimeoutMsが0より大きい場合はその値が優先される
 * side_effects: なし
 * failure_modes: 指定されたmodelIdが既知のパターンに一致しない場合、デフォルト値(240秒)が返却される
 * @abdd.explain
 * overview: モデルIDに基づく基本タイムアウト定義と、思考レベルに応じた乗数を用いた実行タイムアウトの計算モジュール
 * what_it_does:
 *   - モデルIDごとの基本タイムアウト時間(ミリ秒)を定義・参照する
 *   - 思考レベル(thinkingLevel)に応じた時間乗数を定義する
 *   - モデルIDとオプション(ユーザー指定、思考レベル)を受け取り、最終的なタイムアウト時間を計算する
 * why_it_exists:
 *   - 処理の遅いモデルはタイムアウトまでの時間を長く、高速モデルは短く設定し、効率化を図るため
 *   - 思考レベルの高まりに伴う処理時間の増加を考慮し、過度な早期終了を防ぐため
 * scope:
 *   in: モデルID文字列、オプション(ユーザー指定タイムアウト数値、思考レベル文字列)
 *   out: 計算されたタイムアウト時間(ミリ秒、整数)
 */

/**
 * Model-specific timeout configuration.
 * Different models have different response characteristics.
 */

import type { ThinkingLevel } from "./agent-types.js";

/**
 * Timeout values for different models (in milliseconds).
 * Slower models need longer timeouts to avoid premature termination.
 * Optimized for UL mode execution efficiency.
 */
export const MODEL_TIMEOUT_BASE_MS: Record<string, number> = {
  // Slow models - extended timeout due to frequent timeouts
  "glm-5": 600_000,      // 10 minutes (unchanged)
  "glm-4": 480_000,      // 8 minutes (unchanged)

  // Standard models
  "claude-3-5-sonnet": 300_000,
  "claude-3-5-haiku": 120_000,   // 3min → 2min (fast model)
  "gpt-4": 300_000,
  "gpt-4o": 300_000,
  "gpt-4-turbo": 300_000,

  // Fast models - reduced timeout
  "gpt-3.5-turbo": 120_000,      // 3min → 2min
  "gpt-4o-mini": 120_000,        // 3min → 2min

  // Default timeout for unknown models
  "default": 240_000,    // 5min → 4min
} as const;

/**
 * Thinking level multipliers.
 * Higher thinking levels require more processing time.
 */
export const THINKING_LEVEL_MULTIPLIERS: Record<ThinkingLevel, number> = {
  off: 1.0,
  minimal: 1.1,
  low: 1.2,
  medium: 1.4,
  high: 1.8,
  xhigh: 2.5,
} as const;

/**
 * 計算オプション
 * @summary 計算オプション
 * @type {object}
 * @property {number} [userTimeoutMs] - ユーザー指定タイムアウト
 * @property {ThinkingLevel} [thinkingLevel] - 思考レベル
 */
export interface ComputeModelTimeoutOptions {
  /** User-specified timeout (takes precedence if > 0) */
  userTimeoutMs?: number;
  /** Thinking level for the model */
  thinkingLevel?: ThinkingLevel;
}

/**
 * モデル基本タイムアウト取得
 * @summary 基本タイムアウト取得
 * @param {string} modelId - モデルID
 * @returns {number} 基本タイムアウト時間
 */
export function getModelBaseTimeoutMs(modelId: string): number {
  const normalizedModelId =
    typeof modelId === "string" ? modelId.toLowerCase() : "";

  // Exact match
  if (
    Object.prototype.hasOwnProperty.call(
      MODEL_TIMEOUT_BASE_MS,
      normalizedModelId
    )
  ) {
    return MODEL_TIMEOUT_BASE_MS[normalizedModelId];
  }

  // Partial match (modelId contains pattern)
  for (const [pattern, timeout] of Object.entries(MODEL_TIMEOUT_BASE_MS)) {
    if (pattern === "default") continue;
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedModelId.includes(normalizedPattern)) {
      return timeout;
    }
  }

  // Default fallback
  return MODEL_TIMEOUT_BASE_MS.default;
}

/**
 * モデルごとのタイムアウト計算
 * @summary モデル別タイムアウト
 * @param {string} modelId - モデルID
 * @param {ComputeModelTimeoutOptions} [options] - 計算オプション
 * @returns {number} タイムアウト時間
 */
export function computeModelTimeoutMs(
  modelId: string,
  options?: ComputeModelTimeoutOptions,
): number {
  // User-specified timeout takes absolute precedence
  if (options?.userTimeoutMs !== undefined && options.userTimeoutMs > 0) {
    return options.userTimeoutMs;
  }

  // Get base timeout for this model
  const baseTimeout = getModelBaseTimeoutMs(modelId);

  // Apply thinking level multiplier
  // Default to "medium" if not specified
  const thinkingLevel = options?.thinkingLevel ?? "medium";
  const multiplier = THINKING_LEVEL_MULTIPLIERS[thinkingLevel] ?? 1.4;

  return Math.floor(baseTimeout * multiplier);
}

/**
 * 漸進的タイムアウト計算
 * @summary タイムアウト計算
 * @param {number} baseTimeoutMs - 基本タイムアウト時間
 * @param {number} attempt - 試行回数
 * @returns {number} 計算されたタイムアウト時間
 */
export function computeProgressiveTimeoutMs(
  baseTimeoutMs: number,
  attempt: number,
): number {
  // Increase timeout by 25% per attempt, capped at 2x
  const multiplier = Math.min(2.0, 1.0 + attempt * 0.25);
  return Math.floor(baseTimeoutMs * multiplier);
}
