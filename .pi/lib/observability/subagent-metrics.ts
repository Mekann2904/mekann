/**
 * @abdd.meta
 * path: .pi/lib/observability/subagent-metrics.ts
 * role: サブエージェント実行専用メトリクス収集
 * why: サブエージェントのパフォーマンス・成功率・リソース消費を追跡し、委任戦略の最適化に貢献するため
 * related: .pi/lib/observability/unified-logger.ts, .pi/extensions/subagents.ts
 * public_api: SubagentMetrics, SubagentMetricsCollector, getSubagentMetricsCollector
 * invariants: メトリクスは時系列順に記録される
 * side_effects: メトリクスファイルへの書き込み
 * failure_modes: ディスク容量不足による書き込み失敗
 * @abdd.explain
 * overview: サブエージェント実行のパフォーマンスと成功率を追跡するメトリクスコレクター
 * what_it_does:
 *   - 実行時間分布の追跡（P50/P95/P99）
 *   - 成功率・失敗率の追跡
 *   - エージェントタイプ別統計
 *   - 並列実行効率の追跡
 *   - トークン消費量の追跡
 * why_it_exists:
 *   - 委任戦略の効果測定のため
 *   - ボトルネックとなるエージェントタイプの特定のため
 *   - 並列実行の最適化のため
 * scope:
 *   in: サブエージェント実行イベント（開始・終了・エラー）
 *   out: 集計メトリクス、時系列データ
 */

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getLogger } from "./unified-logger.js";
import { getCurrentTraceContext } from "./async-context.js";
import { percentile, getDateStr, ensureDir, average, successRate } from "./utils.js";
import { DEFAULT_METRICS_DIR } from "./config.js";

// ============================================================================
// Types
// ============================================================================

/**
 * サブエージェント実行イベント
 * @summary サブエージェント実行記録
 */
export interface SubagentExecutionEvent {
  /** タイムスタンプ（ISO 8601） */
  timestamp: string;
  /** トレースID */
  traceId?: string;
  /** 親タスクID */
  parentTaskId?: string;
  /** サブエージェントID */
  subagentId: string;
  /** エージェントタイプ（researcher/implementer/reviewer等） */
  agentType: string;
  /** 実行パターン（parallel/sequential/dag） */
  executionPattern: "parallel" | "sequential" | "dag" | "single";
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** 成功フラグ */
  success: boolean;
  /** エラータイプ（失敗時） */
  errorType?: string;
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
  /** 入力トークン数 */
  inputTokens?: number;
  /** 出力トークン数 */
  outputTokens?: number;
  /** 合計トークン数 */
  totalTokens?: number;
  /** リトライ回数 */
  retryCount?: number;
  /** 並列数（parallel/dagの場合） */
  parallelism?: number;
  /** 追加属性 */
  attributes?: Record<string, unknown>;
}

/**
 * サブエージェントメトリクス
 * @summary 集計メトリクス
 */
export interface SubagentMetrics {
  /** 期間開始時刻 */
  periodStart: string;
  /** 期間終了時刻 */
  periodEnd: string;
  /** 総実行回数 */
  totalExecutions: number;
  /** 成功回数 */
  successExecutions: number;
  /** 失敗回数 */
  failedExecutions: number;
  /** 成功率 */
  successRate: number;
  /** 平均実行時間（ミリ秒） */
  avgDurationMs: number;
  /** P50実行時間（ミリ秒） */
  p50DurationMs: number;
  /** P95実行時間（ミリ秒） */
  p95DurationMs: number;
  /** P99実行時間（ミリ秒） */
  p99DurationMs: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 平均トークン数 */
  avgTokens: number;
  /** 平均リトライ回数 */
  avgRetryCount: number;
  /** 平均並列数 */
  avgParallelism: number;
  /** エージェントタイプ別統計 */
  byAgentType: Record<string, AgentTypeMetrics>;
  /** 実行パターン別統計 */
  byPattern: Record<string, PatternMetrics>;
}

/**
 * エージェントタイプ別メトリクス
 * @summary エージェントタイプ統計
 */
export interface AgentTypeMetrics {
  /** 実行回数 */
  executions: number;
  /** 成功率 */
  successRate: number;
  /** 平均実行時間（ミリ秒） */
  avgDurationMs: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 平均トークン数 */
  avgTokens: number;
}

/**
 * 実行パターン別メトリクス
 * @summary パターン統計
 */
