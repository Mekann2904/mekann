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
 * Options for computing model timeout.
 */
export interface ComputeModelTimeoutOptions {
  /** User-specified timeout (takes precedence if > 0) */
  userTimeoutMs?: number;
  /** Thinking level for the model */
  thinkingLevel?: string;
}

/**
 * Get the base timeout for a model without thinking level adjustment.
 * @param modelId - The model identifier
 * @returns Base timeout in milliseconds
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
 * Compute the appropriate timeout for a model with all adjustments.
 * Priority: user-specified > model-specific + thinking adjustment > default
 *
 * @param modelId - The model identifier (e.g., "glm-5", "claude-3-5-sonnet")
 * @param options - Timeout computation options
 * @returns Timeout in milliseconds
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
 * Compute a progressive timeout that increases with retry attempts.
 * @param baseTimeoutMs - Base timeout
 * @param attempt - Current attempt number (0-indexed)
 * @returns Adjusted timeout in milliseconds
 */
export function computeProgressiveTimeoutMs(
  baseTimeoutMs: number,
  attempt: number,
): number {
  // Increase timeout by 25% per attempt, capped at 2x
  const multiplier = Math.min(2.0, 1.0 + attempt * 0.25);
  return Math.floor(baseTimeoutMs * multiplier);
}
