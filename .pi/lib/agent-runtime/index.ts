/**
 * @abdd.meta
 * path: .pi/lib/agent-runtime/index.ts
 * role: ランタイムモジュールのメインエクスポート
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
 *   out: .pi/extensions/agent-runtime.ts, 外部コンシューマー
 */

// Domain Layer
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
} from "./domain/index.js";

export {
  type CapacityCheckInput,
  type RuntimeCapacityCheck,
  calculateProjectedUsage,
  checkCapacity,
  calculateUtilization,
  updatePriorityStats,
} from "./domain/index.js";

// Application Layer
export {
  RuntimeService,
  type AgentRuntimeSnapshot,
  type IRuntimeStateProvider,
  type ICapacityManager,
  type IDispatchPermitManager,
  type RuntimeCapacityReservationLease,
  type RuntimeDispatchPermitInput,
  type RuntimeDispatchPermitLease,
  type RuntimeDispatchPermitResult,
  type RuntimeServiceDependencies,
} from "./application/index.js";

// Adapters Layer
export { GlobalRuntimeStateProvider } from "./adapters/index.js";

// Infrastructure Layer
export {
  createRuntimeTools,
  getSharedRuntimeService,
} from "./infrastructure/index.js";
