/**
 * @file .pi/lib/task-dependencies.ts の単体テスト
 * @description タスク依存関係グラフのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
	TaskDependencyGraph,
	formatDependencyGraphStats,
	type TaskDependencyNode,
	type TaskDependencyStatus,
	type AddTaskOptions,
	type CycleDetectionResult,
} from "@lib/task-dependencies";

// ============================================================================
// TaskDependencyGraph
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
		it("should_add_task_without_dependencies", () => {
			const node = graph.addTask("task-1");

			expect(node.id).toBe("task-1");
			expect(node.status).toBe("ready"); // No dependencies = ready
			expect(node.dependencies.size).toBe(0);
			expect(graph.hasTask("task-1")).toBe(true);
		});

		it("should_add_task_with_name_and_options", () => {
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

		it("should_add_task_with_dependencies", () => {
			graph.addTask("task-1");
			const node = graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(node.dependencies.has("task-1")).toBe(true);
			expect(node.status).toBe("pending"); // Has uncompleted dependency

			// Check dependents
			const depNode = graph.getTask("task-1");
			expect(depNode?.dependents.has("task-2")).toBe(true);
		});

		it("should_throw_for_duplicate_id", () => {
			graph.addTask("task-1");

			expect(() => graph.addTask("task-1")).toThrow(
				'Task with id "task-1" already exists'
			);
		});

		it("should_throw_for_missing_dependency", () => {
			expect(() => graph.addTask("task-1", { dependencies: ["nonexistent"] })).toThrow(
				'Dependency task "nonexistent" does not exist'
			);
		});

		it("should_become_ready_when_all_dependencies_completed", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(graph.getTask("task-2")?.status).toBe("pending");

			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			expect(graph.getTask("task-2")?.status).toBe("ready");
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

		it("should_return_false_for_nonexistent_task", () => {
			expect(graph.removeTask("nonexistent")).toBe(false);
		});

		it("should_throw_for_running_task", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			expect(() => graph.removeTask("task-1")).toThrow(
				'Cannot remove running task "task-1"'
			);
		});

		it("should_update_dependents_on_removal", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.removeTask("task-1");

			const node2 = graph.getTask("task-2");
			expect(node2?.dependencies.has("task-1")).toBe(false);
		});
	});

	// ========================================
	// Status Transitions
	// ========================================
	describe("markRunning", () => {
		it("should_change_status_to_running", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");

			expect(graph.getTask("task-1")?.status).toBe("running");
			expect(graph.getTask("task-1")?.startedAt).toBeDefined();
		});

		it("should_throw_for_nonexistent_task", () => {
			expect(() => graph.markRunning("nonexistent")).toThrow(
				'Task "nonexistent" does not exist'
			);
		});

		it("should_throw_for_not_ready_task", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			expect(() => graph.markRunning("task-2")).toThrow(
				'Task "task-2" is not ready'
			);
		});
	});

	describe("markCompleted", () => {
		it("should_change_status_to_completed", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			expect(graph.getTask("task-1")?.status).toBe("completed");
			expect(graph.getTask("task-1")?.completedAt).toBeDefined();
		});

		it("should_update_dependents_to_ready", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markCompleted("task-1");

			expect(graph.getTask("task-2")?.status).toBe("ready");
		});
	});

	describe("markFailed", () => {
		it("should_change_status_to_failed", () => {
			graph.addTask("task-1");
			graph.markRunning("task-1");
			const error = new Error("Test error");
			graph.markFailed("task-1", error);

			expect(graph.getTask("task-1")?.status).toBe("failed");
			expect(graph.getTask("task-1")?.error).toBe(error);
		});

		it("should_propagate_failure_to_dependents", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markRunning("task-1");
			graph.markFailed("task-1");

			expect(graph.getTask("task-2")?.status).toBe("failed");
		});
	});

	describe("markCancelled", () => {
		it("should_change_status_to_cancelled", () => {
			graph.addTask("task-1");
			graph.markCancelled("task-1");

			expect(graph.getTask("task-1")?.status).toBe("cancelled");
		});

		it("should_propagate_cancellation_to_dependents", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			graph.markCancelled("task-1");

			expect(graph.getTask("task-2")?.status).toBe("cancelled");
		});
	});

	// ========================================
	// Cycle Detection
	// ========================================
	describe("detectCycle", () => {
		it("should_return_no_cycle_for_simple_graph", () => {
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(false);
			expect(result.cyclePath).toBeNull();
		});

		it("should_detect_simple_cycle", () => {
			// Create cycle manually by adding tasks and modifying dependencies
			graph.addTask("task-1");
			graph.addTask("task-2", { dependencies: ["task-1"] });

			// Manually add reverse dependency to create cycle
			const node1 = graph.getTask("task-1")!;
			node1.dependencies.add("task-2");

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(true);
			expect(result.cyclePath).not.toBeNull();
		});

		it("should_detect_no_cycle_in_diamond_structure", () => {
			// Diamond: 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4
			graph.addTask("1");
			graph.addTask("2", { dependencies: ["1"] });
			graph.addTask("3", { dependencies: ["1"] });
			graph.addTask("4", { dependencies: ["2", "3"] });

			const result = graph.detectCycle();

			expect(result.hasCycle).toBe(false);
		});
	});

	// ========================================
	// Topological Order
	// ========================================
	describe("getTopologicalOrder", () => {
		it("should_return_valid_topological_order", () => {
			graph.addTask("1");
			graph.addTask("2", { dependencies: ["1"] });
			graph.addTask("3", { dependencies: ["1"] });
			graph.addTask("4", { dependencies: ["2", "3"] });

			const order = graph.getTopologicalOrder();

			expect(order).not.toBeNull();
			// 1 must come before 2, 3
			expect(order!.indexOf("1")).toBeLessThan(order!.indexOf("2"));
			expect(order!.indexOf("1")).toBeLessThan(order!.indexOf("3"));
			// 2 and 3 must come before 4
			expect(order!.indexOf("2")).toBeLessThan(order!.indexOf("4"));
			expect(order!.indexOf("3")).toBeLessThan(order!.indexOf("4"));
		});

		it("should_return_null_for_cyclic_graph", () => {
			graph.addTask("1");
			graph.addTask("2", { dependencies: ["1"] });
			// Manually create cycle
			graph.getTask("1")!.dependencies.add("2");

			expect(graph.getTopologicalOrder()).toBeNull();
		});
	});

	// ========================================
	// getStats
	// ========================================
	describe("getStats", () => {
		it("should_return_correct_stats_for_empty_graph", () => {
			const stats = graph.getStats();

			expect(stats.total).toBe(0);
			expect(stats.readyCount).toBe(0);
			expect(stats.maxDepth).toBe(0);
		});

		it("should_return_correct_stats_for_multiple_tasks", () => {
			graph.addTask("1");
			graph.addTask("2", { dependencies: ["1"] });
			graph.addTask("3", { dependencies: ["1"] });

			graph.markRunning("1");
			graph.markCompleted("1");

			const stats = graph.getStats();

			expect(stats.total).toBe(3);
			expect(stats.byStatus.completed).toBe(1);
			expect(stats.byStatus.ready).toBe(2);
			expect(stats.maxDepth).toBe(1);
		});
	});

	// ========================================
	// export/import
	// ========================================
	describe("export/import", () => {
		it("should_export_and_import_graph", () => {
			graph.addTask("1");
			graph.addTask("2", { dependencies: ["1"], name: "Task 2" });
			graph.addTask("3", { dependencies: ["1"] });

			const exported = graph.export();

			const newGraph = new TaskDependencyGraph();
			newGraph.import(exported);

			expect(newGraph.hasTask("1")).toBe(true);
			expect(newGraph.hasTask("2")).toBe(true);
			expect(newGraph.hasTask("3")).toBe(true);
			expect(newGraph.getTask("2")?.name).toBe("Task 2");
		});

		it("should_throw_for_cyclic_import", () => {
			const cyclicData = {
				tasks: [
					{ id: "1", dependencies: ["2"] },
					{ id: "2", dependencies: ["1"] },
				],
			};

			expect(() => graph.import(cyclicData)).toThrow();
		});
	});

	// ========================================
	// clear
	// ========================================
	describe("clear", () => {
		it("should_remove_all_tasks", () => {
			graph.addTask("1");
			graph.addTask("2");
			graph.clear();

			expect(graph.getStats().total).toBe(0);
		});
	});
});

// ============================================================================
// formatDependencyGraphStats
// ============================================================================

describe("formatDependencyGraphStats", () => {
	it("should_format_stats_correctly", () => {
		const graph = new TaskDependencyGraph();
		graph.addTask("1");
		graph.addTask("2", { dependencies: ["1"] });

		const stats = graph.getStats();
		const formatted = formatDependencyGraphStats(stats);

		expect(formatted).toContain("Total tasks: 2");
		expect(formatted).toContain("pending: 1");
		expect(formatted).toContain("ready: 1");
		expect(formatted).toContain("Max depth: 1");
	});
});

// ============================================================================
// Additional Tests: Dependency Cleanup
// ============================================================================

describe("TaskDependencyGraph - 依存関係クリーンアップ", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_remove_dependent_reference_when_dependency_removed", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["A"] });

		graph.removeTask("A");

		// B and C should have A removed from dependencies
		expect(graph.getTask("B")?.dependencies.has("A")).toBe(false);
		expect(graph.getTask("C")?.dependencies.has("A")).toBe(false);
	});

	it("should_remove_from_dependents_set_when_dependent_removed", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["A"] });

		graph.removeTask("B");

		// A's dependents should only contain C
		const nodeA = graph.getTask("A");
		expect(nodeA?.dependents.has("B")).toBe(false);
		expect(nodeA?.dependents.has("C")).toBe(true);
	});
});

// ============================================================================
// Additional Tests: Diamond Dependency Pattern
// ============================================================================

describe("TaskDependencyGraph - ダイヤモンド依存パターン", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_handle_diamond_dependency_correctly", () => {
		//     A
		//    / \
		//   B   C
		//    \ /
		//     D
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["A"] });
		graph.addTask("D", { dependencies: ["B", "C"] });

		// Initially only A is ready
		expect(graph.getTask("A")?.status).toBe("ready");
		expect(graph.getTask("B")?.status).toBe("pending");
		expect(graph.getTask("C")?.status).toBe("pending");
		expect(graph.getTask("D")?.status).toBe("pending");

		// Complete A
		graph.markRunning("A");
		graph.markCompleted("A");

		// B and C should become ready
		expect(graph.getTask("B")?.status).toBe("ready");
		expect(graph.getTask("C")?.status).toBe("ready");
		expect(graph.getTask("D")?.status).toBe("pending");

		// Complete B only
		graph.markRunning("B");
		graph.markCompleted("B");

		// D should still be pending (waiting for C)
		expect(graph.getTask("D")?.status).toBe("pending");

		// Complete C
		graph.markRunning("C");
		graph.markCompleted("C");

		// D should now be ready
		expect(graph.getTask("D")?.status).toBe("ready");
	});

	it("should_calculate_correct_depth_for_diamond", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["A"] });
		graph.addTask("D", { dependencies: ["B", "C"] });

		const stats = graph.getStats();
		expect(stats.maxDepth).toBe(2);
	});
});

// ============================================================================
// Additional Tests: Multiple Dependencies Completion
// ============================================================================

describe("TaskDependencyGraph - 複数依存の完了順序", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_require_all_dependencies_completed", () => {
		graph.addTask("A");
		graph.addTask("B");
		graph.addTask("C");
		graph.addTask("D", { dependencies: ["A", "B", "C"] });

		// Complete A only
		graph.markRunning("A");
		graph.markCompleted("A");
		expect(graph.getTask("D")?.status).toBe("pending");

		// Complete B
		graph.markRunning("B");
		graph.markCompleted("B");
		expect(graph.getTask("D")?.status).toBe("pending");

		// Complete C - now D should be ready
		graph.markRunning("C");
		graph.markCompleted("C");
		expect(graph.getTask("D")?.status).toBe("ready");
	});

	it("should_become_ready_regardless_of_completion_order", () => {
		graph.addTask("X");
		graph.addTask("Y");
		graph.addTask("Z", { dependencies: ["X", "Y"] });

		// Complete in reverse order
		graph.markRunning("Y");
		graph.markCompleted("Y");
		expect(graph.getTask("Z")?.status).toBe("pending");

		graph.markRunning("X");
		graph.markCompleted("X");
		expect(graph.getTask("Z")?.status).toBe("ready");
	});
});

// ============================================================================
// Additional Tests: Deep Failure Propagation
// ============================================================================

describe("TaskDependencyGraph - 失敗伝播の深いチェーン", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_propagate_failure_through_deep_chain", () => {
		// A -> B -> C -> D -> E
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["B"] });
		graph.addTask("D", { dependencies: ["C"] });
		graph.addTask("E", { dependencies: ["D"] });

		graph.markRunning("A");
		graph.markFailed("A", new Error("A failed"));

		expect(graph.getTask("B")?.status).toBe("failed");
		expect(graph.getTask("C")?.status).toBe("failed");
		expect(graph.getTask("D")?.status).toBe("failed");
		expect(graph.getTask("E")?.status).toBe("failed");
	});

	it("should_propagate_failure_through_diamond", () => {
		//     A
		//    / \
		//   B   C
		//    \ /
		//     D
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["A"] });
		graph.addTask("D", { dependencies: ["B", "C"] });

		graph.markRunning("A");
		graph.markFailed("A", new Error("Root failed"));

		expect(graph.getTask("B")?.status).toBe("failed");
		expect(graph.getTask("C")?.status).toBe("failed");
		expect(graph.getTask("D")?.status).toBe("failed");
	});

	it("should_propagate_cancellation_through_deep_chain", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });
		graph.addTask("C", { dependencies: ["B"] });

		graph.markCancelled("A");

		expect(graph.getTask("B")?.status).toBe("cancelled");
		expect(graph.getTask("C")?.status).toBe("cancelled");
	});
});

// ============================================================================
// Additional Tests: ReadyQueue Consistency
// ============================================================================

describe("TaskDependencyGraph - ReadyQueue整合性", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_remove_from_readyqueue_on_markRunning", () => {
		graph.addTask("A");
		graph.addTask("B");

		expect(graph.getReadyTaskIds()).toContain("A");
		expect(graph.getReadyTaskIds()).toContain("B");

		graph.markRunning("A");

		expect(graph.getReadyTaskIds()).not.toContain("A");
		expect(graph.getReadyTaskIds()).toContain("B");
	});

	it("should_add_to_readyqueue_on_dependencies_completed", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });

		expect(graph.getReadyTaskIds()).not.toContain("B");

		graph.markRunning("A");
		graph.markCompleted("A");

		expect(graph.getReadyTaskIds()).toContain("B");
	});

	it("should_remove_from_readyqueue_on_markFailed", () => {
		graph.addTask("A");
		graph.addTask("B", { dependencies: ["A"] });

		graph.markRunning("A");
		graph.markCompleted("A");
		expect(graph.getReadyTaskIds()).toContain("B");

		graph.markFailed("B", new Error("B failed"));
		expect(graph.getReadyTaskIds()).not.toContain("B");
	});

	it("should_not_add_duplicates_to_readyqueue", () => {
		graph.addTask("A");
		graph.addTask("B");
		graph.addTask("C", { dependencies: ["A", "B"] });

		graph.markRunning("A");
		graph.markCompleted("A");
		graph.markRunning("B");
		graph.markCompleted("B");

		// C should appear only once
		const readyIds = graph.getReadyTaskIds();
		const cCount = readyIds.filter((id) => id === "C").length;
		expect(cCount).toBe(1);
	});
});

// ============================================================================
// Additional Tests: Import Edge Cases
// ============================================================================

describe("TaskDependencyGraph - インポートエッジケース", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_import_empty_tasks_array", () => {
		graph.import({ tasks: [] });
		expect(graph.getAllTasks()).toHaveLength(0);
	});

	it("should_import_tasks_without_dependencies", () => {
		graph.import({
			tasks: [
				{ id: "task1", name: "First" },
				{ id: "task2", name: "Second" },
			],
		});

		expect(graph.getAllTasks()).toHaveLength(2);
		expect(graph.getTask("task1")?.name).toBe("First");
		expect(graph.getTask("task2")?.name).toBe("Second");
	});

	it("should_import_complex_dependency_graph", () => {
		graph.import({
			tasks: [
				{ id: "root", dependencies: [] },
				{ id: "left", dependencies: ["root"] },
				{ id: "right", dependencies: ["root"] },
				{ id: "leaf", dependencies: ["left", "right"] },
			],
		});

		expect(graph.getAllTasks()).toHaveLength(4);
		expect(graph.getTask("leaf")?.dependencies.has("left")).toBe(true);
		expect(graph.getTask("leaf")?.dependencies.has("right")).toBe(true);
	});

	it("should_throw_for_missing_dependency_in_import", () => {
		expect(() =>
			graph.import({
				tasks: [{ id: "task1", dependencies: ["nonexistent"] }],
			})
		).toThrow();
	});
});

// ============================================================================
// Additional Tests: Boundary Conditions
// ============================================================================

describe("TaskDependencyGraph - 境界条件", () => {
	let graph: TaskDependencyGraph;

	beforeEach(() => {
		graph = new TaskDependencyGraph();
	});

	it("should_handle_many_independent_tasks", () => {
		for (let i = 0; i < 100; i++) {
			graph.addTask(`task-${i}`);
		}

		expect(graph.getAllTasks()).toHaveLength(100);
		expect(graph.getStats().readyCount).toBe(100);
	});

	it("should_handle_deep_dependency_chain", () => {
		graph.addTask("task-0");
		for (let i = 1; i < 50; i++) {
			graph.addTask(`task-${i}`, { dependencies: [`task-${i - 1}`] });
		}

		const stats = graph.getStats();
		expect(stats.total).toBe(50);
		expect(stats.maxDepth).toBe(49);
	});

	it("should_handle_long_task_id", () => {
		const longId = "a".repeat(500);
		graph.addTask(longId);
		expect(graph.hasTask(longId)).toBe(true);
	});

	it("should_handle_unicode_task_id", () => {
		const unicodeId = "タスク-123-αβγ";
		graph.addTask(unicodeId);
		expect(graph.hasTask(unicodeId)).toBe(true);
	});
});
