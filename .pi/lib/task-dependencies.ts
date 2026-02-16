// File: .pi/lib/task-dependencies.ts
// Description: Task dependency graph for DAG-based task scheduling.
// Why: Enables dependency-aware scheduling where tasks can wait for other tasks to complete.
// Related: .pi/lib/priority-scheduler.ts, .pi/extensions/agent-runtime.ts

/**
 * Task status in the dependency graph.
 */
export type TaskDependencyStatus = "pending" | "ready" | "running" | "completed" | "failed" | "cancelled";

/**
 * Task node in the dependency graph.
 */
export interface TaskDependencyNode {
  /** Unique task identifier */
  id: string;
  /** Task name for display purposes */
  name?: string;
  /** Current status */
  status: TaskDependencyStatus;
  /** Set of task IDs that must complete before this task can run */
  dependencies: Set<string>;
  /** Set of task IDs that depend on this task */
  dependents: Set<string>;
  /** Timestamp when task was added */
  addedAt: number;
  /** Timestamp when task started running */
  startedAt?: number;
  /** Timestamp when task completed */
  completedAt?: number;
  /** Error if task failed */
  error?: Error;
  /** Priority for scheduling */
  priority?: "critical" | "high" | "normal" | "low";
  /** Estimated duration in milliseconds */
  estimatedDurationMs?: number;
}

/**
 * Options for adding a task to the graph.
 */
export interface AddTaskOptions {
  /** Task name for display */
  name?: string;
  /** Task IDs that must complete first */
  dependencies?: string[];
  /** Priority for scheduling */
  priority?: "critical" | "high" | "normal" | "low";
  /** Estimated duration */
  estimatedDurationMs?: number;
}

/**
 * Result of cycle detection.
 */
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath: string[] | null;
}

/**
 * Task dependency graph with cycle detection and topological sorting.
 */
export class TaskDependencyGraph {
  private nodes: Map<string, TaskDependencyNode> = new Map();
  private readyQueue: string[] = [];

  /**
   * Add a task to the dependency graph.
   *
   * @param id - Unique task identifier
   * @param options - Task options including dependencies
   * @returns The created task node
   * @throws Error if task already exists or dependency doesn't exist
   */
  addTask(id: string, options: AddTaskOptions = {}): TaskDependencyNode {
    if (this.nodes.has(id)) {
      throw new Error(`Task with id "${id}" already exists`);
    }

    const { dependencies = [], name, priority, estimatedDurationMs } = options;

    // Validate dependencies exist
    for (const depId of dependencies) {
      if (!this.nodes.has(depId)) {
        throw new Error(`Dependency task "${depId}" does not exist`);
      }
    }

    // Create the node
    const node: TaskDependencyNode = {
      id,
      name: name ?? id,
      status: "pending",
      dependencies: new Set(dependencies),
      dependents: new Set(),
      addedAt: Date.now(),
      priority,
      estimatedDurationMs,
    };

    // Update dependents
    for (const depId of Array.from(dependencies)) {
      const depNode = this.nodes.get(depId)!;
      depNode.dependents.add(id);
    }

    this.nodes.set(id, node);

    // Check if task is immediately ready
    if (this.isTaskReady(id)) {
      node.status = "ready";
      this.readyQueue.push(id);
    }

    return node;
  }

  /**
   * Remove a task from the graph.
   *
   * @param id - Task ID to remove
   * @returns True if task was removed
   */
  removeTask(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }

    // Cannot remove if task is running
    if (node.status === "running") {
      throw new Error(`Cannot remove running task "${id}"`);
    }

    // Remove from dependencies
    for (const depId of Array.from(node.dependencies)) {
      const depNode = this.nodes.get(depId);
      depNode?.dependents.delete(id);
    }

    // Update dependents (remove this task from their dependencies)
    for (const depOfId of Array.from(node.dependents)) {
      const depOfNode = this.nodes.get(depOfId);
      depOfNode?.dependencies.delete(id);
    }

    // Remove from ready queue
    const readyIndex = this.readyQueue.indexOf(id);
    if (readyIndex >= 0) {
      this.readyQueue.splice(readyIndex, 1);
    }

