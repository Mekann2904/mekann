/**
 * @abdd.meta
 * path: .pi/lib/ul-workflow/index.ts
 * role: UL Workflowモジュールのメインエクスポート
 * why: モジュールへの統一アクセスを提供
 * related: ./domain, ./application, ./adapters, ./infrastructure
 * public_api: registerUlWorkflowExtension, すべての型と関数
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: モジュールの統一エクスポート
 * what_it_does: 各層のエクスポートをまとめる
 * why_it_exists: インポートパスの簡素化
 * scope:
 *   in: すべての層
 *   out: .pi/extensions/ul-workflow.ts
 */

// Infrastructure
export { registerUlWorkflowExtension } from "./infrastructure/extension.js";

// Domain (for external use)
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
} from "./domain/workflow-state.js";

export {
  type OwnershipResult,
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  checkOwnership,
  claimOwnership,
  isCurrentOwner,
} from "./domain/ownership.js";

export {
  type TaskComplexity,
  type ExecutionStrategy,
  type ExecutionStrategyResult,
  estimateTaskComplexity,
  looksLikeClearGoalTask,
  determineWorkflowPhases,
  determineExecutionStrategy,
} from "./domain/execution-strategy.js";

// Application
export { WorkflowService } from "./application/workflow-service.js";
export {
  type IWorkflowRepository,
  type ISubagentRunner,
  type IQuestionUI,
  type SubagentResult,
  type QuestionOption,
  type QuestionResult,
  type WorkflowServiceDependencies,
  type StartWorkflowResult,
  type ApprovePhaseResult,
} from "./application/interfaces.js";

// Adapters
export { FileWorkflowRepository } from "./adapters/storage/file-workflow-repo.js";
