/**
 * @abdd.meta
 * path: .pi/lib/runtime-error-builders.ts
 * role: タイムアウト時間の解決と統一
 * why: subagents.ts と agent-teams.ts で一貫したタイムアウト挙動を保証するため
 * related: ./runtime-utils.js, ./model-timeouts.js, ./subagents.ts, ./agent-teams.ts
 * public_api: resolveEffectiveTimeoutMs
 * invariants: 戻り値は0以上の数値
 * side_effects: なし
 * failure_modes: 不正な型が入力された場合の挙動は依存関数に依存する
 * @abdd.explain
 * overview: ユーザー指定、モデル固有、デフォルトの各タイムアウト値を受け取り、最適な有効時間を決定するモジュール。
 * what_it_does:
 *   - ユーザー指定タイムアウトとモデル固有タイムアウトを正規化して取得する
 *   - 両方が正の値の場合、大きい方を優先して採用する
 *   - いずれも指定がない場合、フォールバック値を返す
 * why_it_exists:
 *   - 処理速度の異なる複数のモデルに対し、十分な実行時間を確保するため
 *   - タイムアウト計算ロジックを共通化し、コード重複を排除するため
 * scope:
 *   in: ユーザー指定値(unknown), モデルID(string|undefined), フォールバック値(number)
 *   out: 決定されたタイムアウト時間(ミリ秒)
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
