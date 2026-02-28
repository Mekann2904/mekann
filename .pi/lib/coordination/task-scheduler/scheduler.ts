/**
 * @abdd.meta
 * path: .pi/lib/coordination/task-scheduler/scheduler.ts
 * role: イベント駆動タスクスケジューラの実装
 * why: 優先度ベースの効率的なタスク実行と動的なリソース配分を実現するため
 * related: ./types.ts, ./preemption.ts, ./hybrid-scoring.ts, ./utils.ts
 * public_api: TaskSchedulerImpl, getScheduler, createScheduler, resetScheduler
 * invariants:
 *   - アクティブ実行数はmaxTotalConcurrentを超えない
 *   - モデル別のアクティブ実行数はmaxConcurrentPerModelを超えない
 * side_effects:
 *   - タスクの実行
 *   - イベントの発火
 * failure_modes:
 *   - キューが見つからない場合
 *   - タスクのタイムアウト
 *   - タスクの中断
 * @abdd.explain
 * overview: プロバイダーやモデルごとのキューマネジメントを持つイベント駆動スケジューラ
 * what_it_does:
 *   - タスクを優先度順にキューイング
 *   - プロバイダー/モデル別の並列実行制御
 *   - スターベーション防止
 *   - プリエンプションサポート
 * why_it_exists:
 *   - 効率的なリソース利用と高い応答性を実現するため
 *   - 公平なタスク実行を保証するため
 * scope:
 *   in: ScheduledTask, SchedulerConfig
 *   out: TaskResult, QueueStats
 */

import type {
  ScheduledTask,
  TaskResult,
  QueueStats,
  SchedulerConfig,
  TaskQueueEntry,
  TaskPriority,
} from './types.js';
import { shouldPreempt, preemptTask, setSchedulerRef } from './preemption.js';
import { createTaskId, compareTaskEntries, getDefaultSchedulerConfig, priorityToValue, PRIORITY_ORDER } from './utils.js';

// ============================================================================
// TaskScheduler Implementation
// ============================================================================

/**
 * イベント駆動の優先度キュータスクスケジューラ
 */
export class TaskSchedulerImpl {
  private readonly config: SchedulerConfig;
  private readonly queues: Map<string, TaskQueueEntry[]> = new Map();
  private readonly activeExecutions: Map<string, TaskQueueEntry> = new Map();
  private readonly eventTarget: EventTarget = new EventTarget();
  private taskIdCounter = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    // 集中管理された設定をデフォルトとして使用
    const defaults = getDefaultSchedulerConfig();
    this.config = { ...defaults, ...config };

