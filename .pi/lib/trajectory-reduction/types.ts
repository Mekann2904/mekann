/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/types.ts
 * role: Trajectory Reduction機能の型定義モジュール
 * why: LLMエージェントの軌跡圧縮に必要な型とインターフェースを定義するため
 * related: .pi/lib/trajectory-reduction/index.ts, .pi/extensions/trajectory-reduction.ts
 * public_api: TrajectoryReductionConfig, TrajectoryStep, ReductionResult, WasteType
 * invariants: 設定パラメータは正の値、スライディングウィンドウパラメータは整数
 * side_effects: なし（純粋な型定義）
 * failure_modes: なし
 * @abdd.explain
 * overview: AgentDiet論文に基づく軌跡圧縮機能の型定義
 * what_it_does:
 *   - 圧縮設定の型定義
 *   - 軌跡ステップの構造定義
 *   - 圧縮結果の型定義
 *   - 廃棄情報タイプの列挙
 * why_it_exists:
 *   - 型安全性を確保し、実装の誤りを防ぐため
 *   - 論文の概念をコード構造にマッピングするため
 * scope:
 *   in: なし
 *   out: 型定義、インターフェース、列挙型
 */

/**
 * 廃棄情報のタイプ（論文の3分類）
 */
export type WasteType = "useless" | "redundant" | "expired";

/**
 * 軌跡ステップの種類
 */
export type StepRole = "user" | "assistant" | "tool" | "system";

/**
 * 軌跡の単一ステップ
 */
export interface TrajectoryStep {
  /** ステップ番号（1始まり） */
  step: number;
  /** ロール（user, assistant, tool, system） */
  role: StepRole;
  /** コンテンツ（テキストまたは構造化データ） */
  content: string;
  /** トークン数（概算） */
  tokenCount: number;
  /** タイムスタンプ */
  timestamp: number;
  /** メタデータ（ツール名、ファイルパス等） */
  metadata?: Record<string, unknown>;
  /** 圧縮済みフラグ */
  compressed?: boolean;
  /** 元のトークン数（圧縮後のみ） */
  originalTokenCount?: number;
}

/**
 * 圧縮結果
 */
export interface ReductionResult {
  /** 圧縮後のコンテンツ */
  content: string;
  /** 圧縮後のトークン数 */
  tokenCount: number;
  /** 削減されたトークン数 */
  tokensSaved: number;
  /** 削減率（0-1） */
  reductionRatio: number;
  /** 検出された廃棄タイプ */
  wasteTypes: WasteType[];
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
  /** リフレクションモデル */
  reflectionModel: string;
}

/**
 * スライディングウィンドウコンテキスト
 */
export interface SlidingWindowContext {
  /** 対象ステップ番号 */
  targetStep: number;
  /** コンテキストに含めるステップ範囲 */
  steps: TrajectoryStep[];
  /** 現在のステップ番号 */
  currentStep: number;
  /** ウィンドウ開始ステップ */
  windowStart: number;
  /** ウィンドウ終了ステップ */
  windowEnd: number;
}

/**
 * Trajectory Reduction設定
 */
export interface TrajectoryReductionConfig {
  /** 有効フラグ */
  enabled: boolean;
  /** トークン閾値（この値以下のステップはスキップ、デフォルト: 500） */
  threshold: number;
  /** 何ステップ後ろを対象にするか（デフォルト: 2） */
  stepsAfter: number;
  /** 何ステップ前をコンテキストに含めるか（デフォルト: 1） */
  stepsBefore: number;
  /** 短いタスクをスキップ（デフォルト: true） */
  skipShortTasks: boolean;
  /** 圧縮を開始する最小ステップ数（デフォルト: 5） */
  minStepsForReduction: number;
  /** 圧縮ログを記録（デフォルト: true） */
  logReductions: boolean;
  /** キャッシュヒット時はスキップ（デフォルト: true） */
  skipOnCacheHit: boolean;
  /** 最大コンテキスト長（トークン、デフォルト: 8000） */
  maxContextTokens: number;
}

/**
 * デフォルト設定（論文の推奨値）
 */
export const DEFAULT_TRAJECTORY_REDUCTION_CONFIG: TrajectoryReductionConfig = {
  enabled: true,
  threshold: 500,
  stepsAfter: 2,
  stepsBefore: 1,
  skipShortTasks: true,
  minStepsForReduction: 5,
  logReductions: true,
  skipOnCacheHit: true,
  maxContextTokens: 8000,
};

/**
 * 圧縮統計
 */
export interface ReductionStats {
  /** 総ステップ数 */
  totalSteps: number;
  /** 圧縮されたステップ数 */
  compressedSteps: number;
  /** 元の総トークン数 */
  originalTokens: number;
  /** 圧縮後の総トークン数 */
  compressedTokens: number;
  /** 総削減トークン数 */
  tokensSaved: number;
  /** 平均削減率 */
  averageReductionRatio: number;
  /** リフレクション呼び出し回数 */
  reflectionCalls: number;
  /** 総処理時間（ミリ秒） */
  totalProcessingTimeMs: number;
  /** 廃棄タイプ別カウント */
  wasteTypeCounts: Record<WasteType, number>;
}

/**
 * 圧縮ログエントリ
 */
export interface ReductionLogEntry {
  /** タイムスタンプ */
  timestamp: string;
  /** 対象ステップ */
  targetStep: number;
  /** 元のトークン数 */
  originalTokens: number;
  /** 圧縮後トークン数 */
  compressedTokens: number;
  /** 削減トークン数 */
  tokensSaved: number;
  /** 削減率 */
  reductionRatio: number;
  /** 廃棄タイプ */
  wasteTypes: WasteType[];
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
}

/**
 * リフレクションプロンプトのパラメータ
 */
export interface ReflectionPromptParams {
  /** 対象ステップのコンテンツ */
  targetContent: string;
  /** コンテキストステップ */
  contextSteps: TrajectoryStep[];
  /** 対象ステップ番号 */
  targetStepNumber: number;
  /** 現在のステップ番号 */
  currentStepNumber: number;
}

/**
 * 軌跡管理インターフェース
 */
export interface TrajectoryManager {
  /** 軌跡を取得 */
  getTrajectory(): TrajectoryStep[];
  /** ステップを追加 */
  addStep(step: TrajectoryStep): void;
  /** ステップを更新 */
  updateStep(index: number, content: string): void;
  /** トークン数を計算 */
  countTokens(content: string): number;
  /** 現在のステップ番号 */
  getCurrentStep(): number;
}
