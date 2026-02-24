/**
 * @abdd.meta
 * path: .pi/tests/lib/dag-validator.test.ts
 * role: DAGバリデータの単体テスト
 * why: 循環依存検出、タスク検証の正確性を保証するため
 * related: .pi/lib/dag-validator.ts, .pi/lib/dag-types.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: validateTaskPlan関数の包括的なテストスイート
 * what_it_does:
 *   - 空のプラン検証
 *   - 重複ID検出
 *   - 存在しない依存先検出
 *   - 循環依存検出
 *   - 警告メッセージの検証
 *   - 統計情報の計算
 * why_it_exists:
 *   - DAG実行の安全性を保証するため
 *   - バグの早期発見を可能にするため
 * scope:
 *   in: なし
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import { validateTaskPlan, quickValidatePlan, type ValidationResult } from "../../lib/dag-validator.js";
import type { TaskPlan } from "../../lib/dag-types.js";

// ============================================
// Helper Functions
// ============================================

/**
 * テスト用のTaskPlanを作成
 */
function createTestPlan(tasks: Array<{
  id: string;
  description?: string;
  dependencies?: string[];
  priority?: "critical" | "high" | "normal" | "low";
  estimatedDurationMs?: number;
}>): TaskPlan {
  return {
    id: "test-plan",
    description: "Test plan",
    tasks: tasks.map(t => ({
      id: t.id,
      description: t.description ?? `Task ${t.id}`,
      dependencies: t.dependencies ?? [],
      priority: t.priority,
      estimatedDurationMs: t.estimatedDurationMs,
    })),
    metadata: {
      createdAt: Date.now(),
      model: "test-model",
      totalEstimatedMs: 0,
      maxDepth: 0,
    },
  };
}

// ============================================
// Tests: Empty Plan
// ============================================

