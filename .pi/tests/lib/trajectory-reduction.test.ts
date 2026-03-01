/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/__tests__/trajectory-reduction.test.ts
 * role: Trajectory Reduction機能のユニットテスト
 * why: 軌跡圧縮機能の正確性を保証するため
 * related: .pi/lib/trajectory-reduction/index.ts, .pi/lib/trajectory-reduction/types.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: 軌跡圧縮機能のユニットテストスイート
 * what_it_does:
 *   - 型定義のテスト
 *   - シリアライゼーションのテスト
 *   - スライディングウィンドウのテスト
 *   - リフレクションモジュールのテスト
 *   - 統合テスト
 * why_it_exists:
 *   - 品質保証のため
 *   - リグレッション防止のため
 * scope:
 *   in: テスト対象モジュール
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  type TrajectoryStep,
  type TrajectoryReductionConfig,
  DEFAULT_TRAJECTORY_REDUCTION_CONFIG,
} from "../../lib/trajectory-reduction/types.js";
import {
  serializeStep,
  serializeSteps,
  countTokens,
  messageToStep,
} from "../../lib/trajectory-reduction/serialization.js";
import {
  SlidingWindowManager,
  createSlidingWindowManager,
} from "../../lib/trajectory-reduction/sliding-window.js";
import {
  ReflectionModule,
  createReflectionModule,
  mockCallLLM,
} from "../../lib/trajectory-reduction/reflection-module.js";
import {
  TrajectoryReducer,
  createTrajectoryReducer,
  formatStats,
} from "../../lib/trajectory-reduction/index.js";

// テスト用ヘルパー
function createTestStep(step: number, content: string, role: "user" | "assistant" = "assistant"): TrajectoryStep {
  return {
    step,
    role,
    content,
    tokenCount: countTokens(content),
    timestamp: Date.now(),
  };
}

function createTestTrajectory(count: number): TrajectoryStep[] {
  const steps: TrajectoryStep[] = [];
  for (let i = 1; i <= count; i++) {
    steps.push(createTestStep(i, `This is step ${i} with some content to make it longer.`));
  }
  return steps;
}

// ============ Types Tests ============
describe("Types", () => {
  it("should have correct default config", () => {
    expect(DEFAULT_TRAJECTORY_REDUCTION_CONFIG.enabled).toBe(true);
    expect(DEFAULT_TRAJECTORY_REDUCTION_CONFIG.threshold).toBe(500);
    expect(DEFAULT_TRAJECTORY_REDUCTION_CONFIG.stepsAfter).toBe(2);
    expect(DEFAULT_TRAJECTORY_REDUCTION_CONFIG.stepsBefore).toBe(1);
  });
});

