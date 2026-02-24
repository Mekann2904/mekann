/**
 * @abdd.meta
 * path: .pi/lib/dag-generator.ts
 * role: Task-to-DAG conversion using task-planner skill logic
 * why: Enable automatic DAG generation when plan parameter is omitted
 * related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/skills/task-planner/SKILL.md
 * public_api: generateDagFromTask, analyzeTaskSignals, DagGenerationOptions
 * invariants: Generated DAG must be valid (no cycles, all deps exist)
 * side_effects: None (pure function)
 * failure_modes: Invalid task description, timeout during generation
 * @abdd.explain
 * overview: Converts natural language task into TaskPlan DAG
 * what_it_does:
 *   - Analyzes task description for subtask indicators
 *   - Detects dependency patterns (sequential, parallel, fan-out, fan-in)
 *   - Assigns appropriate agent types based on task nature
 *   - Estimates duration based on task complexity
 * why_it_exists: Automate DAG creation for simpler workflows
 * scope:
 *   in: Task description string, optional context
 *   out: TaskPlan object ready for DagExecutor
 */

// File: .pi/lib/dag-generator.ts
// Description: Task-to-DAG conversion for automatic plan generation.
// Why: Enables subagent_run_dag to work without explicit plan parameter.
// Related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, .pi/skills/task-planner/SKILL.md

import { randomBytes } from "node:crypto";
import { TaskPlan, TaskNode, TaskNodePriority, AgentType } from "./dag-types.js";
import { validateTaskPlan, type ValidationResult } from "./dag-validator.js";

/**
 * DAG生成オプション
 * @summary 生成オプション
 */
export interface DagGenerationOptions {
  /** 依存チェーンの最大深さ（デフォルト: 4） */
  maxDepth?: number;
  /** 生成するサブタスクの最大数（デフォルト: 10） */
  maxTasks?: number;
  /** フォールバック時のデフォルトエージェント */
  defaultAgent?: string;
  /** コンテキストとして考慮するファイル */
  contextFiles?: string[];
  /** タイムアウト（ミリ秒、デフォルト: 5000） */
  timeoutMs?: number;
}

/**
 * タスク信号分析結果
 * @summary タスク信号
 */
