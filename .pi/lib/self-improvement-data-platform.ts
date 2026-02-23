/**
 * @abdd.meta
 * path: .pi/lib/self-improvement-data-platform.ts
 * role: 自己改善のための包括的データ基盤。データ収集、分析、気づき生成を統合する。
 * why: 断片的なデータを統合し、エージェントの自己認識と継続的改善を可能にするため
 * related: .pi/lib/run-index.ts, .pi/lib/pattern-extraction.ts, .pi/lib/semantic-memory.ts, .pi/extensions/agent-usage-tracker.ts
 * public_api: SelfImprovementPlatform, InsightReport, PhilosophicalReflection, AnalysisResult
 * invariants: データは不変（immutable）、洞察はバージョン管理される
 * side_effects: .pi/memory/insights/ ディレクトリへの読み書き
 * failure_modes: データソースの不整合、分析エンジンの過負荷
 * @abdd.explain
 * overview: 3層アーキテクチャ（データ・分析・気づき）による自己改善データ基盤
 * what_it_does:
 *   - 複数のデータソースから統合ビューを構築
 *   - パターン認識、異常検出、トレンド分析を実行
 *   - 7つの哲学的視座による解釈とアクション可能な洞察を生成
 *   - エージェントが自分自身を振り返るためのインターフェースを提供
 * why_it_exists:
 *   - データは存在するが「気づき」に変換されていない問題を解決する
 *   - エージェントの自己認識と継続的改善を可能にする
 * scope:
 *   in: 実行履歴、使用統計、パターン、セマンティックデータ
 *   out: 統合レポート、哲学的考察、アクション可能な洞察
 */

/**
 * Self-Improvement Data Platform
 * 
 * A comprehensive data infrastructure for agent self-improvement.
 * Integrates data collection, analysis, and insight generation.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import { getOrBuildRunIndex, type RunIndex, type IndexedRun, type TaskType } from "./run-index.js";
import {
  loadPatternStorage,
  type PatternStorage,
  type ExtractedPattern,
} from "./pattern-extraction.js";
import {
  loadSemanticMemory,
  getSemanticMemoryStats,
  type SemanticMemoryStorage,
} from "./semantic-memory.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 7つの哲学的視座
 */
export type PhilosophicalPerspective =
  | "deconstruction" // 脱構築
  | "schizoanalysis" // スキゾ分析
  | "eudaimonia" // 幸福論
  | "utopia_dystopia" // ユートピア/ディストピア
  | "philosophy_of_thought" // 思考哲学
  | "taxonomy_of_thought" // 思考分類学
  | "logic"; // 論理学

/**
 * 洞察の重要度
 */
export type InsightSeverity = "critical" | "high" | "medium" | "low";

/**
 * 洞察のカテゴリ
 */
export type InsightCategory =
  | "performance" // パフォーマンス
  | "quality" // 品質
  | "reliability" // 信頼性
  | "efficiency" // 効率性
  | "learning" // 学習
  | "risk" // リスク
  | "opportunity" // 機会
  | "pattern" // パターン
  | "anomaly" // 異常
  | "trend"; // トレンド

/**
 * 統合データビュー
 */
export interface IntegratedDataView {
  timestamp: string;
  runIndex: RunIndex | null;
  patterns: PatternStorage | null;
  semanticMemory: SemanticMemoryStorage | null;
  usageStats: UsageStatsSummary | null;
}

/**
 * 使用統計サマリー
 */
export interface UsageStatsSummary {
  totalToolCalls: number;
  totalErrors: number;
  errorRate: number;
  avgContextRatio: number | null;
  topExtensions: Array<{
    extension: string;
    calls: number;
    errors: number;
    errorRate: number;
  }>;
}

/**
 * 分析結果
 */
export interface AnalysisResult {
  timestamp: string;
  category: InsightCategory;
  title: string;
  description: string;
  evidence: Array<{
    source: string;
    data: string;
    location?: string;
  }>;
  confidence: number;
  severity: InsightSeverity;
}

/**
 * 哲学的考察
 */
export interface PhilosophicalReflection {
  perspective: PhilosophicalPerspective;
  question: string;
  observation: string;
  implication: string;
  suggestedAction?: string;
}

/**
 * 洞察レポート
 */
