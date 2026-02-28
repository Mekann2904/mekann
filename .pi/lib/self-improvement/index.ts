/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/index.ts
 * role: 自己改善ループモジュールのエントリーポイント
 * why: クリーンアーキテクチャの公開APIを一箇所に集約し、外部からの利用を簡素化するため
 * related: ./domain/index.ts, ./adapters/index.ts, ./application/index.ts
 * public_api: すべての公開API
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 自己改善ループモジュールのエントリーポイント
 * what_it_does:
 *   - ドメイン層の再エクスポート
 *   - アダプター層の再エクスポート
 *   - アプリケーション層の再エクスポート
 * why_it_exists:
 *   - 外部モジュールからのインポートを簡素化するため
 *   - クリーンアーキテクチャのレイヤー構造を維持しながら、使いやすいAPIを提供するため
 * scope:
 *   in: ./domain, ./adapters, ./application
 *   out: .pi/extensions/self-improvement-loop.ts
 */

// ============================================================================
// ドメイン層
// ============================================================================

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
} from "./domain/types.js";

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
} from "./domain/perspective.js";

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
} from "./domain/loop-state.js";

// ============================================================================
// アダプター層
// ============================================================================

// Gitアダプター
export {
  GitAdapter,
  createGitAdapter,
  EXCLUDE_PATTERNS,
  shouldStageFile,
  generateGitignorePattern,
} from "./adapters/git-adapter.js";

// ファイルアダプター
export {
  FileAdapter,
  createFileAdapter,
  generateLogHeader,
  generateCycleLog,
  generateFooterLog,
} from "./adapters/file-adapter.js";

// プロンプト生成
export {
  buildLoopMarker,
  parseLoopCycleMarker,
  buildULPhaseMarker,
  parseULPhaseMarker,
  buildAutonomousCyclePrompt,
  buildPerspectivePrompt,
  buildResearchPrompt,
  buildPlanPrompt,
  buildImplementPrompt,
} from "./adapters/prompts.js";

// ============================================================================
// アプリケーション層
// ============================================================================

export {
  SelfImprovementLoopService,
  createLoopService,
  type LoopServiceDependencies,
  type LoopServiceConfig,
} from "./application/loop-service.js";
