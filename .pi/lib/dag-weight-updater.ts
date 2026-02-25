/**
 * @abdd.meta
 * path: .pi/lib/dag-weight-updater.ts
 * role: DTGG動的タスクグラフ更新器
 * why: タスクグラフを動的に更新し、重みを再計算するため
 * related: .pi/lib/dag-weight-calculator.ts, .pi/lib/dag-executor.ts, .pi/lib/priority-scheduler.ts
 * public_api: TaskGraphUpdater, GraphDelta, updateGraph
 * invariants: 重みは常に非負値
 * side_effects: なし（インメモリ操作のみ）
 * failure_modes: 循環依存（現在は未検出）
 * @abdd.explain
 * overview: DynTaskMAS論文のAlgorithm 1 UpdateTaskGraphを実装
 * what_it_does:
 *   - 新規タスク追加時にエッジ重みを計算
 *   - 完了タスクの重みを0に更新
 *   - 失敗タスクの重みを増加（再試行優先）
 *   - 更新されたタスクの関連重みを再計算
 * why_it_exists:
 *   - タスク実行中にグラフ構造が変化する動的環境に対応するため
 *   - 失敗したタスクを優先的に再試行するため
 * scope:
 *   in: GraphDelta（追加/完了/失敗/更新タスク）
 *   out: 更新されたエッジ重みマップ
 */

// File: .pi/lib/dag-weight-updater.ts
// Description: Dynamic task graph updater implementing DynTaskMAS Algorithm 1.
// Why: Enables real-time weight recalculation as task graph evolves.
// Related: .pi/lib/dag-weight-calculator.ts, .pi/lib/dag-executor.ts

import {
  calculateEdgeWeight,
  DEFAULT_WEIGHT_CONFIG,
  type WeightConfig,
} from "./dag-weight-calculator.js";
import type { TaskNode } from "./dag-types.js";

/**
 * タスクグラフの変更セット
 * DynTaskMAS論文のΔ_tに対応
 * @summary グラフ変更セット
 * @param addedTasks - 新規追加タスク
 * @param completedTaskIds - 完了したタスクID
 * @param failedTaskIds - 失敗したタスクID
 * @param updatedTasks - 更新されたタスク
 */
export interface GraphDelta {
  /** 新規追加タスク */
  addedTasks: TaskNode[];
  /** 完了したタスクID */
  completedTaskIds: string[];
  /** 失敗したタスクID */
  failedTaskIds: string[];
  /** 更新されたタスク */
  updatedTasks: TaskNode[];
}

/**
 * 空のGraphDelta
 * @summary 空の変更セット
 */
export const EMPTY_DELTA: GraphDelta = {
  addedTasks: [],
  completedTaskIds: [],
  failedTaskIds: [],
  updatedTasks: [],
};

/**
 * タスクの状態
 * @summary タスク状態
 */
export type TaskStatus = "pending" | "running" | "completed" | "failed";

/**
 * 拡張タスクノード（状態付き）
 * @summary 状態付きタスクノード
 * @internal
 */
interface TaskNodeWithStatus extends TaskNode {
  status: TaskStatus;
}

/**
 * 失敗時の重み増加倍率
 * @summary 失敗重み倍率
 */
const FAILURE_WEIGHT_MULTIPLIER = 1.5;

/**
 * タスクグラフ更新器
 * DynTaskMAS論文のAlgorithm 1: UpdateTaskGraphを実装
 * G_{t+1} = U(G_t, Δ_t)
 * @summary タスクグラフ更新器
 */
export class TaskGraphUpdater {
  private config: WeightConfig;
  private taskGraph: Map<string, TaskNodeWithStatus>;
  private edgeWeights: Map<string, number>; // "sourceId:targetId" -> weight
  private dependencyIndex: Map<string, string[]>; // taskId -> dependent taskIds

  /**
   * 更新器を初期化
   * @summary 初期化
   * @param config - 重み設定
   */
  constructor(config: WeightConfig = DEFAULT_WEIGHT_CONFIG) {
    this.config = config;
    this.taskGraph = new Map();
    this.edgeWeights = new Map();
    this.dependencyIndex = new Map();
  }

