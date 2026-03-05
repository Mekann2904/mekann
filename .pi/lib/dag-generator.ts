/**
 * @abdd.meta
 * path: .pi/lib/dag-generator.ts
 * role: LLM-based Task-to-DAG conversion via task-planner subagent
 * why: Delegate deep reasoning to specialized agent for maximum parallelism
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts, .pi/extensions/subagents.ts
 * public_api: generateDagFromTask, DagGenerationOptions, DagGenerationError
 * invariants: Generated DAG must be valid (no cycles, all deps exist)
 * side_effects: Subagent execution for DAG generation
 * failure_modes: Subagent timeout, invalid JSON response, validation failure, max retries exceeded
 * @abdd.explain
 * overview: Delegates DAG generation to task-planner subagent for deep reasoning and maximum parallelism
 * what_it_does:
 *   - Delegates to task-planner subagent for intelligent task decomposition
 *   - Generates maximally parallel DAGs with unlimited concurrency
 *   - Validates and optimizes generated DAGs
 *   - Retries on failure with exponential backoff
 * why_it_exists: Rule-based generation is insufficient; LLM reasoning via subagent provides superior results
 * scope:
 *   in: Task description string, optional context
 *   out: Optimized TaskPlan ready for DagExecutor
 */

// File: .pi/lib/dag-generator.ts
// Description: Subagent-based Task-to-DAG conversion with maximum parallelism.
// Why: Deep reasoning requires specialized LLM agent; rules are insufficient.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/lib/dag-validator.ts

import { randomBytes } from "node:crypto";
import { TaskPlan, TaskNode, TaskNodePriority } from "./dag-types.js";
import { validateTaskPlan } from "./dag-validator.js";

/**
 * DAG生成オプション
 * @summary 生成オプション
 */
export interface DagGenerationOptions {
  /** コンテキストとして考慮するファイルパス */
  contextFiles?: string[];
  /** 追加のシステムコンテキスト */
  extraContext?: string;
  /** タイムアウト（ミリ秒、デフォルト: 120000） */
  timeoutMs?: number;
  /** 最大リトライ回数 */
  maxRetries?: number;
}

/**
 * DAG生成エラー
 */
export class DagGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DagGenerationError";
  }
}

/**
 * タスク記述からDAGを生成する（task-plannerサブエージェント使用）
 * @summary Subagent-based Task-to-DAG変換
 * @param task - タスク記述
 * @param options - 生成オプション
 * @returns 生成されたTaskPlan
 * @throws DagGenerationError 生成に失敗した場合
 * @example
 * const plan = await generateDagFromTask("認証システムを実装してテストを追加");
 */
