/**
 * @abdd.meta
 * path: .pi/lib/coordination/index.ts
 * role: Layer 3調整・スケジューリング機能の集約エントリーポイント
 * why: 複数インスタンス間の協調、リソース管理、タスクスケジューリングを一箇所で提供
 * related: ./cross-instance-coordinator.ts, ./task-scheduler.ts, ./unified-limit-resolver.ts
 * public_api: 型定義、スケジューラ、リミット解決
 * invariants: 外部依存なし
 * side_effects: なし
 * failure_modes: モジュール解決エラー
 * @abdd.explain
 * overview: 複数piインスタンス間のリソース調整を管理するモジュール
 * what_it_does:
 *   - クロスインスタンスコーディネータを提供
 *   - 優先度ベースのタスクスケジューラを提供
 *   - 統一されたリミット解決を提供
 * why_it_exists:
 *   - 複数の拡張機能やツールが同時実行される際のリソース競合を防ぐ
 * scope:
 *   in: Layer 0-2のモジュール
 *   out: 拡張機能、ツール、エージェント
 */

// Cross-instance coordination (Layer 3)
export {
  type ActiveModelInfo,
  type InstanceInfo,
  type CoordinatorConfig,
  type CoordinatorInternalState,
  resetHeartbeatDebounce,
} from "./cross-instance-coordinator.js";

// Dynamic parallelism (Layer 3)
export {
  DynamicParallelismAdjuster,
  type ParallelismConfig,
  type ProviderHealth,
  type DynamicAdjusterConfig,
  type ErrorEvent,
} from "./dynamic-parallelism.js";

// Priority scheduler (Layer 3)
export {
  type TaskPriority,
  type TaskType,
  type TaskComplexity,
  PRIORITY_WEIGHTS,
  PRIORITY_VALUES,
  type EstimationContext,
  type RoundEstimation,
  type InferPriorityOptions,
  type PriorityQueueEntry,
  type PriorityTaskMetadata,
} from "./priority-scheduler.js";

// Task scheduler (Layer 3)
export {
  PREEMPTION_MATRIX,
  shouldPreempt,
  preemptTask,
  resumeFromCheckpoint,
  type TaskSource,
  type TaskCostEstimate,
  type ScheduledTask,
  type TaskResult,
  type QueueStats,
} from "./task-scheduler.js";

// Unified limit resolver (Layer 3)
export {
  type UnifiedLimitInput,
  type LimitBreakdown,
  type UnifiedLimitResult,
  setRuntimeSnapshotProvider,
  isSnapshotProviderInitialized,
  getInitializationState,
  type UnifiedEnvConfig,
  getUnifiedEnvConfig,
  resolveUnifiedLimits,
  formatUnifiedLimitsResult,
} from "./unified-limit-resolver.js";
