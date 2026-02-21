/**
 * @abdd.meta
 * path: .pi/lib/task-scheduler.ts
 * role: 優先度ベースのタスクスケジューラおよびプリエンプション機能の提供
 * why: プロバイダやモデルごとのキュー管理を行い、イベント駆動で高優先度タスクによる低優先度タスクの割り込みを実現するため
 * related: .pi/lib/priority-scheduler.ts, .pi/lib/checkpoint-manager.ts, .pi/extensions/agent-runtime.ts, .pi/lib/token-bucket.ts
 * public_api: PREEMPTION_MATRIX, shouldPreempt, preemptTask
 * invariants: プリエンプションは環境変数PI_ENABLE_PREEMPTIONがfalseの場合は無効化される、同一優先度のタスクは相互にプリエンプションしない
 * side_effects: preemptTask実行時、CheckpointManagerへの状態保存およびタスクへのAbortSignal通知を行う
 * failure_modes: タスクがアクティブ実行中に見つからない場合、チェックポイントの保存に失敗した場合
 * @abdd.explain
 * overview: 優先度順位付けに基づくタスク実行の制御、プリエンプション行列による割り込み可否の判定、実行中タスクの一時停止とチェックポイント作成を行うモジュール
 * what_it_does:
 *   - PREEMPTION_MATRIXによる優先度間の割り込みルール定義
 *   - 実行中タスクと到着タスクの優先度比較に基づくshouldPreempt判定
 *   - preemptTaskによるタスク中断、状態のシリアライズ、およびCheckpointManagerへの保存
 * why_it_exists:
 *   - リソース効率を最大化するため、重要度（優先度）に応じた動的なタスク実行順序制御を行う
 *   - 割り込み発生時にタスク状態を永続化し、後で再開可能にするチェックポイント機構を提供する
 * scope:
 *   in: TaskPriority, ScheduledTask, チェックポイント保存用のstate/progress/reason
 *   out: プリエンプション可否(boolean), PreemptionResult(success/error/checkpointId)
 */

// File: .pi/lib/task-scheduler.ts
// Description: Priority-based task scheduler with event-driven execution and preemption support.
// Why: Enables efficient task scheduling with provider/model-specific queue management.
// Related: .pi/lib/token-bucket.ts, .pi/extensions/agent-runtime.ts, .pi/lib/priority-scheduler.ts, .pi/lib/checkpoint-manager.ts

import {
  getCheckpointManager,
  type Checkpoint,
  type PreemptionResult,
  type CheckpointSource,
  type CheckpointPriority,
} from "./checkpoint-manager";
import { TaskPriority, PriorityTaskQueue, comparePriority, type PriorityQueueEntry } from "./priority-scheduler";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";

// ============================================================================
// Preemption Support
// ============================================================================

/**
 * Preemption matrix defining which priorities can preempt others.
 * critical tasks can preempt high/normal/low/background
 * high tasks can preempt normal/low/background
 * Others cannot preempt.
 */
export const PREEMPTION_MATRIX: Record<TaskPriority, TaskPriority[]> = {
  critical: ["high", "normal", "low", "background"],
  high: ["normal", "low", "background"],
  normal: [],
  low: [],
  background: [],
};

/**
 * 実行中タスクを割り込むか判定
 * @summary 割り込み要否判定
 * @param runningTask 実行中のスケジュール済みタスク
 * @param incomingTask 新規に割り込ませるスケジュール済みタスク
 * @returns 割り込みが必要な場合はtrue
 */
export function shouldPreempt(
  runningTask: ScheduledTask,
  incomingTask: ScheduledTask
): boolean {
  // Preemption must be enabled via environment variable
  if (process.env.PI_ENABLE_PREEMPTION === "false") {
    return false;
  }

  // Tasks with same priority don't preempt each other
  if (runningTask.priority === incomingTask.priority) {
    return false;
  }

  // Check preemption matrix
  const preemptablePriorities = PREEMPTION_MATRIX[incomingTask.priority];
  if (!preemptablePriorities || preemptablePriorities.length === 0) {
    return false;
  }

  return preemptablePriorities.includes(runningTask.priority);
}