  /**
   * タスクグラフを更新
   * G_{t+1} = U(G_t, Δ_t)
   * @summary グラフ更新
   * @param delta - 変更セット
   */
  updateGraph(delta: GraphDelta): void {
    // 1. 新規タスクを追加
    for (const task of delta.addedTasks) {
      this.addTask(task);
    }

    // 2. 完了タスクを処理
    for (const taskId of delta.completedTaskIds) {
      this.markCompleted(taskId);
    }

    // 3. 失敗タスクを処理
    for (const taskId of delta.failedTaskIds) {
      this.markFailed(taskId);
    }

    // 4. 更新されたタスクの重みを再計算
    for (const task of delta.updatedTasks) {
      this.recalculateWeights(task);
    }
  }

  /**
   * 新規タスクを追加
   * @summary タスク追加
   * @param task - 追加するタスク
   * @internal
   */
  private addTask(task: TaskNode): void {
    const taskWithStatus: TaskNodeWithStatus = {
      ...task,
      status: "pending",
    };
    this.taskGraph.set(task.id, taskWithStatus);

    // 依存エッジの重みを計算
    for (const depId of task.dependencies) {
      const depTask = this.taskGraph.get(depId);
      if (depTask) {
        const weight = calculateEdgeWeight(depTask, taskWithStatus, this.config);
        this.edgeWeights.set(`${depId}:${task.id}`, weight);

        // 依存インデックスを更新
        if (!this.dependencyIndex.has(depId)) {
          this.dependencyIndex.set(depId, []);
        }
        this.dependencyIndex.get(depId)!.push(task.id);
      }
    }
  }

  /**
   * タスク完了を記録
   * 完了したタスクへの重みを0に更新
   * @summary 完了記録
   * @param taskId - 完了したタスクID
   * @internal
   */
  private markCompleted(taskId: string): void {
    const task = this.taskGraph.get(taskId);
    if (!task) return;

    task.status = "completed";

    // このタスクを依存するエッジの重みを0に設定
    const dependents = this.dependencyIndex.get(taskId) ?? [];
    for (const depId of dependents) {
      const edgeKey = `${taskId}:${depId}`;
      if (this.edgeWeights.has(edgeKey)) {
        this.edgeWeights.set(edgeKey, 0);
      }
    }
  }

  /**
   * タスク失敗を記録
   * 失敗したタスクの重みを増加（再試行優先）
   * @summary 失敗記録
   * @param taskId - 失敗したタスクID
   * @internal
   */
  private markFailed(taskId: string): void {
    const task = this.taskGraph.get(taskId);
    if (!task) return;

    task.status = "failed";

    // 失敗タスクの重みを増加
    for (const depId of task.dependencies) {
      const depTask = this.taskGraph.get(depId);
      if (depTask) {
        const baseWeight = calculateEdgeWeight(depTask, task, this.config);
        // 失敗時は重みを1.5倍に増加
        this.edgeWeights.set(`${depId}:${taskId}`, baseWeight * FAILURE_WEIGHT_MULTIPLIER);
      }
    }
  }

  /**
   * 特定タスクに関連する重みを再計算
   * @summary 重み再計算
   * @param task - 更新されたタスク
   * @internal
   */
  private recalculateWeights(task: TaskNode): void {
    const existingTask = this.taskGraph.get(task.id);
    if (!existingTask) return;

    // タスク情報を更新
    Object.assign(existingTask, task);

    // このタスクを依存するエッジを再計算
    for (const depId of task.dependencies) {
      const depTask = this.taskGraph.get(depId);
      if (depTask) {
        const weight = calculateEdgeWeight(depTask, existingTask, this.config);
        this.edgeWeights.set(`${depId}:${task.id}`, weight);
      }
    }

    // このタスクに依存されるエッジも再計算
    const dependents = this.dependencyIndex.get(task.id) ?? [];
    for (const depId of dependents) {
      const depTask = this.taskGraph.get(depId);
      if (depTask) {
        const weight = calculateEdgeWeight(existingTask, depTask, this.config);
        this.edgeWeights.set(`${task.id}:${depId}`, weight);
      }
    }
  }