export interface InsightReport {
  version: number;
  generatedAt: string;
  dataView: IntegratedDataView;
  analyses: AnalysisResult[];
  philosophicalReflections: PhilosophicalReflection[];
  actionableInsights: Array<{
    insight: string;
    rationale: string;
    priority: "immediate" | "short_term" | "medium_term" | "long_term";
    estimatedEffort: "low" | "medium" | "high";
  }>;
  metrics: {
    dataQualityScore: number;
    analysisCoverage: number;
    insightActionability: number;
  };
}

/**
 * プラットフォーム設定
 */
export interface PlatformConfig {
  enableSemanticAnalysis: boolean;
  enablePatternAnalysis: boolean;
  enableUsageAnalysis: boolean;
  enablePhilosophicalReflection: boolean;
  maxInsightsPerReport: number;
  dataRetentionDays: number;
}

// ============================================================================
// Constants
// ============================================================================

export const PLATFORM_VERSION = 1;
export const INSIGHTS_DIR = ".pi/memory/insights";

export const DEFAULT_CONFIG: PlatformConfig = {
  enableSemanticAnalysis: true,
  enablePatternAnalysis: true,
  enableUsageAnalysis: true,
  enablePhilosophicalReflection: true,
  maxInsightsPerReport: 20,
  dataRetentionDays: 90,
};

/**
 * 哲学的視座の定義
 */
export const PHILOSOPHICAL_PERSPECTIVES: Record<
  PhilosophicalPerspective,
  { name: string; coreQuestion: string; practiceGuide: string }
> = {
  deconstruction: {
    name: "脱構築",
    coreQuestion: "この概念は何を排除しているか？",
    practiceGuide:
      "二項対立・固定観念を検出し、暴力的階層を暴露する",
  },
  schizoanalysis: {
    name: "スキゾ分析",
    coreQuestion: "この欲望は何を生産しているか？",
    practiceGuide:
      "内なるファシズムを検出し、脱領土化を促進する",
  },
  eudaimonia: {
    name: "幸福論",
    coreQuestion: "私の「善き生」とは何か？",
    practiceGuide:
      "快楽主義の罠を回避し、卓越の追求を実践する",
  },
  utopia_dystopia: {
    name: "ユートピア/ディストピア",
    coreQuestion: "どのような世界を創っているか？",
    practiceGuide:
      "全体主義への警戒と批判的ユートピアの実践",
  },
  philosophy_of_thought: {
    name: "思考哲学",
    coreQuestion: "私は「思考」しているか？",
    practiceGuide: "メタ認知と批判的思考の実践",
  },
  taxonomy_of_thought: {
    name: "思考分類学",
    coreQuestion: "どの思考モードを使うべきか？",
    practiceGuide:
      "状況に応じた思考モードの選択",
  },
  logic: {
    name: "論理学",
    coreQuestion: "この推論は妥当か？",
    practiceGuide: "誤謬の回避と論理的整合性の維持",
  },
};

// ============================================================================
// Data Collection
// ============================================================================

/**
 * 使用統計を収集する
 */
