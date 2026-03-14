/**
 * @abdd.meta
 * path: .pi/lib/observability/llm-metrics.ts
 * role: LLM呼び出し専用メトリクス収集
 * why: LLM APIのパフォーマンス・コスト・品質を追跡し、最適化のためのデータを提供するため
 * related: .pi/lib/observability/unified-logger.ts, .pi/lib/analytics/metric-collectors.ts
 * public_api: LLMMetrics, LLMMetricsCollector, getLLMMetricsCollector
 * invariants: メトリクスは時系列順に記録される
 * side_effects: メトリクスファイルへの書き込み
 * failure_modes: ディスク容量不足による書き込み失敗
 * @abdd.explain
 * overview: LLM API呼び出しのパフォーマンスとコストを追跡するメトリクスコレクター
 * what_it_does:
 *   - レイテンシ分布の追跡（P50/P95/P99）
 *   - トークン消費量の追跡（入力/出力/合計）
 *   - コスト推定（プロバイダ・モデル別）
 *   - エラー率の追跡
 *   - キャッシュヒット率の追跡
 * why_it_exists:
 *   - LLM APIコストの可視化と最適化のため
 *   - レイテンシ異常の早期検出のため
 *   - プロバイダ比較のためのデータ収集のため
 * scope:
 *   in: LLM呼び出しイベント（開始・終了・エラー）
 *   out: 集計メトリクス、時系列データ
 */

