/**
 * @abdd.meta
 * path: .pi/lib/observability/config.ts
 * role: Observabilityモジュールの設定管理
 * why: 設定の一元管理と環境変数対応を実現するため
 * related: .pi/lib/observability/*.ts
 * public_api: DEFAULT_CONFIG, getObservabilityConfig, LLM_COSTS
 * invariants: なし
 * side_effects: 環境変数の読み込み
 * failure_modes: 無効な環境変数値
 * @abdd.explain
 * overview: Observability全体の設定を一元管理
 * what_it_does:
 *   - デフォルト設定の提供
 *   - 環境変数からの設定読み込み
 *   - LLM価格表の管理
 *   - アラートしきい値の管理
 * why_it_exists:
 *   - 設定の散在を防ぐため
 *   - 環境ごとの設定変更を容易にするため
 * scope:
 *   in: 環境変数
 *   out: 設定オブジェクト
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { CostConfig } from "./types.js";

// ============================================================================
// Directories
// ============================================================================

/** デフォルトのログディレクトリ */
export const DEFAULT_LOG_DIR = join(homedir(), ".pi-logs");

/** デフォルトのメトリクスディレクトリ */
export const DEFAULT_METRICS_DIR = join(homedir(), ".pi-metrics");

/** デフォルトの相関データディレクトリ */
export const DEFAULT_CORRELATION_DIR = join(homedir(), ".pi-metrics");

// ============================================================================
// LLM Costs (2024年時点の概算)
// ============================================================================

/**
 * LLMモデル別の価格設定
 * @summary 価格表
 */
export const LLM_COSTS: Record<string, CostConfig> = {
  // Anthropic
  "claude-3-5-sonnet": { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
  "claude-3-5-sonnet-20241022": { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
  "claude-sonnet-4-20250514": { inputCostPer1K: 0.003, outputCostPer1K: 0.015 },
  "claude-3-opus": { inputCostPer1K: 0.015, outputCostPer1K: 0.075 },
  "claude-3-opus-20240229": { inputCostPer1K: 0.015, outputCostPer1K: 0.075 },
  "claude-3-haiku": { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },
  "claude-3-haiku-20240307": { inputCostPer1K: 0.00025, outputCostPer1K: 0.00125 },

  // OpenAI
  "gpt-4o": { inputCostPer1K: 0.0025, outputCostPer1K: 0.01 },
  "gpt-4o-2024-05-13": { inputCostPer1K: 0.005, outputCostPer1K: 0.015 },
  "gpt-4o-mini": { inputCostPer1K: 0.00015, outputCostPer1K: 0.0006 },
  "gpt-4-turbo": { inputCostPer1K: 0.01, outputCostPer1K: 0.03 },
  "gpt-4-turbo-2024-04-09": { inputCostPer1K: 0.01, outputCostPer1K: 0.03 },
  "gpt-4": { inputCostPer1K: 0.03, outputCostPer1K: 0.06 },
  "gpt-3.5-turbo": { inputCostPer1K: 0.0005, outputCostPer1K: 0.0015 },
  "gpt-3.5-turbo-0125": { inputCostPer1K: 0.0005, outputCostPer1K: 0.0015 },

  // Google
  "gemini-1.5-pro": { inputCostPer1K: 0.00125, outputCostPer1K: 0.005 },
  "gemini-1.5-flash": { inputCostPer1K: 0.000075, outputCostPer1K: 0.0003 },

  // Default fallback
  "default": { inputCostPer1K: 0.001, outputCostPer1K: 0.002 },
};

/**
 * モデルのコスト設定を取得
 * @summary コスト設定取得
 * @param model モデル名
 * @returns コスト設定
 */
export function getModelCost(model: string): CostConfig {
  // 完全一致を探す
  if (LLM_COSTS[model]) {
    return LLM_COSTS[model];
  }

  // 部分一致を探す（プレフィックス）
  for (const [key, config] of Object.entries(LLM_COSTS)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return config;
    }
  }

  // デフォルト
  return LLM_COSTS["default"]!;
}

// ============================================================================
// Logger Configuration
// ============================================================================

/**
 * ロガー設定
 */
export interface LoggerConfig {
  /** サービス名 */
  serviceName: string;
  /** サービスバージョン */
  serviceVersion: string;
  /** 最小ログレベル */
  minLevel: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  /** ログディレクトリ */
  logDir: string;
  /** コンソール出力 */
  consoleOutput: boolean;
  /** ファイル出力 */
  fileOutput: boolean;
  /** 最大ファイルサイズ（MB） */
  maxFileSizeMB: number;
  /** 整形出力（デバッグ用） */
  prettyPrint: boolean;
  /** トレース自動注入 */
  autoInjectTrace: boolean;
}

/**
 * デフォルトのロガー設定
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  serviceName: "pi-agent",
  serviceVersion: "1.0.0",
  minLevel: "INFO",
  logDir: DEFAULT_LOG_DIR,
  consoleOutput: true,
  fileOutput: true,
  maxFileSizeMB: 10,
  prettyPrint: false,
  autoInjectTrace: true,
};

// ============================================================================
// Metrics Configuration
// ============================================================================

/**
 * メトリクス設定
 */
export interface MetricsConfig {
  /** メトリクス保存ディレクトリ */
  metricsDir: string;
  /** メモリ内最大イベント数 */
  maxEventsInMemory: number;
  /** フラッシュ間隔（ミリ秒） */
  flushIntervalMs: number;
  /** ファイルローテーションサイズ（MB） */
  rotationSizeMB: number;
}

/**
 * デフォルトのメトリクス設定
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  metricsDir: DEFAULT_METRICS_DIR,
  maxEventsInMemory: 10000,
  flushIntervalMs: 60000,
  rotationSizeMB: 10,
};

// ============================================================================
// Dashboard Configuration
// ============================================================================

/**
 * ダッシュボードアラートしきい値
 */
export interface AlertThresholds {
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
}

/**
 * ダッシュボード設定
 */
export interface DashboardConfig {
  /** アラートしきい値 */
  thresholds: AlertThresholds;
  /** キャッシュTTL（ミリ秒） */
  cacheTtlMs: number;
}

/**
 * デフォルトのダッシュボード設定
 */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  thresholds: {
    llmSuccessRateWarning: 0.95,
    llmSuccessRateCritical: 0.90,
    llmLatencyWarningMs: 10000,
    subagentSuccessRateWarning: 0.90,
    subagentSuccessRateCritical: 0.80,
    subagentDurationWarningMs: 60000,
    memoryWarningMB: 500,
  },
  cacheTtlMs: 5000,
};

