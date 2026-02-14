/**
 * Runtime error and timeout utilities.
 * Shared by subagents.ts and agent-teams.ts for consistent behavior.
 */

import { normalizeTimeoutMs, computeModelTimeoutMs } from "./index.js";

/**
 * Resolve effective timeout with model-specific adjustment.
 * Priority: user-specified > model-specific > default
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
  // Priority 1: User-specified timeout (if > 0)
  const userNormalized = normalizeTimeoutMs(userTimeoutMs, 0);
  if (userNormalized > 0) {
    return userNormalized;
  }

  // Priority 2: Model-specific timeout
  if (modelId && modelId !== "(session-default)") {
    return computeModelTimeoutMs(modelId);
  }

  // Priority 3: Default
  return fallback;
}
