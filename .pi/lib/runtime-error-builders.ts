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
