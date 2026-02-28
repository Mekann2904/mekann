/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/domain/types.ts
 * role: 自己改善ループのドメイン型定義
 * why: クリーンアーキテクチャのEnterprise Business Rules層として、ビジネスルールの型を集約するため
 * related: ./perspective.ts, ./verification.ts, ../application/loop-service.ts
 * public_api: すべての型定義
 * invariants: 型定義は純粋なデータ構造のみとし、ビジネスロジックを含まない
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 自己改善ループのドメイン型定義
 * what_it_does:
 *   - 7つの哲学的視座の型定義
 *   - ループ状態の型定義
 *   - 検証結果の型定義
 *   - ULモードの型定義
 * why_it_exists:
 *   - ドメインの概念を明確に定義し、他層への依存を排除するため
 * scope:
 *   in: なし
 *   out: すべての層
 */

// ============================================================================
// 7つの哲学的視座
// ============================================================================

/** 哲学的視座の名称 */
export type PerspectiveName =
  | "deconstruction"       // 脱構築
  | "schizoanalysis"       // スキゾ分析
  | "eudaimonia"          // 幸福論
  | "utopia_dystopia"     // ユートピア/ディストピア論
  | "thinking_philosophy"  // 思考哲学
  | "thinking_taxonomy"    // 思考分類学
  | "logic";               // 論理学

/** 視座の定義情報 */
export interface PerspectiveDefinition {
  name: PerspectiveName;
  displayName: string;
  description: string;
}

/** 視座の実行状態 */
export interface PerspectiveState {
  name: PerspectiveName;
  displayName: string;
  description: string;
  lastAppliedAt: string | null;
  findings: string[];
  questions: string[];
  improvements: string[];
  score: number; // 0-1
}

/** 個別視座の実行結果 */
export interface PerspectiveResult {
  perspective: PerspectiveName;
  findings: string[];
  questions: string[];
  improvements: string[];
  score: number;
  output: string;
}

/** 視座スコアのパース結果 */
export interface ParsedPerspectiveScores {
  deconstruction: number;
  schizoanalysis: number;
  eudaimonia: number;
  utopia_dystopia: number;
  thinking_philosophy: number;
  thinking_taxonomy: number;
  logic: number;
  average: number;
}

// ============================================================================
// ループ状態
// ============================================================================

/** ループの停止理由 */
export type StopReason = "user_request" | "completed" | "error" | "stagnation" | null;

/** ループ全体の状態 */
export interface SelfImprovementLoopState {
  runId: string;
  startedAt: string;
  task: string;
  currentCycle: number;
  currentPerspectiveIndex: number;
  perspectiveStates: PerspectiveState[];
  stopRequested: boolean;
  stopReason: StopReason;
  lastCommitHash: string | null;
  lastUpdatedAt: string;
  totalImprovements: number;
  summary: string;
  /** サイクル開始時に既に変更されていたファイル一覧 */
  filesChangedBeforeCycle: Set<string>;
  /** 自動追加する.gitignoreパターン */
  gitignorePatternsToAdd: Set<string>;
  /** 前回のメタ認知チェック結果（推論深度向上のためのフィードバックループ） */
  lastMetacognitiveCheck?: MetacognitiveCheck;
  /** 前回の推論深度スコア */
  lastInferenceDepthScore?: number;
}

/** サイクルの実行結果 */
export interface CycleResult {
  cycleNumber: number;
  perspectiveResults: PerspectiveResult[];
  improvements: string[];
  commitHash: string | null;
  summary: string;
  shouldContinue: boolean;
  stopReason: StopReason;
  /** メタ認知チェック結果（推論深度の客観的指標） */
  metacognitiveCheck?: MetacognitiveCheck;
  /** 推論深度スコア（客観的指標の集約） */
  inferenceDepthScore?: number;
}

/** 成功パターンの記録 */
export interface SuccessfulPattern {
  /** サイクル番号 */
  cycle: number;
  /** 平均視座スコア */
  averageScore: number;
  /** 実行したアクションの要約 */
  actionSummary: string;
  /** 適用した視座 */
  appliedPerspectives: string[];
}

// ============================================================================
// ULモード
// ============================================================================

/** ULフェーズ種別 */
export type ULPhase = 'research' | 'plan' | 'implement' | 'completed';

/** ULフェーズコンテキスト */
export interface ULPhaseContext {
  researchOutput?: string;
  planOutput?: string;
  improvementActions?: ImprovementAction[];
}

/** 自律ループ実行中のランタイム状態 */
export interface ActiveAutonomousRun {
  runId: string;
  task: string;
  startedAt: string;
  maxCycles: number;
  autoCommit: boolean;
  cycle: number;
  inFlightCycle: number | null;
  stopRequested: boolean;
  stopReason: StopReason;
  logPath: string;
  model: SelfImprovementModel;
  lastCommitHash: string | null;
  /** セマンティック反復検出用トラッカー */
  trajectoryTracker: TrajectoryTracker;
  /** 過去のサイクル出力サマリー（停滞検出用） */
  cycleSummaries: string[];
  /** 視座スコアの履歴 */
  perspectiveScoreHistory: ParsedPerspectiveScores[];
  /** 前回のメタ認知チェック結果 */
  lastMetacognitiveCheck?: MetacognitiveCheck;
  /** 前回の推論深度スコア */
  lastInferenceDepthScore?: number;
  /** 前回の改善アクション */
  lastImprovementActions?: ImprovementAction[];
  /** 前回の統合検出結果 */
  lastIntegratedDetection?: IntegratedVerificationResult;
  /** 成功したサイクルのパターン */
  successfulPatterns: SuccessfulPattern[];
  /** サイクル開始時に既に変更されていたファイル一覧 */
  filesChangedBeforeCycle: Set<string>;
  /** 自動追加すべき.gitignoreパターン */
  gitignorePatternsToAdd: Set<string>;
  /** ULモード有効フラグ */
  ulMode: boolean;
  /** 自動承認フラグ */
  autoApprove: boolean;
  /** 現在のULフェーズ */
  currentPhase: ULPhase;
  /** ULフェーズ間のコンテキスト受け渡し */
  phaseContext: ULPhaseContext;
  /** 現在のフェーズの再試行回数 */
  phaseRetryCount: number;
}

