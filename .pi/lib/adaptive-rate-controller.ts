/**
 * Adaptive Rate Controller
 *
 * Learns from rate limit errors (429) and adjusts concurrency limits dynamically.
 * Works in conjunction with provider-limits.ts (presets) and cross-instance-coordinator.ts.
 *
 * Algorithm:
 * 1. Start with preset limits from provider-limits
 * 2. On 429 error, reduce limit by 30%
 * 3. After recovery period (5 min), gradually restore limit
 * 4. Track per provider/model for granular control
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ============================================================================
// Types
// ============================================================================

export interface LearnedLimit {
  /** Current learned concurrency limit */
  concurrency: number;
  /** Original preset limit (for recovery) */
  originalConcurrency: number;
  /** Last 429 error timestamp */
  last429At: string | null;
  /** Number of consecutive 429 errors */
  consecutive429Count: number;
  /** Total 429 errors for this model */
  total429Count: number;
  /** Last successful request timestamp */
  lastSuccessAt: string | null;
  /** Recovery scheduled flag */
  recoveryScheduled: boolean;
  /** Model-specific notes */
  notes?: string;
}

export interface AdaptiveControllerState {
  version: number;
  lastUpdated: string;
  limits: {
    [key: string]: LearnedLimit; // "provider:model"
  };
  /** Global multiplier (applied to all limits) */
  globalMultiplier: number;
  /** Recovery interval in ms */
  recoveryIntervalMs: number;
  /** Reduction factor on 429 (0.7 = 30% reduction) */
  reductionFactor: number;
  /** Recovery factor (1.1 = 10% increase per recovery) */
  recoveryFactor: number;
}

export interface RateLimitEvent {
  provider: string;
  model: string;
  type: "429" | "success" | "timeout" | "error";
  timestamp: string;
  details?: string;
}

// ============================================================================
// Constants
// ============================================================================

const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const STATE_FILE = join(RUNTIME_DIR, "adaptive-limits.json");

const DEFAULT_STATE: AdaptiveControllerState = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  limits: {},
  globalMultiplier: 1.0,
  recoveryIntervalMs: 5 * 60 * 1000, // 5 minutes
  reductionFactor: 0.7, // 30% reduction on 429
  recoveryFactor: 1.1, // 10% increase per recovery
};

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const RECOVERY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

// ============================================================================
// State
// ============================================================================

let state: AdaptiveControllerState | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Utilities
// ============================================================================

function buildKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

function loadState(): AdaptiveControllerState {
  try {
    if (existsSync(STATE_FILE)) {
      const content = readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.version) {
        return {
          ...DEFAULT_STATE,
          ...parsed,
        } as AdaptiveControllerState;
      }
    }
  } catch (error) {
    // ignore
  }
  return { ...DEFAULT_STATE };
}

function saveState(): void {
  if (!state) return;

  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }

  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureState(): AdaptiveControllerState {
  if (!state) {
    state = loadState();
  }
  return state;
}

function clampConcurrency(value: number): number {
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.floor(value)));
}

function scheduleRecovery(provider: string, model: string): void {
  if (!state) return;

  const key = buildKey(provider, model);
  const limit = state.limits[key];
  if (!limit) return;

  // Already at or above original, no recovery needed
  if (limit.concurrency >= limit.originalConcurrency) {
    limit.recoveryScheduled = false;
    return;
  }

  limit.recoveryScheduled = true;
  saveState();
}

