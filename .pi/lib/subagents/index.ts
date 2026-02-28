/**
 * @abdd.meta
 * path: .pi/lib/subagents/index.ts
 * role: サブエージェントモジュールのメインエクスポート
 * why: モジュールへの統一アクセスを提供
 * related: ./domain, ./application, ./adapters, ./infrastructure
 * public_api: すべての型、関数、クラス
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: モジュールの統一エクスポート
 * what_it_does: 各層のエクスポートをまとめる
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべての層
 *   out: .pi/extensions/subagents.ts, 外部コンシューマー
 */

// Domain Layer
export {
  type SubagentDefinition,
  type SubagentStorage,
  DEFAULT_SUBAGENTS,
} from "./domain/index.js";

export {
  type ResponsibilityCheck,
  validateSingleResponsibility,
  getResponsibilitySeverity,
  getRecommendedAction,
  summarizeResponsibilityChecks,
} from "./domain/index.js";

export {
  type UlWorkflowOwnershipResult,
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  checkUlWorkflowOwnership,
  needsOwnershipCheck,
  formatOwnershipError,
} from "./domain/index.js";

// Application Layer
export {
  SubagentService,
  type ISubagentRepository,
  type ISubagentExecutor,
  type IRuntimeCoordinator,
  type SubagentExecutionResult,
  type SubagentExecutionOptions,
  type SubagentServiceDependencies,
  type SubagentSelectionResult,
  type RuntimePermit,
} from "./application/index.js";

// Adapters Layer
export {
  FileSubagentRepository,
  RuntimeCoordinatorImpl,
} from "./adapters/index.js";

// Infrastructure Layer
export {
  createSubagentTools,
  SubagentToolFactory,
} from "./infrastructure/index.js";