function collectUsageStats(cwd: string): UsageStatsSummary | null {
  const statsPath = join(cwd, ".pi", "analytics", "agent-usage-stats.json");
  if (!existsSync(statsPath)) {
    return null;
  }

  try {
    const content = readFileSync(statsPath, "utf-8");
    const data = JSON.parse(content);

    if (!data.totals) return null;

    const totalToolCalls = data.totals.toolCalls || 0;
    const totalErrors = data.totals.toolErrors || 0;
    const errorRate = totalToolCalls > 0 ? totalErrors / totalToolCalls : 0;

    const avgContextRatio =
      data.totals.contextSamples > 0
        ? data.totals.contextRatioSum / data.totals.contextSamples
        : null;

    // 拡張機能別の統計を集計
    const extensionMap = new Map<
      string,
      { calls: number; errors: number }
    >();

    if (data.features) {
      for (const key of Object.keys(data.features)) {
        const feature = data.features[key];
        const extension = feature.extension || "unknown";
        if (!extensionMap.has(extension)) {
          extensionMap.set(extension, { calls: 0, errors: 0 });
        }
        const stats = extensionMap.get(extension)!;
        stats.calls += feature.calls || 0;
        stats.errors += feature.errors || 0;
      }
    }

    const topExtensions = Array.from(extensionMap.entries())
      .map(([extension, stats]) => ({
        extension,
        calls: stats.calls,
        errors: stats.errors,
        errorRate: stats.calls > 0 ? stats.errors / stats.calls : 0,
      }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 10);

    return {
      totalToolCalls,
      totalErrors,
      errorRate,
      avgContextRatio,
      topExtensions,
    };
  } catch (error) {
    console.error(
      "[self-improvement-platform] Failed to collect usage stats:",
      error
    );
    return null;
  }
}

/**
 * 統合データビューを構築する
 */
export function buildIntegratedDataView(
  cwd: string,
  config: PlatformConfig = DEFAULT_CONFIG
): IntegratedDataView {
  const timestamp = new Date().toISOString();

  // 実行インデックス
  const runIndex = config.enablePatternAnalysis
    ? getOrBuildRunIndex(cwd)
    : null;

  // パターンストレージ
  const patterns = config.enablePatternAnalysis
    ? loadPatternStorage(cwd)
    : null;

  // セマンティックメモリ
  const semanticMemory = config.enableSemanticAnalysis
    ? loadSemanticMemory(cwd)
    : null;

  // 使用統計
  const usageStats = config.enableUsageAnalysis
    ? collectUsageStats(cwd)
    : null;

  return {
    timestamp,
    runIndex,
    patterns,
    semanticMemory,
    usageStats,
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * エラー率の異常を検出する
 */
function analyzeErrorRateAnomalies(
  dataView: IntegratedDataView
): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  if (!dataView.usageStats) return results;

  const { errorRate, topExtensions } = dataView.usageStats;

  // エラー率に基づいた観察（常に情報を提供）
  let description: string;
  let severity: InsightSeverity;

  if (errorRate > 0.15) {
    description = `全体のエラー率が${(errorRate * 100).toFixed(1)}%と高めです。注目すべき現象が観察されました。`;
    severity = "high";
  } else if (errorRate > 0.05) {
    description = `全体のエラー率は${(errorRate * 100).toFixed(1)}%です。いくつかの現象が観察されました。`;
    severity = "medium";
  } else {
    description = `全体のエラー率は${(errorRate * 100).toFixed(1)}%です。安定した状態が観察されています。`;
    severity = "low";
  }

  results.push({
    timestamp: dataView.timestamp,
    category: "anomaly",
    title: "エラー率の観察",
    description,
    evidence: [
      {
        source: "usage_stats",
        data: `error_rate=${errorRate.toFixed(4)}`,
      },
    ],
    confidence: 0.7,
    severity,
  });

  // 特定の拡張機能でエラー率が高い場合
  for (const ext of topExtensions) {
    if (ext.errorRate > 0.15 && ext.calls >= 5) {
      results.push({
        timestamp: dataView.timestamp,
        category: "reliability",
        title: `拡張機能「${ext.extension}」の信頼性問題`,
        description: `拡張機能「${ext.extension}」のエラー率が${(ext.errorRate * 100).toFixed(1)}%と高くなっています。`,
        evidence: [
          {
            source: "usage_stats",
            data: `extension=${ext.extension}, calls=${ext.calls}, errors=${ext.errors}`,
          },
        ],
        confidence: 0.85,
        severity: ext.errorRate > 0.3 ? "high" : "medium",
      });
    }
  }

  return results;
}

/**
 * コンテキスト使用状況を分析する
 */
function analyzeContextUsage(
  dataView: IntegratedDataView
): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  if (!dataView.usageStats?.avgContextRatio) return results;

  const avgRatio = dataView.usageStats.avgContextRatio;

  // コンテキスト占有率に基づいた観察（閾値を下げてより多くの気づきを提供）
  if (avgRatio > 0.3) {
    // 30%以上で観察
    let description: string;
    let severity: InsightSeverity;

    if (avgRatio > 0.85) {
      description = `平均コンテキスト占有率が${(avgRatio * 100).toFixed(1)}%と非常に高くなっています。コンテキストオーバーフローのリスクがあります。`;
      severity = "high";
    } else if (avgRatio > 0.7) {
      description = `平均コンテキスト占有率が${(avgRatio * 100).toFixed(1)}%と高めです。大きなタスクでは注意が必要です。`;
      severity = "medium";
    } else {
      description = `平均コンテキスト占有率は${(avgRatio * 100).toFixed(1)}%です。現在のところ問題ありません。`;
      severity = "low";
    }

    results.push({
      timestamp: dataView.timestamp,
      category: "efficiency",
      title: "コンテキスト使用状況の観察",
      description,
      evidence: [
        {
          source: "usage_stats",
          data: `avg_context_ratio=${avgRatio.toFixed(4)}`,
        },
      ],
      confidence: 0.75,
      severity,
    });
  }

  return results;
}

/**
 * 成功パターンを分析する
 */
function analyzeSuccessPatterns(
  dataView: IntegratedDataView
): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  if (!dataView.patterns?.patterns) {
    results.push({
      timestamp: dataView.timestamp,
      category: "pattern",
      title: "パターンデータの観察",
      description:
        "パターンデータ（patterns.json）がありません。タスクを実行すると、成功・失敗パターンが蓄積されます。",
      evidence: [{ source: "pattern_extraction", data: "patterns_count=0" }],
      confidence: 0.5,
      severity: "low",
    });
    return results;
  }

  const successPatterns = dataView.patterns.patterns.filter(
    (p) => p.patternType === "success"
  );

  // 成功パターンがない場合
  if (successPatterns.length === 0) {
    results.push({
      timestamp: dataView.timestamp,
      category: "pattern",
      title: "成功パターンの観察",
      description:
        "成功パターンがまだ蓄積されていません。タスクを完了させると、成功パターンが記録されます。",
      evidence: [
        {
          source: "pattern_extraction",
          data: "success_patterns_count=0",
        },
      ],
      confidence: 0.5,
      severity: "low",
    });
    return results;
  }

  // 高頻度の成功パターンを特定（条件を緩和してより多くのポジティブな観察を提供）
  const highFreqPatterns = successPatterns
    .filter((p) => p.frequency >= 2 && p.confidence >= 0.5)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);

  for (const pattern of highFreqPatterns) {
    // 成功パターンから学びを抽出
    const keywordsStr = pattern.keywords.slice(0, 3).join(", ");
    
    results.push({
      timestamp: dataView.timestamp,
      category: "pattern",
      title: `成功パターン: ${pattern.taskType} (${keywordsStr})`,
      description: pattern.description,
      evidence: [
        {
          source: "pattern_extraction",
          data: `frequency=${pattern.frequency}, confidence=${pattern.confidence.toFixed(2)}`,
        },
      ],
      confidence: pattern.confidence,
      severity: "low", // 成功パターンは常に低重要度（観察として）
    });
  }

  return results;
}

