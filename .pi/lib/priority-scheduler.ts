// File: .pi/lib/priority-scheduler.ts
// Description: Priority-based task scheduling utilities.
// Why: Enables priority-aware scheduling for subagents and agent teams.
// Related: .pi/extensions/agent-runtime.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

/**
 * Task priority levels for scheduling.
 * Higher priority tasks are scheduled before lower priority tasks.
 * "background" is the lowest priority for non-urgent tasks.
 */
export type TaskPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * Priority weights for Weighted Fair Queuing (WFQ).
 * Higher values = more scheduling weight = more frequent execution.
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 100,
  high: 50,
  normal: 25,
  low: 10,
  background: 5,
};

/**
 * Priority numeric values for comparison.
 * Higher values = higher priority = scheduled first.
 */
export const PRIORITY_VALUES: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
  background: 0,
};

/**
 * Task metadata for priority scheduling.
 */
export interface PriorityTaskMetadata {
  /** Task identifier */
  id: string;
  /** Tool name that created this task */
  toolName: string;
  /** Task priority level */
  priority: TaskPriority;
  /** Estimated execution time in milliseconds (optional) */
  estimatedDurationMs?: number;
  /** Estimated tool call rounds from agent-estimation (optional) */
  estimatedRounds?: number;
  /** Deadline timestamp in milliseconds (optional) */
  deadlineMs?: number;
  /** Time when task was enqueued */
  enqueuedAtMs: number;
  /** Source context (user-interactive, background, etc.) */
  source?: "user-interactive" | "background" | "scheduled" | "retry";
}

/**
 * Priority queue entry with scheduling metadata.
 */
export interface PriorityQueueEntry extends PriorityTaskMetadata {
  /** Virtual start time for WFQ scheduling */
  virtualStartTime: number;
  /** Virtual finish time for WFQ scheduling */
  virtualFinishTime: number;
  /** Number of times this task has been skipped (starvation detection) */
  skipCount: number;
  /** Time since last consideration for scheduling */
  lastConsideredMs?: number;
}

/**
 * Infer task priority from tool name and context.
 *
 * Priority inference rules:
 * - question: critical (user is waiting for response)
 * - subagent_run_parallel with multiple agents: high
 * - subagent_run: high
 * - read/bash/edit: normal
 * - Retries: low
 * - Background tasks: background
 *
 * @param toolName - Name of the tool being called
 * @param context - Optional context hints
 * @returns Inferred priority level
 */
export function inferPriority(
  toolName: string,
  context?: {
    isInteractive?: boolean;
    isRetry?: boolean;
    isBackground?: boolean;
    agentCount?: number;
  }
): TaskPriority {
  // User interactive tools are always critical
  if (toolName === "question") {
    return "critical";
  }

  // Context-based inference
  if (context?.isInteractive) {
    return "high";
  }

  if (context?.isBackground) {
    return "background";
  }

  if (context?.isRetry) {
    return "low";
  }

  // Tool-based inference
  const lowerToolName = toolName.toLowerCase();

  // Subagent execution
  if (lowerToolName.includes("subagent_run")) {
    // Parallel execution with multiple agents gets high priority
    if (context?.agentCount && context.agentCount > 1) {
      return "high";
    }
    return "high";
  }

  // Agent team execution
  if (lowerToolName.includes("agent_team")) {
    return "high";
  }

  // Core file operations
  if (["read", "bash", "edit", "write"].includes(lowerToolName)) {
    return "normal";
  }

  // Planning tools
  if (lowerToolName.startsWith("plan_")) {
    return "normal";
  }

  // FSA/RSA tools
  if (lowerToolName.includes("rsa") || lowerToolName.includes("loop")) {
    return "normal";
  }

  // Default to normal
  return "normal";
}

/**
 * Compare two tasks for priority ordering.
 * Returns negative if a should come before b, positive if b before a.
 *
 * Comparison order:
 * 1. Priority value (higher first)
 * 2. Deadline (earlier first, if both have deadlines)
 * 3. Enqueue time (earlier first, FIFO within same priority)
 * 4. Estimated duration (shorter first, for SRT optimization)
 *
 * @param a - First task entry
 * @param b - Second task entry
 * @returns Comparison result
 */
export function comparePriority(a: PriorityQueueEntry, b: PriorityQueueEntry): number {
  // 1. Priority comparison (higher value = higher priority)
  const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  // 2. Starvation prevention: if a task has been skipped many times, boost it
  const skipDiff = a.skipCount - b.skipCount;
  if (skipDiff > 3) {
    return -1; // a has been skipped more, prioritize it
  }
  if (skipDiff < -3) {
    return 1; // b has been skipped more, prioritize it
  }

  // 3. Deadline comparison (earlier deadline first)
  if (a.deadlineMs !== undefined && b.deadlineMs !== undefined) {
    const deadlineDiff = a.deadlineMs - b.deadlineMs;
    if (deadlineDiff !== 0) {
      return deadlineDiff;
    }
  } else if (a.deadlineMs !== undefined) {
    return -1; // a has deadline, prioritize it
  } else if (b.deadlineMs !== undefined) {
    return 1; // b has deadline, prioritize it
  }

  // 4. Enqueue time (FIFO within same priority)
  const enqueueDiff = a.enqueuedAtMs - b.enqueuedAtMs;
  if (enqueueDiff !== 0) {
    return enqueueDiff;
  }

  // 5. Estimated duration (shorter first, for SRT optimization)
  if (a.estimatedDurationMs !== undefined && b.estimatedDurationMs !== undefined) {
    return a.estimatedDurationMs - b.estimatedDurationMs;
  }

  // 6. Final tiebreaker by ID for stability
  return a.id.localeCompare(b.id);
}

