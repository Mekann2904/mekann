/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/index.ts
 * role: タスクスケジューラモジュールの公開API
 * why: モジュール利用者に統一されたエントリポイントを提供するため
 * related: ./types.ts, ./scheduler.ts, ./preemption.ts, ./hybrid-scoring.ts, ./utils.ts
 * public_api: 全ての型と関数を再エクスポート
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: タスクスケジューラモジュールの統一エントリポイント
 * what_it_does:
 *   - 型定義を再エクスポート
 *   - スケジューラ関数を再エクスポート
 *   - サブモジュール関数を再エクスポート
 * why_it_exists: 利用者が内部構造を意識せずにモジュールを使用できるようにするため
 * scope:
 *   in: なし
 *   out: 公開API
 */

// 型定義
export type {
  TaskSource,
  TaskCostEstimate,
  ScheduledTask,
  TaskResult,
  QueueStats,
  SchedulerConfig,
  HybridSchedulerConfig,
  TaskQueueEntry,
  TaskPriority,
} from './types.js';

// スケジューラ
export {
  TaskSchedulerImpl,
  getScheduler,
  createScheduler,
  resetScheduler,
} from './scheduler.js';

// プリエンプション
export {
  PREEMPTION_MATRIX,
  shouldPreempt,
  preemptTask,
  resumeFromCheckpoint,
  setSchedulerRef,
} from './preemption.js';

// ハイブリッドスケジューリング
export {
  DEFAULT_HYBRID_CONFIG,
  computeSJFScore,
  computeFairQueueScore,
  computeHybridScore,
  compareHybridEntries,
} from './hybrid-scoring.js';

// ユーティリティ
export {
  createTaskId,
  compareTaskEntries,
  getDefaultSchedulerConfig,
  DEFAULT_CONFIG,
  priorityToValue,
  PRIORITY_ORDER,
} from './utils.js';
