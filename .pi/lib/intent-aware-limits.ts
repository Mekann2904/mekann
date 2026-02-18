/**
 * Intent-Aware Limits Module.
 * Adapts resource allocation based on task intent classification.
 * Based on findings from "Agentic Search in the Wild" paper (arXiv:2601.17617v2):
 *
 * Intent Distribution:
 * - Declarative (fact-seeking): 88.64% - High repetition rate, early convergence
 * - Procedural (how-to): 3.96% - Deeper search, semantic stability
 * - Reasoning (analytical): 7.41% - Largest semantic drift, longest queries
 */

// ============================================================================
// Types
// ============================================================================

 /**
  * タスクの意図タイプ
  */
export type TaskIntent = "declarative" | "procedural" | "reasoning";

 /**
  * インテント対応の予算設定。
  * @param intent インテントの種類
  * @param maxIterations 推奨される最大反復回数
  * @param timeoutMultiplier タイムアウトの乗数（ベースタイムアウトに適用）
  * @param parallelismMultiplier 並列度の乗数（ベース並列度に適用）
  * @param repetitionTolerance 繰り返しの許容度（0-1、大きいほど許容）
  * @param description この予算プロファイルの説明
  */
export interface IntentBudget {
  /** Intent type */
  intent: TaskIntent;
  /** Recommended maximum iterations */
  maxIterations: number;
  /** Timeout multiplier (applied to base timeout) */
  timeoutMultiplier: number;
  /** Parallelism multiplier (applied to base parallelism) */
  parallelismMultiplier: number;
  /** Repetition tolerance (0-1, higher = more tolerant) */
  repetitionTolerance: number;
  /** Description of this budget profile */
  description: string;
}

 /**
  * 意図分類の入力データ
  * @param task タスクの説明
  * @param goal 目標基準（指定されている場合）
  * @param referenceCount 参照可能なリソース数
  */
export interface IntentClassificationInput {
  /** Task description */
  task: string;
  /** Goal criteria (if specified) */
  goal?: string;
  /** References available */
  referenceCount?: number;
}

 /**
  * 意図分類の結果を表します。
  * @param intent 分類された意図
  * @param confidence 信頼度スコア (0-1)
  * @param matchedPatterns マッチしたパターン
  * @param recommendedBudget 推奨予算
  */
export interface IntentClassificationResult {
  /** Classified intent */
  intent: TaskIntent;
  /** Confidence score (0-1) */
  confidence: number;
  /** Matched patterns */
  matchedPatterns: string[];
  /** Recommended budget */
  recommendedBudget: IntentBudget;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Budget profiles based on paper findings.
 *
 * Paper insights:
 * - Declarative: 90% of sessions <= 10 steps, high repetition
 * - Procedural: Deeper retrieval (K=37.34 avg), semantic stability
 * - Reasoning: Largest semantic drift (0.28 Initial-Final Gap), longest queries
 */
export const INTENT_BUDGETS: Record<TaskIntent, IntentBudget> = {
  declarative: {
    intent: "declarative",
    maxIterations: 6,
    timeoutMultiplier: 1.0,
    parallelismMultiplier: 1.0,
    repetitionTolerance: 0.6, // Higher tolerance - repetition is expected
    description: "Fact-seeking tasks with expected high iteration rate",
  },
  procedural: {
    intent: "procedural",
    maxIterations: 10,
    timeoutMultiplier: 1.5,
    parallelismMultiplier: 0.8, // Sequential preferred
    repetitionTolerance: 0.4,
    description: "Step-by-step execution tasks requiring semantic stability",
  },
  reasoning: {
    intent: "reasoning",
    maxIterations: 12,
    timeoutMultiplier: 2.0,
    parallelismMultiplier: 1.2, // Can parallelize sub-problems
    repetitionTolerance: 0.3, // Low tolerance - repetition indicates stuck
    description: "Complex analytical tasks with expected semantic drift",
  },
};

/**
 * Pattern keywords for intent classification.
 */
const INTENT_PATTERNS: Record<TaskIntent, string[]> = {
  declarative: [
    // Fact-finding patterns
    "what is",
    "find",
    "search for",
    "look up",
    "locate",
    "get",
    "retrieve",
    "fetch",
    "query",
    // Verification patterns
    "check if",
    "verify that",
    "confirm",
    "validate",
    "does",
    "is there",
    "are there",
    // Simple lookups
    "show me",
    "list",
    "display",
    "tell me",
  ],
  procedural: [
    // Action-oriented
    "how to",
    "steps to",
    "implement",
    "create",
    "build",
    "configure",
    "set up",
    "install",
    "deploy",
    // Execution
    "execute",
    "run",
    "start",
    "stop",
    "restart",
    // Modification
    "update",
    "modify",
    "change",
    "fix",
    "patch",
    "refactor",
    "migrate",
  ],
  reasoning: [
    // Analysis
    "analyze",
    "compare",
    "evaluate",
    "assess",
    "review",
    "investigate",
    "examine",
    // Synthesis
    "design",
    "architect",
    "plan",
    "strategy",
    "approach",
    // Reasoning
    "why",
    "because",
    "therefore",
    "if\\s+then",  // Fixed: was "if.*then" which is vulnerable to ReDoS
    "consider",
    "weigh",
    "trade.?off",
    // Multi-hop
    "combine",
    "integrate",
    "synthesize",
    "correlate",
  ],
};

// ============================================================================
// Intent Classification
// ============================================================================

