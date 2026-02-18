/**
 * @abdd.meta
 * path: .pi/lib/semantic-repetition.ts
 * role: 意味的反復検出モジュール。連続する出力間の意味的類似度を計算し、エージェントの停滞を特定する
 * why: Agentic Search研究（arXiv:2601.17617v2）によれば32.15%の軌跡が反復パターンを示し、早期停止の機会となるため
 * related: embeddings/index.js, types/trajectory, agent-runner, loop-detector
 * public_api: detectSemanticRepetition, SemanticRepetitionResult, SemanticRepetitionOptions, TrajectorySummary, DEFAULT_REPETITION_THRESHOLD, DEFAULT_MAX_TEXT_LENGTH
 * invariants:
 *   - similarityは必ず0.0〜1.0の範囲内
 *   - 完全一致時はsimilarity=1.0、method="exact"を返す
 *   - 空文字列入力時はisRepeated=false、similarity=0を返す
 * side_effects:
 *   - useEmbedding=true時: embeddings/index.js経由で外部API（OpenAI等）を呼び出し
 *   - ネットワーク通信とトークン消費が発生
 * failure_modes:
 *   - 埋め込みプロバイダーが利用不可の場合: method="unavailable"として処理継続
 *   - テキストがmaxTextLengthを超過: 切り詰めて比較（情報損失の可能性）
 * @abdd.explain
 * overview: 連続する出力の意味的類似度を測定し、エージェントが同じ内容を繰り返しているかを判定する
 * what_it_does:
 *   - 現在と前回の出力テキストの類似度スコア（0.0-1.0）を計算
 *   - 完全一致の高速チェック（exact）、埋め込みベースの意味比較の2段階検出
 *   - 閾値（デフォルト0.85）を超える類似度でisRepeated=trueを返す
 *   - テキスト正規化と長さ制限（デフォルト2000文字）を適用
 * why_it_exists:
 *   - 反復は32.15%の軌跡で観測され、停滞の指標となる
 *   - 無限ループや無駄な反復を早期検出し、リソース消費を抑制
 *   - 早期停止によりエージェントの効率を向上
 * scope:
 *   in: 連続する2つのテキスト出力、オプション（threshold, useEmbedding, maxTextLength）
 *   out: SemanticRepetitionResult（isRepeated, similarity, method）
 */

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
  * 意味的な重複検出の結果
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
  * 意味的繰り返し検出のオプション
  * @param threshold 繰り返しとみなす類似度の閾値（デフォルト: 0.85）
  * @param useEmbedding 埋め込みベースの検出を使用するか（OPENAI_API_KEYが必要）
  * @param maxTextLength 比較する最大テキスト長（デフォルト: 2000）
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
  * セッション軌跡のサマリー監視用インターフェース
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
  * 出力の意味的な重複を検出する
  * @param current - 現在の出力テキスト
  * @param previous - 直前の出力テキスト
  * @param options - 検出オプション
  * @returns 類似度スコアを含む検出結果
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
  * 事前計算された埋め込み込みを使用して検出
  * @param currentEmbedding 現在の埋め込みベクトル
  * @param previousEmbedding 以前の埋め込みベクトル
  * @param threshold 類似度の閾値
  * @returns 繰り返し判定結果
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
  * セッションの進行状況を追跡するクラス
  * @param maxSteps 保持する最大ステップ数（デフォルトは100）
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
    * 軌跡の概要を取得する
    * @returns 軌跡のサマリー情報を含むオブジェクト
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
    * トラッカーをリセットする。
    * @returns 戻り値なし
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
  * 意味的反復検出が利用可能か確認
  * @returns 利用可能な場合はtrue
  */
export async function isSemanticRepetitionAvailable(): Promise<boolean> {
  const provider = await getEmbeddingProvider();
  return provider !== null;
}

 /**
  * 繰り返し状況に基づく推奨アクションを取得
  * @param repetitionCount 繰り返し回数
  * @param totalSteps 総ステップ数
  * @param isStuck 停滞状態かどうか
  * @returns "continue" | "pivot" | "early_stop"
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