// ============================================================================
// Environment Variable Configuration
// ============================================================================

/**
 * 環境変数から設定を読み込む
 * @summary 環境変数設定
 * @returns 環境変数ベースの設定オーバーライド
 */
export function getEnvConfig(): Partial<LoggerConfig & MetricsConfig> {
  return {
    // Logger
    minLevel: process.env.PI_LOG_LEVEL as LoggerConfig["minLevel"] | undefined,
    logDir: process.env.PI_LOG_DIR,
    consoleOutput: process.env.PI_CONSOLE_OUTPUT === "false" ? false : undefined,
    fileOutput: process.env.PI_FILE_OUTPUT === "false" ? false : undefined,

    // Metrics
    metricsDir: process.env.PI_METRICS_DIR,
    maxEventsInMemory: process.env.PI_MAX_EVENTS
      ? parseInt(process.env.PI_MAX_EVENTS, 10)
      : undefined,
    flushIntervalMs: process.env.PI_FLUSH_INTERVAL
      ? parseInt(process.env.PI_FLUSH_INTERVAL, 10)
      : undefined,
  };
}

/**
 * 統合設定を取得
 * @summary 統合設定取得
 * @returns デフォルト + 環境変数の統合設定
 */
export function getObservabilityConfig(): {
  logger: LoggerConfig;
  metrics: MetricsConfig;
  dashboard: DashboardConfig;
} {
  const envConfig = getEnvConfig();

  return {
    logger: { ...DEFAULT_LOGGER_CONFIG, ...envConfig },
    metrics: { ...DEFAULT_METRICS_CONFIG, ...envConfig },
    dashboard: DEFAULT_DASHBOARD_CONFIG,
  };
}
