/**
 * Semantic Repetition Detection Module.
 * Detects semantic similarity between consecutive outputs to identify stagnation.
 * Based on findings from "Agentic Search in the Wild" paper (arXiv:2601.17617v2):
 * - 32.15% of trajectories show repetition pattern
 * - Repetition indicates stagnation and signals early stopping opportunity
 */

import {
  generateEmbedding,
  cosineSimilarity,
  getEmbeddingProvider,
} from "./embeddings/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of semantic repetition detection.
 */
export interface SemanticRepetitionResult {
  /** Whether semantic repetition was detected */
  isRepeated: boolean;
  /** Similarity score (0.0-1.0) */
  similarity: number;
  /** Method used for detection */
  method: "embedding" | "exact" | "unavailable";
}

/**
 * Options for semantic repetition detection.
 */
export interface SemanticRepetitionOptions {
  /** Similarity threshold for considering outputs as repeated (default: 0.85) */
  threshold?: number;
  /** Whether to use embedding-based detection (requires OPENAI_API_KEY) */
  useEmbedding?: boolean;
  /** Maximum text length to compare (default: 2000) */
  maxTextLength?: number;
}

/**
 * Session trajectory summary for monitoring.
 */
export interface TrajectorySummary {
  /** Total steps analyzed */
  totalSteps: number;
  /** Number of repetition detections */
  repetitionCount: number;
  /** Average similarity across steps */
  averageSimilarity: number;
  /** Trend direction of similarity */
  similarityTrend: "increasing" | "decreasing" | "stable";
  /** Whether session appears stuck */
  isStuck: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default threshold for semantic repetition detection.
 * Based on paper findings: repetition indicates stagnation at high similarity.
 */
export const DEFAULT_REPETITION_THRESHOLD = 0.85;

/**
 * Maximum text length for embedding comparison.
 * OpenAI embedding API has a token limit; this keeps requests manageable.
 */
export const DEFAULT_MAX_TEXT_LENGTH = 2000;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Detect semantic repetition between two outputs.
 *
 * This function compares consecutive outputs using either:
 * 1. Embedding-based cosine similarity (if OPENAI_API_KEY available)
 * 2. Exact string match (fallback)
 *
 * @param current - Current output text
 * @param previous - Previous output text
 * @param options - Detection options
 * @returns Detection result with similarity score
 */
export async function detectSemanticRepetition(
  current: string,
  previous: string,
  options: SemanticRepetitionOptions = {}
): Promise<SemanticRepetitionResult> {
  const {
    threshold = DEFAULT_REPETITION_THRESHOLD,
    useEmbedding = true,
    maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
  } = options;

  // Normalize inputs
  const normalizedCurrent = normalizeText(current, maxTextLength);
  const normalizedPrevious = normalizeText(previous, maxTextLength);

  // Empty check
  if (!normalizedCurrent || !normalizedPrevious) {
    return {
      isRepeated: false,
      similarity: 0,
      method: "exact",
    };
  }

  // Exact match check first (fast path)
  if (normalizedCurrent === normalizedPrevious) {
    return {
      isRepeated: true,
      similarity: 1.0,
      method: "exact",
    };
  }

  // If exact match not detected and embedding disabled, return not repeated
  if (!useEmbedding) {
    return {
      isRepeated: false,
      similarity: 0,
      method: "exact",
    };
  }

  // Embedding-based check
  const provider = await getEmbeddingProvider();
  if (!provider) {
    // プロバイダーがない場合は処理をスキップ
    return {
      isRepeated: false,
      similarity: 0,
      method: "unavailable",
    };
  }

  const [currentEmb, previousEmb] = await Promise.all([
    generateEmbedding(normalizedCurrent),
    generateEmbedding(normalizedPrevious),
  ]);

  if (!currentEmb || !previousEmb) {
    // エンベディング生成に失敗した場合は処理をスキップ
    return {
      isRepeated: false,
      similarity: 0,
      method: "unavailable",
    };
  }

  const similarity = cosineSimilarity(currentEmb, previousEmb);
  return {
    isRepeated: similarity >= threshold,
    similarity,
    method: "embedding",
  };
}

/**
 * Synchronous version using pre-computed embeddings.
 * Use when embeddings are already available.
 */
export function detectSemanticRepetitionFromEmbeddings(
  currentEmbedding: number[],
  previousEmbedding: number[],
  threshold: number = DEFAULT_REPETITION_THRESHOLD
): SemanticRepetitionResult {
  const similarity = cosineSimilarity(currentEmbedding, previousEmbedding);
  return {
    isRepeated: similarity >= threshold,
    similarity,
    method: "embedding",
  };
}

// ============================================================================
// Trajectory Tracking
// ============================================================================

/**
 * Default maximum steps to keep in trajectory tracker.
 * Prevents unbounded memory accumulation.
 */
export const DEFAULT_MAX_TRAJECTORY_STEPS = 100;

/**
 * Simple trajectory tracker for monitoring session progress.
 * Implements memory bounds to prevent DoS via unbounded accumulation.
 */
export class TrajectoryTracker {
  private steps: Array<{
    output: string;
    similarity?: number;
    isRepeated: boolean;
  }> = [];
  private maxSteps: number;