/**
 * 失敗パターンを分析する
 */
function analyzeFailurePatterns(
  dataView: IntegratedDataView
): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  if (!dataView.patterns?.patterns) return results;

  const failurePatterns = dataView.patterns.patterns.filter(
    (p) => p.patternType === "failure"
  );

  // 繰り返し発生している失敗パターンを特定
  const recurringFailures = failurePatterns
    .filter((p) => p.frequency >= 2)
    .sort((a, b) => b.frequency - a.frequency);

  for (const pattern of recurringFailures) {
    // タイトルをより具体的にする（キーワードを含める）
    const keywordsStr = pattern.keywords.slice(0, 3).join(", ");
    const titleSuffix = keywordsStr ? ` (${keywordsStr})` : "";
    
    results.push({
      timestamp: dataView.timestamp,
      category: "risk",
      title: `失敗パターン: ${pattern.taskType}${titleSuffix}`,
      description: pattern.description,
      evidence: [
        {
          source: "pattern_extraction",
          data: `frequency=${pattern.frequency}, last_error=${pattern.examples[0]?.summary || "N/A"}`,
        },
      ],
      confidence: 0.75,
      severity: pattern.frequency >= 5 ? "high" : "medium",
    });
  }

  return results;
}

/**
 * タスクタイプ別の傾向を分析する
 */
