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

// ============================================================================
// Legacy API for backward compatibility with agent-runtime.ts
// ============================================================================

/**
 * 優先度レベル
 * @summary 優先度レベル
 * @deprecated Use TaskNodePriority instead
 */
export type TaskPriority = "critical" | "high" | "normal" | "low";

/**
 * 優先度付きキューエントリ
 * @summary 優先度キューエントリ
 * @deprecated Use TaskNode directly
 */
export interface PriorityQueueEntry {
  /** 一意識別子 */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 優先度 */
  priority: TaskPriority;
  /** キュー追加時刻 */
  enqueuedAtMs: number;
  /** ソース情報 */
  source?: string;
}

/**
 * 優先度を数値に変換
 * @summary 優先度変換
 * @param priority - 優先度
 * @returns 数値（大きいほど優先度が高い）
 * @deprecated Internal use only
 */
export function inferPriority(priority: TaskPriority | undefined): number {
  const priorityMap: Record<TaskPriority, number> = {
    critical: 100,
    high: 75,
    normal: 50,
    low: 25,
  };
  return priorityMap[priority ?? "normal"];
}

/**
 * 優先度で比較
 * @summary 優先度比較
 * @param a - エントリA
 * @param b - エントリB
 * @returns 比較結果（降順）
 * @deprecated Internal use only
 */
export function comparePriority(a: PriorityQueueEntry, b: PriorityQueueEntry): number {
  const priorityDiff = inferPriority(b.priority) - inferPriority(a.priority);
  if (priorityDiff !== 0) return priorityDiff;
  return a.enqueuedAtMs - b.enqueuedAtMs;
}

/**
 * 優先度付きタスクキュー
 * @summary 優先度キュークラス
 * @deprecated Use PriorityScheduler instead
 */
export class PriorityTaskQueue {
  private queue: PriorityQueueEntry[] = [];

  /**
   * エントリを追加
   * @summary エントリ追加
   * @param entry - キューエントリ
   */
  enqueue(entry: PriorityQueueEntry): void {
    this.queue.push(entry);
    this.queue.sort(comparePriority);
  }

  /**
   * 先頭エントリを取り出し
   * @summary エントリ取り出し
   * @returns 先頭エントリまたはundefined
   */
  dequeue(): PriorityQueueEntry | undefined {
    return this.queue.shift();
  }

  /**
   * 先頭エントリを参照
   * @summary 先頭参照
   * @returns 先頭エントリまたはundefined
   */
  peek(): PriorityQueueEntry | undefined {
    return this.queue[0];
  }

  /**
   * キューサイズを取得
   * @summary サイズ取得
   * @returns エントリ数
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * キューが空かどうか
   * @summary 空判定
   * @returns 空の場合true
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 全エントリを取得
   * @summary 全エントリ取得
   * @returns エントリ配列
   */
  toArray(): PriorityQueueEntry[] {
    return [...this.queue];
  }

  /**
   * 条件に一致するエントリを削除
   * @summary エントリ削除
   * @param predicate - 削除条件
   * @returns 削除されたエントリ数
   */
  remove(predicate: (entry: PriorityQueueEntry) => boolean): number {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter((e) => !predicate(e));
    return initialLength - this.queue.length;
  }
}

/**
 * キュー統計をフォーマット
 * @summary 統計フォーマット
 * @param queue - 優先度キュー
 * @returns フォーマットされた統計文字列
 * @deprecated Internal use only
 */
export function formatPriorityQueueStats(queue: PriorityTaskQueue): string {
  const entries = queue.toArray();
  const byPriority: Record<TaskPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };

  for (const entry of entries) {
    byPriority[entry.priority]++;
  }

  return `Queue stats: total=${entries.length}, critical=${byPriority.critical}, high=${byPriority.high}, normal=${byPriority.normal}, low=${byPriority.low}`;
}
