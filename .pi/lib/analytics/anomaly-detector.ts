/**
 * @abdd.meta
 * path: .pi/lib/analytics/anomaly-detector.ts
 * role: LLM行動の異常検知
 * why: 実行パターンの異常を自動検出し、早期警告を提供
 * related: .pi/lib/analytics/efficiency-analyzer.ts, .pi/lib/analytics/aggregator.ts
 * public_api: detectAnomalies, AnomalyDetector, saveAnomalies
 * invariants: 異常は重要度順にソート
 * side_effects: ファイルシステムへの書き込み（saveAnomalies）
 * failure_modes: データ不足時は空配列を返す
 * @abdd.explain
 * overview: LLM実行メトリクスから異常パターンを検出し、警告を生成
 * what_it_does:
 *   - 効率低下の検出（ベースラインとの比較）
 *   - フォーマット違反スパイクの検出
 *   - タイムアウト異常増加の検出
 *   - Thinkingブロック増加の検出
 * why_it_exists:
 *   - 最適化の副作用を早期に発見するため
 *   - 品質低下を自動的に警告するため
 * scope:
 *   in: LLMBehaviorRecord配列、ベースライン集計
 *   out: AnomalyRecord配列
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  LLMBehaviorRecord,
  LLMBehaviorAggregates,
  AnomalyRecord,
} from "./llm-behavior-types.js";
import { calculateEfficiencyScore } from "./efficiency-analyzer.js";
import { getAnalyticsPaths } from "./behavior-storage.js";

// ============================================================================
// Anomaly Thresholds
// ============================================================================

/**
 * デフォルトの異常検出閾値
 */
export const DEFAULT_ANOMALY_THRESHOLDS = {
  // 効率低下: ベースラインからこの値以上低下
  efficiencyDropThreshold: 0.2,

  // フォーマット違反率: この閾値を超えると異常
  formatViolationRateThreshold: 0.15,

  // タイムアウト率: この閾値を超えると異常
  timeoutRateThreshold: 0.1,

  // Thinking ブロック増加率: ベースラインのこの倍以上で異常
  thinkingBlockMultiplier: 2.0,

  // 実行時間増加率: ベースラインのこの倍以上で異常
  durationMultiplier: 3.0,

  // 最小サンプル数: この件数以下では異常判定しない
  minSampleCount: 5,
};

export type AnomalyThresholds = typeof DEFAULT_ANOMALY_THRESHOLDS;

// ============================================================================
// Anomaly Detector Class
// ============================================================================

/**
 * 異常検出器
 * @summary 設定可能な閾値で異常を検出
 */
export class AnomalyDetector {
  private thresholds: AnomalyThresholds;
  private baseline: LLMBehaviorAggregates | null = null;

  constructor(thresholds: Partial<AnomalyThresholds> = {}) {
    this.thresholds = { ...DEFAULT_ANOMALY_THRESHOLDS, ...thresholds };
  }

  /**
   * ベースラインを設定
   * @summary 比較対象となる基準データを設定
   * @param baseline ベースライン集計
   */
  setBaseline(baseline: LLMBehaviorAggregates): void {
    this.baseline = baseline;
  }