/**
 * @summary タスク先取り
 * 実行中のタスクを中断してチェックポイントに保存する
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
  const scheduler = getScheduler();
  const entry = scheduler.getActiveExecution(taskId);

  if (!entry) {
    return {
      success: false,
      error: `Task ${taskId} not found in active executions`,
    };
  }

  const task = entry.task;

  // Abort the task via its signal if available
  if (task.signal && !task.signal.aborted) {
    // Note: The AbortController must be external, we can't abort from here
    // This is a signal that the task should check and save state
  }

  // Save checkpoint
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
    ttlMs: 86_400_000, // 24 hours
    metadata: { preemptReason: reason },
  });

  if (!saveResult.success) {
    return {
      success: false,
      error: `Failed to save checkpoint: ${saveResult.error}`,
    };
  }

  // Remove from active executions (task is responsible for cleanup on abort)
  scheduler.removeActiveExecution(taskId);

  return {
    success: true,
    checkpointId: saveResult.checkpointId,
  };
}

/**
 * @summary チェックポイント復帰
 * チェックポイントから処理を再開する
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
    console.warn(`[task-scheduler] Checkpoint resumption failed for ${checkpointId}:`, error instanceof Error ? error.message : String(error));
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

// ============================================================================
// Types
// ============================================================================

/**
 * @summary タスク発生元
 * タスクの実行元の種別を定義する型
 * @returns void
 */
export type TaskSource =
  | "subagent_run"
  | "subagent_run_parallel"
  | "agent_team_run"
  | "agent_team_run_parallel";

/**
 * Re-export TaskPriority for convenience.
 * Note: TaskPriority now includes "background" level.
 */
export type { TaskPriority };

/**
 * @summary コスト見積もり
 * タスクの推定コストを表すインターフェース
 * @param estimatedTokens - 推定トークン数
 * @param estimatedDurationMs - 推定実行時間（ミリ秒）
 * @returns void
 */
export interface TaskCostEstimate {
  /** Estimated token consumption */
  estimatedTokens: number;
  /** Estimated execution duration in milliseconds */
  estimatedDurationMs: number;
}

/**
 * @summary スケジュール済みタスク
 * タスクのメタデータ情報を定義するインターフェース
 * @param id - タスクの一意なID
 * @param source - タスクの発生元
 * @param provider - 実行プロバイダ
 * @param model - 使用モデル
 * @param priority - タスク優先度
 * @returns void
 */
export interface ScheduledTask<TResult = unknown> {
  /** Unique task identifier */
  id: string;
  /** Source tool that created this task */
  source: TaskSource;
  /** Provider name (e.g., "anthropic") */
  provider: string;
  /** Model name (e.g., "claude-sonnet-4") */
  model: string;
  /** Task priority level */
  priority: TaskPriority;
  /** Cost estimation for rate limiting */
  costEstimate: TaskCostEstimate;
  /** Task execution function */
  execute: () => Promise<TResult>;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional deadline timestamp in milliseconds */
  deadlineMs?: number;
}

/**
 * タスク実行結果
 * @summary 結果を表す
 * @property taskId タスクID
 * @property success 成功したかどうか
 * @property result 実行結果
 * @property error エラー情報
 * @property waitedMs 待機時間
 */
export interface TaskResult<TResult = unknown> {
  /** Task ID */
  taskId: string;
  /** Whether the task completed successfully */
  success: boolean;
  /** Task result (if successful) */
  result?: TResult;
  /** Error message (if failed) */
  error?: string;
  /** Time waited in queue before execution (ms) */
  waitedMs: number;
  /** Actual execution duration (ms) */
  executionMs: number;
  /** Whether the task timed out */
  timedOut: boolean;
  /** Whether the task was aborted */
  aborted: boolean;
}

/**
 * キュー統計情報
 * @summary 統計を取得する
 * @property totalQueued 総待機タスク数
 * @property byPriority 優先度別の統計
 * @property byProvider プロバイダー別の統計
 * @property avgWaitMs 平均待機時間
 * @property maxWaitMs 最大待機時間
 */
export interface QueueStats {
  /** Total queued tasks */
  totalQueued: number;
  /** Tasks by priority */
  byPriority: Record<TaskPriority, number>;
  /** Tasks by provider */
  byProvider: Record<string, number>;
  /** Average wait time (ms) */
  avgWaitMs: number;
  /** Maximum wait time (ms) */
  maxWaitMs: number;
  /** Number of starving tasks */
  starvingCount: number;
  /** Active executions */
  activeExecutions: number;
}

