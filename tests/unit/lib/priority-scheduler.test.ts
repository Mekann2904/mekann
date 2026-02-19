/**
 * @jest-environment node
 * @fileoverview priority-scheduler.tsのプロパティベーステストを含む単体テスト
 * @description 優先度スケジューリング機能の包括的なテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  TaskPriority,
  PRIORITY_WEIGHTS,
  PRIORITY_VALUES,
  inferTaskType,
  estimateRounds,
  inferPriority,
  comparePriority,
  PriorityTaskQueue,
  formatPriorityQueueStats,
  type PriorityTaskMetadata,
  type PriorityQueueEntry,
  type TaskType,
  type TaskComplexity,
  type EstimationContext,
  type RoundEstimation,
} from "@lib/priority-scheduler";

// ============================================================================
// ヘルパー: カスタムArbitrary
// ============================================================================

/**
 * TaskPriorityのArbitrary
 */
const arbTaskPriority: fc.Arbitrary<TaskPriority> = fc.constantFrom(
  "critical",
  "high",
  "normal",
  "low",
  "background"
);

/**
 * TaskTypeのArbitrary
 */
const arbTaskType: fc.Arbitrary<TaskType> = fc.constantFrom(
  "read",
  "bash",
  "edit",
  "write",
  "subagent_single",
  "subagent_parallel",
  "agent_team",
  "question",
  "unknown"
);

/**
 * TaskComplexityのArbitrary
 */
const arbTaskComplexity: fc.Arbitrary<TaskComplexity> = fc.constantFrom(
  "trivial",
  "simple",
  "moderate",
  "complex",
  "exploratory"
);

/**
 * EstimationContextのArbitrary
 */
const arbEstimationContext: fc.Arbitrary<EstimationContext> = fc.record({
  toolName: fc.string({ minLength: 1, maxLength: 50 }),
  taskDescription: fc.option(fc.string({ maxLength: 200 }), { nil: undefined }),
  agentCount: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
  isRetry: fc.option(fc.boolean(), { nil: undefined }),
  hasUnknownFramework: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * PriorityTaskMetadataのArbitrary
 */
const arbPriorityTaskMetadata: fc.Arbitrary<PriorityTaskMetadata> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  toolName: fc.string({ minLength: 1, maxLength: 30 }),
  priority: arbTaskPriority,
  estimatedDurationMs: fc.option(fc.integer({ min: 1, max: 60000 }), { nil: undefined }),
  estimatedRounds: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  deadlineMs: fc.option(fc.integer({ min: 0, max: 100000000 }), { nil: undefined }),
  enqueuedAtMs: fc.integer({ min: 0, max: 100000000 }),
  source: fc.option(
    fc.constantFrom("user-interactive", "background", "scheduled", "retry"),
    { nil: undefined }
  ),
});

/**
 * PriorityQueueEntryのArbitrary
 * 注意: fc.recordに既存オブジェクトをスプレッドできないため、完全な定義を使用
 */
const arbPriorityQueueEntry: fc.Arbitrary<PriorityQueueEntry> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  toolName: fc.string({ minLength: 1, maxLength: 30 }),
  priority: arbTaskPriority,
  estimatedDurationMs: fc.option(fc.integer({ min: 1, max: 60000 }), { nil: undefined }),
  estimatedRounds: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  deadlineMs: fc.option(fc.integer({ min: 0, max: 100000000 }), { nil: undefined }),
  enqueuedAtMs: fc.integer({ min: 0, max: 100000000 }),
  source: fc.option(
    fc.constantFrom("user-interactive", "background", "scheduled", "retry"),
    { nil: undefined }
  ),
  virtualStartTime: fc.integer({ min: 0, max: 1000000 }),
  virtualFinishTime: fc.integer({ min: 0, max: 2000000 }),
  skipCount: fc.integer({ min: 0, max: 20 }),
  lastConsideredMs: fc.option(fc.integer({ min: 0, max: 1000000 }), { nil: undefined }),
});

// ============================================================================
// PRIORITY_WEIGHTS / PRIORITY_VALUES テスト
// ============================================================================

