// File: .pi/lib/cost-estimator.ts
// Description: Cost estimation for task scheduling with historical learning support.
// Why: Enables accurate scheduling decisions based on estimated duration and token consumption.
// Related: .pi/lib/task-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

import type { TaskSource } from "./task-scheduler";

// ============================================================================
// Types
// ============================================================================

/**
 * Estimation method used for cost calculation.
 */
export type CostEstimationMethod = "default" | "historical" | "heuristic";

/**
 * Detailed cost estimation result with confidence and method tracking.
 * Used by CostEstimator for internal tracking and future learning.
 */
export interface CostEstimation {
  /** Estimated execution duration in milliseconds */
  estimatedDurationMs: number;
  /** Estimated token consumption */
  estimatedTokens: number;
  /** Confidence level of the estimate (0.0 - 1.0) */
  confidence: number;
  /** Method used to derive the estimate */
  method: CostEstimationMethod;
}

/**
 * Entry recording a completed execution for historical learning.
 */
export interface ExecutionHistoryEntry {
  /** Source tool that created the task */
  source: TaskSource;
  /** Provider name */
  provider: string;
  /** Model name */
  model: string;
  /** Task description (optional, for future heuristic improvements) */
  taskDescription?: string;
  /** Actual execution duration in milliseconds */
  actualDurationMs: number;
  /** Actual token consumption */
  actualTokens: number;
  /** Whether the execution succeeded */
  success: boolean;
  /** Timestamp of the execution */
  timestamp: number;
}

/**
 * Statistics for a specific source type.
 */
export interface SourceStatistics {
  /** Number of recorded executions */
  executionCount: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Average token consumption */
  avgTokens: number;
  /** Minimum duration observed */
  minDurationMs: number;
  /** Maximum duration observed */
  maxDurationMs: number;
  /** Success rate (0.0 - 1.0) */
  successRate: number;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Configuration for cost estimator.
 */
export interface CostEstimatorConfig {
  /** Minimum executions required before using historical data */
  minHistoricalExecutions: number;
  /** Maximum history entries to keep per source */
  maxHistoryPerSource: number;
  /** Weight for historical data vs default (0.0 - 1.0) */
  historicalWeight: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default cost estimates by source type.
 * Based on typical execution patterns:
 * - Single subagent: 30s, 4000 tokens
 * - Parallel subagents: 45s, 8000 tokens (overhead + concurrent execution)
 * - Single team: 60s, 12000 tokens (coordination overhead)
 * - Parallel teams: 90s, 24000 tokens (maximum coordination)
 */
const DEFAULT_ESTIMATES: Record<TaskSource, { durationMs: number; tokens: number }> = {
  subagent_run: { durationMs: 30_000, tokens: 4000 },
  subagent_run_parallel: { durationMs: 45_000, tokens: 8000 },
  agent_team_run: { durationMs: 60_000, tokens: 12_000 },
  agent_team_run_parallel: { durationMs: 90_000, tokens: 24_000 },
};

const DEFAULT_CONFIG: CostEstimatorConfig = {
  minHistoricalExecutions: 5,
  maxHistoryPerSource: 100,
  historicalWeight: 0.7,
};

// ============================================================================
// Cost Estimator
// ============================================================================

/**
 * Cost estimator with support for default estimates and historical learning.
 * Designed for future extension with ML-based heuristics.
 */
export class CostEstimator {
  private readonly config: CostEstimatorConfig;
  private readonly history: Map<TaskSource, ExecutionHistoryEntry[]> = new Map();
  private readonly statsCache: Map<TaskSource, SourceStatistics> = new Map();

