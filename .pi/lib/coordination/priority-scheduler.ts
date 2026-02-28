/**
 * @abdd.meta
 * path: .pi/lib/priority-scheduler.ts
 * role: APEE優先度ベーススケジューリング
 * why: タスクを優先度順に実行し、クリティカルパスを最適化するため
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-weight-calculator.ts, .pi/lib/concurrency.ts
 * public_api: PriorityScheduler, scheduleTasks, SchedulerConfig, PriorityTaskQueue, inferPriority, estimateRounds
 * invariants: 実行順序は依存関係を尊重する
 * side_effects: なし
 * failure_modes: 循環依存検出（現在は未実装）
 * @abdd.explain
 * overview: DynTaskMAS論文のAPEE（Asynchronous Parallel Execution Engine）の優先度ベーススケジューリングを実装
 * what_it_does:
 *   - タスクを重みベースで優先度順にソート
 *   - スタベーション防止ロジックで低優先度タスクも定期実行
 *   - 最大並列数を制御してリソース管理
 *   - ツール名からタスク種別・優先度・推定ラウンド数を推論
 * why_it_exists:
 *   - クリティカルパス上のタスクを優先し、全体的な実行時間を短縮するため
 *   - 低優先度タスクが永遠に実行されない問題を防ぐため
 * scope:
 *   in: 実行可能タスクリストと重みマップ、またはツール名
 *   out: スケジュール順のタスクリスト、または推論された優先度・推定ラウンド数
 */

// File: .pi/lib/priority-scheduler.ts
// Description: Priority-based task scheduling for APEE (Asynchronous Parallel Execution Engine).
// Why: Implements DynTaskMAS paper's priority scheduling with starvation prevention.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-weight-calculator.ts, .pi/lib/concurrency.ts

import type { TaskNode } from "../dag-types.js";

// ============================================================================
// 型定義
// ============================================================================

/**
 * 優先度レベル
 * @summary 優先度レベル
 */
export type TaskPriority = "critical" | "high" | "normal" | "low" | "background";

/**
 * タスク種別
 * @summary タスク種別
 */
export type TaskType =
  | "read"
  | "bash"
  | "edit"
  | "write"
  | "subagent_single"
  | "subagent_parallel"
  | "agent_team"
  | "question"
  | "unknown";

/**
 * タスク複雑度
 * @summary タスク複雑度
 */
export type TaskComplexity =
  | "trivial"
  | "simple"
  | "moderate"
  | "complex"
  | "exploratory";

/**
 * 優先度の重み
 * @summary 優先度重みマップ
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  background: 10,
};

/**
 * 優先度の数値
 * @summary 優先度数値マップ
 */
export const PRIORITY_VALUES: Record<TaskPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
  background: 0,
};

/**
 * ラウンド推定コンテキスト
 * @summary ラウンド推定入力
 */
export interface EstimationContext {
  /** ツール名 */
  toolName: string;
  /** タスク説明 */
  taskDescription?: string;
  /** エージェント数 */
  agentCount?: number;
  /** リトライかどうか */
  isRetry?: boolean;
  /** 不明なフレームワークかどうか */
  hasUnknownFramework?: boolean;
}

/**
 * ラウンド推定結果
 * @summary ラウンド推定出力
 */
export interface RoundEstimation {
  /** タスク種別 */
  taskType: TaskType;
  /** 推定ラウンド数 */
  estimatedRounds: number;
  /** 複雑度 */
  complexity: TaskComplexity;
  /** 信頼度 (0-1) */
  confidence: number;
}

/**
 * 優先度推論オプション
 * @summary 優先度推論オプション
 */
export interface InferPriorityOptions {
  /** インタラクティブかどうか */
  isInteractive?: boolean;
  /** バックグラウンドタスクかどうか */
  isBackground?: boolean;
  /** リトライかどうか */
  isRetry?: boolean;
  /** エージェント数 */
  agentCount?: number;
}

/**
 * 優先度付きキューエントリ
 * @summary 優先度キューエントリ
 */
