/**
 * @abdd.meta
 * path: .pi/lib/runtime-error-builders.ts
 * role: タイムアウト時間解決ユーティリティの提供
 * why: subagents.tsとagent-teams.ts間で一貫したタイムアウト動作を実現するため
 * related: subagents.ts, agent-teams.ts, runtime-utils.ts, model-timeouts.ts
 * public_api: resolveEffectiveTimeoutMs
 * invariants: 戻り値は常に正の整数（ミリ秒）、0や未指定の場合はfallbackを返す
 * side_effects: なし（純粋関数）
 * failure_modes: すべてのタイムアウトソースが0または未指定の場合、fallback値を返す
 * @abdd.explain
 * overview: ユーザー指定・モデル固有・フォールバックの3つのタイムアウトソースから有効な値を決定する
 * what_it_does:
 *   - ユーザー指定タイムアウトの正規化
 *   - モデルIDに基づくモデル固有タイムアウトの取得
 *   - 複数のタイムアウトが有効な場合、最大値を採用して低速モデルに十分な時間を確保
 *   - すべて未指定時はフォールバック値を返却
 * why_it_exists:
 *   - subagentsとagent-teamsでタイムアウト処理を統一
 *   - モデルの特性に応じた適切なタイムアウト設定の自動調整
 *   - ユーザー設定とモデル要件の競合を解決（最大値を採用）
 * scope:
 *   in: ユーザー指定タイムアウト値（unknown型）、モデルID（string | undefined）、フォールバック値（number）
 *   out: 解決されたタイムアウト時間（ミリ秒単位のnumber）
 */

/**
 * Runtime error and timeout utilities.
 * Shared by subagents.ts and agent-teams.ts for consistent behavior.
 */

import { normalizeTimeoutMs } from "./runtime-utils.js";
import { computeModelTimeoutMs } from "./model-timeouts.js";

 /**
  * 有効なタイムアウト時間を解決する
  * @param userTimeoutMs - ユーザー指定のタイムアウト
  * @param modelId - モデル固有のタイムアウト検索用ID
  * @param fallback - デフォルトのフォールバック時間（ミリ秒）
  * @returns 解決されたタイムアウト時間（ミリ秒）
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
