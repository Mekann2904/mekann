/**
 * @abdd.meta
 * path: .pi/lib/cost-estimator.ts
 * role: タスク実行のコストと所要時間を推定し、履歴データに基づいて精度を向上させるエスティメータ
 * why: 正確なタスクスケジューリングとリソース配分の決定を、トークン消費量と実行時間の予測によってサポートするため
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: CostEstimation, ExecutionHistoryEntry, SourceStatistics, CostEstimatorConfig, estimateCost, recordExecution
 * invariants: confidence は 0.0 から 1.0 の範囲内, historicalWeight は 0.0 から 1.0 の範囲内
 * side_effects: なし（推定ロジック自体は純粋だが、履歴記録インターフェースは外部ストレージへの副作用を想定）
 * failure_modes: 履歴データ不足によるフォールバック、過去の異常値による平均値の歪み
 * @abdd.explain
 * overview: タスクのソース種別に応じたデフォルト推定値と、過去の実行履歴に基づく統計情報を組み合わせてコストを算出するモジュール
 * what_it_does:
 *   - ソース種別（subagent, teamなど）ごとのデフォルト実行時間・トークン消費量を定義
 *   - 過去の実行記録を集計し、平均・最小・最大・成功率などの統計情報を生成
 *   - 統計情報とデフォルト値を統合して、推定コストと信頼度を算出
 * why_it_exists:
 *   - 一定量の実行履歴が蓄積された環境で、スケジューリング精度を統計的に向上させるため
 *   - 履歴データがない場合のために、事前定義された合理的な初期値を提供するため
 * scope:
 *   in: タスクのソース種別、実行履歴データ、設定値（最小実行回数、重み付けなど）
 *   out: 推定実行時間、推定トークン消費量、信頼度、および統計情報の集計結果
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