export interface PriorityQueueEntry {
  /** 一意識別子 */
  id: string;
  /** ツール名 */
  toolName: string;
  /** 優先度 */
  priority: TaskPriority;
  /** 推定実行時間（ms） */
  estimatedDurationMs?: number;
  /** 推定ラウンド数 */
  estimatedRounds?: number;
  /** デッドライン（ms） */
  deadlineMs?: number;
  /** キュー追加時刻 */
  enqueuedAtMs: number;
  /** ソース情報 */
  source?: string;
  /** 仮想開始時刻 */
  virtualStartTime: number;
  /** 仮想終了時刻 */
  virtualFinishTime: number;
  /** スキップ回数 */
  skipCount: number;
  /** 最後に検討された時刻 */
  lastConsideredMs?: number;
}

/**
 * 優先度タスクメタデータ
 * @summary 優先度タスクメタデータ
 */
export type PriorityTaskMetadata = Omit<
  PriorityQueueEntry,
  "virtualStartTime" | "virtualFinishTime" | "skipCount" | "lastConsideredMs"
>;

/**
 * キュー統計情報
 * @summary キュー統計
 */
export interface QueueStats {
  /** 総エントリ数 */
  total: number;
  /** 優先度別エントリ数 */
  byPriority: Record<TaskPriority, number>;
  /** 平均待機時間（ms） */
  avgWaitMs: number;
  /** 最大待機時間（ms） */
  maxWaitMs: number;
  /** スタベーション状態のエントリ数 */
  starvingCount: number;
}

// ============================================================================
// 推論関数
// ============================================================================

/**
 * ツール名からタスク種別を推論
 * @summary タスク種別推論
 * @param toolName - ツール名
 * @returns タスク種別
 */
export function inferTaskType(toolName: string): TaskType {
  const normalized = toolName.toLowerCase().trim();

  // 直接マッピング
  if (normalized === "question") return "question";
  if (normalized === "read") return "read";
  if (normalized === "bash") return "bash";
  if (normalized === "edit") return "edit";
  if (normalized === "write") return "write";

  // サブエージェント
  if (normalized === "subagent_run") return "subagent_single";
  if (normalized === "subagent_run_parallel") return "subagent_parallel";

  // エージェントチーム
  if (normalized.startsWith("agent_team")) return "agent_team";

  // 不明
  return "unknown";
}

/**
 * タスク種別からベースラウンド数を取得
 * @summary ベースラウンド取得
 * @param taskType - タスク種別
 * @returns ベースラウンド数
 */
function getBaseRounds(taskType: TaskType): number {
  const baseRoundsMap: Record<TaskType, number> = {
    read: 1,
    bash: 1,
    edit: 2,
    write: 2,
    question: 1,
    subagent_single: 5,
    subagent_parallel: 8,
    agent_team: 10,
    unknown: 3,
  };
  return baseRoundsMap[taskType];
}

/**
 * 複雑度を推論
 * @summary 複雑度推論
 * @param taskType - タスク種別
 * @param context - 推論コンテキスト
 * @returns 複雑度
 */
function inferComplexity(
  taskType: TaskType,
  context: EstimationContext
): TaskComplexity {
  if (context.hasUnknownFramework) return "exploratory";

  const complexityMap: Record<TaskType, TaskComplexity> = {
    read: "trivial",
    bash: "simple",
    edit: "moderate",
    write: "moderate",
    question: "simple",
    subagent_single: "complex",
    subagent_parallel: "complex",
    agent_team: "complex",
    unknown: "exploratory",
  };
  return complexityMap[taskType];
}

/**
 * ラウンド数を推定
 * @summary ラウンド推定
 * @param context - 推定コンテキスト
 * @returns 推定結果
 */
export function estimateRounds(context: EstimationContext): RoundEstimation {
  const taskType = inferTaskType(context.toolName);
  let estimatedRounds = getBaseRounds(taskType);
  const complexity = inferComplexity(taskType, context);
  let confidence = 0.8;

  // エージェント数による増加
  if (context.agentCount && context.agentCount > 1) {
    estimatedRounds += context.agentCount * 2;
    confidence *= 0.95;
  }

  // リトライ時は+2ラウンド
  if (context.isRetry) {
    estimatedRounds += 2;
    confidence *= 0.9;
  }

  // 不明なフレームワーク
  if (context.hasUnknownFramework) {
    estimatedRounds += 5;
    confidence *= 0.7;
  }

  // 範囲制限
  estimatedRounds = Math.max(1, Math.min(50, estimatedRounds));
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    taskType,
    estimatedRounds,
    complexity,
    confidence,
  };
}

