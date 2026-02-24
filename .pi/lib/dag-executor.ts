/**
 * @abdd.meta
 * path: .pi/lib/dag-executor.ts
 * role: DAG構造のタスクを実行するエンジン
 * why: 依存関係を解決しながらタスクを並列実行し、LLMCompilerの概念を実装するため
 * related: .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts, .pi/lib/concurrency.ts
 * public_api: DagExecutor, DagExecutorOptions, TaskExecutor, executeDag
 * invariants: 実行中は依存関係の順序が保証される
 * side_effects: タスク実行、コールバック呼び出し
 * failure_modes: タスク実行エラー、中止シグナル、依存関係エラー
 * @abdd.explain
 * overview: タスクプラン（DAG）を受け取り、依存関係を解決しながら並列実行する
 * what_it_does:
 *   - 依存グラフの構築と初期化
 *   - 実行可能タスクの特定と並列実行
 *   - 依存タスクからのコンテキスト注入
 *   - 結果の収集と統計の生成
 * why_it_exists:
 *   - 複雑なタスクを独立したサブタスクに分解し、並列実行でレイテンシを削減する
 *   - 既存のrunWithConcurrencyLimitとTaskDependencyGraphを統合する
 * scope:
 *   in: TaskPlan、TaskExecutor関数、オプション
 *   out: DagResult（タスク結果、統計、ステータス）
 */

// File: .pi/lib/dag-executor.ts
// Description: Executes tasks with dependency resolution (LLMCompiler integration).
// Why: Enables dependency-aware parallel task execution for reduced latency.
// Related: .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts, .pi/lib/task-dependencies.ts, .pi/lib/concurrency.ts

import { TaskDependencyGraph, TaskDependencyNode } from "./task-dependencies.js";
import { runWithConcurrencyLimit, ConcurrencyRunOptions } from "./concurrency.js";
import { TaskPlan, TaskNode, DagTaskResult, DagResult } from "./dag-types.js";
import { createChildAbortController } from "./abort-utils.js";
import { DagExecutionError } from "./dag-errors.js";

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
 * DAG Executor - 依存関係解決付きタスク実行エンジン
 * @summary DAG実行エンジン
 * @example
 * const executor = new DagExecutor(plan, { maxConcurrency: 3 });
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
    Pick<DagExecutorOptions, "maxConcurrency" | "abortOnFirstError">
  > &
    DagExecutorOptions;
  private startTime: number = 0;

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
      ...options,
    };

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
    // バッチアイテムを準備
    const taskItems: BatchItem[] = tasks.map((node) => {
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
        this.options.onTaskComplete?.(result.taskId, this.results.get(result.taskId)!);
      } else {
        this.graph.markFailed(result.taskId, result.error);
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
    for (const [id, result] of this.results) {
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
