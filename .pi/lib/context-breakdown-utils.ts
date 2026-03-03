/**
 * @abdd.meta
 * path: .pi/lib/context-breakdown-utils.ts
 * role: ContextBreakdown型のユーティリティ関数を提供するモジュール
 * why: コンテキスト利用状況の追跡、分析、比較を支援するため
 * related: .pi/lib/context-breakdown-types.ts, .pi/lib/context-engineering.ts
 * public_api: createContextBreakdown, calculateEfficiencyScore, compareBreakdowns, trackUsageMetrics
 * invariants:
 *   - 生成されたContextBreakdownのtotalTokensは各レイヤーの合計と一致する
 *   - efficiencyScoreは0.0〜1.0の範囲に正規化される
 *   - 比較結果のtokenDeltaは正確な差分を示す
 * side_effects:
 *   - なし（純粋関数）
 * failure_modes:
 *   - 無効な入力データによるNaNやInfinityの発生
 *   - 空のカテゴリ配列による除算エラー
 * @abdd.explain
 * overview: ContextBreakdown型の作成、効率性スコア計算、比較、使用メトリクス追跡を行う
 * what_it_does:
 *   - ContextBreakdownオブジェクトを生成する
 *   - コンテキスト効率性スコアを計算する
 *   - 2つの内訳を比較して差分を抽出する
 *   - 時間経過による使用メトリクスを追跡する
 * why_it_exists:
 *   - 型定義を実際のデータ操作と結びつけるため
 *   - 一貫した方法で内訳情報を生成・分析するため
 * scope:
 *   in: コンテキストアイテム、トークン数、カテゴリ/優先度/ソース情報
 *   out: 構造化された内訳データと分析結果
 */

import type {
  ContextBreakdown,
  ContextLayerBreakdown,
  ContextUsageMetrics,
  ContextEfficiencyScore,
  ContextBreakdownComparison,
  CategoryBreakdown,
  PriorityBreakdown,
  SourceBreakdown,
  TemporalBreakdown,
} from "./context-breakdown-types.js";
import type { ContextItem, ContextCategory, ContextPriority } from "./context-engineering.js";
import { estimateContextItemTokens, calculateUtilization } from "./context-engineering.js";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_VERSION = "1.0.0";
const MAX_SOURCES = 10;

// Optimal utilization range (60-85%)
const OPTIMAL_MIN_UTILIZATION = 0.6;
const OPTIMAL_MAX_UTILIZATION = 0.85;

// ============================================================================
// ContextBreakdown Creation
// ============================================================================

/**
 * @summary ContextBreakdownオブジェクトを生成
 * @param items コンテキストアイテム配列
 * @param maxTokens 最大許容トークン数
 * @param options オプション設定
 * @returns 完全なContextBreakdownオブジェクト
 */
export function createContextBreakdown(
  items: ContextItem[],
  maxTokens: number,
  options: {
    reservedTokens?: number;
    sessionId?: string;
    taskId?: string;
    version?: string;
  } = {}
): ContextBreakdown {
  const {
    reservedTokens = Math.floor(maxTokens * 0.2),
    sessionId,
    taskId,
    version = DEFAULT_VERSION,
  } = options;

  const effectiveBudget = maxTokens - reservedTokens;
  const utilization = calculateUtilization(items, maxTokens);
  const totalTokens = utilization.usedTokens;

  // Build layer breakdown
  const layerBreakdown = buildLayerBreakdown(items, totalTokens || 1);

  // Build category breakdown
  const categoryBreakdown = buildCategoryBreakdown(
    items,
    utilization.categoryBreakdown,
    totalTokens || 1
  );

  // Build priority breakdown
  const priorityBreakdown = buildPriorityBreakdown(
    items,
    utilization.priorityBreakdown,
    totalTokens || 1
  );

  // Build source breakdown (top N)
  const sourceBreakdown = buildSourceBreakdown(items, totalTokens || 1);

  // Detect limiting factor
  const limitingFactor = detectLimitingFactor(
    categoryBreakdown,
    priorityBreakdown,
    totalTokens,
    effectiveBudget
  );

  return {
    metadata: {
      generatedAt: Date.now(),
      sessionId,
      taskId,
      version,
    },
    metrics: {
      totalTokens,
      maxTokens,
      reservedTokens,
      effectiveBudget,
      utilizationRatio: utilization.utilizationRatio,
      remainingTokens: maxTokens - totalTokens,
    },
    layerBreakdown,
    categoryBreakdown,
    priorityBreakdown,
    sourceBreakdown,
    limitingFactor,
  };
}