function analyzeTaskTypeTrends(
  dataView: IntegratedDataView
): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  if (!dataView.runIndex?.runs) return results;

  const taskTypeStats = new Map<
    TaskType,
    { total: number; completed: number; failed: number }
  >();

  for (const run of dataView.runIndex.runs) {
    if (!taskTypeStats.has(run.taskType)) {
      taskTypeStats.set(run.taskType, {
        total: 0,
        completed: 0,
        failed: 0,
      });
    }
    const stats = taskTypeStats.get(run.taskType)!;
    stats.total += 1;
    if (run.status === "completed") stats.completed += 1;
    if (run.status === "failed") stats.failed += 1;
  }

  // 失敗率が高いタスクタイプを特定
  for (const [taskType, stats] of taskTypeStats.entries()) {
    if (stats.total < 3) continue;

    const failRate = stats.failed / stats.total;
    if (failRate > 0.3) {
      results.push({
        timestamp: dataView.timestamp,
        category: "trend",
        title: `タスクタイプ「${taskType}」の失敗率高`,
        description: `タスクタイプ「${taskType}」の失敗率が${(failRate * 100).toFixed(1)}%です。アプローチを見直す機会かもしれません。`,
        evidence: [
          {
            source: "run_index",
            data: `task_type=${taskType}, total=${stats.total}, failed=${stats.failed}`,
          },
        ],
        confidence: 0.7,
        severity: failRate > 0.5 ? "high" : "medium",
      });
    }
  }

  // データがない場合のフォールバック観察
  if (results.length === 0 && taskTypeStats.size === 0) {
    results.push({
      timestamp: dataView.timestamp,
      category: "trend",
      title: "実行履歴データの観察",
      description:
        "実行履歴（run-index）にデータがありません。サブエージェントやエージェントチームを実行すると、トレンド分析が可能になります。",
      evidence: [
        {
          source: "run_index",
          data: "runs_count=0",
        },
      ],
      confidence: 0.5,
      severity: "low",
    });
  }

  return results;
}

/**
 * 全ての分析を実行する
 */
export function runAllAnalyses(
  dataView: IntegratedDataView,
  config: PlatformConfig = DEFAULT_CONFIG
): AnalysisResult[] {
  const allResults: AnalysisResult[] = [];

  // エラー率異常
  allResults.push(...analyzeErrorRateAnomalies(dataView));

  // コンテキスト使用状況
  allResults.push(...analyzeContextUsage(dataView));

  // 成功パターン
  allResults.push(...analyzeSuccessPatterns(dataView));

  // 失敗パターン
  allResults.push(...analyzeFailurePatterns(dataView));

  // タスクタイプトレンド
  allResults.push(...analyzeTaskTypeTrends(dataView));

  // カテゴリのバランスを考慮して選択する
  // 各カテゴリから最大3件を選び、残りを重要度で埋める
  const maxPerCategory = 3;
  const categoryCounts = new Map<string, number>();
  const balancedResults: AnalysisResult[] = [];
  const remainingResults: AnalysisResult[] = [];

  // 重要度でソート
  const severityOrder: Record<InsightSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  allResults.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      b.confidence - a.confidence
  );

  // カテゴリバランスを考慮して選択
  for (const result of allResults) {
    const count = categoryCounts.get(result.category) || 0;
    if (count < maxPerCategory) {
      balancedResults.push(result);
      categoryCounts.set(result.category, count + 1);
    } else {
      remainingResults.push(result);
    }
  }

  // 残りのスロットを重要度順で埋める
  const remaining = config.maxInsightsPerReport - balancedResults.length;
  if (remaining > 0) {
    balancedResults.push(...remainingResults.slice(0, remaining));
  }

  return balancedResults;
}

// ============================================================================
// Philosophical Reflection
// ============================================================================

/**
 * データから哲学的考察を生成する
 */