export interface PatternMetrics {
  /** 実行回数 */
  executions: number;
  /** 成功率 */
  successRate: number;
  /** 平均実行時間（ミリ秒） */
  avgDurationMs: number;
  /** 平均並列数 */
  avgParallelism: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_EVENTS = 10000;

// ============================================================================
// Subagent Metrics Collector
// ============================================================================

/**
 * サブエージェントメトリクスコレクター
 * @summary サブエージェント実行メトリクス収集
 */
export class SubagentMetricsCollector {
  private events: SubagentExecutionEvent[] = [];
  private metricsDir: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentDate: string;

  /**
   * コレクターを初期化
   * @summary 初期化
   * @param metricsDir メトリクス保存ディレクトリ
   */
  constructor(metricsDir: string = DEFAULT_METRICS_DIR) {
    this.metricsDir = metricsDir;
    this.currentDate = getDateStr();
    ensureDir(metricsDir);
    this.startFlushTimer();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * サブエージェント実行を記録
   * @summary 実行記録
   * @param event サブエージェント実行イベント
   */
  recordExecution(event: Omit<SubagentExecutionEvent, "timestamp" | "traceId">): void {
    const fullEvent: SubagentExecutionEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      traceId: getCurrentTraceContext()?.traceId,
    };

    this.events.push(fullEvent);
    getLogger().debug("Subagent execution recorded", {
      subagentId: event.subagentId,
      agentType: event.agentType,
      pattern: event.executionPattern,
      durationMs: event.durationMs,
      success: event.success,
    });

    // 日付が変わったらフラッシュ
    const currentDate = getDateStr();
    if (currentDate !== this.currentDate) {
      this.flush();
      this.currentDate = currentDate;
    }

    // 最大件数制限
    if (this.events.length > MAX_EVENTS) {
      this.flush();
    }
  }

  /**
   * 成功したサブエージェント実行を記録
   * @summary 成功記録
   */
  recordSuccess(params: {
    subagentId: string;
    agentType: string;
    executionPattern: SubagentExecutionEvent["executionPattern"];
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    retryCount?: number;
    parallelism?: number;
    attributes?: Record<string, unknown>;
  }): void {
    this.recordExecution({
      ...params,
      totalTokens: (params.inputTokens ?? 0) + (params.outputTokens ?? 0),
      success: true,
    });
  }

  /**
   * 失敗したサブエージェント実行を記録
   * @summary 失敗記録
   */
  recordFailure(params: {
    subagentId: string;
    agentType: string;
    executionPattern: SubagentExecutionEvent["executionPattern"];
    durationMs: number;
    errorType: string;
    errorMessage?: string;
    retryCount?: number;
    attributes?: Record<string, unknown>;
  }): void {
    this.recordExecution({
      ...params,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      success: false,
    });
  }

  /**
   * 期間内のメトリクスを取得
   * @summary メトリクス取得
   * @param periodMs 期間（ミリ秒）
   * @returns 集計メトリクス
   */
  getMetrics(periodMs: number = 3600000): SubagentMetrics {
    const now = Date.now();
    const periodStart = new Date(now - periodMs).toISOString();
    const periodEnd = new Date(now).toISOString();

    const recentEvents = this.events.filter(
      (e) => new Date(e.timestamp).getTime() >= now - periodMs
    );

    return this.aggregateMetrics(recentEvents, periodStart, periodEnd);
  }

  /**
   * エージェントタイプ別のメトリクスを取得
   * @summary タイプ別メトリクス
   * @param agentType エージェントタイプ
   * @param periodMs 期間（ミリ秒）
   * @returns エージェントタイプ別メトリクス
   */
  getMetricsByAgentType(agentType: string, periodMs: number = 3600000): AgentTypeMetrics | undefined {
    const now = Date.now();
    const recentEvents = this.events.filter(
      (e) =>
        new Date(e.timestamp).getTime() >= now - periodMs &&
        e.agentType === agentType
    );

    if (recentEvents.length === 0) return undefined;

    const executions = recentEvents.length;
    const successRate = recentEvents.filter((e) => e.success).length / executions;
    const durations = recentEvents.map((e) => e.durationMs);
    const avgDurationMs = durations.reduce((sum, v) => sum + v, 0) / executions;
    const totalTokens = recentEvents.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);

