/**
 * @abdd.meta
 * path: .pi/tests/lib/dag-weight-calculator.test.ts
 * role: DTGG重み計算の単体テスト
 * why: タスク優先度計算の正確性を保証するため
 * related: .pi/lib/dag-weight-calculator.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: DynTaskMAS論文のDTGG重み計算式のテストスイート
 * what_it_does:
 *   - 複雑性スコア計算のテスト
 *   - 依存重要度計算のテスト
 *   - エッジ重み計算のテスト
 *   - エージェント専門化重みのテスト
 * why_it_exists:
 *   - タスクスケジューリングの信頼性を保証するため
 * scope:
 *   in: なし
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  calculateComplexity,
  calculateDependencyImportance,
  calculateEdgeWeight,
  calculateTaskPriority,
  calculateTotalTaskWeight,
  getAgentSpecializationWeight,
  calculateTeamWeight,
  DEFAULT_WEIGHT_CONFIG,
  type WeightConfig,
  type TeamDefinitionForWeight,
} from "../../lib/dag-weight-calculator.js";
import type { TaskNode } from "../../lib/dag-types.js";

// ============================================
// Helper Functions
// ============================================

function createTaskNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "test-task",
    description: "Test task",
    dependencies: [],
    ...overrides,
  };
}

// ============================================
// Tests: Agent Specialization Weight
// ============================================

describe("getAgentSpecializationWeight", () => {
  it("researcherは低い重み（0.5）", () => {
    expect(getAgentSpecializationWeight("researcher")).toBe(0.5);
  });

  it("implementerは標準重み（1.0）", () => {
    expect(getAgentSpecializationWeight("implementer")).toBe(1.0);
  });

  it("architectは高い重み（1.2）", () => {
    expect(getAgentSpecializationWeight("architect")).toBe(1.2);
  });

  it("reviewerは中程度の重み（0.7）", () => {
    expect(getAgentSpecializationWeight("reviewer")).toBe(0.7);
  });

  it("testerは中程度の重み（0.8）", () => {
    expect(getAgentSpecializationWeight("tester")).toBe(0.8);
  });

  it("未知のエージェントは標準重み（1.0）", () => {
    expect(getAgentSpecializationWeight("unknown")).toBe(1.0);
  });
});

// ============================================
// Tests: Team Weight
// ============================================

describe("calculateTeamWeight", () => {
  it("メンバーの重みの平均を計算", () => {
    const team: TeamDefinitionForWeight = {
      id: "test-team",
      members: [
        { id: "researcher" },  // 0.5
        { id: "implementer" }, // 1.0
      ],
    };

    // (0.5 + 1.0) / 2 = 0.75
    expect(calculateTeamWeight(team)).toBe(0.75);
  });

  it("空のチームは標準重み（1.0）", () => {
    const team: TeamDefinitionForWeight = {
      id: "empty-team",
      members: [],
    };

    expect(calculateTeamWeight(team)).toBe(1.0);
  });

  it("メンバーがundefinedの場合は標準重み", () => {
    const team = {
      id: "no-members",
      members: undefined as unknown as [],
    };

    expect(calculateTeamWeight(team)).toBe(1.0);
  });
});

// ============================================
// Tests: Complexity Calculation
// ============================================

describe("calculateComplexity", () => {
  it("推定時間が長いほど複雑性が高い", () => {
    const shortTask = createTaskNode({ estimatedDurationMs: 1000 });
    const longTask = createTaskNode({ estimatedDurationMs: 60000 });

    const shortComplexity = calculateComplexity(shortTask);
    const longComplexity = calculateComplexity(longTask);

    expect(longComplexity).toBeGreaterThan(shortComplexity);
  });

  it("architectタスクは実装タスクより高い複雑性", () => {
    const implTask = createTaskNode({ assignedAgent: "implementer" });
    const archTask = createTaskNode({ assignedAgent: "architect" });

    const implComplexity = calculateComplexity(implTask);
    const archComplexity = calculateComplexity(archTask);

    expect(archComplexity).toBeGreaterThan(implComplexity);
  });

  it("推定時間のデフォルトは60000ms", () => {
    const task = createTaskNode(); // estimatedDurationMs未設定
    const complexity = calculateComplexity(task);

    // log10(60) + 1.0 ≈ 2.78
    expect(complexity).toBeCloseTo(Math.log10(60) + 1.0, 2);
  });

  it("複雑性は常に非負値", () => {
    const task = createTaskNode({ estimatedDurationMs: 1 });
    const complexity = calculateComplexity(task);

    expect(complexity).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Tests: Dependency Importance
// ============================================

describe("calculateDependencyImportance", () => {
  it("criticalタスクは高い重要度", () => {
    const source = createTaskNode();
    const target = createTaskNode({ priority: "critical" });

    const importance = calculateDependencyImportance(source, target);

    expect(importance).toBeGreaterThan(0);
  });

  it("lowタスクは低い重要度", () => {
    const source = createTaskNode();
    const criticalTarget = createTaskNode({ priority: "critical" });
    const lowTarget = createTaskNode({ priority: "low" });

    const criticalImportance = calculateDependencyImportance(source, criticalTarget);
    const lowImportance = calculateDependencyImportance(source, lowTarget);

    expect(criticalImportance).toBeGreaterThan(lowImportance);
  });

  it("入力コンテキストが多いほどデータ量が多い", () => {
    const source = createTaskNode();
    const targetWithCtx = createTaskNode({ inputContext: ["task-1", "task-2", "task-3"] });
    const targetWithoutCtx = createTaskNode();

    const withCtxImportance = calculateDependencyImportance(source, targetWithCtx);
    const withoutCtxImportance = calculateDependencyImportance(source, targetWithoutCtx);

    expect(withCtxImportance).toBeGreaterThan(withoutCtxImportance);
  });
});

// ============================================
// Tests: Edge Weight Calculation
// ============================================

describe("calculateEdgeWeight", () => {
  it("デフォルト設定でエッジ重みを計算", () => {
    const source = createTaskNode();
    const target = createTaskNode();

    const weight = calculateEdgeWeight(source, target);

    expect(weight).toBeGreaterThanOrEqual(0);
  });

  it("カスタム設定でエッジ重みを計算", () => {
    const source = createTaskNode();
    const target = createTaskNode();
    const config: WeightConfig = { alpha: 0.8, beta: 0.2 };

    const weight = calculateEdgeWeight(source, target, config);

    expect(weight).toBeGreaterThanOrEqual(0);
  });

  it("複雑なタスクへの依存は高い重み", () => {
    const source = createTaskNode();
    const simpleTarget = createTaskNode({ estimatedDurationMs: 1000 });
    const complexTarget = createTaskNode({
      estimatedDurationMs: 300000,
      assignedAgent: "architect",
      priority: "critical",
    });

    const simpleWeight = calculateEdgeWeight(source, simpleTarget);
    const complexWeight = calculateEdgeWeight(source, complexTarget);

    expect(complexWeight).toBeGreaterThan(simpleWeight);
  });
});

// ============================================
// Tests: Task Priority
// ============================================

describe("calculateTaskPriority", () => {
  it("criticalタスクは高い優先度", () => {
    const criticalTask = createTaskNode({ priority: "critical" });
    const normalTask = createTaskNode({ priority: "normal" });

    const criticalPriority = calculateTaskPriority(criticalTask, 5);
    const normalPriority = calculateTaskPriority(normalTask, 5);

    expect(criticalPriority).toBeGreaterThan(normalPriority);
  });

  it("クリティカルパス長が長いほどボーナス", () => {
    const task = createTaskNode();

    const shortPathPriority = calculateTaskPriority(task, 1);
    const longPathPriority = calculateTaskPriority(task, 10);

    expect(longPathPriority).toBeGreaterThan(shortPathPriority);
  });

  it("依存関係が多いほどペナルティ", () => {
    const noDeps = createTaskNode({ dependencies: [] });
    const manyDeps = createTaskNode({ dependencies: ["a", "b", "c", "d", "e"] });

    const noDepsPriority = calculateTaskPriority(noDeps, 5);
    const manyDepsPriority = calculateTaskPriority(manyDeps, 5);

    expect(noDepsPriority).toBeGreaterThan(manyDepsPriority);
  });

  it("優先度は常に非負値", () => {
    const task = createTaskNode({
      priority: "low",
      dependencies: ["a", "b", "c", "d", "e", "f", "g", "h"],
    });

    const priority = calculateTaskPriority(task, 0);

    expect(priority).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Tests: Total Task Weight
// ============================================

describe("calculateTotalTaskWeight", () => {
  it("依存関係のないタスクは自身の複雑性", () => {
    const task = createTaskNode();
    const allTasks = new Map([["test-task", task]]);

    const weight = calculateTotalTaskWeight(task, allTasks);

    // 依存関係がない場合は自身の複雑性
    expect(weight).toBeGreaterThan(0);
  });

  it("複数の依存関係がある場合は合算", () => {
    const dep1 = createTaskNode({ id: "dep-1" });
    const dep2 = createTaskNode({ id: "dep-2" });
    const task = createTaskNode({ dependencies: ["dep-1", "dep-2"] });

    const allTasks = new Map([
      ["test-task", task],
      ["dep-1", dep1],
      ["dep-2", dep2],
    ]);

    const weight = calculateTotalTaskWeight(task, allTasks);

    expect(weight).toBeGreaterThan(0);
  });

  it("存在しない依存関係は無視される", () => {
    const task = createTaskNode({ dependencies: ["non-existent"] });
    const allTasks = new Map([["test-task", task]]);

    // エラーにならずに処理される
    const weight = calculateTotalTaskWeight(task, allTasks);

    expect(weight).toBeGreaterThanOrEqual(0);
  });
});
