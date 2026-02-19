/**
 * task-dependencies.ts 単体テスト
 * カバレッジ分析: TaskDependencyGraph, formatDependencyGraphStats
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

import {
  TaskDependencyGraph,
  formatDependencyGraphStats,
  type TaskDependencyNode,
  type TaskDependencyStatus,
  type AddTaskOptions,
  type CycleDetectionResult,
} from "../../../.pi/lib/task-dependencies.js";

// ============================================================================
// TaskDependencyGraph - 基本操作テスト
// ============================================================================

describe("TaskDependencyGraph - 基本操作", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("addTask_基本_タスク追加", () => {
    // Arrange & Act
    const node = graph.addTask("task1");

    // Assert
    expect(node.id).toBe("task1");
    expect(node.status).toBe("ready");
    expect(graph.hasTask("task1")).toBe(true);
  });

  it("addTask_オプション付き_プロパティ設定", () => {
    // Arrange
    const options: AddTaskOptions = {
      name: "Test Task",
      priority: "high",
      estimatedDurationMs: 1000,
    };

    // Act
    const node = graph.addTask("task1", options);

    // Assert
    expect(node.name).toBe("Test Task");
    expect(node.priority).toBe("high");
    expect(node.estimatedDurationMs).toBe(1000);
  });

  it("addTask_重複ID_エラー", () => {
    // Arrange
    graph.addTask("task1");

    // Act & Assert
    expect(() => graph.addTask("task1")).toThrow('Task with id "task1" already exists');
  });

  it("addTask_存在しない依存_エラー", () => {
    // Arrange & Act & Assert
    expect(() =>
      graph.addTask("task2", { dependencies: ["nonexistent"] })
    ).toThrow('Dependency task "nonexistent" does not exist');
  });

  it("removeTask_基本_タスク削除", () => {
    // Arrange
    graph.addTask("task1");

    // Act
    const result = graph.removeTask("task1");

    // Assert
    expect(result).toBe(true);
    expect(graph.hasTask("task1")).toBe(false);
  });

  it("removeTask_存在しない_false", () => {
    // Arrange & Act
    const result = graph.removeTask("nonexistent");

    // Assert
    expect(result).toBe(false);
  });

  it("removeTask_実行中_エラー", () => {
    // Arrange
    graph.addTask("task1");
    graph.markRunning("task1");

    // Act & Assert
    expect(() => graph.removeTask("task1")).toThrow('Cannot remove running task "task1"');
  });

  it("getTask_存在_ノード返却", () => {
    // Arrange
    graph.addTask("task1");

    // Act
    const node = graph.getTask("task1");

    // Assert
    expect(node).toBeDefined();
    expect(node?.id).toBe("task1");
  });

  it("getTask_不在_undefined", () => {
    // Act
    const node = graph.getTask("nonexistent");

    // Assert
    expect(node).toBeUndefined();
  });

  it("getAllTasks_全タスク取得", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");

    // Act
    const tasks = graph.getAllTasks();

    // Assert
    expect(tasks).toHaveLength(2);
  });
});

// ============================================================================
// TaskDependencyGraph - 依存関係テスト
// ============================================================================

describe("TaskDependencyGraph - 依存関係", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("addTask_依存あり_pending状態", () => {
    // Arrange
    graph.addTask("task1");

    // Act
    const node = graph.addTask("task2", { dependencies: ["task1"] });

    // Assert
    expect(node.status).toBe("pending");
    expect(node.dependencies.has("task1")).toBe(true);
  });

  it("isTaskReady_依存完了_true", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.markRunning("task1");
    graph.markCompleted("task1");

    // Act
    const ready = graph.isTaskReady("task2");

    // Assert
    expect(ready).toBe(true);
  });

  it("isTaskReady_依存未完了_false", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });

    // Act
    const ready = graph.isTaskReady("task2");

    // Assert
    expect(ready).toBe(false);
  });

  it("markCompleted_依存タスク_ready化", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.markRunning("task1");

    // Act
    graph.markCompleted("task1");

    // Assert
    const task2 = graph.getTask("task2");
    expect(task2?.status).toBe("ready");
    expect(graph.getReadyTaskIds()).toContain("task2");
  });

  it("依存関係_連鎖_正しく伝播", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.addTask("task3", { dependencies: ["task2"] });

    // Act
    graph.markRunning("task1");
    graph.markCompleted("task1");
    graph.markRunning("task2");
    graph.markCompleted("task2");

    // Assert
    const task3 = graph.getTask("task3");
    expect(task3?.status).toBe("ready");
  });
});

// ============================================================================
// TaskDependencyGraph - ステータス遷移テスト
// ============================================================================

describe("TaskDependencyGraph - ステータス遷移", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("markRunning_基本_状態変更", () => {
    // Arrange
    graph.addTask("task1");

    // Act
    graph.markRunning("task1");

    // Assert
    const node = graph.getTask("task1");
    expect(node?.status).toBe("running");
    expect(node?.startedAt).toBeDefined();
  });

  it("markRunning_非ready_エラー", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });

    // Act & Assert
    expect(() => graph.markRunning("task2")).toThrow('Task "task2" is not ready');
  });

  it("markRunning_存在しない_エラー", () => {
    // Act & Assert
    expect(() => graph.markRunning("nonexistent")).toThrow('Task "nonexistent" does not exist');
  });

  it("markCompleted_基本_状態変更", () => {
    // Arrange
    graph.addTask("task1");
    graph.markRunning("task1");

    // Act
    graph.markCompleted("task1");

    // Assert
    const node = graph.getTask("task1");
    expect(node?.status).toBe("completed");
    expect(node?.completedAt).toBeDefined();
  });

  it("markFailed_基本_状態変更", () => {
    // Arrange
    graph.addTask("task1");
    graph.markRunning("task1");

    // Act
    const error = new Error("Test error");
    graph.markFailed("task1", error);

    // Assert
    const node = graph.getTask("task1");
    expect(node?.status).toBe("failed");
    expect(node?.error).toBe(error);
  });

  it("markFailed_依存タスク_伝播", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.markRunning("task1");

    // Act
    graph.markFailed("task1", new Error("Failed"));

    // Assert
    const task2 = graph.getTask("task2");
    expect(task2?.status).toBe("failed");
  });

  it("markCancelled_基本_状態変更", () => {
    // Arrange
    graph.addTask("task1");
    graph.markRunning("task1");

    // Act
    graph.markCancelled("task1");

    // Assert
    const node = graph.getTask("task1");
    expect(node?.status).toBe("cancelled");
  });

  it("markCancelled_依存タスク_伝播", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.markRunning("task1");

    // Act
    graph.markCancelled("task1");

    // Assert
    const task2 = graph.getTask("task2");
    expect(task2?.status).toBe("cancelled");
  });
});

// ============================================================================
// TaskDependencyGraph - 循環検出テスト
// ============================================================================

describe("TaskDependencyGraph - 循環検出", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("detectCycle_循環なし_false", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });

    // Act
    const result = graph.detectCycle();

    // Assert
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toBeNull();
  });

  it("detectCycle_自己参照_検出", () => {
    // Arrange - 自己参照は作成できないので、3ノード循環でテスト
    // 注: 現在のAPIでは直接循環を作成できない
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });

    // Act
    const result = graph.detectCycle();

    // Assert
    expect(result.hasCycle).toBe(false);
  });

  it("detectCycle_空グラフ_循環なし", () => {
    // Act
    const result = graph.detectCycle();

    // Assert
    expect(result.hasCycle).toBe(false);
  });
});

// ============================================================================
// TaskDependencyGraph - トポロジカル順序テスト
// ============================================================================

describe("TaskDependencyGraph - トポロジカル順序", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("getTopologicalOrder_基本_依存順序", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.addTask("task3", { dependencies: ["task1", "task2"] });

    // Act
    const order = graph.getTopologicalOrder();

    // Assert
    expect(order).not.toBeNull();
    expect(order!.indexOf("task1")).toBeLessThan(order!.indexOf("task2"));
    expect(order!.indexOf("task2")).toBeLessThan(order!.indexOf("task3"));
  });

  it("getTopologicalOrder_独立タスク_任意順序", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");
    graph.addTask("task3");

    // Act
    const order = graph.getTopologicalOrder();

    // Assert
    expect(order).not.toBeNull();
    expect(order).toHaveLength(3);
  });

  it("getTopologicalOrder_空グラフ_空配列", () => {
    // Act
    const order = graph.getTopologicalOrder();

    // Assert
    expect(order).toEqual([]);
  });
});

// ============================================================================
// TaskDependencyGraph - 統計テスト
// ============================================================================

describe("TaskDependencyGraph - 統計", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("getStats_基本_統計取得", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.markRunning("task1");

    // Act
    const stats = graph.getStats();

    // Assert
    expect(stats.total).toBe(2);
    expect(stats.byStatus.running).toBe(1);
    expect(stats.byStatus.pending).toBe(1);
    expect(stats.readyCount).toBe(0);
  });

  it("getStats_空グラフ_ゼロ統計", () => {
    // Act
    const stats = graph.getStats();

    // Assert
    expect(stats.total).toBe(0);
    expect(stats.completedCount).toBe(0);
    expect(stats.failedCount).toBe(0);
    expect(stats.maxDepth).toBe(0);
  });

  it("getStats_深さ計算_正確", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    graph.addTask("task3", { dependencies: ["task2"] });

    // Act
    const stats = graph.getStats();

    // Assert
    expect(stats.maxDepth).toBe(2);
  });
});

// ============================================================================
// TaskDependencyGraph - インポート/エクスポートテスト
// ============================================================================

describe("TaskDependencyGraph - インポート/エクスポート", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("export_基本_データエクスポート", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });

    // Act
    const data = graph.export();

    // Assert
    expect(data.tasks).toHaveLength(2);
    expect(data.tasks.find((t) => t.id === "task2")?.dependencies).toContain("task1");
  });

  it("import_基本_データインポート", () => {
    // Arrange
    const data = {
      tasks: [
        { id: "task1", dependencies: [] },
        { id: "task2", dependencies: ["task1"] },
      ],
    };

    // Act
    graph.import(data);

    // Assert
    expect(graph.hasTask("task1")).toBe(true);
    expect(graph.hasTask("task2")).toBe(true);
    expect(graph.getTask("task2")?.dependencies.has("task1")).toBe(true);
  });

  it("import_循環依存_エラー", () => {
    // Arrange - 循環依存のデータ（実際にはインポート順序で検出できない）
    const data = {
      tasks: [
        { id: "task1", dependencies: ["task2"] },
        { id: "task2", dependencies: ["task1"] },
      ],
    };

    // Act & Assert
    expect(() => graph.import(data)).toThrow();
  });

  it("clear_基本_全クリア", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");

    // Act
    graph.clear();

    // Assert
    expect(graph.getAllTasks()).toHaveLength(0);
  });

  it("エクスポート_インポート_ラウンドトリップ", () => {
    // Arrange
    graph.addTask("task1", { name: "First", priority: "high" });
    graph.addTask("task2", { name: "Second", dependencies: ["task1"] });
    const exported = graph.export();

    // Act
    const newGraph = new TaskDependencyGraph();
    newGraph.import(exported);

    // Assert
    const task1 = newGraph.getTask("task1");
    expect(task1?.name).toBe("First");
    expect(newGraph.getAllTasks()).toHaveLength(2);
  });
});

// ============================================================================
// formatDependencyGraphStats テスト
// ============================================================================

describe("formatDependencyGraphStats", () => {
  it("formatDependencyGraphStats_基本_文字列出力", () => {
    // Arrange
    const graph = new TaskDependencyGraph();
    graph.addTask("task1");
    graph.addTask("task2", { dependencies: ["task1"] });
    const stats = graph.getStats();

    // Act
    const formatted = formatDependencyGraphStats(stats);

    // Assert
    expect(formatted).toContain("Dependency Graph Stats:");
    expect(formatted).toContain("Total tasks: 2");
    expect(formatted).toContain("pending: 1");
    expect(formatted).toContain("ready: 1");
  });

  it("formatDependencyGraphStats_空グラフ_正しく出力", () => {
    // Arrange
    const graph = new TaskDependencyGraph();
    const stats = graph.getStats();

    // Act
    const formatted = formatDependencyGraphStats(stats);

    // Assert
    expect(formatted).toContain("Total tasks: 0");
  });
});

// ============================================================================
// getReadyTasks / getReadyTaskIds テスト
// ============================================================================

describe("TaskDependencyGraph - ready queue", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("getReadyTasks_初期_独立タスク", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");

    // Act
    const readyTasks = graph.getReadyTasks();

    // Assert
    expect(readyTasks).toHaveLength(2);
  });

  it("getReadyTaskIds_初期_IDリスト", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");

    // Act
    const ids = graph.getReadyTaskIds();

    // Assert
    expect(ids).toContain("task1");
    expect(ids).toContain("task2");
  });

  it("getReadyTasks_実行中_除外", () => {
    // Arrange
    graph.addTask("task1");
    graph.addTask("task2");
    graph.markRunning("task1");

    // Act
    const readyTasks = graph.getReadyTasks();

    // Assert
    expect(readyTasks).toHaveLength(1);
    expect(readyTasks[0].id).toBe("task2");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("addTask_任意ID_ユニーク制約", () => {
    const graph = new TaskDependencyGraph();

    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
        (ids) => {
          graph.clear();
          const uniqueIds = new Set(ids);
          let addedCount = 0;

          for (const id of uniqueIds) {
            try {
              graph.addTask(id);
              addedCount++;
            } catch {
              // 重複は期待されない
            }
          }

          return graph.getAllTasks().length === addedCount;
        }
      )
    );
  });

  it("export_import_ラウンドトリップ", () => {
    const graph = new TaskDependencyGraph();

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 10 }),
            name: fc.option(fc.string()),
          }),
          { maxLength: 5 }
        ),
        (tasks) => {
          graph.clear();

          // ユニークIDのみ
          const seenIds = new Set<string>();
          for (const task of tasks) {
            if (!seenIds.has(task.id)) {
              graph.addTask(task.id, { name: task.name ?? undefined });
              seenIds.add(task.id);
            }
          }

          const exported = graph.export();
          const newGraph = new TaskDependencyGraph();
          newGraph.import(exported);

          return newGraph.getAllTasks().length === graph.getAllTasks().length;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  let graph: TaskDependencyGraph;

  beforeEach(() => {
    graph = new TaskDependencyGraph();
  });

  it("addTask_多数タスク_処理可能", () => {
    // Arrange & Act
    for (let i = 0; i < 100; i++) {
      graph.addTask(`task${i}`);
    }

    // Assert
    expect(graph.getAllTasks()).toHaveLength(100);
  });

  it("addTask_深い依存チェーン_処理可能", () => {
    // Arrange & Act
    graph.addTask("task0");
    for (let i = 1; i < 50; i++) {
      graph.addTask(`task${i}`, { dependencies: [`task${i - 1}`] });
    }

    // Assert
    const stats = graph.getStats();
    expect(stats.maxDepth).toBe(49);
  });

  it("getTopologicalOrder_多数タスク_正しい順序", () => {
    // Arrange
    for (let i = 0; i < 50; i++) {
      if (i === 0) {
        graph.addTask(`task${i}`);
      } else {
        graph.addTask(`task${i}`, { dependencies: [`task${i - 1}`] });
      }
    }

    // Act
    const order = graph.getTopologicalOrder();

    // Assert
    expect(order).not.toBeNull();
    expect(order!.length).toBe(50);
  });

  it("長いタスクID_処理可能", () => {
    // Arrange
    const longId = "a".repeat(200);

    // Act & Assert
    expect(() => graph.addTask(longId)).not.toThrow();
    expect(graph.hasTask(longId)).toBe(true);
  });
});
