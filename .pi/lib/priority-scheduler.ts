/**
 * @abdd.meta
 * path: .pi/lib/priority-scheduler.ts
 * role: APEE優先度ベーススケジューリング
 * why: タスクを優先度順に実行し、クリティカルパスを最適化するため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-weight-calculator.ts, .pi/lib/concurrency.ts
 * public_api: PriorityScheduler, scheduleTasks, SchedulerConfig
 * invariants: 実行順序は依存関係を尊重する
 * side_effects: なし
 * failure_modes: 循環依存検出（現在は未実装）
 * @abdd.explain
 * overview: DynTaskMAS論文のAPEE（Asynchronous Parallel Execution Engine）の優先度ベーススケジューリングを実装
 * what_it_does:
 *   - タスクを重みベースで優先度順にソート
 *   - スタベーション防止ロジックで低優先度タスクも定期実行
 *   - 最大並列数を制御してリソース管理
 * why_it_exists:
 *   - クリティカルパス上のタスクを優先し、全体的な実行時間を短縮するため
 *   - 低優先度タスクが永遠に実行されない問題を防ぐため
 * scope:
 *   in: 実行可能タスクリストと重みマップ
 *   out: スケジュール順のタスクリスト
 */

// File: .pi/lib/priority-scheduler.ts
// Description: Priority-based task scheduling for APEE (Asynchronous Parallel Execution Engine).
// Why: Implements DynTaskMAS paper's priority scheduling with starvation prevention.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-weight-calculator.ts, .pi/lib/concurrency.ts

import type { TaskNode } from "./dag-types.js";

/**
 * スケジューラの設定
 * @summary スケジューラ設定
 * @param maxConcurrency - 最大並列実行数
 * @param starvationPreventionInterval - スタベーション防止間隔（ms）
 */
export interface SchedulerConfig {
  /** 最大並列実行数 */
  maxConcurrency: number;
  /** スタベーション防止間隔（ms） */
  starvationPreventionInterval: number;
}

/**
 * デフォルトのスケジューラ設定
 * @summary デフォルトスケジューラ設定
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxConcurrency: 4,
  starvationPreventionInterval: 30000,
};

/**
 * スケジュールされたタスクの情報
 * @summary スケジュール済みタスク情報
 * @param task - タスクノード
 * @param weight - 計算された重み
 * @param priority - 優先度スコア
 * @param waitingMs - 待機時間（ms）
 */
export interface ScheduledTask {
  /** タスクノード */
  task: TaskNode;
  /** 計算された重み */
  weight: number;
  /** 優先度スコア */
  priority: number;
  /** 待機時間（ms） */
  waitingMs: number;
}

/**
 * 優先度ベースのタスクスケジューラ
 * DynTaskMAS論文のAPEEコンポーネントを実装
 * @summary 優先度スケジューラ
 */
export class PriorityScheduler {
  private config: SchedulerConfig;
  private taskQueues: Map<string, TaskNode[]>;
  private lastScheduled: Map<string, number>;
  private waitingSince: Map<string, number>;

  /**
   * スケジューラを初期化
   * @summary スケジューラ初期化
   * @param config - スケジューラ設定
   */
  constructor(config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG) {
    this.config = config;
    this.taskQueues = new Map();
    this.lastScheduled = new Map();
    this.waitingSince = new Map();
  }

  /**
   * タスクを優先度順にスケジュール
   * スタベーション防止: 待機時間超過タスクを優先
   * @summary タスクスケジューリング
   * @param readyTasks - 実行可能なタスク配列
   * @param weights - タスクID→重みのマップ
   * @returns スケジュール順のタスク配列
   */
  scheduleTasks(
    readyTasks: TaskNode[],
    weights: Map<string, number>
  ): TaskNode[] {
    const now = Date.now();

    // 待機時間を記録
    for (const task of readyTasks) {
      if (!this.waitingSince.has(task.id)) {
        this.waitingSince.set(task.id, now);
      }
    }

    // スケジュール情報を構築
    const scheduledTasks: ScheduledTask[] = readyTasks.map((task) => {
      const weight = weights.get(task.id) ?? 0;
      const waitingSince = this.waitingSince.get(task.id) ?? now;
      const waitingMs = now - waitingSince;

      return {
        task,
        weight,
        priority: this.calculatePriorityScore(task, weight, waitingMs),
        waitingMs,
      };
    });

    // 優先度でソート（降順）
    scheduledTasks.sort((a, b) => b.priority - a.priority);

    // スタベーション防止チェック
    const result: TaskNode[] = [];
    const [starved, normal] = this.separateStarvedTasks(scheduledTasks);

    // 待機時間超過タスクを先頭に追加
    result.push(...starved.map((st) => st.task));
    result.push(...normal.map((st) => st.task));

    // 最大並列数で制限
    return result.slice(0, this.config.maxConcurrency);
  }

