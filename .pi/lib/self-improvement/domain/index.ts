/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/domain/index.ts
 * role: ドメイン層のエクスポート集約
 * why: ドメイン層の公開APIを一箇所に集約し、他層からの依存を明確にするため
 * related: ./types.ts, ./perspective.ts, ./loop-state.ts
 * public_api: ドメイン層のすべての公開API
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: ドメイン層のエクスポート集約ファイル
 * what_it_does:
 *   - 型定義の再エクスポート
 *   - 視座関連の再エクスポート
 *   - 状態管理の再エクスポート
 * why_it_exists:
 *   - 他層からのインポートを簡素化するため
 * scope:
 *   in: ./types.ts, ./perspective.ts, ./loop-state.ts
 *   out: application層, adapters層
 */

// 型定義
export type {
  PerspectiveName,
  PerspectiveDefinition,
  PerspectiveState,
  PerspectiveResult,
  ParsedPerspectiveScores,
  StopReason,
  SelfImprovementLoopState,
  CycleResult,
  SuccessfulPattern,
  ULPhase,
  ULPhaseContext,
  ActiveAutonomousRun,
  ThinkingLevel,
  SelfImprovementModel,
  RateLimitConfig,
  SelfImprovementLoopConfig,
  SelfImprovementLoopParams,
  MetacognitiveCheck,
  AporiaDetection,
  FallacyDetection,
  ImprovementAction,
  IntegratedVerificationResult,
  CandidateDetection,
  TrajectoryTracker,
  CommitContext,
  GitCommandResult,
  GitOperations,
  FileOperations,
  LLMOperations,
} from "./types.js";

// 視座関連
export {
  PERSPECTIVES,
  HAT_NAMES,
  initializePerspectiveStates,
  getPerspectiveDefinition,
  getPerspectiveNameByDisplayName,
  parsePerspectiveScores,
  parseNextFocus,
  parseLoopStatus,
  calculateAverageScore,
  isHighScore,
} from "./perspective.js";

// 状態管理
export {
  DEFAULT_LOOP_CONFIG,
  DEFAULT_MODEL,
  createRunId,
  initializeLoopState,
  initializeActiveRun,
  shouldStopLoop,
  calculateCycleAverageScore,
  detectStagnation,
  generateStrategyHint,
  recordSuccessfulPattern,
} from "./loop-state.js";