// ============================================================================
// モデル・設定
// ============================================================================

/** 思考レベル */
export type ThinkingLevel = "none" | "low" | "medium" | "high";

/** モデル情報 */
export interface SelfImprovementModel {
  provider: string;
  id: string;
  thinkingLevel: ThinkingLevel;
}

/** 429エラー対応設定 */
export interface RateLimitConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: "full" | "partial" | "none";
  maxRateLimitRetries: number;
  maxRateLimitWaitMs: number;
  minCycleIntervalMs: number;
  maxCycleIntervalMs: number;
  perspectiveDelayMs: number;
  high429Threshold: number;
}

/** ループ設定 */
export interface SelfImprovementLoopConfig {
  /** 最大サイクル数（デフォルト: 無制限 = Infinity） */
  maxCycles?: number;
  /** 停止信号ファイルのパス */
  stopSignalPath?: string;
  /** 作業ログディレクトリ */
  logDir?: string;
  /** 自動コミットを有効にするか */
  autoCommit?: boolean;
  /** 停滞検出のしきい値（0-1） */
  stagnationThreshold?: number;
  /** 連続停滞回数の上限 */
  maxStagnationCount?: number;
}

/** ツールパラメータ */
export interface SelfImprovementLoopParams {
  task: string;
  max_cycles?: number;
  auto_commit?: boolean;
  ul_mode?: boolean;
  auto_approve?: boolean;
}

// ============================================================================
// 検証・メタ認知
// ============================================================================

/** メタ認知チェック結果（verification-workflowから再エクスポート用） */
export interface MetacognitiveCheck {
  deconstruction: {
    binaryOppositions: string[];
    aporias: AporiaDetection[];
  };
  schizoAnalysis: {
    desireProduction: string[];
    innerFascismSigns: string[];
  };
  eudaimonia: {
    pleasureTrap: boolean;
    valueAlignment: number;
  };
  utopiaDystopia: {
    totalitarianRisk: string[];
  };
  philosophyOfThought: {
    metacognitionLevel: number;
  };
  taxonomyOfThought: {
    currentMode: string;
    recommendedMode: string;
  };
  logic: {
    fallacies: FallacyDetection[];
  };
}

/** アポリア検出 */
export interface AporiaDetection {
  description: string;
  tensionLevel: number;
}

/** 誤謬検出 */
export interface FallacyDetection {
  type: string;
  description: string;
}

/** 改善アクション */
export interface ImprovementAction {
  action: string;
  issue: string;
  expectedOutcome: string;
  relatedPerspective: string;
}

/** 統合検証結果 */
export interface IntegratedVerificationResult {
  candidates: CandidateDetection[];
  actions: ImprovementAction[];
}

/** 候補検出 */
export interface CandidateDetection {
  type: string;
  text: string;
  confidence: number;
}

/** セマンティック反復トラッカー（インターフェースのみ） */
export interface TrajectoryTracker {
  addStep(step: string): void;
  getSummary(): {
    repetitionCount: number;
    totalSteps: number;
    isStuck: boolean;
  };
}

// ============================================================================
// コミット関連
// ============================================================================

/** コミット作成コンテキスト */
export interface CommitContext {
  cycleNumber: number;
  runId: string;
  taskSummary: string;
  perspectiveResults: Array<{ perspective: string; score: number; improvements: string[] }>;
  filesChangedBeforeCycle: Set<string>;
  gitignorePatternsToAdd: Set<string>;
}

// ============================================================================
// Git操作（インターフェース）
// ============================================================================

/** Git操作の結果 */
export interface GitCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Git操作のインターフェース（Adapter層で実装） */
export interface GitOperations {
  runGitCommand(args: string[], cwd: string): Promise<GitCommandResult>;
  getChangedFiles(cwd: string): Promise<string[]>;
  getDiffSummary(cwd: string): Promise<{ stats: string; changes: string }>;
  createCommit(message: string, cwd: string): Promise<string | null>;
}

// ============================================================================
// ファイル操作（インターフェース）
// ============================================================================

/** ファイル操作のインターフェース（Adapter層で実装） */
export interface FileOperations {
  exists(path: string): boolean;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  appendFile(path: string, content: string): void;
  ensureDir(path: string): void;
}

// ============================================================================
// LLM操作（インターフェース）
// ============================================================================

/** LLM呼び出しのインターフェース（Adapter層で実装） */
export interface LLMOperations {
  callModel(
    prompt: string,
    model: SelfImprovementModel,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<string>;
}
