/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/domain/index.ts
 * role: Domain層のエクスポート
 * why: ドメインモジュールへの統一アクセスを提供
 * related: ./runtime-state.ts, ./capacity-check.ts
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

export {
  type TaskPriority,
  type PriorityTaskMetadata,
  type RuntimeQueueClass,
  type AgentRuntimeLimits,
  type RuntimePriorityStats,
  type RuntimeQueueEntry,
  type RuntimeCapacityReservationRecord,
  type SubagentRuntimeState,
  type TeamRuntimeState,
  type QueueRuntimeState,
  type ReservationRuntimeState,
  type AgentRuntimeState,
  createDefaultLimits,
  createInitialRuntimeState,
  serializeLimits,
  getPriorityRank,
  getQueueClassRank,
} from "./runtime-state.js";

export {
  type CapacityCheckInput,
  type RuntimeCapacityCheck,
  calculateProjectedUsage,
  checkCapacity,
  calculateUtilization,
  updatePriorityStats,
} from "./capacity-check.js";
