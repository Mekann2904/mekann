/**
 * Runtime error and timeout utilities.
 * Shared by subagents.ts and agent-teams.ts for consistent behavior.
 */

import { normalizeTimeoutMs, computeModelTimeoutMs } from "./index.js";

/**
 * Resolve effective timeout with model-specific adjustment.
 * Priority: max(user-specified, model-specific) > default
 *
 * This ensures that slow models (e.g., GLM-5) always get sufficient timeout,
 * even if the caller specifies a shorter timeout intended for faster models.
 *
 * @param userTimeoutMs - User-specified timeout (unknown type for safety)
 * @param modelId - Model ID for model-specific timeout lookup
 * @param fallback - Default fallback timeout in milliseconds
 * @returns Resolved timeout in milliseconds
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