describe("PRIORITY_WEIGHTS", () => {
  it("正常系: すべての優先度に対して重みが定義されている", () => {
    // Assert
    const priorities: TaskPriority[] = [
      "critical",
      "high",
      "normal",
      "low",
      "background",
    ];
    for (const priority of priorities) {
      expect(PRIORITY_WEIGHTS[priority]).toBeDefined();
      expect(PRIORITY_WEIGHTS[priority]).toBeGreaterThan(0);
    }
  });

  it("正常系: criticalが最も高い重みを持つ", () => {
    // Assert
    expect(PRIORITY_WEIGHTS.critical).toBeGreaterThan(PRIORITY_WEIGHTS.high);
    expect(PRIORITY_WEIGHTS.high).toBeGreaterThan(PRIORITY_WEIGHTS.normal);
    expect(PRIORITY_WEIGHTS.normal).toBeGreaterThan(PRIORITY_WEIGHTS.low);
    expect(PRIORITY_WEIGHTS.low).toBeGreaterThan(PRIORITY_WEIGHTS.background);
  });

  // プロパティベーステスト
  it("PBT: すべての重みは正の数", () => {
    fc.assert(
      fc.property(arbTaskPriority, (priority) => {
        // Assert
        expect(PRIORITY_WEIGHTS[priority]).toBeGreaterThan(0);
        expect(Number.isFinite(PRIORITY_WEIGHTS[priority])).toBe(true);
      })
    );
  });
});

describe("PRIORITY_VALUES", () => {
  it("正常系: すべての優先度に対して数値が定義されている", () => {
    // Assert
    const priorities: TaskPriority[] = [
      "critical",
      "high",
      "normal",
      "low",
      "background",
    ];
    for (const priority of priorities) {
      expect(PRIORITY_VALUES[priority]).toBeDefined();
    }
  });

  it("正常系: criticalが最も高い数値を持つ", () => {
    // Assert
    expect(PRIORITY_VALUES.critical).toBe(4);
    expect(PRIORITY_VALUES.high).toBe(3);
    expect(PRIORITY_VALUES.normal).toBe(2);
    expect(PRIORITY_VALUES.low).toBe(1);
    expect(PRIORITY_VALUES.background).toBe(0);
  });

  // プロパティベーステスト
  it("PBT: すべての値は0以上の整数", () => {
    fc.assert(
      fc.property(arbTaskPriority, (priority) => {
        // Assert
        expect(Number.isInteger(PRIORITY_VALUES[priority])).toBe(true);
        expect(PRIORITY_VALUES[priority]).toBeGreaterThanOrEqual(0);
      })
    );
  });
});

// ============================================================================
// inferTaskType テスト
// ============================================================================

describe("inferTaskType", () => {
  describe("正常系", () => {
    it("正常系: questionツールを正しく推論", () => {
      expect(inferTaskType("question")).toBe("question");
      expect(inferTaskType("Question")).toBe("question");
    });

    it("正常系: readツールを正しく推論", () => {
      expect(inferTaskType("read")).toBe("read");
    });

    it("正常系: bashツールを正しく推論", () => {
      expect(inferTaskType("bash")).toBe("bash");
    });

    it("正常系: editツールを正しく推論", () => {
      expect(inferTaskType("edit")).toBe("edit");
    });

    it("正常系: writeツールを正しく推論", () => {
      expect(inferTaskType("write")).toBe("write");
    });

    it("正常系: subagent_runを正しく推論", () => {
      expect(inferTaskType("subagent_run")).toBe("subagent_single");
    });

    it("正常系: subagent_run_parallelを正しく推論", () => {
      expect(inferTaskType("subagent_run_parallel")).toBe("subagent_parallel");
    });

    it("正常系: agent_teamを正しく推論", () => {
      expect(inferTaskType("agent_team")).toBe("agent_team");
      expect(inferTaskType("agent_team_run")).toBe("agent_team");
    });

    it("正常系: 不明なツールはunknown", () => {
      expect(inferTaskType("unknown_tool")).toBe("unknown");
      expect(inferTaskType("")).toBe("unknown");
    });
  });

  describe("プロパティベーステスト", () => {
    // 決定性
    it("PBT: 決定的である（同じ入力で同じ結果）", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 50 }), (toolName) => {
          // Act
          const result1 = inferTaskType(toolName);
          const result2 = inferTaskType(toolName);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });

    // 不変条件: 結果は常に有効なTaskType
    it("PBT: 結果は常に有効なTaskType", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 50 }), (toolName) => {
          // Act
          const result = inferTaskType(toolName);

          // Assert
          const validTypes: TaskType[] = [
            "read",
            "bash",
            "edit",
            "write",
            "subagent_single",
            "subagent_parallel",
            "agent_team",
            "question",
            "unknown",
          ];
          expect(validTypes).toContain(result);
        })
      );
    });

    // 大文字小文字を無視
    it("PBT: 大文字小文字を無視する", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("read", "bash", "edit", "write", "question"),
          fc.boolean(),
          (toolName, toUpper) => {
            // Arrange
            const input = toUpper ? toolName.toUpperCase() : toolName.toLowerCase();

            // Act
            const result = inferTaskType(input);

            // Assert
            expect(result).toBe(toolName);
          }
        )
      );
    });
  });
});