export interface TaskSignal {
  /** 検出されたパターンタイプ */
  type: "sequential" | "parallel" | "research-first" | "review-required" | "testing-required";
  /** 抽出されたコンポーネント */
  components: string[];
  /** 複数ファイルに関連するか */
  hasMultipleFiles: boolean;
  /** 明示的なステップ指示があるか */
  hasExplicitSteps: boolean;
  /** 推定複雑度 */
  estimatedComplexity: "low" | "medium" | "high";
  /** 研究が必要か */
  needsResearch: boolean;
  /** レビューが必要か */
  needsReview: boolean;
  /** テストが必要か */
  needsTesting: boolean;
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
 * タスク記述からDAGを生成する
 * @summary Task-to-DAG変換
 * @param task - タスク記述
 * @param options - 生成オプション
 * @returns 生成されたTaskPlan
 * @throws DagGenerationError 生成に失敗した場合
 * @example
 * const plan = await generateDagFromTask("認証システムを実装してテストを追加");
 * // Returns TaskPlan with research -> implement -> test tasks
 */
export async function generateDagFromTask(
  task: string,
  options: DagGenerationOptions = {},
): Promise<TaskPlan> {
  const {
    maxDepth = 4,
    maxTasks = 10,
    defaultAgent = "implementer",
  } = options;

  // Step 1: タスク信号を分析
  const signals = analyzeTaskSignals(task);

  // Step 2: 信号に基づいてサブタスクを生成
  const subtasks = generateSubtasks(task, signals, { maxTasks, defaultAgent });

  // Step 3: サブタスク間の依存関係を推論
  const tasksWithDeps = inferDependencies(subtasks, { maxDepth, signals });

  // Step 4: エージェントと優先度を割り当て
  const finalTasks = assignAgentsAndPriorities(tasksWithDeps, signals);

  // Step 5: TaskPlanを構築
  const plan: TaskPlan = {
    id: `auto-${Date.now()}-${hashTask(task)}`,
    description: task,
    tasks: finalTasks,
    metadata: {
      createdAt: Date.now(),
      model: "dag-generator",
      totalEstimatedMs: estimateTotalDuration(finalTasks),
      maxDepth: calculateMaxDepth(finalTasks),
    },
  };

  // Step 6: 生成されたプランを検証
  const validation = validateTaskPlan(plan);

  if (!validation.valid) {
    throw new DagGenerationError(
      `Generated invalid plan: ${validation.errors.join(", ")}`,
      "INVALID_GENERATED_PLAN",
    );
  }

  return plan;
}

/**
 * タスク記述から信号を分析する
 * @summary タスク信号分析
 * @param task - タスク記述
 * @returns 分析結果
 */
export function analyzeTaskSignals(task: string): TaskSignal {
  const normalized = task.trim();
  const lowerTask = normalized.toLowerCase();

  // 明示的なステップ指示を検出
  const stepPatterns = [
    /first.*then/i,
    /after.*implement/i,
    /before.*deploy/i,
    /\d+\.\s/,
    /step\s+\d+/i,
    /まず.*それから/,
    /実装.*後/,
    /作成.*次/,
  ];
  const hasExplicitSteps = stepPatterns.some((p) => p.test(normalized));

  // 並列実行機会を検出
  const parallelPatterns = [
    /and\s+also/i,
    /simultaneously/i,
    /in\s+parallel/i,
    /multiple\s+files/i,
    /同時に/,
    /並列/,
    /複数の/,
  ];
  const hasParallel = parallelPatterns.some((p) => p.test(normalized));

  // 研究必要性を検出
  const researchPatterns = [
    /investigate/i,
    /analyze/i,
    /understand/i,
    /explore/i,
    /figure\s+out/i,
    /調査/,
    /分析/,
    /理解/,
    /確認/,
    /特定/,
  ];
  const needsResearch = researchPatterns.some((p) => p.test(normalized));

  // レビュー必要性を検出
  const reviewPatterns = [
    /review/i,
    /validate/i,
    /verify/i,
    /check\s+for/i,
    /ensure/i,
    /レビュー/,
    /検証/,
    /確認/,
  ];
  const needsReview = reviewPatterns.some((p) => p.test(normalized));

  // テスト必要性を検出
  const testingPatterns = [
    /test/i,
    /spec/i,
    /unit\s+test/i,
    /integration\s+test/i,
    /テスト/,
    /試験/,
  ];
  const needsTesting = testingPatterns.some((p) => p.test(normalized));

  // 複数ファイル検出
  const hasMultipleFiles =
    /multiple|several|all\s+files|複数|いくつか/i.test(normalized);

  // 複雑度推定
  const estimatedComplexity = estimateSignalComplexity(normalized);

  // タイプ決定
  let type: TaskSignal["type"];
  if (hasParallel) {
    type = "parallel";
  } else if (needsResearch) {
    type = "research-first";
  } else if (needsReview) {
    type = "review-required";
  } else if (needsTesting) {
    type = "testing-required";
  } else {
    type = "sequential";
  }

  return {
    type,
    components: extractComponents(normalized),
    hasMultipleFiles,
    hasExplicitSteps,
    estimatedComplexity,
    needsResearch,
    needsReview,
    needsTesting,
  };
}

/**
 * サブタスクを生成する
 * @summary サブタスク生成
 * @param task - 元タスク
 * @param signals - タスク信号
 * @param options - 生成オプション
 * @returns サブタスク配列（依存関係なし）
 */
function generateSubtasks(
  task: string,
  signals: TaskSignal,
  options: { maxTasks: number; defaultAgent: string },
): Omit<TaskNode, "dependencies">[] {
  const { maxTasks, defaultAgent } = options;
  const subtasks: Omit<TaskNode, "dependencies">[] = [];

  // 研究タスク
  if (signals.needsResearch) {
    subtasks.push({
      id: "research",
      description: `${task}に関連するコードベースを調査し、影響範囲と依存関係を特定する`,
      assignedAgent: "researcher",
      priority: "high",
      estimatedDurationMs: 120000,
    });
  }

  // 実装タスク
  subtasks.push({
    id: "implement",
    description: task,
    assignedAgent: defaultAgent,
    priority: "critical",
    estimatedDurationMs: estimateImplementationDuration(task, signals),
  });

  // テストタスク
  if (signals.needsTesting) {
    subtasks.push({
      id: "test",
      description: `${task}の単体テストと統合テストを作成・実行する`,
      assignedAgent: "tester",
      priority: "high",
      estimatedDurationMs: 90000,
    });
  }

  // レビュータスク
  if (signals.needsReview) {
    subtasks.push({
      id: "review",
      description: `${task}の実装をレビューし、品質とセキュリティを確認する`,
      assignedAgent: "reviewer",
      priority: "high",
      estimatedDurationMs: 60000,
    });
  }

  // 複数ファイルの場合、分割
  if (signals.hasMultipleFiles && signals.components.length > 1) {
    const implementIdx = subtasks.findIndex((s) => s.id === "implement");
    if (implementIdx >= 0) {
      subtasks.splice(implementIdx, 1);
      signals.components.slice(0, maxTasks - subtasks.length).forEach((comp, i) => {
        subtasks.push({
          id: `implement-${i + 1}`,
          description: `${comp}の実装`,
          assignedAgent: defaultAgent,
          priority: "high",
          estimatedDurationMs: 120000,
        });
      });
    }
  }

  return subtasks.slice(0, maxTasks);
}

/**
 * 依存関係を推論する
 * @summary 依存関係推論
 * @param tasks - サブタスク配列
 * @param options - 推論オプション
 * @returns 依存関係付きタスク配列
 */
function inferDependencies(
  tasks: Omit<TaskNode, "dependencies">[],
  options: { maxDepth: number; signals: TaskSignal },
): TaskNode[] {
  const { signals } = options;
  const result: TaskNode[] = [];
  const taskIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    // Rule 1: 研究タスクは依存なし
    if (task.assignedAgent === "researcher") {
      result.push({ ...task, dependencies: [] });
      continue;
    }

    // Rule 2: テストタスクは実装に依存
    if (task.assignedAgent === "tester") {
      const implDeps = Array.from(taskIds).filter((id) =>
        id.startsWith("implement")
      );
      result.push({ ...task, dependencies: implDeps, inputContext: implDeps });
      continue;
    }

    // Rule 3: レビュータスクは実装に依存
    if (task.assignedAgent === "reviewer") {
      const implDeps = Array.from(taskIds).filter((id) =>
        id.startsWith("implement")
      );
      result.push({ ...task, dependencies: implDeps, inputContext: implDeps });
      continue;
    }

    // Rule 4: 実装タスクは研究に依存（研究がある場合）
    if (task.assignedAgent === "implementer" || task.id.startsWith("implement")) {
      const researchDep = taskIds.has("research") ? ["research"] : [];
      result.push({
        ...task,
        dependencies: researchDep,
        inputContext: researchDep.length > 0 ? researchDep : undefined,
      });
      continue;
    }

    // Default: 依存なし
    result.push({ ...task, dependencies: [] });
  }