export async function generateDagFromTask(
  task: string,
  options: DagGenerationOptions = {},
): Promise<TaskPlan> {
  const {
    timeoutMs = 120000,
    maxRetries = 2,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Step 1: task-plannerサブエージェントに委任
      const subagentResult = await delegateToTaskPlanner(task, options, timeoutMs);

      // Step 2: レスポンスをパース
      const parsedPlan = parseSubagentResponse(subagentResult);

      // Step 3: メタデータを付与
      const plan = enrichPlanMetadata(parsedPlan, task);

      // Step 4: 厳格な検証
      const validation = validateTaskPlan(plan);
      if (!validation.valid) {
        throw new DagGenerationError(
          `Generated invalid plan: ${validation.errors.join(", ")}`,
          "VALIDATION_FAILED",
        );
      }

      // Step 5: 並列度最適化
      return optimizeParallelism(plan);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s
        console.log(`[dag-generator] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  throw new DagGenerationError(
    `Failed to generate DAG after ${maxRetries + 1} attempts: ${lastError?.message}`,
    "MAX_RETRIES_EXCEEDED",
    lastError,
  );
}

/**
 * task-plannerサブエージェントに委任
 * @summary サブエージェント委任
 */
async function delegateToTaskPlanner(
  task: string,
  options: DagGenerationOptions,
  timeoutMs: number,
): Promise<string> {
  const contextSection = buildContextSection(options);

  const subagentTask = `Generate a maximally parallel DAG for this task:

## Task
${task}

${contextSection}

Return ONLY valid JSON with the DAG structure. Ensure maximum parallelism by:
1. Creating multiple independent research/analysis tasks when applicable
2. Delaying integration points as much as possible
3. Only adding dependencies when truly necessary
4. Breaking down into fine-grained, independently executable units`;

  // Dynamic import to avoid circular dependency
  const { subagent_run } = await import("../extensions/subagents.js");

  const result = await subagent_run({
    subagentId: "task-planner",
    task: subagentTask,
    timeoutMs,
  });

  // Extract text content from result
  if (typeof result === "string") {
    return result;
  }

  if (result && typeof result === "object") {
    // Handle MCP tool result format
    const content = (result as any).content;
    if (Array.isArray(content) && content[0]?.text) {
      return content[0].text;
    }
    if ((result as any).text) {
      return (result as any).text;
    }
    return JSON.stringify(result);
  }

  throw new DagGenerationError(
    "Unexpected subagent response format",
    "INVALID_RESPONSE_FORMAT",
  );
}

/**
 * コンテキストセクションを構築
 * @summary コンテキスト構築
 */
function buildContextSection(options: DagGenerationOptions): string {
  const sections: string[] = [];

  if (options.contextFiles?.length) {
    sections.push(`## Context Files\n${options.contextFiles.map(f => `- ${f}`).join("\n")}`);
  }

  if (options.extraContext) {
    sections.push(`## Additional Context\n${options.extraContext}`);
  }

  return sections.join("\n\n");
}

/**
 * サブエージェントレスポンスをパース
 * @summary JSONパース
 */
function parseSubagentResponse(response: string): Partial<TaskPlan> {
  // JSONブロックを抽出
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/i) ||
                    response.match(/```\s*([\s\S]*?)```/) ||
                    response.match(/(\{[\s\S]*"tasks"[\s\S]*\})/);

  const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();

  try {
    const parsed = JSON.parse(jsonStr);

    // 必須フィールドの検証
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new DagGenerationError(
        "Invalid response: 'tasks' array is required",
        "PARSE_ERROR",
      );
    }

    if (parsed.tasks.length === 0) {
      throw new DagGenerationError(
        "Invalid response: 'tasks' array is empty",
        "PARSE_ERROR",
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof DagGenerationError) throw error;
    throw new DagGenerationError(
      `Failed to parse subagent response as JSON: ${error instanceof Error ? error.message : String(error)}`,
      "PARSE_ERROR",
      error,
    );
  }
}

/**
 * プランにメタデータを付与
 * @summary メタデータ付与
 */
function enrichPlanMetadata(
  parsed: Partial<TaskPlan>,
  originalTask: string,
): TaskPlan {
  const tasks = parsed.tasks || [];

  return {
    id: parsed.id || `llm-${Date.now()}-${hashTask(originalTask)}`,
    description: parsed.description || originalTask,
    tasks: tasks.map((t: Partial<TaskNode>): TaskNode => ({
      id: t.id || `task-${randomBytes(4).toString("hex")}`,
      description: t.description || "No description provided",
      assignedAgent: t.assignedAgent,
      dependencies: t.dependencies || [],
      priority: (t.priority as TaskNodePriority) || "normal",
      estimatedDurationMs: t.estimatedDurationMs || 120000,
      inputContext: t.inputContext,
    })),
    metadata: {
      createdAt: Date.now(),
      model: "task-planner-subagent",
      totalEstimatedMs: estimateTotalDuration(tasks as TaskNode[]),
      maxDepth: calculateMaxDepth(tasks as TaskNode[]),
    },
  };
}

/**
 * 並列度をさらに最適化
 * @summary 並列度最適化
 */
