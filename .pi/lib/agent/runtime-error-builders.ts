/**
 * @abdd.meta
 * path: .pi/lib/runtime-error-builders.ts
 * role: タイムアウト時間の決定ロジックを提供するモジュール
 * why: ユーザー指定、モデル特性、デフォルト値の優先順位を一貫して管理するため
 * related: runtime-utils.ts, model-timeouts.ts, subagents.ts, agent-teams.ts
 * public_api: resolveEffectiveTimeoutMs
 * invariants: 0以上の数値を返す
 * side_effects: なし
 * failure_modes: 不正な形式のuserTimeoutMs入力によりnormalizeTimeoutMs内部で例外が発生する可能性がある
 * @abdd.explain
 * overview: 複数のタイムアウト候補（ユーザー指定、モデル別デフォルト、フォールバック）から、実行時に使用する最大の時間を決定する
 * what_it_does:
 *   - ユーザー指定のタイムアウト値を正規化する
 *   - モデルIDに基づいてモデル固有のタイムアウトを取得する
 *   - ユーザー指定とモデル固有のタイムアウトのうち大きい方を選択する
 *   - いずれも未設定の場合はフォールバック値を返す
 * why_it_exists:
 *   - サブエージェントとエージェントチーム間で一貫したタイムアウト挙動を保証するため
 *   - 処理速度の遅いモデルに対して十分な実行時間を確保するため
 * scope:
 *   in: ユーザー指定のタイムアウト値、モデルID、フォールバック数値
 *   out: 決定されたタイムアウト時間（ミリ秒）
 */

/**
 * Runtime error and timeout utilities.
 * Shared by subagents.ts and agent-teams.ts for consistent behavior.
 */

import { normalizeTimeoutMs } from "./runtime-utils.js";
import { computeModelTimeoutMs } from "./model-timeouts.js";

/**
 * タイムアウト解決
 * @summary タイムアウト時間を解決
 * @param userTimeoutMs ユーザー指定のタイムアウト値
 * @param modelId モデルID
 * @param fallback デフォルト値
 * @returns 有効なタイムアウト時間
 */
export function resolveEffectiveTimeoutMs(
  userTimeoutMs: unknown,
  modelId: string | undefined,
  fallback: number,
): number {
  // Get model-specific timeout if available
  const modelSpecificMs =
    modelId && modelId !== "(session-default)"
      ? computeModelTimeoutMs(modelId)
      : 0;

  // User-specified timeout
  const userNormalized = normalizeTimeoutMs(userTimeoutMs, 0);

  // If both are available, use the maximum to ensure slow models get enough time
  if (userNormalized > 0 && modelSpecificMs > 0) {
    return Math.max(userNormalized, modelSpecificMs);
  }

  // If only user-specified, use it
  if (userNormalized > 0) {
    return userNormalized;
  }

  // If only model-specific, use it
  if (modelSpecificMs > 0) {
    return modelSpecificMs;
  }

  // Default fallback
  return fallback;
}