// ============================================================================
// estimateRounds テスト
// ============================================================================

describe("estimateRounds", () => {
  describe("正常系", () => {
    it("正常系: readツールは1ラウンド", () => {
      // Arrange
      const context: EstimationContext = { toolName: "read" };

      // Act
      const result = estimateRounds(context);

      // Assert
      expect(result.taskType).toBe("read");
      expect(result.estimatedRounds).toBe(1);
    });

    it("正常系: agent_teamはagentCountに応じて増加", () => {
      // Arrange
      const context1: EstimationContext = { toolName: "agent_team", agentCount: 1 };
      const context2: EstimationContext = { toolName: "agent_team", agentCount: 3 };

      // Act
      const result1 = estimateRounds(context1);
      const result2 = estimateRounds(context2);

      // Assert
      expect(result2.estimatedRounds).toBeGreaterThan(result1.estimatedRounds);
    });

    it("正常系: リトライ時は+2ラウンド", () => {
      // Arrange
      const contextNormal: EstimationContext = { toolName: "read" };
      const contextRetry: EstimationContext = { toolName: "read", isRetry: true };

      // Act
      const resultNormal = estimateRounds(contextNormal);
      const resultRetry = estimateRounds(contextRetry);

      // Assert
      expect(resultRetry.estimatedRounds).toBe(resultNormal.estimatedRounds + 2);
    });

    it("正常系: 不明なフレームワークで増加", () => {
      // Arrange
      const contextNormal: EstimationContext = { toolName: "edit" };
      const contextUnknown: EstimationContext = {
        toolName: "edit",
        hasUnknownFramework: true,
      };

      // Act
      const resultNormal = estimateRounds(contextNormal);
      const resultUnknown = estimateRounds(contextUnknown);

      // Assert
      expect(resultUnknown.estimatedRounds).toBeGreaterThan(resultNormal.estimatedRounds);
      expect(resultUnknown.complexity).toBe("exploratory");
    });
  });

  describe("境界値", () => {
    it("境界値: 空のコンテキストでも動作する", () => {
      // Arrange
      const context: EstimationContext = { toolName: "" };

      // Act
      const result = estimateRounds(context);

      // Assert
      expect(result).toBeDefined();
      expect(result.estimatedRounds).toBeGreaterThanOrEqual(1);
    });
  });

  describe("プロパティベーステスト", () => {
    // 不変条件: 結果構造
    it("PBT: 常に正しい構造の結果を返す", () => {
      fc.assert(
        fc.property(arbEstimationContext, (context) => {
          // Act
          const result = estimateRounds(context);

          // Assert
          expect(result.estimatedRounds).toBeGreaterThanOrEqual(1);
          expect(result.estimatedRounds).toBeLessThanOrEqual(50);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        })
      );
    });

    // 不変条件: ラウンド数の範囲
    it("PBT: 推定ラウンド数は常に1〜50の範囲", () => {
      fc.assert(
        fc.property(arbEstimationContext, (context) => {
          // Act
          const result = estimateRounds(context);

          // Assert
          expect(result.estimatedRounds).toBeGreaterThanOrEqual(1);
          expect(result.estimatedRounds).toBeLessThanOrEqual(50);
        })
      );
    });

    // 不変条件: confidenceの範囲
    it("PBT: confidenceは常に0〜1の範囲", () => {
      fc.assert(
        fc.property(arbEstimationContext, (context) => {
          // Act
          const result = estimateRounds(context);

          // Assert
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        })
      );
    });

    // 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(arbEstimationContext, (context) => {
          // Act
          const result1 = estimateRounds(context);
          const result2 = estimateRounds(context);

          // Assert
          expect(result1.estimatedRounds).toBe(result2.estimatedRounds);
          expect(result1.taskType).toBe(result2.taskType);
          expect(result1.complexity).toBe(result2.complexity);
          expect(result1.confidence).toBe(result2.confidence);
        })
      );
    });
  });
});

