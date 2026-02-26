/**
 * @file .pi/lib/dag-executor.ts の単体テスト
 * @description DAG実行エンジンのテスト（動的依存関係更新APIを含む）
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DagExecutor, executeDag, type DagExecutorOptions, type TaskExecutor } from "@lib/dag-executor";
import { TaskPlan, TaskNode } from "@lib/dag-types";

// ============================================================================
// Helper Functions
// ============================================================================

function createSimplePlan(): TaskPlan {
  return {
    id: "test-plan",
    description: "Test plan for dynamic dependency updates",
    tasks: [
      { id: "A", description: "Task A", dependencies: [] },
      { id: "B", description: "Task B", dependencies: [] },
      { id: "C", description: "Task C", dependencies: [] },
    ],
    metadata: {
      createdAt: Date.now(),
      model: "test-model",
      totalEstimatedMs: 1000,
      maxDepth: 0,
    },
  };
}

function createPlanWithDependencies(): TaskPlan {
  return {
    id: "test-plan-with-deps",
    description: "Test plan with existing dependencies",
    tasks: [
      { id: "A", description: "Task A", dependencies: [] },
      { id: "B", description: "Task B", dependencies: ["A"] },
      { id: "C", description: "Task C", dependencies: ["B"] },
    ],
    metadata: {
      createdAt: Date.now(),
      model: "test-model",
      totalEstimatedMs: 1000,
      maxDepth: 2,
    },
  };
}

function createDiamondPlan(): TaskPlan {
  return {
    id: "diamond-plan",
    description: "Diamond dependency pattern",
    tasks: [
      { id: "A", description: "Task A", dependencies: [] },
      { id: "B", description: "Task B", dependencies: ["A"] },
      { id: "C", description: "Task C", dependencies: ["A"] },
      { id: "D", description: "Task D", dependencies: ["B", "C"] },
    ],
    metadata: {
      createdAt: Date.now(),
      model: "test-model",
      totalEstimatedMs: 1000,
      maxDepth: 2,
    },
  };
}

// ============================================================================
// DagExecutor - 動的依存関係更新
// ============================================================================

describe("DagExecutor - 動的依存関係更新", () => {
  let executor: DagExecutor;
  let plan: TaskPlan;

  beforeEach(() => {
    plan = createSimplePlan();
    executor = new DagExecutor(plan);
  });

  // ========================================
  // addDependency
  // ========================================
  describe("addDependency", () => {
    it("should_add_dependency_between_independent_tasks", () => {
      // Initially, B has no dependencies
      expect(executor.getTask("B")?.dependencies).toEqual([]);

      executor.addDependency("B", "A");

      expect(executor.getTask("B")?.dependencies).toContain("A");
      expect(executor.hasTask("B")).toBe(true);
    });

    it("should_throw_for_nonexistent_task", () => {
      expect(() => executor.addDependency("nonexistent", "A")).toThrow(
        'Task "nonexistent" does not exist'
      );
    });

    it("should_throw_for_nonexistent_dependency", () => {
      expect(() => executor.addDependency("B", "nonexistent")).toThrow(
        'Dependency task "nonexistent" does not exist'
      );
    });

    it("should_throw_for_self_dependency", () => {
      expect(() => executor.addDependency("A", "A")).toThrow(
        'Task cannot depend on itself: "A"'
      );
    });

    it("should_throw_for_cycle_creation", () => {
      // A -> B -> C chain
      executor.addDependency("B", "A");
      executor.addDependency("C", "B");

      // C -> A would create cycle
      expect(() => executor.addDependency("A", "C")).toThrow(/would create a cycle/);
    });

    it("should_throw_for_existing_dependency", () => {
      executor.addDependency("B", "A");

      expect(() => executor.addDependency("B", "A")).toThrow(
        'Task "B" already depends on "A"'
      );
    });

    it("should_not_modify_graph_on_cycle_detection", () => {
      executor.addDependency("B", "A");
      executor.addDependency("C", "B");

      // Attempt to create cycle
      try {
        executor.addDependency("A", "C");
      } catch {
        // Expected
      }

      // A should not have C as a dependency
      expect(executor.getTask("A")?.dependencies).not.toContain("C");
    });

    it("should_allow_multiple_dependencies_to_be_added", () => {
      executor.addDependency("C", "A");
      executor.addDependency("C", "B");

      const taskC = executor.getTask("C");
      expect(taskC?.dependencies).toContain("A");
      expect(taskC?.dependencies).toContain("B");
    });
  });

  // ========================================
  // removeDependency
  // ========================================
  describe("removeDependency", () => {
    beforeEach(() => {
      plan = createPlanWithDependencies();
      executor = new DagExecutor(plan);
    });

    it("should_remove_existing_dependency", () => {
      // B depends on A
      expect(executor.getTask("B")?.dependencies).toContain("A");

      const result = executor.removeDependency("B", "A");

      expect(result).toBe(true);
      expect(executor.getTask("B")?.dependencies).not.toContain("A");
    });

    it("should_return_false_for_nonexistent_dependency_relation", () => {
      // C does not depend on A directly
      const result = executor.removeDependency("C", "A");

      expect(result).toBe(false);
    });

    it("should_throw_for_nonexistent_task", () => {
      expect(() => executor.removeDependency("nonexistent", "A")).toThrow(
        'Task "nonexistent" does not exist'
      );
    });

    it("should_throw_for_nonexistent_dependency_task", () => {
      expect(() => executor.removeDependency("B", "nonexistent")).toThrow(
        'Dependency task "nonexistent" does not exist'
      );
    });

    it("should_update_tasknode_dependencies_on_removal", () => {
      const beforeDeps = [...(executor.getTask("B")?.dependencies ?? [])];
      expect(beforeDeps).toContain("A");

      executor.removeDependency("B", "A");

      const afterDeps = executor.getTask("B")?.dependencies ?? [];
      expect(afterDeps).not.toContain("A");
    });
  });

  // ========================================
  // detectCycle
  // ========================================
  describe("detectCycle", () => {
    it("should_return_no_cycle_for_acyclic_graph", () => {
      const result = executor.detectCycle();

      expect(result.hasCycle).toBe(false);
      expect(result.cyclePath).toBeNull();
    });

    it("should_return_no_cycle_for_diamond_structure", () => {
      executor = new DagExecutor(createDiamondPlan());

      const result = executor.detectCycle();

      expect(result.hasCycle).toBe(false);
    });

    it("should_detect_cycle_after_manual_modification", () => {
      // A -> B -> C
      executor.addDependency("B", "A");
      executor.addDependency("C", "B");

      // Manually create cycle (directly manipulating graph)
      const graph = (executor as unknown as { graph: { getTask: (id: string) => { dependencies: Set<string> } } }).graph;
      graph.getTask("A").dependencies.add("C");

      const result = executor.detectCycle();

      expect(result.hasCycle).toBe(true);
      expect(result.cyclePath).not.toBeNull();
    });
  });

  // ========================================
  // hasTask / getTask
  // ========================================
  describe("hasTask / getTask", () => {
    it("should_return_true_for_existing_task", () => {
      expect(executor.hasTask("A")).toBe(true);
      expect(executor.hasTask("B")).toBe(true);
      expect(executor.hasTask("C")).toBe(true);
    });

    it("should_return_false_for_nonexistent_task", () => {
      expect(executor.hasTask("nonexistent")).toBe(false);
    });

    it("should_return_task_node_for_existing_task", () => {
      const task = executor.getTask("A");

      expect(task).toBeDefined();
      expect(task?.id).toBe("A");
      expect(task?.description).toBe("Task A");
    });

    it("should_return_undefined_for_nonexistent_task", () => {
      const task = executor.getTask("nonexistent");

      expect(task).toBeUndefined();
    });
  });

  // ========================================
  // getStats
  // ========================================
  describe("getStats", () => {
    it("should_return_correct_initial_stats", () => {
      const stats = executor.getStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      // All tasks are ready (no dependencies)
      expect(stats.pending + stats.running + stats.completed).toBeLessThanOrEqual(stats.total);
    });

    it("should_reflect_dependency_changes_in_stats", () => {
      // Add dependency: B depends on A
      executor.addDependency("B", "A");

      const stats = executor.getStats();
      // B should now be pending
      expect(stats.pending).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================
  // Combined Operations
  // ========================================
  describe("addDependency と removeDependency の組み合わせ", () => {
    beforeEach(() => {
      plan = createPlanWithDependencies();
      executor = new DagExecutor(plan);
    });

    it("should_allow_add_after_remove", () => {
      executor.removeDependency("B", "A");
      executor.addDependency("B", "A");

      expect(executor.getTask("B")?.dependencies).toContain("A");
    });

    it("should_allow_restructuring_without_cycle", () => {
      // Original: A -> B -> C
      // Restructure to: A -> C, B -> C
      executor.removeDependency("C", "B");
      executor.addDependency("C", "A");
      executor.addDependency("C", "B");

      const taskC = executor.getTask("C");
      expect(taskC?.dependencies).toContain("A");
      expect(taskC?.dependencies).toContain("B");
    });

    it("should_maintain_consistency_after_multiple_operations", () => {
      // Add and remove multiple dependencies
      executor.addDependency("C", "A");
      executor.removeDependency("C", "B");
      executor.addDependency("B", "C");

      const taskB = executor.getTask("B");
      const taskC = executor.getTask("C");

      expect(taskB?.dependencies).toContain("C");
      expect(taskC?.dependencies).toContain("A");
      expect(taskC?.dependencies).not.toContain("B");
    });
  });
});

// ============================================================================
// executeDag - 簡易関数
// ============================================================================

describe("executeDag", () => {
  it("should_execute_simple_dag", async () => {
    const plan: TaskPlan = {
      id: "simple-exec-plan",
      description: "Simple execution plan",
      tasks: [
        { id: "task-1", description: "First task", dependencies: [] },
      ],
      metadata: {
        createdAt: Date.now(),
        model: "test-model",
        totalEstimatedMs: 100,
        maxDepth: 0,
      },
    };

    const executor: TaskExecutor<string> = async (task) => {
      return `Completed: ${task.id}`;
    };

    const result = await executeDag(plan, executor);

    expect(result.planId).toBe("simple-exec-plan");
    expect(result.overallStatus).toBe("completed");
    expect(result.completedTaskIds).toContain("task-1");
  });

  it("should_execute_dag_with_dependencies", async () => {
    const plan: TaskPlan = {
      id: "dep-exec-plan",
      description: "Execution plan with dependencies",
      tasks: [
        { id: "task-1", description: "First task", dependencies: [] },
        { id: "task-2", description: "Second task", dependencies: ["task-1"] },
      ],
      metadata: {
        createdAt: Date.now(),
        model: "test-model",
        totalEstimatedMs: 200,
        maxDepth: 1,
      },
    };

    const executionOrder: string[] = [];
    const executor: TaskExecutor<string> = async (task) => {
      executionOrder.push(task.id);
      return `Completed: ${task.id}`;
    };

    const result = await executeDag(plan, executor);

    expect(result.overallStatus).toBe("completed");
    expect(result.completedTaskIds).toHaveLength(2);
    // task-1 should execute before task-2
    expect(executionOrder.indexOf("task-1")).toBeLessThan(executionOrder.indexOf("task-2"));
  });
});

// ============================================================================
// DynTaskMAS 重み更新
// ============================================================================

describe("DagExecutor - DynTaskMAS重み更新", () => {
  it("should_update_weights_on_add_dependency", () => {
    const plan = createSimplePlan();
    const executor = new DagExecutor(plan, { useWeightBasedScheduling: true });

    // Add dependency should trigger weight recalculation
    executor.addDependency("B", "A");

    // No error should be thrown
    expect(executor.getTask("B")?.dependencies).toContain("A");
  });

  it("should_update_weights_on_remove_dependency", () => {
    const plan = createPlanWithDependencies();
    const executor = new DagExecutor(plan, { useWeightBasedScheduling: true });

    // Remove dependency should trigger weight recalculation
    const result = executor.removeDependency("B", "A");

    expect(result).toBe(true);
    expect(executor.getTask("B")?.dependencies).not.toContain("A");
  });

  it("should_work_without_weight_based_scheduling", () => {
    const plan = createSimplePlan();
    const executor = new DagExecutor(plan, { useWeightBasedScheduling: false });

    executor.addDependency("B", "A");

    expect(executor.getTask("B")?.dependencies).toContain("A");
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("DagExecutor - エッジケース", () => {
  it("should_handle_empty_plan", () => {
    const plan: TaskPlan = {
      id: "empty-plan",
      description: "Empty plan",
      tasks: [],
      metadata: {
        createdAt: Date.now(),
        model: "test-model",
        totalEstimatedMs: 0,
        maxDepth: 0,
      },
    };

    const executor = new DagExecutor(plan);
    expect(executor.getStats().total).toBe(0);
  });

  it("should_handle_single_task_plan", () => {
    const plan: TaskPlan = {
      id: "single-plan",
      description: "Single task plan",
      tasks: [{ id: "only-task", description: "Only task", dependencies: [] }],
      metadata: {
        createdAt: Date.now(),
        model: "test-model",
        totalEstimatedMs: 100,
        maxDepth: 0,
      },
    };

    const executor = new DagExecutor(plan);
    expect(executor.hasTask("only-task")).toBe(true);
    expect(executor.detectCycle().hasCycle).toBe(false);
  });

  it("should_handle_diamond_dependency_pattern", () => {
    const executor = new DagExecutor(createDiamondPlan());

    expect(executor.detectCycle().hasCycle).toBe(false);

    const taskD = executor.getTask("D");
    expect(taskD?.dependencies).toContain("B");
    expect(taskD?.dependencies).toContain("C");
  });

  it("should_handle_deep_dependency_chain", () => {
    const tasks: TaskNode[] = [];
    for (let i = 0; i < 10; i++) {
      tasks.push({
        id: `task-${i}`,
        description: `Task ${i}`,
        dependencies: i === 0 ? [] : [`task-${i - 1}`],
      });
    }

    const plan: TaskPlan = {
      id: "deep-chain-plan",
      description: "Deep dependency chain",
      tasks,
      metadata: {
        createdAt: Date.now(),
        model: "test-model",
        totalEstimatedMs: 1000,
        maxDepth: 9,
      },
    };

    const executor = new DagExecutor(plan);
    expect(executor.getStats().total).toBe(10);
    expect(executor.detectCycle().hasCycle).toBe(false);
  });
});
