/**
 * @abdd.meta
 * path: .pi/lib/task-dependencies.ts
 * role: タスク依存関係グラフの管理とDAGベースのタスクスケジューリング基盤
 * why: タスク間の依存関係を解決し、依存タスク完了後にのみ後続タスクを実行可能にするため
 * related: .pi/lib/priority-scheduler.ts, .pi/extensions/agent-runtime.ts
 * public_api: TaskDependencyStatus, TaskDependencyNode, AddTaskOptions, CycleDetectionResult, TaskDependencyGraph
 * invariants:
 *   - 同一IDのタスクは重複して追加できない
 *   - 依存先タスクは追加時に既に存在している必要がある
 *   - 依存関係はDAG（非循環有向グラフ）を形成する
 * side_effects: なし（純粋なデータ構造操作のみ）
 * failure_modes:
 *   - 重複タスクID追加時にErrorをthrow
 *   - 存在しない依存先タスク指定時にErrorをthrow
 * @abdd.explain
 * overview: タスクの依存関係をDAG構造で管理し、依存解決済みタスクをreadyQueueで追跡するグラフ実装
 * what_it_does:
 *   - タスクノードの追加と依存関係の双方向リンク構築
 *   - タスク状態の管理
 *   - 依存関係充足判定とready状態への遷移
 *   - readyQueueへの子準備タスクのエンキュー
 * why_it_exists:
 *   - 依存タスク完了前の後続タスク実行を防止する
 *   - スケジューラーが実行可能タスクを特定できるようにする
 *   - 循環依存の検出を可能にする
 * scope:
 *   in: タスクID、依存関係配列、優先度、推定実行時間
 *   out: タスクノード状態、readyQueue、依存関係グラフ構造
 */

// File: .pi/lib/task-dependencies.ts
// Description: Task dependency graph for DAG-based task scheduling.
// Why: Enables dependency-aware scheduling where tasks can wait for other tasks to complete.
// Related: .pi/lib/priority-scheduler.ts, .pi/extensions/agent-runtime.ts

 /**
  * 依存関係グラフにおけるタスクの状態
  */
export type TaskDependencyStatus = "pending" | "ready" | "running" | "completed" | "failed" | "cancelled";

 /**
  * 依存関係グラフ内のタスクノード
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
  * タスクをグラフに追加するためのオプション
  * @param name 表示用のタスク名
  * @param dependencies 先行して完了する必要があるタスクIDの配列
  * @param priority スケジューリングの優先度
  * @param estimatedDurationMs 推定実行時間（ミリ秒）
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
  * 循環検出の結果
  * @param hasCycle - 循環があるかどうか
  * @param cyclePath - 循環パス（存在しない場合はnull）
  */
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath: string[] | null;
}

 /**
  * タスク依存関係グラフ
  * @param id - タスクの一意なID
  * @param options - 依存関係を含むタスクオプション
  * @returns 作成されたタスクノード
  */
export class TaskDependencyGraph {
  private nodes: Map<string, TaskDependencyNode> = new Map();
  private readyQueue: string[] = [];

   /**
    * タスクを依存関係グラフに追加する
    * @param id - 一意なタスクID
    * @param options - 依存関係を含むタスクオプション
    * @returns 作成されたタスクノード
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
    * タスクをグラフから削除する
    * @param id - 削除するタスクID
    * @returns 削除された場合はtrue
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
    * タスクが存在するか確認する
    * @param id タスクID
    * @returns 存在する場合はtrue
    */
  hasTask(id: string): boolean {
    return this.nodes.has(id);
  }

   /**
    * IDでタスクを取得する
    * @param id タスクID
    * @returns タスクノード。存在しない場合はundefined
    */
  getTask(id: string): TaskDependencyNode | undefined {
    return this.nodes.get(id);
  }

   /**
    * 全タスクを取得する
    * @returns タスクの配列
    */
  getAllTasks(): TaskDependencyNode[] {
    return Array.from(this.nodes.values());
  }

   /**
    * タスクが実行可能か判定する
    * @param id タスクID
    * @returns 実行可能な場合はtrue
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
    * 実行準備が完了したタスクを全て取得する。
    * @returns 実行準備が完了したタスクノードの配列
    */
  getReadyTasks(): TaskDependencyNode[] {
    return this.readyQueue
      .map((id) => this.nodes.get(id))
      .filter((node): node is TaskDependencyNode => node?.status === "ready");
  }

   /**
    * 実行可能なタスクIDのリストを取得する
    * @returns タスクIDの配列
    */
  getReadyTaskIds(): string[] {
    return [...this.readyQueue];
  }

   /**
    * タスクを実行中にマークする
    * @param id タスクID
    * @returns なし
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
    * タスクを完了状態にする
    * @param id タスクID
    * @returns なし
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
    * タスクを失敗状態にする
    * @param id タスクID
    * @param error エラーオブジェクト
    * @returns なし
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
    * タスクをキャンセル済みにする
    * @param id タスクID
    * @returns なし
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
    * グラフ内のサイクルを検出する
    * @returns サイクル検出の結果
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
    * 全タスクのトポロジカル順序を取得する
    * @returns 順序付けされたタスクIDの配列、サイクルがある場合はnull
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
    * グラフの統計情報を取得する
    * @returns グラフの統計情報を含むオブジェクト
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
    * グラフから全タスクを削除する。
    * @returns void
    */
  clear(): void {
    this.nodes.clear();
    this.readyQueue = [];
  }

   /**
    * グラフをシリアライズ用オブジェクトとしてエクスポートする。
    * @returns タスク情報、ID、状態、依存関係を含むオブジェクトの配列。
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
    * エクスポートデータからグラフを復元します。
    * @param data エクスポートされたタスクデータ
    * @returns なし
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
