/**
 * @abdd.meta
 * path: .pi/lib/verification/types.ts
 * role: 検証ワークフローの型定義と定数モジュール
 * why: Inspector/ChallengerエージェントによるLLM推論の自動検証メカニズムの型安全性を確保するため
 * related: ./config.ts, ./patterns/output-patterns.ts, ../verification-workflow.ts
 * public_api: VerificationWorkflowConfig, VerificationWorkflowConfigV2, VerificationTriggerMode, FallbackBehavior, ChallengerConfig, ChallengeCategory, InspectorConfig, SuspicionThreshold, InspectionPattern
 * invariants: enabledはboolean, minConfidenceToSkipVerificationは0〜1の範囲を想定, requiredFlawsは0以上の整数
 * side_effects: なし（型定義と定数のみ）
 * failure_modes: 閾値設定の不正、トリガーモードの未定義、カテゴリ指定の不整合
 * @abdd.explain
 * overview: 論文「Large Language Model Reasoning Failures」のP0推奨事項に基づく検証ワークフローの型定義
 * what_it_does:
 *   - 検証ワークフローの全体設定型を定義する
 *   - チャレンジャー（欠陥指摘）およびインスペクター（バイアス検出）の詳細設定型を提供する
 *   - 検証トリガー条件、フォールバック動作、検出パターン等の型を管理する
 * why_it_exists:
 *   - LLMの推論失敗モードをシステム的に検知・緩和するための型安全性を確保する
 *   - 設定プロパティの不変条件を文書化し、実行時エラーを防ぐ
 * scope:
 *   in: なし
 *   out: config.ts, patterns/*.ts, analysis/*.ts, generation/*.ts
 */

// ============================================================================
// Basic Types
// ============================================================================

/**
 * 検証トリガーのモード定義
 * @summary 検証トリガーモード
 */
export type VerificationTriggerMode =
  | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes";      // 高リスクタスク時

/**
 * フォールバック時の動作方針
 * @summary フォールバック挙動
 */
export type FallbackBehavior =
  | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject";      // 自動拒否

/**
 * チャレンジのカテゴリ
 * @summary カテゴリを定義
 */
export type ChallengeCategory =
  | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal";  // 因果関係の逆転

/**
 * 疑わしさの閾値レベル
 * @summary 閾値レベルを設定
 */
export type SuspicionThreshold = "low" | "medium" | "high";

/**
 * 検査パターン定義
 * @summary パターンを定義
 */
export type InspectionPattern =
  | "claim-result-mismatch"    // CLAIMとRESULTの不一致
  | "evidence-confidence-gap"  // 証拠と信頼度のミスマッチ
  | "missing-alternatives"     // 代替解釈の欠如
  | "causal-reversal"          // 因果の逆転
  | "confirmation-bias"        // 確認バイアスの兆候
  | "overconfidence"           // 過信（証拠に対して高すぎる信頼度）
  | "incomplete-reasoning"     // 不完全な推論
  | "first-reason-stopping"    // 第1理由で探索停止（バグハンティング）
  | "proximity-bias"           // 近接性バイアス（発現点＝起源点と仮定）
  | "concreteness-bias"        // 具体性バイアス（抽象レベルの分析欠如）
  | "palliative-fix";          // 対症療法的修正（再発防止でない）

/**
 * 検証の最終判定結果
 * @summary 検証の最終判定
 */
export type VerificationVerdict =
  | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked";          // ブロック（再実行必要）

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * チャレンジャー設定インターフェース
 * @summary チャレンジャー設定
 * @param minConfidenceToChallenge チャレンジを行う最小信頼度
 * @param requiredFlaws 必須の検出フラグ数
 * @param enabledCategories 有効なカテゴリ
 */
export interface ChallengerConfig {
  minConfidenceToChallenge: number;
  requiredFlaws: number;
  enabledCategories: ChallengeCategory[];
}