  constructor(config: Partial<CostEstimatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate cost for a task.
   * Falls back to default estimates if insufficient historical data.
   *
   * @param source - Source tool type
   * @param provider - Provider name (for future per-provider tuning)
   * @param model - Model name (for future per-model tuning)
   * @param taskDescription - Optional task description (for future heuristic improvements)
   */
  estimate(
    source: TaskSource,
    provider?: string,
    model?: string,
    taskDescription?: string
  ): CostEstimation {
    // Try historical estimation first
    const stats = this.getStats(source);
    if (stats && stats.executionCount >= this.config.minHistoricalExecutions) {
      return {
        estimatedDurationMs: stats.avgDurationMs,
        estimatedTokens: stats.avgTokens,
        confidence: Math.min(0.9, 0.5 + (stats.executionCount / this.config.maxHistoryPerSource) * 0.4),
        method: "historical",
      };
    }

    // Fall back to default estimates
    const defaults = DEFAULT_ESTIMATES[source];
    if (!defaults) {
      // Unknown source: use conservative defaults
      return {
        estimatedDurationMs: 60_000,
        estimatedTokens: 10_000,
        confidence: 0.3,
        method: "default",
      };
    }

    return {
      estimatedDurationMs: defaults.durationMs,
      estimatedTokens: defaults.tokens,
      confidence: 0.5,
      method: "default",
    };
  }

  /**
   * Record a completed execution for historical learning.
   * Thread-safe: uses immutable array replacement.
   */
  recordExecution(entry: ExecutionHistoryEntry): void {
    const source = entry.source;
    let entries = this.history.get(source) ?? [];

    // Add new entry
    entries = [...entries, entry];

    // Trim to max size (keep most recent)
    if (entries.length > this.config.maxHistoryPerSource) {
      entries = entries.slice(-this.config.maxHistoryPerSource);
    }

    this.history.set(source, entries);

    // Invalidate cache
    this.statsCache.delete(source);
  }

  /**
   * Get statistics for a source type.
   * Returns undefined if no history exists.
   */
  getStats(source: TaskSource): SourceStatistics | undefined {
    // Check cache
    const cached = this.statsCache.get(source);
    if (cached) return cached;

    const entries = this.history.get(source);
    if (!entries || entries.length === 0) return undefined;

    // Compute statistics
    let totalDuration = 0;
    let totalTokens = 0;
    let minDuration = Infinity;
    let maxDuration = 0;
    let successCount = 0;
    let lastUpdated = 0;

    for (const entry of entries) {
      totalDuration += entry.actualDurationMs;
      totalTokens += entry.actualTokens;
      minDuration = Math.min(minDuration, entry.actualDurationMs);
      maxDuration = Math.max(maxDuration, entry.actualDurationMs);
      if (entry.success) successCount++;
      lastUpdated = Math.max(lastUpdated, entry.timestamp);
    }

    const count = entries.length;
    const stats: SourceStatistics = {
      executionCount: count,
      avgDurationMs: Math.round(totalDuration / count),
      avgTokens: Math.round(totalTokens / count),
      minDurationMs: minDuration === Infinity ? 0 : minDuration,
      maxDurationMs: maxDuration,
      successRate: successCount / count,
      lastUpdated,
    };

    // Cache result
    this.statsCache.set(source, stats);
    return stats;
  }

  /**
   * Clear all history and cache.
   * Useful for testing or resetting state.
   */
  clear(): void {
    this.history.clear();
    this.statsCache.clear();
  }

  /**
   * Get default estimate for a source type.
   * Public helper for external use.
   */
  static getDefaultEstimate(source: TaskSource): { durationMs: number; tokens: number } {
    return DEFAULT_ESTIMATES[source] ?? { durationMs: 60_000, tokens: 10_000 };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let estimatorInstance: CostEstimator | null = null;

/**
 * Get the singleton cost estimator instance.
 */
export function getCostEstimator(): CostEstimator {
  if (!estimatorInstance) {
    estimatorInstance = new CostEstimator();
  }
  return estimatorInstance;
}

/**
 * Create a new cost estimator with custom config.
 * Useful for testing or isolated usage.
 */
export function createCostEstimator(config?: Partial<CostEstimatorConfig>): CostEstimator {
  return new CostEstimator(config);
}

/**
 * Reset the singleton estimator (for testing).
 */
export function resetCostEstimator(): void {
  estimatorInstance = null;
}