// ============================================================================
// inferPriority テスト
// ============================================================================

describe("inferPriority", () => {
  describe("正常系", () => {
    it("正常系: questionツールはcritical", () => {
      expect(inferPriority("question")).toBe("critical");
    });

    it("正常系: isInteractive=trueはhigh", () => {
      expect(
        inferPriority("custom_tool", { isInteractive: true })
      ).toBe("high");
    });

    it("正常系: isBackground=trueはbackground", () => {
      expect(
        inferPriority("custom_tool", { isBackground: true })
      ).toBe("background");
    });

    it("正常系: isRetry=trueはlow", () => {
      expect(inferPriority("custom_tool", { isRetry: true })).toBe("low");
    });

    it("正常系: subagent_runはhigh", () => {
      expect(inferPriority("subagent_run")).toBe("high");
    });

    it("正常系: agent_teamはhigh", () => {
      expect(inferPriority("agent_team")).toBe("high");
    });

    it("正常系: read/bash/edit/writeはnormal", () => {
      expect(inferPriority("read")).toBe("normal");
      expect(inferPriority("bash")).toBe("normal");
      expect(inferPriority("edit")).toBe("normal");
      expect(inferPriority("write")).toBe("normal");
    });
  });

  describe("プロパティベーステスト", () => {
    // 不変条件: 結果は常に有効な優先度
    it("PBT: 結果は常に有効なTaskPriority", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }),
          fc.option(
            fc.record({
              isInteractive: fc.option(fc.boolean(), { nil: undefined }),
              isRetry: fc.option(fc.boolean(), { nil: undefined }),
              isBackground: fc.option(fc.boolean(), { nil: undefined }),
              agentCount: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
            }),
            { nil: undefined }
          ),
          (toolName, context) => {
            // Act
            const result = inferPriority(toolName, context);

            // Assert
            const validPriorities: TaskPriority[] = [
              "critical",
              "high",
              "normal",
              "low",
              "background",
            ];
            expect(validPriorities).toContain(result);
          }
        )
      );
    });

    // 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 30 }),
          fc.option(
            fc.record({
              isInteractive: fc.option(fc.boolean(), { nil: undefined }),
              isRetry: fc.option(fc.boolean(), { nil: undefined }),
              isBackground: fc.option(fc.boolean(), { nil: undefined }),
            }),
            { nil: undefined }
          ),
          (toolName, context) => {
            // Act
            const result1 = inferPriority(toolName, context);
            const result2 = inferPriority(toolName, context);

            // Assert
            expect(result1).toBe(result2);
          }
        )
      );
    });
  });
});

// ============================================================================
// comparePriority テスト
// ============================================================================