describe("validateTaskPlan: 空のプラン", () => {
  it("tasks配列が空の場合、valid=trueで警告を出す", () => {
    const plan = createTestPlan([]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContain("Task plan is empty");
    expect(result.stats).toEqual({
      totalTasks: 0,
      parallelizableTasks: 0,
      maxDepth: 0,
    });
  });

  it("tasks配列がundefinedの場合、valid=trueで警告を出す", () => {
    const plan = {
      id: "test-plan",
      description: "Test",
      tasks: undefined as unknown as [],
      metadata: {
        createdAt: Date.now(),
        model: "test",
        totalEstimatedMs: 0,
        maxDepth: 0,
      },
    };
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(true);
    expect(result.warnings).toContain("Task plan is empty");
  });
});

// ============================================
// Tests: Duplicate IDs
// ============================================

describe("validateTaskPlan: 重複ID検出", () => {
  it("重複するタスクIDを検出する", () => {
    const plan = createTestPlan([
      { id: "task-a" },
      { id: "task-b" },
      { id: "task-a" }, // 重複
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate task IDs: task-a");
  });

  it("複数の重複IDを検出する", () => {
    const plan = createTestPlan([
      { id: "task-a" },
      { id: "task-a" },
      { id: "task-b" },
      { id: "task-b" },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Duplicate task IDs: task-a, task-b");
  });
});

// ============================================
// Tests: Non-existent Dependencies
// ============================================

describe("validateTaskPlan: 存在しない依存先", () => {
  it("存在しない依存先を検出する", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["non-existent"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Task "task-a" depends on non-existent task "non-existent"'
    );
  });

  it("複数の存在しない依存先を検出する", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["missing-1", "missing-2"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContain(
      'Task "task-a" depends on non-existent task "missing-1"'
    );
    expect(result.errors).toContain(
      'Task "task-a" depends on non-existent task "missing-2"'
    );
  });
});

// ============================================
// Tests: Cycle Detection
// ============================================

describe("validateTaskPlan: 循環依存検出", () => {
  it("2ノードの循環依存を検出する", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["task-b"] },
      { id: "task-b", dependencies: ["task-a"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Cycle detected");
  });

  it("3ノードの循環依存を検出する", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["task-c"] },
      { id: "task-b", dependencies: ["task-a"] },
      { id: "task-c", dependencies: ["task-b"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cycle detected");
  });

  it("自己参照（セルフループ）を検出する", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["task-a"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Cycle detected");
  });

  it("複雑なDAGで循環がない場合はvalid=true", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: [] },
      { id: "task-b", dependencies: ["task-a"] },
      { id: "task-c", dependencies: ["task-a"] },
      { id: "task-d", dependencies: ["task-b", "task-c"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================
// Tests: Warnings
// ============================================

describe("validateTaskPlan: 警告メッセージ", () => {
  it("全タスクが依存関係を持つ場合、並列性なしの警告（ルートノードがない場合）", () => {
    // ルートノード（依存関係を持たないタスク）がない場合の警告
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["task-b"] },
      { id: "task-b", dependencies: ["task-a"] }, // 循環依存
    ]);
    const result = validateTaskPlan(plan);

    // 循環依存があるため、valid=false になる
    expect(result.valid).toBe(false);
  });

  it("孤立タスク（依存も被依存もない）が複数ある場合、警告", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: [] },
      { id: "task-b", dependencies: [] },
      { id: "task-c", dependencies: [] },
    ]);
    const result = validateTaskPlan(plan);

    const orphanWarning = result.warnings.find(w =>
      w.includes("orphan tasks")
    );
    expect(orphanWarning).toBeDefined();
  });

  it("推定時間が5分を超えるタスクがある場合、警告", () => {
    const plan = createTestPlan([
      { id: "task-a", estimatedDurationMs: 400000 }, // 6分40秒
    ]);
    const result = validateTaskPlan(plan);

    const longTaskWarning = result.warnings.find(w =>
      w.includes("estimated duration > 5 minutes")
    );
    expect(longTaskWarning).toBeDefined();
  });

  it("説明が短いタスクがある場合、警告", () => {
    const plan = createTestPlan([
      { id: "task-a", description: "do" }, // 2文字
    ]);
    const result = validateTaskPlan(plan);

    const shortDescWarning = result.warnings.find(w =>
      w.includes("very short descriptions")
    );
    expect(shortDescWarning).toBeDefined();
  });
});

// ============================================
// Tests: Statistics
// ============================================

describe("validateTaskPlan: 統計情報", () => {
  it("統計情報が正しく計算される", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: [] },
      { id: "task-b", dependencies: ["task-a"] },
      { id: "task-c", dependencies: ["task-a"] },
      { id: "task-d", dependencies: ["task-b", "task-c"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.valid).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats!.totalTasks).toBe(4);
    expect(result.stats!.parallelizableTasks).toBe(1); // task-a only
    expect(result.stats!.maxDepth).toBe(2); // a -> b/c -> d
  });

  it("直列DAGの最大深さが正しい", () => {
    const plan = createTestPlan([
      { id: "task-1", dependencies: [] },
      { id: "task-2", dependencies: ["task-1"] },
      { id: "task-3", dependencies: ["task-2"] },
      { id: "task-4", dependencies: ["task-3"] },
    ]);
    const result = validateTaskPlan(plan);

    expect(result.stats!.maxDepth).toBe(3); // 0, 1, 2, 3
  });
});

// ============================================
// Tests: quickValidatePlan
// ============================================

describe("quickValidatePlan: 簡易検証", () => {
  it("有効なプランでvalid=true", () => {
    const plan = createTestPlan([
      { id: "task-a" },
      { id: "task-b", dependencies: ["task-a"] },
    ]);
    const result = quickValidatePlan(plan);

    expect(result.valid).toBe(true);
    expect(result.firstError).toBeUndefined();
  });

  it("重複IDで最初のエラーを返す", () => {
    const plan = createTestPlan([
      { id: "task-a" },
      { id: "task-a" },
    ]);
    const result = quickValidatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.firstError).toBe("Duplicate task ID: task-a");
  });

  it("存在しない依存先で最初のエラーを返す", () => {
    const plan = createTestPlan([
      { id: "task-a", dependencies: ["missing"] },
    ]);
    const result = quickValidatePlan(plan);

    expect(result.valid).toBe(false);
    expect(result.firstError).toContain("non-existent task");
  });

  it("空のプランでvalid=true", () => {
    const plan = createTestPlan([]);
    const result = quickValidatePlan(plan);

    expect(result.valid).toBe(true);
  });
});