import { existsSync, mkdirSync, appendFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "./unified-logger.js";
import { getCurrentTraceContext } from "./async-context.js";

// ============================================================================
// Types
// ============================================================================

/**
 * LLM呼び出しイベント
 * @summary LLM呼び出し記録
 */
export interface LLMCallEvent {
  /** タイムスタンプ（ISO 8601） */
  timestamp: string;
  /** トレースID */
  traceId?: string;
  /** プロバイダ名 */
  provider: string;
  /** モデル名 */
  model: string;
  /** 入力トークン数 */
  inputTokens: number;
  /** 出力トークン数 */
  outputTokens: number;
  /** 合計トークン数 */
  totalTokens: number;
  /** レイテンシ（ミリ秒） */
  latencyMs: number;
  /** 成功フラグ */
  success: boolean;
  /** エラータイプ（失敗時） */
  errorType?: string;
  /** キャッシュヒットフラグ */
  cacheHit?: boolean;
  /** 思考レベル */
  thinkingLevel?: string;
  /** 追加属性 */
  attributes?: Record<string, unknown>;
}

/**
 * LLMメトリクス
 * @summary 集計メトリクス
 */
export interface LLMMetrics {
  /** 期間開始時刻 */
  periodStart: string;
  /** 期間終了時刻 */
  periodEnd: string;
  /** 総呼び出し回数 */
  totalCalls: number;
  /** 成功回数 */
  successCalls: number;
  /** 失敗回数 */
  failedCalls: number;
  /** 成功率 */
  successRate: number;
  /** 平均レイテンシ（ミリ秒） */
  avgLatencyMs: number;
  /** P50レイテンシ（ミリ秒） */
  p50LatencyMs: number;
  /** P95レイテンシ（ミリ秒） */
  p95LatencyMs: number;
  /** P99レイテンシ（ミリ秒） */
  p99LatencyMs: number;
  /** 総入力トークン数 */
  totalInputTokens: number;
  /** 総出力トークン数 */
  totalOutputTokens: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 平均入力トークン数 */
  avgInputTokens: number;
  /** 平均出力トークン数 */
  avgOutputTokens: number;
  /** キャッシュヒット数 */
  cacheHits: number;
  /** キャッシュヒット率 */
  cacheHitRate: number;
  /** 推定コスト（USD） */
  estimatedCostUSD: number;
  /** プロバイダ別統計 */
  byProvider: Record<string, ProviderMetrics>;
  /** モデル別統計 */
  byModel: Record<string, ModelMetrics>;
}

/**
 * プロバイダ別メトリクス
 * @summary プロバイダ統計
 */
export interface ProviderMetrics {
  /** 呼び出し回数 */
  calls: number;
  /** 成功率 */
  successRate: number;
  /** 平均レイテンシ（ミリ秒） */
  avgLatencyMs: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 推定コスト（USD） */
  estimatedCostUSD: number;
}

/**
 * モデル別メトリクス
 * @summary モデル統計
 */
export interface ModelMetrics {
  /** 呼び出し回数 */
  calls: number;
  /** 成功率 */
  successRate: number;
  /** 平均レイテンシ（ミリ秒） */
  avgLatencyMs: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 推定コスト（USD） */
  estimatedCostUSD: number;
}

/**
 * コスト設定
 * @summary 価格定義
 */
export interface CostConfig {
  /** 入力トークン単価（USD/1K tokens） */
  inputCostPer1K: number;
  /** 出力トークン単価（USD/1K tokens） */
  outputCostPer1K: number;
}

// ============================================================================
// Constants
// ============================================================================

/** デフォルトの価格設定（2024年時点の概算） */
const DEFAULT_COSTS: Record<string, CostConfig> = {
  // Anthropic
  "claude-3-5-sonnet": { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
  "claude-3-opus": { inputCostPer1K: 0.015, outputCostPer1K: 0.075 },
  "claude-3-haiku": { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },
  // OpenAI
  "gpt-4o": { inputCostPer1K: 0.0025, outputCostPer1K: 0.01 },
  "gpt-4-turbo": { inputCostPer1K: 0.01, outputCostPer1K: 0.03 },
  "gpt-3.5-turbo": { inputCostPer1K: 0.0005, outputCostPer1K: 0.0015 },
};

const DEFAULT_METRICS_DIR = join(homedir(), ".pi-metrics");
const MAX_EVENTS = 10000;

// ============================================================================
// LLM Metrics Collector
// ============================================================================

/**
 * LLMメトリクスコレクター
 * @summary LLM呼び出しメトリクス収集
 */
export class LLMMetricsCollector {
  private events: LLMCallEvent[] = [];
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
    this.currentDate = this.getDateStr();
    this.ensureMetricsDir();
    this.startFlushTimer();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * LLM呼び出しを記録
   * @summary 呼び出し記録
   * @param event LLM呼び出しイベント
   */
  recordCall(event: Omit<LLMCallEvent, "timestamp" | "traceId">): void {
    const fullEvent: LLMCallEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      traceId: getCurrentTraceContext()?.traceId,
    };

    this.events.push(fullEvent);
    getLogger().debug("LLM call recorded", {
      provider: event.provider,
      model: event.model,
      latencyMs: event.latencyMs,
      success: event.success,
    });

    // 日付が変わったらフラッシュ
    const currentDate = this.getDateStr();
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
   * 成功したLLM呼び出しを記録
   * @summary 成功記録
   */
  recordSuccess(params: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cacheHit?: boolean;
    thinkingLevel?: string;
    attributes?: Record<string, unknown>;
  }): void {
    this.recordCall({
      ...params,
      totalTokens: params.inputTokens + params.outputTokens,
      success: true,
    });
  }

  /**
   * 失敗したLLM呼び出しを記録
   * @summary 失敗記録
   */
  recordFailure(params: {
    provider: string;
    model: string;
    latencyMs: number;
    errorType: string;
    attributes?: Record<string, unknown>;
  }): void {
    this.recordCall({
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
  getMetrics(periodMs: number = 3600000): LLMMetrics {
    const now = Date.now();
    const periodStart = new Date(now - periodMs).toISOString();
    const periodEnd = new Date(now).toISOString();

    const recentEvents = this.events.filter(
      (e) => new Date(e.timestamp).getTime() >= now - periodMs
    );

    return this.aggregateMetrics(recentEvents, periodStart, periodEnd);
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
      getLogger().error("Failed to flush LLM metrics", err as Error);
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
    events: LLMCallEvent[],
    periodStart: string,
    periodEnd: string
  ): LLMMetrics {
    const totalCalls = events.length;
    const successCalls = events.filter((e) => e.success).length;
    const failedCalls = totalCalls - successCalls;
    const successRate = totalCalls > 0 ? successCalls / totalCalls : 0;

    const latencies = events.map((e) => e.latencyMs).sort((a, b) => a - b);
    const avgLatencyMs =
      latencies.length > 0
        ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length
        : 0;

    const totalInputTokens = events.reduce((sum, e) => sum + e.inputTokens, 0);
    const totalOutputTokens = events.reduce((sum, e) => sum + e.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;

    const cacheHits = events.filter((e) => e.cacheHit).length;
    const cacheHitRate = totalCalls > 0 ? cacheHits / totalCalls : 0;

    // 推定コスト計算
    let estimatedCostUSD = 0;
    for (const event of events) {
      estimatedCostUSD += this.calculateCost(event);
    }

    // プロバイダ別・モデル別集計
    const byProvider: Record<string, ProviderMetrics> = {};
    const byModel: Record<string, ModelMetrics> = {};

    for (const event of events) {
      // プロバイダ別
      if (!byProvider[event.provider]) {
        byProvider[event.provider] = {
          calls: 0,
          successRate: 0,
          avgLatencyMs: 0,
          totalTokens: 0,
          estimatedCostUSD: 0,
        };
      }
      const provider = byProvider[event.provider];
      provider.calls++;
      provider.totalTokens += event.totalTokens;
      provider.estimatedCostUSD += this.calculateCost(event);

      // モデル別
      const modelKey = `${event.provider}/${event.model}`;
      if (!byModel[modelKey]) {
        byModel[modelKey] = {
          calls: 0,
          successRate: 0,
          avgLatencyMs: 0,
          totalTokens: 0,
          estimatedCostUSD: 0,
        };
      }
      const model = byModel[modelKey];
      model.calls++;
      model.totalTokens += event.totalTokens;
      model.estimatedCostUSD += this.calculateCost(event);
    }

    // 平均値計算
    for (const provider of Object.values(byProvider)) {
      provider.successRate = provider.calls > 0 ? 1 : 0; // 簡易版
    }

    for (const model of Object.values(byModel)) {
      model.successRate = model.calls > 0 ? 1 : 0; // 簡易版
    }

    return {
      periodStart,
      periodEnd,
      totalCalls,
      successCalls,
      failedCalls,
      successRate,
      avgLatencyMs: Math.round(avgLatencyMs),
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      avgInputTokens: totalCalls > 0 ? Math.round(totalInputTokens / totalCalls) : 0,
      avgOutputTokens: totalCalls > 0 ? Math.round(totalOutputTokens / totalCalls) : 0,
      cacheHits,
      cacheHitRate,
      estimatedCostUSD: Math.round(estimatedCostUSD * 10000) / 10000,
      byProvider,
      byModel,
    };
  }

  private calculateCost(event: LLMCallEvent): number {
    const costConfig = DEFAULT_COSTS[event.model] ?? {
      inputCostPer1K: 0.001,
      outputCostPer1K: 0.002,
    };

    const inputCost = (event.inputTokens / 1000) * costConfig.inputCostPer1K;
    const outputCost = (event.outputTokens / 1000) * costConfig.outputCostPer1K;

    return inputCost + outputCost;
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const index = Math.min(
      sortedValues.length - 1,
      Math.floor((p / 100) * sortedValues.length)
    );
    return sortedValues[index] ?? 0;
  }

  private ensureMetricsDir(): void {
    if (!existsSync(this.metricsDir)) {
      mkdirSync(this.metricsDir, { recursive: true });
    }
  }

  private getMetricsFilePath(): string {
    return join(this.metricsDir, `llm-metrics-${this.currentDate}.jsonl`);
  }

  private getDateStr(): string {
    return new Date().toISOString().slice(0, 10);
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

let globalCollector: LLMMetricsCollector | null = null;

/**
 * グローバルコレクターを取得
 * @summary コレクター取得
 * @returns LLMメトリクスコレクター
 */
export function getLLMMetricsCollector(): LLMMetricsCollector {
  if (!globalCollector) {
    globalCollector = new LLMMetricsCollector();
  }
  return globalCollector;
}

/**
 * コレクターをリセット
 * @summary リセット
 */
export function resetLLMMetricsCollector(): void {
  if (globalCollector) {
    globalCollector.shutdown();
  }
  globalCollector = null;
}