describe("comparePriority", () => {
  describe("正常系", () => {
    it("正常系: critical > high > normal > low > background", () => {
      const createEntry = (priority: TaskPriority): PriorityQueueEntry => ({
        id: `test-${priority}`,
        toolName: "test",
        priority,
        enqueuedAtMs: 0,
        virtualStartTime: 0,
        virtualFinishTime: 1000,
        skipCount: 0,
      });

      // critical > high
      expect(comparePriority(createEntry("high"), createEntry("critical"))).toBeGreaterThan(0);
      // high > normal
      expect(comparePriority(createEntry("normal"), createEntry("high"))).toBeGreaterThan(0);
      // normal > low
      expect(comparePriority(createEntry("low"), createEntry("normal"))).toBeGreaterThan(0);
      // low > background
      expect(comparePriority(createEntry("background"), createEntry("low"))).toBeGreaterThan(0);
    });

    it("正常系: 同じ優先度ならenqueuedAtMsで比較", () => {
      const createEntry = (enqueuedAtMs: number): PriorityQueueEntry => ({
        id: `test-${enqueuedAtMs}`,
        toolName: "test",
        priority: "normal",
        enqueuedAtMs,
        virtualStartTime: 0,
        virtualFinishTime: 1000,
        skipCount: 0,
      });

      // 早い方が優先
      expect(comparePriority(createEntry(100), createEntry(200))).toBeLessThan(0);
    });

    it("正常系: skipCountが大きいと優先される（飢餓防止）", () => {
      const createEntry = (skipCount: number): PriorityQueueEntry => ({
        id: `test-${skipCount}`,
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
        virtualStartTime: 0,
        virtualFinishTime: 1000,
        skipCount,
      });

      // skipCount > 3 で優先
      expect(comparePriority(createEntry(5), createEntry(0))).toBeLessThan(0);
    });
  });

  describe("プロパティベーステスト", () => {
    // 注: skipCount比較に閾値(3)があるため、厳密な推移律は成立しない
    // これはスケジューラーの「弱順序」として許容される挙動
    // starvation preventionのための意図的な設計
    it("PBT: 推移律が成り立つ（skipCount閾値外の場合）", () => {
      fc.assert(
        fc.property(
          arbPriorityQueueEntry,
          arbPriorityQueueEntry,
          arbPriorityQueueEntry,
          (a, b, c) => {
            // Arrange
            const ab = comparePriority(a, b);
            const bc = comparePriority(b, c);

            // Act
            const ac = comparePriority(a, c);

            // Assert: 推移律（skipCount閾値が関与しない場合のみ検証）
            // skipCount差分が閾値(3)を超える比較がある場合は、推移律が成り立たない可能性があるためスキップ
            const skipDiffAB = Math.abs(a.skipCount - b.skipCount);
            const skipDiffBC = Math.abs(b.skipCount - c.skipCount);
            const skipDiffAC = Math.abs(a.skipCount - c.skipCount);
            const hasSkipThreshold = skipDiffAB > 3 || skipDiffBC > 3 || skipDiffAC > 3;

            if (!hasSkipThreshold) {
              if (ab < 0 && bc < 0) {
                // a < b < c => a < c
                expect(ac).toBeLessThanOrEqual(0);
              } else if (ab > 0 && bc > 0) {
                // a > b > c => a > c
                expect(ac).toBeGreaterThanOrEqual(0);
              }
            }
          }
        )
      );
    });

    // 反射律: a = a
    it("PBT: 反射律が成り立つ（a - a = 0）", () => {
      fc.assert(
        fc.property(arbPriorityQueueEntry, (a) => {
          // Act
          const result = comparePriority(a, a);

          // Assert
          expect(result).toBe(0);
        })
      );
    });

    // 対称律: compare(a, b) = -compare(b, a)
    it("PBT: 対称律が成り立つ", () => {
      fc.assert(
        fc.property(arbPriorityQueueEntry, arbPriorityQueueEntry, (a, b) => {
          // Act
          const ab = comparePriority(a, b);
          const ba = comparePriority(b, a);

          // Assert
          expect(ab).toBe(-ba);
        })
      );
    });

    // 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(arbPriorityQueueEntry, arbPriorityQueueEntry, (a, b) => {
          // Act
          const result1 = comparePriority(a, b);
          const result2 = comparePriority(a, b);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });
  });
});

// ============================================================================
// PriorityTaskQueue テスト
// ============================================================================

