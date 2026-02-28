/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/domain/index.ts
 * role: Domain層のエクスポート
 * why: ドメインモジュールへの統一アクセスを提供
 * related: ./workflow-state.ts, ./ownership.ts, ./execution-strategy.ts
 * public_api: すべてのドメイン型と関数
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: Domain層の統一エクスポート
 * what_it_does: ドメインモジュールの再エクスポート
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべてのドメインファイル
 *   out: application層、adapters層
 */

// Workflow State
export {
  type WorkflowPhase,
  type WorkflowState,
  type ActiveWorkflowRegistry,
  DEFAULT_PHASES,
  advancePhase,
  getNextPhaseIndex,
  isTerminalPhase,
  canExecutePhase,
  getPhaseDescription,
} from "./workflow-state.js";

// Ownership
export {
  type OwnershipResult,
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  checkOwnership,
  claimOwnership,
  isCurrentOwner,
} from "./ownership.js";

// Execution Strategy
export {
  type TaskComplexity,
  type ExecutionStrategy,
  type ExecutionStrategyResult,
  estimateTaskComplexity,
  looksLikeClearGoalTask,
  determineWorkflowPhases,
  determineExecutionStrategy,
} from "./execution-strategy.js";
