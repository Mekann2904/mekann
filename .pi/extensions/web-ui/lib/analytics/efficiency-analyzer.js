/**
 * @abdd.meta
 * path: .pi/lib/analytics/efficiency-analyzer.ts
 * role: LLM実行の効率スコア計算
 * why: 実行効率を定量化し、最適化の効果を測定するため
 * related: .pi/lib/analytics/llm-behavior-types.ts, .pi/lib/analytics/behavior-storage.ts
 * public_api: calculateEfficiencyScore, calculateAggregates, normalizeRatio
 * invariants: スコアは0-1の範囲
 * side_effects: なし（純粋関数）
 * failure_modes: 空のレコード配列時はデフォルト値を返す
 * @abdd.explain
 * overview: LLM実行レコードから効率スコアと集計データを計算する分析モジュール
 * what_it_does:
 *   - calculateEfficiencyScore: 1回の実行の効率スコアを計算
 *   - calculateAggregates: 複数レコードの集計データを生成
 *   - normalizeRatio: トークン比率を正規化
 * why_it_exists:
 *   - 最適化の効果を定量的に評価するため
 *   - 異常検知のベースラインを提供するため
 * scope:
 *   in: LLMBehaviorRecord配列
 *   out: EfficiencyScore, LLMBehaviorAggregates
 */
// ============================================================================
// Efficiency Scoring
// ============================================================================
/**
 * 期待される実行時間（タスクタイプ別）
 */
const EXPECTED_DURATION_MS = {
    research: 60000, // 1分
    implementation: 120000, // 2分
    review: 45000, // 45秒
    planning: 90000, // 1.5分
    other: 60000, // 1分
};
/**
 * 効率スコアを計算
 * @summary 1回の実行の総合効率スコアを計算
 * @param record 行動レコード
 * @returns 効率スコア
 */
export function calculateEfficiencyScore(record) {
    const tokenEfficiency = normalizeRatio(record.output.estimatedTokens / Math.max(1, record.prompt.estimatedTokens), { min: 0.1, optimal: 0.5, max: 2.0 });
    const timeEfficiency = normalizeTime(record.execution.durationMs, record.context.taskType);
    const formatEfficiency = record.quality.formatComplianceScore;
    const qualityEfficiency = record.quality.claimResultConsistency;
    const overall = (tokenEfficiency + timeEfficiency + formatEfficiency + qualityEfficiency) / 4;
    return {
        overall,
        components: {
            tokenEfficiency,
            timeEfficiency,
            formatEfficiency,
            qualityEfficiency,
        },
    };
}
/**
 * 比率を正規化
 * @summary 指定範囲内の比率を0-1のスコアに変換
 * @param ratio 元の比率
 * @param params 正規化パラメータ
 * @returns 正規化されたスコア（0-1）
 */
export function normalizeRatio(ratio, params) {
    if (ratio <= params.min)
        return 0.0;
    if (ratio >= params.max)
        return 0.0;
    if (ratio === params.optimal)
        return 1.0;
    if (ratio < params.optimal) {
        // min -> optimal: 0 -> 1
        return (ratio - params.min) / (params.optimal - params.min);
    }
    else {
        // optimal -> max: 1 -> 0
        return (params.max - ratio) / (params.max - params.optimal);
    }
}
/**
 * 時間を正規化
 * @summary 実行時間を期待値と比較してスコア化
 * @param durationMs 実行時間（ミリ秒）
 * @param taskType タスクタイプ
 * @returns 正規化されたスコア（0-1）
 */
function normalizeTime(durationMs, taskType) {
    const expected = EXPECTED_DURATION_MS[taskType] ?? EXPECTED_DURATION_MS.other;
    // 期待値の50%以下: 1.0
    // 期待値: 0.8
    // 期待値の200%: 0.4
    // 期待値の400%以上: 0.0
    const ratio = durationMs / expected;
    if (ratio <= 0.5)
        return 1.0;
    if (ratio <= 1.0)
        return 0.8 + 0.2 * (1 - ratio);
    if (ratio <= 2.0)
        return 0.4 + 0.4 * (2 - ratio);
    if (ratio <= 4.0)
        return 0.4 * (4 - ratio) / 2;
    return 0.0;
}
// ============================================================================
// Aggregation
// ============================================================================
/**
 * 集計データを計算
 * @summary 複数レコードの統計的集計を生成
 * @param records レコード配列
 * @param period 集計期間
 * @returns 集計データ
 */
