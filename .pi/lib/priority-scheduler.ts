/**
 * @abdd.meta
 * path: .pi/lib/priority-scheduler.ts
 * role: タスクの優先度定義およびWFQ（Weighted Fair Queuing）スケジューリング用データ構造の定義モジュール
 * why: エージェントおよびチームのタスク実行順序を制御し、重要度に応じたリソース配分を行うため
 * related: .pi/extensions/agent-runtime.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: TaskPriority, PRIORITY_WEIGHTS, PRIORITY_VALUES, PriorityTaskMetadata, PriorityQueueEntry, TaskType, TaskComplexity, EstimationContext
 * invariants: PRIORITY_VALUESの数値が高いほど優先度が高い、PRIORITY_WEIGHTSの数値が高いほど実行頻度の重みが大きい
 * side_effects: なし（純粋な定義と型エクスポート）
 * failure_modes: タイプ定義の不整合による実行時エラー、優先度定義の不正によるスケジューリングロジックの破綻
 * @abdd.explain
 * overview: サブエージェントやエージェントチーム向けの優先度ベースのタスクスケジューリングにおいて使用される型、定数、インターフェースを定義する。
 * what_it_does:
 *   - 5段階の優先度レベルと、その重み付け・比較値を定数として提供する
 *   - タスクのメタデータ（ID、推定時間、期限など）を格納するインターフェースを定義する
 *   - WFQアルゴリズム用の仮想開始・終了時刻やスタベーション検出用カウンタを含むキューエントリを定義する
 *   - ラウンド推定（SRT最適化）のためのタスクタイプ、複雑度、推定コンテキストの型を定義する
 * why_it_exists:
 *   - タスクの重要度や緊急度に応じて実行順序を動的に変更する仕組みを提供するため
 *   - 複数のエージェントやチームが競合する環境において、公平かつ効率的なリソース配分を実現するため
 *   - 実行コストや複雑度を見積もり、スケジューリング判断に活用するためのデータ構造を標準化するため
 * scope:
 *   in: なし
 *   out: 優先度定数、タスクメタデータ型、キューエントリ型、推定用型定義
 */

// File: .pi/lib/priority-scheduler.ts
// Description: Priority-based task scheduling utilities.
// Why: Enables priority-aware scheduling for subagents and agent teams.
// Related: .pi/extensions/agent-runtime.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts

/**
 * タスクの優先度を表す型
 * @summary タスク優先度定義
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
 * タスクのメタデータを表すインターフェース
 * @summary タスクメタデータ定義
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
 * 優先度付きキューエントリのインターフェース
 * @summary キューエントリ定義
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

// ============================================================================
// Round Estimation (SRT Optimization)
// ============================================================================

/**
 * タスクの種類を表す型
 * @summary タスク種別定義
 */
export type TaskType =
  | "read"      // Information retrieval
  | "bash"      // Command execution
  | "edit"      // Single file modification
  | "write"     // File creation
  | "subagent_single"   // Single agent delegation
  | "subagent_parallel" // Parallel agent delegation
  | "agent_team"        // Team execution
  | "question"  // User interaction
  | "unknown";  // Unclassifiable

/**
 * タスクの複雑さを表す型
 * @summary タスク複雑さ定義
 */
export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "exploratory";

/**
 * 推定コンテキストを表すインターフェース
 * @summary 推定コンテキスト
 * @returns ツール名やエージェント数などのコンテキスト情報
 */
export interface EstimationContext {
  toolName: string;
  taskDescription?: string;
  agentCount?: number;
  isRetry?: boolean;
  hasUnknownFramework?: boolean;
}

/**
 * ラウンド推定結果を表すインターフェース
 * @summary ラウンド推定結果
 * @returns 推定されたラウンド数やタスク情報
 */
export interface RoundEstimation {
  estimatedRounds: number;
  taskType: TaskType;
  complexity: TaskComplexity;
  confidence: number; // 0.0 - 1.0
}

/**
 * タスクタイプを推論
 * @summary タスクタイプ推論
 * @param toolName ツール名
 * @returns 推論されたタスクタイプ
 */
export function inferTaskType(toolName: string): TaskType {
  const lower = toolName.toLowerCase();
  if (lower === "question") return "question";
  if (lower === "read") return "read";
  if (lower === "bash") return "bash";
  if (lower === "edit") return "edit";
  if (lower === "write") return "write";
  if (lower.includes("subagent_run_parallel")) return "subagent_parallel";
  if (lower.includes("subagent_run")) return "subagent_single";
  if (lower.includes("agent_team")) return "agent_team";
  return "unknown";
}

/**
 * 実行ラウンド数を見積もる
 * @summary ラウンド数を見積
 * @param context 推定コンテキスト
 * @returns ラウンド推定結果
 */
