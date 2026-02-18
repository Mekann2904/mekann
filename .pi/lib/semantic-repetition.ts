/**
 * @abdd.meta
 * path: .pi/lib/semantic-repetition.ts
 * role: 連続する出力間の意味的類似度を検出し、停滞状態を特定するモジュール
 * why: "Agentic Search in the Wild" に基づき、軌跡の32.15%で発生する繰り返しパターンを検出して早期停止を判断するため
 * related: .pi/lib/embeddings/index.ts, .pi/lib/trajectory.ts, .pi/config.ts
 * public_api: detectSemanticRepetition, SemanticRepetitionResult, SemanticRepetitionOptions, TrajectorySummary
 * invariants: 類似度スコアは0.0から1.0の範囲、maxTextLength超過のテキストは比較前に切り詰められる
 * side_effects: 外部API（埋め込みプロバイダ）を呼び出す可能性がある
 * failure_modes: OPENAI_API_KEY未設定時は埋め込み検出がスキップされる、空文字入力時は類似度0扱い
 * @abdd.explain
 * overview: 埋め込みベースまたは完全一致による類似度計算を行い、エージェントの出力がループ（停滞）しているか判定する
 * what_it_does:
 *   - 現在と直前の出力テキストを正規化し、指定最大長に切り詰める
 *   - 完全一致チェック（高速パス）または埋め込みコサイン類似度計算を実行する
 *   - 類似度スコアと閾値に基づき、isRepeatedフラグを返す
 * why_it_exists:
 *   - 学習論文で指摘された、思考ループによる計算資源の無駄を防ぐ
 *   - 意味的に同じ出力が繰り返される「停滞」状態をプログラム的に検知する
 * scope:
 *   in: 現在の文字列、直前の文字列、検出オプション（閾値、埋め込み利用有無、最大長）
 *   out: 繰り返し判定、類似度スコア、使用された検出手法
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
 * 意味的重複検出の結果
 * @summary 結果を返却
 * @returns {boolean} isRepeated 意味的重複が検出されたか
 * @returns {number} similarity 類似度スコア (0.0-1.0)
 * @returns {string} method 使用された検出手法
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
 * 意味的重複検出のオプション設定
 * @summary オプションを定義
 * @returns {number} threshold 重複とみなす類似度の閾値（デフォルト: 0.85）
 * @returns {boolean} useEmbedding 埋め込みベースの検出を使用するか（OPENAI_API_KEYが必要）
 * @returns {number} maxTextLength 比較する最大テキスト長（デフォルト: 2000）
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
 * 軌跡の要約情報を表すインターフェース
 * @summary 軌跡を要約
 * @returns {number} totalSteps 総ステップ数
 * @returns {number} repetitionCount 重複検出回数
 * @returns {number} averageSimilarity 平均類似度
 * @returns {number[]} similarityTrend 類似度のトレンド配列
 * @returns {boolean} isStuck ループに陥っているかどうか
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
 * @summary 重複を検出
 * @param current 現在のテキスト
 * @param previous 直前のテキスト
 * @param options 検出オプション（閾値、埋め込み利用など）
 * @returns 重複判定結果を含むPromise
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
 * 事前計算埋め込みを用いて検出
 * @summary 重複を検出
 * @param currentEmbedding 現在の埋め込みベクトル
 * @param previousEmbedding 直前の埋め込みベクトル
 * @param threshold 重複とみなす閾値
 * @returns 重複判定結果を含むオブジェクト
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
 * トラjectory追跡クラス
 * @summary インスタンス生成
 * @param maxSteps 最大ステップ数
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
   * ステップ記録
   * @summary ステップを記録
   * @param output 出力内容
   * @param options オプション設定
   * @returns 結果情報
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
   * トラjectory要約取得
   * @summary 要約を取得
   * @returns トラjectory要約
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
   * リセット状態
   * @summary 状態をリセット
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
 * 機能利用可否判定
 * @summary 機能利用可否を確認
 * @returns 利用可能でtrue
 */
export async function isSemanticRepetitionAvailable(): Promise<boolean> {
  const provider = await getEmbeddingProvider();
  return provider !== null;
}

/**
 * 繰り返し状況に基づき推奨アクションを決定
 * @summary 推奨アクション決定
 * @param repetitionCount 現在の繰り返し回数
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
