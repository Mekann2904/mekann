/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  TaskGraphUpdater,
  EMPTY_DELTA,
  createDelta,
  type GraphDelta,
} from "../../lib/dag-weight-updater.js";
import type { TaskNode } from "../../lib/dag-types.js";

describe("dag-weight-updater", () => {
  describe("EMPTY_DELTA", () => {
    it("should_have_empty_arrays_for_all_fields", () => {
      // Arrange & Act & Assert
      expect(EMPTY_DELTA.addedTasks).toEqual([]);
      expect(EMPTY_DELTA.completedTaskIds).toEqual([]);
      expect(EMPTY_DELTA.failedTaskIds).toEqual([]);
      expect(EMPTY_DELTA.updatedTasks).toEqual([]);
    });
  });

  describe("createDelta", () => {
    it("should_create_full_delta_from_partial", () => {
      // Arrange
      const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };

      // Act
      const delta = createDelta({
        addedTasks: [task],
        completedTaskIds: ["task2"],
      });

      // Assert
      expect(delta.addedTasks).toEqual([task]);
      expect(delta.completedTaskIds).toEqual(["task2"]);
      expect(delta.failedTaskIds).toEqual([]);
      expect(delta.updatedTasks).toEqual([]);
    });

    it("should_return_empty_delta_for_no_input", () => {
      // Act
      const delta = createDelta({});

      // Assert
      expect(delta).toEqual(EMPTY_DELTA);
    });
  });

  describe("TaskGraphUpdater", () => {
    let updater: TaskGraphUpdater;

    beforeEach(() => {
      updater = new TaskGraphUpdater();
    });

    describe("constructor", () => {
      it("should_initialize_with_default_config", () => {
        // Arrange & Act & Assert
        expect(updater).toBeDefined();
        expect(updater.getStats().totalTasks).toBe(0);
      });
    });

    describe("updateGraph", () => {
      it("should_add_new_tasks", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const delta: GraphDelta = {
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        };

        // Act
        updater.updateGraph(delta);

        // Assert
        expect(updater.getTask("task1")).toBeDefined();
        expect(updater.getTaskStatus("task1")).toBe("pending");
      });

      it("should_mark_tasks_as_completed", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1"],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert
        expect(updater.getTaskStatus("task1")).toBe("completed");
      });

      it("should_mark_tasks_as_failed", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: [],
          failedTaskIds: ["task1"],
          updatedTasks: [],
        });

        // Assert
        expect(updater.getTaskStatus("task1")).toBe("failed");
      });

      it("should_handle_multiple_operations_in_single_delta", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: [], priority: 1 };
        const task3: TaskNode = { id: "task3", dependencies: [], priority: 1 };

        // Add tasks
        updater.updateGraph({
          addedTasks: [task1, task2, task3],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1", "task2"],
          failedTaskIds: ["task3"],
          updatedTasks: [],
        });

        // Assert
        expect(updater.getTaskStatus("task1")).toBe("completed");
        expect(updater.getTaskStatus("task2")).toBe("completed");
        expect(updater.getTaskStatus("task3")).toBe("failed");
      });
    });

    describe("getEdgeWeights", () => {
      it("should_return_empty_map_initially", () => {
        // Arrange & Act & Assert
        expect(updater.getEdgeWeights().size).toBe(0);
      });

      it("should_calculate_edge_weights_for_dependencies", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: ["task1"], priority: 2 };

        // Act
        updater.updateGraph({
          addedTasks: [task1, task2],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert
        const weights = updater.getEdgeWeights();
        expect(weights.has("task1:task2")).toBe(true);
        expect(weights.get("task1:task2")).toBeGreaterThan(0);
      });

      it("should_set_weight_to_zero_for_completed_dependencies", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: ["task1"], priority: 2 };

        updater.updateGraph({
          addedTasks: [task1, task2],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1"],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert
        const weights = updater.getEdgeWeights();
        expect(weights.get("task1:task2")).toBe(0);
      });
    });

    describe("getTaskTotalWeight", () => {
      it("should_return_zero_for_task_without_dependencies", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act & Assert
        expect(updater.getTaskTotalWeight("task1")).toBe(0);
      });

      it("should_sum_weights_from_all_dependencies", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: [], priority: 1 };
        const task3: TaskNode = {
          id: "task3",
          dependencies: ["task1", "task2"],
          priority: 2,
        };

        // Act
        updater.updateGraph({
          addedTasks: [task1, task2, task3],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert
        const totalWeight = updater.getTaskTotalWeight("task3");
        expect(totalWeight).toBeGreaterThan(0);
      });
    });

    describe("getAllTaskWeights", () => {
      it("should_return_weights_for_all_tasks", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: [], priority: 1 };

        updater.updateGraph({
          addedTasks: [task1, task2],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        const weights = updater.getAllTaskWeights();

        // Assert
        expect(weights.size).toBe(2);
        expect(weights.has("task1")).toBe(true);
        expect(weights.has("task2")).toBe(true);
      });
    });

    describe("getReadyTasks", () => {
      it("should_return_pending_tasks_with_completed_dependencies", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: ["task1"], priority: 1 };

        updater.updateGraph({
          addedTasks: [task1, task2],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Initially task1 should be ready
        expect(updater.getReadyTasks().map((t) => t.id)).toContain("task1");

        // Act - Complete task1
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1"],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert - Now task2 should be ready
        const readyTasks = updater.getReadyTasks();
        expect(readyTasks.map((t) => t.id)).toContain("task2");
      });

      it("should_not_return_non_pending_tasks", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };

        updater.updateGraph({
          addedTasks: [task1],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act - Complete task1
        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1"],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Assert - No ready tasks
        expect(updater.getReadyTasks()).toEqual([]);
      });
    });

    describe("getStats", () => {
      it("should_return_correct_statistics", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: ["task1"], priority: 1 };

        updater.updateGraph({
          addedTasks: [task1, task2],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        const stats = updater.getStats();

        // Assert
        expect(stats.totalTasks).toBe(2);
        expect(stats.pendingTasks).toBe(2);
        expect(stats.completedTasks).toBe(0);
        expect(stats.failedTasks).toBe(0);
        expect(stats.totalEdges).toBe(1);
      });

      it("should_track_all_status_counts", () => {
        // Arrange
        const task1: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        const task2: TaskNode = { id: "task2", dependencies: [], priority: 1 };
        const task3: TaskNode = { id: "task3", dependencies: [], priority: 1 };

        updater.updateGraph({
          addedTasks: [task1, task2, task3],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        updater.updateGraph({
          addedTasks: [],
          completedTaskIds: ["task1"],
          failedTaskIds: ["task2"],
          updatedTasks: [],
        });

        // Act
        const stats = updater.getStats();

        // Assert
        expect(stats.totalTasks).toBe(3);
        expect(stats.pendingTasks).toBe(1);
        expect(stats.completedTasks).toBe(1);
        expect(stats.failedTasks).toBe(1);
      });
    });

    describe("getTask", () => {
      it("should_return_task_by_id", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act & Assert
        const result = updater.getTask("task1");
        expect(result).toBeDefined();
        expect(result?.id).toBe("task1");
      });

      it("should_return_undefined_for_nonexistent_task", () => {
        // Act & Assert
        expect(updater.getTask("nonexistent")).toBeUndefined();
      });
    });

    describe("getTaskStatus", () => {
      it("should_return_task_status", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act & Assert
        expect(updater.getTaskStatus("task1")).toBe("pending");
      });

      it("should_return_undefined_for_nonexistent_task", () => {
        // Act & Assert
        expect(updater.getTaskStatus("nonexistent")).toBeUndefined();
      });
    });

    describe("updateConfig", () => {
      it("should_update_weight_config", () => {
        // Arrange & Act
        updater.updateConfig({ priorityWeight: 5.0 });

        // Assert - No error should be thrown
        expect(updater).toBeDefined();
      });
    });

    describe("reset", () => {
      it("should_clear_all_data", () => {
        // Arrange
        const task: TaskNode = { id: "task1", dependencies: [], priority: 1 };
        updater.updateGraph({
          addedTasks: [task],
          completedTaskIds: [],
          failedTaskIds: [],
          updatedTasks: [],
        });

        // Act
        updater.reset();

        // Assert
        expect(updater.getStats().totalTasks).toBe(0);
        expect(updater.getEdgeWeights().size).toBe(0);
      });
    });
  });
});
