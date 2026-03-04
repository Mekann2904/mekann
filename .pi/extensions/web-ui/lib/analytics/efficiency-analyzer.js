const EXPECTED_DURATION_MS = {
  research: 6e4,
  // 1分
  implementation: 12e4,
  // 2分
  review: 45e3,
  // 45秒
  planning: 9e4,
  // 1.5分
  other: 6e4
  // 1分
};
function calculateEfficiencyScore(record) {
  const tokenEfficiency = normalizeRatio(
    record.output.estimatedTokens / Math.max(1, record.prompt.estimatedTokens),
    { min: 0.1, optimal: 0.5, max: 2 }
  );
  const timeEfficiency = normalizeTime(
    record.execution.durationMs,
    record.context.taskType
  );
  const formatEfficiency = record.quality.formatComplianceScore;
  const qualityEfficiency = record.quality.claimResultConsistency;
  const overall = (tokenEfficiency + timeEfficiency + formatEfficiency + qualityEfficiency) / 4;
  return {
    overall,
    components: {
      tokenEfficiency,
      timeEfficiency,
      formatEfficiency,
      qualityEfficiency
    }
  };
}
function normalizeRatio(ratio, params) {
  if (ratio <= params.min) return 0;
  if (ratio >= params.max) return 0;
  if (ratio === params.optimal) return 1;
  if (ratio < params.optimal) {
    return (ratio - params.min) / (params.optimal - params.min);
  } else {
    return (params.max - ratio) / (params.max - params.optimal);
  }
}
function normalizeTime(durationMs, taskType) {
  const expected = EXPECTED_DURATION_MS[taskType] ?? EXPECTED_DURATION_MS.other;
  const ratio = durationMs / expected;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1) return 0.8 + 0.2 * (1 - ratio);
  if (ratio <= 2) return 0.4 + 0.4 * (2 - ratio);
  if (ratio <= 4) return 0.4 * (4 - ratio) / 2;
  return 0;
}
function calculateAggregates(records, period = "day") {
  if (records.length === 0) {
    return null;
  }
  const sortedRecords = [...records].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp)
  );
  const startTime = sortedRecords[0].timestamp;
  const endTime = sortedRecords[sortedRecords.length - 1].timestamp;
  const totals = {
    runs: records.length,
    errors: records.filter((r) => r.execution.outcomeCode !== "SUCCESS").length,
    totalPromptTokens: records.reduce((sum, r) => sum + r.prompt.estimatedTokens, 0),
    totalOutputTokens: records.reduce((sum, r) => sum + r.output.estimatedTokens, 0),
    totalThinkingTokens: records.reduce((sum, r) => sum + r.output.thinkingBlockTokens, 0),
    totalDurationMs: records.reduce((sum, r) => sum + r.execution.durationMs, 0)
  };
  const efficiencyScores = records.map((r) => calculateEfficiencyScore(r).overall);
  const avgEfficiency = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length;
  const averages = {
    promptTokens: totals.totalPromptTokens / totals.runs,
    outputTokens: totals.totalOutputTokens / totals.runs,
    efficiency: avgEfficiency,
    formatCompliance: records.reduce((sum, r) => sum + r.quality.formatComplianceScore, 0) / totals.runs,
    claimResultConsistency: records.reduce((sum, r) => sum + r.quality.claimResultConsistency, 0) / totals.runs,
    durationMs: totals.totalDurationMs / totals.runs
  };
  const anomalies = detectSimpleAnomalies(records, averages);
  return {
    period,
    startTime,
    endTime,
    totals,
    averages,
    anomalies
  };
}
function detectSimpleAnomalies(records, averages) {
  const anomalies = [];
  const lowComplianceRecords = records.filter(
    (r) => r.quality.formatComplianceScore < 0.5
  );
  if (lowComplianceRecords.length > records.length * 0.2) {
    anomalies.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "format_violation",
      severity: "high",
      details: `Format violation rate: ${(lowComplianceRecords.length / records.length * 100).toFixed(1)}%`,
      runId: lowComplianceRecords[0].id
    });
  }
  const timeoutRecords = records.filter(
    (r) => r.execution.outcomeCode === "TIMEOUT"
  );
  if (timeoutRecords.length > records.length * 0.1) {
    anomalies.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "timeout_spike",
      severity: "medium",
      details: `Timeout rate: ${(timeoutRecords.length / records.length * 100).toFixed(1)}%`,
      runId: timeoutRecords[0].id
    });
  }
  const efficiencyScores = records.map((r) => calculateEfficiencyScore(r).overall);
  const avgScore = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length;
  if (avgScore < averages.efficiency - 0.2) {
    anomalies.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      type: "efficiency_drop",
      severity: "medium",
      details: `Efficiency dropped to ${avgScore.toFixed(2)} (baseline: ${averages.efficiency.toFixed(2)})`,
      runId: records[records.length - 1].id
    });
  }
  return anomalies;
}
function comparePeriods(baselineRecords, comparisonRecords) {
  const baselineAgg = calculateAggregates(baselineRecords);
  const comparisonAgg = calculateAggregates(comparisonRecords);
  if (!baselineAgg || !comparisonAgg) {
    return {
      efficiencyDelta: 0,
      tokenDelta: 0,
      timeDelta: 0,
      qualityDelta: 0,
      significance: "insignificant"
    };
  }
  const efficiencyDelta = comparisonAgg.averages.efficiency - baselineAgg.averages.efficiency;
  const tokenDelta = comparisonAgg.averages.outputTokens - baselineAgg.averages.outputTokens;
  const timeDelta = comparisonAgg.averages.durationMs - baselineAgg.averages.durationMs;
  const qualityDelta = comparisonAgg.averages.claimResultConsistency - baselineAgg.averages.claimResultConsistency;
  const minSamples = Math.min(baselineRecords.length, comparisonRecords.length);
  let significance;
  if (minSamples < 5) {
    significance = "insignificant";
  } else if (Math.abs(efficiencyDelta) > 0.1 && minSamples >= 10) {
    significance = "significant";
  } else if (Math.abs(efficiencyDelta) > 0.05) {
    significance = "marginal";
  } else {
    significance = "insignificant";
  }
  return {
    efficiencyDelta,
    tokenDelta,
    timeDelta,
    qualityDelta,
    significance
  };
}
export {
  calculateAggregates,
  calculateEfficiencyScore,
  comparePeriods,
  normalizeRatio
};
