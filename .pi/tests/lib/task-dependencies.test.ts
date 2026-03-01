/**
 * @file .pi/lib/task-dependencies.ts のテスト
 * @description タスク依存関係グラフのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
	TaskDependencyGraph,
	formatDependencyGraphStats,
	type TaskDependencyNode,
	type AddTaskOptions,
	type CycleDetectionResult,
} from "../../lib/task-dependencies.js";

// ============================================================================
// Tests
// ============================================================================

describe("TaskDependencyGraph", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	// ========================================
	// addTask
	// ========================================

	describe("addTask", () => {
		it("should_add_task_with_id_only", () => {
			const node = graph.addTask("task-1");

			expect(node.id).toBe("task-1");
			expect(node.status).toBe("ready"); // No dependencies, immediately ready
			expect(node.dependencies.size).toBe(0);
			expect(graph.hasTask("task-1")).toBe(true);
		});

		it("should_add_task_with_options", () => {
			const options: AddTaskOptions = {
				name: "Test Task",
				priority: "high",
				estimatedDurationMs: 5000,
			};

			const node = graph.addTask("task-1", options);

			expect(node.name).toBe("Test Task");
			expect(node.priority).toBe("high");
			expect(node.estimatedDurationMs).toBe(5000);
		});

		it("should_throw_on_duplicate_id", () => {
			graph.addTask("task-1");

			expect(() => graph.addTask("task-1")).toThrow(
				'Task with id "task-1" already exists'
			);
		});

		it("should_throw_on_missing_dependency", () => {
			expect(() =>
				graph.addTask("task-2", { dependencies: ["non-existent"] })
			).toThrow('Dependency task "non-existent" does not exist');
		});

		it("should_set_status_to_pending_when_has_dependencies", () => {
			graph.addTask("task-1");
			const node = graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(node.status).toBe("pending");
		});

		it("should_update_dependents_on_dependencies", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			const task1 = graph.getTask("task-1");
			expect(task1?.dependents.has("task-2")).toBe(true);
		});

		it("should_support_multiple_dependencies", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");
			const node = graph.addTask("task-3", {
				dependencies: ["task-1", "task-2"],
			});

			expect(node.dependencies.size).toBe(2);
			expect(node.dependencies.has("task-1")).toBe(true);
			expect(node.dependencies.has("task-2")).toBe(true);
		});
	});

	// ========================================
	// removeTask
	// ========================================

	describe("removeTask", () => {
		it("should_remove_existing_task", () => {
			graph.addTask("task-1");

			const result = graph.removeTask("task-1");

			expect(result).toBe(true);
			expect(graph.hasTask("task-1")).toBe(false);
		});

		it("should_return_false_for_non_existent_task", () => {
			expect(graph.removeTask("non-existent")).toBe(false);
		});

		it("should_throw_on_running_task", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			expect(() => graph.removeTask("task-1")).toThrow(
				'Cannot remove running task "task-1"'
			);
		});

		it("should_update_dependent_relationships", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.removeTask("task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.dependencies.has("task-1")).toBe(false);
		});

		it("should_remove_from_ready_queue", () => {
			graph.addTask("task-1");

			graph.removeTask("task-1");

			expect(graph.getReadyTaskIds()).not.toContain("task-1");
		});
	});

	// ========================================
	// hasTask / getTask
	// ========================================

	describe("hasTask / getTask", () => {
		it("hasTask_should_return_true_for_existing_task", () => {
			graph.addTask("task-1");

			expect(graph.hasTask("task-1")).toBe(true);
			expect(graph.hasTask("non-existent")).toBe(false);
		});

		it("getTask_should_return_node_for_existing_task", () => {
			graph.addTask("task-1");

			const node = graph.getTask("task-1");
			expect(node?.id).toBe("task-1");
		});

		it("getTask_should_return_undefined_for_non_existent", () => {
			expect(graph.getTask("non-existent")).toBeUndefined();
		});
	});

	// ========================================
	// getAllTasks / getReadyTasks
	// ========================================

	describe("getAllTasks / getReadyTasks", () => {
		it("getAllTasks_should_return_all_tasks", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");

			const tasks = graph.getAllTasks();

			expect(tasks).toHaveLength(2);
			expect(tasks.map((t) => t.id)).toContain("task-1");
			expect(tasks.map((t) => t.id)).toContain("task-2");
		});

		it("getReadyTasks_should_return_only_ready_tasks", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");
			graph.addTask("task-3", { dependencies: ["task-1"] });

			const readyTasks = graph.getReadyTasks();

			expect(readyTasks).toHaveLength(2);
			expect(readyTasks.map((t) => t.id)).toContain("task-1");
			expect(readyTasks.map((t) => t.id)).toContain("task-2");
		});
	});

	// ========================================
	// isTaskReady
	// ========================================

	describe("isTaskReady", () => {
		it("should_return_true_for_task_with_completed_dependencies", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			expect(graph.isTaskReady("task-2")).toBe(true);
		});

		it("should_return_false_for_task_with_pending_dependencies", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(graph.isTaskReady("task-2")).toBe(false);
		});

		it("should_return_false_for_non_existent_task", () => {
			expect(graph.isTaskReady("non-existent")).toBe(false);
		});
	});

	// ========================================
	// markRunning
	// ========================================

	describe("markRunning", () => {
		it("should_set_status_to_running", () => {
			graph.addTask("task-1");

			graph.markRunning("task-1");

			const node = graph.getTask("task-1");
			expect(node?.status).toBe("running");
			expect(node?.startedAt).toBeDefined();
		});

		it("should_remove_from_ready_queue", () => {
			graph.addTask("task-1");

			graph.markRunning("task-1");

			expect(graph.getReadyTaskIds()).not.toContain("task-1");
		});

		it("should_throw_for_non_existent_task", () => {
			expect(() => graph.markRunning("non-existent")).toThrow(
				'Task "non-existent" does not exist'
			);
		});

		it("should_throw_for_non_ready_task", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			expect(() => graph.markRunning("task-1")).toThrow(
				'Task "task-1" is not ready'
			);
		});
	});

	// ========================================
	// markCompleted
	// ========================================

	describe("markCompleted", () => {
		it("should_set_status_to_completed", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			graph.markCompleted("task-1");

			const node = graph.getTask("task-1");
			expect(node?.status).toBe("completed");
			expect(node?.completedAt).toBeDefined();
		});

		it("should_make_dependents_ready", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.status).toBe("ready");
			expect(graph.getReadyTaskIds()).toContain("task-2");
		});

		it("should_throw_for_non_existent_task", () => {
			expect(() => graph.markCompleted("non-existent")).toThrow(
				'Task "non-existent" does not exist'
			);
		});
	});

	// ========================================
	// markFailed
	// ========================================

	describe("markFailed", () => {
		it("should_set_status_to_failed", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			graph.markFailed("task-1", new Error("Test error"));

			const node = graph.getTask("task-1");
			expect(node?.status).toBe("failed");
			expect(node?.error?.message).toBe("Test error");
		});

		it("should_propagate_failure_to_dependents", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markFailed("task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.status).toBe("failed");
		});
	});

	// ========================================
	// markCancelled
	// ========================================

	describe("markCancelled", () => {
		it("should_set_status_to_cancelled", () => {
			graph.addTask("task-1");

			graph.markCancelled("task-1");

			const node = graph.getTask("task-1");
			expect(node?.status).toBe("cancelled");
		});

		it("should_propagate_cancellation_to_dependents", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markCancelled("task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.status).toBe("cancelled");
		});
	});

	// ========================================
	// addDependency
	// ========================================

	describe("addDependency", () => {
		it("should_add_dependency_between_tasks", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");

			graph.addDependency("task-2", "task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.dependencies.has("task-1")).toBe(true);

			const task1 = graph.getTask("task-1");
			expect(task1?.dependents.has("task-2")).toBe(true);
		});

		it("should_throw_for_self_dependency", () => {
			graph.addTask("task-1");

			expect(() => graph.addDependency("task-1", "task-1")).toThrow(
				"Task cannot depend on itself"
			);
		});

		it("should_throw_for_existing_dependency", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(() => graph.addDependency("task-2", "task-1")).toThrow(
				'already depends on "task-1"'
			);
		});

		it("should_throw_for_cycle_creation", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(() => graph.addDependency("task-1", "task-2")).toThrow(
				"would create a cycle"
			);
		});

		it("should_update_status_to_pending_when_adding_dependency", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");

			graph.addDependency("task-2", "task-1");

			const task2 = graph.getTask("task-2");
			expect(task2?.status).toBe("pending");
		});
	});

	// ========================================
	// removeDependency
	// ========================================

	describe("removeDependency", () => {
		it("should_remove_dependency", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			const result = graph.removeDependency("task-2", "task-1");

			expect(result).toBe(true);
			const task2 = graph.getTask("task-2");
			expect(task2?.dependencies.has("task-1")).toBe(false);
		});

		it("should_return_false_if_dependency_not_exists", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");

			expect(graph.removeDependency("task-2", "task-1")).toBe(false);
		});

		it("should_make_task_ready_if_all_dependencies_completed", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			// Task-2 should now be ready
			expect(graph.getTask("task-2")?.status).toBe("ready");
		});
	});

	// ========================================
	// detectCycle
	// ========================================

	describe("detectCycle", () => {
		it("should_return_no_cycle_for_dag", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });
			graph.addTask("task-3", { dependencies: ["task-2"] });

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(false);
			expect(result.cyclePath).toBeNull();
		});

		it("should_detect_simple_cycle", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			// Manually create a cycle (bypassing addDependency validation)
			const task1 = graph.getTask("task-1")!;
			const task2 = graph.getTask("task-2")!;
			task1.dependencies.add("task-2");
			task2.dependents.add("task-1");

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(true);
			expect(result.cyclePath).toBeDefined();
		});

		it("should_detect_longer_cycle", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });
			graph.addTask("task-3", { dependencies: ["task-2"] });

			// Create cycle: task-1 -> task-2 -> task-3 -> task-1
			const task1 = graph.getTask("task-1")!;
			task1.dependencies.add("task-3");

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(true);
		});
	});

	// ========================================
	// getTopologicalOrder
	// ========================================

	describe("getTopologicalOrder", () => {
		it("should_return_topological_order_for_dag", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });
			graph.addTask("task-3", { dependencies: ["task-2"] });

			const order = graph.getTopologicalOrder();

			expect(order).toBeDefined();
			expect(order!.indexOf("task-1")).toBeLessThan(order!.indexOf("task-2"));
			expect(order!.indexOf("task-2")).toBeLessThan(order!.indexOf("task-3"));
		});

		it("should_return_null_for_graph_with_cycle", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			// Create cycle
			const task1 = graph.getTask("task-1")!;
			task1.dependencies.add("task-2");

			expect(graph.getTopologicalOrder()).toBeNull();
		});

		it("should_handle_independent_tasks", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");
			graph.addTask("task-3");

			const order = graph.getTopologicalOrder();

			expect(order).toBeDefined();
			expect(order).toHaveLength(3);
		});
	});

	// ========================================
	// getStats
	// ========================================

	describe("getStats", () => {
		it("should_return_correct_stats", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });
			graph.addTask("task-3");

			graph.markRunning("task-1");

			const stats = graph.getStats();

			expect(stats.total).toBe(3);
			expect(stats.byStatus.ready).toBe(1); // task-3
			expect(stats.byStatus.running).toBe(1); // task-1
			expect(stats.byStatus.pending).toBe(1); // task-2
		});

		it("should_calculate_max_depth", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });
			graph.addTask("task-3", { dependencies: ["task-2"] });

			const stats = graph.getStats();

			expect(stats.maxDepth).toBe(2);
		});
	});

	// ========================================
	// clear
	// ========================================

	describe("clear", () => {
		it("should_remove_all_tasks", () => {
			graph.addTask("task-1");
			graph.addTask("task-2");

			graph.clear();

			expect(graph.getAllTasks()).toHaveLength(0);
			expect(graph.getReadyTaskIds()).toHaveLength(0);
		});
	});

	// ========================================
	// export / import
	// ========================================

	describe("export / import", () => {
		it("should_export_graph_data", () => {
			graph.addTask("task-1", { name: "Task 1" });
			graph.addTask("task-2", {
				name: "Task 2",
				dependencies: ["task-1"],
			});

			const data = graph.export();

			expect(data.tasks).toHaveLength(2);
			expect(data.tasks.find((t) => t.id === "task-2")?.dependencies).toContain(
				"task-1"
			);
		});

		it("should_import_graph_data", () => {
			const data = {
				tasks: [
					{ id: "task-1", name: "Task 1" },
					{ id: "task-2", name: "Task 2", dependencies: ["task-1"] },
				],
			};

			graph.import(data);

			expect(graph.hasTask("task-1")).toBe(true);
			expect(graph.hasTask("task-2")).toBe(true);
			expect(graph.getTask("task-2")?.dependencies.has("task-1")).toBe(true);
		});

		it("should_throw_on_import_with_cycle", () => {
			const data = {
				tasks: [
					{ id: "task-1", dependencies: ["task-2"] },
					{ id: "task-2", dependencies: ["task-1"] },
				],
			};

			expect(() => graph.import(data)).toThrow(
				"Cannot import graph: cycle or missing dependencies"
			);
		});

		it("should_roundtrip_export_import", () => {
			graph.addTask("task-1", { name: "Task 1", priority: "high" });
			graph.addTask("task-2", {
				name: "Task 2",
				dependencies: ["task-1"],
				priority: "normal",
			});

			const data = graph.export();

			const newGraph = new TaskDependencyGraph();
			newGraph.import(data);

			expect(newGraph.getAllTasks()).toHaveLength(2);
			expect(newGraph.getTask("task-1")?.priority).toBe("high");
		});
	});
});

// ============================================================================
// formatDependencyGraphStats
// ============================================================================

describe("formatDependencyGraphStats", () => {
	it("should_format_stats_correctly", () => {
		const graph = new TaskDependencyGraph();
		graph.addTask("task-1");
		graph.addTask("task-2", { dependencies: ["task-1"] });

		const stats = graph.getStats();
		const formatted = formatDependencyGraphStats(stats);

		expect(formatted).toContain("Total tasks: 2");
		expect(formatted).toContain("pending: 1");
		expect(formatted).toContain("ready: 1");
		expect(formatted).toContain("Max depth: 1");
	});
});
