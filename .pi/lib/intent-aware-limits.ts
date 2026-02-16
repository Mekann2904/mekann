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
 * Task intent types from paper taxonomy.
 */
export type TaskIntent = "declarative" | "procedural" | "reasoning";

/**
 * Intent-aware budget configuration.
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
 * Input for intent classification.
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
 * Result of intent classification.
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
 * Classify task intent based on content analysis.
 *
 * @param input - Classification input
 * @returns Classification result with recommended budget
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
 * Get budget for a specific intent.
 */
export function getIntentBudget(intent: TaskIntent): IntentBudget {
  return INTENT_BUDGETS[intent];
}

// ============================================================================
// Budget Application
// ============================================================================

/**
 * Apply intent-aware adjustments to base limits.
 *
 * @param baseLimits - Base limits to adjust
 * @param intent - Task intent
 * @returns Adjusted limits
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
 * Calculate effective repetition threshold based on intent.
 *
 * @param baseThreshold - Base threshold (0-1)
 * @param intent - Task intent
 * @returns Adjusted threshold
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
 * Check if intent classification is available.
 */
export function isIntentClassificationAvailable(): boolean {
  return true; // Always available (pattern-based, no external dependencies)
}

/**
 * Get all intent budgets.
 */
export function getAllIntentBudgets(): Record<TaskIntent, IntentBudget> {
  return { ...INTENT_BUDGETS };
}

/**
 * Summarize intent classification for logging.
 */
export function summarizeIntentClassification(result: IntentClassificationResult): string {
  const budget = result.recommendedBudget;
  return [
    `Intent: ${result.intent} (${Math.round(result.confidence * 100)}% confidence)`,
    `Budget: max ${budget.maxIterations} steps, ${budget.timeoutMultiplier}x timeout`,
    `Patterns: ${result.matchedPatterns.slice(0, 3).join(", ")}`,
  ].join(" | ");
}