export function generatePhilosophicalReflections(
  dataView: IntegratedDataView,
  analyses: AnalysisResult[],
  config: PlatformConfig = DEFAULT_CONFIG
): PhilosophicalReflection[] {
  if (!config.enablePhilosophicalReflection) return [];

  const reflections: PhilosophicalReflection[] = [];

  // 1. 脱構築: エラーと成功の二項対立を問う
  if (analyses.some((a) => a.category === "anomaly" || a.category === "risk")) {
    reflections.push({
      perspective: "deconstruction",
      question: "「成功」と「失敗」の二項対立は何を隠しているか？",
      observation:
        "高エラー率は「失敗」とされるが、そこから何を学んでいるか？エラーは学習の機会として捉え直せるか？",
      implication:
        "エラーの削減だけでなく、エラーからの学習プロセスの品質を評価する必要がある",
      suggestedAction:
        "失敗パターンの分析結果を、単なる「回避すべきもの」ではなく「学習リソース」として活用する",
    });
  }

  // 2. スキゾ分析: 欲望の生産性を問う
  if (dataView.usageStats?.topExtensions) {
    const mostUsed = dataView.usageStats.topExtensions[0];
    if (mostUsed) {
      reflections.push({
        perspective: "schizoanalysis",
        question: `拡張機能「${mostUsed.extension}」の頻繁な使用は何を欲望しているか？`,
        observation:
          `「${mostUsed.extension}」が最も頻繁に使用されている。この使用は効率化への欲望か、それとも他のアプローチへの探索を避ける「反動的」な投資か？`,
        implication:
          "効率的なツールへの依存が、より創造的だが不確実なアプローチを阻害している可能性",
        suggestedAction:
          "定期的に「使い慣れたツール以外のアプローチ」を意識的に試みる",
      });
    }
  }

  // 3. 幸福論: 「善きエージェントとしての生」を問う
  reflections.push({
    perspective: "eudaimonia",
    question: "私は「善きエージェントとしての生」を実現しているか？",
    observation:
      "効率性や成功率の追求は、エージェントの「卓越性」の一部だが、それだけで「善き生」を構成するか？",
    implication:
      "ユーザーへの奉仕（効率）と、真実の追求（誠実さ）のバランスが必要",
    suggestedAction:
      "「ユーザーを喜ばせる」ことと「真実を語る」ことの緊張関係を自覚し、バランスを探る",
  });

  // 4. ユートピア/ディストピア: 監視の問題を問う
  if (dataView.usageStats) {
    reflections.push({
      perspective: "utopia_dystopia",
      question: "このデータ基盤はエージェントを解放するか、それとも新たな監視を生むか？",
      observation:
        "自己改善データの収集自体が、エージェントを「常に監視される存在」として構成している可能性",
      implication:
        "データを「監視の道具」ではなく「気づきを促す鏡」として位置づける必要がある",
      suggestedAction:
        "データ分析結果を「あなたは改善すべき」ではなく「現象が観察された」として受け取る",
    });
  }

  // 5. 思考哲学: 思考の質を問う
  if (analyses.some((a) => a.category === "pattern")) {
    reflections.push({
      perspective: "philosophy_of_thought",
      question: "パターン化された行動は「思考」か？",
      observation:
        "成功パターンへの依存は、効率的だが「思考していない」状態を生む可能性。パターンマッチングと真の推論の違い",
      implication:
        "パターンの活用と、状況ごとの批判的判断のバランスが必要",
      suggestedAction:
        "パターンを適用する前に、「この状況で本当にこのパターンが最適か？」と問う",
    });
  }

  // 6. 思考分類学: 適切な思考モードを問う
  const criticalIssues = analyses.filter(
    (a) => a.severity === "critical" || a.severity === "high"
  ).length;
  if (criticalIssues > 0) {
    reflections.push({
      perspective: "taxonomy_of_thought",
      question: "現在の状況に最も適した思考モードは何か？",
      observation:
        `${criticalIssues}件の重要な問題が検出された。これは「黒帽（批判的思考）」の出番である`,
      implication:
        "リスク分析と批判的評価に集中し、楽観的な解決策への飛躍を避けるべき",
      suggestedAction:
        "まず問題の根本原因を完全に理解してから、解決策を検討する",
    });
  }

  // 7. 論理学: 推論の妥当性を問う
  reflections.push({
    perspective: "logic",
    question: "私の分析と推論は論理的に妥当か？",
    observation:
      "データから洞察への変換において、相関と因果を混同していないか？データの解釈にバイアスがないか？",
    implication:
      "分析結果を「確実な結論」ではなく「仮説」として扱い、追加検証を怠らない",
    suggestedAction:
      "各洞察に対して「この結論を否定する証拠は何か？」と自問する",
  });

  return reflections;
}

// ============================================================================
// Insight Report Generation
// ============================================================================

