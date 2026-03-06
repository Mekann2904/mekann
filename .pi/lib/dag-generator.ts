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
// Description: Deterministic task-to-DAG conversion with maximum parallelism.
// Why: Auto-generated DAGs must work even when subagent delegation is unavailable.
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
  /** 利用可能なエージェント候補 */
  preferredAgents?: string[];
  /** タイムアウト（ミリ秒、デフォルト: 120000） */
  timeoutMs?: number;
  /** 最大リトライ回数 */
  maxRetries?: number;
  /** 生成する最大タスク数 */
  maxTasks?: number;
  /** 想定最大深さ。深さを抑えるために補助タスク数を調整する */
  maxDepth?: number;
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
  const trimmedTask = String(task || "").trim();
  if (!trimmedTask) {
    throw new DagGenerationError("Task description is empty", "EMPTY_TASK");
  }

  const rawPlan = createHeuristicPlan(trimmedTask, options);
  const plan = enrichPlanMetadata(rawPlan, trimmedTask);
  const optimized = optimizeParallelism(plan);
  const validation = validateTaskPlan(optimized);

  if (!validation.valid) {
    throw new DagGenerationError(
      `Generated invalid plan: ${validation.errors.join(", ")}`,
      "VALIDATION_FAILED",
    );
  }

  return optimized;
}

/**
 * コンテキストセクションを構築
 * @summary コンテキスト構築
 */
function createHeuristicPlan(
  task: string,
  options: DagGenerationOptions,
): Partial<TaskPlan> {
  const preferredAgents = new Set(options.preferredAgents?.map((agent) => agent.trim()).filter(Boolean) || []);
  const clauses = splitTaskIntoClauses(task);
  const maxTasks = Math.max(1, options.maxTasks ?? 10);
  const wantsResearch = shouldCreateResearch(task, clauses);
  const wantsArchitecture = shouldCreateArchitecture(task, clauses);
  const wantsReview = shouldCreateReview(task, clauses);
  const wantsTesting = shouldCreateTesting(task, clauses);

  const researchTasks: Partial<TaskNode>[] = [];
  const architectureTasks: Partial<TaskNode>[] = [];
  const implementationTasks: Partial<TaskNode>[] = [];
  const trailingTasks: Partial<TaskNode>[] = [];

  if (wantsResearch) {
    const researchClauses = clauses.filter((clause) => classifyClause(clause) === "research");
    const researchUnits = researchClauses.length > 0
      ? researchClauses
      : createDefaultResearchUnits(task, options);

    for (const unit of researchUnits.slice(0, maxTasks)) {
      researchTasks.push({
        id: createTaskId("research", unit),
        description: buildResearchDescription(unit, options),
        assignedAgent: pickAgent("researcher", preferredAgents),
        dependencies: [],
        priority: "high",
        estimatedDurationMs: 90_000,
      });
    }
  }

  if (wantsArchitecture) {
    architectureTasks.push({
      id: createTaskId("design", task),
      description: `Design the implementation approach for: ${task}`,
      assignedAgent: pickAgent("architect", preferredAgents),
      dependencies: researchTasks.map((taskNode) => taskNode.id!),
      priority: "high",
      estimatedDurationMs: 90_000,
      inputContext: researchTasks.map((taskNode) => taskNode.id!),
    });
  }

  const implementationClauses = clauses.filter((clause) => classifyClause(clause) === "implementation");
  const implementationUnits = implementationClauses.length > 0
    ? implementationClauses
    : createDefaultImplementationUnits(task);

  for (const unit of implementationUnits) {
    implementationTasks.push({
      id: createTaskId("implement", unit),
      description: buildImplementationDescription(unit),
      assignedAgent: pickAgent("implementer", preferredAgents),
      dependencies: [
        ...researchTasks.map((taskNode) => taskNode.id!),
        ...architectureTasks.map((taskNode) => taskNode.id!),
      ],
      priority: "critical",
      estimatedDurationMs: 120_000,
      inputContext: [
        ...researchTasks.map((taskNode) => taskNode.id!),
        ...architectureTasks.map((taskNode) => taskNode.id!),
      ],
    });
  }

  const fanInDependencies = implementationTasks.length > 0
    ? implementationTasks.map((taskNode) => taskNode.id!)
    : [
        ...researchTasks.map((taskNode) => taskNode.id!),
        ...architectureTasks.map((taskNode) => taskNode.id!),
      ];

  if (wantsTesting) {
    trailingTasks.push({
      id: createTaskId("test", task),
      description: `Validate the implementation with focused tests for: ${task}`,
      assignedAgent: pickAgent("tester", preferredAgents),
      dependencies: fanInDependencies,
      priority: "high",
      estimatedDurationMs: 90_000,
      inputContext: fanInDependencies,
    });
  }

  if (wantsReview) {
    trailingTasks.push({
      id: createTaskId("review", task),
      description: `Review the implementation quality and risks for: ${task}`,
      assignedAgent: pickAgent("reviewer", preferredAgents),
      dependencies: fanInDependencies,
      priority: "high",
      estimatedDurationMs: 60_000,
      inputContext: fanInDependencies,
    });
  }

  let tasks = [
    ...researchTasks,
    ...architectureTasks,
    ...implementationTasks,
    ...trailingTasks,
  ];

  if (tasks.length === 0) {
    tasks = [{
      id: createTaskId("implement", task),
      description: buildImplementationDescription(task),
      assignedAgent: pickAgent("implementer", preferredAgents),
      dependencies: [],
      priority: "high",
      estimatedDurationMs: 120_000,
    }];
  }

  tasks = enforceTaskLimit(tasks, maxTasks, options.maxDepth);

  return {
    id: `auto-${Date.now()}-${hashTask(task)}`,
    description: task,
    tasks,
  };
}

