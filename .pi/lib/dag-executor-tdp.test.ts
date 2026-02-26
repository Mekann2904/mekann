/**
 * @abdd.meta
 * path: .pi/lib/dag-executor-tdp.test.ts
 * role: DAG ExecutorのTDP統合機能テスト
 * why: Context Scoping、Local Replanning、Self-Revisionの統合テスト
 * related: .pi/lib/dag-executor.ts, .pi/lib/self-revision.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし（テスト実行のみ）
 * failure_modes: テスト失敗
 * @abdd.explain
 * overview: DagExecutorクラスのTDP統合機能テスト
 * what_it_does:
 *   - Node-scoped Contextのテスト
 *   - Local Replanningのテスト
 *   - Self-Revision統合のテスト
 * why_it_exists:
 *   - TDP統合の品質保証
 *   - 統合シナリオの検証
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DagExecutor, type TaskExecutor, type NodeExecutionContext, type ExecutionTraceEntry } from "./dag-executor.js";
import type { TaskPlan, TaskNode } from "./dag-types.js";

describe("DagExecutor - TDP Integration", () => {
  let simplePlan: TaskPlan;

  beforeEach(() => {
    simplePlan = {
      id: "test-plan",
      description: "Test plan for TDP integration",
      tasks: [
        {
          id: "task-1",
          description: "First task",
          dependencies: [],
          assignedAgent: "implementer",
          priority: "high",
        },
        {
          id: "task-2",
          description: "Second task",
          dependencies: ["task-1"],
          assignedAgent: "implementer",
          priority: "high",
        },
      ],
      metadata: {
        createdAt: Date.now(),
        model: "test",
        totalEstimatedMs: 1000,
        maxDepth: 1,
      },
    };
  });

  describe("Node-scoped Context", () => {
    it("should build context with prerequisite results only", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
      });

      const results: Map<string, unknown> = new Map();

      const taskExecutor: TaskExecutor<string> = async (
        task: TaskNode,
        context: string,
      ) => {
        results.set(task.id, context);
        return `Result of ${task.id}`;
      };

      await executor.execute(taskExecutor);

      // task-1のコンテキストは空（前提タスクなし）
      expect(results.get("task-1")).toBeDefined();

      // task-2のコンテキストにはtask-1の結果が含まれる
      const task2Context = results.get("task-2") as string;
      expect(task2Context).toContain("task-1");
    });

    it("should include execution trace in context", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableSelfRevision: false, // Self-Revision無効でテスト
      });

      let capturedContext: string | null = null;

      const taskExecutor: TaskExecutor<string> = async (
        task: TaskNode,
        context: string,
      ) => {
        if (task.id === "task-2") {
          capturedContext = context;
        }
        return `Result of ${task.id}`;
      };

      await executor.execute(taskExecutor);

      // task-2のコンテキストには前提タスクの結果が含まれる
      expect(capturedContext).toBeDefined();
      expect(capturedContext).toContain("Result from task-1");
    });
  });

  describe("Local Replanning", () => {
    it("should retry recoverable errors", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableLocalReplanning: true,
        maxRetriesPerNode: 2,
        isRecoverableError: (error: Error) => {
          return error.message.includes("timeout");
        },
      });

      let attemptCount = 0;

      const taskExecutor: TaskExecutor<string> = async (
        task: TaskNode,
        context: string,
      ) => {
        if (task.id === "task-1") {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("timeout: operation took too long");
          }
        }
        return `Result of ${task.id}`;
      };

      const result = await executor.execute(taskExecutor);

      // 再試行が行われたことを確認
      expect(attemptCount).toBe(2);
      expect(result.overallStatus).toBe("completed");
    });

    it("should fail after max retries", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableLocalReplanning: true,
        maxRetriesPerNode: 1,
        isRecoverableError: () => true, // 常にリカバリー可能
      });

      const taskExecutor: TaskExecutor<string> = async () => {
        throw new Error("Persistent error");
      };

      const result = await executor.execute(taskExecutor);

      expect(result.overallStatus).toBe("failed");
    });

    it("should not retry non-recoverable errors", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableLocalReplanning: true,
        maxRetriesPerNode: 3,
        isRecoverableError: (error: Error) => {
          return error.message.includes("timeout");
        },
      });

      let attemptCount = 0;

      const taskExecutor: TaskExecutor<string> = async () => {
        attemptCount++;
        throw new Error("Critical error: not recoverable");
      };

      const result = await executor.execute(taskExecutor);

      // リカバリー不可能なエラーは再試行されない
      expect(attemptCount).toBe(1);
      expect(result.overallStatus).toBe("failed");
    });
  });

  describe("Self-Revision Integration", () => {
    it("should trigger self-revision after batch completion", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableSelfRevision: true,
      });

      const taskExecutor: TaskExecutor<string> = async (
        task: TaskNode,
        context: string,
      ) => {
        return `Result of ${task.id}`;
      };

      const result = await executor.execute(taskExecutor);

      expect(result.overallStatus).toBe("completed");
    });

    it("should handle self-revision with failures", async () => {
      const planWithFailure: TaskPlan = {
        id: "test-plan-with-failure",
        description: "Test plan with failure",
        tasks: [
          {
            id: "task-1",
            description: "Failing task",
            dependencies: [],
            assignedAgent: "implementer",
            priority: "high",
          },
          {
            id: "task-2",
            description: "Dependent task",
            dependencies: ["task-1"],
            assignedAgent: "implementer",
            priority: "high",
          },
        ],
        metadata: {
          createdAt: Date.now(),
          model: "test",
          totalEstimatedMs: 1000,
          maxDepth: 1,
        },
      };

      const executor = new DagExecutor(planWithFailure, {
        maxConcurrency: 1,
        enableSelfRevision: true,
        abortOnFirstError: false,
      });

      const taskExecutor: TaskExecutor<string> = async (
        task: TaskNode,
        context: string,
      ) => {
        if (task.id === "task-1") {
          throw new Error("not found: resource missing");
        }
        return `Result of ${task.id}`;
      };

      const result = await executor.execute(taskExecutor);

      // task-1が失敗し、task-2はスキップされる
      expect(result.overallStatus).toBe("failed");
      expect(result.failedTaskIds).toContain("task-1");
    });
  });

  describe("Statistics", () => {
    it("should track node retry counts", async () => {
      const executor = new DagExecutor(simplePlan, {
        maxConcurrency: 1,
        enableLocalReplanning: true,
        maxRetriesPerNode: 2,
        isRecoverableError: () => true,
      });

      let attemptCount = 0;

      const taskExecutor: TaskExecutor<string> = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Temporary error");
        }
        return "Success";
      };

      await executor.execute(taskExecutor);

      const stats = executor.getStats();
      expect(stats.completed).toBeGreaterThan(0);
    });
  });
});

describe("NodeExecutionContext", () => {
  it("should create context with correct structure", () => {
    const context: NodeExecutionContext = {
      prerequisiteResults: new Map(),
      localTrace: [],
      nodeSpec: {
        id: "test-task",
        description: "Test task",
        dependencies: [],
      },
    };

    expect(context.prerequisiteResults).toBeInstanceOf(Map);
    expect(context.localTrace).toEqual([]);
    expect(context.nodeSpec.id).toBe("test-task");
  });

  it("should track execution trace entries", () => {
    const trace: ExecutionTraceEntry[] = [];

    trace.push({
      timestamp: Date.now(),
      type: "action",
      content: "Starting task",
    });

    trace.push({
      timestamp: Date.now(),
      type: "observation",
      content: "Received response",
    });

    expect(trace).toHaveLength(2);
    expect(trace[0].type).toBe("action");
    expect(trace[1].type).toBe("observation");
  });
});