  return result;
}

/**
 * エージェントと優先度を割り当てる
 * @summary エージェント・優先度割り当て
 * @param tasks - タスク配列
 * @param signals - タスク信号
 * @returns 最終タスク配列
 */
function assignAgentsAndPriorities(
  tasks: TaskNode[],
  signals: TaskSignal,
): TaskNode[] {
  return tasks.map((task) => {
    // 優先度調整
    let priority: TaskNodePriority = task.priority || "normal";

    if (signals.estimatedComplexity === "high") {
      if (task.assignedAgent === "implementer") {
        priority = "critical";
      } else if (task.assignedAgent === "reviewer") {
        priority = "critical";
      }
    }

    return { ...task, priority };
  });
}

/**
 * タスク文字列をハッシュ化
 * @summary タスクハッシュ
 * @param task - タスク文字列
 * @returns 8文字のハッシュ
 */
function hashTask(task: string): string {
  const hash = task.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const suffix = randomBytes(4).toString("hex");
  return `${hash}-${suffix}`;
}

/**
 * 信号から複雑度を推定
 * @summary 複雑度推定
 * @param task - タスク文字列
 * @returns 複雑度
 */
function estimateSignalComplexity(task: string): "low" | "medium" | "high" {
  const highKeywords = [
    "architecture", "refactor", "migrate", "security",
    "アーキテクチャ", "リファクタ", "移行", "セキュリティ",
    "redesign", "rewrite", "overhaul", "統合", "再設計",
  ];

  const mediumKeywords = [
    "implement", "create", "build", "add",
    "実装", "作成", "構築", "追加",
    "feature", "module", "機能",
  ];

  const lowerTask = task.toLowerCase();

  if (highKeywords.some((k) => lowerTask.includes(k.toLowerCase()))) {
    return "high";
  }
  if (mediumKeywords.some((k) => lowerTask.includes(k.toLowerCase()))) {
    return "medium";
  }
  if (task.length > 200 || task.split("\n").length > 5) {
    return "medium";
  }
  return "low";
}