    // プリエンプション機能用に自身を登録
    setSchedulerRef(this);
  }

  // ============================================================================
  // パブリックメソッド
  // ============================================================================

  /**
   * タスクをスケジュールに送信
   * @summary タスク送信
   * @param task - 実行するタスク
   * @returns タスクの実行結果
   */
  async submit<TResult>(task: ScheduledTask<TResult>): Promise<TaskResult<TResult>> {
    const enqueuedAtMs = Date.now();
    const entry: TaskQueueEntry = {
      task: task as ScheduledTask<unknown>,
      enqueuedAtMs,
      skipCount: 0,
    };

    // プロバイダー/モデル用のキューを取得または作成
    const queueKey = this.getQueueKey(task.provider, task.model);
    let queue = this.queues.get(queueKey);
    if (!queue) {
      queue = [];
      this.queues.set(queueKey, queue);
    }

    // キューに追加
    queue.push(entry);
    this.sortQueue(queue);

    // リスナーに通知
    this.eventTarget.dispatchEvent(new Event("task-queued"));

    // 実行順番を待機
    return this.waitForExecution<TResult>(entry, task);
  }

  /**
   * キューの統計情報を取得
   * @summary 統計情報取得
   * @returns 統計情報
   */
  getStats(): QueueStats {
    const now = Date.now();
    const byPriority: Record<TaskPriority, number> = {
      background: 0,
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    };
    const byProvider: Record<string, number> = {};
    let totalWait = 0;
    let maxWait = 0;
    let starvingCount = 0;
    let totalQueued = 0;

    for (const [, queue] of this.queues) {
      for (const entry of queue) {
        totalQueued++;
        byPriority[entry.task.priority]++;
        byProvider[entry.task.provider] = (byProvider[entry.task.provider] || 0) + 1;

        const waitMs = now - entry.enqueuedAtMs;
        totalWait += waitMs;
        maxWait = Math.max(maxWait, waitMs);

        // スターベーションチェック
        if (entry.skipCount > this.config.maxSkipCount || waitMs > this.config.starvationThresholdMs) {
          starvingCount++;
        }
      }
    }

    return {
      totalQueued,
      byPriority,
      byProvider,
      avgWaitMs: totalQueued > 0 ? totalWait / totalQueued : 0,
      maxWaitMs: maxWait,
      starvingCount,
      activeExecutions: this.activeExecutions.size,
    };
  }

  // ============================================================================
  // プリエンプションサポートメソッド
  // ============================================================================

  /**
   * 指定した実行中タスクを取得
   * @param taskId - タスクID
   * @returns タスクエントリ、存在しない場合はnull
   */
  getActiveExecution(taskId: string): TaskQueueEntry | null {
    return this.activeExecutions.get(taskId) ?? null;
  }

  /**
   * 実行中タスクを削除する
   * @param taskId - タスクID
   * @returns 削除されたかどうか
   */
  removeActiveExecution(taskId: string): boolean {
    return this.activeExecutions.delete(taskId);
  }

  /**
   * すべての実行中タスクを取得
   * @returns 実行中タスクのマップ
   */
  getAllActiveExecutions(): Map<string, TaskQueueEntry> {
    return new Map(this.activeExecutions);
  }

  /**
   * プリエンプト必要性を確認
   * @param incomingTask - 実行予定タスク
   * @returns プリエンプト可能なタスク
   */
  checkPreemptionNeeded(incomingTask: ScheduledTask): ScheduledTask | null {
    if (process.env.PI_ENABLE_PREEMPTION === "false") {
      return null;
    }

    // プリエンプト可能な最も低い優先度の実行中タスクを見つける
    let lowestPriorityTask: ScheduledTask | null = null;
    let lowestPriorityValue = Infinity;

    for (const [, entry] of this.activeExecutions) {
      const runningTask = entry.task;

      if (shouldPreempt(runningTask, incomingTask)) {
        const priorityValue = priorityToValue(runningTask.priority);
        if (priorityValue < lowestPriorityValue) {
          lowestPriorityValue = priorityValue;
          lowestPriorityTask = runningTask;
        }
      }
    }

    return lowestPriorityTask;
  }

  /**
   * 実行中タスクのプリエンプトを試行
   * @param incomingTask - 実行予定タスク
   * @param checkpointState - チェックポイント状態
   * @param checkpointProgress - チェックポイント進捗
   * @returns プリエンプト結果
   */
  async attemptPreemption(
    incomingTask: ScheduledTask,
    checkpointState?: unknown,
    checkpointProgress?: number
  ): Promise<{ preempted: boolean; checkpointId?: string; error?: string }> {
    const targetTask = this.checkPreemptionNeeded(incomingTask);

    if (!targetTask) {
      return { preempted: false };
    }

    try {
      const result = await preemptTask(
        targetTask.id,
        `Preempted by ${incomingTask.priority} priority task: ${incomingTask.id}`,
        checkpointState,
        checkpointProgress
      );

      if (result.success) {
        // プリエンプションをリスナーに通知
        this.eventTarget.dispatchEvent(new CustomEvent("task-preempted", {
          detail: { taskId: targetTask.id, checkpointId: result.checkpointId },
        }));
      }

      return {
        preempted: result.success,
        checkpointId: result.checkpointId,
        error: result.error,
      };
    } catch (error) {
      return {
        preempted: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * プリエンプト監視を登録
   * @param callback - コールバック関数
   * @returns 監視解除関数
   */
  onPreemption(callback: (taskId: string, checkpointId: string) => void): () => void {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ taskId: string; checkpointId: string }>;
      callback(customEvent.detail.taskId, customEvent.detail.checkpointId);
    };

    this.eventTarget.addEventListener("task-preempted", handler);

    return () => {
      this.eventTarget.removeEventListener("task-preempted", handler);
    };
  }

  // ============================================================================
  // プライベートメソッド
  // ============================================================================

  /**
   * プロバイダー/モデルの組み合わせのキューキーを取得
   */
  private getQueueKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }

  /**
   * キューを優先度順にソート
   */
  private sortQueue(queue: TaskQueueEntry[]): void {
    queue.sort(compareTaskEntries);
  }

  /**
   * スターベーション状態のタスクを昇格
   */
  private promoteStarvingTasks(queue: TaskQueueEntry[]): number {
    const now = Date.now();
    let promoted = 0;

    for (const entry of queue) {
      const waitMs = now - entry.enqueuedAtMs;

      if (entry.skipCount > this.config.maxSkipCount || waitMs > this.config.starvationThresholdMs) {
        const currentIndex = PRIORITY_ORDER.indexOf(entry.task.priority);
        if (currentIndex < PRIORITY_ORDER.length - 1) {
          (entry.task.priority as TaskPriority) = PRIORITY_ORDER[currentIndex + 1];
          entry.skipCount = 0;
          promoted++;
        }
      }
    }

    if (promoted > 0) {
      this.sortQueue(queue);
    }

    return promoted;
  }

  /**
   * 実行順番を待機して実行
   */
  private async waitForExecution<TResult>(
    entry: TaskQueueEntry,
    originalTask: ScheduledTask<TResult>
  ): Promise<TaskResult<TResult>> {
    const task = entry.task;
    const typedTask = originalTask;
    const queueKey = this.getQueueKey(task.provider, task.model);
    const startTime = Date.now();

    return new Promise<TaskResult<TResult>>((resolve) => {
      const checkAndExecute = async () => {
        // 中断チェック
        if (task.signal?.aborted) {
          this.removeFromQueue(queueKey, entry);
          resolve({
            taskId: task.id,
            success: false,
            waitedMs: Date.now() - startTime,
            executionMs: 0,
            timedOut: false,
            aborted: true,
            error: "Task aborted",
          });
          return;
        }

        // タイムアウトチェック
        if (task.deadlineMs && Date.now() > task.deadlineMs) {
          this.removeFromQueue(queueKey, entry);
          resolve({
            taskId: task.id,
            success: false,
            waitedMs: Date.now() - startTime,
            executionMs: 0,
            timedOut: true,
            aborted: false,
            error: "Task timed out waiting for execution",
          });
          return;
        }

        // キューの存在確認
        const queue = this.queues.get(queueKey);
        if (!queue) {
          resolve({
            taskId: task.id,
            success: false,
            waitedMs: Date.now() - startTime,
            executionMs: 0,
            timedOut: false,
            aborted: false,
            error: "Queue not found",
          });
          return;
        }

        // キューの先頭にいて、キャパシティが利用可能かチェック
        const queueIndex = queue.indexOf(entry);
        const activeForModel = this.countActiveForModel(task.provider, task.model);
        const totalActive = this.activeExecutions.size;

        const canExecute =
          queueIndex === 0 &&
          activeForModel < this.config.maxConcurrentPerModel &&
          totalActive < this.config.maxTotalConcurrent;

        if (canExecute) {
          // キューから削除して実行開始
          queue.splice(queueIndex, 1);
          entry.startedAtMs = Date.now();
          this.activeExecutions.set(task.id, entry);

          // 残りのエントリのスキップカウントを増加
          for (const remaining of queue) {
            remaining.skipCount++;
          }

          // スターベーション状態のタスクを昇格
          this.promoteStarvingTasks(queue);

          // 型付きタスクを使用して実行（結果型を保持）
          const execStart = Date.now();
          try {
            const result = await typedTask.execute();
            const execEnd = Date.now();

            this.activeExecutions.delete(task.id);
            this.eventTarget.dispatchEvent(new Event("task-completed"));

            resolve({
              taskId: task.id,
              success: true,
              result,
              waitedMs: entry.startedAtMs - entry.enqueuedAtMs,
              executionMs: execEnd - execStart,
              timedOut: false,
              aborted: false,
            });
          } catch (error) {
            const execEnd = Date.now();
            this.activeExecutions.delete(task.id);
            this.eventTarget.dispatchEvent(new Event("task-completed"));

            resolve({
              taskId: task.id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              waitedMs: entry.startedAtMs - entry.enqueuedAtMs,
              executionMs: execEnd - execStart,
              timedOut: false,
              aborted: false,
            });
          }
        } else {
          // スキップカウントを増加して待機
          entry.skipCount++;

          // イベント駆動でタスク完了を待機
          const waitResult = await this.waitForEvent(1000, task.signal);
          if (waitResult === "aborted") {
            this.removeFromQueue(queueKey, entry);
            resolve({
              taskId: task.id,
              success: false,
              waitedMs: Date.now() - startTime,
              executionMs: 0,
              timedOut: false,
              aborted: true,
              error: "Task aborted",
            });
            return;
          }

          // 再チェック
          checkAndExecute();
        }
      };

      // チェック開始
      checkAndExecute();
    });
  }

  /**
   * キューからエントリを削除
   */
  private removeFromQueue(queueKey: string, entry: TaskQueueEntry): void {
    const queue = this.queues.get(queueKey);
    if (!queue) return;

    const index = queue.indexOf(entry);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  /**
   * モデルごとのアクティブ実行数をカウント
   */
  private countActiveForModel(provider: string, model: string): number {
    const key = this.getQueueKey(provider, model);
    let count = 0;
    for (const [, entry] of this.activeExecutions) {
      if (this.getQueueKey(entry.task.provider, entry.task.model) === key) {
        count++;
      }
    }
    return count;
  }

  /**
   * イベントまたはタイムアウトを待機
   */
  private waitForEvent(timeoutMs: number, signal?: AbortSignal): Promise<"event" | "timeout" | "aborted"> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve("aborted");
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        resolve("timeout");
      }, timeoutMs);

      const onEvent = () => {
        cleanup();
        resolve("event");
      };

      const onAbort = () => {
        cleanup();
        resolve("aborted");
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.eventTarget.removeEventListener("task-completed", onEvent);
        signal?.removeEventListener("abort", onAbort);
      };

      this.eventTarget.addEventListener("task-completed", onEvent, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}

// ============================================================================
// シングルトンインスタンス
// ============================================================================

let schedulerInstance: TaskSchedulerImpl | null = null;

/**
 * スケジューラを取得する
 * @returns シングルトンインスタンス
 */
export function getScheduler(): TaskSchedulerImpl {
  if (!schedulerInstance) {
    schedulerInstance = new TaskSchedulerImpl();
  }
  return schedulerInstance;
}

/**
 * スケジューラを作成する
 * @param config - 設定オプション
 * @returns 新しいスケジューラインスタンス
 */
export function createScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerImpl {
  return new TaskSchedulerImpl(config);
}

/**
 * シングルトンのスケジューラーをリセットする
 */
export function resetScheduler(): void {
  schedulerInstance = null;
}