/**
 * @summary レイヤー別内訳を構築
 */
function buildLayerBreakdown(
  items: ContextItem[],
  totalTokens: number
): ContextLayerBreakdown {
  const layers: Record<string, { tokens: number; itemCount: number; description: string }> = {
    systemPrompt: { tokens: 0, itemCount: 0, description: "System-level instructions and prompts" },
    taskInstruction: { tokens: 0, itemCount: 0, description: "Current task description and goals" },
    executionRules: { tokens: 0, itemCount: 0, description: "Execution guidelines and constraints" },
    fileContent: { tokens: 0, itemCount: 0, description: "File contents being analyzed" },
    conversation: { tokens: 0, itemCount: 0, description: "Conversation history" },
    agentOutput: { tokens: 0, itemCount: 0, description: "Output from agents and tools" },
    workingMemory: { tokens: 0, itemCount: 0, description: "Current working state and memory" },
  };

  for (const item of items) {
    const tokens = estimateContextItemTokens(item);
    switch (item.category) {
      case "system-prompt":
        layers.systemPrompt.tokens += tokens;
        layers.systemPrompt.itemCount++;
        break;
      case "task-instruction":
        layers.taskInstruction.tokens += tokens;
        layers.taskInstruction.itemCount++;
        break;
      case "execution-rules":
        layers.executionRules.tokens += tokens;
        layers.executionRules.itemCount++;
        break;
      case "file-content":
        layers.fileContent.tokens += tokens;
        layers.fileContent.itemCount++;
        break;
      case "conversation":
        layers.conversation.tokens += tokens;
        layers.conversation.itemCount++;
        break;
      case "agent-output":
      case "verification-result":
        layers.agentOutput.tokens += tokens;
        layers.agentOutput.itemCount++;
        break;
      case "working-memory":
      case "skill-content":
      case "reference-doc":
      case "error-context":
        layers.workingMemory.tokens += tokens;
        layers.workingMemory.itemCount++;
        break;
    }
  }

  return {
    systemPrompt: { ...layers.systemPrompt, ratio: layers.systemPrompt.tokens / totalTokens },
    taskInstruction: { ...layers.taskInstruction, ratio: layers.taskInstruction.tokens / totalTokens },
    executionRules: { ...layers.executionRules, ratio: layers.executionRules.tokens / totalTokens },
    fileContent: { ...layers.fileContent, ratio: layers.fileContent.tokens / totalTokens },
    conversation: { ...layers.conversation, ratio: layers.conversation.tokens / totalTokens },
    agentOutput: { ...layers.agentOutput, ratio: layers.agentOutput.tokens / totalTokens },
    workingMemory: { ...layers.workingMemory, ratio: layers.workingMemory.tokens / totalTokens },
  };
}

/**
 * @summary カテゴリ別内訳を構築
 */
function buildCategoryBreakdown(
  items: ContextItem[],
  categoryTokens: Record<ContextCategory, number>,
  totalTokens: number
): CategoryBreakdown[] {
  const categoryCounts: Record<ContextCategory, number> = {
    "task-instruction": 0,
    "system-prompt": 0,
    "execution-rules": 0,
    "file-content": 0,
    conversation: 0,
    "agent-output": 0,
    "verification-result": 0,
    "working-memory": 0,
    "skill-content": 0,
    "reference-doc": 0,
    "error-context": 0,
  };

  for (const item of items) {
    categoryCounts[item.category]++;
  }

  return Object.entries(categoryTokens).map(([category, tokens]) => ({
    category: category as ContextCategory,
    tokens,
    itemCount: categoryCounts[category as ContextCategory],
    ratio: tokens / totalTokens,
    isOverLimit: false,
  }));
}

