/**
 * @abdd.meta
 * path: .pi/lib/observability/metrics-dashboard.ts
 * role: メトリクスダッシュボードのデータ集約・提供
 * why: Web UIでのメトリクス可視化のためのデータを統一的に提供するため
 * related: .pi/lib/observability/llm-metrics.ts, .pi/lib/observability/subagent-metrics.ts
 * public_api: DashboardData, getDashboardData, DashboardDataProvider
 * invariants: データは一定期間でキャッシュされる
 * side_effects: ファイルシステムからの読み込み
 * failure_modes: データファイルが存在しない場合の空データ返却
 * @abdd.explain
 * overview: Web UIダッシュボード用の統合メトリクスデータプロバイダー
 * what_it_does:
 *   - LLM/サブエージェント/システムメトリクスの統合
 *   - 時系列データの集約
 *   - トレンド分析データの提供
 *   - アラート条件の判定
 * why_it_exists:
 *   - Web UIでの統一ダッシュボード表示のため
 *   - 複数メトリクスソースの統合アクセスポイント提供のため
 * scope:
 *   in: 期間パラメータ、データタイプ
 *   out: 統合ダッシュボードデータ
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLLMMetricsCollector } from "./llm-metrics.js";
import { getSubagentMetricsCollector } from "./subagent-metrics.js";
import { getLogger } from "./unified-logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * ダッシュボードデータ
 * @summary 統合ダッシュボードデータ
 */
export interface DashboardData {
  /** データ生成時刻 */
  timestamp: string;
  /** データ期間（ミリ秒） */
  periodMs: number;
  /** LLMメトリクス */
  llm?: {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
    totalTokens: number;
    estimatedCostUSD: number;
    byProvider: Record<string, { calls: number; successRate: number }>;
    byModel: Record<string, { calls: number; successRate: number }>;
  };
  /** サブエージェントメトリクス */
  subagent?: {
    totalExecutions: number;
    successRate: number;
    avgDurationMs: number;
    avgParallelism: number;
    byAgentType: Record<string, { executions: number; successRate: number }>;
    byPattern: Record<string, { executions: number; successRate: number }>;
  };
  /** システムメトリクス */
  system?: {
    uptime: number;
    memoryUsageMB: number;
    cpuUsagePercent: number;
  };
  /** アラート（条件違反） */
  alerts: DashboardAlert[];
}

/**
 * ダッシュボードアラート
 * @summary アラート情報
 */
export interface DashboardAlert {
  /** アラート種別 */
  type: "warning" | "critical" | "info";
  /** カテゴリ */
  category: "llm" | "subagent" | "system";
  /** アラートメッセージ */
  message: string;
  /** 関連データ */
  data?: Record<string, unknown>;
  /** 発生時刻 */
  timestamp: string;
}

/**
 * ダッシュボード設定
 * @summary 設定
 */