/**
 * 検査者の設定
 * @summary 検査設定を保持
 * @param suspicionThreshold 疑わしさの閾値
 * @param requiredPatterns 必要なパターン
 * @param autoTriggerOnCollapseSignals 信号崩落時の自動トリガー
 */
export interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}

/**
 * 検証ワークフローの設定（V1）
 * @summary ワークフロー設定
 * @param enabled ワークフロー有効化フラグ
 * @param triggerModes トリガーモード配列
 * @param challengerConfig チャレンジャーの設定
 * @param inspectorConfig インスペクターの設定
 * @param fallbackBehavior フォールバック動作
 * @param maxVerificationDepth 最大検証深度
 * @param minConfidenceToSkipVerification 検証をスキップする最小信頼度
 */
export interface VerificationWorkflowConfig {
  enabled: boolean;
  triggerModes: VerificationTriggerMode[];
  challengerConfig: ChallengerConfig;
  inspectorConfig: InspectorConfig;
  fallbackBehavior: FallbackBehavior;
  maxVerificationDepth: number;
  minConfidenceToSkipVerification: number;
}

/**
 * 検証モード（V2用）
 * @summary 検証モード
 */
export type VerificationMode =
  | "default"           // デフォルト設定
  | "repo-audit"        // リポジトリ監査用
  | "high-stakes-only"  // 高リスクタスクのみ
  | "explicit-only"     // 明示的要求のみ
  | "disabled";         // 無効

/**
 * 検証ワークフローの設定（V2）
 * @summary V2ワークフロー設定
 */
export interface VerificationWorkflowConfigV2 extends VerificationWorkflowConfig {
  mode: VerificationMode;
  customPatterns?: InspectionPattern[];
  customCategories?: ChallengeCategory[];
}

// ============================================================================
// Result Interfaces
// ============================================================================

/**
 * 検出されたパターンを表す
 * @summary パターン検出結果
 */
export interface DetectedPattern {
  pattern: InspectionPattern;
  location: string;
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * 検査官の結果出力を表す
 * @summary 検査官の出力
 */
export interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}

/**
 * 挑戦された主張を表す
 * @summary 主張の課題定義
 */
export interface ChallengedClaim {
  claim: string;
  flaw: string;
  evidenceGap: string;
  alternative: string;
  boundaryFailure?: string;
  severity: "minor" | "moderate" | "critical";
}

/**
 * 検証の結果出力を表す
 * @summary 検証結果の出力
 */
export interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}

/**
 * 検証結果を表す
 * @summary 検証結果を取得
 */
export interface VerificationResult {
  triggered: boolean;
  triggerReason: string;
  inspectorOutput?: InspectorOutput;
  challengerOutput?: ChallengerOutput;
  finalVerdict: VerificationVerdict;
  confidence: number;
  requiresReRun: boolean;
  warnings: string[];
}

/**
 * 検証のコンテキスト情報
 * @summary コンテキスト情報
 */
export interface VerificationContext {
  task: string;
  triggerMode: "post-subagent" | "post-team" | "explicit" | "low-confidence" | "high-stakes";
  agentId?: string;
  teamId?: string;
  previousVerifications?: number;
}

// ============================================================================
// Pattern Detection Types
// ============================================================================

/**
 * パターン検出結果の基本型
 * @summary パターン検出結果
 */
export interface PatternDetectionResult {
  detected: boolean;
  reason: string;
}

/**
 * バグハンティング・アポリアタイプ
 * @summary バグハンティングにおける解決不能な緊張関係
 */
export type BugHuntingAporiaType =
  | "speed-vs-completeness"   // 速度 vs 完全性
  | "hypothesis-vs-evidence"  // 仮説駆動 vs 証拠駆動
  | "depth-vs-breadth";       // 深さ vs 幅

/**
 * バグハンティングのコンテキスト
 * @summary バグの状況情報
 */
