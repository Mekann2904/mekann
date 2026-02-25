/**
 * @abdd.meta
 * path: .pi/lib/dag-executor.ts
 * role: DAG構造のタスクを実行するエンジン（DynTaskMAS統合版）
 * why: 依存関係を解決しながらタスクを並列実行し、LLMCompilerとDynTaskMASの概念を実装するため
 * related: .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts, .pi/lib/concurrency.ts, .pi/lib/dag-weight-calculator.ts, .pi/lib/priority-scheduler.ts
 * public_api: DagExecutor, DagExecutorOptions, TaskExecutor, executeDag, addDependency, removeDependency, detectCycle
 * invariants: 実行中は依存関係の順序が保証される
 * side_effects: タスク実行、コールバック呼び出し
 * failure_modes: タスク実行エラー、中止シグナル、依存関係エラー
 * @abdd.explain
 * overview: タスクプラン（DAG）を受け取り、DynTaskMASの重みベーススケジューリングで最適化実行する
 * what_it_does:
 *   - 依存グラフの構築と初期化
 *   - 重み計算による優先度スケジューリング（オプトイン）
 *   - 実行可能タスクの特定と並列実行
 *   - 依存タスクからのコンテキスト注入
 *   - 動的重み更新（完了/失敗時）
 *   - 結果の収集と統計の生成
 * why_it_exists:
 *   - 複雑なタスクを独立したサブタスクに分解し、並列実行でレイテンシを削減する
 *   - DynTaskMAS論文の重みベーススケジューリングで実行効率を向上させる
 * scope:
 *   in: TaskPlan、TaskExecutor関数、オプション
 *   out: DagResult（タスク結果、統計、ステータス）
 */

// File: .pi/lib/dag-executor.ts
// Description: Executes tasks with dependency resolution (LLMCompiler + DynTaskMAS integration).
// Why: Enables dependency-aware parallel task execution with weight-based scheduling optimization.
// Related: .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts, .pi/lib/concurrency.ts

import { TaskDependencyGraph, TaskDependencyNode } from "./task-dependencies.js";
import { runWithConcurrencyLimit, ConcurrencyRunOptions } from "./concurrency.js";
import { TaskPlan, TaskNode, DagTaskResult, DagResult } from "./dag-types.js";
import { createChildAbortController } from "./abort-utils.js";
import { DagExecutionError } from "./dag-errors.js";
import {
  calculateTotalTaskWeight,
  DEFAULT_WEIGHT_CONFIG,
  type WeightConfig,
} from "./dag-weight-calculator.js";
import {
  PriorityScheduler,
  DEFAULT_SCHEDULER_CONFIG,
  type SchedulerConfig,
} from "./priority-scheduler.js";

/**
 * DAG実行のオプション
 * @summary 実行オプション
 * @param signal - 中止シグナル
 * @param maxConcurrency - 最大並列数
 * @param abortOnFirstError - 最初のエラーで中止するかどうか
 * @param contextInjector - コンテキスト注入関数
 * @param onTaskStart - タスク開始時コールバック
 * @param onTaskComplete - タスク完了時コールバック
 * @param onTaskError - タスクエラー時コールバック
 * @param useWeightBasedScheduling - DynTaskMAS重みベーススケジューリングを使用するか
 * @param weightConfig - 重み計算設定
 * @param schedulerConfig - スケジューラ設定
 */
export interface DagExecutorOptions {
  /** 中止シグナル */
  signal?: AbortSignal;
  /** 最大並列数（デフォルト: 4） */
  maxConcurrency?: number;
  /** 最初のエラーで中止するかどうか（デフォルト: false） */
  abortOnFirstError?: boolean;
  /** コンテキスト注入関数 */
  contextInjector?: (task: TaskNode, results: Map<string, DagTaskResult>) => string;
  /** タスク開始時コールバック */
  onTaskStart?: (taskId: string) => void;
  /** タスク完了時コールバック */
  onTaskComplete?: (taskId: string, result: DagTaskResult) => void;
  /** タスクエラー時コールバック */
  onTaskError?: (taskId: string, error: Error) => void;
  /** DynTaskMAS重みベーススケジューリングを使用するか（デフォルト: true） */
  useWeightBasedScheduling?: boolean;
  /** 重み計算設定 */
  weightConfig?: WeightConfig;
  /** スケジューラ設定 */
  schedulerConfig?: SchedulerConfig;
}

