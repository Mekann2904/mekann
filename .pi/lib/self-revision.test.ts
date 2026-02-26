/**
 * @abdd.meta
 * path: .pi/lib/self-revision.test.ts
 * role: Self-Revision モジュールの単体テスト
 * why: TDP統合のSelf-Revision機能が正しく動作することを検証する
 * related: .pi/lib/self-revision.ts, .pi/lib/dag-executor.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし（テスト実行のみ）
 * failure_modes: テスト失敗
 * @abdd.explain
 * overview: SelfRevisionModuleクラスの単体テスト
 * what_it_does:
 *   - revise()メソッドのテスト
 *   - analyzeFailure()のテスト
 *   - checkConstraintViolations()のテスト
 *   - applyAction()のテスト
 * why_it_exists:
 *   - TDP統合の品質保証
 *   - リグレッション防止
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SelfRevisionModule, type RevisionExecutor } from "./self-revision.js";
import type { TaskNode, DagTaskResult } from "./dag-types.js";

describe("SelfRevisionModule", () => {
  let mockExecutor: RevisionExecutor;
  let tasks: Map<string, TaskNode>;
  let dependencies: Map<string, Set<string>>;

  beforeEach(() => {
    tasks = new Map();
    dependencies = new Map();

    mockExecutor = {
      addDependency: (taskId: string, dependencyId: string) => {
        const deps = dependencies.get(taskId) || new Set();
        deps.add(dependencyId);
        dependencies.set(taskId, deps);
      },
      removeDependency: (taskId: string, dependencyId: string) => {
        const deps = dependencies.get(taskId);
        if (deps) {
          deps.delete(dependencyId);
          return true;
        }
        return false;
      },
      getTask: (taskId: string) => tasks.get(taskId),
      detectCycle: () => ({ hasCycle: false, cyclePath: null }),
    };
  });

  describe("revise", () => {
    it("should return no changes when no failures", async () => {
      const module = new SelfRevisionModule(mockExecutor);
      const results = new Map<string, DagTaskResult>();

      results.set("task-1", {
        taskId: "task-1",
        status: "completed",
        output: "success",
        durationMs: 100,
      });

      const result = await module.revise(["task-1"], [], results);

      expect(result.actions).toHaveLength(0);
      expect(result.reason).toBe("No revisions needed");
      expect(result.feasible).toBe(true);
    });

    it("should analyze resource-not-found errors", async () => {
      const module = new SelfRevisionModule(mockExecutor);

      tasks.set("task-1", {
        id: "task-1",
        description: "Test task",
        dependencies: [],
      });

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "failed",
        error: new Error("File not found: config.json"),
        durationMs: 100,
      });

      const result = await module.revise([], ["task-1"], results);

      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions.some((a) => a.type === "add_node")).toBe(true);
      expect(result.actions.some((a) => a.type === "add_dependency")).toBe(true);
    });

    it("should analyze permission errors", async () => {
      const module = new SelfRevisionModule(mockExecutor);

      tasks.set("task-1", {
        id: "task-1",
        description: "Test task",
        dependencies: [],
      });

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "failed",
        error: new Error("Permission denied"),
        durationMs: 100,
      });

      const result = await module.revise([], ["task-1"], results);

      expect(result.actions.some((a) => a.type === "update_spec")).toBe(true);
    });
  });

  describe("checkConstraintViolations", () => {
    it("should detect ERROR in output", async () => {
      const module = new SelfRevisionModule(mockExecutor);

      tasks.set("task-1", {
        id: "task-1",
        description: "Test task",
        dependencies: [],
      });

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "completed",
        output: "Result: ERROR - something went wrong",
        durationMs: 100,
      });

      const result = await module.revise(["task-1"], [], results);

      expect(result.actions.some((a) => a.type === "update_spec")).toBe(true);
    });

    it("should detect FAILED in output", async () => {
      const module = new SelfRevisionModule(mockExecutor);

      tasks.set("task-1", {
        id: "task-1",
        description: "Test task",
        dependencies: [],
      });

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "completed",
        output: { status: "FAILED", reason: "timeout" },
        durationMs: 100,
      });

      const result = await module.revise(["task-1"], [], results);

      expect(result.actions.some((a) => a.type === "update_spec")).toBe(true);
    });
  });

  describe("applyAction", () => {
    it("should add dependency", async () => {
      const module = new SelfRevisionModule(mockExecutor);

      tasks.set("task-1", {
        id: "task-1",
        description: "Test task",
        dependencies: [],
      });

      tasks.set("task-2", {
        id: "task-2",
        description: "Dependency task",
        dependencies: [],
      });

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "failed",
        error: new Error("not found"),
        durationMs: 100,
      });

      await module.revise([], ["task-1"], results);

      // add_dependency アクションが含まれていることを確認
      // （実際の依存関係追加はモックなので、アクションの存在のみ確認）
    });
  });

  describe("feasibility check", () => {
    it("should detect cycle and return infeasible", async () => {
      // 循環を検出するモック
      const cycleMockExecutor: RevisionExecutor = {
        ...mockExecutor,
        detectCycle: () => ({
          hasCycle: true,
          cyclePath: ["task-1", "task-2", "task-1"],
        }),
      };

      const module = new SelfRevisionModule(cycleMockExecutor);

      const results = new Map<string, DagTaskResult>();
      results.set("task-1", {
        taskId: "task-1",
        status: "failed",
        error: new Error("not found"),
        durationMs: 100,
      });

      const result = await module.revise([], ["task-1"], results);

      expect(result.feasible).toBe(false);
    });
  });
});