export interface BugHuntingContext {
  isProduction: boolean;       // 本番環境か
  isSecurityRelated: boolean;  // セキュリティ関連か
  isRecurring: boolean;        // 再発バグか
  isFirstEncounter: boolean;   // 初見のバグか
  isTeamInvestigation: boolean; // チームでの調査か
  timeConstraint: "urgent" | "moderate" | "relaxed";
  impactLevel: "critical" | "high" | "medium" | "low";
}

/**
 * アポリア認識結果
 * @summary 検出されたアポリアと推奨される傾き
 */
export interface BugHuntingAporiaRecognition {
  aporiaType: BugHuntingAporiaType;
  pole1: {
    concept: string;
    value: string;
    indicators: string[];
  };
  pole2: {
    concept: string;
    value: string;
    indicators: string[];
  };
  tensionLevel: number;
  recommendedTilt: "pole1" | "pole2" | "balanced";
  tiltRationale: string;
  contextFactors: string[];
}

/**
 * ディストピア傾向タイプ
 * @summary 機械化による負の側面
 */
export type DystopianTendencyType =
  | "over-mechanization"    // 過度な機械化
  | "human-exclusion"       // 人間の排除
  | "context-blindness"     // コンテキスト盲目
  | "responsibility-dilution"; // 責任の希薄化

/**
 * ディストピア傾向検出結果
 * @summary ディストピア検出
 */
