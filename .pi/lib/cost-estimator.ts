/**
 * @abdd.meta
 * path: .pi/lib/cost-estimator.ts
 * role: タスクスケジューリングのためのコスト（実行時間とトークン消費量）推定エンジン
 * why: 過去の実績とデフォルト値に基づき、精度の高いスケジューリング判定を可能にするため
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: CostEstimationMethod, CostEstimation, ExecutionHistoryEntry, SourceStatistics, CostEstimatorConfig
 * invariants: confidenceは0.0から1.0の範囲, durationとtokensは正の数, successRateは0.0から1.0の範囲
 * side_effects: 履歴データの記録・更新による統計情報の変化
 * failure_modes: 履歴データ不足時はデフォルト値にフォールバック, 不正な入力値による推論誤差
 * @abdd.explain
 * overview: タスクソースや種別に応じて、実行時間とトークン消費量を見積もる機能を提供する。履歴データが蓄積されると、デフォルト値と実績値を加重平均して推定精度を向上させる。
 * what_it_does:
 *   - TaskSourceに応じたデフォルトコスト（時間・トークン）を定義・提供
 *   - ExecutionHistoryEntryを受け付け、SourceStatisticsを算出・更新
 *   - CostEstimationMethodに基づき、最適なコスト推定値を算出
 *   - 推定結果にメソッド種別と信頼度（confidence）を付与
 * why_it_exists:
 *   - タスクの実行時間とコストを事前に予測し、リソース配分を最適化するため
 *   - 学習機能（historical）による推定の精度向上を実現するため
 * scope:
 *   in: TaskSource, 過去の実行履歴(ExecutionHistoryEntry), 設定値(CostEstimatorConfig)
 *   out: コスト推定結果(CostEstimation), ソース別統計情報(SourceStatistics)
 */

// File: .pi/lib/cost-estimator.ts
// Description: Cost estimation for task scheduling with historical learning support.
// Why: Enables accurate scheduling decisions based on estimated duration and token consumption.
// Related: .pi/lib/task-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

import type { TaskSource } from "./task-scheduler";

// ============================================================================
// Types
// ============================================================================

/**
 * コスト計算の推定方法
 * @summary 推定方法を定義
 * @typedef {string} CostEstimationMethod
 * @property {"default"} default デフォルト
 * @property {"historical"} historical 過去の実績
 * @property {"heuristic"} heuristic ヒューリスティック
 */
export type CostEstimationMethod = "default" | "historical" | "heuristic";

/**
 * コストの推定結果
 * @summary コストを推定
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
 * 実行履歴のエントリ
 * @summary 履歴エントリを取得
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
 * ソースの統計情報
 * @summary 統計情報を取得
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
 * 設定定義
 * @summary 推定器設定
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
 * コスト推定器
 * @summary コスト推定器クラス
 */
export class CostEstimator {
  private readonly config: CostEstimatorConfig;
  private readonly history: Map<TaskSource, ExecutionHistoryEntry[]> = new Map();
  private readonly statsCache: Map<TaskSource, SourceStatistics> = new Map();

  constructor(config: Partial<CostEstimatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * コスト推定
   * @summary コストを見積もる
   * @param source - ソースツールの種類
   * @param provider - プロバイダ名
   * @param model - モデル名
   * @param taskDescription - タスク説明
   * @returns コスト推定結果
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
   * 実行情報記録
   * @summary 実行情報を記録
   * @param entry - 実行履歴エントリ
   * @returns なし
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
   * ソース統計取得
   * @summary 統計情報を取得
   * @param source - ソースツールの種類
   * @returns ソース統計情報
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
   * 履歴とキャッシュをクリア
   * @summary 履歴とキャッシュをクリア
   * @returns void
   */
  clear(): void {
    this.history.clear();
    this.statsCache.clear();
  }

  /**
   * ソース種別のデフォルト推定値を取得
   * @param source タスクのソース種別
   * @returns 推定される所要時間（ミリ秒）とトークン数
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
 * @summary コスト推定インスタンス取得
 * @returns コスト推定インスタンス
 */
export function getCostEstimator(): CostEstimator {
  if (!estimatorInstance) {
    estimatorInstance = new CostEstimator();
  }
  return estimatorInstance;
}

/**
 * コスト推定器を作成
 * @summary コスト推定器を作成
 * @param config コスト推定器の設定オプション
 * @returns 作成されたコスト推定器のインスタンス
 */
export function createCostEstimator(config?: Partial<CostEstimatorConfig>): CostEstimator {
  return new CostEstimator(config);
}

/**
 * @summary インスタンスをリセット
 * シングルトンのインスタンスをリセットする
 * @returns なし
 */
export function resetCostEstimator(): void {
  estimatorInstance = null;
}
