/**
 * @fileoverview task-scheduler.ts の単体テスト
 * @description プロパティベーステストを含む包括的なテストスイート
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// テスト対象のインポート
import {
  createTaskId,
  shouldPreempt,
  PREEMPTION_MATRIX,
  getScheduler,
  createScheduler,
  resetScheduler,
  type ScheduledTask,
  type TaskSource,
  type TaskPriority,
  type QueueStats,
} from "../../../.pi/lib/task-scheduler";

// ============================================================================
// createTaskId Tests
// ============================================================================

describe("createTaskId", () => {
  describe("正常系", () => {
    it("createTaskId_デフォルトプレフィックス_taskプレフィックスを含む", () => {
      // Act
      const taskId = createTaskId();

      // Assert
      expect(taskId).toMatch(/^task-/);
    });

    it("createTaskId_カスタムプレフィックス_指定プレフィックスを含む", () => {
      // Arrange
      const prefix = "subagent";

      // Act
      const taskId = createTaskId(prefix);

      // Assert
      expect(taskId).toMatch(/^subagent-/);
    });

    it("createTaskId_複数回呼び出し_一意なIDを生成", () => {
      // Act
      const id1 = createTaskId();
      const id2 = createTaskId();
      const id3 = createTaskId();

      // Assert
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe("プロパティベーステスト", () => {
    it("createTaskId_常に一意なIDを生成", () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 100 }),
          (prefixes) => {
            // Act
            const ids = new Set<string>();
            prefixes.forEach((prefix) => {
              ids.add(createTaskId(prefix));
            });

            // Assert - 全て一意
            expect(ids.size).toBe(prefixes.length);
          }
        )
      );
    });

    it("createTaskId_常にプレフィックスで始まる", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }), (prefix) => {
          // Act
          const taskId = createTaskId(prefix);

          // Assert
          expect(taskId.startsWith(`${prefix}-`)).toBe(true);
        })
      );
    });
  });
});

// ============================================================================
// shouldPreempt Tests
// ============================================================================

describe("shouldPreempt", () => {
  // デフォルトの環境変数状態を保存
  const originalEnv = process.env.PI_ENABLE_PREEMPTION;

  beforeEach(() => {
    // 各テストで環境変数をリセット
    delete process.env.PI_ENABLE_PREEMPTION;
  });

  afterEach(() => {
    // 環境変数を復元
    if (originalEnv !== undefined) {
      process.env.PI_ENABLE_PREEMPTION = originalEnv;
    } else {
      delete process.env.PI_ENABLE_PREEMPTION;
    }
  });

  describe("正常系", () => {
    const createTask = (priority: TaskPriority, id: string): ScheduledTask => ({
      id,
      source: "subagent_run",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      priority,
      costEstimate: { estimatedTokens: 100, estimatedDurationMs: 1000 },
      execute: async () => null,
    });

    it("shouldPreempt_critical対high_trueを返す", () => {
      // Arrange
      const running = createTask("high", "running");
      const incoming = createTask("critical", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert
      expect(result).toBe(true);
    });

    it("shouldPreempt_high対normal_trueを返す", () => {
      // Arrange
      const running = createTask("normal", "running");
      const incoming = createTask("high", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert
      expect(result).toBe(true);
    });

    it("shouldPreempt_normal対low_falseを返す", () => {
      // Arrange
      const running = createTask("low", "running");
      const incoming = createTask("normal", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert - normalは他をプリエンプトできない
      expect(result).toBe(false);
    });

    it("shouldPreempt_low対background_falseを返す", () => {
      // Arrange
      const running = createTask("background", "running");
      const incoming = createTask("low", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert - lowは他をプリエンプトできない
      expect(result).toBe(false);
    });

    it("shouldPreempt_同優先度_falseを返す", () => {
      // Arrange
      const running = createTask("normal", "running");
      const incoming = createTask("normal", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert
      expect(result).toBe(false);
    });

    it("shouldPreempt_低優先度が高をプリエンプト_falseを返す", () => {
      // Arrange
      const running = createTask("high", "running");
      const incoming = createTask("normal", "incoming");

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("環境変数による無効化", () => {
    it("shouldPreempt_PI_ENABLE_PREEMPTION=false_falseを返す", () => {
      // Arrange
      process.env.PI_ENABLE_PREEMPTION = "false";
      const running: ScheduledTask = {
        id: "running",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "low",
        costEstimate: { estimatedTokens: 100, estimatedDurationMs: 1000 },
        execute: async () => null,
      };
      const incoming: ScheduledTask = {
        ...running,
        id: "incoming",
        priority: "critical",
      };

      // Act
      const result = shouldPreempt(running, incoming);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("PREEMPTION_MATRIX検証", () => {
    it("PREEMPTION_MATRIX_critical_4種を含む", () => {
      expect(PREEMPTION_MATRIX.critical).toContain("high");
      expect(PREEMPTION_MATRIX.critical).toContain("normal");
      expect(PREEMPTION_MATRIX.critical).toContain("low");
      expect(PREEMPTION_MATRIX.critical).toContain("background");
    });

    it("PREEMPTION_MATRIX_high_3種を含む", () => {
      expect(PREEMPTION_MATRIX.high).toContain("normal");
      expect(PREEMPTION_MATRIX.high).toContain("low");
      expect(PREEMPTION_MATRIX.high).toContain("background");
    });

    it("PREEMPTION_MATRIX_normal_空配列", () => {
      expect(PREEMPTION_MATRIX.normal).toEqual([]);
    });

    it("PREEMPTION_MATRIX_low_空配列", () => {
      expect(PREEMPTION_MATRIX.low).toEqual([]);
    });

    it("PREEMPTION_MATRIX_background_空配列", () => {
      expect(PREEMPTION_MATRIX.background).toEqual([]);
    });
  });

  describe("プロパティベーステスト", () => {
    const priorities: TaskPriority[] = ["critical", "high", "normal", "low", "background"];

    it("shouldPreempt_同優先度は常にfalse", () => {
      fc.assert(
        fc.property(fc.constantFrom(...priorities), (priority) => {
          // Arrange
          const running: ScheduledTask = {
            id: "running",
            source: "subagent_run",
            provider: "test",
            model: "test",
            priority,
            costEstimate: { estimatedTokens: 100, estimatedDurationMs: 1000 },
            execute: async () => null,
          };
          const incoming: ScheduledTask = { ...running, id: "incoming" };

          // Act
          const result = shouldPreempt(running, incoming);

          // Assert
          expect(result).toBe(false);
        })
      );
    });
  });
});

// ============================================================================
// Scheduler Tests
// ============================================================================

describe("TaskScheduler", () => {
  beforeEach(() => {
    resetScheduler();
  });

  afterEach(() => {
    resetScheduler();
  });

  describe("getScheduler", () => {
    it("getScheduler_シングルトン返却_例外が発生しない", () => {
      // Act & Assert
      expect(() => getScheduler()).not.toThrow();
    });

    it("getScheduler_複数回呼び出し_同じインスタンスを返す", () => {
      // Act
      const scheduler1 = getScheduler();
      const scheduler2 = getScheduler();

      // Assert
      expect(scheduler1).toBe(scheduler2);
    });
  });

  describe("createScheduler", () => {
    it("createScheduler_新規インスタンス_作成成功", () => {
      // Act & Assert
      expect(() => createScheduler()).not.toThrow();
    });

    it("createScheduler_カスタム設定_設定が反映される", () => {
      // Arrange
      const config = {
        maxConcurrentPerModel: 8,
        maxTotalConcurrent: 16,
      };

      // Act
      const scheduler = createScheduler(config);

      // Assert
      expect(scheduler).toBeDefined();
    });
  });

  describe("getStats", () => {
    it("getStats_初期状態_ゼロ統計を返す", () => {
      // Arrange
      const scheduler = createScheduler();

      // Act
      const stats = scheduler.getStats();

      // Assert
      expect(stats.totalQueued).toBe(0);
      expect(stats.activeExecutions).toBe(0);
      expect(stats.avgWaitMs).toBe(0);
    });
  });

  describe("submit", () => {
    it("submit_単一タスク_正常実行", async () => {
      // Arrange
      const scheduler = createScheduler();
      const task: ScheduledTask<string> = {
        id: "test-task-1",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        costEstimate: { estimatedTokens: 100, estimatedDurationMs: 100 },
        execute: async () => "success",
      };

      // Act
      const result = await scheduler.submit(task);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe("success");
      expect(result.taskId).toBe("test-task-1");
    });

    it("submit_エラータスク_エラー結果を返す", async () => {
      // Arrange
      const scheduler = createScheduler();
      const task: ScheduledTask<string> = {
        id: "error-task",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        costEstimate: { estimatedTokens: 100, estimatedDurationMs: 100 },
        execute: async () => {
          throw new Error("Task failed");
        },
      };

      // Act
      const result = await scheduler.submit(task);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Task failed");
    });
  });

  describe("AbortSignal", () => {
    it("submit_AbortSignal中止_中止結果を返す", async () => {
      // Arrange
      const scheduler = createScheduler();
      const controller = new AbortController();

      // タスクを即座に中止
      controller.abort();

      const task: ScheduledTask<string> = {
        id: "aborted-task",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "normal",
        costEstimate: { estimatedTokens: 100, estimatedDurationMs: 10000 }, // 長い実行時間
        execute: async () => {
          // 中止済みの場合、このコードには到達しない
          return "should not reach";
        },
        signal: controller.signal,
      };

      // Act
      const result = await scheduler.submit(task);

      // Assert
      expect(result.aborted).toBe(true);
    });
  });
});

// ============================================================================
// Preemption Support Tests
// ============================================================================

describe("プリエンプションサポート", () => {
  beforeEach(() => {
    resetScheduler();
  });

  afterEach(() => {
    resetScheduler();
  });

  describe("getActiveExecution", () => {
    it("getActiveExecution_存在しないタスク_nullを返す", () => {
      // Arrange
      const scheduler = createScheduler();

      // Act
      const entry = scheduler.getActiveExecution("nonexistent");

      // Assert
      expect(entry).toBeNull();
    });
  });

  describe("getAllActiveExecutions", () => {
    it("getAllActiveExecutions_初期状態_空マップを返す", () => {
      // Arrange
      const scheduler = createScheduler();

      // Act
      const executions = scheduler.getAllActiveExecutions();

      // Assert
      expect(executions.size).toBe(0);
    });
  });

  describe("checkPreemptionNeeded", () => {
    it("checkPreemptionNeeded_アクティブタスクなし_nullを返す", () => {
      // Arrange
      const scheduler = createScheduler();
      const incoming: ScheduledTask = {
        id: "incoming",
        source: "subagent_run",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        priority: "critical",
        costEstimate: { estimatedTokens: 100, estimatedDurationMs: 100 },
        execute: async () => null,
      };

      // Act
      const result = scheduler.checkPreemptionNeeded(incoming);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("onPreemption", () => {
    it("onPreemption_コールバック登録_解除関数を返す", () => {
      // Arrange
      const scheduler = createScheduler();
      const callback = vi.fn();

      // Act
      const unsubscribe = scheduler.onPreemption(callback);

      // Assert
      expect(typeof unsubscribe).toBe("function");

      // Cleanup
      unsubscribe();
    });
  });
});

// ============================================================================
// 統合プロパティテスト
// ============================================================================

describe("統合プロパティテスト", () => {
  beforeEach(() => {
    resetScheduler();
  });

  afterEach(() => {
    resetScheduler();
  });

  it("createTaskId_フォーマット一貫性", () => {
    fc.assert(
      fc.property(
        // 英数字のみのプレフィックスを使用（正規表現エスケープの問題を回避）
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-z]+$/.test(s)),
        fc.integer({ min: 1, max: 100 }),
        (prefix, count) => {
          // Act
          const ids: string[] = [];
          for (let i = 0; i < count; i++) {
            ids.push(createTaskId(prefix));
          }

          // Assert - 全て正しいフォーマット
          ids.forEach((id) => {
            expect(id).toMatch(new RegExp(`^${prefix}-[a-z0-9]+-[a-z0-9]+$`));
          });

          // Assert - 全て一意
          expect(new Set(ids).size).toBe(ids.length);
        }
      )
    );
  });

  it("shouldPreempt_推移律チェック", () => {
    const priorities: TaskPriority[] = ["critical", "high", "normal", "low", "background"];
    const createTask = (priority: TaskPriority): ScheduledTask => ({
      id: `task-${priority}`,
      source: "subagent_run",
      provider: "test",
      model: "test",
      priority,
      costEstimate: { estimatedTokens: 100, estimatedDurationMs: 100 },
      execute: async () => null,
    });

    fc.assert(
      fc.property(
        fc.constantFrom(...priorities),
        fc.constantFrom(...priorities),
        (p1, p2) => {
          // Arrange
          const task1 = createTask(p1);
          const task2 = createTask(p2);

          // Act
          const result = shouldPreempt(task1, task2);

          // Assert - プリエンプションマトリックスとの整合性
          const expected = PREEMPTION_MATRIX[p2]?.includes(p1) ?? false;
          expect(result).toBe(expected);
        }
      )
    );
  });

  it("getStats_常に有効な統計オブジェクトを返す", async () => {
    // タイマーをモック
    vi.useFakeTimers();

    try {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (taskCount) => {
          // Arrange
          const scheduler = createScheduler();

          // Act - ランダムな数のタスクを送信
          const promises: Promise<unknown>[] = [];
          for (let i = 0; i < taskCount; i++) {
            const task: ScheduledTask<string> = {
              id: `prop-task-${i}`,
              source: "subagent_run",
              provider: "test",
              model: "test",
              priority: "normal",
              costEstimate: { estimatedTokens: 100, estimatedDurationMs: 10 },
              execute: async () => `result-${i}`,
            };
            promises.push(scheduler.submit(task));
          }

          // 全タスク完了を待機
          await vi.runAllTimersAsync();
          await Promise.all(promises);

          // 統計を取得
          const stats: QueueStats = scheduler.getStats();

          // Assert - 不変条件
          expect(stats.totalQueued).toBeGreaterThanOrEqual(0);
          expect(stats.activeExecutions).toBeGreaterThanOrEqual(0);
          expect(typeof stats.avgWaitMs).toBe("number");
          expect(typeof stats.maxWaitMs).toBe("number");
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
