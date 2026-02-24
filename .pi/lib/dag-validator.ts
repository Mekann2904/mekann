/**
 * @abdd.meta
 * path: .pi/lib/dag-validator.ts
 * role: タスクプラン（DAG）の検証ユーティリティ
 * why: 実行前に循環依存や不正な依存関係を検出し、実行時エラーを防ぐため
 * related: .pi/lib/dag-types.ts, .pi/lib/task-dependencies.ts, .pi/lib/dag-errors.ts
 * public_api: validateTaskPlan, ValidationResult
 * invariants: 検証通過したプランは実行可能であることが保証される
 * side_effects: なし
 * failure_modes: なし（エラーは結果オブジェクトに含まれる）
 * @abdd.explain
 * overview: タスクプランの整合性を検証し、実行可能性を保証する
 * what_it_does:
 *   - タスクIDの重複チェック
 *   - 存在しない依存先の検出
 *   - 循環依存の検出
 *   - 並列実行可能性の分析
 * why_it_exists:
 *   - 不正なDAGによる実行時エラーを事前に防止するため
 *   - デバッグ情報の品質向上
 * scope:
 *   in: TaskPlanオブジェクト
 *   out: ValidationResult（成功/エラー/警告）
 */

// File: .pi/lib/dag-validator.ts
// Description: Validates task plans (DAGs) before execution.
// Why: Detects cycles and invalid dependencies before execution to prevent runtime errors.
// Related: .pi/lib/dag-types.ts, .pi/lib/task-dependencies.ts, .pi/lib/dag-errors.ts

import { TaskPlan, TaskNode } from "./dag-types.js";
import { TaskDependencyGraph } from "./task-dependencies.js";

/**
 * 検証結果
 * @summary 検証結果
 * @param valid - 検証成功かどうか
 * @param errors - エラーメッセージの配列
 * @param warnings - 警告メッセージの配列
 * @param stats - 統計情報（オプション）
 */
export interface ValidationResult {
  /** 検証成功かどうか */
  valid: boolean;
  /** エラーメッセージの配列 */
  errors: string[];
  /** 警告メッセージの配列 */
  warnings: string[];
  /** 統計情報（オプション） */
  stats?: {
    /** タスク総数 */
    totalTasks: number;
    /** 並列実行可能なタスク数 */
    parallelizableTasks: number;
    /** 最大深さ */
    maxDepth: number;
  };
}

/**
 * タスクプランを検証する
 * @summary プラン検証
 * @param plan - 検証対象のタスクプラン
 * @returns 検証結果
 * @example
 * const result = validateTaskPlan(plan);
 * if (!result.valid) {
 *   console.error("Validation failed:", result.errors);
 * }
 */