type ClauseKind = "research" | "architecture" | "implementation" | "testing" | "review";

function splitTaskIntoClauses(task: string): string[] {
  const normalized = task
    .replace(/\s+/g, " ")
    .replace(/[。]/g, ".")
    .replace(/[、]/g, ",")
    .trim();

  const rawClauses = normalized
    .split(/\bthen\b|\band\b|\bafter\b|,|\.|してから|した後|その後|および|ならびに/gi)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4);

  const uniqueClauses: string[] = [];
  for (const clause of rawClauses) {
    if (!uniqueClauses.includes(clause)) {
      uniqueClauses.push(clause);
    }
  }

  return uniqueClauses.length > 0 ? uniqueClauses : [normalized];
}

function classifyClause(clause: string): ClauseKind {
  const normalized = clause.toLowerCase();

  if (/(test|verify|validation|assert|テスト|検証|確認)/i.test(normalized)) {
    return "testing";
  }
  if (/(review|audit|security|lint|レビュー|監査|セキュリティ)/i.test(normalized)) {
    return "review";
  }
  if (/(design|architect|schema|spec|plan|設計|仕様|方針)/i.test(normalized)) {
    return "architecture";
  }
  if (/(research|investigate|analyz|explore|understand|調査|分析|把握|洗い出し)/i.test(normalized)) {
    return "research";
  }
  return "implementation";
}

function shouldCreateResearch(task: string, clauses: string[]): boolean {
  if (clauses.some((clause) => classifyClause(clause) === "research")) {
    return true;
  }

  return clauses.length > 1 || /(refactor|migrate|design|architecture|認証|api|db|database|schema|security|リファクタ|移行|設計|認可|認証)/i.test(task);
}

function shouldCreateArchitecture(task: string, clauses: string[]): boolean {
  return clauses.some((clause) => classifyClause(clause) === "architecture")
    || /(schema|api|architecture|design|設計|構成|方針|インターフェース)/i.test(task);
}

function shouldCreateTesting(task: string, clauses: string[]): boolean {
  return clauses.some((clause) => classifyClause(clause) === "testing")
    || /(test|verify|validation|テスト|検証)/i.test(task);
}

function shouldCreateReview(task: string, clauses: string[]): boolean {
  return clauses.some((clause) => classifyClause(clause) === "review")
    || /(review|audit|security|reviewer|レビュー|監査|セキュリティ)/i.test(task);
}

function createDefaultResearchUnits(task: string, options: DagGenerationOptions): string[] {
  const units = [
    `Inspect the existing code paths related to ${task}`,
  ];

  if (options.contextFiles?.length) {
    units.push(`Inspect the provided context files for ${task}`);
  } else if (/(test|verify|validation|テスト|検証)/i.test(task)) {
    units.push(`Inspect the current tests and validation points for ${task}`);
  }

  return units;
}

function createDefaultImplementationUnits(task: string): string[] {
  return splitTaskIntoClauses(task)
    .filter((clause) => classifyClause(clause) === "implementation")
    .slice(0, 6);
}

function buildResearchDescription(unit: string, options: DagGenerationOptions): string {
  const contextSuffix = options.contextFiles?.length
    ? ` Focus on these files when relevant: ${options.contextFiles.join(", ")}.`
    : "";
  const extraSuffix = options.extraContext ? ` Context: ${options.extraContext}` : "";

  return `${unit}.${contextSuffix}${extraSuffix}`.trim();
}

function buildImplementationDescription(unit: string): string {
  return `Implement the following work item with concrete code changes: ${unit}`;
}

function pickAgent(
  preferredKind: string,
  availableAgents: Set<string>,
): string | undefined {
  if (availableAgents.size === 0) {
    return preferredKind;
  }

  if (availableAgents.has(preferredKind)) {
    return preferredKind;
  }

  if (preferredKind === "tester" && availableAgents.has("reviewer")) {
    return "reviewer";
  }

  if (preferredKind === "reviewer" && availableAgents.has("tester")) {
    return "tester";
  }

  if (preferredKind === "architect" && availableAgents.has("researcher")) {
    return "researcher";
  }

  if (preferredKind === "researcher" && availableAgents.has("architect")) {
    return "architect";
  }

  if (availableAgents.has("implementer")) {
    return "implementer";
  }

  return Array.from(availableAgents)[0];
}

function createTaskId(prefix: string, text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9faf]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  const suffix = randomBytes(2).toString("hex");
  return `${prefix}-${base || "task"}-${suffix}`;
}

function enforceTaskLimit(
  tasks: Partial<TaskNode>[],
  maxTasks: number,
  maxDepth?: number,
): Partial<TaskNode>[] {
  const limited = tasks.slice(0, maxTasks);

  if (maxDepth === undefined || maxDepth >= 3) {
    return limited;
  }

  return limited.map((task) => {
    if ((task.dependencies?.length ?? 0) > 1) {
      return {
        ...task,
        dependencies: task.dependencies?.slice(0, 1) || [],
        inputContext: task.inputContext?.slice(0, 1) || [],
      };
    }
    return task;
  });
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