    return {
      executions,
      successRate,
      avgDurationMs: Math.round(avgDurationMs),
      totalTokens,
      avgTokens: executions > 0 ? Math.round(totalTokens / executions) : 0,
    };
  }

  /**
   * メトリクスをフラッシュ
   * @summary フラッシュ
   */
  flush(): void {
    if (this.events.length === 0) return;

    const events = [...this.events];
    this.events = [];

    const metricsFile = this.getMetricsFilePath();

    try {
      const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      appendFileSync(metricsFile, lines, "utf-8");
    } catch (err) {
      getLogger().error("Failed to flush subagent metrics", err as Error);
    }
  }

  /**
   * コレクターをシャットダウン
   * @summary シャットダウン
   */
  shutdown(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private aggregateMetrics(
    events: SubagentExecutionEvent[],
    periodStart: string,
    periodEnd: string
  ): SubagentMetrics {
    const totalExecutions = events.length;
    const successExecutions = events.filter((e) => e.success).length;
    const failedExecutions = totalExecutions - successExecutions;
    const successRate = totalExecutions > 0 ? successExecutions / totalExecutions : 0;

    const durations = events.map((e) => e.durationMs).sort((a, b) => a - b);
    const avgDurationMs =
      durations.length > 0
        ? durations.reduce((sum, v) => sum + v, 0) / durations.length
        : 0;

    const totalTokens = events.reduce((sum, e) => sum + (e.totalTokens ?? 0), 0);
    const avgTokens = totalExecutions > 0 ? totalTokens / totalExecutions : 0;

    const avgRetryCount =
      totalExecutions > 0
        ? events.reduce((sum, e) => sum + (e.retryCount ?? 0), 0) / totalExecutions
        : 0;

    const parallelEvents = events.filter((e) => e.parallelism !== undefined);
    const avgParallelism =
      parallelEvents.length > 0
        ? parallelEvents.reduce((sum, e) => sum + (e.parallelism ?? 1), 0) / parallelEvents.length
        : 1;

    // エージェントタイプ別集計
    const byAgentType: Record<string, AgentTypeMetrics> = {};
    for (const event of events) {
      if (!byAgentType[event.agentType]) {
        byAgentType[event.agentType] = {
          executions: 0,
          successRate: 0,
          avgDurationMs: 0,
          totalTokens: 0,
          avgTokens: 0,
        };
      }
      const type = byAgentType[event.agentType];
      type.executions++;
      type.totalTokens += event.totalTokens ?? 0;
    }

    // 平均値計算
    for (const type of Object.values(byAgentType)) {
      type.avgTokens = type.executions > 0 ? Math.round(type.totalTokens / type.executions) : 0;
    }

    // 実行パターン別集計
    const byPattern: Record<string, PatternMetrics> = {};
    for (const event of events) {
      const pattern = event.executionPattern;
      if (!byPattern[pattern]) {
        byPattern[pattern] = {
          executions: 0,
          successRate: 0,
          avgDurationMs: 0,
          avgParallelism: 0,
        };
      }
      const p = byPattern[pattern];
      p.executions++;
    }

    return {
      periodStart,
      periodEnd,
      totalExecutions,
      successExecutions,
      failedExecutions,
      successRate,
      avgDurationMs: Math.round(avgDurationMs),
      p50DurationMs: percentile(durations, 50),
      p95DurationMs: percentile(durations, 95),
      p99DurationMs: percentile(durations, 99),
      totalTokens,
      avgTokens: Math.round(avgTokens),
      avgRetryCount: Math.round(avgRetryCount * 10) / 10,
      avgParallelism: Math.round(avgParallelism * 10) / 10,
      byAgentType,
      byPattern,
    };
  }

  private getMetricsFilePath(): string {
    return join(this.metricsDir, `subagent-metrics-${this.currentDate}.jsonl`);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, 60000); // 1分ごと
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalCollector: SubagentMetricsCollector | null = null;

/**
 * グローバルコレクターを取得
 * @summary コレクター取得
 * @returns サブエージェントメトリクスコレクター
 */
export function getSubagentMetricsCollector(): SubagentMetricsCollector {
  if (!globalCollector) {
    globalCollector = new SubagentMetricsCollector();
  }
  return globalCollector;
}

/**
 * コレクターをリセット
 * @summary リセット
 */
export function resetSubagentMetricsCollector(): void {
  if (globalCollector) {
    globalCollector.shutdown();
  }
  globalCollector = null;
}