  /**
   * 現在のエッジ重みマップを取得
   * @summary エッジ重み取得
   * @returns エッジ重みマップのコピー
   */
  getEdgeWeights(): Map<string, number> {
    return new Map(this.edgeWeights);
  }

  /**
   * タスクの総合重みを取得
   * すべての依存エッジの重みを合計
   * @summary タスク総合重み取得
   * @param taskId - タスクID
   * @returns 総合重み
   */
  getTaskTotalWeight(taskId: string): number {
    let total = 0;
    for (const [edgeKey, weight] of Array.from(this.edgeWeights.entries())) {
      if (edgeKey.endsWith(`:${taskId}`)) {
        total += weight;
      }
    }
    return total;
  }

  /**
   * 全タスクの重みマップを取得
   * PrioritySchedulerで使用
   * @summary 全タスク重み取得
   * @returns タスクID→総合重みのマップ
   */
  getAllTaskWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    for (const taskId of Array.from(this.taskGraph.keys())) {
      weights.set(taskId, this.getTaskTotalWeight(taskId));
    }
    return weights;
  }

  /**
   * 実行可能なタスクを取得
   * 依存関係がすべて完了したタスク
   * @summary 実行可能タスク取得
   * @returns 実行可能タスクの配列
   */
  getReadyTasks(): TaskNode[] {
    const ready: TaskNode[] = [];

    for (const task of Array.from(this.taskGraph.values())) {
      if (task.status !== "pending") continue;

      const allDepsCompleted = task.dependencies.every((depId) => {
        const depTask = this.taskGraph.get(depId);
        return depTask?.status === "completed";
      });

      if (allDepsCompleted) {
        ready.push(task);
      }
    }

    return ready;
  }

  /**
   * タスクを取得
   * @summary タスク取得
   * @param taskId - タスクID
   * @returns タスク（存在しない場合はundefined）
   */
  getTask(taskId: string): TaskNode | undefined {
    return this.taskGraph.get(taskId);
  }

  /**
   * タスク状態を取得
   * @summary タスク状態取得
   * @param taskId - タスクID
   * @returns タスク状態
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.taskGraph.get(taskId)?.status;
  }

  /**
   * グラフ統計を取得
   * @summary グラフ統計取得
   * @returns 統計情報
   */
  getStats(): {
    totalTasks: number;
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalEdges: number;
    avgWeight: number;
  } {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const task of Array.from(this.taskGraph.values())) {
      switch (task.status) {
        case "pending":
          pending++;
          break;
        case "running":
          running++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    const weights = Array.from(this.edgeWeights.values());
    const avgWeight = weights.length > 0
      ? weights.reduce((a, b) => a + b, 0) / weights.length
      : 0;

    return {
      totalTasks: this.taskGraph.size,
      pendingTasks: pending,
      runningTasks: running,
      completedTasks: completed,
      failedTasks: failed,
      totalEdges: this.edgeWeights.size,
      avgWeight,
    };
  }

  /**
   * 重み設定を更新
   * @summary 設定更新
   * @param config - 新しい設定（部分更新可）
   */
  updateConfig(config: Partial<WeightConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * グラフをリセット
   * @summary グラフリセット
   */
  reset(): void {
    this.taskGraph.clear();
    this.edgeWeights.clear();
    this.dependencyIndex.clear();
  }
}

/**
 * GraphDeltaを作成するヘルパー関数
 * @summary Delta作成ヘルパー
 * @param partial - 部分的な変更セット
 * @returns 完全なGraphDelta
 */
export function createDelta(partial: Partial<GraphDelta>): GraphDelta {
  return {
    addedTasks: partial.addedTasks ?? [],
    completedTaskIds: partial.completedTaskIds ?? [],
    failedTaskIds: partial.failedTaskIds ?? [],
    updatedTasks: partial.updatedTasks ?? [],
  };
}