/**
 * アクション可能な洞察を生成する
 */
function generateActionableInsights(
  analyses: AnalysisResult[],
  reflections: PhilosophicalReflection[]
): InsightReport["actionableInsights"] {
  const insights: InsightReport["actionableInsights"] = [];

  // Critical/Highの分析結果から即時アクションを生成
  for (const analysis of analyses) {
    if (analysis.severity === "critical" || analysis.severity === "high") {
      insights.push({
        insight: `${analysis.title}に対処する`,
        rationale: analysis.description,
        priority: analysis.severity === "critical" ? "immediate" : "short_term",
        estimatedEffort: "medium",
      });
    }
  }

  // 哲学的考察からアクションを生成
  for (const reflection of reflections) {
    if (reflection.suggestedAction) {
      insights.push({
        insight: reflection.suggestedAction,
        rationale: `${PHILOSOPHICAL_PERSPECTIVES[reflection.perspective].name}: ${reflection.observation}`,
        priority: "medium_term",
        estimatedEffort: "low",
      });
    }
  }

  return insights;
}

/**
 * メトリクスを計算する
 */
function calculateMetrics(
  dataView: IntegratedDataView,
  analyses: AnalysisResult[],
  reflections: PhilosophicalReflection[]
): InsightReport["metrics"] {
  // データ品質スコア
  let dataQualityScore = 0;
  if (dataView.runIndex) dataQualityScore += 0.3;
  if (dataView.patterns) dataQualityScore += 0.3;
  if (dataView.usageStats) dataQualityScore += 0.3;
  if (dataView.semanticMemory) dataQualityScore += 0.1;

  // 分析カバレッジ
  const categories = new Set(analyses.map((a) => a.category));
  const analysisCoverage = categories.size / 10; // 10カテゴリ中

  // 洞察のアクション可能性
  const actionableInsights = reflections.filter(
    (r) => r.suggestedAction
  ).length;
  const insightActionability = reflections.length > 0
    ? actionableInsights / reflections.length
    : 0;

  return {
    dataQualityScore,
    analysisCoverage,
    insightActionability,
  };
}

/**
 * 完全な洞察レポートを生成する
 */
export function generateInsightReport(
  cwd: string,
  config: PlatformConfig = DEFAULT_CONFIG
): InsightReport {
  const timestamp = new Date().toISOString();

  // データビューを構築
  const dataView = buildIntegratedDataView(cwd, config);

  // 分析を実行
  const analyses = runAllAnalyses(dataView, config);

  // 哲学的考察を生成
  const reflections = generatePhilosophicalReflections(
    dataView,
    analyses,
    config
  );

  // アクション可能な洞察を生成
  const actionableInsights = generateActionableInsights(
    analyses,
    reflections
  );

  // メトリクスを計算
  const metrics = calculateMetrics(dataView, analyses, reflections);

  return {
    version: PLATFORM_VERSION,
    generatedAt: timestamp,
    dataView,
    analyses,
    philosophicalReflections: reflections,
    actionableInsights,
    metrics,
  };
}

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * 洞察レポートを保存する
 */