/**
 * ツール名とオプションから優先度を推論
 * @summary 優先度推論
 * @param toolName - ツール名
 * @param options - 推論オプション
 * @returns 優先度
 */
export function inferPriority(
  toolName: string,
  options?: InferPriorityOptions
): TaskPriority {
  // バックグラウンドタスク
  if (options?.isBackground) return "background";

  // リトライは低優先度
  if (options?.isRetry) return "low";

  // インタラクティブは高優先度
  if (options?.isInteractive) return "high";

  const normalized = toolName.toLowerCase().trim();

  // questionツールはクリティカル
  if (normalized === "question") return "critical";

  // サブエージェント・エージェントチームは高優先度
  if (
    normalized === "subagent_run" ||
    normalized === "subagent_run_parallel" ||
    normalized.startsWith("agent_team")
  ) {
    return "high";
  }

  // 基本ツールは通常優先度
  if (
    normalized === "read" ||
    normalized === "bash" ||
    normalized === "edit" ||
    normalized === "write"
  ) {
    return "normal";
  }

  // デフォルトは通常優先度
  return "normal";
}

// ============================================================================
// 比較関数
// ============================================================================

/**
 * 優先度を比較
 * @summary 優先度比較
 * @param a - エントリA
 * @param b - エントリB
 * @returns 比較結果（aが優先なら負、bが優先なら正）
 */
export function comparePriority(
  a: PriorityQueueEntry,
  b: PriorityQueueEntry
): number {
  // スキップ回数による飢餓防止（skipCount > 3で優先）
  if (a.skipCount > 3 && b.skipCount <= 3) return -1;
  if (b.skipCount > 3 && a.skipCount <= 3) return 1;

  // 優先度で比較
  const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // 同じ優先度なら追加時刻で比較（早い方が優先）
  return a.enqueuedAtMs - b.enqueuedAtMs;
}

// ============================================================================
// スケジューラ設定
// ============================================================================

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

