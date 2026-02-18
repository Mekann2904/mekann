/**
 * @abdd.meta
 * path: .pi/lib/intent-aware-limits.ts
 * role: タスクの意図分類とそれに基づくリソース配分ポリシーを定義するモジュール
 * why: タスクの特性（宣言的・手順的・推論的）に応じて反復回数やタイムアウトを最適化するため
 * related: .pi/lib/execution-planner.ts, .pi/lib/search-engine.ts
 * public_api: TaskIntent, IntentBudget, IntentClassificationInput, IntentClassificationResult, INTENT_BUDGETS
 * invariants: IntentBudgetの各乗数は正の数である、maxIterationsは0以上である
 * side_effects: なし（純粋な定義と定数のエクスポート）
 * failure_modes: タスク説明が曖昧な場合の意図誤判定、未知のタスクタイプへの対応漏れ
 * @abdd.explain
 * overview: 論文 "Agentic Search in the Wild" に基づき、タスクの意図を3種類に分類し、それぞれに最適な計算リソース（反復回数、並列度、タイムアウト）を割り当てる設定を提供する
 * what_it_does:
 *   - TaskIntent型と分類用インターフェースを定義する
 *   - 意図の種類ごとに推奨リソース設定（INTENT_BUDGETS）を保持する
 *   - 分類パターン（INTENT_PATTERNS）を保持する
 * why_it_exists:
 *   - 単一のリソース制限では、反復の多い事実探索と複雑な推論タスクの両方に対応できないため
 *   - 意図に応じて早期収束させるか深く探索させるかを制御し、効率と精度を両立するため
 * scope:
 *   in: タスクの説明、目標基準、参照リソース数
 *   out: 意図分類結果および推奨される予算設定
 */

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
 * タスクの意図タイプを定義
 * @summary 意図タイプ定義
 * @returns タスクの種別
 */
export type TaskIntent = "declarative" | "procedural" | "reasoning";

/**
 * タスクの意図タイプ
 * @summary 意図タイプ定義
 * @returns 宣言的、手続き的、または推論的
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
 * 意図分類の入力
 *
 * @summary 分類入力
 * @param task タスクの説明文
 * @param goal 目標基準（任意）
 * @param referenceCount 参照資料の数
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
 * 意図分類の結果
 *
 * @summary 分類結果
 * @param intent 特定された意図
 * @param confidence 信頼度スコア
 * @param matchedPatterns 一致したパターン
 * @param recommendedBudget 推奨される予算設定
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
 * 意図の分類実行
 *
 * @summary 意図を分類
 * @param input 分類用入力データ
 * @returns 分類結果と推奨設定
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
 * 意図予算の取得
 *
 * @summary 予算を取得
 * @param intent タスクの意図
 * @returns 意図に基づく推奨予算
 */
export function getIntentBudget(intent: TaskIntent): IntentBudget {
  return INTENT_BUDGETS[intent];
}

// ============================================================================
// Budget Application
// ============================================================================

/**
 * 意図に応じた制限適用
 *
 * @summary 制限を適用
 * @param baseLimits 基本となる制限設定
 * @param intent タスクの意図分類
 * @returns 適用後の制限設定
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
 * インテントに基づき反復しきい値を計算
 * @summary 反復しきい値を計算
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
 * インテント分類利用可否判定
 * @summary インテント利用可否判定
 * @returns 常にtrueを返す
 */
export function isIntentClassificationAvailable(): boolean {
  return true; // Always available (pattern-based, no external dependencies)
}

/**
 * @summary 予算設定全取得
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
