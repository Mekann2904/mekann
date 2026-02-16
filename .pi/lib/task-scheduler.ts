// File: .pi/lib/task-scheduler.ts
// Description: Priority-based task scheduler with event-driven execution.
// Why: Enables efficient task scheduling with provider/model-specific queue management.
// Related: .pi/lib/token-bucket.ts, .pi/extensions/agent-runtime.ts, .pi/lib/priority-scheduler.ts

import { TaskPriority, PriorityTaskQueue, comparePriority, type PriorityQueueEntry } from "./priority-scheduler";

// ============================================================================
// Types
// ============================================================================

/**
 * Source type for scheduled tasks.
 * Identifies which tool created this task.
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
 * Cost estimate for a scheduled task.
 */
export interface TaskCostEstimate {
  /** Estimated token consumption */
  estimatedTokens: number;
  /** Estimated execution duration in milliseconds */
  estimatedDurationMs: number;
}

/**
 * Scheduled task interface.
 * Represents a task to be executed with priority and rate limiting.
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
 * Result of a scheduled task execution.
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
 * Queue statistics for monitoring.
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
 * Scheduler configuration.
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

const DEFAULT_CONFIG: SchedulerConfig = {
  maxConcurrentPerModel: 4,
  maxTotalConcurrent: 8,
  defaultTimeoutMs: 60_000,
  starvationThresholdMs: 60_000,
  maxSkipCount: 10,
};

const PRIORITY_ORDER: TaskPriority[] = ["background", "low", "normal", "high", "critical"];

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create a unique task ID.
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
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Submit a task for execution.
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
   * Get current queue statistics.
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
}

// ============================================================================
// Singleton Instance
// ============================================================================

let schedulerInstance: TaskSchedulerImpl | null = null;

/**
 * Get the singleton scheduler instance.
 */
export function getScheduler(): TaskSchedulerImpl {
  if (!schedulerInstance) {
    schedulerInstance = new TaskSchedulerImpl();
  }
  return schedulerInstance;
}

/**
 * Create a new scheduler with custom config.
 */
export function createScheduler(config?: Partial<SchedulerConfig>): TaskSchedulerImpl {
  return new TaskSchedulerImpl(config);
}

/**
 * Reset the singleton scheduler (for testing).
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
