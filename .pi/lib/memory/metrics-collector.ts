/**
 * @abdd.meta
 * path: .pi/lib/memory/metrics-collector.ts
 * role: 操作レベルのレイテンシ・コスト測定モジュール
 * why: メモリ操作のパフォーマンスとコストを追跡し、システム健全性を監視するため
 * related: .pi/lib/memory/semantic-evaluator.ts, .pi/lib/memory/context-saturation-gap.ts, .pi/skills/alma-memory/SKILL.md
 * public_api: startOperation, endOperation, failOperation, getMetricsSummary, getMetricsHistory, resetMetrics, exportMetricsJson, calculatePercentile, estimateCost
 * invariants: durationMs >= 0, sampleRate 0-1, tokens >= 0
 * side_effects: ファイル書き込み（永続化時）
 * failure_modes: ディスクfull、パーセンタイル計算の空配列エラー
 * @abdd.explain
 * overview: 論文「Anatomy of Agentic Memory」Table 5に基づく操作レベルメトリクス収集
 * what_it_does:
 *   - Retrieval/Generation/Maintenance各フェーズのレイテンシ測定
 *   - トークン消費の追跡とコスト推定
 *   - パーセンタイル計算（p50, p95, p99）
 *   - スループット健康状態の判定
 *   - メトリクスの永続化とエクスポート
 * why_it_exists:
 *   - User-Facing Latency (T_read + T_gen) の可視化
 *   - Construction Cost (T_write) の追跡
 *   - Token Economics の監視
 *   - システムパフォーマンスの継続的改善
 * scope:
 *   in: 操作開始/終了イベント、トークン使用量、設定
 *   out: メトリクスサマリー、履歴、JSONエクスポート
 */

// File: .pi/lib/memory/metrics-collector.ts
// Description: Operation-level latency and cost measurement for agentic memory systems.
// Why: Track performance and costs based on "Anatomy of Agentic Memory" Table 5.
// Related: semantic-evaluator.ts, context-saturation-gap.ts, alma-memory skill

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 操作フェーズの種類
 * @summary メモリ操作の3つの主要フェーズ
 */
export type OperationPhase = "retrieval" | "generation" | "maintenance";

/**
 * 操作メトリクス
 * @summary 単一操作のレイテンシ・コスト情報
 * @param phase - 操作フェーズ
 * @param operationName - 操作名
 * @param startTime - 開始時刻（Unix timestamp ms）
 * @param endTime - 終了時刻（Unix timestamp ms）
 * @param durationMs - 所要時間（ミリ秒）
 * @param tokensUsed - トークン使用量（オプション）
 * @param success - 成功フラグ
 * @param errorMessage - エラーメッセージ（失敗時）
 */
export interface OperationMetrics {
  /** 操作フェーズ */
  phase: OperationPhase;
  /** 操作名 */
  operationName: string;
  /** 開始時刻（Unix timestamp ms） */
  startTime: number;
  /** 終了時刻（Unix timestamp ms） */
  endTime: number;
  /** 所要時間（ミリ秒） */
  durationMs: number;
  /** トークン使用量（オプション） */
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  /** 成功フラグ */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
}

/**
 * システムメトリクスサマリー
 * @summary 全操作の集計メトリクス
 * @param timestamp - サマリー生成時刻
 * @param totalOperations - 総操作数
 * @param avgRetrievalLatencyMs - 平均取得レイテンシ
 * @param avgGenerationLatencyMs - 平均生成レイテンシ
 * @param avgTotalUserLatencyMs - 平均ユーザー体感レイテンシ
 * @param p50LatencyMs - 50パーセンタイルレイテンシ
 * @param p95LatencyMs - 95パーセンタイルレイテンシ
 * @param p99LatencyMs - 99パーセンタイルレイテンシ
 * @param avgMaintenanceLatencyMs - 平均メンテナンスレイテンシ
 * @param totalMaintenanceTimeMs - 総メンテナンス時間
 * @param totalInputTokens - 総入力トークン数
 * @param totalOutputTokens - 総出力トークン数
 * @param totalTokens - 総トークン数
 * @param estimatedCostUsd - 推定コスト（USD）
 * @param operationsPerSecond - 秒間操作数
 * @param throughputHealth - スループット健全状態
 */
