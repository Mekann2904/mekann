/**
 * @abdd.meta
 * path: .pi/lib/model-timeouts.ts
 * role: モデル固有のタイムアウト定数と計算ロジックの提供
 * why: モデルごとの処理速度差や思考レベルによる負荷変動に応じた適切な待機時間を設定するため
 * related: .pi/lib/model-loader.ts, .pi/lib/api-client.ts
 * public_api: MODEL_TIMEOUT_BASE_MS, THINKING_LEVEL_MULTIPLIERS, ComputeModelTimeoutOptions, getModelBaseTimeoutMs, computeModelTimeoutMs, computeProgressiveTimeoutMs
 * invariants: 返り値は常にミリ秒単位の整数、userTimeoutMsが0より大きい場合はそれを優先して返す
 * side_effects: なし
 * failure_modes: 該当するモデルがない場合はdefaultの値を使用する、未知の思考レベルはmediumとして扱う
 * @abdd.explain
 * overview: モデルIDと思考レベルに基づいて、APIリクエストのタイムアウト時間を動的に計算するモジュール。
 * what_it_does:
 *   - モデルIDに対応する基本タイムアウト値を取得・検索する（部分一致を含む）
 *   - 思考レベルに応じた乗数を基本タイムアウトに適用する
 *   - 再試行回数に応じてタイムアウトを最大2倍まで段階的に増加させる
 *   - ユーザー指定のタイムアウトがある場合はシステム計算値よりも優先する
 * why_it_exists:
 *   - 高遅延モデル（GLMなど）で処理打ち切りを防ぐため
 *   - 高速モデルの応答性を維持しつつ、ULモードの効率を最適化するため
 *   - 再試行時の一時的な負荷上昇や遅延に対応するため
 * scope:
 *   in: モデル識別子（文字列）、ユーザー指定タイムアウト、思考レベル、試行回数
 *   out: 計算されたタイムアウト時間（ミリ秒単位の整数）
 */

/**
 * Model-specific timeout configuration.
 * Different models have different response characteristics.
 */

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
export const THINKING_LEVEL_MULTIPLIERS: Record<string, number> = {
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
 * @property {string} [thinkingLevel] - 思考レベル
 */
export interface ComputeModelTimeoutOptions {
  /** User-specified timeout (takes precedence if > 0) */
  userTimeoutMs?: number;
  /** Thinking level for the model */
  thinkingLevel?: string;
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
  const thinkingLevel = options?.thinkingLevel?.toLowerCase() ?? "medium";
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