// ============================================================================
// PriorityScheduler クラス（APEE用）
// ============================================================================

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
    const basePriorityMap: Record<string, number> = {
      critical: 100,
      high: 75,
      normal: 50,
      low: 25,
      background: 10,
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
// PriorityTaskQueue クラス（汎用優先度キュー）
// ============================================================================

/** スタベーション判定の閾値（ms） */
const STARVATION_THRESHOLD_MS = 30000;

/**
 * 優先度付きタスクキュー
 * @summary 優先度キュークラス
 */
export class PriorityTaskQueue {
  private queue: PriorityQueueEntry[] = [];

  /**
   * キューの長さ
   * @summary キュー長さ
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * キューが空かどうか
   * @summary 空判定
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * エントリを追加
   * @summary エントリ追加
   * @param metadata - キューメタデータ
   * @returns 追加されたエントリ
   */
  enqueue(metadata: PriorityTaskMetadata): PriorityQueueEntry {
    const now = Date.now();
    const entry: PriorityQueueEntry = {
      ...metadata,
      virtualStartTime: metadata.enqueuedAtMs,
      virtualFinishTime: metadata.enqueuedAtMs + (metadata.estimatedDurationMs ?? 1000),
      skipCount: 0,
    };
    this.queue.push(entry);
    this.queue.sort(comparePriority);
    return entry;
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
   * キューが空かどうか（メソッド版）
   * @summary 空判定メソッド
   * @returns 空の場合true
   */
  isEmptyMethod(): boolean {
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
   * 全エントリを取得（エイリアス）
   * @summary 全エントリ取得
   * @returns エントリ配列
   */
  getAll(): PriorityQueueEntry[] {
    return [...this.queue];
  }

  /**
   * 指定IDのエントリを削除
   * @summary ID指定削除
   * @param id - 削除するエントリのID
   * @returns 削除されたエントリまたはundefined
   */
  remove(id: string): PriorityQueueEntry | undefined {
    const index = this.queue.findIndex((e) => e.id === id);
    if (index === -1) {
      return undefined;
    }
    const removed = this.queue.splice(index, 1)[0];
    return removed;
  }

  /**
   * 条件に一致するエントリを削除
   * @summary エントリ削除
   * @param predicate - 削除条件
   * @returns 削除されたエントリ数
   */
  removeByPredicate(predicate: (entry: PriorityQueueEntry) => boolean): number {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter((e) => !predicate(e));
    return initialLength - this.queue.length;
  }

  /**
   * 指定優先度のエントリを取得
   * @summary 優先度別エントリ取得
   * @param priority - 優先度
   * @returns 該当エントリ配列
   */
  getByPriority(priority: TaskPriority): PriorityQueueEntry[] {
    return this.queue.filter((e) => e.priority === priority);
  }

  /**
   * キュー統計を取得
   * @summary 統計取得
   * @returns 統計情報
   */
  getStats(): QueueStats {
    const now = Date.now();
    const byPriority: Record<TaskPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
      background: 0,
    };

    let totalWaitMs = 0;
    let maxWaitMs = 0;
    let starvingCount = 0;

    for (const entry of this.queue) {
      byPriority[entry.priority]++;
      const waitMs = now - entry.enqueuedAtMs;
      totalWaitMs += waitMs;
      maxWaitMs = Math.max(maxWaitMs, waitMs);
      if (waitMs > STARVATION_THRESHOLD_MS) {
        starvingCount++;
      }
    }

    return {
      total: this.queue.length,
      byPriority,
      avgWaitMs: this.queue.length > 0 ? totalWaitMs / this.queue.length : 0,
      maxWaitMs,
      starvingCount,
    };
  }

  /**
   * スタベーション状態のタスクを昇格
   * @summary スタベーション防止昇格
   * @returns 昇格されたエントリ数
   */
  promoteStarvingTasks(): number {
    const now = Date.now();
    let promoted = 0;

    for (const entry of this.queue) {
      const waitMs = now - entry.enqueuedAtMs;
      if (waitMs > STARVATION_THRESHOLD_MS && entry.priority !== "critical") {
        // 1段階昇格
        const priorityOrder: TaskPriority[] = [
          "background",
          "low",
          "normal",
          "high",
          "critical",
        ];
        const currentIndex = priorityOrder.indexOf(entry.priority);
        if (currentIndex < priorityOrder.length - 1) {
          entry.priority = priorityOrder[currentIndex + 1];
          promoted++;
        }
      }
    }

    // 昇格後に再ソート
    if (promoted > 0) {
      this.queue.sort(comparePriority);
    }

    return promoted;
  }
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * キュー統計をフォーマット（QueueStatsオブジェクト用）
 * @summary 統計フォーマット
 * @param stats - 統計情報オブジェクト
 * @returns フォーマットされた統計文字列
 */
export function formatPriorityQueueStats(stats: QueueStats): string {
  return `Queue stats: Total: ${stats.total}, critical: ${stats.byPriority.critical}, high: ${stats.byPriority.high}, normal: ${stats.byPriority.normal}, low: ${stats.byPriority.low}, background: ${stats.byPriority.background}, avg: ${stats.avgWaitMs}ms, starving: ${stats.starvingCount}`;
}

/**
 * キュー統計をフォーマット（PriorityTaskQueue用）
 * @summary 統計フォーマット
 * @param queue - 優先度キュー
 * @returns フォーマットされた統計文字列
 */
export function formatQueueStats(queue: PriorityTaskQueue): string {
  const entries = queue.toArray();
  const byPriority: Record<TaskPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
    background: 0,
  };

  for (const entry of entries) {
    byPriority[entry.priority]++;
  }

  return `Queue stats: total=${entries.length}, critical=${byPriority.critical}, high=${byPriority.high}, normal=${byPriority.normal}, low=${byPriority.low}, background=${byPriority.background}`;
}
