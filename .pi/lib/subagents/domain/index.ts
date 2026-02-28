/**
 * @abdd.meta
 * path: .pi/lib/subagents/domain/index.ts
 * role: Domain層のエクスポート
 * why: ドメインモジュールへの統一アクセスを提供
 * related: ./subagent-definition.ts, ./responsibility.ts, ./ownership.ts
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

// Subagent Definition
export {
  type SubagentDefinition,
  type SubagentStorage,
  type SubagentRunRecord,
  DEFAULT_SUBAGENTS,
} from "./subagent-definition.js";

// Responsibility
export {
  type ResponsibilityCheck,
  validateSingleResponsibility,
  getResponsibilitySeverity,
  getRecommendedAction,
  summarizeResponsibilityChecks,
} from "./responsibility.js";

// Ownership
export {
  type UlWorkflowOwnershipResult,
  getInstanceId,
  extractPidFromInstanceId,
  isProcessAlive,
  isOwnerProcessDead,
  checkUlWorkflowOwnership,
  needsOwnershipCheck,
  formatOwnershipError,
} from "./ownership.js";