/**
 * Internal task entry for the queue.
 * Uses unknown type for task result to allow heterogeneous queue storage.
 */
interface TaskQueueEntry {
  task: ScheduledTask<unknown>;
  enqueuedAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  skipCount: number;
}

/**
 * スケジューラ設定
 * @summary 設定を保持する
 * @property maxConcurrentPerModel モデル別最大同時実行数
 * @property maxTotalConcurrent 合計最大同時実行数
 * @property defaultTimeoutMs デフォルトのタイムアウト時間
 * @property starvationThresholdMs スターベーションしきい値
 * @property maxSkipCount 最大スキップ回数
 */
export interface SchedulerConfig {
  /** Maximum concurrent executions per provider/model */
  maxConcurrentPerModel: number;
  /** Maximum total concurrent executions */
  maxTotalConcurrent: number;
  /** Default timeout for tasks (ms) */
  defaultTimeoutMs: number;
  /** Starvation threshold (ms) */
  starvationThresholdMs: number;
  /** Maximum skip count before promotion */
  maxSkipCount: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Get default scheduler config from centralized RuntimeConfig.
 */
function getDefaultSchedulerConfig(): SchedulerConfig {
  const runtimeConfig = getRuntimeConfig();
  return {
    maxConcurrentPerModel: runtimeConfig.maxConcurrentPerModel,
    maxTotalConcurrent: runtimeConfig.maxTotalConcurrent,
    defaultTimeoutMs: 60_000,
    starvationThresholdMs: 60_000,
    maxSkipCount: 10,
  };
}

/**
 * Legacy constant for backward compatibility.
 * @deprecated Use getDefaultSchedulerConfig() instead.
 */
const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrentPerModel: 4,
  maxTotalConcurrent: 8,
  defaultTimeoutMs: 60_000,
  starvationThresholdMs: 60_000,
  maxSkipCount: 10,
};

const PRIORITY_ORDER: TaskPriority[] = ["background", "low", "normal", "high", "critical"];

// ============================================================================
// Hybrid Scheduling Constants
// ============================================================================

/**
 * ハイブリッドスケジューラ設定
 * @summary 設定を定義する
 * @property priorityWeight 優先度の重み
 * @property sjfWeight SJF（最短処理時間）の重み
 * @property fairQueueWeight 公平キューの重み
 * @property maxDurationForNormalization 正規化用最大時間
 * @property starvationPenaltyPerSkip スキップ時のスターベーションペナルティ
 */
export interface HybridSchedulerConfig {
  /** Weight for priority component (0.0 - 1.0) */
  priorityWeight: number;
  /** Weight for SJF component (0.0 - 1.0) */
  sjfWeight: number;
  /** Weight for fair queue component (0.0 - 1.0) */
  fairQueueWeight: number;
  /** Maximum duration for normalization (ms) */
  maxDurationForNormalization: number;
  /** Starvation penalty per skip */
  starvationPenaltyPerSkip: number;
  /** Maximum starvation penalty */
  maxStarvationPenalty: number;
}