  constructor(maxSteps: number = DEFAULT_MAX_TRAJECTORY_STEPS) {
    this.maxSteps = Math.max(1, maxSteps);
  }

  /**
   * Record a new step and check for repetition.
   */
  async recordStep(
    output: string,
    options?: SemanticRepetitionOptions
  ): Promise<SemanticRepetitionResult> {
    const previousStep = this.steps[this.steps.length - 1];
    let result: SemanticRepetitionResult;

    if (previousStep) {
      result = await detectSemanticRepetition(output, previousStep.output, options);
    } else {
      result = {
        isRepeated: false,
        similarity: 0,
        method: "exact",
      };
    }

    this.steps.push({
      output: normalizeText(output, DEFAULT_MAX_TEXT_LENGTH),
      similarity: result.similarity,
      isRepeated: result.isRepeated,
    });

    // Enforce memory bounds - remove oldest steps when limit exceeded
    while (this.steps.length > this.maxSteps) {
      this.steps.shift();
    }

    return result;
  }

  /**
   * Get trajectory summary.
   */
  getSummary(): TrajectorySummary {
    if (this.steps.length === 0) {
      return {
        totalSteps: 0,
        repetitionCount: 0,
        averageSimilarity: 0,
        similarityTrend: "stable",
        isStuck: false,
      };
    }

    const repetitionCount = this.steps.filter((s) => s.isRepeated).length;
    const similarities = this.steps
      .filter((s) => s.similarity !== undefined)
      .map((s) => s.similarity!);

    const averageSimilarity =
      similarities.length > 0
        ? similarities.reduce((a, b) => a + b, 0) / similarities.length
        : 0;

    // Calculate trend
    let similarityTrend: "increasing" | "decreasing" | "stable" = "stable";
    if (similarities.length >= 3) {
      const recent = similarities.slice(-3);
      const earlier = similarities.slice(0, -3);
      if (earlier.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        if (recentAvg > earlierAvg + 0.1) {
          similarityTrend = "increasing";
        } else if (recentAvg < earlierAvg - 0.1) {
          similarityTrend = "decreasing";
        }
      }
    }

    // Detect if stuck (consecutive repetitions in recent steps)
    const recentSteps = this.steps.slice(-5);
    const consecutiveRepeats = recentSteps.filter((s) => s.isRepeated).length;
    const isStuck = consecutiveRepeats >= 3;

    return {
      totalSteps: this.steps.length,
      repetitionCount,
      averageSimilarity,
      similarityTrend,
      isStuck,
    };
  }

  /**
   * Get step count.
   */
  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * Reset tracker.
   */
  reset(): void {
    this.steps = [];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize text for comparison.
 */
function normalizeText(text: string, maxLength: number): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

/**
 * Check if semantic repetition detection is available.
 * Uses the embeddings module's provider registry.
 */
export async function isSemanticRepetitionAvailable(): Promise<boolean> {
  const provider = await getEmbeddingProvider();
  return provider !== null;
}

/**
 * Get recommended action based on repetition score.
 * Based on paper findings: high repetition indicates stagnation.
 */
export function getRecommendedAction(
  repetitionCount: number,
  totalSteps: number,
  isStuck: boolean
): "continue" | "pivot" | "early_stop" {
  // If stuck pattern detected, recommend early stop
  if (isStuck) {
    return "early_stop";
  }

  // If repetition rate is high (>40%), recommend pivot
  const repetitionRate = totalSteps > 0 ? repetitionCount / totalSteps : 0;
  if (repetitionRate > 0.4) {
    return "pivot";
  }

  return "continue";
}