/**
 * @summary 優先度別内訳を構築
 */
function buildPriorityBreakdown(
  items: ContextItem[],
  priorityTokens: Record<ContextPriority, number>,
  totalTokens: number
): PriorityBreakdown[] {
  const priorityCounts: Record<ContextPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    optional: 0,
  };

  for (const item of items) {
    priorityCounts[item.priority]++;
  }

  const weights: Record<ContextPriority, number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.3,
    optional: 0.1,
  };

  return Object.entries(priorityTokens).map(([priority, tokens]) => ({
    priority: priority as ContextPriority,
    tokens,
    itemCount: priorityCounts[priority as ContextPriority],
    ratio: tokens / totalTokens,
    weight: weights[priority as ContextPriority],
  }));
}

/**
 * @summary ソース別内訳を構築（上位MAX_SOURCES件）
 */
function buildSourceBreakdown(items: ContextItem[], totalTokens: number): SourceBreakdown[] {
  const sourceMap = new Map<string, { tokens: number; itemCount: number; lastUpdated: number }>();

  for (const item of items) {
    const source = item.source || "unknown";
    const tokens = estimateContextItemTokens(item);
    const existing = sourceMap.get(source);

    if (existing) {
      existing.tokens += tokens;
      existing.itemCount++;
      existing.lastUpdated = Math.max(existing.lastUpdated, item.timestamp);
    } else {
      sourceMap.set(source, {
        tokens,
        itemCount: 1,
        lastUpdated: item.timestamp,
      });
    }
  }

  return Array.from(sourceMap.entries())
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, MAX_SOURCES)
    .map(([source, data]) => ({
      source,
      tokens: data.tokens,
      itemCount: data.itemCount,
      ratio: data.tokens / totalTokens,
      lastUpdated: data.lastUpdated,
    }));
}

/**
 * @summary 制約要因を検出
 */
function detectLimitingFactor(
  categoryBreakdown: CategoryBreakdown[],
  priorityBreakdown: PriorityBreakdown[],
  totalTokens: number,
  effectiveBudget: number
): ContextBreakdown["limitingFactor"] | undefined {
  // Check budget exceeded
  if (totalTokens > effectiveBudget) {
    return {
      type: "budget_exceeded",
      detail: `Total tokens (${totalTokens}) exceed effective budget (${effectiveBudget})`,
      affectedItems: ["all"],
    };
  }

  // Check category limits
  const overLimitCategories = categoryBreakdown.filter((c) => c.isOverLimit);
  if (overLimitCategories.length > 0) {
    return {
      type: "category_limit",
      detail: `Categories exceeding limits: ${overLimitCategories.map((c) => c.category).join(", ")}`,
      affectedItems: overLimitCategories.map((c) => c.category),
    };
  }

  // Check low priority dominance
  const lowPriorityTokens = priorityBreakdown
    .filter((p) => p.priority === "low" || p.priority === "optional")
    .reduce((sum, p) => sum + p.tokens, 0);
  const lowPriorityRatio = lowPriorityTokens / (totalTokens || 1);

  if (lowPriorityRatio > 0.4) {
    return {
      type: "priority_weight",
      detail: `Low priority content dominates (${(lowPriorityRatio * 100).toFixed(1)}% of tokens)`,
      affectedItems: priorityBreakdown
        .filter((p) => p.priority === "low" || p.priority === "optional")
        .map((p) => p.priority),
    };
  }

  return undefined;
}

// ============================================================================
// Efficiency Score Calculation
// ============================================================================

/**
 * @summary コンテキスト効率性スコアを計算
 * @param breakdown ContextBreakdownオブジェクト
 * @returns 効率性スコアと改善提案
 */
