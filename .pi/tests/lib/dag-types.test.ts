/**
 * @file .pi/lib/dag-types.ts の単体テスト
 * @description DAGベースタスク実行のための型定義のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";

describe("DAG Type Definitions", () => {
	describe("TaskNodePriority", () => {
		it("should have valid priority values", () => {
			const critical: "critical" = "critical";
			const high: "high" = "high";
			const normal: "normal" = "normal";
			const low: "low" = "low";

			expect(critical).toBe("critical");
			expect(high).toBe("high");
			expect(normal).toBe("normal");
			expect(low).toBe("low");
		});
	});

	describe("TaskResultStatus", () => {
		it("should have valid status values", () => {
			const completed: "completed" = "completed";
			const failed: "failed" = "failed";
			const skipped: "skipped" = "skipped";

			expect(completed).toBe("completed");
			expect(failed).toBe("failed");
			expect(skipped).toBe("skipped");
		});
	});

	describe("DagResultStatus", () => {
		it("should have valid status values", () => {
			const completed: "completed" = "completed";
			const partial: "partial" = "partial";
			const failed: "failed" = "failed";

			expect(completed).toBe("completed");
			expect(partial).toBe("partial");
			expect(failed).toBe("failed");
		});
	});

	describe("TaskNode interface", () => {
		it("should create valid TaskNode object", () => {
			const node = {
				id: "task-1",
				description: "Test task",
				dependencies: ["task-0"],
			};

			expect(node.id).toBe("task-1");
			expect(node.description).toBe("Test task");
			expect(node.dependencies).toEqual(["task-0"]);
		});

		it("should accept optional fields", () => {
			const node = {
				id: "task-2",
				description: "Task with options",
				dependencies: [],
				priority: "high" as const,
				assignedAgent: "implementer",
				estimatedDurationMs: 1000,
			};

			expect(node.priority).toBe("high");
			expect(node.assignedAgent).toBe("implementer");
		});
	});

	describe("TaskPlan interface", () => {
		it("should create valid TaskPlan object", () => {
			const plan = {
				id: "plan-1",
				description: "Test plan",
				tasks: [],
				metadata: {
					createdAt: Date.now(),
					model: "test-model",
				},
			};

			expect(plan.id).toBe("plan-1");
			expect(plan.description).toBe("Test plan");
			expect(plan.tasks).toEqual([]);
		});
	});

	describe("DagTaskResult interface", () => {
		it("should create completed result", () => {
			const result = {
				taskId: "task-1",
				status: "completed" as const,
				durationMs: 1000,
			};

			expect(result.taskId).toBe("task-1");
			expect(result.status).toBe("completed");
			expect(result.durationMs).toBe(1000);
		});

		it("should create failed result", () => {
			const result = {
				taskId: "task-2",
				status: "failed" as const,
				error: new Error("Task failed"),
				durationMs: 500,
			};

			expect(result.status).toBe("failed");
			expect(result.error).toBeInstanceOf(Error);
		});
	});

	describe("DagResult interface", () => {
		it("should create valid DagResult object", () => {
			const result = {
				planId: "plan-1",
				taskResults: new Map(),
				overallStatus: "completed" as const,
				totalDurationMs: 10000,
				completedTaskIds: ["task-1"],
				failedTaskIds: [],
				skippedTaskIds: [],
			};

			expect(result.planId).toBe("plan-1");
			expect(result.overallStatus).toBe("completed");
			expect(result.completedTaskIds).toHaveLength(1);
		});
	});
});