/**
 * タスク実行関数の型
 * @summary タスク実行関数
 * @param task - タスクノード
 * @param context - 依存タスクからのコンテキスト
 * @param signal - 中止シグナル
 * @returns タスクの出力
 */
export type TaskExecutor<T = unknown> = (
  task: TaskNode,
  context: string,
  signal?: AbortSignal,
) => Promise<T>;

/**
 * バッチ実行用の内部アイテム型
 */
interface BatchItem {
  node: TaskDependencyNode;
  taskNode: TaskNode;
  context: string;
}

/**
 * バッチ実行用の内部結果型
 */
interface BatchResult<T> {
  taskId: string;
  status: "completed" | "failed";
  output?: T;
  error?: Error;
  durationMs: number;
}

/**
 * DAG Executor - 依存関係解決付きタスク実行エンジン（DynTaskMAS統合版）
 * @summary DAG実行エンジン
 * @example
 * const executor = new DagExecutor(plan, { 
 *   maxConcurrency: 3,
 *   useWeightBasedScheduling: true 
 * });
 * const result = await executor.execute(async (task, context) => {
 *   return await runSubagent(task.assignedAgent, task.description);
 * });
 */
export class DagExecutor<T = unknown> {
  private graph: TaskDependencyGraph;
  private taskNodes: Map<string, TaskNode>;
  private results: Map<string, DagTaskResult<T>>;
  private plan: TaskPlan;
  private options: Required<
    Pick<DagExecutorOptions, "maxConcurrency" | "abortOnFirstError" | "useWeightBasedScheduling">
  > &
    DagExecutorOptions;
  private startTime: number = 0;
  private scheduler: PriorityScheduler | null = null;
  private taskWeights: Map<string, number> = new Map();

  /**
   * DAG Executorを作成
   * @summary コンストラクタ
   * @param plan - タスクプラン
   * @param options - 実行オプション
   * @throws プランに循環または欠損依存がある場合
   */
  constructor(plan: TaskPlan, options: DagExecutorOptions = {}) {
    this.graph = new TaskDependencyGraph();
    this.taskNodes = new Map();
    this.results = new Map();
    this.plan = plan;
    this.options = {
      maxConcurrency: 4,
      abortOnFirstError: false,
      useWeightBasedScheduling: true,
      ...options,
    };

    // DynTaskMASスケジューラの初期化
    if (this.options.useWeightBasedScheduling) {
      const schedulerConfig: SchedulerConfig = {
        maxConcurrency: this.options.maxConcurrency,
        starvationPreventionInterval: 30000,
        ...this.options.schedulerConfig,
      };
      this.scheduler = new PriorityScheduler(schedulerConfig);
    }

    this.initializeGraph();
  }

  /**
   * 依存グラフを初期化
   * @summary グラフ初期化
   * @throws 循環または欠損依存がある場合
   */
  private initializeGraph(): void {
    const added = new Set<string>();
    const pending = [...this.plan.tasks];

    // 依存関係順にタスクを追加
    while (pending.length > 0) {
      let addedAny = false;

      for (let i = pending.length - 1; i >= 0; i--) {
        const task = pending[i];
        if (task.dependencies.every((d) => added.has(d))) {
          this.graph.addTask(task.id, {
            name: task.description,
            dependencies: task.dependencies,
            priority: task.priority,
            estimatedDurationMs: task.estimatedDurationMs,
          });
          this.taskNodes.set(task.id, task);
          added.add(task.id);
          pending.splice(i, 1);
          addedAny = true;
        }
      }

      if (!addedAny && pending.length > 0) {
        throw new DagExecutionError(
          "Cannot initialize graph: cycle or missing dependencies detected",
          "VALIDATION_FAILED",
        );
      }
    }

    // DynTaskMAS: 初期重みを計算
    if (this.options.useWeightBasedScheduling) {
      this.calculateAllTaskWeights();
    }
  }

  /**
   * 全タスクの重みを計算
   * DynTaskMAS論文のW(v_i, v_j) = α·C(v_j) + β·I(v_i, v_j)
   * @summary 重み計算
   * @internal
   */
  private calculateAllTaskWeights(): void {
    const weightConfig = this.options.weightConfig ?? DEFAULT_WEIGHT_CONFIG;

    for (const task of this.plan.tasks) {
      const weight = calculateTotalTaskWeight(task, this.taskNodes, weightConfig);
      this.taskWeights.set(task.id, weight);
    }
  }