export interface SystemMetricsSummary {
  /** サマリー生成時刻（ISO形式） */
  timestamp: string;
  /** 総操作数 */
  totalOperations: number;
  /** 平均取得レイテンシ（ms） - T_read */
  avgRetrievalLatencyMs: number;
  /** 平均生成レイテンシ（ms） - T_gen */
  avgGenerationLatencyMs: number;
  /** 平均ユーザー体感レイテンシ（ms） - T_read + T_gen */
  avgTotalUserLatencyMs: number;
  /** 50パーセンタイルレイテンシ（ms） */
  p50LatencyMs: number;
  /** 95パーセンタイルレイテンシ（ms） */
  p95LatencyMs: number;
  /** 99パーセンタイルレイテンシ（ms） */
  p99LatencyMs: number;
  /** 平均メンテナンスレイテンシ（ms） - T_write */
  avgMaintenanceLatencyMs: number;
  /** 総メンテナンス時間（ms） - Construction Time */
  totalMaintenanceTimeMs: number;
  /** 総入力トークン数 */
  totalInputTokens: number;
  /** 総出力トークン数 */
  totalOutputTokens: number;
  /** 総トークン数 */
  totalTokens: number;
  /** 推定コスト（USD） */
  estimatedCostUsd: number;
  /** 秒間操作数 */
  operationsPerSecond: number;
  /** スループット健全状態 */
  throughputHealth: "healthy" | "degraded" | "critical";
}

/**
 * メトリクス収集設定
 * @summary 収集動作の設定
 * @param enabled - 収集有効フラグ
 * @param sampleRate - サンプリングレート（0-1）
 * @param storagePath - 永続化パス
 * @param retentionDays - 保持期間（日）
 */
export interface MetricsCollectorConfig {
  /** 収集有効フラグ */
  enabled: boolean;
  /** サンプリングレート（0-1、デフォルト1.0） */
  sampleRate: number;
  /** 永続化パス */
  storagePath: string;
  /** 保持期間（日） */
  retentionDays: number;
}

/**
 * モデル別価格設定
 * @summary トークン単価（USD per 1K tokens）
 */
export interface ModelPricing {
  inputCostPer1k: number;
  outputCostPer1k: number;
}

// ============================================================================
// Internal State
// ============================================================================

/** 進行中の操作マップ */
const activeOperations: Map<string, Omit<OperationMetrics, "endTime" | "durationMs" | "success">> = new Map();

/** 完了した操作履歴 */
const completedOperations: OperationMetrics[] = [];

/** デフォルト設定 */
const defaultConfig: MetricsCollectorConfig = {
  enabled: true,
  sampleRate: 1.0,
  storagePath: ".pi/data/metrics/",
  retentionDays: 30,
};

/** 現在の設定 */
let config: MetricsCollectorConfig = { ...defaultConfig };

/** 操作IDカウンター */
let operationIdCounter = 0;