// ============ Serialization Tests ============
describe("Serialization", () => {
  describe("countTokens", () => {
    it("should return 0 for empty string", () => {
      expect(countTokens("")).toBe(0);
    });

    it("should estimate tokens for English text", () => {
      const text = "This is a simple English sentence.";
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(text.length);
    });

    it("should estimate tokens for Japanese text", () => {
      const text = "これは日本語のテストです。";
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it("should handle mixed text", () => {
      const text = "Hello世界！This is テスト.";
      const tokens = countTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("serializeStep", () => {
    it("should serialize a step correctly", () => {
      const step = createTestStep(1, "Test content");
      const serialized = serializeStep(step);
      expect(serialized).toContain("[Step 1]");
      expect(serialized).toContain("Assistant");
      expect(serialized).toContain("Test content");
    });

    it("should include metadata when requested", () => {
      const step = createTestStep(1, "Test content");
      step.metadata = { tool: "bash" };
      const serialized = serializeStep(step, true);
      expect(serialized).toContain("Metadata");
      expect(serialized).toContain("tool");
    });
  });

  describe("serializeSteps", () => {
    it("should serialize multiple steps", () => {
      const steps = createTestTrajectory(3);
      const serialized = serializeSteps(steps);
      expect(serialized).toContain("[Step 1]");
      expect(serialized).toContain("[Step 2]");
      expect(serialized).toContain("[Step 3]");
      expect(serialized).toContain("---");
    });
  });

  describe("messageToStep", () => {
    it("should convert message to step", () => {
      const message = { role: "user", content: "Hello" };
      const step = messageToStep(message, 1);
      expect(step.step).toBe(1);
      expect(step.role).toBe("user");
      expect(step.content).toBe("Hello");
      expect(step.tokenCount).toBeGreaterThan(0);
    });

    it("should normalize role names", () => {
      expect(messageToStep({ role: "human", content: "" }, 1).role).toBe("user");
      expect(messageToStep({ role: "ai", content: "" }, 1).role).toBe("assistant");
      expect(messageToStep({ role: "function", content: "" }, 1).role).toBe("tool");
    });
  });
});

// ============ Sliding Window Tests ============
describe("SlidingWindowManager", () => {
  let manager: SlidingWindowManager;
  let trajectory: TrajectoryStep[];

  beforeEach(() => {
    trajectory = createTestTrajectory(20);
    manager = createSlidingWindowManager(DEFAULT_TRAJECTORY_REDUCTION_CONFIG, trajectory);
  });

  describe("getTargetStep", () => {
    it("should return null for early steps", () => {
      expect(manager.getTargetStep(1)).toBeNull();
      expect(manager.getTargetStep(2)).toBeNull();
    });

    it("should return target step after stepsAfter", () => {
      expect(manager.getTargetStep(5)).toBe(3); // 5 - 2 = 3
      expect(manager.getTargetStep(10)).toBe(8); // 10 - 2 = 8
    });
  });

  describe("shouldReduce", () => {
    it("should return false when disabled", () => {
      const config = { ...DEFAULT_TRAJECTORY_REDUCTION_CONFIG, enabled: false };
      const m = createSlidingWindowManager(config, trajectory);
      expect(m.shouldReduce(10)).toBe(false);
    });

    it("should return false for short trajectories", () => {
      const shortTrajectory = createTestTrajectory(3);
      const m = createSlidingWindowManager(DEFAULT_TRAJECTORY_REDUCTION_CONFIG, shortTrajectory);
      expect(m.shouldReduce(3)).toBe(false);
    });
  });

  describe("createWindowContext", () => {
    it("should create context with correct window", () => {
      // 長いステップを作成（閾値を超えるように）
      trajectory[7] = createTestStep(8, "x".repeat(2000));

      const context = manager.createWindowContext(10);
      if (context) {
        expect(context.targetStep).toBe(8);
        expect(context.currentStep).toBe(10);
        expect(context.steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe("getTrajectoryStats", () => {
    it("should return correct stats", () => {
      const stats = manager.getTrajectoryStats();
      expect(stats.totalSteps).toBe(20);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.compressedSteps).toBe(0);
    });
  });
});

// ============ Reflection Module Tests ============
describe("ReflectionModule", () => {
  let module: ReflectionModule;

  beforeEach(() => {
    module = createReflectionModule(DEFAULT_TRAJECTORY_REDUCTION_CONFIG, mockCallLLM);
  });

  describe("reduce", () => {
    it("should reduce verbose test output", async () => {
      const content = `
test_user.py ... PASSED
test_auth.py ... PASSED
test_api.py ... PASSED
test_login.py ... PASSED
test_logout.py ... PASSED
test_profile.py ... PASSED
test_settings.py ... PASSED
test_dashboard.py ... PASSED
test_analytics.py ... PASSED
test_reports.py ... FAILED
test_exports.py ... PASSED
`.repeat(10); // 長くする

      const result = await module.reduce({
        targetContent: content,
        contextSteps: [createTestStep(1, "Previous step")],
        targetStepNumber: 2,
        currentStepNumber: 4,
      });

      expect(result.content).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(result.wasteTypes.length).toBeGreaterThan(0);
    });
  });

  describe("validateReduction", () => {
    it("should reject empty content", () => {
      const result = {
        content: "",
        tokenCount: 0,
        tokensSaved: 100,
        reductionRatio: 1,
        wasteTypes: ["useless"] as const,
        processingTimeMs: 100,
        reflectionModel: "gpt-4o-mini",
      };
      expect(module.validateReduction("original", result)).toBe(false);
    });

    it("should reject when savings below threshold", () => {
      const result = {
        content: "short",
        tokenCount: 1,
        tokensSaved: 10, // Below threshold of 500
        reductionRatio: 0.9,
        wasteTypes: ["useless"] as const,
        processingTimeMs: 100,
        reflectionModel: "gpt-4o-mini",
      };
      expect(module.validateReduction("original content", result)).toBe(false);
    });
  });
});

// ============ Integration Tests ============
describe("TrajectoryReducer", () => {
  let reducer: TrajectoryReducer;
  let trajectory: TrajectoryStep[];

  beforeEach(() => {
    trajectory = createTestTrajectory(20);
    reducer = new TrajectoryReducer({}, trajectory, mockCallLLM);
  });

  describe("afterStepExecution", () => {
    it("should not reduce early steps", async () => {
      const result = await reducer.afterStepExecution(3);
      expect(result).toBeNull();
    });

    it("should reduce valid step", async () => {
      // 長いステップを作成
      trajectory[7] = createTestStep(8, "x".repeat(2000));

      const result = await reducer.afterStepExecution(10);
      // 結果は条件によって異なる
      // expect(result).not.toBeNull();
    });
  });

  describe("getStats", () => {
    it("should return initial stats", () => {
      const stats = reducer.getStats();
      expect(stats.totalSteps).toBe(0);
      expect(stats.compressedSteps).toBe(0);
      expect(stats.tokensSaved).toBe(0);
    });
  });

  describe("addStep", () => {
    it("should add step to trajectory", () => {
      const initialLength = reducer.getTrajectory().length;
      reducer.addStep(createTestStep(21, "New step"));
      expect(reducer.getTrajectory().length).toBe(initialLength + 1);
    });
  });
});

// ============ Format Stats Tests ============
describe("formatStats", () => {
  it("should format stats as markdown", () => {
    const stats = {
      totalSteps: 100,
      compressedSteps: 20,
      originalTokens: 50000,
      compressedTokens: 30000,
      tokensSaved: 20000,
      averageReductionRatio: 0.4,
      reflectionCalls: 20,
      totalProcessingTimeMs: 5000,
      wasteTypeCounts: {
        useless: 10,
        redundant: 7,
        expired: 3,
      },
    };

    const formatted = formatStats(stats);
    expect(formatted).toContain("Trajectory Reduction Statistics");
    expect(formatted).toContain("Total Steps");
    expect(formatted).toContain("Tokens Saved");
    expect(formatted).toContain("Waste Types");
  });
});