export function calculateAggregates(records, period = "day") {
    if (records.length === 0) {
        return null;
    }
    const sortedRecords = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const startTime = sortedRecords[0].timestamp;
    const endTime = sortedRecords[sortedRecords.length - 1].timestamp;
    // 合計値
    const totals = {
        runs: records.length,
        errors: records.filter((r) => r.execution.outcomeCode !== "SUCCESS").length,
        totalPromptTokens: records.reduce((sum, r) => sum + r.prompt.estimatedTokens, 0),
        totalOutputTokens: records.reduce((sum, r) => sum + r.output.estimatedTokens, 0),
        totalThinkingTokens: records.reduce((sum, r) => sum + r.output.thinkingBlockTokens, 0),
        totalDurationMs: records.reduce((sum, r) => sum + r.execution.durationMs, 0),
    };
    // 平均値
    const efficiencyScores = records.map((r) => calculateEfficiencyScore(r).overall);
    const avgEfficiency = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length;
    const averages = {
        promptTokens: totals.totalPromptTokens / totals.runs,
        outputTokens: totals.totalOutputTokens / totals.runs,
        efficiency: avgEfficiency,
        formatCompliance: records.reduce((sum, r) => sum + r.quality.formatComplianceScore, 0) / totals.runs,
        claimResultConsistency: records.reduce((sum, r) => sum + r.quality.claimResultConsistency, 0) / totals.runs,
        durationMs: totals.totalDurationMs / totals.runs,
    };
    // 異常検出
    const anomalies = detectSimpleAnomalies(records, averages);
    return {
        period,
        startTime,
        endTime,
        totals,
        averages,
        anomalies,
    };
}
/**
 * 簡易異常検出
 * @summary 基本的な異常パターンを検出
 * @param records レコード配列
 * @param averages 平均値
 * @returns 異常レコード
 */
function detectSimpleAnomalies(records, averages) {
    const anomalies = [];
    // フォーマット違反のスパイク検出
    const lowComplianceRecords = records.filter((r) => r.quality.formatComplianceScore < 0.5);
    if (lowComplianceRecords.length > records.length * 0.2) {
        anomalies.push({
            timestamp: new Date().toISOString(),
            type: "format_violation",
            severity: "high",
            details: `Format violation rate: ${((lowComplianceRecords.length / records.length) * 100).toFixed(1)}%`,
            runId: lowComplianceRecords[0].id,
        });
    }
    // タイムアウトスパイク検出
    const timeoutRecords = records.filter((r) => r.execution.outcomeCode === "TIMEOUT");
    if (timeoutRecords.length > records.length * 0.1) {
        anomalies.push({
            timestamp: new Date().toISOString(),
            type: "timeout_spike",
            severity: "medium",
            details: `Timeout rate: ${((timeoutRecords.length / records.length) * 100).toFixed(1)}%`,
            runId: timeoutRecords[0].id,
        });
    }
    // 効率低下検出
    const efficiencyScores = records.map((r) => calculateEfficiencyScore(r).overall);
    const avgScore = efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length;
    if (avgScore < averages.efficiency - 0.2) {
        anomalies.push({
            timestamp: new Date().toISOString(),
            type: "efficiency_drop",
            severity: "medium",
            details: `Efficiency dropped to ${avgScore.toFixed(2)} (baseline: ${averages.efficiency.toFixed(2)})`,
            runId: records[records.length - 1].id,
        });
    }
    return anomalies;
}
// ============================================================================
// Comparison
// ============================================================================
/**
 * 期間比較
 * @summary 2つの期間の効率を比較
 * @param baselineRecords ベースライン期間のレコード
 * @param comparisonRecords 比較期間のレコード
 * @returns 比較結果
 */
export function comparePeriods(baselineRecords, comparisonRecords) {
    const baselineAgg = calculateAggregates(baselineRecords);
    const comparisonAgg = calculateAggregates(comparisonRecords);
    if (!baselineAgg || !comparisonAgg) {
        return {
            efficiencyDelta: 0,
            tokenDelta: 0,
            timeDelta: 0,
            qualityDelta: 0,
            significance: "insignificant",
        };
    }
    const efficiencyDelta = comparisonAgg.averages.efficiency - baselineAgg.averages.efficiency;
    const tokenDelta = comparisonAgg.averages.outputTokens - baselineAgg.averages.outputTokens;
    const timeDelta = comparisonAgg.averages.durationMs - baselineAgg.averages.durationMs;
    const qualityDelta = comparisonAgg.averages.claimResultConsistency - baselineAgg.averages.claimResultConsistency;
    // 統計的有意性の簡易判定
    const minSamples = Math.min(baselineRecords.length, comparisonRecords.length);
    let significance;
    if (minSamples < 5) {
        significance = "insignificant";
    }
    else if (Math.abs(efficiencyDelta) > 0.1 && minSamples >= 10) {
        significance = "significant";
    }
    else if (Math.abs(efficiencyDelta) > 0.05) {
        significance = "marginal";
    }
    else {
        significance = "insignificant";
    }
    return {
        efficiencyDelta,
        tokenDelta,
        timeDelta,
        qualityDelta,
        significance,
    };
}