  /**
   * 指定タスクの重みを更新（完了/失敗時）
   * @summary 重み更新
   * @param taskId - タスクID
   * @param status - 新しいステータス
   * @internal
   */
  private updateTaskWeight(taskId: string, status: "completed" | "failed"): void {
    if (!this.options.useWeightBasedScheduling) return;

    if (status === "completed") {
      // 完了タスクへの依存重みを0に
      this.taskWeights.set(taskId, 0);
    } else if (status === "failed") {
      // 失敗タスクの重みを1.5倍に増加（再試行優先）
      const currentWeight = this.taskWeights.get(taskId) ?? 0;
      this.taskWeights.set(taskId, currentWeight * 1.5);
    }
  }

  /**
   * DAGを実行
   * @summary DAG実行
   * @param executor - タスク実行関数
   * @returns 実行結果
   */
  async execute(executor: TaskExecutor<T>): Promise<DagResult<T>> {
    this.startTime = Date.now();
    const { controller, cleanup } = createChildAbortController(this.options.signal);

    try {
      // 初期実行可能タスクを取得
      let readyTasks = this.graph.getReadyTasks();

      while (readyTasks.length > 0) {
        // 中止チェック
        if (controller.signal.aborted) {
          break;
        }

        // 実行可能タスクを並列実行
        await this.executeBatch(readyTasks, executor, controller.signal);

        // 次のバッチを取得
        readyTasks = this.graph.getReadyTasks();
      }

      return this.buildResult();
    } finally {
      cleanup();
    }
  }

  /**
   * タスクのバッチを並列実行
   * DynTaskMAS: 重みベーススケジューリングを適用
   * @summary バッチ実行
   * @param tasks - 実行対象のタスクノード
   * @param executor - タスク実行関数
   * @param signal - 中止シグナル
   */
  private async executeBatch(
    tasks: TaskDependencyNode[],
    executor: TaskExecutor<T>,
    signal?: AbortSignal,
  ): Promise<void> {
    // DynTaskMAS: 重みベーススケジューリングを適用
    let orderedTasks = tasks;
    if (this.options.useWeightBasedScheduling && this.scheduler) {
      const taskNodes = tasks
        .map((n) => this.taskNodes.get(n.id))
        .filter((t): t is TaskNode => t !== undefined);

      const scheduledTaskNodes = this.scheduler.scheduleTasks(taskNodes, this.taskWeights);
      const scheduledIds = new Set(scheduledTaskNodes.map((t) => t.id));
      
      // スケジュール順に並べ替え
      orderedTasks = tasks
        .filter((n) => scheduledIds.has(n.id))
        .sort((a, b) => {
          const aIdx = scheduledTaskNodes.findIndex((t) => t.id === a.id);
          const bIdx = scheduledTaskNodes.findIndex((t) => t.id === b.id);
          return aIdx - bIdx;
        });
    }
    // バッチアイテムを準備（重み順でソート済み）
    const taskItems: BatchItem[] = orderedTasks.map((node) => {
      const taskNode = this.taskNodes.get(node.id)!;
      const context = this.buildContext(taskNode);

      // 実行中にマーク
      this.graph.markRunning(node.id);
      this.options.onTaskStart?.(node.id);

      return { node, taskNode, context };
    });

    // runWithConcurrencyLimitで並列実行
    const batchResults = await this.executeWithConcurrencyLimit(
      taskItems,
      executor,
      signal,
    );

    // 結果を処理
    for (const result of batchResults) {
      this.results.set(result.taskId, {
        taskId: result.taskId,
        status: result.status,
        output: result.output,
        error: result.error,
        durationMs: result.durationMs,
      });

      if (result.status === "completed") {
        this.graph.markCompleted(result.taskId);
        // DynTaskMAS: 完了タスクの重みを更新
        this.updateTaskWeight(result.taskId, "completed");
        // スケジューラに完了を記録
        this.scheduler?.markCompleted(result.taskId);
        this.options.onTaskComplete?.(result.taskId, this.results.get(result.taskId)!);
      } else {
        this.graph.markFailed(result.taskId, result.error);
        // DynTaskMAS: 失敗タスクの重みを更新
        this.updateTaskWeight(result.taskId, "failed");
        this.options.onTaskError?.(result.taskId, result.error!);

        if (this.options.abortOnFirstError) {
          throw result.error;
        }
      }
    }
  }