/**
 * Priority queue with WFQ-style scheduling.
 */
export class PriorityTaskQueue {
  private entries: PriorityQueueEntry[] = [];
  private virtualTime: number = 0;
  private maxSkipCount: number = 10;
  private starvationThresholdMs: number = 60_000; // 1 minute

  /**
   * Add a task to the priority queue.
   */
  enqueue(metadata: PriorityTaskMetadata): PriorityQueueEntry {
    const weight = PRIORITY_WEIGHTS[metadata.priority];

    const entry: PriorityQueueEntry = {
      ...metadata,
      virtualStartTime: Math.max(this.virtualTime, this.getQueueVirtualTime()),
      virtualFinishTime: 0, // Will be calculated below
      skipCount: 0,
    };

    // Calculate virtual finish time based on estimated duration or weight
    const serviceTime = metadata.estimatedDurationMs ?? 1000; // Default 1 second
    entry.virtualFinishTime = entry.virtualStartTime + serviceTime / weight;

    this.entries.push(entry);
    this.sort();

    return entry;
  }

  /**
   * Remove and return the highest priority task.
   */
  dequeue(): PriorityQueueEntry | undefined {
    if (this.entries.length === 0) {
      return undefined;
    }

    // Get the highest priority task
    const entry = this.entries.shift();

    if (entry) {
      // Update virtual time
      this.virtualTime = Math.max(this.virtualTime, entry.virtualFinishTime);

      // Increment skip count for remaining entries (starvation tracking)
      for (const remaining of this.entries) {
        remaining.skipCount++;
      }
    }

    return entry;
  }

  /**
   * Peek at the highest priority task without removing it.
   */
  peek(): PriorityQueueEntry | undefined {
    return this.entries[0];
  }

  /**
   * Remove a specific task by ID.
   */
  remove(id: string): PriorityQueueEntry | undefined {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index < 0) {
      return undefined;
    }
    const [removed] = this.entries.splice(index, 1);
    return removed;
  }

  /**
   * Get the current queue length.
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Check if the queue is empty.
   */
  get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /**
   * Get all entries (for debugging/monitoring).
   */
  getAll(): PriorityQueueEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by priority level.
   */
  getByPriority(priority: TaskPriority): PriorityQueueEntry[] {
    return this.entries.filter((e) => e.priority === priority);
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    total: number;
    byPriority: Record<TaskPriority, number>;
    avgWaitMs: number;
    maxWaitMs: number;
    starvingCount: number;
  } {
    const now = Date.now();
    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
      background: 0,
    };

    let totalWait = 0;
    let maxWait = 0;
    let starvingCount = 0;

    for (const entry of this.entries) {
      byPriority[entry.priority]++;
      const waitMs = now - entry.enqueuedAtMs;
      totalWait += waitMs;
      maxWait = Math.max(maxWait, waitMs);

      // Starvation detection: skipped more than threshold or waiting too long
      if (entry.skipCount > this.maxSkipCount || waitMs > this.starvationThresholdMs) {
        starvingCount++;
      }
    }

    return {
      total: this.entries.length,
      byPriority,
      avgWaitMs: this.entries.length > 0 ? totalWait / this.entries.length : 0,
      maxWaitMs: maxWait,
      starvingCount,
    };
  }

  /**
   * Promote starving tasks to prevent starvation.
   */
  promoteStarvingTasks(): number {
    const now = Date.now();
    let promoted = 0;

    for (const entry of this.entries) {
      const waitMs = now - entry.enqueuedAtMs;

      // Promote tasks that have been waiting too long or skipped too many times
      if (entry.skipCount > this.maxSkipCount || waitMs > this.starvationThresholdMs) {
        if (entry.priority !== "critical") {
          const priorityOrder: TaskPriority[] = ["background", "low", "normal", "high", "critical"];
          const currentIndex = priorityOrder.indexOf(entry.priority);
          if (currentIndex < priorityOrder.length - 1) {
            entry.priority = priorityOrder[currentIndex + 1];
            entry.skipCount = 0; // Reset skip count
            promoted++;
          }
        }
      }
    }

    if (promoted > 0) {
      this.sort();
    }

    return promoted;
  }

  /**
   * Sort entries by priority.
   */
  private sort(): void {
    this.entries.sort(comparePriority);
  }

  /**
   * Get the virtual time of the queue.
   */
  private getQueueVirtualTime(): number {
    if (this.entries.length === 0) {
      return this.virtualTime;
    }
    return Math.max(this.virtualTime, this.entries[0].virtualStartTime);
  }
}

/**
 * Create a formatted status string for priority queue stats.
 */
export function formatPriorityQueueStats(stats: ReturnType<PriorityTaskQueue["getStats"]>): string {
  const lines: string[] = [];
  lines.push(`Priority Queue Stats:`);
  lines.push(`  Total: ${stats.total}`);
  lines.push(`  By Priority:`);
  lines.push(`    critical: ${stats.byPriority.critical}`);
  lines.push(`    high: ${stats.byPriority.high}`);
  lines.push(`    normal: ${stats.byPriority.normal}`);
  lines.push(`    low: ${stats.byPriority.low}`);
  lines.push(`    background: ${stats.byPriority.background}`);
  lines.push(`  Wait Time:`);
  lines.push(`    avg: ${Math.round(stats.avgWaitMs)}ms`);
  lines.push(`    max: ${Math.round(stats.maxWaitMs)}ms`);
  lines.push(`  Starvation:`);
  lines.push(`    starving: ${stats.starvingCount}`);

  return lines.join("\n");
}