function optimizeParallelism(plan: TaskPlan): TaskPlan {
  const optimizedTasks = removeRedundantDependencies(plan.tasks);

  return {
    ...plan,
    tasks: optimizedTasks,
    metadata: {
      ...plan.metadata,
      totalEstimatedMs: estimateTotalDuration(optimizedTasks),
      maxDepth: calculateMaxDepth(optimizedTasks),
    },
  };
}

/**
 * 冗長な依存関係を削除（推移的簡約）
 * @summary 依存関係最適化
 */
function removeRedundantDependencies(tasks: TaskNode[]): TaskNode[] {
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // 推移閉包を計算
  const transitiveDeps = new Map<string, Set<string>>();

  const getAllDeps = (taskId: string, visited = new Set<string>()): Set<string> => {
    if (transitiveDeps.has(taskId)) {
      return transitiveDeps.get(taskId)!;
    }
    if (visited.has(taskId)) {
      return new Set();
    }
    visited.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) {
      return new Set();
    }

    const allDeps = new Set<string>();
    for (const dep of task.dependencies) {
      allDeps.add(dep);
      const subDeps = getAllDeps(dep, visited);
      subDeps.forEach(d => allDeps.add(d));
    }

    transitiveDeps.set(taskId, allDeps);
    return allDeps;
  };

  // 各タスクの全依存を計算
  tasks.forEach(t => getAllDeps(t.id));

  // 冗長な直接依存を削除
  return tasks.map(task => {
    const minimalDeps = task.dependencies.filter(dep => {
      // dep が他の依存の推移的依存でないかチェック
      const otherDeps = task.dependencies.filter(d => d !== dep);
      const otherTransitive = new Set<string>();
      otherDeps.forEach(d => {
        transitiveDeps.get(d)?.forEach(td => otherTransitive.add(td));
      });
      return !otherTransitive.has(dep);
    });

    return { ...task, dependencies: minimalDeps };
  });
}

/**
 * タスク文字列をハッシュ化
 * @summary タスクハッシュ
 */
function hashTask(task: string): string {
  const hash = task.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomBytes(4).toString("hex");
  return `${hash}-${suffix}`;
}

/**
 * スリープ関数
 * @summary 非同期待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 総実行時間を推定（クリティカルパス）
 * @summary 総時間推定
 */
function estimateTotalDuration(tasks: TaskNode[]): number {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const memo = new Map<string, number>();

  const getPathDuration = (taskId: string): number => {
    if (memo.has(taskId)) {
      return memo.get(taskId)!;
    }

    const task = taskMap.get(taskId);
    if (!task) {
      return 0;
    }

    const ownDuration = task.estimatedDurationMs || 120000;

    if (task.dependencies.length === 0) {
      memo.set(taskId, ownDuration);
      return ownDuration;
    }

    const maxDepDuration = Math.max(
      ...task.dependencies.map(dep => getPathDuration(dep)),
      0,
    );

    const total = ownDuration + maxDepDuration;
    memo.set(taskId, total);
    return total;
  };

  const criticalPathDuration = Math.max(...tasks.map(t => getPathDuration(t.id)), 0);
  return criticalPathDuration;
}

/**
 * 最大深さを計算
 * @summary 最大深さ計算
 */
function calculateMaxDepth(tasks: TaskNode[]): number {
  const depths = new Map<string, number>();

  const getDepth = (taskId: string, visited = new Set<string>()): number => {
    if (depths.has(taskId)) {
      return depths.get(taskId)!;
    }
    if (visited.has(taskId)) {
      return 0;
    }
    visited.add(taskId);

    const task = tasks.find(t => t.id === taskId);
    if (!task || task.dependencies.length === 0) {
      depths.set(taskId, 0);
      return 0;
    }

    const maxDepDepth = Math.max(
      ...task.dependencies.map(depId => getDepth(depId, visited)),
      0,
    );
    const depth = maxDepDepth + 1;
    depths.set(taskId, depth);
    return depth;
  };

  let maxDepth = 0;
  for (const task of tasks) {
    maxDepth = Math.max(maxDepth, getDepth(task.id));
  }

  return maxDepth;
}
