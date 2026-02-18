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
 * 5. NEW: Predictive scheduling based on historical patterns
 *
 * Configuration:
 * Uses centralized RuntimeConfig from runtime-config.ts for consistency.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";

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
  /** Predictive: historical 429 timestamps for pattern analysis */
  historical429s?: string[];
  /** Predictive: estimated 429 probability (0-1) */
  predicted429Probability?: number;
  /** Predictive: suggested ramp-up schedule */
  rampUpSchedule?: number[];
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
  /** Predictive: enable proactive throttling */
  predictiveEnabled: boolean;
  /** Predictive: threshold for proactive action */
  predictiveThreshold: number;
}

/**
 * レート制限イベントを表すインターフェース
 *
 * APIリクエストに関するレート制限イベントの詳細情報を格納します。
 * 429エラー、成功、タイムアウト、エラーの各イベントタイプを記録します。
 *
 * @property provider - APIプロバイダー名
 * @property model - 使用されたモデル名
 * @property type - イベントタイプ（429エラー、成功、タイムアウト、エラー）
 * @property timestamp - イベント発生時のタイムスタンプ
 * @property details - イベントの追加詳細情報（オプション）
 */
export interface RateLimitEvent {
  provider: string;
  model: string;
  type: "429" | "success" | "timeout" | "error";
  timestamp: string;
  details?: string;
}

export interface PredictiveAnalysis {
  provider: string;
  model: string;
  predicted429Probability: number;
  shouldProactivelyThrottle: boolean;
  recommendedConcurrency: number;
  nextRiskWindow?: { start: Date; end: Date };
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const STATE_FILE = join(RUNTIME_DIR, "adaptive-limits.json");

/**
 * Get default state from centralized RuntimeConfig.
 */
function getDefaultState(): AdaptiveControllerState {
  const config = getRuntimeConfig();
  return {
    version: 2,
    lastUpdated: new Date().toISOString(),
    limits: {},
    globalMultiplier: 1.0,
    recoveryIntervalMs: config.recoveryIntervalMs,
    reductionFactor: config.reductionFactor,
    recoveryFactor: config.recoveryFactor,
    predictiveEnabled: config.predictiveEnabled,
    predictiveThreshold: 0.3, // Proactively throttle if >30% 429 probability
  };
}

/**
 * Legacy constant for migration purposes.
 * @deprecated Use getDefaultState() instead.
 */
const DEFAULT_STATE: AdaptiveControllerState = {
  version: 2,
  lastUpdated: new Date().toISOString(),
  limits: {},
  globalMultiplier: 1.0,
  recoveryIntervalMs: 5 * 60 * 1000, // 5 minutes
  reductionFactor: 0.7, // 30% reduction on 429
  recoveryFactor: 1.1, // 10% increase per recovery
  predictiveEnabled: true,
  predictiveThreshold: 0.3, // Proactively throttle if >30% 429 probability
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
  const defaults = getDefaultState();

  try {
    if (existsSync(STATE_FILE)) {
      const content = readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.version) {
        return {
          ...defaults,
          ...parsed,
          // Ensure new config values are used if not in file
          recoveryIntervalMs: defaults.recoveryIntervalMs,
          reductionFactor: defaults.reductionFactor,
          recoveryFactor: defaults.recoveryFactor,
          predictiveEnabled: parsed.predictiveEnabled ?? defaults.predictiveEnabled,
        } as AdaptiveControllerState;
      }
    }
  } catch (error) {
    // ignore
  }
  return { ...defaults };
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