export function calculateEfficiencyScore(
  breakdown: ContextBreakdown
): ContextEfficiencyScore {
  const { metrics, categoryBreakdown, priorityBreakdown } = breakdown;
  const timestamp = Date.now();

  // Utilization score (optimal range: 60-85%)
  let utilizationScore: number;
  if (metrics.utilizationRatio < OPTIMAL_MIN_UTILIZATION) {
    utilizationScore = metrics.utilizationRatio / OPTIMAL_MIN_UTILIZATION;
  } else if (metrics.utilizationRatio > OPTIMAL_MAX_UTILIZATION) {
    utilizationScore = Math.max(0, 1 - (metrics.utilizationRatio - OPTIMAL_MAX_UTILIZATION) / 0.15);
  } else {
    utilizationScore = 1;
  }

  // Distribution score (entropy-based balance)
  const distributionScore = calculateDistributionScore(categoryBreakdown);

  // Priority score (higher priority content should dominate)
  const priorityScore = calculatePriorityScore(priorityBreakdown);

  // Freshness score (based on source update recency)
  const freshnessScore = calculateFreshnessScore(breakdown.sourceBreakdown, timestamp);

  // Redundancy score (penalize duplicate sources)
  const redundancyScore = calculateRedundancyScore(breakdown.sourceBreakdown);

  const overallScore =
    (utilizationScore * 0.25 +
      distributionScore * 0.2 +
      priorityScore * 0.25 +
      freshnessScore * 0.15 +
      redundancyScore * 0.15);

  const recommendations = generateRecommendations(
    breakdown,
    { utilizationScore, distributionScore, priorityScore, freshnessScore, redundancyScore }
  );

  const warnings = generateWarnings(breakdown, overallScore);

  return {
    id: `score-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    overallScore: Math.min(1, Math.max(0, overallScore)),
    breakdown: {
      utilizationScore,
      distributionScore,
      priorityScore,
      freshnessScore,
      redundancyScore,
    },
    recommendations,
    warnings,
  };
}

/**
 * @summary 分布スコアを計算（シャノンエントロピー）
 */
function calculateDistributionScore(categories: CategoryBreakdown[]): number {
  const validCategories = categories.filter((c) => c.ratio > 0);
  if (validCategories.length <= 1) return 1;

  const entropy = validCategories.reduce((sum, c) => {
    if (c.ratio <= 0) return sum;
    return sum - c.ratio * Math.log2(c.ratio);
  }, 0);

  const maxEntropy = Math.log2(validCategories.length);
  return maxEntropy > 0 ? entropy / maxEntropy : 1;
}

/**
 * @summary 優先度スコアを計算
 */
function calculatePriorityScore(priorities: PriorityBreakdown[]): number {
  const totalWeight = priorities.reduce((sum, p) => sum + p.weight * p.tokens, 0);
  const totalTokens = priorities.reduce((sum, p) => sum + p.tokens, 0);

  if (totalTokens === 0) return 1;

  const weightedAverage = totalWeight / totalTokens;
  return Math.min(1, weightedAverage * 1.5); // Scale up slightly
}

/**
 * @summary 鮮度スコアを計算
 */
function calculateFreshnessScore(sources: SourceBreakdown[], now: number): number {
  if (sources.length === 0) return 1;

  const avgAge =
    sources.reduce((sum, s) => sum + (now - s.lastUpdated), 0) / sources.length;
  const ageInMinutes = avgAge / (1000 * 60);

  // Score decreases with age: 1.0 at 0 min, ~0.5 at 30 min, ~0.1 at 120 min
  return Math.exp(-ageInMinutes / 30);
}

/**
 * @summary 冗長性スコアを計算
 */
function calculateRedundancyScore(sources: SourceBreakdown[]): number {
  if (sources.length <= 1) return 1;

  const totalSources = sources.length;
  const uniqueSources = new Set(sources.map((s) => s.source)).size;

  return uniqueSources / totalSources;
}

/**
 * @summary 改善提案を生成
 */
function generateRecommendations(
  breakdown: ContextBreakdown,
  scores: ContextEfficiencyScore["breakdown"]
): ContextEfficiencyScore["recommendations"] {
  const recommendations: ContextEfficiencyScore["recommendations"] = [];

  if (scores.utilizationScore < 0.7) {
    if (breakdown.metrics.utilizationRatio < OPTIMAL_MIN_UTILIZATION) {
      recommendations.push({
        priority: "medium",
        description: "Consider adding more relevant context to improve utilization",
        estimatedImpact: `Increase utilization from ${(breakdown.metrics.utilizationRatio * 100).toFixed(1)}% to target range (60-85%)`,
      });
    } else {
      recommendations.push({
        priority: "high",
        description: "Reduce context size to prevent token overflow",
        estimatedImpact: `Free up ${breakdown.metrics.totalTokens - breakdown.metrics.effectiveBudget} tokens`,
      });
    }
  }

  if (scores.distributionScore < 0.5) {
    const dominant = breakdown.categoryBreakdown.reduce((max, c) =>
      c.ratio > max.ratio ? c : max
    );
    recommendations.push({
      priority: "medium",
      description: `Balance context distribution - ${dominant.category} dominates at ${(dominant.ratio * 100).toFixed(1)}%`,
      estimatedImpact: "Improve information diversity",
      targetCategory: dominant.category,
    });
  }

  if (scores.priorityScore < 0.6) {
    recommendations.push({
      priority: "high",
      description: "Increase high-priority content ratio",
      estimatedImpact: "Improve critical information retention",
    });
  }

  if (scores.freshnessScore < 0.5) {
    recommendations.push({
      priority: "low",
      description: "Refresh stale context sources",
      estimatedImpact: "Improve relevance of information",
    });
  }

  return recommendations;
}

/**
 * @summary 警告を生成
 */
function generateWarnings(
  breakdown: ContextBreakdown,
  overallScore: number
): ContextEfficiencyScore["warnings"] {
  const warnings: ContextEfficiencyScore["warnings"] = [];

  if (breakdown.metrics.utilizationRatio > 0.95) {
    warnings.push({
      type: "high_utilization",
      description: `Critical utilization: ${(breakdown.metrics.utilizationRatio * 100).toFixed(1)}%`,
      severity: "critical",
    });
  } else if (breakdown.metrics.utilizationRatio > 0.85) {
    warnings.push({
      type: "high_utilization",
      description: `High utilization: ${(breakdown.metrics.utilizationRatio * 100).toFixed(1)}%`,
      severity: "warning",
    });
  }

  const lowPriorityRatio = breakdown.priorityBreakdown
    .filter((p) => p.priority === "low" || p.priority === "optional")
    .reduce((sum, p) => sum + p.ratio, 0);

  if (lowPriorityRatio > 0.5) {
    warnings.push({
      type: "low_priority_dominance",
      description: `Low priority content dominates: ${(lowPriorityRatio * 100).toFixed(1)}%`,
      severity: "warning",
    });
  }

  if (overallScore < 0.4) {
    warnings.push({
      type: "stale_content",
      description: "Overall efficiency critically low - review context composition",
      severity: "critical",
    });
  }

  return warnings;
}

// ============================================================================
// Breakdown Comparison
// ============================================================================

/**
 * @summary 2つの内訳を比較
 * @param baseline ベース内訳
 * @param comparison 比較対象内訳
 * @returns 比較結果
 */
export function compareBreakdowns(
  baseline: ContextBreakdown,
  comparison: ContextBreakdown
): ContextBreakdownComparison {
  const id = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const tokenDelta = comparison.metrics.totalTokens - baseline.metrics.totalTokens;
  const utilizationDelta = comparison.metrics.utilizationRatio - baseline.metrics.utilizationRatio;

  // Calculate category changes
  const categoryChanges = calculateCategoryChanges(
    baseline.categoryBreakdown,
    comparison.categoryBreakdown
  );

  // Find new and removed sources
  const baselineSources = new Set(baseline.sourceBreakdown.map((s) => s.source));
  const comparisonSources = new Set(comparison.sourceBreakdown.map((s) => s.source));

  const newSources = Array.from(comparisonSources).filter((s) => !baselineSources.has(s));
  const removedSources = Array.from(baselineSources).filter((s) => !comparisonSources.has(s));

  // Determine if improved
  const baselineScore = calculateQuickScore(baseline);
  const comparisonScore = calculateQuickScore(comparison);
  const isImproved = comparisonScore > baselineScore;

  // Identify primary change factors
  const primaryChangeFactors: string[] = [];
  if (Math.abs(tokenDelta) > baseline.metrics.maxTokens * 0.1) {
    primaryChangeFactors.push(tokenDelta > 0 ? "Significant token increase" : "Significant token decrease");
  }
  if (newSources.length > 0) {
    primaryChangeFactors.push(`Added ${newSources.length} new source(s)`);
  }
  if (removedSources.length > 0) {
    primaryChangeFactors.push(`Removed ${removedSources.length} source(s)`);
  }

  return {
    id,
    baseline,
    comparison,
    diff: {
      tokenDelta,
      utilizationDelta,
      categoryChanges,
      newSources,
      removedSources,
    },
    analysis: {
      isImproved,
      primaryChangeFactors,
      recommendations: generateComparisonRecommendations(baseline, comparison, isImproved),
    },
  };
}

/**
 * @summary カテゴリ変化を計算
 */
function calculateCategoryChanges(
  baseline: CategoryBreakdown[],
  comparison: CategoryBreakdown[]
): ContextBreakdownComparison["diff"]["categoryChanges"] {
  const baselineMap = new Map(baseline.map((c) => [c.category, c]));
  const comparisonMap = new Map(comparison.map((c) => [c.category, c]));

  const allCategories = new Set([...baselineMap.keys(), ...comparisonMap.keys()]);

  return Array.from(allCategories)
    .map((category) => {
      const base = baselineMap.get(category);
      const comp = comparisonMap.get(category);

      const tokenDelta = (comp?.tokens || 0) - (base?.tokens || 0);
      const ratioDelta = (comp?.ratio || 0) - (base?.ratio || 0);

      return { category, tokenDelta, ratioDelta };
    })
    .filter((change) => change.tokenDelta !== 0 || change.ratioDelta !== 0);
}

/**
 * @summary 簡易スコア計算（比較用）
 */
function calculateQuickScore(breakdown: ContextBreakdown): number {
  const utilScore = breakdown.metrics.utilizationRatio < 0.85 ? 1 : 0.5;
  const priorityScore =
    breakdown.priorityBreakdown.find((p) => p.priority === "critical")?.ratio || 0;
  return utilScore * 0.5 + priorityScore * 0.5;
}

/**
 * @summary 比較結果に基づく推奨事項を生成
 */
function generateComparisonRecommendations(
  baseline: ContextBreakdown,
  comparison: ContextBreakdown,
  isImproved: boolean
): string[] {
  const recommendations: string[] = [];

  if (!isImproved) {
    if (comparison.metrics.utilizationRatio > baseline.metrics.utilizationRatio) {
      recommendations.push("Consider reducing context size to improve efficiency");
    }
    if (comparison.metrics.remainingTokens < baseline.metrics.remainingTokens) {
      recommendations.push("Token budget decreased - review priority allocation");
    }
  } else {
    if (comparison.metrics.utilizationRatio < baseline.metrics.utilizationRatio) {
      recommendations.push("Good: Context size optimized");
    }
    if (comparison.metrics.remainingTokens > baseline.metrics.remainingTokens) {
      recommendations.push("Good: More token budget available");
    }
  }

  return recommendations;
}

// ============================================================================
// Usage Metrics Tracking
// ============================================================================

/**
 * @summary 使用メトリクス追跡セッションを開始
 * @param sessionId セッションID
 * @returns メトリクス追跡オブジェクト
 */
export function startUsageTracking(sessionId: string): {
  sessionId: string;
  startTime: number;
  samples: Array<{ timestamp: number; utilization: number; tokens: number }>;
  events: Array<{ type: string; timestamp: number; details?: unknown }>;
} {
  return {
    sessionId,
    startTime: Date.now(),
    samples: [],
    events: [],
  };
}

/**
 * @summary サンプルを記録
 * @param tracking 追跡オブジェクト
 * @param breakdown 現在の内訳
 */
export function recordSample(
  tracking: ReturnType<typeof startUsageTracking>,
  breakdown: ContextBreakdown
): void {
  tracking.samples.push({
    timestamp: Date.now(),
    utilization: breakdown.metrics.utilizationRatio,
    tokens: breakdown.metrics.totalTokens,
  });
}

/**
 * @summary イベントを記録
 * @param tracking 追跡オブジェクト
 * @param type イベントタイプ
 * @param details 詳細情報
 */
export function recordEvent(
  tracking: ReturnType<typeof startUsageTracking>,
  type: "summarization" | "trim" | "remove" | "warning" | "error",
  details?: unknown
): void {
  tracking.events.push({
    type,
    timestamp: Date.now(),
    details,
  });
}

/**
 * @summary 使用メトリクスを完了
 * @param tracking 追跡オブジェクト
 * @param finalBreakdown 最終内訳
 * @returns 完成したContextUsageMetrics
 */
export function completeUsageTracking(
  tracking: ReturnType<typeof startUsageTracking>,
  finalBreakdown: ContextBreakdown
): ContextUsageMetrics {
  const endTime = Date.now();
  const duration = endTime - tracking.startTime;

  const utilizations = tracking.samples.map((s) => s.utilization);
  const averageUtilization =
    utilizations.reduce((sum, u) => sum + u, 0) / (utilizations.length || 1);
  const peakUtilization = Math.max(...utilizations, finalBreakdown.metrics.utilizationRatio);
  const minUtilization = Math.min(...utilizations, finalBreakdown.metrics.utilizationRatio);

  const summarizationCount = tracking.events.filter((e) => e.type === "summarization").length;
  const trimmedItemCount = tracking.events.filter((e) => e.type === "trim").length;
  const removedItemCount = tracking.events.filter((e) => e.type === "remove").length;
  const warningCount = tracking.events.filter((e) => e.type === "warning").length;
  const errorCount = tracking.events.filter((e) => e.type === "error").length;

  // Calculate category trends
  const categoryTrends: ContextUsageMetrics["categoryTrends"] = {
    "task-instruction": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "system-prompt": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "execution-rules": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "file-content": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    conversation: { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "agent-output": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "verification-result": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "working-memory": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "skill-content": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "reference-doc": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
    "error-context": { initialTokens: 0, finalTokens: 0, peakTokens: 0 },
  };

  // Note: In real implementation, would track initial/final/peak per category
  // For now, using final values as approximation
  for (const cat of finalBreakdown.categoryBreakdown) {
    categoryTrends[cat.category] = {
      initialTokens: cat.tokens,
      finalTokens: cat.tokens,
      peakTokens: cat.tokens,
    };
  }

  return {
    id: `metrics-${tracking.sessionId}-${endTime}`,
    startTime: tracking.startTime,
    endTime,
    duration,
    averageUtilization,
    peakUtilization,
    minUtilization,
    summarizationCount,
    trimmedItemCount,
    removedItemCount,
    categoryTrends,
    warningCount,
    errorCount,
  };
}

// ============================================================================
// Injection Tracking
// ============================================================================

/** 追跡されたソース情報 */
interface TrackedSource {
  source: string;
  content: string;
  charCount: number;
  timestamp: number;
}

/** グローバルな追跡状態 */
const trackedSources: TrackedSource[] = [];

/**
 * @summary コンテキスト注入を記録
 * @param source 注入ソース（'startup-context', 'append-system', 'inject-prompt'など）
 * @param content 注入されたコンテンツ
 */
export function recordInjection(source: string, content: string): void {
  trackedSources.push({
    source,
    content,
    charCount: content.length,
    timestamp: Date.now(),
  });
  
  const tokenEstimate = Math.ceil(content.length / 4);
  console.log(`[context-breakdown] Injection recorded: ${source} (~${tokenEstimate} tokens)`);
}

/**
 * @summary 追跡されたソース情報を取得
 * @returns ソース情報配列（injectedContent含む）
 */
export function getTrackedSources(): Array<{ source: string; charCount: number; injectedContent?: string }> {
  return trackedSources.map(s => ({ 
    source: s.source, 
    charCount: s.charCount,
    injectedContent: s.content 
  }));
}

/**
 * @summary 追跡状態をクリア
 */
export function clearTrackedSources(): void {
  trackedSources.length = 0;
}

// ============================================================================
// Export
// ============================================================================

export default {
  createContextBreakdown,
  calculateEfficiencyScore,
  compareBreakdowns,
  startUsageTracking,
  recordSample,
  recordEvent,
  completeUsageTracking,
  recordInjection,
};