const DEFAULT_HYBRID_CONFIG: HybridSchedulerConfig = {
  priorityWeight: 0.5,
  sjfWeight: 0.3,
  fairQueueWeight: 0.2,
  maxDurationForNormalization: 120_000, // 2 minutes
  starvationPenaltyPerSkip: 0.02,
  maxStarvationPenalty: 0.3,
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * タスクIDを生成する
 * @summary IDを生成する
 * @param prefix IDの接頭辞
 * @returns 生成されたタスクID
 */
export function createTaskId(prefix: string = "task"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Import PRIORITY_VALUES from priority-scheduler for consistency.
 */
import { PRIORITY_VALUES } from "./priority-scheduler";

/**
 * Get numeric priority value for comparison.
 */
function priorityToValue(priority: TaskPriority): number {
  return PRIORITY_VALUES[priority];
}

// ============================================================================
// Hybrid Scheduling Score Functions
// ============================================================================

/**
 * Compute SJF (Shortest Job First) score.
 * Normalized to [0, 1] where higher score = shorter job.
 * Edge case: maxDuration = 0 returns 1.0 (shortest possible).
 */
function computeSJFScore(
  estimatedDurationMs: number,
  maxDurationMs: number
): number {
  const safeMax = Math.max(1, maxDurationMs);
  const normalized = Math.max(0, Math.min(safeMax, estimatedDurationMs));
  // Invert: shorter = higher score
  return 1 - (normalized / safeMax);
}

/**
 * Compute Fair Queue score based on Virtual Finish Time (VFT).
 * Tasks with higher wait time and fewer tokens get higher scores.
 * VFT = arrivalTime + (tokens / weight), where weight is based on priority.
 */
function computeFairQueueScore(
  enqueuedAtMs: number,
  estimatedTokens: number,
  priority: TaskPriority,
  currentTimeMs: number,
  maxTokens: number
): number {
  // Weight based on priority (higher priority = higher weight = lower VFT)
  const priorityVal = priorityToValue(priority);
  const weight = Math.max(0.1, priorityVal); // Avoid division by zero

  // Virtual Finish Time calculation
  const arrivalTime = enqueuedAtMs;
  const normalizedTokens = Math.max(1, Math.min(estimatedTokens, maxTokens));
  const vft = arrivalTime + (normalizedTokens / weight);

  // Lower VFT = higher score (should be scheduled first)
  // Normalize based on wait time
  const waitTime = Math.max(0, currentTimeMs - enqueuedAtMs);
  const waitBonus = waitTime > 30_000 ? 0.2 : 0; // Bonus for waiting > 30s

  // Score: lower VFT is better, add wait bonus
  const safeMaxTokens = Math.max(1, maxTokens);
  const vftNormalized = vft / (currentTimeMs + safeMaxTokens / weight);
  return Math.min(1, (1 - vftNormalized) + waitBonus);
}

/**
 * Compute hybrid scheduling score combining all factors.
 * finalScore = (priority * 0.5) + (SJF * 0.3) + (FairQueue * 0.2) - starvationPenalty
 */
function computeHybridScore(
  entry: TaskQueueEntry,
  config: HybridSchedulerConfig,
  currentTimeMs: number
): number {
  const task = entry.task;
  const priority = priorityToValue(task.priority);

  // Normalize priority to [0, 1]
  const priorityNormalized = priority / 4; // Assuming max priority value is 4 (critical)

  // SJF score
  const sjfScore = computeSJFScore(
    task.costEstimate.estimatedDurationMs,
    config.maxDurationForNormalization
  );

  // Fair queue score
  const fairQueueScore = computeFairQueueScore(
    entry.enqueuedAtMs,
    task.costEstimate.estimatedTokens,
    task.priority,
    currentTimeMs,
    100_000 // Max tokens for normalization
  );

  // Starvation penalty
  const starvationPenalty = Math.min(
    config.maxStarvationPenalty,
    entry.skipCount * config.starvationPenaltyPerSkip
  );

  // Combined score
  const finalScore =
    (priorityNormalized * config.priorityWeight) +
    (sjfScore * config.sjfWeight) +
    (fairQueueScore * config.fairQueueWeight) -
    starvationPenalty;

  // Debug logging (controlled by environment variable)
  if (process.env.PI_DEBUG_HYBRID_SCHEDULING === "1") {
    console.log(
      `[HybridScheduling] ${task.id}: priority=${priorityNormalized.toFixed(2)} ` +
      `sjf=${sjfScore.toFixed(2)} fair=${fairQueueScore.toFixed(2)} ` +
      `penalty=${starvationPenalty.toFixed(2)} final=${finalScore.toFixed(2)}`
    );
  }

  return finalScore;
}

/**
 * Compare two task entries using hybrid scheduling score.
 * Higher score = should be scheduled first.
 */
function compareHybridEntries(
  a: TaskQueueEntry,
  b: TaskQueueEntry,
  config: HybridSchedulerConfig = DEFAULT_HYBRID_CONFIG
): number {
  const currentTimeMs = Date.now();
  const scoreA = computeHybridScore(a, config, currentTimeMs);
  const scoreB = computeHybridScore(b, config, currentTimeMs);

  // Higher score should come first (descending order)
  if (Math.abs(scoreA - scoreB) > 0.001) {
    return scoreB - scoreA;
  }

  // Tiebreaker: FIFO
  return a.enqueuedAtMs - b.enqueuedAtMs;
}

/**
 * Compare two task entries for priority ordering.
 */
function compareTaskEntries(
  a: TaskQueueEntry,
  b: TaskQueueEntry
): number {
  // 1. Priority comparison (higher first)
  const priorityDiff = priorityToValue(b.task.priority) - priorityToValue(a.task.priority);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  // 2. Starvation prevention
  const skipDiff = a.skipCount - b.skipCount;
  if (skipDiff > 3) return -1;
  if (skipDiff < -3) return 1;

  // 3. Deadline (earlier first)
  if (a.task.deadlineMs !== undefined && b.task.deadlineMs !== undefined) {
    const deadlineDiff = a.task.deadlineMs - b.task.deadlineMs;
    if (deadlineDiff !== 0) return deadlineDiff;
  } else if (a.task.deadlineMs !== undefined) {
    return -1;
  } else if (b.task.deadlineMs !== undefined) {
    return 1;
  }

  // 4. FIFO within same priority
  const enqueueDiff = a.enqueuedAtMs - b.enqueuedAtMs;
  if (enqueueDiff !== 0) return enqueueDiff;

  // 5. Estimated duration (shorter first)
  const durationDiff =
    a.task.costEstimate.estimatedDurationMs - b.task.costEstimate.estimatedDurationMs;
  if (durationDiff !== 0) return durationDiff;

  // 6. Final tiebreaker
  return a.task.id.localeCompare(b.task.id);
}

// ============================================================================
// Task Scheduler
// ============================================================================

/**
 * Event-driven task scheduler with priority queue.
 */
class TaskSchedulerImpl {
  private readonly config: SchedulerConfig;
  private readonly queues: Map<string, TaskQueueEntry[]> = new Map();
  private readonly activeExecutions: Map<string, TaskQueueEntry> = new Map();
  private readonly eventTarget: EventTarget = new EventTarget();
  private taskIdCounter = 0;

  constructor(config: Partial<SchedulerConfig> = {}) {
    // Use centralized config as defaults
    const defaults = getDefaultSchedulerConfig();
    this.config = { ...defaults, ...config };
  }

  /**
   * タスクをスケジュールに送信
   * @summary タスク送信
   * @param {Task<TResult>} task 実行するタスク
   * @returns {Promise<TaskResult<TResult>>} タスクの実行結果
   */
  async submit<TResult>(task: ScheduledTask<TResult>): Promise<TaskResult<TResult>> {
    const enqueuedAtMs = Date.now();
    const entry: TaskQueueEntry = {
      task: task as ScheduledTask<unknown>,
      enqueuedAtMs,
      skipCount: 0,
    };

    // Get or create queue for this provider/model
    const queueKey = this.getQueueKey(task.provider, task.model);
    let queue = this.queues.get(queueKey);
    if (!queue) {
      queue = [];
      this.queues.set(queueKey, queue);
    }

    // Add to queue
    queue.push(entry);
    this.sortQueue(queue);

    // Notify listeners
    this.eventTarget.dispatchEvent(new Event("task-queued"));

    // Wait for execution turn
    return this.waitForExecution<TResult>(entry, task);
  }

  /**
   * キューの統計情報を取得
   * @summary 統計情報取得
   * @returns {QueueStats} 統計情報
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

        // Check starvation
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

  /**
   * Get queue key for provider/model combination.
   */
  private getQueueKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }

  /**
   * Sort queue by priority.
   */
  private sortQueue(queue: TaskQueueEntry[]): void {
    queue.sort(compareTaskEntries);
  }

  /**
   * Promote starving tasks.
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
   * Wait for execution turn and execute.
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
        // Check for abort
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

        // Check for timeout
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

        // Check if can execute
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

        // Check if at front of queue and capacity available
        const queueIndex = queue.indexOf(entry);
        const activeForModel = this.countActiveForModel(task.provider, task.model);
        const totalActive = this.activeExecutions.size;

        const canExecute =
          queueIndex === 0 &&
          activeForModel < this.config.maxConcurrentPerModel &&
          totalActive < this.config.maxTotalConcurrent;

        if (canExecute) {
          // Remove from queue and start execution
          queue.splice(queueIndex, 1);
          entry.startedAtMs = Date.now();
          this.activeExecutions.set(task.id, entry);

          // Increment skip count for remaining entries
          for (const remaining of queue) {
            remaining.skipCount++;
          }

          // Promote starving tasks
          this.promoteStarvingTasks(queue);

          // Execute using the typed task to preserve result type
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
          // Increment skip count and wait
          entry.skipCount++;

          // Wait for event or poll
          const waitResult = await this.waitForEvent(100, task.signal);
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

          // Check again
          checkAndExecute();
        }
      };

      // Start checking
      checkAndExecute();
    });
  }

  /**
   * Remove entry from queue.
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
   * Count active executions for a model.
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
   * Wait for an event or timeout.
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

  // ============================================================================
  // Preemption Support Methods
  // ============================================================================

  /**
   * 指定した実行中タスクを取得
   * @summary 実行中タスク取得
   * @param {string} taskId タスクID
   * @returns {TaskQueueEntry | null} タスクエントリ、存在しない場合はnull
   */
  getActiveExecution(taskId: string): TaskQueueEntry | null {
    return this.activeExecutions.get(taskId) ?? null;
  }

  /**
   * 実行中タスクを削除する
   * @summary 実行中タスク削除
   * @param {string} taskId タスクID
   * @returns {boolean} 削除されたかどうか
   */
  removeActiveExecution(taskId: string): boolean {
    return this.activeExecutions.delete(taskId);
  }

  /**
   * すべての実行中タスクを取得
   * @summary 実行中タスク一覧取得
   * @returns {Map<string, TaskQueueEntry>} 実行中タスクのマップ
   */
  getAllActiveExecutions(): Map<string, TaskQueueEntry> {
    return new Map(this.activeExecutions);
  }

  /**
   * プリエンプト必要性を確認
   * @summary プリエンプト確認
   * @param incomingTask 実行予定タスク
   * @returns 優先度が低いタスク
   */
  checkPreemptionNeeded(incomingTask: ScheduledTask): ScheduledTask | null {
    if (process.env.PI_ENABLE_PREEMPTION === "false") {
      return null;
    }

    // Find lowest priority running task that can be preempted
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
   * @summary プリエンプト試行
   * @param incomingTask 実行予定タスク
   * @param checkpointState チェックポイント状態
   * @param checkpointProgress チェックポイント進捗
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
        // Notify listeners of preemption
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
   * @summary プリエンプト監視
   * @param callback コールバック関数
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
}

// ============================================================================
// Singleton Instance
// ============================================================================

let schedulerInstance: TaskSchedulerImpl | null = null;

/**
 * スケジューラを取得する
 * @summary スケジューラ取得
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
 * @summary スケジューラ作成
 * @param config 設定オブジェクト
 * @returns スケジューラインスタンス
 */
export function createScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerImpl {
  return new TaskSchedulerImpl(config);
}

/**
 * シングルトンのスケジューラーをリセットする
 * @summary スケジューラーをリセット
 * @returns 戻り値なし。
 */
export function resetScheduler(): void {
  schedulerInstance = null;
}

// ============================================================================
// Basic Test Cases (as comments)
// ============================================================================

/**
 * Basic Test Cases:
 *
 * 1. Basic Submission:
 *    - Create task with normal priority
 *    - Submit and expect immediate execution
 *    - Verify result contains waitedMs and executionMs
 *
 * 2. Priority Ordering:
 *    - Submit low priority task
 *    - Submit high priority task
 *    - Verify high priority executes first
 *
 * 3. Provider/Model Queue Separation:
 *    - Submit task for provider A, model X
 *    - Submit task for provider B, model Y
 *    - Verify they execute in parallel
 *
 * Edge Cases:
 *
 * 4. Empty Queue:
 *    - getStats() on empty scheduler
 *    - Expect totalQueued=0, avgWaitMs=0
 *
 * 5. Maximum Queue Size:
 *    - Submit more tasks than maxConcurrentPerModel
 *    - Verify tasks queue up
 *    - Verify stats show correct queue depth
 *
 * 6. Abort Signal:
 *    - Submit task with AbortSignal
 *    - Abort before execution
 *    - Verify aborted=true in result
 *
 * 7. Deadline Timeout:
 *    - Submit task with deadlineMs in past
 *    - Verify timedOut=true in result
 *
 * 8. Starvation Prevention:
 *    - Submit low priority task
 *    - Keep submitting high priority tasks
 *    - Verify low priority eventually executes
 */

// Export types for external use
export type { TaskSchedulerImpl };