export interface DashboardConfig {
  /** アラートしきい値 */
  thresholds: {
    /** LLM成功率の警告しきい値 */
    llmSuccessRateWarning: number;
    /** LLM成功率の重要しきい値 */
    llmSuccessRateCritical: number;
    /** LLMレイテンシの警告しきい値（ミリ秒） */
    llmLatencyWarningMs: number;
    /** サブエージェント成功率の警告しきい値 */
    subagentSuccessRateWarning: number;
    /** サブエージェント成功率の重要しきい値 */
    subagentSuccessRateCritical: number;
    /** サブエージェント実行時間の警告しきい値（ミリ秒） */
    subagentDurationWarningMs: number;
    /** メモリ使用量の警告しきい値（MB） */
    memoryWarningMB: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: DashboardConfig = {
  thresholds: {
    llmSuccessRateWarning: 0.95,
    llmSuccessRateCritical: 0.90,
    llmLatencyWarningMs: 10000,
    subagentSuccessRateWarning: 0.90,
    subagentSuccessRateCritical: 0.80,
    subagentDurationWarningMs: 60000,
    memoryWarningMB: 500,
  },
};

// ============================================================================
// Dashboard Data Provider
// ============================================================================

/**
 * ダッシュボードデータプロバイダー
 * @summary 統合データ提供
 */
export class DashboardDataProvider {
  private config: DashboardConfig;
  private cache: DashboardData | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5秒キャッシュ

  /**
   * プロバイダーを初期化
   * @summary 初期化
   * @param config ダッシュボード設定
   */
  constructor(config: Partial<DashboardConfig> = {}) {
    this.config = {
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds },
    };
  }

  /**
   * ダッシュボードデータを取得
   * @summary データ取得
   * @param periodMs 期間（ミリ秒）
   * @param useCache キャッシュを使用するか
   * @returns ダッシュボードデータ
   */
  getDashboardData(periodMs: number = 3600000, useCache = true): DashboardData {
    const now = Date.now();

    // キャッシュチェック
    if (useCache && this.cache && now - this.cacheTime < this.CACHE_TTL_MS) {
      return this.cache;
    }

    const data = this.collectData(periodMs);
    this.cache = data;
    this.cacheTime = now;

    return data;
  }

  /**
   * アラートを取得
   * @summary アラート取得
   * @param periodMs 期間（ミリ秒）
   * @returns アラート一覧
   */
  getAlerts(periodMs: number = 3600000): DashboardAlert[] {
    const data = this.getDashboardData(periodMs);
    return data.alerts;
  }

  /**
   * 設定を更新
   * @summary 設定更新
   * @param config 新しい設定
   */
  updateConfig(config: Partial<DashboardConfig>): void {
    this.config = {
      thresholds: { ...this.config.thresholds, ...config.thresholds },
    };
    // キャッシュを無効化
    this.cache = null;
  }

  // ============================================
  // Private Methods
  // ============================================

  private collectData(periodMs: number): DashboardData {
    const alerts: DashboardAlert[] = [];
    const timestamp = new Date().toISOString();

    // LLMメトリクス収集
    let llmData: DashboardData["llm"];
    try {
      const llmCollector = getLLMMetricsCollector();
      const llmMetrics = llmCollector.getMetrics(periodMs);

      llmData = {
        totalCalls: llmMetrics.totalCalls,
        successRate: llmMetrics.successRate,
        avgLatencyMs: llmMetrics.avgLatencyMs,
        totalTokens: llmMetrics.totalTokens,
        estimatedCostUSD: llmMetrics.estimatedCostUSD,
        byProvider: this.simplifyProviderMetrics(llmMetrics.byProvider),
        byModel: this.simplifyModelMetrics(llmMetrics.byModel),
      };

      // LLMアラート判定
      if (llmMetrics.successRate < this.config.thresholds.llmSuccessRateCritical) {
        alerts.push({
          type: "critical",
          category: "llm",
          message: `LLM成功率が重要しきい値を下回っています: ${(llmMetrics.successRate * 100).toFixed(1)}%`,
          timestamp,
        });
      } else if (llmMetrics.successRate < this.config.thresholds.llmSuccessRateWarning) {
        alerts.push({
          type: "warning",
          category: "llm",
          message: `LLM成功率が警告しきい値を下回っています: ${(llmMetrics.successRate * 100).toFixed(1)}%`,
          timestamp,
        });
      }

      if (llmMetrics.avgLatencyMs > this.config.thresholds.llmLatencyWarningMs) {
        alerts.push({
          type: "warning",
          category: "llm",
          message: `LLM平均レイテンシが高すぎます: ${llmMetrics.avgLatencyMs}ms`,
          timestamp,
        });
      }
    } catch (err) {
      getLogger().warn("Failed to collect LLM metrics", { error: String(err) });
    }

    // サブエージェントメトリクス収集
    let subagentData: DashboardData["subagent"];
    try {
      const subagentCollector = getSubagentMetricsCollector();
      const subagentMetrics = subagentCollector.getMetrics(periodMs);

      subagentData = {
        totalExecutions: subagentMetrics.totalExecutions,
        successRate: subagentMetrics.successRate,
        avgDurationMs: subagentMetrics.avgDurationMs,
        avgParallelism: subagentMetrics.avgParallelism,
        byAgentType: this.simplifyAgentTypeMetrics(subagentMetrics.byAgentType),
        byPattern: this.simplifyPatternMetrics(subagentMetrics.byPattern),
      };

      // サブエージェントアラート判定
      if (subagentMetrics.successRate < this.config.thresholds.subagentSuccessRateCritical) {
        alerts.push({
          type: "critical",
          category: "subagent",
          message: `サブエージェント成功率が重要しきい値を下回っています: ${(subagentMetrics.successRate * 100).toFixed(1)}%`,
          timestamp,
        });
      } else if (subagentMetrics.successRate < this.config.thresholds.subagentSuccessRateWarning) {
        alerts.push({
          type: "warning",
          category: "subagent",
          message: `サブエージェント成功率が警告しきい値を下回っています: ${(subagentMetrics.successRate * 100).toFixed(1)}%`,
          timestamp,
        });
      }

      if (subagentMetrics.avgDurationMs > this.config.thresholds.subagentDurationWarningMs) {
        alerts.push({
          type: "warning",
          category: "subagent",
          message: `サブエージェント平均実行時間が長すぎます: ${subagentMetrics.avgDurationMs}ms`,
          timestamp,
        });
      }
    } catch (err) {
      getLogger().warn("Failed to collect subagent metrics", { error: String(err) });
    }

    // システムメトリクス収集
    const systemData: DashboardData["system"] = {
      uptime: process.uptime(),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      cpuUsagePercent: 0, // CPU使用率は非同期取得が必要
    };

    // メモリアラート判定
    if (systemData.memoryUsageMB > this.config.thresholds.memoryWarningMB) {
      alerts.push({
        type: "warning",
        category: "system",
        message: `メモリ使用量が警告しきい値を超えています: ${systemData.memoryUsageMB}MB`,
        timestamp,
      });
    }

    return {
      timestamp,
      periodMs,
      llm: llmData,
      subagent: subagentData,
      system: systemData,
      alerts,
    };
  }

  private simplifyProviderMetrics(
    metrics: Record<string, { calls: number; successRate: number }>
  ): Record<string, { calls: number; successRate: number }> {
    const result: Record<string, { calls: number; successRate: number }> = {};
    for (const [key, value] of Object.entries(metrics)) {
      result[key] = {
        calls: value.calls,
        successRate: value.successRate,
      };
    }
    return result;
  }

  private simplifyModelMetrics(
    metrics: Record<string, { calls: number; successRate: number }>
  ): Record<string, { calls: number; successRate: number }> {
    const result: Record<string, { calls: number; successRate: number }> = {};
    for (const [key, value] of Object.entries(metrics)) {
      result[key] = {
        calls: value.calls,
        successRate: value.successRate,
      };
    }
    return result;
  }

  private simplifyAgentTypeMetrics(
    metrics: Record<string, { executions: number; successRate: number }>
  ): Record<string, { executions: number; successRate: number }> {
    const result: Record<string, { executions: number; successRate: number }> = {};
    for (const [key, value] of Object.entries(metrics)) {
      result[key] = {
        executions: value.executions,
        successRate: value.successRate,
      };
    }
    return result;
  }

  private simplifyPatternMetrics(
    metrics: Record<string, { executions: number; successRate: number }>
  ): Record<string, { executions: number; successRate: number }> {
    const result: Record<string, { executions: number; successRate: number }> = {};
    for (const [key, value] of Object.entries(metrics)) {
      result[key] = {
        executions: value.executions,
        successRate: value.successRate,
      };
    }
    return result;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalProvider: DashboardDataProvider | null = null;

/**
 * グローバルプロバイダーを取得
 * @summary プロバイダー取得
 * @returns ダッシュボードデータプロバイダー
 */
export function getDashboardDataProvider(): DashboardDataProvider {
  if (!globalProvider) {
    globalProvider = new DashboardDataProvider();
  }
  return globalProvider;
}

/**
 * プロバイダーをリセット
 * @summary リセット
 */
export function resetDashboardDataProvider(): void {
  globalProvider = null;
}
