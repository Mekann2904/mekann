/**
 * dag-weight-updater.ts 単体テスト
 * カバレッジ分析: TaskGraphUpdater, GraphDelta, updateGraph, createDelta
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import {
  TaskGraphUpdater,
  createDelta,
  EMPTY_DELTA,
  type GraphDelta,
} from "../../../.pi/lib/dag-weight-updater.js";
import type { TaskNode } from "../../../.pi/lib/dag-types.js";
import {
  calculateEdgeWeight,
  DEFAULT_WEIGHT_CONFIG,
} from "../../../.pi/lib/dag-weight-calculator.js";

// Mock dependencies
vi.mock("../../../.pi/lib/dag-weight-calculator.js", () => ({
  calculateEdgeWeight: vi.fn((_source, _target, _config) => 1.0),
  DEFAULT_WEIGHT_CONFIG: { alpha: 0.6, beta: 0.4 },
}));

// ============================================================================
// ヘルパー関数
// ============================================================================

function createTaskNode(
  id: string,
  dependencies: string[] = [],
  options: Partial<TaskNode> = {}
): TaskNode {
  return {
    id,
    dependencies,
    estimatedDurationMs: options.estimatedDurationMs ?? 60000,
    priority: options.priority ?? "normal",
    inputContext: options.inputContext ?? [],
    outputContext: options.outputContext ?? [],
    ...options,
  };
}

// ============================================================================
// GraphDelta テスト
// ============================================================================

describe("GraphDelta", () => {
  describe("EMPTY_DELTA", () => {
    it("EMPTY_DELTA_全フィールド空配列", () => {
      // Assert
      expect(EMPTY_DELTA.addedTasks).toEqual([]);
      expect(EMPTY_DELTA.completedTaskIds).toEqual([]);
      expect(EMPTY_DELTA.failedTaskIds).toEqual([]);
      expect(EMPTY_DELTA.updatedTasks).toEqual([]);
    });
  });

  describe("createDelta", () => {
    it("createDelta_引数なし_EMPTY_DELTAと同一", () => {
      // Act
      const result = createDelta({});

      // Assert
      expect(result).toEqual(EMPTY_DELTA);
    });

    it("createDelta_addedTasks_設定", () => {
      // Arrange
      const task = createTaskNode("task-1");

      // Act
      const result = createDelta({ addedTasks: [task] });

      // Assert
      expect(result.addedTasks).toEqual([task]);
      expect(result.completedTaskIds).toEqual([]);
    });

    it("createDelta_completedTaskIds_設定", () => {
      // Act
      const result = createDelta({ completedTaskIds: ["task-1"] });

      // Assert
      expect(result.completedTaskIds).toEqual(["task-1"]);
    });

    it("createDelta_failedTaskIds_設定", () => {
      // Act
      const result = createDelta({ failedTaskIds: ["task-1"] });

      // Assert
      expect(result.failedTaskIds).toEqual(["task-1"]);
    });

    it("createDelta_updatedTasks_設定", () => {
      // Arrange
      const task = createTaskNode("task-1");

      // Act
      const result = createDelta({ updatedTasks: [task] });

      // Assert
      expect(result.updatedTasks).toEqual([task]);
    });

    it("createDelta_全フィールド_設定", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2");

      // Act
      const result = createDelta({
        addedTasks: [task1],
        completedTaskIds: ["task-a"],
        failedTaskIds: ["task-b"],
        updatedTasks: [task2],
      });

      // Assert
      expect(result.addedTasks).toEqual([task1]);
      expect(result.completedTaskIds).toEqual(["task-a"]);
      expect(result.failedTaskIds).toEqual(["task-b"]);
      expect(result.updatedTasks).toEqual([task2]);
    });
  });
});

// ============================================================================
// TaskGraphUpdater テスト
// ============================================================================

describe("TaskGraphUpdater", () => {
  let updater: TaskGraphUpdater;

  beforeEach(() => {
    vi.clearAllMocks();
    updater = new TaskGraphUpdater();
  });

  // ==========================================================================
  // コンストラクタ
  // ==========================================================================

  describe("constructor", () => {
    it("constructor_デフォルト設定_初期化", () => {
      // Assert
      expect(updater).toBeDefined();
      expect(updater.getStats().totalTasks).toBe(0);
    });

    it("constructor_カスタム設定_初期化", () => {
      // Arrange & Act
      const customUpdater = new TaskGraphUpdater({
        alpha: 0.8,
        beta: 0.2,
      });

      // Assert
      expect(customUpdater).toBeDefined();
    });
  });

  // ==========================================================================
  // updateGraph テスト
  // ==========================================================================

  describe("updateGraph", () => {
    it("updateGraph_空のDelta_変更なし", () => {
      // Act
      updater.updateGraph(EMPTY_DELTA);

      // Assert
      expect(updater.getStats().totalTasks).toBe(0);
    });

    it("updateGraph_タスク追加_反映", () => {
      // Arrange
      const task = createTaskNode("task-1");
      const delta = createDelta({ addedTasks: [task] });

      // Act
      updater.updateGraph(delta);

      // Assert
      expect(updater.getStats().totalTasks).toBe(1);
      expect(updater.getTask("task-1")).toBeDefined();
    });

    it("updateGraph_複数タスク追加_反映", () => {
      // Arrange
      const tasks = [
        createTaskNode("task-1"),
        createTaskNode("task-2"),
        createTaskNode("task-3"),
      ];
      const delta = createDelta({ addedTasks: tasks });

      // Act
      updater.updateGraph(delta);

      // Assert
      expect(updater.getStats().totalTasks).toBe(3);
    });

    it("updateGraph_完了タスク_重み0に更新", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));

      // Act
      updater.updateGraph(createDelta({ completedTaskIds: ["task-1"] }));

      // Assert
      expect(updater.getTaskStatus("task-1")).toBe("completed");
      expect(updater.getTaskTotalWeight("task-2")).toBe(0);
    });

    it("updateGraph_失敗タスク_重み増加", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));
      const initialWeight = updater.getTaskTotalWeight("task-2");

      // Act
      updater.updateGraph(createDelta({ failedTaskIds: ["task-2"] }));

      // Assert
      expect(updater.getTaskStatus("task-2")).toBe("failed");
      // 失敗時は重みが1.5倍になる
      expect(updater.getTaskTotalWeight("task-2")).toBe(initialWeight * 1.5);
    });

    it("updateGraph_更新タスク_重み再計算", () => {
      // Arrange
      const task = createTaskNode("task-1");
      updater.updateGraph(createDelta({ addedTasks: [task] }));

      // Act
      const updatedTask = createTaskNode("task-1", [], {
        estimatedDurationMs: 120000,
      });
      updater.updateGraph(createDelta({ updatedTasks: [updatedTask] }));

      // Assert
      const retrieved = updater.getTask("task-1");
      expect(retrieved?.estimatedDurationMs).toBe(120000);
    });
  });

  // ==========================================================================
  // 重み計算ロジック
  // ==========================================================================

  describe("重み計算", () => {
    it("getEdgeWeights_初期状態_空", () => {
      // Act
      const weights = updater.getEdgeWeights();

      // Assert
      expect(weights.size).toBe(0);
    });

    it("getEdgeWeights_タスク追加後_エッジ重み設定", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));

      // Act
      const weights = updater.getEdgeWeights();

      // Assert
      expect(weights.has("task-1:task-2")).toBe(true);
    });

    it("getTaskTotalWeight_依存なし_0", () => {
      // Arrange
      const task = createTaskNode("task-1");
      updater.updateGraph(createDelta({ addedTasks: [task] }));

      // Act
      const weight = updater.getTaskTotalWeight("task-1");

      // Assert
      expect(weight).toBe(0);
    });

    it("getTaskTotalWeight_依存あり_合算", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      const task3 = createTaskNode("task-3", ["task-2"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2, task3] }));

      // Act
      const weight = updater.getTaskTotalWeight("task-2");

      // Assert
      expect(weight).toBeGreaterThan(0);
    });

    it("getAllTaskWeights_全タスク重み取得", () => {
      // Arrange
      const tasks = [
        createTaskNode("task-1"),
        createTaskNode("task-2", ["task-1"]),
        createTaskNode("task-3", ["task-1"]),
      ];
      updater.updateGraph(createDelta({ addedTasks: tasks }));

      // Act
      const weights = updater.getAllTaskWeights();

      // Assert
      expect(weights.size).toBe(3);
      expect(weights.has("task-1")).toBe(true);
      expect(weights.has("task-2")).toBe(true);
      expect(weights.has("task-3")).toBe(true);
    });
  });

  // ==========================================================================
  // 優先度更新
  // ==========================================================================

  describe("優先度更新", () => {
    it("getReadyTasks_初期状態_空", () => {
      // Act
      const ready = updater.getReadyTasks();

      // Assert
      expect(ready).toEqual([]);
    });

    it("getReadyTasks_依存なしタスク_実行可能", () => {
      // Arrange
      const task = createTaskNode("task-1");
      updater.updateGraph(createDelta({ addedTasks: [task] }));

      // Act
      const ready = updater.getReadyTasks();

      // Assert
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe("task-1");
    });

    it("getReadyTasks_依存あり_完了まで待機", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));

      // Act
      const ready = updater.getReadyTasks();

      // Assert
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe("task-1");
    });

    it("getReadyTasks_依存完了_実行可能化", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));
      updater.updateGraph(createDelta({ completedTaskIds: ["task-1"] }));

      // Act
      const ready = updater.getReadyTasks();

      // Assert
      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe("task-2");
    });
  });

  // ==========================================================================
  // 依存関係に基づく重み調整
  // ==========================================================================

  describe("依存関係重み調整", () => {
    it("依存関係_複数タスク_重み合算", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2");
      const task3 = createTaskNode("task-3", ["task-1", "task-2"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2, task3] }));

      // Act
      const weights = updater.getEdgeWeights();

      // Assert
      expect(weights.has("task-1:task-3")).toBe(true);
      expect(weights.has("task-2:task-3")).toBe(true);
    });

    it("依存関係_チェーン_順次重み設定", () => {
      // Arrange
      const task1 = createTaskNode("task-1");
      const task2 = createTaskNode("task-2", ["task-1"]);
      const task3 = createTaskNode("task-3", ["task-2"]);
      updater.updateGraph(createDelta({ addedTasks: [task1, task2, task3] }));

      // Act
      const weights = updater.getEdgeWeights();

      // Assert
      expect(weights.has("task-1:task-2")).toBe(true);
      expect(weights.has("task-2:task-3")).toBe(true);
    });
  });

  // ==========================================================================
  // エッジケース
  // ==========================================================================

  describe("エッジケース", () => {
    it("空のDAG_正常処理", () => {
      // Act
      updater.updateGraph(EMPTY_DELTA);

      // Assert
      expect(updater.getStats().totalTasks).toBe(0);
      expect(updater.getEdgeWeights().size).toBe(0);
      expect(updater.getReadyTasks()).toEqual([]);
    });

    it("存在しないタスク完了_無視", () => {
      // Act
      updater.updateGraph(createDelta({ completedTaskIds: ["nonexistent"] }));

      // Assert
      expect(updater.getStats().totalTasks).toBe(0);
    });

    it("存在しないタスク失敗_無視", () => {
      // Act
      updater.updateGraph(createDelta({ failedTaskIds: ["nonexistent"] }));

      // Assert
      expect(updater.getStats().totalTasks).toBe(0);
    });

    it("存在しないタスク更新_無視", () => {
      // Arrange
      const task = createTaskNode("nonexistent");

      // Act
      updater.updateGraph(createDelta({ updatedTasks: [task] }));

      // Assert
      expect(updater.getTask("nonexistent")).toBeUndefined();
    });

    it("循環依存_重み計算_無限ループなし", () => {
      // Note: 循環依存の検出は現在未実装
      // このテストは無限ループが発生しないことを確認
      const task1 = createTaskNode("task-1", ["task-2"]);
      const task2 = createTaskNode("task-2", ["task-1"]);

      // Act & Assert - 例外なく完了すること
      expect(() => {
        updater.updateGraph(createDelta({ addedTasks: [task1, task2] }));
      }).not.toThrow();
    });

    it("自己依存_正常処理", () => {
      // Arrange
      const task = createTaskNode("task-1", ["task-1"]);

      // Act & Assert
      expect(() => {
        updater.updateGraph(createDelta({ addedTasks: [task] }));
      }).not.toThrow();
    });

    it("未存在依存先_スキップ", () => {
      // Arrange
      const task = createTaskNode("task-1", ["nonexistent"]);

      // Act
      updater.updateGraph(createDelta({ addedTasks: [task] }));

      // Assert - 依存先が存在しないためエッジ重みは設定されない
      expect(updater.getEdgeWeights().has("nonexistent:task-1")).toBe(false);
    });
  });

  // ==========================================================================
  // getStats テスト
  // ==========================================================================

  describe("getStats", () => {
    it("getStats_初期状態_全ゼロ", () => {
      // Act
      const stats = updater.getStats();

      // Assert
      expect(stats.totalTasks).toBe(0);
      expect(stats.pendingTasks).toBe(0);
      expect(stats.runningTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
      expect(stats.failedTasks).toBe(0);
      expect(stats.totalEdges).toBe(0);
      expect(stats.avgWeight).toBe(0);
    });

    it("getStats_タスク追加_反映", () => {
      // Arrange
      updater.updateGraph(createDelta({ addedTasks: [createTaskNode("task-1")] }));

      // Act
      const stats = updater.getStats();

      // Assert
      expect(stats.totalTasks).toBe(1);
      expect(stats.pendingTasks).toBe(1);
    });

    it("getStats_完了タスク_反映", () => {
      // Arrange
      updater.updateGraph(createDelta({ addedTasks: [createTaskNode("task-1")] }));
      updater.updateGraph(createDelta({ completedTaskIds: ["task-1"] }));

      // Act
      const stats = updater.getStats();

      // Assert
      expect(stats.completedTasks).toBe(1);
      expect(stats.pendingTasks).toBe(0);
    });

    it("getStats_失敗タスク_反映", () => {
      // Arrange
      updater.updateGraph(createDelta({ addedTasks: [createTaskNode("task-1")] }));
      updater.updateGraph(createDelta({ failedTaskIds: ["task-1"] }));

      // Act
      const stats = updater.getStats();

      // Assert
      expect(stats.failedTasks).toBe(1);
    });
  });

  // ==========================================================================
  // updateConfig テスト
  // ==========================================================================

  describe("updateConfig", () => {
    it("updateConfig_設定変更_反映", () => {
      // Act
      updater.updateConfig({ alpha: 0.8, beta: 0.2 });

      // Assert - エラーなく完了
      expect(updater).toBeDefined();
    });
  });

  // ==========================================================================
  // reset テスト
  // ==========================================================================

  describe("reset", () => {
    it("reset_全データクリア", () => {
      // Arrange
      updater.updateGraph(createDelta({ addedTasks: [createTaskNode("task-1")] }));

      // Act
      updater.reset();

      // Assert
      expect(updater.getStats().totalTasks).toBe(0);
      expect(updater.getEdgeWeights().size).toBe(0);
    });
  });

  // ==========================================================================
  // getTask/getTaskStatus テスト
  // ==========================================================================

  describe("getTask/getTaskStatus", () => {
    it("getTask_存在しない_undefined", () => {
      // Act
      const result = updater.getTask("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });

    it("getTaskStatus_存在しない_undefined", () => {
      // Act
      const result = updater.getTaskStatus("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });

    it("getTaskStatus_追加直後_pending", () => {
      // Arrange
      updater.updateGraph(createDelta({ addedTasks: [createTaskNode("task-1")] }));

      // Act
      const status = updater.getTaskStatus("task-1");

      // Assert
      expect(status).toBe("pending");
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("createDelta_任意の入力_正しい型", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            dependencies: fc.array(fc.string()),
            estimatedDurationMs: fc.integer({ min: 0 }),
            priority: fc.constantFrom("critical", "high", "normal", "low"),
          })
        ),
        fc.array(fc.string({ minLength: 1 })),
        fc.array(fc.string({ minLength: 1 })),
        (addedTasks, completedTaskIds, failedTaskIds) => {
          const delta = createDelta({ addedTasks, completedTaskIds, failedTaskIds });
          return (
            Array.isArray(delta.addedTasks) &&
            Array.isArray(delta.completedTaskIds) &&
            Array.isArray(delta.failedTaskIds)
          );
        }
      )
    );
  });

  it("updateGraph_タスク追加_数整合", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
        const updater = new TaskGraphUpdater();
        const tasks = Array.from({ length: count }, (_, i) =>
          createTaskNode(`task-${i}`)
        );
        updater.updateGraph(createDelta({ addedTasks: tasks }));
        return updater.getStats().totalTasks === count;
      })
    );
  });

  it("重み_非負値保証", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (count) => {
        const updater = new TaskGraphUpdater();
        const tasks = Array.from({ length: count }, (_, i) =>
          createTaskNode(`task-${i}`, i > 0 ? [`task-${i - 1}`] : [])
        );
        updater.updateGraph(createDelta({ addedTasks: tasks }));

        const weights = updater.getEdgeWeights();
        for (const weight of weights.values()) {
          if (weight < 0) return false;
        }
        return true;
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("大量タスク_パフォーマンス", () => {
    // Arrange
    const taskCount = 1000;
    const tasks = Array.from({ length: taskCount }, (_, i) =>
      createTaskNode(`task-${i}`, i > 0 ? [`task-${i - 1}`] : [])
    );

    // Act
    const start = performance.now();
    const updater = new TaskGraphUpdater();
    updater.updateGraph(createDelta({ addedTasks: tasks }));
    const elapsed = performance.now() - start;

    // Assert
    expect(updater.getStats().totalTasks).toBe(taskCount);
    expect(elapsed).toBeLessThan(1000); // 1秒以内
  });

  it("長いタスクID_正常処理", () => {
    // Arrange
    const longId = "a".repeat(1000);
    const task = createTaskNode(longId);

    // Act
    const updater = new TaskGraphUpdater();
    updater.updateGraph(createDelta({ addedTasks: [task] }));

    // Assert
    expect(updater.getTask(longId)).toBeDefined();
  });

  it("特殊文字タスクID_正常処理", () => {
    // Arrange
    const specialId = "task:with:colons/and/slashes-underscore";
    const task = createTaskNode(specialId);

    // Act
    const updater = new TaskGraphUpdater();
    updater.updateGraph(createDelta({ addedTasks: [task] }));

    // Assert
    expect(updater.getTask(specialId)).toBeDefined();
  });

  it("重複タスク追加_上書き", () => {
    // Arrange
    const task1 = createTaskNode("task-1", [], { estimatedDurationMs: 60000 });
    const task2 = createTaskNode("task-1", [], { estimatedDurationMs: 120000 });
    const updater = new TaskGraphUpdater();

    // Act
    updater.updateGraph(createDelta({ addedTasks: [task1] }));
    updater.updateGraph(createDelta({ addedTasks: [task2] }));

    // Assert
    const task = updater.getTask("task-1");
    expect(task?.estimatedDurationMs).toBe(120000);
  });
});
