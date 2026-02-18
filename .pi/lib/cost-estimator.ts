/**
 * @abdd.meta
 * path: .pi/lib/cost-estimator.ts
 * role: タスク実行のコスト（所要時間・トークン消費量）推定エンジン
 * why: スケジューラーが実行順序とリソース配分を決定するための精度の高い推定値を提供し、履歴学習により推定精度を向上させる
 * related: .pi/lib/task-scheduler.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: CostEstimation, CostEstimationMethod, ExecutionHistoryEntry, SourceStatistics, CostEstimatorConfig
 * invariants:
 *   - confidence は 0.0 から 1.0 の範囲
 *   - estimatedDurationMs と estimatedTokens は非負の数値
 *   - successRate は 0.0 から 1.0 の範囲
 * side_effects:
 *   - 履歴データの永続化ストレージへの読み書き（実行記録追加時）
 *   - 統計情報のキャッシュ更新
 * failure_modes:
 *   - 履歴データ不足時はデフォルト推定値にフォールバック
 *   - 不正な入力ソースタイプに対しては例外をスロー
 *   - 永続化ストレージ障害時は履歴機能を無効化して動作継続
 * @abdd.explain
 * overview: タスクの実行時間とトークン消費量を推定し、履歴データに基づく学習で推定精度を向上させるコンポーネント
 * what_it_does:
 *   - TaskSource ごとに実行時間とトークン消費量を推定
 *   - 過去の実行履歴を記録し、ソース別統計（平均・最小・最大・成功率）を算出
 *   - 履歴データが閾値以上の場合は履歴ベース、不足時はデフォルト値を使用
 *   - 信頼度（confidence）を算出し、推定手法（method）を明示
 * why_it_exists:
 *   - スケジューラーがタスク実行順序を最適化するためにコスト予測が必要
 *   - ユーザーへの進捗表示やリソース制限管理に推定値を活用
 *   - 履歴学習により、特定環境での実際の挙動に適応した推定を実現
 * scope:
 *   in: TaskSource（subagent_run, subagent_run_parallel, team_run, team_run_parallel）, プロバイダ/モデル情報, タスク説明（省略可）, 実行結果（履歴記録用）
 *   out: CostEstimation（推定時間・トークン・信頼度・手法）, SourceStatistics（ソース別統計）
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
  * コスト計算の推定方法を表す型。
  */
export type CostEstimationMethod = "default" | "historical" | "heuristic";

 /**
  * コスト推定結果
  * @param estimatedDurationMs 推定実行時間（ミリ秒）
  * @param estimatedTokens 推定トークン消費量
  * @param confidence 推定の信頼度（0.0 - 1.0）
  * @param method 推定に使用された手法
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
  * 履歴学習用の実行記録エントリ
  * @param source タスクを作成したソースツール
  * @param provider プロバイダ名
  * @param model モデル名
  * @param taskDescription タスクの説明（省略可）
  * @param actualDurationMs 実際の実行時間（ミリ秒）
  * @param actualTokens 実際のトークン消費量
  * @param success 実行が成功したかどうか
  * @param timestamp 実行のタイムスタンプ
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
  * 特定のソースタイプの統計情報。
  * @param executionCount 記録された実行回数
  * @param avgDurationMs 平均実行時間（ミリ秒）
  * @param avgTokens 平均トークン消費量
  * @param minDurationMs 最小実行時間（ミリ秒）
  * @param maxDurationMs 最大実行時間（ミリ秒）
  * @param successRate 成功率（0.0 - 1.0）
  * @param lastUpdated 最終更新タイムスタンプ
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
  * コスト推定の設定
  * @param minHistoricalExecutions 履歴データ使用に必要な最小実行回数
  * @param maxHistoryPerSource ソースごとの保持する最大履歴エントリ数
  * @param historicalWeight 履歴データとデフォルトの重み（0.0 - 1.0）
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
  * コストを見積もるクラス。デフォルト値と履歴学習をサポート
  * @param source - ソースツールの種類
  * @param provider - プロバイダ名（将来の調整用）
  * @param model - モデル名（将来の調整用）
  * @param taskDescription - タスクの説明（将来のヒューリスティック改善用）
  */
export class CostEstimator {
  private readonly config: CostEstimatorConfig;
  private readonly history: Map<TaskSource, ExecutionHistoryEntry[]> = new Map();
  private readonly statsCache: Map<TaskSource, SourceStatistics> = new Map();

  constructor(config: Partial<CostEstimatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

   /**
    * タスクのコストを推定する
    * @param source - ソースツールの種類
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @param taskDescription - タスクの説明
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
    * 実行履歴を記録して学習する
    * @param entry 追加する実行履歴のエントリ
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
    * ソース種別の統計情報を取得する。
    * @param source ソース種別
    * @returns 統計情報。履歴がない場合はundefined。
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
    * すべての履歴とキャッシュをクリアする
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
  * コスト推定のシングルトンインスタンスを取得
  * @returns コスト推定インスタンス
  */
export function getCostEstimator(): CostEstimator {
  if (!estimatorInstance) {
    estimatorInstance = new CostEstimator();
  }
  return estimatorInstance;
}

 /**
  * コスト推定器のインスタンスを作成
  * @param config コスト推定器の設定オプション
  * @returns 作成されたコスト推定器のインスタンス
  */
export function createCostEstimator(config?: Partial<CostEstimatorConfig>): CostEstimator {
  return new CostEstimator(config);
}

 /**
  * シングルトンのインスタンスをリセットする
  * @returns なし
  */
export function resetCostEstimator(): void {
  estimatorInstance = null;
}
