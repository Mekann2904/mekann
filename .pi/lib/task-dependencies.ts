/**
 * @abdd.meta
 * path: .pi/lib/task-dependencies.ts
 * role: タスク依存関係グラフのデータ構造と操作ロジックを管理する
 * why: DAG（有向非巡回グラフ）に基づくタスクスケジューリングにおいて、タスク間の実行順序と依存状態を管理するため
 * related: .pi/lib/priority-scheduler.ts, .pi/extensions/agent-runtime.ts
 * public_api: TaskDependencyGraph, TaskDependencyNode, TaskDependencyStatus, AddTaskOptions, CycleDetectionResult
 * invariants: グラフは循環を持たない、依存先タスクは必ずグラフ内に存在する、タスクのステータスは依存タスクの完了と共に遷移する
 * side_effects: addTask実行時に依存先タスクのdependentsセットを更新する、タスク状態変化時にreadyQueueを更新する
 * failure_modes: 重複IDによる追加エラー、存在しない依存先IDの指定エラー、循環依存の発生（ロジック上）
 * @abdd.explain
 * overview: タスクノードとその有向辺を管理し、依存関係を解決して実行可能タスクを特定するグラフ構造を提供する
 * what_it_does:
 *   - タスクノードの追加と依存関係の登録
 *   - 依存タスクの存在確認と整合性チェック
 *   - 全依存関係が満たされたタスクの実行可能（ready）状態への遷移
 *   - 実行可能タスクIDのキューイング管理
 * why_it_exists:
 *   - 並列実行可能なタスクを効率的に特定するため
 *   - タスク間の完了待ちロジックを集約し、スケジューラの責務を分離するため
 * scope:
 *   in: タスクID、タスク名、優先度、推定実行時間、依存先タスクIDリスト
 * out: タスクノードの状態、実行可能タスクIDのキュー、依存関係の接続情報
 */

// File: .pi/lib/task-dependencies.ts
// Description: Task dependency graph for DAG-based task scheduling.
// Why: Enables dependency-aware scheduling where tasks can wait for other tasks to complete.
// Related: .pi/lib/priority-scheduler.ts, .pi/extensions/agent-runtime.ts

/**
 * タスクの依存状態
 * @summary 依存状態を取得
 * @typedef {"pending"|"ready"|"running"|"completed"|"failed"|"cancelled"} TaskDependencyStatus
 * @description 依存関係グラフにおけるタスクの状態
 */
export type TaskDependencyStatus = "pending" | "ready" | "running" | "completed" | "failed" | "cancelled";

/**
 * タスク依存ノード定義
 * @summary タスクノード定義
 * @param id - 一意なタスクID
 * @param name - 表示用タスク名
 * @param status - 現在の状態
 * @param dependencies - 実行前に完了が必要なタスクID集合
 * @param dependents - 当該タスクに依存するタスクID集合
 * @param addedAt - タスク追加日時
 * @param startedAt - 実行開始日時
 * @param completedAt - 完了日時
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
 * @summary タスク追加設定
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
 * @summary 循環検出結果を保持
 * @param hasCycle - 循環があるかどうか
 * @param cyclePath - 循環パス（存在しない場合はnull）
 */
export interface CycleDetectionResult {
  hasCycle: boolean;
  cyclePath: string[] | null;
}

/**
 * タスク依存関係グラフ
 * @summary 依存関係管理
 */
export class TaskDependencyGraph {
  private nodes: Map<string, TaskDependencyNode> = new Map();
  private readyQueue: string[] = [];

  /**
   * タスクを追加する
   * @summary タスク追加
   * @param {string} id タスクID
   * @param {*} options オプション設定
   * @returns {TaskDependencyNode} 追加されたタスクノード
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
   * タスクを削除する
   * @summary タスク削除
   * @param {string} id タスクID
   * @returns {boolean} 削除成功した場合はtrue
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
   * タスクの存在確認
   * @summary タスク確認
   * @param {string} id タスクID
   * @returns {boolean} 存在する場合はtrue
   */
  hasTask(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * タスクを取得する
   * @summary タスク取得
   * @param {string} id タスクID
   * @returns {TaskDependencyNode | undefined} タスクノード。存在しない場合はundefined。
   */
  getTask(id: string): TaskDependencyNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * タスク準備完了確認
   * @summary タスク準備完了確認
   * @param id タスクID
   * @returns 準備完了の場合true
   */
  getAllTasks(): TaskDependencyNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * タスク実行可否を判定
   * @summary タスク実行可否を判定
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
   * 実行可能ID取得
   * @summary 実行可能ID取得
   * @returns タスクIDの配列
   */
  getReadyTasks(): TaskDependencyNode[] {
    return this.readyQueue
      .map((id) => this.nodes.get(id))
      .filter((node): node is TaskDependencyNode => node?.status === "ready");
  }

  /**
   * 実行中に設定
   * @summary 実行中に設定
   * @param id タスクID
   * @returns void
   */
  getReadyTaskIds(): string[] {
    return [...this.readyQueue];
  }

  /**
   * @summary 実行中へ移行
   * タスクを実行中にマークする
   * @param id タスクID
   * @returns なし
   * @throws タスクが存在しない場合
   * @throws タスクがready状態ではない場合
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
   * @summary タスクをキャンセル
   * @param id タスクID
   * @returns なし
   * @throws タスクが存在しない場合
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
   * @summary サイクルを検出
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
   * トポロジカル順序を取得
   * @summary 順序を取得
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
   * @summary 統計情報を取得
   * @returns タスク総数やステータス別の集計、深さを含む統計オブジェクト
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
   * グラフデータをクリアする
   * @summary グラフを初期化
   * @returns なし
   */
  clear(): void {
    this.nodes.clear();
    this.readyQueue = [];
  }

  /**
   * グラフデータをエクスポートする
   * @summary グラフをエクスポート
   * @returns タスクと依存関係の配列を含むオブジェクト
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
   * グラフデータをインポートする
   * @summary グラフをインポート
   * @param data - インポートするタスクリストと依存関係データ
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
 * グラフ統計情報を整形する
 * @summary グラフ統計を整形
 * @param stats - タスク依存グラフの統計情報オブジェクト
 * @returns 整形された統計情報の文字列表現
 * @throws グラフに循環参照または欠損依存がある場合
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
