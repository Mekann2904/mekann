import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { calculateEfficiencyScore } from "./efficiency-analyzer.js";
import { getAnalyticsPaths } from "./behavior-storage.js";
const DEFAULT_ANOMALY_THRESHOLDS = {
  // 効率低下: ベースラインからこの値以上低下
  efficiencyDropThreshold: 0.2,
  // フォーマット違反率: この閾値を超えると異常
  formatViolationRateThreshold: 0.15,
  // タイムアウト率: この閾値を超えると異常
  timeoutRateThreshold: 0.1,
  // Thinking ブロック増加率: ベースラインのこの倍以上で異常
  thinkingBlockMultiplier: 2,
  // 実行時間増加率: ベースラインのこの倍以上で異常
  durationMultiplier: 3,
  // 最小サンプル数: この件数以下では異常判定しない
  minSampleCount: 5
};
class AnomalyDetector {
  thresholds;
  baseline = null;
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_ANOMALY_THRESHOLDS, ...thresholds };
  }
  /**
   * ベースラインを設定
   * @summary 比較対象となる基準データを設定
   * @param baseline ベースライン集計
   */
  setBaseline(baseline) {
    this.baseline = baseline;
  }
  /**
   * 異常を検出
   * @summary レコード配列から異常パターンを検出
   * @param records 対象レコード
   * @returns 検出された異常配列
   */
  detect(records) {
    const anomalies = [];
    if (records.length < this.thresholds.minSampleCount) {
      return anomalies;
    }
    const efficiencyAnomalies = this.detectEfficiencyDrop(records);
    anomalies.push(...efficiencyAnomalies);
    const formatAnomalies = this.detectFormatViolationSpike(records);
    anomalies.push(...formatAnomalies);
    const timeoutAnomalies = this.detectTimeoutSpike(records);
    anomalies.push(...timeoutAnomalies);
    const thinkingAnomalies = this.detectThinkingBlockSpike(records);
    anomalies.push(...thinkingAnomalies);
    const durationAnomalies = this.detectDurationAnomaly(records);
    anomalies.push(...durationAnomalies);
    return anomalies.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
  /**
   * 効率低下を検出
   */
  detectEfficiencyDrop(records) {
    if (!this.baseline) return [];
    const currentEfficiency = this.calculateAverageEfficiency(records);
    const baselineEfficiency = this.baseline.averages.efficiency;
    if (currentEfficiency < baselineEfficiency - this.thresholds.efficiencyDropThreshold) {
      return [{
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "efficiency_drop",
        severity: currentEfficiency < baselineEfficiency - 0.3 ? "high" : "medium",
        details: `Efficiency dropped from ${baselineEfficiency.toFixed(2)} to ${currentEfficiency.toFixed(2)} (${((currentEfficiency - baselineEfficiency) * 100).toFixed(1)}%)`,
        runId: records[records.length - 1].id
      }];
    }
    return [];
  }
  /**
   * フォーマット違反スパイクを検出
   */
  detectFormatViolationSpike(records) {
    const violationCount = records.filter(
      (r) => r.quality.formatComplianceScore < 0.5
    ).length;
    const violationRate = violationCount / records.length;
    if (violationRate > this.thresholds.formatViolationRateThreshold) {
      return [{
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "format_violation",
        severity: violationRate > 0.3 ? "high" : "medium",
        details: `Format violation rate: ${(violationRate * 100).toFixed(1)}% (${violationCount}/${records.length})`,
        runId: records[records.length - 1].id
      }];
    }
    return [];
  }
  /**
   * タイムアウトスパイクを検出
   */
  detectTimeoutSpike(records) {
    const timeoutCount = records.filter(
      (r) => r.execution.outcomeCode === "TIMEOUT"
    ).length;
    const timeoutRate = timeoutCount / records.length;
    if (timeoutRate > this.thresholds.timeoutRateThreshold) {
      return [{
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "timeout_spike",
        severity: timeoutRate > 0.2 ? "high" : "medium",
        details: `Timeout rate: ${(timeoutRate * 100).toFixed(1)}% (${timeoutCount}/${records.length})`,
        runId: records[records.length - 1].id
      }];
    }
    return [];
  }
  /**
   * Thinking ブロック増加を検出
   */
  detectThinkingBlockSpike(records) {
    if (!this.baseline) return [];
    const currentThinkingRate = records.filter(
      (r) => r.output.thinkingBlockPresent
    ).length / records.length;
    const baselineThinkingTokens = this.baseline.totals.totalThinkingTokens;
    const baselineOutputTokens = this.baseline.totals.totalOutputTokens;
    if (baselineOutputTokens === 0) return [];
    const baselineThinkingRate = baselineThinkingTokens / baselineOutputTokens;
    if (currentThinkingRate > baselineThinkingRate * this.thresholds.thinkingBlockMultiplier) {
      return [{
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "unusual_pattern",
        severity: "low",
        details: `Thinking block rate increased from ${(baselineThinkingRate * 100).toFixed(1)}% to ${(currentThinkingRate * 100).toFixed(1)}%`,
        runId: records[records.length - 1].id
      }];
    }
    return [];
  }
  /**
   * 実行時間異常を検出
   */
  detectDurationAnomaly(records) {
    if (!this.baseline) return [];
    const currentAvgDuration = records.reduce((sum, r) => sum + r.execution.durationMs, 0) / records.length;
    const baselineAvgDuration = this.baseline.averages.durationMs;
    if (currentAvgDuration > baselineAvgDuration * this.thresholds.durationMultiplier) {
      return [{
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        type: "unusual_pattern",
        severity: "medium",
        details: `Average duration increased from ${(baselineAvgDuration / 1e3).toFixed(1)}s to ${(currentAvgDuration / 1e3).toFixed(1)}s`,
        runId: records[records.length - 1].id
      }];
    }
    return [];
  }
  /**
   * 平均効率を計算
   */
  calculateAverageEfficiency(records) {
    const scores = records.map((r) => calculateEfficiencyScore(r).overall);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}
function detectAnomalies(records, baseline) {
  const detector = new AnomalyDetector();
  if (baseline) {
    detector.setBaseline(baseline);
  }
  return detector.detect(records);
}
function saveAnomalies(anomalies, date, cwd) {
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
  let existingAnomalies = [];
  if (existsSync(outputPath)) {
    try {
      const content = readFileSync(outputPath, "utf-8");
      existingAnomalies = JSON.parse(content);
    } catch {
    }
  }
  const existingIds = new Set(existingAnomalies.map((a) => `${a.timestamp}-${a.type}`));
  const newAnomalies = anomalies.filter(
    (a) => !existingIds.has(`${a.timestamp}-${a.type}`)
  );
  const allAnomalies = [...existingAnomalies, ...newAnomalies];
  writeFileSync(outputPath, JSON.stringify(allAnomalies, null, 2), "utf-8");
  return outputPath;
}
function loadAnomalies(startDate, endDate, cwd) {
  const paths = getAnalyticsPaths(cwd);
  if (!existsSync(paths.anomalies)) {
    return [];
  }
  const files = readdirSync(paths.anomalies).filter((f) => f.endsWith(".json"));
  const anomalies = [];
  for (const file of files) {
    const dateStr = file.replace(".json", "");
    const fileDate = new Date(dateStr);
    if (fileDate >= startDate && fileDate <= endDate) {
      try {
        const content = readFileSync(join(paths.anomalies, file), "utf-8");
        const fileAnomalies = JSON.parse(content);
        anomalies.push(...fileAnomalies);
      } catch {
      }
    }
  }
  return anomalies.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
function getAnomalySummary(cwd) {
  const yesterday = /* @__PURE__ */ new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const anomalies = loadAnomalies(yesterday, /* @__PURE__ */ new Date(), cwd);
  return {
    totalAnomalies: anomalies.length,
    highSeverity: anomalies.filter((a) => a.severity === "high").length,
    mediumSeverity: anomalies.filter((a) => a.severity === "medium").length,
    lowSeverity: anomalies.filter((a) => a.severity === "low").length,
    recentAnomalies: anomalies.slice(-10)
  };
}
export {
  AnomalyDetector,
  DEFAULT_ANOMALY_THRESHOLDS,
  detectAnomalies,
  getAnomalySummary,
  loadAnomalies,
  saveAnomalies
};