      // Update historical data for predictive analysis
      updateHistorical429s(limit);

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
    `Predictive: ${currentState.predictiveEnabled ? "enabled" : "disabled"} (threshold: ${currentState.predictiveThreshold})`,
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
      const prediction = limit.predicted429Probability
        ? `, 429_prob: ${(limit.predicted429Probability * 100).toFixed(1)}%`
        : "";
      lines.push(`  ${key}: ${status}, ${recent429}, total: ${limit.total429Count}${prediction}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Predictive Scheduling
// ============================================================================

/**
 * Analyze historical 429 patterns and predict probability.
 * Uses a simple time-based model: recent 429s increase probability.
 */
export function analyze429Probability(provider: string, model: string): number {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  const limit = currentState.limits[key];

  if (!limit || !limit.historical429s || limit.historical429s.length === 0) {
    return 0;
  }

  const now = Date.now();
  const recentWindowMs = 10 * 60 * 1000; // 10 minutes
  const mediumWindowMs = 30 * 60 * 1000; // 30 minutes
  const hourWindowMs = 60 * 60 * 1000; // 1 hour

  let recentCount = 0;
  let mediumCount = 0;
  let hourCount = 0;

  for (const timestamp of limit.historical429s) {
    const time = new Date(timestamp).getTime();
    const age = now - time;

    if (age < recentWindowMs) recentCount++;
    if (age < mediumWindowMs) mediumCount++;
    if (age < hourWindowMs) hourCount++;
  }

  // Weighted probability calculation
  // Recent 429s have higher weight
  const recentWeight = recentCount * 0.4;
  const mediumWeight = mediumCount * 0.15;
  const hourWeight = hourCount * 0.05;

  // Also consider consecutive 429s
  const consecutiveWeight = limit.consecutive429Count * 0.2;

  // Calculate base probability
  const probability = recentWeight + mediumWeight + hourWeight + consecutiveWeight;

  // Cap at 1.0
  return Math.min(1.0, probability);
}

/**
 * Get predictive analysis for a provider/model.
 */
export function getPredictiveAnalysis(provider: string, model: string): PredictiveAnalysis {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  const limit = currentState.limits[key];

  const probability = analyze429Probability(provider, model);
  const shouldProactivelyThrottle =
    currentState.predictiveEnabled &&
    probability > currentState.predictiveThreshold;

  // Calculate recommended concurrency
  let recommendedConcurrency = limit?.concurrency ?? 4;

  if (shouldProactivelyThrottle) {
    // Reduce concurrency proportionally to probability
    const reductionFactor = 1 - probability * 0.5; // Up to 50% reduction
    recommendedConcurrency = Math.floor(recommendedConcurrency * reductionFactor);
    recommendedConcurrency = Math.max(1, recommendedConcurrency);
  }

  // Determine next risk window based on historical patterns
  let nextRiskWindow: { start: Date; end: Date } | undefined;
  if (limit?.historical429s && limit.historical429s.length >= 3) {
    // Find time intervals between 429s
    const timestamps = limit.historical429s
      .map((t) => new Date(t).getTime())
      .sort((a, b) => a - b);

    if (timestamps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Predict next risk window
      const last429Time = timestamps[timestamps.length - 1];
      const nextPredicted429 = last429Time + avgInterval;

      nextRiskWindow = {
        start: new Date(nextPredicted429 - avgInterval * 0.2),
        end: new Date(nextPredicted429 + avgInterval * 0.2),
      };
    }
  }

  // Calculate confidence based on data availability
  const dataPoints = limit?.historical429s?.length ?? 0;
  const confidence = Math.min(1.0, dataPoints / 10); // Full confidence at 10+ data points

  return {
    provider,
    model,
    predicted429Probability: probability,
    shouldProactivelyThrottle,
    recommendedConcurrency,
    nextRiskWindow,
    confidence,
  };
}

/**
 * Check if we should proactively throttle based on predictions.
 */
export function shouldProactivelyThrottle(provider: string, model: string): boolean {
  const analysis = getPredictiveAnalysis(provider, model);
  return analysis.shouldProactivelyThrottle;
}

/**
 * Get recommended concurrency considering predictions.
 */
export function getPredictiveConcurrency(
  provider: string,
  model: string,
  currentConcurrency: number
): number {
  const analysis = getPredictiveAnalysis(provider, model);

  if (analysis.shouldProactivelyThrottle) {
    return Math.min(currentConcurrency, analysis.recommendedConcurrency);
  }

  return currentConcurrency;
}

/**
 * Update historical 429 data (called on 429 events).
 */
function updateHistorical429s(limit: LearnedLimit): void {
  if (!limit.historical429s) {
    limit.historical429s = [];
  }

  limit.historical429s.push(new Date().toISOString());

  // Keep only last 50 entries to prevent unbounded growth
  if (limit.historical429s.length > 50) {
    limit.historical429s = limit.historical429s.slice(-50);
  }

  // Update predicted probability
  limit.predicted429Probability = analyze429Probability(
    limit.originalConcurrency.toString(), // Dummy provider extraction
    limit.originalConcurrency.toString()  // Dummy model extraction
  );
}

/**
 * Enable or disable predictive scheduling.
 */
export function setPredictiveEnabled(enabled: boolean): void {
  const currentState = ensureState();
  currentState.predictiveEnabled = enabled;
  saveState();
}

/**
 * Set predictive threshold (0-1).
 */
export function setPredictiveThreshold(threshold: number): void {
  const currentState = ensureState();
  currentState.predictiveThreshold = Math.max(0, Math.min(1, threshold));
  saveState();
}

// ============================================================================
// Dynamic Parallelism Integration
// ============================================================================

/**
 * Get scheduler-aware limit for a provider/model.
 * This combines:
 * 1. Adaptive learned limits
 * 2. Predictive throttling
 * 3. Dynamic parallelism adjuster
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param baseLimit - Base concurrency limit from provider-limits
 * @returns Scheduler-aware concurrency limit
 */
export function getSchedulerAwareLimit(
  provider: string,
  model: string,
  baseLimit?: number
): number {
  // Get the effective limit from adaptive controller
  const effectiveLimit = getEffectiveLimit(provider, model, baseLimit ?? 4);

  // Apply predictive throttling
  const predictiveLimit = getPredictiveConcurrency(provider, model, effectiveLimit);

  return predictiveLimit;
}

/**
 * Notify the scheduler of a 429 error.
 * This is a convenience function that wraps record429.
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param details - Optional error details
 */
export function notifyScheduler429(
  provider: string,
  model: string,
  details?: string
): void {
  record429(provider, model, details);

  // Also update dynamic parallelism adjuster
  try {
    // Lazy import to avoid circular dependency
    const { adjustForError } = require("./dynamic-parallelism");
    adjustForError(provider, model, "429");
  } catch {
    // Ignore if dynamic-parallelism module not available
  }
}

/**
 * Notify the scheduler of a timeout error.
 *
 * @param provider - Provider name
 * @param model - Model name
 */
export function notifySchedulerTimeout(provider: string, model: string): void {
  recordEvent({
    provider,
    model,
    type: "timeout",
    timestamp: new Date().toISOString(),
  });

  // Also update dynamic parallelism adjuster
  try {
    const { adjustForError } = require("./dynamic-parallelism");
    adjustForError(provider, model, "timeout");
  } catch {
    // Ignore if dynamic-parallelism module not available
  }
}

/**
 * Notify the scheduler of a successful request.
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param responseMs - Response time in milliseconds
 */
export function notifySchedulerSuccess(
  provider: string,
  model: string,
  responseMs?: number
): void {
  recordSuccess(provider, model);

  // Also update dynamic parallelism adjuster
  if (responseMs) {
    try {
      const { getParallelismAdjuster } = require("./dynamic-parallelism");
      const adjuster = getParallelismAdjuster();
      adjuster.recordSuccess(provider, model, responseMs);
      adjuster.attemptRecovery(provider, model);
    } catch {
      // Ignore if dynamic-parallelism module not available
    }
  }
}

/**
 * Get combined rate control summary for a provider/model.
 *
 * @param provider - Provider name
 * @param model - Model name
 * @returns Combined summary
 */
export function getCombinedRateControlSummary(
  provider: string,
  model: string
): {
  adaptiveLimit: number;
  originalLimit: number;
  predictiveLimit: number;
  predicted429Probability: number;
  shouldThrottle: boolean;
  recent429Count: number;
} {
  const learnedLimit = getLearnedLimit(provider, model);
  const analysis = getPredictiveAnalysis(provider, model);

  return {
    adaptiveLimit: learnedLimit?.concurrency ?? 4,
    originalLimit: learnedLimit?.originalConcurrency ?? 4,
    predictiveLimit: analysis.recommendedConcurrency,
    predicted429Probability: analysis.predicted429Probability,
    shouldThrottle: analysis.shouldProactivelyThrottle,
    recent429Count: learnedLimit?.total429Count ?? 0,
  };
}
