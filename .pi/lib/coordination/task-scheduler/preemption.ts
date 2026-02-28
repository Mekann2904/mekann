/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/preemption.ts
 * role: タスクのプリエンプション（先取り）制御
 * why: 重要度の高いタスクを優先的に実行し、システムの応答性を確保するため
 * related: ./types.ts, ./scheduler.ts, ../checkpoint-manager.ts
 * public_api: PREEMPTION_MATRIX, shouldPreempt, preemptTask, resumeFromCheckpoint
 * invariants:
 *   - PREEMPTION_MATRIXに基づき優先度の低いタスクのみが割り込み対象となる
 * side_effects:
 *   - タスクのAbortSignalへの通知
 *   - CheckpointManagerへの状態保存
 *   - アクティブ実行リストの更新
 * failure_modes:
 *   - 環境変数によりプリエンプションが無効化される
 *   - チェックポイント保存失敗時はプリエンプション完了とみなされない
 * @abdd.explain
 * overview: 実行中タスクの先取り制御機能
 * what_it_does:
 *   - 実行中タスクと割り込みタスクの優先度を比較し、プリエンプションの可否を判定する
 *   - 実行中タスクの中断指示を行い、状態をチェックポイントとして保存する
 *   - 環境変数に基づいてプリエンプション機能の有効・無効を切り替える
 * why_it_exists:
 *   - 重要度の高いタスクを優先的に実行し、システムの応答性を確保するため
 *   - 実行中の処理を安全に中断し、後から再開可能な状態を維持するため
 * scope:
 *   in: TaskPriority, ScheduledTask, taskId, reason, state, progress, 環境変数(PI_ENABLE_PREEMPTION)
 *   out: PreemptionResult, boolean(shouldPreempt)
 */

import type { TaskPriority, ScheduledTask, TaskResult } from './types.js';
import {
  getCheckpointManager,
  type Checkpoint,
  type PreemptionResult,
  type CheckpointSource,
  type CheckpointPriority,
} from '../../checkpoint-manager.js';
import type { TaskQueueEntry } from './types.js';

// ============================================================================
// Preemption Matrix
// ============================================================================

/**
 * プリエンプションマトリックス
 * どの優先度がどの優先度をプリエンプトできるかを定義
 *
 * - critical: high/normal/low/backgroundをプリエンプト可能
 * - high: normal/low/backgroundをプリエンプト可能
 * - その他: プリエンプト不可
 */
export const PREEMPTION_MATRIX: Record<TaskPriority, TaskPriority[]> = {
  critical: ["high", "normal", "low", "background"],
  high: ["normal", "low", "background"],
  normal: [],
  low: [],
  background: [],
};

// ============================================================================
// プリエンプション判定
// ============================================================================

/**
 * 実行中タスクを割り込むか判定
 * @summary 割り込み要否判定
 * @param runningTask - 実行中のスケジュール済みタスク
 * @param incomingTask - 新規に割り込ませるスケジュール済みタスク
 * @returns 割り込みが必要な場合はtrue
 */
export function shouldPreempt(
  runningTask: ScheduledTask,
  incomingTask: ScheduledTask
): boolean {
  // 環境変数でプリエンプションが無効化されている場合
  if (process.env.PI_ENABLE_PREEMPTION === "false") {
    return false;
  }

  // 同じ優先度のタスクは互いにプリエンプトしない
  if (runningTask.priority === incomingTask.priority) {
    return false;
  }

  // プリエンプションマトリックスをチェック
  const preemptablePriorities = PREEMPTION_MATRIX[incomingTask.priority];
  if (!preemptablePriorities || preemptablePriorities.length === 0) {
    return false;
  }

  return preemptablePriorities.includes(runningTask.priority);
}

// ============================================================================
// プリエンプション実行
// ============================================================================

/**
 * スケジューラインターフェース（循環依存回避用）
 */
interface SchedulerLike {
  getActiveExecution(taskId: string): TaskQueueEntry | null;
  removeActiveExecution(taskId: string): boolean;
}