function processRecovery(): void {
  const currentState = ensureState();
  let changed = false;

  const now = Date.now();
  const recoveryIntervalMs = currentState.recoveryIntervalMs;

  for (const [key, limit] of Object.entries(currentState.limits)) {
    // Skip if not scheduled for recovery
    if (!limit.recoveryScheduled) continue;

    // Skip if below original
    if (limit.concurrency >= limit.originalConcurrency) {
      limit.recoveryScheduled = false;
      continue;
    }

    // Check if enough time has passed since last 429
    const last429 = limit.last429At ? new Date(limit.last429At).getTime() : 0;
    if (now - last429 < recoveryIntervalMs) {
      continue;
    }

    // Check if we've had recent successes
    const lastSuccess = limit.lastSuccessAt ? new Date(limit.lastSuccessAt).getTime() : 0;
    if (now - lastSuccess > recoveryIntervalMs) {
      // No recent success, wait more
      continue;
    }

    // Apply recovery
    const newConcurrency = clampConcurrency(
      Math.ceil(limit.concurrency * currentState.recoveryFactor)
    );

    if (newConcurrency > limit.concurrency) {
      limit.concurrency = newConcurrency;
      changed = true;

      // Check if fully recovered
      if (limit.concurrency >= limit.originalConcurrency) {
        limit.concurrency = limit.originalConcurrency;
        limit.recoveryScheduled = false;
        limit.consecutive429Count = 0;
      }
    }
  }

  if (changed) {
    saveState();
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the adaptive controller.
 * Should be called once at startup.
 */
export function initAdaptiveController(): void {
  if (state) return;

  state = loadState();

  // Start recovery timer
  if (!recoveryTimer) {
    recoveryTimer = setInterval(() => {
      processRecovery();
    }, RECOVERY_CHECK_INTERVAL_MS);
    recoveryTimer.unref();
  }
}

/**
 * Shutdown the adaptive controller.
 */
export function shutdownAdaptiveController(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  state = null;
}

/**
 * Get the effective concurrency limit for a provider/model.
 * Combines preset limit with learned adjustments.
 *
 * @param provider - Provider name (e.g., "anthropic")
 * @param model - Model name (e.g., "claude-sonnet-4")
 * @param presetLimit - The preset limit from provider-limits
 * @returns The effective concurrency limit
 */
export function getEffectiveLimit(
  provider: string,
  model: string,
  presetLimit: number
): number {
  const currentState = ensureState();
  const key = buildKey(provider, model);

  // Check if we have a learned limit
  const learned = currentState.limits[key];
  if (learned) {
    // Apply global multiplier
    const adjusted = Math.floor(learned.concurrency * currentState.globalMultiplier);
    return clampConcurrency(adjusted);
  }

  // Create initial entry with preset
  currentState.limits[key] = {
    concurrency: presetLimit,
    originalConcurrency: presetLimit,
    last429At: null,
    consecutive429Count: 0,
    total429Count: 0,
    lastSuccessAt: null,
    recoveryScheduled: false,
  };
  saveState();

  return clampConcurrency(Math.floor(presetLimit * currentState.globalMultiplier));
}

/**
 * Record a rate limit event.
 */
export function recordEvent(event: RateLimitEvent): void {
  const currentState = ensureState();
  const key = buildKey(event.provider, event.model);

  // Ensure entry exists
  if (!currentState.limits[key]) {
    currentState.limits[key] = {
      concurrency: 4, // Default, will be updated
      originalConcurrency: 4,
      last429At: null,
      consecutive429Count: 0,
      total429Count: 0,
      lastSuccessAt: null,
      recoveryScheduled: false,
    };
  }

  const limit = currentState.limits[key];

  switch (event.type) {
    case "429": {
      // Reduce concurrency
      const newConcurrency = clampConcurrency(
        Math.floor(limit.concurrency * currentState.reductionFactor)
      );
      limit.concurrency = newConcurrency;
      limit.last429At = event.timestamp;
      limit.consecutive429Count += 1;
      limit.total429Count += 1;
      limit.recoveryScheduled = false; // Reset recovery on new 429

      // If multiple consecutive 429s, be more aggressive
      if (limit.consecutive429Count >= 3) {
        limit.concurrency = clampConcurrency(Math.floor(limit.concurrency * 0.5));
      }

      break;
    }

    case "success": {
      limit.lastSuccessAt = event.timestamp;
      // Reset consecutive count on success
      limit.consecutive429Count = 0;

      // Schedule recovery if below original
      if (limit.concurrency < limit.originalConcurrency) {
        scheduleRecovery(event.provider, event.model);
      }
      break;
    }

    case "timeout": {
      // Timeout might indicate rate limiting without explicit 429
      // Be conservative
      if (limit.consecutive429Count > 0) {
        limit.concurrency = clampConcurrency(
          Math.floor(limit.concurrency * 0.9)
        );
      }
      break;
    }

    case "error": {
      // Non-rate-limit errors don't affect limits
      break;
    }
  }

  saveState();
}

/**
 * Record a 429 error.
 */
export function record429(provider: string, model: string, details?: string): void {
  recordEvent({
    provider,
    model,
    type: "429",
    timestamp: new Date().toISOString(),
    details,
  });
}

/**
 * Record a successful request.
 */
export function recordSuccess(provider: string, model: string): void {
  recordEvent({
    provider,
    model,
    type: "success",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get current state (for debugging).
 */
export function getAdaptiveState(): AdaptiveControllerState {
  return { ...ensureState() };
}

/**
 * Get learned limit for a specific provider/model.
 */
export function getLearnedLimit(provider: string, model: string): LearnedLimit | undefined {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  return currentState.limits[key] ? { ...currentState.limits[key] } : undefined;
}

/**
 * Reset learned limits for a provider/model.
 */
export function resetLearnedLimit(provider: string, model: string, newLimit?: number): void {
  const currentState = ensureState();
  const key = buildKey(provider, model);

  if (currentState.limits[key]) {
    const limit = newLimit ?? currentState.limits[key].originalConcurrency;
    currentState.limits[key] = {
      concurrency: limit,
      originalConcurrency: limit,
      last429At: null,
      consecutive429Count: 0,
      total429Count: 0,
      lastSuccessAt: null,
      recoveryScheduled: false,
    };
    saveState();
  }
}

/**
 * Reset all learned limits.
 */
export function resetAllLearnedLimits(): void {
  const currentState = ensureState();
  currentState.limits = {};
  currentState.globalMultiplier = 1.0;
  saveState();
}

/**
 * Set global multiplier (affects all limits).
 */
export function setGlobalMultiplier(multiplier: number): void {
  const currentState = ensureState();
  currentState.globalMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  saveState();
}

/**
 * Configure recovery parameters.
 */
export function configureRecovery(options: {
  recoveryIntervalMs?: number;
  reductionFactor?: number;
  recoveryFactor?: number;
}): void {
  const currentState = ensureState();

  if (options.recoveryIntervalMs !== undefined) {
    currentState.recoveryIntervalMs = Math.max(60_000, options.recoveryIntervalMs);
  }
  if (options.reductionFactor !== undefined) {
    currentState.reductionFactor = Math.max(0.3, Math.min(0.9, options.reductionFactor));
  }
  if (options.recoveryFactor !== undefined) {
    currentState.recoveryFactor = Math.max(1.0, Math.min(1.5, options.recoveryFactor));
  }

  saveState();
}

/**
 * Check if error message indicates a rate limit.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  const message = String(error).toLowerCase();
  const indicators = [
    "429",
    "rate limit",
    "too many requests",
    "quota exceeded",
    "rate_limit",
    "ratelimit",
    "requests per",
    "tokens per",
    "capacity exceeded",
    "throttl",
  ];

  return indicators.some((indicator) => message.includes(indicator));
}

/**
 * Build a summary of the adaptive controller state.
 */
export function formatAdaptiveSummary(): string {
  const currentState = ensureState();
  const lines: string[] = [
    `Adaptive Rate Controller`,
    `========================`,
    ``,
    `Global Multiplier: ${currentState.globalMultiplier.toFixed(2)}`,
    `Recovery Interval: ${Math.round(currentState.recoveryIntervalMs / 1000)}s`,
    `Reduction Factor: ${currentState.reductionFactor.toFixed(2)}`,
    `Recovery Factor: ${currentState.recoveryFactor.toFixed(2)}`,
    ``,
    `Learned Limits:`,
  ];

  if (Object.keys(currentState.limits).length === 0) {
    lines.push(`  (none yet)`);
  } else {
    for (const [key, limit] of Object.entries(currentState.limits)) {
      const status =
        limit.concurrency < limit.originalConcurrency
          ? `REDUCED (${limit.concurrency}/${limit.originalConcurrency})`
          : `OK (${limit.concurrency})`;
      const recent429 = limit.last429At
        ? `last429: ${Math.round((Date.now() - new Date(limit.last429At).getTime()) / 1000)}s ago`
        : "no 429";
      lines.push(`  ${key}: ${status}, ${recent429}, total: ${limit.total429Count}`);
    }
  }

  return lines.join("\n");
}