    this.nodes.delete(id);
    return true;
  }

  /**
   * Check if a task exists.
   */
  hasTask(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Get a task by ID.
   */
  getTask(id: string): TaskDependencyNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all tasks.
   */
  getAllTasks(): TaskDependencyNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Check if a task is ready to run (all dependencies completed).
   */
  isTaskReady(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }

    for (const depId of Array.from(node.dependencies)) {
      const depNode = this.nodes.get(depId);
      if (!depNode || depNode.status !== "completed") {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all tasks that are ready to run.
   */
  getReadyTasks(): TaskDependencyNode[] {
    return this.readyQueue
      .map((id) => this.nodes.get(id))
      .filter((node): node is TaskDependencyNode => node?.status === "ready");
  }

  /**
   * Get ready task IDs.
   */
  getReadyTaskIds(): string[] {
    return [...this.readyQueue];
  }

  /**
   * Mark a task as running.
   */
  markRunning(id: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Task "${id}" does not exist`);
    }

    if (node.status !== "ready") {
      throw new Error(`Task "${id}" is not ready (status: ${node.status})`);
    }

    node.status = "running";
    node.startedAt = Date.now();

    // Remove from ready queue
    const index = this.readyQueue.indexOf(id);
    if (index >= 0) {
      this.readyQueue.splice(index, 1);
    }
  }

  /**
   * Mark a task as completed.
   */
  markCompleted(id: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Task "${id}" does not exist`);
    }

    node.status = "completed";
    node.completedAt = Date.now();

    // Update dependents - check if any are now ready
    for (const depOfId of Array.from(node.dependents)) {
      const depOfNode = this.nodes.get(depOfId);
      if (depOfNode && depOfNode.status === "pending" && this.isTaskReady(depOfId)) {
        depOfNode.status = "ready";
        if (!this.readyQueue.includes(depOfId)) {
          this.readyQueue.push(depOfId);
        }
      }
    }
  }

  /**
   * Mark a task as failed.
   */
  markFailed(id: string, error?: Error): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Task "${id}" does not exist`);
    }

    node.status = "failed";
    node.completedAt = Date.now();
    node.error = error;

    // Remove from ready queue if present
    const index = this.readyQueue.indexOf(id);
    if (index >= 0) {
      this.readyQueue.splice(index, 1);
    }

    // Mark all dependents as failed (propagate failure)
    for (const depOfId of Array.from(node.dependents)) {
      const depOfNode = this.nodes.get(depOfId);
      if (depOfNode && (depOfNode.status === "pending" || depOfNode.status === "ready")) {
        this.markFailed(depOfId, new Error(`Dependency "${id}" failed`));
      }
    }
  }

  /**
   * Mark a task as cancelled.
   */
  markCancelled(id: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Task "${id}" does not exist`);
    }

    node.status = "cancelled";
    node.completedAt = Date.now();

    // Remove from ready queue
    const index = this.readyQueue.indexOf(id);
    if (index >= 0) {
      this.readyQueue.splice(index, 1);
    }

    // Mark all dependents as cancelled
    for (const depOfId of Array.from(node.dependents)) {
      const depOfNode = this.nodes.get(depOfId);
      if (depOfNode && (depOfNode.status === "pending" || depOfNode.status === "ready")) {
        this.markCancelled(depOfId);
      }
    }
  }

  /**
   * Detect if there are any cycles in the graph.
   * Uses DFS with coloring (white/gray/black).
   */
  detectCycle(): CycleDetectionResult {
    const WHITE = 0; // Not visited
    const GRAY = 1; // Currently visiting (in recursion stack)
    const BLACK = 2; // Fully processed

    const colors = new Map<string, number>();
    const parents = new Map<string, string | null>();

    // Initialize all nodes as white
    for (const id of Array.from(this.nodes.keys())) {
      colors.set(id, WHITE);
      parents.set(id, null);
    }

    // DFS function
    const dfs = (nodeId: string): string[] | null => {
      colors.set(nodeId, GRAY);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of Array.from(node.dependencies)) {
          const color = colors.get(depId);

          if (color === GRAY) {
            // Back edge found - cycle detected
            // Reconstruct cycle path
            const cyclePath: string[] = [depId, nodeId];
            let current = parents.get(nodeId);
            while (current && current !== depId) {
              cyclePath.unshift(current);
              current = parents.get(current);
            }
            return cyclePath;
          }

          if (color === WHITE) {
            parents.set(depId, nodeId);
            const result = dfs(depId);
            if (result) {
              return result;
            }
          }
        }
      }

      colors.set(nodeId, BLACK);
      return null;
    };

    // Run DFS from all unvisited nodes
    for (const id of Array.from(this.nodes.keys())) {
      if (colors.get(id) === WHITE) {
        const result = dfs(id);
        if (result) {
          return { hasCycle: true, cyclePath: result };
        }
      }
    }

    return { hasCycle: false, cyclePath: null };
  }

  /**
   * Get topological order of all tasks.
   * Returns null if graph has cycles.
   */
  getTopologicalOrder(): string[] | null {
    if (this.detectCycle().hasCycle) {
      return null;
    }

    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) {
        return;
      }
      visited.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of Array.from(node.dependencies)) {
          visit(depId);
        }
      }

      result.push(nodeId);
    };

    for (const id of Array.from(this.nodes.keys())) {
      visit(id);
    }

    return result;
  }

  /**
   * Get statistics about the graph.
   */
  getStats(): {
    total: number;
    byStatus: Record<TaskDependencyStatus, number>;
    readyCount: number;
    blockedCount: number;
    completedCount: number;
    failedCount: number;
    maxDepth: number;
  } {
    const byStatus: Record<TaskDependencyStatus, number> = {
      pending: 0,
      ready: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const node of Array.from(this.nodes.values())) {
      byStatus[node.status]++;
    }

    // Calculate max depth using DFS
    const depths = new Map<string, number>();
    const getDepth = (id: string): number => {
      if (depths.has(id)) {
        return depths.get(id)!;
      }

      const node = this.nodes.get(id);
      if (!node || node.dependencies.size === 0) {
        depths.set(id, 0);
        return 0;
      }

      let maxDepDepth = 0;
      for (const depId of Array.from(node.dependencies)) {
        maxDepDepth = Math.max(maxDepDepth, getDepth(depId));
      }

      const depth = maxDepDepth + 1;
      depths.set(id, depth);
      return depth;
    };

    let maxDepth = 0;
    for (const id of Array.from(this.nodes.keys())) {
      maxDepth = Math.max(maxDepth, getDepth(id));
    }

    return {
      total: this.nodes.size,
      byStatus,
      readyCount: byStatus.ready,
      blockedCount: byStatus.pending,
      completedCount: byStatus.completed,
      failedCount: byStatus.failed,
      maxDepth,
    };
  }

  /**
   * Clear all tasks from the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.readyQueue = [];
  }

  /**
   * Export graph as a simple object for serialization.
   */
  export(): {
    tasks: Array<{
      id: string;
      name?: string;
      status: TaskDependencyStatus;
      dependencies: string[];
      priority?: string;
    }>;
  } {
    const tasks = Array.from(this.nodes.values()).map((node) => ({
      id: node.id,
      name: node.name,
      status: node.status,
      dependencies: Array.from(node.dependencies),
      priority: node.priority,
    }));

    return { tasks };
  }

  /**
   * Import graph from exported data.
   */
  import(data: { tasks: Array<{ id: string; name?: string; dependencies?: string[]; priority?: string }> }): void {
    this.clear();

    // Add tasks in order (dependencies first)
    const added = new Set<string>();
    const pending = [...data.tasks];

    while (pending.length > 0) {
      let addedAny = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const task = pending[i];
        const deps = task.dependencies ?? [];

        // Check if all dependencies are added
        if (deps.every((d) => added.has(d))) {
          this.addTask(task.id, {
            name: task.name,
            dependencies: deps,
            priority: task.priority as "critical" | "high" | "normal" | "low" | undefined,
          });
          added.add(task.id);
          pending.splice(i, 1);
          addedAny = true;
        }
      }

      if (!addedAny && pending.length > 0) {
        // Cycle detected or missing dependencies
        throw new Error(`Cannot import graph: cycle or missing dependencies detected`);
      }
    }
  }
}

/**
 * Format dependency graph stats for display.
 */
export function formatDependencyGraphStats(stats: ReturnType<TaskDependencyGraph["getStats"]>): string {
  const lines: string[] = [];
  lines.push(`Dependency Graph Stats:`);
  lines.push(`  Total tasks: ${stats.total}`);
  lines.push(`  By status:`);
  lines.push(`    pending: ${stats.byStatus.pending}`);
  lines.push(`    ready: ${stats.byStatus.ready}`);
  lines.push(`    running: ${stats.byStatus.running}`);
  lines.push(`    completed: ${stats.byStatus.completed}`);
  lines.push(`    failed: ${stats.byStatus.failed}`);
  lines.push(`    cancelled: ${stats.byStatus.cancelled}`);
  lines.push(`  Max depth: ${stats.maxDepth}`);
  return lines.join("\n");
}