export function estimateRounds(context: EstimationContext): RoundEstimation {
  const taskType = inferTaskType(context.toolName);
  
  // Base rounds by task type
  const baseRoundsMap: Record<TaskType, number> = {
    "read": 1,
    "bash": 1,
    "edit": 2,
    "write": 2,
    "question": 1,
    "subagent_single": 5,
    "subagent_parallel": 3 + (context.agentCount ?? 1) * 2,
    "agent_team": 8 + (context.agentCount ?? 1) * 3,
    "unknown": 5,
  };
  
  let rounds = baseRoundsMap[taskType];
  let complexity: TaskComplexity = "moderate";
  let confidence = 0.7;
  
  // Adjust for retry (add 2 rounds for debugging)
  if (context.isRetry) {
    rounds += 2;
    complexity = "complex";
    confidence *= 0.8;
  }
  
  // Adjust for unknown framework (add exploration rounds)
  if (context.hasUnknownFramework) {
    rounds = Math.round(rounds * 1.3);
    complexity = "exploratory";
    confidence *= 0.6;
  }
  
  // Infer complexity from task description
  if (context.taskDescription) {
    const desc = context.taskDescription.toLowerCase();
    if (desc.includes("simple") || desc.includes("trivial") || desc.includes("quick")) {
      rounds = Math.max(1, Math.round(rounds * 0.7));
      complexity = "simple";
      confidence = Math.min(1.0, confidence + 0.1);
    } else if (desc.includes("complex") || desc.includes("difficult") || desc.includes("investigate")) {
      rounds = Math.round(rounds * 1.5);
      complexity = "complex";
      confidence *= 0.8;
    } else if (desc.includes("explore") || desc.includes("research") || desc.includes("unknown")) {
      rounds = Math.round(rounds * 1.8);
      complexity = "exploratory";
      confidence *= 0.5;
    }
  }
  
  // Clamp to reasonable bounds
  rounds = Math.max(1, Math.min(50, rounds));
  
  return {
    estimatedRounds: rounds,
    taskType,
    complexity,
    confidence,
  };
}

/**
 * タスク優先度を推論
 * @summary 優先度を推論
 * @param toolName ツール名
 * @param context 実行コンテキスト
 * @returns 推論されたタスク優先度
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
 * 優先度を比較する
 * @summary 優先度を比較
 * @param a 比較対象のエントリ
 * @param b 比較対象のエントリ
 * @returns ソート順序（整数）
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

  // 5. Estimated rounds (SRT optimization, rounds-based) - NEW
  // Prioritize tasks with fewer estimated rounds
  if (a.estimatedRounds !== undefined && b.estimatedRounds !== undefined) {
    const roundsDiff = a.estimatedRounds - b.estimatedRounds;
    if (roundsDiff !== 0) {
      return roundsDiff;
    }
  } else if (a.estimatedRounds !== undefined) {
    return -1; // a has estimation, prioritize it
  } else if (b.estimatedRounds !== undefined) {
    return 1; // b has estimation, prioritize it
  }

  // 6. Estimated duration (fallback to ms-based SRT)
  if (a.estimatedDurationMs !== undefined && b.estimatedDurationMs !== undefined) {
    return a.estimatedDurationMs - b.estimatedDurationMs;
  }

  // 7. Final tiebreaker by ID for stability
  return a.id.localeCompare(b.id);
}

/**
 * 優先度付きタスクキュー
 * @summary 優先度キュー管理
 */
export class PriorityTaskQueue {
  private entries: PriorityQueueEntry[] = [];
  private virtualTime: number = 0;
  private maxSkipCount: number = 10;
  private starvationThresholdMs: number = 60_000; // 1 minute

  /**
   * タスクを追加する
   * @summary タスクを追加
   * @param metadata タスクのメタデータ
   * @returns 追加されたエントリ
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
   * 先頭要素を取り出す
   * @summary 先頭要素を取り出し
   * @returns 取り出されたエントリ、空ならundefined
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
   * 先頭要素を参照する
   * @summary 先頭要素を取得
   * @returns 先頭のエントリ、空ならundefined
   */
  peek(): PriorityQueueEntry | undefined {
    return this.entries[0];
  }

  /**
   * 指定IDのタスクを削除する
   * @summary タスクを削除
   * @param id 削除するタスクのID
   * @returns 削除されたタスクのエントリ、または undefined
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
   * すべてのエントリを取得する
   * @returns エントリの配列
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
   * 統計情報を取得
   * @summary 統計情報を取得
   * @returns 総数、優先度別件数、平均待機時間、最大待機時間、飢餓タスク数を含む統計情報
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
   * 待機タスク昇格
   * @summary 待機タスクを昇格
   * @returns 昇格したタスク数
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
 * 優先キューの統計情報をフォーマットする
 * @summary 統計情報フォーマット
 * @param {ReturnType<PriorityTaskQueue["getStats"]>} stats - 優先キューの統計情報
 * @returns {string} フォーマットされた統計情報文字列
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