/**
 * コンポーネントを抽出
 * @summary コンポーネント抽出
 * @param task - タスク文字列
 * @returns コンポーネント配列
 */
function extractComponents(task: string): string[] {
  // "XとY"、"X and Y" パターンを検出
  const andPattern = /(.+?)(?:と|and|、)(.+?)(?:と|and|、|$)/g;
  const components: string[] = [];

  let match;
  while ((match = andPattern.exec(task)) !== null) {
    if (match[1]) components.push(match[1].trim());
    if (match[2]) components.push(match[2].trim());
  }

  return [...new Set(components)].slice(0, 5);
}

/**
 * 実装時間を推定
 * @summary 実装時間推定
 * @param task - タスク文字列
 * @param signals - タスク信号
 * @returns 推定時間（ミリ秒）
 */
function estimateImplementationDuration(
  task: string,
  signals: TaskSignal,
): number {
  const baseDuration = 180000; // 3分

  if (signals.estimatedComplexity === "high") {
    return baseDuration * 2; // 6分
  }
  if (signals.estimatedComplexity === "medium") {
    return baseDuration * 1.5; // 4.5分
  }
  if (signals.hasMultipleFiles) {
    return baseDuration * 1.3;
  }
  return baseDuration;
}

/**
 * 総実行時間を推定
 * @summary 総時間推定
 * @param tasks - タスク配列
 * @returns 推定総時間（ミリ秒）
 */
function estimateTotalDuration(tasks: TaskNode[]): number {
  // クリティカルパスを計算（簡易版：全タスクの合計）
  return tasks.reduce((sum, t) => sum + (t.estimatedDurationMs || 120000), 0);
}

/**
 * 最大深さを計算
 * @summary 最大深さ計算
 * @param tasks - タスク配列
 * @returns 最大深さ
 */
function calculateMaxDepth(tasks: TaskNode[]): number {
  const depths = new Map<string, number>();

  const getDepth = (taskId: string, visited: Set<string>): number => {
    if (depths.has(taskId)) {
      return depths.get(taskId)!;
    }
    if (visited.has(taskId)) {
      return 0; // 循環参照防止
    }
    visited.add(taskId);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.dependencies.length === 0) {
      depths.set(taskId, 0);
      return 0;
    }

    const maxDepDepth = Math.max(
      ...task.dependencies.map((depId) => getDepth(depId, visited)),
    );
    const depth = maxDepDepth + 1;
    depths.set(taskId, depth);
    return depth;
  };

  let maxDepth = 0;
  for (const task of tasks) {
    maxDepth = Math.max(maxDepth, getDepth(task.id, new Set()));
  }

  return maxDepth;
}