  /**
   * 並列数制限付きでタスクを実行
   * @summary 並列実行
   * @param items - バッチアイテム
   * @param executor - タスク実行関数
   * @param signal - 中止シグナル
   * @returns 実行結果
   */
  private async executeWithConcurrencyLimit(
    items: BatchItem[],
    executor: TaskExecutor<T>,
    signal?: AbortSignal,
  ): Promise<BatchResult<T>[]> {
    const concurrencyOptions: ConcurrencyRunOptions = {
      signal,
      abortOnError: false,
    };

    return runWithConcurrencyLimit<BatchItem, BatchResult<T>>(
      items,
      this.options.maxConcurrency,
      async (item, _index, workerSignal) => {
        const startMs = Date.now();

        try {
          const output = await executor(item.taskNode, item.context, workerSignal);
          const durationMs = Date.now() - startMs;

          return {
            taskId: item.node.id,
            status: "completed" as const,
            output,
            durationMs,
          };
        } catch (error) {
          const durationMs = Date.now() - startMs;
          return {
            taskId: item.node.id,
            status: "failed" as const,
            error: error instanceof Error ? error : new Error(String(error)),
            durationMs,
          };
        }
      },
      concurrencyOptions,
    );
  }

  /**
   * 依存タスクの結果からコンテキストを構築
   * @summary コンテキスト構築
   * @param task - タスクノード
   * @returns コンテキスト文字列
   */
  private buildContext(task: TaskNode): string {
    // カスタムインジェクターがある場合は使用
    if (this.options.contextInjector) {
      return this.options.contextInjector(task, this.results);
    }

    // デフォルトのコンテキスト構築
    const contexts: string[] = [];
    const inputContextIds = task.inputContext ?? task.dependencies;

    for (const depId of inputContextIds) {
      const result = this.results.get(depId);
      if (result?.status === "completed" && result.output !== undefined) {
        const outputStr =
          typeof result.output === "string"
            ? result.output
            : JSON.stringify(result.output, null, 2);
        contexts.push(`## Result from ${depId}\n${outputStr}`);
      }
    }

    return contexts.join("\n\n");
  }

  /**
   * 最終結果を構築
   * @summary 結果構築
   * @returns DAG実行結果
   */
  private buildResult(): DagResult<T> {
    const completedTaskIds: string[] = [];
    const failedTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];

    // 結果を分類
    for (const [id, result] of Array.from(this.results.entries())) {
      if (result.status === "completed") {
        completedTaskIds.push(id);
      } else if (result.status === "failed") {
        failedTaskIds.push(id);
      } else {
        skippedTaskIds.push(id);
      }
    }

    // 実行されなかったタスクをスキップとして追加
    for (const task of this.plan.tasks) {
      if (!this.results.has(task.id)) {
        skippedTaskIds.push(task.id);
      }
    }

    // 全体ステータスの決定
    let overallStatus: "completed" | "partial" | "failed";
    if (failedTaskIds.length === 0) {
      overallStatus = "completed";
    } else if (completedTaskIds.length > 0) {
      overallStatus = "partial";
    } else {
      overallStatus = "failed";
    }