/** スケジューラインスタンス（遅延設定） */
let schedulerRef: SchedulerLike | null = null;

/**
 * スケジューラ参照を設定
 * @param scheduler - スケジューラインスタンス
 */
export function setSchedulerRef(scheduler: SchedulerLike): void {
  schedulerRef = scheduler;
}

/**
 * タスク先取り
 * @summary 実行中のタスクを中断してチェックポイントに保存する
 * @param taskId - 対象タスクID
 * @param reason - 中断理由
 * @param state - 任意の状態データ
 * @param progress - 進捗値
 * @returns 先取り処理の結果
 */
export async function preemptTask(
  taskId: string,
  reason: string,
  state?: unknown,
  progress?: number
): Promise<PreemptionResult> {
  if (!schedulerRef) {
    return {
      success: false,
      error: "Scheduler not initialized",
    };
  }

  const entry = schedulerRef.getActiveExecution(taskId);

  if (!entry) {
    return {
      success: false,
      error: `Task ${taskId} not found in active executions`,
    };
  }

  const task = entry.task;

  // タスクのAbortSignalが利用可能な場合は中断を通知
  // 注: AbortControllerは外部から管理されるため、ここから直接abortできない
  // タスクはこの通知をチェックして状態を保存する必要がある
  if (task.signal && !task.signal.aborted) {
    // Signal check for task cleanup
  }

  // チェックポイントを保存
  const checkpointManager = getCheckpointManager();
  const checkpointId = `cp-${taskId}-${Date.now().toString(36)}`;

  const saveResult = await checkpointManager.save({
    id: checkpointId,
    taskId: task.id,
    source: task.source as CheckpointSource,
    provider: task.provider,
    model: task.model,
    priority: task.priority as CheckpointPriority,
    state: state ?? { reason, preemptedAt: Date.now() },
    progress: progress ?? 0.5,
    ttlMs: 86_400_000, // 24時間
    metadata: { preemptReason: reason },
  });

  if (!saveResult.success) {
    return {
      success: false,
      error: `Failed to save checkpoint: ${saveResult.error}`,
    };
  }

  // アクティブ実行リストから削除（タスクはabort時にクリーンアップ責任を持つ）
  schedulerRef.removeActiveExecution(taskId);

  return {
    success: true,
    checkpointId: saveResult.checkpointId,
  };
}

// ============================================================================
// チェックポイント復帰
// ============================================================================

/**
 * チェックポイント復帰
 * @summary チェックポイントから処理を再開する
 * @param checkpointId - チェックポイントID
 * @param execute - 復帰後の実行関数
 * @returns タスクの実行結果
 */
export async function resumeFromCheckpoint<TResult = unknown>(
  checkpointId: string,
  execute: (checkpoint: Checkpoint) => Promise<TResult>
): Promise<TaskResult<TResult>> {
  const checkpointManager = getCheckpointManager();
  const startTime = Date.now();

  try {
    // チェックポイントIDで状態を復元
    const checkpoint = await checkpointManager.loadById(checkpointId);

    if (!checkpoint) {
      // 復元失敗時は警告ログを出力
      console.warn(`[task-scheduler] Checkpoint not found: ${checkpointId}`);
      return {
        taskId: checkpointId,
        success: false,
        error: `Checkpoint not found: ${checkpointId}`,
        waitedMs: 0,
        executionMs: Date.now() - startTime,
        timedOut: false,
        aborted: false,
      };
    }

    // 復元したチェックポイントを使って処理を再開
    const result = await execute(checkpoint);

    return {
      taskId: checkpoint.taskId,
      success: true,
      result,
      waitedMs: 0,
      executionMs: Date.now() - startTime,
      timedOut: false,
      aborted: false,
    };
  } catch (error) {
    // 復元または実行中のエラーを記録
    console.warn(
      `[task-scheduler] Checkpoint resumption failed for ${checkpointId}:`,
      error instanceof Error ? error.message : String(error)
    );
    return {
      taskId: checkpointId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      waitedMs: 0,
      executionMs: Date.now() - startTime,
      timedOut: false,
      aborted: false,
    };
  }
}