  /**
   * タスク完了を記録
   * @summary 完了記録
   * @param taskId - 完了したタスクID
   */
  markCompleted(taskId: string): void {
    this.lastScheduled.set(taskId, Date.now());
    this.waitingSince.delete(taskId);
  }

  /**
   * タスクの優先度スコアを計算
   * @summary 優先度スコア計算
   * @param task - タスク
   * @param weight - エッジ重み
   * @param waitingMs - 待機時間
   * @returns 優先度スコア
   * @internal
   */
  private calculatePriorityScore(
    task: TaskNode,
    weight: number,
    waitingMs: number
  ): number {
    // ベース優先度
    const basePriorityMap = {
      critical: 100,
      high: 75,
      normal: 50,
      low: 25,
    };
    const basePriority = basePriorityMap[task.priority ?? "normal"];

    // 重みボーナス
    const weightBonus = weight * 10;

    // 待機時間ボーナス（スタベーション防止の補助）
    const waitingBonus = Math.min(waitingMs / 1000, 30);

    return basePriority + weightBonus + waitingBonus;
  }

  /**
   * スタベーション状態のタスクを分離
   * @summary スタベーションタスク分離
   * @param tasks - スケジュール済みタスク配列
   * @returns [スタベーションタスク, 通常タスク]
   * @internal
   */
  private separateStarvedTasks(
    tasks: ScheduledTask[]
  ): [ScheduledTask[], ScheduledTask[]] {
    const starved: ScheduledTask[] = [];
    const normal: ScheduledTask[] = [];

    for (const st of tasks) {
      if (st.waitingMs > this.config.starvationPreventionInterval) {
        starved.push(st);
      } else {
        normal.push(st);
      }
    }

    // スタベーションタスクは待機時間の長い順
    starved.sort((a, b) => b.waitingMs - a.waitingMs);

    return [starved, normal];
  }

  /**
   * 指定エージェントのキューサイズを取得
   * @summary キューサイズ取得
   * @param agentId - エージェントID
   * @returns キューサイズ
   */
  getQueueSize(agentId: string): number {
    return this.taskQueues.get(agentId)?.length ?? 0;
  }

  /**
   * エージェントのキューにタスクを追加
   * @summary キュー追加
   * @param agentId - エージェントID
   * @param task - タスク
   */
  enqueue(agentId: string, task: TaskNode): void {
    if (!this.taskQueues.has(agentId)) {
      this.taskQueues.set(agentId, []);
    }
    this.taskQueues.get(agentId)!.push(task);
    this.waitingSince.set(task.id, Date.now());
  }

  /**
   * 設定を更新
   * @summary 設定更新
   * @param config - 新しい設定（部分更新可）
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 統計情報を取得
   * @summary 統計取得
   * @returns スケジューラ統計
   */
  getStats(): {
    totalQueued: number;
    agentQueueSizes: Record<string, number>;
    avgWaitingMs: number;
  } {
    let totalQueued = 0;
    const agentQueueSizes: Record<string, number> = {};
    let totalWaitingMs = 0;
    let waitingCount = 0;

    const now = Date.now();
    for (const [agentId, queue] of Array.from(this.taskQueues.entries())) {
      agentQueueSizes[agentId] = queue.length;
      totalQueued += queue.length;
    }

    for (const since of Array.from(this.waitingSince.values())) {
      totalWaitingMs += now - since;
      waitingCount++;
    }

    return {
      totalQueued,
      agentQueueSizes,
      avgWaitingMs: waitingCount > 0 ? totalWaitingMs / waitingCount : 0,
    };
  }
}