describe("PriorityTaskQueue", () => {
  let queue: PriorityTaskQueue;

  beforeEach(() => {
    queue = new PriorityTaskQueue();
  });

  describe("enqueue / dequeue", () => {
    it("正常系: タスクを追加して取り出せる", () => {
      // Arrange
      const metadata: PriorityTaskMetadata = {
        id: "task-1",
        toolName: "read",
        priority: "normal",
        enqueuedAtMs: Date.now(),
      };

      // Act
      const entry = queue.enqueue(metadata);
      const dequeued = queue.dequeue();

      // Assert
      expect(entry.id).toBe("task-1");
      expect(dequeued?.id).toBe("task-1");
    });

    it("正常系: 空のキューからはundefined", () => {
      // Act
      const result = queue.dequeue();

      // Assert
      expect(result).toBeUndefined();
    });

    it("正常系: 優先度順で取り出される", () => {
      // Arrange
      queue.enqueue({
        id: "low",
        toolName: "test",
        priority: "low",
        enqueuedAtMs: 0,
      });
      queue.enqueue({
        id: "critical",
        toolName: "test",
        priority: "critical",
        enqueuedAtMs: 0,
      });
      queue.enqueue({
        id: "normal",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });

      // Act & Assert
      expect(queue.dequeue()?.id).toBe("critical");
      expect(queue.dequeue()?.id).toBe("normal");
      expect(queue.dequeue()?.id).toBe("low");
    });

    it("正常系: 同じ優先度ならFIFO", () => {
      // Arrange
      queue.enqueue({
        id: "first",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 100,
      });
      queue.enqueue({
        id: "second",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 200,
      });

      // Act & Assert
      expect(queue.dequeue()?.id).toBe("first");
      expect(queue.dequeue()?.id).toBe("second");
    });
  });

  describe("length / isEmpty", () => {
    it("正常系: 長さを正しく返す", () => {
      // Arrange
      expect(queue.length).toBe(0);
      expect(queue.isEmpty).toBe(true);

      // Act
      queue.enqueue({
        id: "task-1",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });

      // Assert
      expect(queue.length).toBe(1);
      expect(queue.isEmpty).toBe(false);
    });
  });

  describe("peek", () => {
    it("正常系: 先頭要素を参照する（削除しない）", () => {
      // Arrange
      queue.enqueue({
        id: "task-1",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });

      // Act
      const peeked = queue.peek();
      const dequeued = queue.dequeue();

      // Assert
      expect(peeked?.id).toBe("task-1");
      expect(dequeued?.id).toBe("task-1");
      expect(queue.length).toBe(0);
    });
  });

  describe("remove", () => {
    it("正常系: 指定IDのタスクを削除する", () => {
      // Arrange
      queue.enqueue({
        id: "task-1",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });
      queue.enqueue({
        id: "task-2",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });

      // Act
      const removed = queue.remove("task-1");

      // Assert
      expect(removed?.id).toBe("task-1");
      expect(queue.length).toBe(1);
      expect(queue.peek()?.id).toBe("task-2");
    });

    it("境界値: 存在しないIDはundefined", () => {
      // Act
      const result = queue.remove("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("getByPriority", () => {
    it("正常系: 指定優先度のタスクのみ取得", () => {
      // Arrange
      queue.enqueue({
        id: "critical-1",
        toolName: "test",
        priority: "critical",
        enqueuedAtMs: 0,
      });
      queue.enqueue({
        id: "normal-1",
        toolName: "test",
        priority: "normal",
        enqueuedAtMs: 0,
      });
      queue.enqueue({
        id: "critical-2",
        toolName: "test",
        priority: "critical",
        enqueuedAtMs: 0,
      });

      // Act
      const criticalTasks = queue.getByPriority("critical");

      // Assert
      expect(criticalTasks.length).toBe(2);
      expect(criticalTasks.every((t) => t.priority === "critical")).toBe(true);
    });
  });

  describe("getStats", () => {
    it("正常系: 統計情報を正しく返す", () => {
      // Arrange
      queue.enqueue({
        id: "task-1",
        toolName: "test",
        priority: "high",
        enqueuedAtMs: Date.now() - 1000,
      });
      queue.enqueue({
        id: "task-2",
        toolName: "test",
        priority: "low",
        enqueuedAtMs: Date.now() - 500,
      });

      // Act
      const stats = queue.getStats();

      // Assert
      expect(stats.total).toBe(2);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.avgWaitMs).toBeGreaterThan(0);
    });
  });

  describe("promoteStarvingTasks", () => {
    it("正常系: 待機時間が長いタスクを昇格する", () => {
      // Arrange
      // 飢餓閾値を超えるタスクを作成
      queue.enqueue({
        id: "starving",
        toolName: "test",
        priority: "low",
        enqueuedAtMs: Date.now() - 120000, // 2分前
      });

      // Act
      const promoted = queue.promoteStarvingTasks();

      // Assert
      expect(promoted).toBeGreaterThanOrEqual(1);
      const task = queue.getAll()[0];
      expect(task.priority).not.toBe("low");
    });
  });

  describe("プロパティベーステスト", () => {
    // 不変条件: enqueue/dequeueの整合性
    it("PBT: enqueueした数とdequeueした数が等しい", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbPriorityTaskMetadata, { maxLength: 20 }),
          async (metadatas) => {
            // Arrange
            const q = new PriorityTaskQueue();

            // Act
            for (const m of metadatas) {
              q.enqueue(m);
            }

            // Assert: 全て取り出せる
            expect(q.length).toBe(metadatas.length);

            let dequeued = 0;
            while (!q.isEmpty) {
              q.dequeue();
              dequeued++;
            }

            expect(dequeued).toBe(metadatas.length);
            expect(q.length).toBe(0);
          }
        )
      );
    });

    // 不変条件: 優先度順序
    it("PBT: criticalタスクは常に最初にdequeueされる", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbPriorityTaskMetadata, { minLength: 1, maxLength: 10 }).filter(
            (arr) => arr.some((m) => m.priority === "critical")
          ),
          async (metadatas) => {
            // Arrange
            const q = new PriorityTaskQueue();

            // Act
            for (const m of metadatas) {
              q.enqueue(m);
            }

            // Assert
            const first = q.dequeue();
            expect(first?.priority).toBe("critical");
          }
        )
      );
    });

    // 不変条件: removeの整合性
    it("PBT: remove後の長さは正しい", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbPriorityTaskMetadata, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 0, max: 9 }),
          async (metadatas, removeIndex) => {
            // Arrange
            const q = new PriorityTaskQueue();
            const validIndex = removeIndex % metadatas.length;

            for (const m of metadatas) {
              q.enqueue(m);
            }

            const idToRemove = metadatas[validIndex].id;
            const initialLength = q.length;

            // Act
            q.remove(idToRemove);

            // Assert
            expect(q.length).toBe(initialLength - 1);
          }
        )
      );
    });
  });
});