  /**
   * 異常を検出
   * @summary レコード配列から異常パターンを検出
   * @param records 対象レコード
   * @returns 検出された異常配列
   */
  detect(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    const anomalies: AnomalyRecord[] = [];

    if (records.length < this.thresholds.minSampleCount) {
      return anomalies;
    }

    // 1. 効率低下検出
    const efficiencyAnomalies = this.detectEfficiencyDrop(records);
    anomalies.push(...efficiencyAnomalies);

    // 2. フォーマット違反スパイク検出
    const formatAnomalies = this.detectFormatViolationSpike(records);
    anomalies.push(...formatAnomalies);

    // 3. タイムアウトスパイク検出
    const timeoutAnomalies = this.detectTimeoutSpike(records);
    anomalies.push(...timeoutAnomalies);

    // 4. Thinking ブロック増加検出
    const thinkingAnomalies = this.detectThinkingBlockSpike(records);
    anomalies.push(...thinkingAnomalies);

    // 5. 実行時間異常検出
    const durationAnomalies = this.detectDurationAnomaly(records);
    anomalies.push(...durationAnomalies);

    // 重要度順にソート
    return anomalies.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * 効率低下を検出
   */
  private detectEfficiencyDrop(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    if (!this.baseline) return [];

    const currentEfficiency = this.calculateAverageEfficiency(records);
    const baselineEfficiency = this.baseline.averages.efficiency;

    if (currentEfficiency < baselineEfficiency - this.thresholds.efficiencyDropThreshold) {
      return [{
        timestamp: new Date().toISOString(),
        type: "efficiency_drop",
        severity: currentEfficiency < baselineEfficiency - 0.3 ? "high" : "medium",
        details: `Efficiency dropped from ${baselineEfficiency.toFixed(2)} to ${currentEfficiency.toFixed(2)} (${((currentEfficiency - baselineEfficiency) * 100).toFixed(1)}%)`,
        runId: records[records.length - 1].id,
      }];
    }

    return [];
  }

  /**
   * フォーマット違反スパイクを検出
   */
  private detectFormatViolationSpike(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    const violationCount = records.filter(
      (r) => r.quality.formatComplianceScore < 0.5,
    ).length;

    const violationRate = violationCount / records.length;

    if (violationRate > this.thresholds.formatViolationRateThreshold) {
      return [{
        timestamp: new Date().toISOString(),
        type: "format_violation",
        severity: violationRate > 0.3 ? "high" : "medium",
        details: `Format violation rate: ${(violationRate * 100).toFixed(1)}% (${violationCount}/${records.length})`,
        runId: records[records.length - 1].id,
      }];
    }

    return [];
  }

  /**
   * タイムアウトスパイクを検出
   */
  private detectTimeoutSpike(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    const timeoutCount = records.filter(
      (r) => r.execution.outcomeCode === "TIMEOUT",
    ).length;

    const timeoutRate = timeoutCount / records.length;

    if (timeoutRate > this.thresholds.timeoutRateThreshold) {
      return [{
        timestamp: new Date().toISOString(),
        type: "timeout_spike",
        severity: timeoutRate > 0.2 ? "high" : "medium",
        details: `Timeout rate: ${(timeoutRate * 100).toFixed(1)}% (${timeoutCount}/${records.length})`,
        runId: records[records.length - 1].id,
      }];
    }

    return [];
  }

  /**
   * Thinking ブロック増加を検出
   */
  private detectThinkingBlockSpike(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    if (!this.baseline) return [];

    const currentThinkingRate = records.filter(
      (r) => r.output.thinkingBlockPresent,
    ).length / records.length;

    // ベースラインにThinking情報がない場合はスキップ
    const baselineThinkingTokens = this.baseline.totals.totalThinkingTokens;
    const baselineOutputTokens = this.baseline.totals.totalOutputTokens;

    if (baselineOutputTokens === 0) return [];

    const baselineThinkingRate = baselineThinkingTokens / baselineOutputTokens;

    if (currentThinkingRate > baselineThinkingRate * this.thresholds.thinkingBlockMultiplier) {
      return [{
        timestamp: new Date().toISOString(),
        type: "unusual_pattern",
        severity: "low",
        details: `Thinking block rate increased from ${(baselineThinkingRate * 100).toFixed(1)}% to ${(currentThinkingRate * 100).toFixed(1)}%`,
        runId: records[records.length - 1].id,
      }];
    }

    return [];
  }

  /**
   * 実行時間異常を検出
   */
  private detectDurationAnomaly(records: LLMBehaviorRecord[]): AnomalyRecord[] {
    if (!this.baseline) return [];

    const currentAvgDuration = records.reduce((sum, r) => sum + r.execution.durationMs, 0) / records.length;
    const baselineAvgDuration = this.baseline.averages.durationMs;

    if (currentAvgDuration > baselineAvgDuration * this.thresholds.durationMultiplier) {
      return [{
        timestamp: new Date().toISOString(),
        type: "unusual_pattern",
        severity: "medium",
        details: `Average duration increased from ${(baselineAvgDuration / 1000).toFixed(1)}s to ${(currentAvgDuration / 1000).toFixed(1)}s`,
        runId: records[records.length - 1].id,
      }];
    }

    return [];
  }

  /**
   * 平均効率を計算
   */
  private calculateAverageEfficiency(records: LLMBehaviorRecord[]): number {
    const scores = records.map((r) => calculateEfficiencyScore(r).overall);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 異常を検出（簡易版）
 * @summary デフォルト設定で異常検出を実行
 * @param records 対象レコード
 * @param baseline ベースライン（オプション）
 * @returns 検出された異常配列
 */
export function detectAnomalies(
  records: LLMBehaviorRecord[],
  baseline?: LLMBehaviorAggregates,
): AnomalyRecord[] {
  const detector = new AnomalyDetector();

  if (baseline) {
    detector.setBaseline(baseline);
  }

  return detector.detect(records);
}

/**
 * 異常を保存
 * @summary 検出された異常をファイルに保存
 * @param anomalies 異常配列
 * @param date 対象日
 * @param cwd 作業ディレクトリ
 * @returns 保存されたファイルパス
 */
export function saveAnomalies(
  anomalies: AnomalyRecord[],
  date: Date,
  cwd?: string,
): string | null {
  if (anomalies.length === 0) {
    return null;
  }

  const paths = getAnalyticsPaths(cwd);
  const anomalyDir = paths.anomalies;

  if (!existsSync(anomalyDir)) {
    mkdirSync(anomalyDir, { recursive: true });
  }

  const dateStr = date.toISOString().split("T")[0];
  const outputPath = join(anomalyDir, `${dateStr}.json`);

  // 既存データを読み込み
  let existingAnomalies: AnomalyRecord[] = [];
  if (existsSync(outputPath)) {
    try {
      const content = readFileSync(outputPath, "utf-8");
      existingAnomalies = JSON.parse(content);
    } catch {
      // 読み込みエラーは無視
    }
  }

  // 新しい異常を追加（重複排除）
  const existingIds = new Set(existingAnomalies.map((a) => `${a.timestamp}-${a.type}`));
  const newAnomalies = anomalies.filter(
    (a) => !existingIds.has(`${a.timestamp}-${a.type}`),
  );

  const allAnomalies = [...existingAnomalies, ...newAnomalies];

  writeFileSync(outputPath, JSON.stringify(allAnomalies, null, 2), "utf-8");

  return outputPath;
}

/**
 * 異常を読み込み
 * @summary 指定期間の異常記録を読み込む
 * @param startDate 開始日
 * @param endDate 終了日
 * @param cwd 作業ディレクトリ
 * @returns 異常配列
 */
export function loadAnomalies(
  startDate: Date,
  endDate: Date,
  cwd?: string,
): AnomalyRecord[] {
  const paths = getAnalyticsPaths(cwd);

  if (!existsSync(paths.anomalies)) {
    return [];
  }

  const files = readdirSync(paths.anomalies).filter((f: string) => f.endsWith(".json"));

  const anomalies: AnomalyRecord[] = [];

  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const fileDate = new Date(dateStr);

    if (fileDate >= startDate && fileDate <= endDate) {
      try {
        const content = readFileSync(join(paths.anomalies, file), "utf-8");
        const fileAnomalies = JSON.parse(content) as AnomalyRecord[];
        anomalies.push(...fileAnomalies);
      } catch {
        // 読み込みエラーはスキップ
      }
    }
  }

  return anomalies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * 異常サマリーを取得
 * @summary 現在の異常状態を要約
 * @param cwd 作業ディレクトリ
 * @returns サマリー情報
 */
export function getAnomalySummary(cwd?: string): {
  totalAnomalies: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  recentAnomalies: AnomalyRecord[];
} {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const anomalies = loadAnomalies(yesterday, new Date(), cwd);

  return {
    totalAnomalies: anomalies.length,
    highSeverity: anomalies.filter((a) => a.severity === "high").length,
    mediumSeverity: anomalies.filter((a) => a.severity === "medium").length,
    lowSeverity: anomalies.filter((a) => a.severity === "low").length,
    recentAnomalies: anomalies.slice(-10),
  };
}
