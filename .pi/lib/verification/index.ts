/**
 * @abdd.meta
 * path: .pi/lib/verification/index.ts
 * role: 検証ワークフローモジュールの統合エクスポート
 * why: 分割されたモジュールへのアクセスを一元管理し、後方互換性を維持するため
 * related: ./types.ts, ./config.ts, ./patterns/index.ts, ../verification-workflow.ts
 * public_api: 全検証ワークフロー関連の型、関数、定数
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 検証ワークフローの統合エクスポートポイント
 * what_it_does:
 *   - 型定義を再エクスポートする
 *   - 設定管理関数を再エクスポートする
 *   - パターン検出関数を再エクスポートする
 *   - 将来的に他のモジュール（analysis, generation等）も統合する
 * why_it_exists:
 *   - モジュール分割後も単一のインポートパスを提供する
 *   - verification-workflow.tsからの移行を容易にする
 * scope:
 *   in: types.ts, config.ts, patterns/index.ts
 *   out: ../verification-workflow.ts, consumers
 */

// ============================================================================
// Types
// ============================================================================

export {
  // Basic Types
  type VerificationTriggerMode,
  type FallbackBehavior,
  type ChallengeCategory,
  type SuspicionThreshold,
  type InspectionPattern,
  type VerificationVerdict,

  // Configuration Interfaces
  type ChallengerConfig,
  type InspectorConfig,
  type VerificationWorkflowConfig,
  type VerificationMode,
  type VerificationWorkflowConfigV2,

  // Result Interfaces
  type DetectedPattern,
  type InspectorOutput,
  type ChallengedClaim,
  type ChallengerOutput,
  type VerificationResult,
  type VerificationContext,

  // Pattern Detection Types
  type PatternDetectionResult,
  type BugHuntingAporiaType,
  type BugHuntingContext,
  type BugHuntingAporiaRecognition,
  type DystopianTendencyType,
  type DystopianTendencyDetection,
  type UtopiaDystopiaBalance,
  type DesirePatternType,
  type DesirePatternDetection,
  type InnerFascismPatternType,
  type InnerFascismDetection,
  type SchizoAnalysisAssessment,

  // Thinking Mode Types
  type ThinkingHat,
  type ThinkingSystem,
  type BloomLevel,
  type ThinkingModeAnalysis,

  // Metacognitive Types
  type ConfidenceLevel,
  type ImprovementAction,
  type MetacognitiveCheck,
  type InferenceChain,
  type InferenceStep,
  type DetectionUncertainty,
  type DetectionLimitation,

  // Constants
  DEFAULT_VERIFICATION_CONFIG,
  HIGH_STAKES_PATTERNS,
  NEGATION_WORDS,
  UNCERTAINTY_WORDS,
  HIGH_CONFIDENCE_WORDS,
} from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

export {
  resolveVerificationConfig,
  resolveVerificationConfigV2,
  getVerificationModeFromEnv,
  REPOAUD_VERIFICATION_CONFIG,
  HIGH_STAKES_ONLY_VERIFICATION_CONFIG,
  EXPLICIT_ONLY_VERIFICATION_CONFIG,
} from "./config.js";

// ============================================================================
// Pattern Detection
// ============================================================================

export {
  // Output Patterns
  detectClaimResultMismatch,
  detectOverconfidence,
  detectMissingAlternatives,
  detectConfirmationBias,
  isHighStakesTask,
  checkOutputPatterns,

  // Bug Hunting & Aporia
  detectFirstReasonStopping,
  detectProximityBias,
  detectConcretenessBias,
  detectPalliativeFix,
  recognizeBugHuntingAporias,
  evaluateAporiaHandling,

  // Utopia/Dystopia
  detectDystopianTendencies,
  detectHealthyImperfectionIndicators,
  assessUtopiaDystopiaBalance,
  findRepeatedPhrases,

  // Schizo Analysis
  detectDesirePatterns,
  detectInnerFascismPatterns,
  performSchizoAnalysis,
} from "./patterns/index.js";