export interface DystopianTendencyDetection {
  type: DystopianTendencyType;
  detected: boolean;
  indicators: string[];
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * ユートピア/ディストピアバランス評価
 * @summary バランス評価
 */
export interface UtopiaDystopiaBalance {
  utopiaScore: number;
  dystopiaScore: number;
  balance: "utopian" | "dystopian" | "balanced";
  dominantTendencies: DystopianTendencyDetection[];
  healthyImperfectionIndicators: string[];
  recommendation: string;
}

/**
 * 欲望パターンタイプ
 * @summary スキゾ分析における欲望の分類
 */
export type DesirePatternType =
  | "productive-curiosity"  // 生産的好奇心
  | "guilt-driven-search"   // 罪悪感駆動検索
  | "norm-obedience"        // 規範への服従
  | "hierarchy-reproduction"; // 階層の再生産

/**
 * 欲望パターン検出結果
 * @summary 欲望検出
 */
export interface DesirePatternDetection {
  type: DesirePatternType;
  detected: boolean;
  indicators: string[];
  description: string;
}

/**
 * 内的ファシズムパターンタイプ
 * @summary 自己監視・規範内面化のパターン
 */
export type InnerFascismPatternType =
  | "self-surveillance"       // 自己監視
  | "norm-internalization"    // 規範の内面化
  | "impossibility-repression"; // 不可能なものの抑圧

/**
 * 内的ファシズム検出結果
 * @summary 内的ファシズム検出
 */
export interface InnerFascismDetection {
  type: InnerFascismPatternType;
  detected: boolean;
  indicators: string[];
  severity: "low" | "medium" | "high";
  description: string;
}

/**
 * スキゾ分析評価
 * @summary スキゾ分析の総合評価
 */
export interface SchizoAnalysisAssessment {
  desirePatterns: DesirePatternDetection[];
  innerFascismPatterns: InnerFascismDetection[];
  schizophreniaScore: number;
  liberationPotential: number;
  recommendation: string;
}

// ============================================================================
// Thinking Mode Types
// ============================================================================

/**
 * 6つの思考帽子
 * @summary シックスハット
 */
export type ThinkingHat =
  | "white"  // 事実・情報
  | "red"    // 感情・直感
  | "black"  // 批判・リスク
  | "yellow" // 利点・価値
  | "green"  // 創造・代替
  | "blue";  // 管理・整理

/**
 * システム1/2思考
 * @summary 思考システム
 */
export type ThinkingSystem = "system1" | "system2";

/**
 * ブルーム分類法レベル
 * @summary ブルームレベル
 */
export type BloomLevel =
  | "remember"   // 記憶
  | "understand" // 理解
  | "apply"      // 適用
  | "analyze"    // 分析
  | "evaluate"   // 評価
  | "create";    // 創造

/**
 * 思考モード分析結果
 * @summary 思考モード
 */
export interface ThinkingModeAnalysis {
  dominantHats: ThinkingHat[];
  systemBalance: {
    system1: number;
    system2: number;
  };
  bloomDistribution: Record<BloomLevel, number>;
  depthScore: number;
  diversityScore: number;
  coherenceScore: number;
  recommendedMode: "exploratory" | "analytical" | "creative" | "critical";
}

// ============================================================================
// Metacognitive Types
// ============================================================================

/**
 * 信頼度レベル
 * @summary 信頼度
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * 改善アクション
 * @summary 改善アクション
 */
export interface ImprovementAction {
  type: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "reasoning" | "evidence" | "perspective" | "bias" | "clarity";
  matchedText?: string;
}

/**
 * メタ認知チェック結果
 * @summary メタ認知
 */
export interface MetacognitiveCheck {
  thinkingQuality: {
    score: number;
    issues: string[];
    strengths: string[];
  };
  logic: {
    fallacies: string[];
    coherenceScore: number;
  };
  utopiaDystopia: UtopiaDystopiaBalance;
  schizoAnalysis: SchizoAnalysisAssessment;
  overallAssessment: string;
  improvementActions: ImprovementAction[];
}

/**
 * 推論チェーン
 * @summary 推論チェーン
 */
export interface InferenceChain {
  steps: InferenceStep[];
  overallConfidence: number;
  coherence: number;
  gaps: string[];
}

/**
 * 推論ステップ
 * @summary 推論ステップ
 */
export interface InferenceStep {
  claim: string;
  evidence?: string;
  reasoning?: string;
  confidence: number;
  assumptions: string[];
}

/**
 * 検出不確実性評価
 * @summary 不確実性
 */
export interface DetectionUncertainty {
  overallConfidence: number;
  limitations: DetectionLimitation[];
  potentiallyMissedIssues: string[];
  alternativeFormatRisk: {
    risk: "low" | "medium" | "high";
    description: string;
  };
}

/**
 * 検出の限界
 * @summary 検出限界
 */
export interface DetectionLimitation {
  type: string;
  description: string;
  impact: "low" | "medium" | "high";
}

// ============================================================================
// Constants
// ============================================================================

/**
 * デフォルト設定
 * 思考領域改善: 生成時品質保証への転換により検証システムを無効化
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationWorkflowConfig = {
  enabled: false,
  triggerModes: ["post-subagent", "low-confidence", "high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.85,
    requiredFlaws: 1,
    enabledCategories: [
      "evidence-gap",
      "logical-flaw",
      "assumption",
      "alternative",
      "boundary",
      "causal-reversal"
    ],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: [
      "claim-result-mismatch",
      "evidence-confidence-gap",
      "missing-alternatives",
      "causal-reversal",
      "confirmation-bias",
      "overconfidence",
      "first-reason-stopping",
      "proximity-bias",
      "concreteness-bias",
      "palliative-fix"
    ],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.9,
};

/**
 * 高リスクタスクのパターン
 * 検証ワークフローをトリガーする危険な操作のキーワード
 */
export const HIGH_STAKES_PATTERNS: RegExp[] = [
  // 削除・破壊的操作
  /削除/i,
  /破壊的/i,
  /delete/i,
  /destructive/i,
  /remove/i,
  /drop/i,
  /truncate/i,
  / purge /i,
  /wipe/i,
  /消去/i,
  /除去/i,

  // 本番環境・リリース
  /本番/i,
  /production/i,
  /prod\b/i,
  /リリース/i,
  /release/i,
  /live\s*environment/i,
  /実環境/i,

  // セキュリティ・認証
  /セキュリティ/i,
  /security/i,
  /認証/i,
  /authentication/i,
  /暗号化/i,
  /encryption/i,
  /パスワード/i,
  /password/i,
  /credentials/i,
  /シークレット/i,
  /\bsecret\b/i,
  /api\s*key/i,
  /\btoken\b/i,
  /vulnerability/i,
  /脆弱性/i,
  /injection/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bsql\s*injection/i,

  // データベース操作
  /マイグレーション/i,
  /migration/i,
  /\bschema\b/i,
  /スキーマ/i,
  /\balter\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /データベース変更/i,
  /database\s*change/i,
  /テーブル変更/i,
  /table\s*modification/i,
  /カラム変更/i,
  /column\s*change/i,
  /\breset\b/i,
  /\brollback\b/i,
  /\brevert\b/i,
  /\brestore\b/i,
  /\bbackup\b/i,
  /レプリケーション/i,
  /replication/i,
  /フェイルオーバー/i,
  /\bfailover\b/i,

  // API契約変更
  /breaking\s*change/i,
  /破壊的変更/i,
  /deprecated/i,
  /廃止/i,
  /非推奨/i,
  /api\s*contract/i,
  /エンドポイント変更/i,
  /endpoint\s*change/i,
  /互換性がない/i,
  /incompatible/i,

  // 認可・アクセス制御
  /権限/i,
  /\bpermission\b/i,
  /\bauthorize\b/i,
  /authorization/i,
  /認可/i,
  /アクセス制御/i,
  /access\s*control/i,
  /\bacl\b/i,
  /role\s*change/i,
  /ロール変更/i,
  /権限付与/i,
  /privilege/i,

  // インフラ・デプロイ
  /デプロイ/i,
  /\bdeploy\b/i,
  /インフラ/i,
  /infrastructure/i,
  /\binfra\b/i,
  /kubernetes/i,
  /\bk8s\b/i,
  /コンテナ/i,
  /\bcontainer\b/i,
  /スケーリング/i,
  /\bscale\s*(up|down|out|in)\b/i,
  /設定変更/i,
  /configuration\s*change/i,
  /\bconfig\s*change/i,
  /オートスケール/i,
  /auto\s*scale/i,
  /\biac\b/i,
  /terraform/i,
  /cloudformation/i,

  // 機密データ・コスト
  /\bpii\b/i,
  /個人情報/i,
  /personal\s*data/i,
  /機密/i,
  /confidential/i,
  /\bprivate\b/i,
  /sensitive\s*data/i,
  /コスト/i,
  /\bcost\b/i,
  /レート制限/i,
  /rate\s*limit/i,
  /課金/i,
  /billing/i,
  /予算/i,
  /\bbudget\b/i,
  /ログ削除/i,
  /log\s*deletion/i,

  // 不可逆操作・危険フラグ
  /\bforce\b/i,
  /強制/i,
  /永続的/i,
  /permanent/i,
  /不可逆/i,
  /irreversible/i,
  /bypass/i,
  /スキップ/i,
  /\bskip\b/i,
  /安全でない/i,
  /unsafe/i,
  /危険/i,
  /\bdanger\b/i,
  /\brisky\b/i,
  /上書き/i,
  /\boverwrite\b/i,
];

/**
 * 否定語のリスト
 */
export const NEGATION_WORDS = ['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't", 'ない', 'ません', 'しない', 'なし'];

/**
 * 不確実性を示す語のリスト
 */
export const UNCERTAINTY_WORDS = ['might', 'may', 'could', 'possibly', 'perhaps', 'maybe', 'likely', 'probably', 'apparently', 'seemingly', 'かもしれません', 'だろう', 'と思われる', '可能性がある'];

/**
 * 高信頼度を示す語のリスト
 */
export const HIGH_CONFIDENCE_WORDS = ['definitely', 'certainly', 'absolutely', 'undoubtedly', 'clearly', 'obviously', 'always', 'never', 'must', '間違いなく', '確実に', '当然', '必ず', '絶対'];
