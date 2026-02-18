/**
 * @abdd.meta
 * path: .pi/lib/model-timeouts.ts
 * role: モデル別タイムアウト設定および計算ユーティリティ
 * why: モデルごとの応答速度差に対応するため、個別のタイムアウト値と思考レベル倍率が必要
 * related: api-client.ts, model-config.ts, retry-handler.ts
 * public_api: MODEL_TIMEOUT_BASE_MS, THINKING_LEVEL_MULTIPLIERS, ComputeModelTimeoutOptions, getModelBaseTimeoutMs, computeModelTimeoutMs, computeProgressiveTimeoutMs
 * invariants:
 *   - 戻り値は常に正の整数（ミリ秒）
 *   - userTimeoutMs > 0 の場合、計算結果は指定値そのまま
 *   - 不明なモデルIDは default 値（240000ms）を使用
 *   - 不明な思考レベルは medium 倍率（1.4）を使用
 * side_effects: なし（純粋関数と定数のみ）
 * failure_modes:
 *   - モデルIDが空文字の場合、default値を返す
 *   - thinkingLevel が null/undefined の場合、medium として処理
 * @abdd.explain
 * overview: LLMモデルごとのタイムアウト値を定義し、思考レベルと再試行回数に応じた動的タイムアウト計算を提供
 * what_it_does:
 *   - モデル別の基本タイムアウト値を定義（120000ms〜600000ms）
 *   - 思考レベルに応じた倍率適用（1.0〜2.5倍）
 *   - モデルIDの完全一致→部分一致→defaultの順でタイムアウトを解決
 *   - 再試行時に25%増のタイムアウトを計算（最大2倍まで）
 * why_it_exists:
 *   - 遅いモデル（glm-5等）は長いタイムアウトがないと完了前に中断される
 *   - 高い思考レベルは処理時間が長くなるため倍率調整が必要
 *   - 再試行時は一時的な遅延を考慮してタイムアウトを延長すべき
 * scope:
 *   in: モデルID、ユーザー指定タイムアウト、思考レベル、試行回数
 *   out: 計算されたタイムアウト値（ミリ秒）
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
  * モデルのタイムアウト計算オプション
  * @param userTimeoutMs ユーザー指定のタイムアウト（0より大きい場合優先）
  * @param thinkingLevel モデルの思考レベル
  */
export interface ComputeModelTimeoutOptions {
  /** User-specified timeout (takes precedence if > 0) */
  userTimeoutMs?: number;
  /** Thinking level for the model */
  thinkingLevel?: string;
}

 /**
  * モデルの基本タイムアウトを取得
  * @param modelId - モデル識別子
  * @returns 基本タイムアウト（ミリ秒）
  */
export function getModelBaseTimeoutMs(modelId: string): number {
  // Exact match
  if (MODEL_TIMEOUT_BASE_MS[modelId]) {
    return MODEL_TIMEOUT_BASE_MS[modelId];
  }

  // Partial match (modelId contains pattern)
  const normalizedId = modelId.toLowerCase();
  for (const [pattern, timeout] of Object.entries(MODEL_TIMEOUT_BASE_MS)) {
    if (pattern === "default") continue;
    const normalizedPattern = pattern.toLowerCase();
    if (normalizedId.includes(normalizedPattern)) {
      return timeout;
    }
  }

  // Default fallback
  return MODEL_TIMEOUT_BASE_MS.default;
}

 /**
  * モデルの適切なタイムアウトを計算
  * @param modelId - モデルID（例: "glm-5", "claude-3-5-sonnet"）
  * @param options - タイムアウト計算のオプション
  * @returns ミリ秒単位のタイムアウト値
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
  * 再試行回数に応じて増加するタイムアウトを計算
  * @param baseTimeoutMs - 基本タイムアウト（ミリ秒）
  * @param attempt - 試行回数
  * @returns 調整後のタイムアウト（ミリ秒）
  */
export function computeProgressiveTimeoutMs(
  baseTimeoutMs: number,
  attempt: number,
): number {
  // Increase timeout by 25% per attempt, capped at 2x
  const multiplier = Math.min(2.0, 1.0 + attempt * 0.25);
  return Math.floor(baseTimeoutMs * multiplier);
}