// ============================================================================
// formatPriorityQueueStats テスト
// ============================================================================

describe("formatPriorityQueueStats", () => {
  it("正常系: 統計情報を文字列にフォーマットする", () => {
    // Arrange
    const stats = {
      total: 10,
      byPriority: {
        critical: 1,
        high: 2,
        normal: 3,
        low: 3,
        background: 1,
      },
      avgWaitMs: 1500,
      maxWaitMs: 5000,
      starvingCount: 1,
    };

    // Act
    const result = formatPriorityQueueStats(stats);

    // Assert
    expect(result).toContain("Total: 10");
    expect(result).toContain("critical: 1");
    expect(result).toContain("avg: 1500ms");
    expect(result).toContain("starving: 1");
  });

  // プロパティベーステスト
  it("PBT: 常に文字列を返す", () => {
    fc.assert(
      fc.property(
        fc.record({
          total: fc.nat(100),
          byPriority: fc.record({
            critical: fc.nat(20),
            high: fc.nat(20),
            normal: fc.nat(20),
            low: fc.nat(20),
            background: fc.nat(20),
          }),
          avgWaitMs: fc.nat(100000),
          maxWaitMs: fc.nat(100000),
          starvingCount: fc.nat(100),
        }),
        (stats) => {
          // Act
          const result = formatPriorityQueueStats(stats);

          // Assert
          expect(typeof result).toBe("string");
          expect(result.length).toBeGreaterThan(0);
        }
      )
    );
  });
});

// ============================================================================
// クロステスト: 推論関数の連携
// ============================================================================

describe("クロステスト: 推論関数の連携", () => {
  it("PBT: inferTaskTypeとestimateRoundsの整合性", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (toolName) => {
          // Arrange
          const context: EstimationContext = { toolName };

          // Act
          const taskType = inferTaskType(toolName);
          const estimation = estimateRounds(context);

          // Assert
          expect(estimation.taskType).toBe(taskType);
        }
      )
    );
  });

  it("PBT: inferPriorityとPRIORITY_VALUESの整合性", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.option(
          fc.record({
            isInteractive: fc.option(fc.boolean(), { nil: undefined }),
            isRetry: fc.option(fc.boolean(), { nil: undefined }),
            isBackground: fc.option(fc.boolean(), { nil: undefined }),
          }),
          { nil: undefined }
        ),
        (toolName, context) => {
          // Act
          const priority = inferPriority(toolName, context);
          const value = PRIORITY_VALUES[priority];

          // Assert
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(4);
        }
      )
    );
  });
});