/** モデル別価格表（2024年概算） */
const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4": { inputCostPer1k: 0.03, outputCostPer1k: 0.06 },
  "gpt-4-turbo": { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
  "gpt-3.5-turbo": { inputCostPer1k: 0.0005, outputCostPer1k: 0.0015 },
  "claude-3-opus": { inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
  "claude-3-sonnet": { inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
  "claude-3-haiku": { inputCostPer1k: 0.00025, outputCostPer1k: 0.00125 },
  "gemini-pro": { inputCostPer1k: 0.00025, outputCostPer1k: 0.0005 },
  default: { inputCostPer1k: 0.01, outputCostPer1k: 0.03 },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 操作の開始を記録
 * @summary 新しい操作を開始し、操作IDを返す
 * @param phase - 操作フェーズ
 * @param name - 操作名
 * @returns 操作ID（終了時に使用）
 */
export function startOperation(phase: OperationPhase, name: string): string {
  if (!config.enabled) {
    return "";
  }

  // サンプリングチェック
  if (config.sampleRate < 1.0 && Math.random() > config.sampleRate) {
    return "";
  }

  const operationId = `op_${Date.now()}_${++operationIdCounter}`;
  const startTime = performance.now();

  activeOperations.set(operationId, {
    phase,
    operationName: name,
    startTime,
  });

  return operationId;
}

/**
 * 操作の終了を記録
 * @summary 操作を正常終了として記録
 * @param operationId - 操作ID
 * @param tokens - トークン使用量（オプション）
 */
export function endOperation(
  operationId: string,
  tokens?: OperationMetrics["tokensUsed"]
): void {
  if (!operationId || !activeOperations.has(operationId)) {
    return;
  }

  const operation = activeOperations.get(operationId)!;
  const endTime = performance.now();
  const durationMs = endTime - operation.startTime;

  const metrics: OperationMetrics = {
    ...operation,
    endTime,
    durationMs,
    tokensUsed: tokens,
    success: true,
  };

  completedOperations.push(metrics);
  activeOperations.delete(operationId);
}

/**
 * 操作の失敗を記録
 * @summary 操作を失敗として記録
 * @param operationId - 操作ID
 * @param error - エラーメッセージ
 */
export function failOperation(operationId: string, error: string): void {
  if (!operationId || !activeOperations.has(operationId)) {
    return;
  }

  const operation = activeOperations.get(operationId)!;
  const endTime = performance.now();
  const durationMs = endTime - operation.startTime;

  const metrics: OperationMetrics = {
    ...operation,
    endTime,
    durationMs,
    success: false,
    errorMessage: error,
  };

  completedOperations.push(metrics);
  activeOperations.delete(operationId);
}

/**
 * メトリクスサマリーを取得
 * @summary 全操作の集計メトリクスを返す
 * @returns システムメトリクスサマリー
 */
export function getMetricsSummary(): SystemMetricsSummary {
  const now = new Date().toISOString();
  const totalOperations = completedOperations.length;

  if (totalOperations === 0) {
    return {
      timestamp: now,
      totalOperations: 0,
      avgRetrievalLatencyMs: 0,
      avgGenerationLatencyMs: 0,
      avgTotalUserLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      avgMaintenanceLatencyMs: 0,
      totalMaintenanceTimeMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      operationsPerSecond: 0,
      throughputHealth: "healthy",
    };
  }

  // フェーズ別に分類
  const retrievalOps = completedOperations.filter((op) => op.phase === "retrieval");
  const generationOps = completedOperations.filter((op) => op.phase === "generation");
  const maintenanceOps = completedOperations.filter((op) => op.phase === "maintenance");

  // 平均レイテンシ計算
  const avgRetrievalLatencyMs = retrievalOps.length > 0
    ? retrievalOps.reduce((sum, op) => sum + op.durationMs, 0) / retrievalOps.length
    : 0;

  const avgGenerationLatencyMs = generationOps.length > 0
    ? generationOps.reduce((sum, op) => sum + op.durationMs, 0) / generationOps.length
    : 0;

  const avgMaintenanceLatencyMs = maintenanceOps.length > 0
    ? maintenanceOps.reduce((sum, op) => sum + op.durationMs, 0) / maintenanceOps.length
    : 0;

  const totalMaintenanceTimeMs = maintenanceOps.reduce((sum, op) => sum + op.durationMs, 0);

  // 全レイテンシのパーセンタイル
  const allDurations = completedOperations.map((op) => op.durationMs).sort((a, b) => a - b);
  const p50LatencyMs = calculatePercentile(allDurations, 50);
  const p95LatencyMs = calculatePercentile(allDurations, 95);
  const p99LatencyMs = calculatePercentile(allDurations, 99);

  // トークン集計
  const totalInputTokens = completedOperations
    .filter((op) => op.tokensUsed)
    .reduce((sum, op) => sum + (op.tokensUsed?.input ?? 0), 0);

  const totalOutputTokens = completedOperations
    .filter((op) => op.tokensUsed)
    .reduce((sum, op) => sum + (op.tokensUsed?.output ?? 0), 0);

  const totalTokens = totalInputTokens + totalOutputTokens;

  // コスト推定（デフォルトモデル使用）
  const estimatedCostUsd = estimateCost(totalInputTokens, totalOutputTokens, "default");

  // スループット計算
  const timeSpanMs = completedOperations.length > 1
    ? completedOperations[completedOperations.length - 1].endTime - completedOperations[0].startTime
    : 1000;
  const operationsPerSecond = (totalOperations / timeSpanMs) * 1000;

  // 健全状態判定
  const throughputHealth = determineThroughputHealth(operationsPerSecond, p95LatencyMs);

  return {
    timestamp: now,
    totalOperations,
    avgRetrievalLatencyMs,
    avgGenerationLatencyMs,
    avgTotalUserLatencyMs: avgRetrievalLatencyMs + avgGenerationLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    avgMaintenanceLatencyMs,
    totalMaintenanceTimeMs,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    estimatedCostUsd,
    operationsPerSecond,
    throughputHealth,
  };
}

/**
 * メトリクス履歴を取得
 * @summary 過去の操作メトリクスを返す
 * @param limit - 取得件数（デフォルト100）
 * @returns 操作メトリクスの配列
 */
export function getMetricsHistory(limit: number = 100): OperationMetrics[] {
  return completedOperations.slice(-limit);
}

/**
 * メトリクスをリセット
 * @summary 全てのメトリクスをクリア
 */
export function resetMetrics(): void {
  completedOperations.length = 0;
  activeOperations.clear();
  operationIdCounter = 0;
}

/**
 * メトリクスをJSONでエクスポート
 * @summary 全メトリクスをJSON文字列で出力
 * @returns JSON文字列
 */
export function exportMetricsJson(): string {
  const summary = getMetricsSummary();
  const history = getMetricsHistory();

  return JSON.stringify({
    summary,
    history,
    config,
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * パーセンタイルを計算
 * @summary ソート済み配列から指定パーセンタイル値を取得
 * @param values - ソート済み数値配列
 * @param percentile - パーセンタイル（0-100）
 * @returns パーセンタイル値
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  if (values.length === 1) {
    return values[0];
  }

  // 線形補間を使用
  const index = (percentile / 100) * (values.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (upper >= values.length) {
    return values[values.length - 1];
  }

  return values[lower] * (1 - weight) + values[upper] * weight;
}

/**
 * コストを推定
 * @summary トークン数からUSD換算のコストを計算
 * @param inputTokens - 入力トークン数
 * @param outputTokens - 出力トークン数
 * @param model - モデル名
 * @returns 推定コスト（USD）
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING.default;
  const inputCost = (inputTokens / 1000) * pricing.inputCostPer1k;
  const outputCost = (outputTokens / 1000) * pricing.outputCostPer1k;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * 設定を更新
 * @summary メトリクス収集の設定を変更
 * @param newConfig - 新しい設定（部分更新可）
 */
export function updateConfig(newConfig: Partial<MetricsCollectorConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * 現在の設定を取得
 * @summary メトリクス収集の現在の設定を返す
 * @returns 現在の設定
 */
export function getConfig(): MetricsCollectorConfig {
  return { ...config };
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * スループット健全状態を判定
 * @summary 操作/秒とp95レイテンシに基づいて健全状態を決定
 * @param opsPerSecond - 秒間操作数
 * @param p95Latency - 95パーセンタイルレイテンシ
 * @returns 健全状態
 */
function determineThroughputHealth(
  opsPerSecond: number,
  p95Latency: number
): "healthy" | "degraded" | "critical" {
  // しきい値（調整可能）
  const OPS_HEALTHY_THRESHOLD = 10;
  const OPS_DEGRADED_THRESHOLD = 1;
  const LATENCY_HEALTHY_THRESHOLD = 1000; // 1秒
  const LATENCY_CRITICAL_THRESHOLD = 5000; // 5秒

  // スループットチェック
  if (opsPerSecond < OPS_DEGRADED_THRESHOLD || p95Latency > LATENCY_CRITICAL_THRESHOLD) {
    return "critical";
  }

  if (opsPerSecond < OPS_HEALTHY_THRESHOLD || p95Latency > LATENCY_HEALTHY_THRESHOLD) {
    return "degraded";
  }

  return "healthy";
}

/**
 * 期限切れメトリクスをクリーンアップ
 * @summary 保持期間を超えたメトリクスを削除
 * @param retentionDays - 保持期間（日）
 * @param referenceTime - 基準時刻（省略時は現在時刻）
 */
export function cleanupExpiredMetrics(retentionDays: number, referenceTime?: number): number {
  const now = referenceTime ?? Date.now();
  const cutoffTimeMs = retentionDays * 24 * 60 * 60 * 1000;
  const initialLength = completedOperations.length;

  // 最初の操作を基準に相対的な期限切れ判定を行う
  if (initialLength === 0) {
    return 0;
  }

  // 最新の操作時刻を基準として、保持期間より古い操作を削除
  const latestEndTime = Math.max(...completedOperations.map(op => op.endTime));
  const cutoff = latestEndTime - cutoffTimeMs;

  const validOperations = completedOperations.filter((op) => {
    return op.endTime >= cutoff;
  });

  completedOperations.length = 0;
  completedOperations.push(...validOperations);

  return initialLength - completedOperations.length;
}

/**
 * フェーズ別統計を取得
 * @summary 各フェーズの詳細統計を返す
 * @returns フェーズ別統計オブジェクト
 */
export function getPhaseStatistics(): Record<OperationPhase, {
  count: number;
  avgDurationMs: number;
  totalDurationMs: number;
  successRate: number;
}> {
  const phases: OperationPhase[] = ["retrieval", "generation", "maintenance"];
  const stats: Record<OperationPhase, {
    count: number;
    avgDurationMs: number;
    totalDurationMs: number;
    successRate: number;
  }> = {
    retrieval: { count: 0, avgDurationMs: 0, totalDurationMs: 0, successRate: 0 },
    generation: { count: 0, avgDurationMs: 0, totalDurationMs: 0, successRate: 0 },
    maintenance: { count: 0, avgDurationMs: 0, totalDurationMs: 0, successRate: 0 },
  };

  for (const phase of phases) {
    const ops = completedOperations.filter((op) => op.phase === phase);
    if (ops.length > 0) {
      stats[phase] = {
        count: ops.length,
        avgDurationMs: ops.reduce((sum, op) => sum + op.durationMs, 0) / ops.length,
        totalDurationMs: ops.reduce((sum, op) => sum + op.durationMs, 0),
        successRate: ops.filter((op) => op.success).length / ops.length,
      };
    }
  }

  return stats;
}