export function validateTaskPlan(plan: TaskPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 空のプランチェック
  if (!plan.tasks || plan.tasks.length === 0) {
    warnings.push("Task plan is empty");
    return {
      valid: true,
      errors: [],
      warnings,
      stats: {
        totalTasks: 0,
        parallelizableTasks: 0,
        maxDepth: 0,
      },
    };
  }

  // 2. タスクIDの重複チェック
  const ids = new Set<string>();
  const duplicateIds: string[] = [];

  for (const task of plan.tasks) {
    if (ids.has(task.id)) {
      duplicateIds.push(task.id);
    }
    ids.add(task.id);
  }

  if (duplicateIds.length > 0) {
    errors.push(`Duplicate task IDs: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  // 3. 存在しない依存先のチェック
  for (const task of plan.tasks) {
    for (const depId of task.dependencies) {
      if (!ids.has(depId)) {
        errors.push(`Task "${task.id}" depends on non-existent task "${depId}"`);
      }
    }
  }

  // エラーがある場合はここで終了（以降のチェックは意味がないため）
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // 4. 循環依存の検出（TaskDependencyGraphを使用）
  const cycleResult = detectCycleInPlan(plan);
  if (cycleResult.hasCycle) {
    errors.push(`Cycle detected in task graph: ${cycleResult.cyclePath?.join(" -> ")}`);
    return { valid: false, errors, warnings };
  }

  // 5. 警告チェック
  analyzeWarnings(plan, warnings);

  // 6. 統計情報の計算
  const stats = calculateStats(plan);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * タスクプラン内の循環を検出
 * @summary 循環検出
 * @param plan - タスクプラン
 * @returns 循環検出結果
 */
function detectCycleInPlan(plan: TaskPlan): { hasCycle: boolean; cyclePath: string[] | null } {
  const graph = new TaskDependencyGraph();

  // タスクを依存関係順に追加
  const added = new Set<string>();
  const pending = [...plan.tasks];

  while (pending.length > 0) {
    let addedAny = false;

    for (let i = pending.length - 1; i >= 0; i--) {
      const task = pending[i];
      if (task.dependencies.every((d) => added.has(d))) {
        try {
          graph.addTask(task.id, {
            name: task.description,
            dependencies: task.dependencies,
            priority: task.priority,
          });
          added.add(task.id);
          pending.splice(i, 1);
          addedAny = true;
        } catch {
          // グラフ追加エラーは無視（後でサイクル検出で処理）
        }
      }
    }

    if (!addedAny && pending.length > 0) {
      // 追加できないタスクが残っている = 循環または欠損依存
      const cycleResult = graph.detectCycle();
      if (cycleResult.hasCycle) {
        return cycleResult;
      }

      // サイクルがないのに追加できない = 残りのタスクでサイクルがある
      const remainingIds = pending.map((t) => t.id);
      const cyclePath = detectCycleInRemaining(pending);
      if (cyclePath) {
        return { hasCycle: true, cyclePath };
      }

      return {
        hasCycle: true,
        cyclePath: remainingIds,
      };
    }
  }

  // 全タスクが追加された場合、グラフ自体のサイクルチェック
  return graph.detectCycle();
}

/**
 * 残りのタスク内でサイクルを検出
 * @summary 残存タスクのサイクル検出
 * @param tasks - 残りのタスク
 * @returns サイクルパス（見つからない場合はnull）
 */
function detectCycleInRemaining(tasks: TaskNode[]): string[] | null {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colors = new Map<string, number>();
  const parents = new Map<string, string | null>();

  for (const task of tasks) {
    colors.set(task.id, WHITE);
    parents.set(task.id, null);
  }

  const dfs = (nodeId: string): string[] | null => {
    colors.set(nodeId, GRAY);
    const node = taskMap.get(nodeId);

    if (node) {
      for (const depId of node.dependencies) {
        // 残りのタスクに含まれる依存のみチェック
        if (!taskMap.has(depId)) continue;

        const color = colors.get(depId);
        if (color === GRAY) {
          // サイクル発見
          const cyclePath: string[] = [depId, nodeId];
          let current = parents.get(nodeId);
          while (current && current !== depId) {
            cyclePath.unshift(current);
            current = parents.get(current);
          }
          return cyclePath;
        }

        if (color === WHITE) {
          parents.set(depId, nodeId);
          const result = dfs(depId);
          if (result) return result;
        }
      }
    }

    colors.set(nodeId, BLACK);
    return null;
  };

  for (const task of tasks) {
    if (colors.get(task.id) === WHITE) {
      const result = dfs(task.id);
      if (result) return result;
    }
  }

  return null;
}

/**
 * 警告を分析
 * @summary 警告分析
 * @param plan - タスクプラン
 * @param warnings - 警告配列（出力）
 */
function analyzeWarnings(plan: TaskPlan, warnings: string[]): void {
  // 全タスクが依存関係を持つ場合の警告
  if (plan.tasks.every((t) => t.dependencies.length > 0)) {
    warnings.push("All tasks have dependencies - no parallelism possible");
  }

  // 孤立タスク（依存も被依存もない）の警告
  const hasDependents = new Set<string>();
  for (const task of plan.tasks) {
    for (const depId of task.dependencies) {
      hasDependents.add(depId);
    }
  }

  const orphanTasks = plan.tasks.filter(
    (t) => t.dependencies.length === 0 && !hasDependents.has(t.id),
  );
  if (orphanTasks.length > 1) {
    warnings.push(
      `Found ${orphanTasks.length} orphan tasks (no dependencies and no dependents) - consider consolidation`,
    );
  }

  // 推定時間が極端に長いタスクの警告
  const longTasks = plan.tasks.filter((t) => t.estimatedDurationMs && t.estimatedDurationMs > 300000);
  if (longTasks.length > 0) {
    warnings.push(
      `Found ${longTasks.length} task(s) with estimated duration > 5 minutes - consider splitting`,
    );
  }

  // 説明が短いタスクの警告
  const shortDescTasks = plan.tasks.filter((t) => t.description.length < 10);
  if (shortDescTasks.length > 0) {
    warnings.push(
      `Found ${shortDescTasks.length} task(s) with very short descriptions - consider adding more detail`,
    );
  }
}

/**
 * 統計情報を計算
 * @summary 統計計算
 * @param plan - タスクプラン
 * @returns 統計情報
 */
function calculateStats(plan: TaskPlan): ValidationResult["stats"] {
  const depths = new Map<string, number>();

  const getDepth = (taskId: string, visited: Set<string>): number => {
    if (depths.has(taskId)) {
      return depths.get(taskId)!;
    }

    // 循環参照の防止
    if (visited.has(taskId)) {
      return 0;
    }
    visited.add(taskId);

    const task = plan.tasks.find((t) => t.id === taskId);
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
  for (const task of plan.tasks) {
    maxDepth = Math.max(maxDepth, getDepth(task.id, new Set()));
  }

  // 並列実行可能なタスク数（深さ0のタスク）
  const parallelizableTasks = plan.tasks.filter((t) => t.dependencies.length === 0).length;

  return {
    totalTasks: plan.tasks.length,
    parallelizableTasks,
    maxDepth,
  };
}

/**
 * タスクプランの簡易検証（高速版）
 * @summary 簡易検証
 * @param plan - タスクプラン
 * @returns 基本的な検証のみの結果
 */
export function quickValidatePlan(plan: TaskPlan): { valid: boolean; firstError?: string } {
  // 空チェック
  if (!plan.tasks || plan.tasks.length === 0) {
    return { valid: true };
  }

  // ID重複チェック
  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (ids.has(task.id)) {
      return { valid: false, firstError: `Duplicate task ID: ${task.id}` };
    }
    ids.add(task.id);
  }

  // 依存先存在チェック
  for (const task of plan.tasks) {
    for (const depId of task.dependencies) {
      if (!ids.has(depId)) {
        return {
          valid: false,
          firstError: `Task "${task.id}" depends on non-existent task "${depId}"`,
        };
      }
    }
  }

  return { valid: true };
}