    return {
      planId: this.plan.id,
      taskResults: this.results,
      overallStatus,
      totalDurationMs: Date.now() - this.startTime,
      completedTaskIds,
      failedTaskIds,
      skippedTaskIds,
    };
  }

  /**
   * 現在の実行統計を取得
   * @summary 統計取得
   * @returns 実行統計
   */
  getStats(): {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  } {
    const graphStats = this.graph.getStats();
    return {
      total: graphStats.total,
      completed: graphStats.completedCount,
      failed: graphStats.failedCount,
      pending: graphStats.byStatus.pending,
      running: graphStats.byStatus.running,
    };
  }

  // ========================================
  // 動的依存関係更新API
  // ========================================

  /**
   * 依存関係を動的に追加する
   * 実行中に新しい依存関係を追加できる。サイクルが発生する場合はエラーを投げる。
   * @summary 依存関係を追加
   * @param taskId - 対象タスクID
   * @param dependencyId - 追加する依存先タスクID
   * @throws タスクが存在しない場合
   * @throws 依存先タスクが存在しない場合
   * @throws 既に依存関係が存在する場合
   * @throws サイクルが発生する場合
   * @example
   * executor.addDependency('task-b', 'task-a'); // task-b depends on task-a
   */
  addDependency(taskId: string, dependencyId: string): void {
    this.graph.addDependency(taskId, dependencyId);

    // TaskNodeの依存関係も更新
    const taskNode = this.taskNodes.get(taskId);
    if (taskNode && !taskNode.dependencies.includes(dependencyId)) {
      taskNode.dependencies.push(dependencyId);
    }

    // DynTaskMAS: 重みを再計算
    if (this.options.useWeightBasedScheduling) {
      this.recalculateTaskWeight(taskId);
    }
  }

  /**
   * 依存関係を動的に削除する
   * @summary 依存関係を削除
   * @param taskId - 対象タスクID
   * @param dependencyId - 削除する依存先タスクID
   * @returns 削除に成功した場合はtrue、依存関係が存在しない場合はfalse
   * @throws タスクが存在しない場合
   * @example
   * executor.removeDependency('task-b', 'task-a'); // Remove task-b's dependency on task-a
   */
  removeDependency(taskId: string, dependencyId: string): boolean {
    const result = this.graph.removeDependency(taskId, dependencyId);

    if (result) {
      // TaskNodeの依存関係も更新
      const taskNode = this.taskNodes.get(taskId);
      if (taskNode) {
        const index = taskNode.dependencies.indexOf(dependencyId);
        if (index >= 0) {
          taskNode.dependencies.splice(index, 1);
        }
      }

      // DynTaskMAS: 重みを再計算
      if (this.options.useWeightBasedScheduling) {
        this.recalculateTaskWeight(taskId);
      }
    }

    return result;
  }

  /**
   * グラフ内のサイクルを検出する
   * @summary サイクルを検出
   * @returns サイクル検出の結果（hasCycle: サイクルがあるか, cyclePath: サイクルパス）
   */
  detectCycle(): { hasCycle: boolean; cyclePath: string[] | null } {
    return this.graph.detectCycle();
  }

  /**
   * タスクの存在確認
   * @summary タスク確認
   * @param taskId - タスクID
   * @returns 存在する場合はtrue
   */
  hasTask(taskId: string): boolean {
    return this.graph.hasTask(taskId);
  }

  /**
   * タスクノードを取得する
   * @summary タスク取得
   * @param taskId - タスクID
   * @returns タスクノード。存在しない場合はundefined。
   */
  getTask(taskId: string): TaskNode | undefined {
    return this.taskNodes.get(taskId);
  }

  /**
   * 指定タスクの重みを再計算
   * @summary 重み再計算
   * @param taskId - タスクID
   * @internal
   */
  private recalculateTaskWeight(taskId: string): void {
    const taskNode = this.taskNodes.get(taskId);
    if (taskNode) {
      const weightConfig = this.options.weightConfig ?? DEFAULT_WEIGHT_CONFIG;
      const weight = calculateTotalTaskWeight(taskNode, this.taskNodes, weightConfig);
      this.taskWeights.set(taskId, weight);
    }
  }
}

/**
 * DAG実行の簡易関数
 * @summary DAG実行
 * @param plan - タスクプラン
 * @param executor - タスク実行関数
 * @param options - 実行オプション
 * @returns 実行結果
 * @example
 * const result = await executeDag(plan, async (task, context) => {
 *   return await runSubagent(task.assignedAgent ?? "implementer", task.description);
 * });
 */
export async function executeDag<T = unknown>(
  plan: TaskPlan,
  executor: TaskExecutor<T>,
  options: DagExecutorOptions = {},
): Promise<DagResult<T>> {
  const dagExecutor = new DagExecutor<T>(plan, options);
  return dagExecutor.execute(executor);
}

/**
 * サブエージェント用のDAG実行オプション
 * @summary サブエージェントDAGオプション
 */
export interface SubagentDagOptions {
  /** タスクプラン */
  plan: TaskPlan;
  /** サブエージェント設定 */
  subagentConfig?: {
    /** 使用モデル */
    model?: string;
    /** 温度パラメータ */
    temperature?: number;
    /** 最大トークン数 */
    maxTokens?: number;
  };
}

/**
 * サブエージェント向けの実行プロンプトを構築
 * @summary プロンプト構築
 * @param task - タスクノード
 * @param context - 依存タスクからのコンテキスト
 * @returns 構築されたプロンプト
 */
export function buildSubagentPrompt(task: TaskNode, context: string): string {
  const sections: string[] = [];

  sections.push(`# Task: ${task.id}`);
  sections.push("");
  sections.push(task.description);

  if (context && context.trim().length > 0) {
    sections.push("");
    sections.push("## Context from Previous Tasks");
    sections.push(context);
  }

  if (task.assignedAgent) {
    sections.push("");
    sections.push(`## Assigned Agent: ${task.assignedAgent}`);
  }

  return sections.join("\n");
}