 /**
  * タスクの意図を分類する
  * @param input - 分類入力
  * @returns 推奨予算を含む分類結果
  */
export function classifyIntent(input: IntentClassificationInput): IntentClassificationResult {
  const taskLower = input.task.toLowerCase();
  const goalLower = (input.goal || "").toLowerCase();
  const combinedText = `${taskLower} ${goalLower}`;

  // Count pattern matches for each intent
  const matchCounts: Record<TaskIntent, { count: number; patterns: string[] }> = {
    declarative: { count: 0, patterns: [] },
    procedural: { count: 0, patterns: [] },
    reasoning: { count: 0, patterns: [] },
  };

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, "i");
      if (regex.test(combinedText)) {
        matchCounts[intent as TaskIntent].count += 1;
        matchCounts[intent as TaskIntent].patterns.push(pattern);
      }
    }
  }

  // Determine winning intent
  let maxCount = 0;
  let bestIntent: TaskIntent = "declarative"; // Default per paper (88.64%)

  for (const [intent, data] of Object.entries(matchCounts)) {
    if (data.count > maxCount) {
      maxCount = data.count;
      bestIntent = intent as TaskIntent;
    }
  }

  // Calculate confidence
  const totalMatches =
    matchCounts.declarative.count +
    matchCounts.procedural.count +
    matchCounts.reasoning.count;

  // If no patterns matched, default to declarative with low confidence
  if (totalMatches === 0) {
    return {
      intent: "declarative",
      confidence: 0.4,
      matchedPatterns: [],
      recommendedBudget: INTENT_BUDGETS.declarative,
    };
  }

  const confidence = Math.min(0.9, maxCount / totalMatches + 0.3);

  return {
    intent: bestIntent,
    confidence,
    matchedPatterns: matchCounts[bestIntent].patterns,
    recommendedBudget: INTENT_BUDGETS[bestIntent],
  };
}

 /**
  * 意図に応じた予算を取得する。
  * @param intent - タスクの意図
  * @returns 意図に対応する予算
  */
export function getIntentBudget(intent: TaskIntent): IntentBudget {
  return INTENT_BUDGETS[intent];
}

// ============================================================================
// Budget Application
// ============================================================================

 /**
  * インテントに基づいて制限値を調整する
  * @param baseLimits - 調整対象のベース制限値
  * @param intent - タスクのインテント
  * @returns 調整後の制限値
  */
export function applyIntentLimits<T extends {
  maxIterations?: number;
  timeoutMs?: number;
  parallelism?: number;
}>(baseLimits: T, intent: TaskIntent): T {
  const budget = INTENT_BUDGETS[intent];

  return {
    ...baseLimits,
    maxIterations: baseLimits.maxIterations
      ? Math.min(baseLimits.maxIterations, budget.maxIterations)
      : budget.maxIterations,
    timeoutMs: baseLimits.timeoutMs
      ? Math.round(baseLimits.timeoutMs * budget.timeoutMultiplier)
      : undefined,
    parallelism: baseLimits.parallelism
      ? Math.round(baseLimits.parallelism * budget.parallelismMultiplier)
      : undefined,
  };
}

 /**
  * インテントに基づく反復しきい値を計算
  * @param baseThreshold - 基本しきい値（0-1）
  * @param intent - タスクインテント
  * @returns 調整後のしきい値
  */
export function getEffectiveRepetitionThreshold(
  baseThreshold: number,
  intent: TaskIntent
): number {
  const budget = INTENT_BUDGETS[intent];
  // Higher tolerance = higher threshold before triggering early stop
  return baseThreshold + (budget.repetitionTolerance - 0.5) * 0.2;
}

// ============================================================================
// Utility Functions
// ============================================================================

 /**
  * インテント分類が利用可能か判定する
  * @returns 常にtrueを返す
  */
export function isIntentClassificationAvailable(): boolean {
  return true; // Always available (pattern-based, no external dependencies)
}

 /**
  * 全てのインテント予算を取得する
  * @returns 各インテントの予算設定を含むオブジェクト
  */
export function getAllIntentBudgets(): Record<TaskIntent, IntentBudget> {
  return { ...INTENT_BUDGETS };
}

 /**
  * 意図分類結果の要約ログを生成
  * @param result 意図分類の結果
  * @returns 生成された要約文字列
  */
export function summarizeIntentClassification(result: IntentClassificationResult): string {
  const budget = result.recommendedBudget;
  return [
    `Intent: ${result.intent} (${Math.round(result.confidence * 100)}% confidence)`,
    `Budget: max ${budget.maxIterations} steps, ${budget.timeoutMultiplier}x timeout`,
    `Patterns: ${result.matchedPatterns.slice(0, 3).join(", ")}`,
  ].join(" | ");
}