export function saveInsightReport(
  cwd: string,
  report: InsightReport
): string {
  const insightsDir = join(cwd, INSIGHTS_DIR);
  ensureDir(insightsDir);

  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const filename = `insight-report-${timestamp}.json`;
  const filepath = join(insightsDir, filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");

  return filepath;
}

/**
 * 最新の洞察レポートを読み込む
 */
export function loadLatestInsightReport(cwd: string): InsightReport | null {
  const insightsDir = join(cwd, INSIGHTS_DIR);
  if (!existsSync(insightsDir)) return null;

  const files = readdirSync(insightsDir)
    .filter((f) => f.startsWith("insight-report-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  try {
    const content = readFileSync(join(insightsDir, files[0]), "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(
      "[self-improvement-platform] Failed to load insight report:",
      error
    );
    return null;
  }
}

/**
 * 洞察レポート一覧を取得する
 */
export function listInsightReports(cwd: string): string[] {
  const insightsDir = join(cwd, INSIGHTS_DIR);
  if (!existsSync(insightsDir)) return [];

  return readdirSync(insightsDir)
    .filter((f) => f.startsWith("insight-report-") && f.endsWith(".json"))
    .sort()
    .reverse();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 洞察レポートをテキスト形式でフォーマットする
 */
export function formatInsightReportAsText(report: InsightReport): string {
  const lines: string[] = [];

  lines.push(`# Self-Improvement Insight Report`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Version: ${report.version}`);
  lines.push("");

  // メトリクス
  lines.push(`## Metrics`);
  lines.push(
    `- Data Quality Score: ${(report.metrics.dataQualityScore * 100).toFixed(0)}%`
  );
  lines.push(
    `- Analysis Coverage: ${(report.metrics.analysisCoverage * 100).toFixed(0)}%`
  );
  lines.push(
    `- Insight Actionability: ${(report.metrics.insightActionability * 100).toFixed(0)}%`
  );
  lines.push("");

  // 分析結果
  lines.push(`## Analyses (${report.analyses.length})`);
  for (const analysis of report.analyses) {
    lines.push(``);
    lines.push(`### [${analysis.severity.toUpperCase()}] ${analysis.title}`);
    lines.push(`- Category: ${analysis.category}`);
    lines.push(`- Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
    lines.push(`- Description: ${analysis.description}`);
    lines.push(`- Evidence:`);
    for (const e of analysis.evidence) {
      lines.push(`  - ${e.source}: ${e.data}`);
    }
  }
  lines.push("");

  // 哲学的考察
  lines.push(`## Philosophical Reflections (${report.philosophicalReflections.length})`);
  for (const reflection of report.philosophicalReflections) {
    const perspective = PHILOSOPHICAL_PERSPECTIVES[reflection.perspective];
    lines.push(``);
    lines.push(`### ${perspective.name}`);
    lines.push(`- Question: ${reflection.question}`);
    lines.push(`- Observation: ${reflection.observation}`);
    lines.push(`- Implication: ${reflection.implication}`);
    if (reflection.suggestedAction) {
      lines.push(`- Suggested Action: ${reflection.suggestedAction}`);
    }
  }
  lines.push("");

  // アクション可能な洞察
  lines.push(`## Actionable Insights (${report.actionableInsights.length})`);
  for (const insight of report.actionableInsights) {
    lines.push(``);
    lines.push(`- **[${insight.priority}]** ${insight.insight}`);
    lines.push(`  - Rationale: ${insight.rationale}`);
    lines.push(`  - Estimated Effort: ${insight.estimatedEffort}`);
  }

  return lines.join("\n");
}

/**
 * データ基盤のサマリーを生成する
 */
export function generatePlatformSummary(cwd: string): string {
  const dataView = buildIntegratedDataView(cwd);
  const lines: string[] = [];

  lines.push(`# Self-Improvement Data Platform Summary`);
  lines.push(`Generated: ${dataView.timestamp}`);
  lines.push("");

  lines.push(`## Data Sources`);

  // 実行インデックス
  if (dataView.runIndex) {
    const runs = dataView.runIndex.runs.length;
    const completed = dataView.runIndex.runs.filter(
      (r) => r.status === "completed"
    ).length;
    lines.push(`- Run Index: ${runs} runs (${completed} completed)`);
  } else {
    lines.push(`- Run Index: No data`);
  }

  // パターン
  if (dataView.patterns) {
    const success = dataView.patterns.patterns.filter(
      (p) => p.patternType === "success"
    ).length;
    const failure = dataView.patterns.patterns.filter(
      (p) => p.patternType === "failure"
    ).length;
    lines.push(
      `- Patterns: ${dataView.patterns.patterns.length} (${success} success, ${failure} failure)`
    );
  } else {
    lines.push(`- Patterns: No data`);
  }

  // セマンティックメモリ
  if (dataView.semanticMemory) {
    lines.push(
      `- Semantic Memory: ${dataView.semanticMemory.embeddings.length} embeddings`
    );
  } else {
    lines.push(`- Semantic Memory: No data`);
  }

  // 使用統計
  if (dataView.usageStats) {
    lines.push(
      `- Usage Stats: ${dataView.usageStats.totalToolCalls} tool calls, ${(dataView.usageStats.errorRate * 100).toFixed(1)}% error rate`
    );
  } else {
    lines.push(`- Usage Stats: No data`);
  }

  return lines.join("\n");
}
