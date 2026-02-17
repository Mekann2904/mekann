/**
 * Unit tests for lib/adaptive-penalty.ts
 * Tests adaptive penalty controller with exponential decay and reason-based weights.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createAdaptivePenaltyController,
  createEnhancedPenaltyController,
  createAutoPenaltyController,
  getAdaptivePenaltyMode,
  resetAdaptivePenaltyModeCache,
  type AdaptivePenaltyState,
  type AdaptivePenaltyOptions,
  type AdaptivePenaltyController,
  type EnhancedPenaltyOptions,
  type EnhancedPenaltyController,
  type PenaltyReason,
  type DecayStrategy,
} from "../../../.pi/lib/adaptive-penalty.js";

// ============================================================================
// Feature Flag Tests
// ============================================================================

describe("getAdaptivePenaltyMode", () => {
  beforeEach(() => {
    resetAdaptivePenaltyModeCache();
  });

  afterEach(() => {
    resetAdaptivePenaltyModeCache();
  });

  it("should return 'enhanced' by default", () => {
    delete process.env.PI_ADAPTIVE_PENALTY_MODE;
    resetAdaptivePenaltyModeCache();

    const mode = getAdaptivePenaltyMode();

    expect(mode).toBe("enhanced");
  });

  it("should return 'legacy' when PI_ADAPTIVE_PENALTY_MODE is 'legacy'", () => {
    process.env.PI_ADAPTIVE_PENALTY_MODE = "legacy";
    resetAdaptivePenaltyModeCache();

    const mode = getAdaptivePenaltyMode();

    expect(mode).toBe("legacy");
  });

  it("should return 'enhanced' for any non-legacy value", () => {
    process.env.PI_ADAPTIVE_PENALTY_MODE = "enhanced";
    resetAdaptivePenaltyModeCache();

    expect(getAdaptivePenaltyMode()).toBe("enhanced");

    process.env.PI_ADAPTIVE_PENALTY_MODE = "invalid";
    resetAdaptivePenaltyModeCache();

    expect(getAdaptivePenaltyMode()).toBe("enhanced");
  });

  it("should cache the mode value", () => {
    delete process.env.PI_ADAPTIVE_PENALTY_MODE;
    resetAdaptivePenaltyModeCache();

    const mode1 = getAdaptivePenaltyMode();

    process.env.PI_ADAPTIVE_PENALTY_MODE = "legacy";

    const mode2 = getAdaptivePenaltyMode();

    // Should return cached value
    expect(mode1).toBe(mode2);
    expect(mode1).toBe("enhanced");
  });
});

describe("resetAdaptivePenaltyModeCache", () => {
  it("should reset cached mode", () => {
    process.env.PI_ADAPTIVE_PENALTY_MODE = "legacy";
    resetAdaptivePenaltyModeCache();

    expect(getAdaptivePenaltyMode()).toBe("legacy");

    process.env.PI_ADAPTIVE_PENALTY_MODE = "enhanced";
    resetAdaptivePenaltyModeCache();

    expect(getAdaptivePenaltyMode()).toBe("enhanced");
  });
});

// ============================================================================
// Legacy Controller Tests
// ============================================================================

describe("createAdaptivePenaltyController", () => {
  const defaultOptions: AdaptivePenaltyOptions = {
    isStable: false,
    maxPenalty: 10,
    decayMs: 1000,
  };

  it("should create controller with initial state", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    expect(controller.state.penalty).toBe(0);
    expect(controller.state.updatedAtMs).toBeGreaterThan(0);
    expect(controller.state.reasonHistory).toEqual([]);
  });

  it("should return zero penalty initially", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    expect(controller.get()).toBe(0);
  });

  it("should increase penalty when raise is called", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    controller.raise("rate_limit");

    expect(controller.get()).toBe(1);
  });

  it("should increase penalty for different reasons", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    controller.raise("timeout");
    expect(controller.get()).toBe(1);

    controller.raise("capacity");
    expect(controller.get()).toBe(2);

    controller.raise("rate_limit");
    expect(controller.get()).toBe(3);
  });

  it("should not exceed max penalty", () => {
    const controller = createAdaptivePenaltyController({
      ...defaultOptions,
      maxPenalty: 3,
    });

    controller.raise("rate_limit");
    controller.raise("rate_limit");
    controller.raise("rate_limit");
    controller.raise("rate_limit"); // Should not increase beyond max

    expect(controller.get()).toBe(3);
  });

  it("should decrease penalty when lower is called", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    controller.raise("rate_limit");
    controller.raise("rate_limit");
    expect(controller.get()).toBe(2);

    controller.lower();
    expect(controller.get()).toBe(1);
  });

  it("should not decrease penalty below zero", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    controller.lower();
    controller.lower();

    expect(controller.get()).toBe(0);
  });

  it("should decay penalty over time", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const controller = createAdaptivePenaltyController({
      ...defaultOptions,
      decayMs: 1000,
    });

    controller.raise("rate_limit");
    controller.raise("rate_limit");
    expect(controller.get()).toBe(2);

    // Advance time by 2 decay intervals
    vi.setSystemTime(now + 2000);

    expect(controller.get()).toBe(0);

    vi.useRealTimers();
  });

  it("should apply penalty to limit calculation", () => {
    const controller = createAdaptivePenaltyController(defaultOptions);

    // Zero penalty
    expect(controller.applyLimit(10)).toBe(10);

    controller.raise("rate_limit"); // penalty = 1
    expect(controller.applyLimit(10)).toBe(5); // 10 / (1+1) = 5

    controller.raise("rate_limit"); // penalty = 2
    expect(controller.applyLimit(10)).toBe(3); // 10 / (2+1) = 3.33 -> 3
  });

  it("should return at least 1 from applyLimit", () => {
    const controller = createAdaptivePenaltyController({
      ...defaultOptions,
      maxPenalty: 100,
    });

    // Raise penalty to very high value
    for (let i = 0; i < 20; i++) {
      controller.raise("rate_limit");
    }

    expect(controller.applyLimit(10)).toBeGreaterThanOrEqual(1);
  });

  describe("stable mode", () => {
    it("should always return zero penalty in stable mode", () => {
      const controller = createAdaptivePenaltyController({
        ...defaultOptions,
        isStable: true,
      });

      controller.raise("rate_limit");
      controller.raise("rate_limit");
      controller.raise("rate_limit");

      expect(controller.get()).toBe(0);
    });

    it("should not modify penalty in stable mode", () => {
      const controller = createAdaptivePenaltyController({
        ...defaultOptions,
        isStable: true,
      });

      controller.raise("rate_limit");
      controller.lower();

      expect(controller.state.penalty).toBe(0);
    });

    it("should return base limit in stable mode", () => {
      const controller = createAdaptivePenaltyController({
        ...defaultOptions,
        isStable: true,
      });

      controller.raise("rate_limit");

      expect(controller.applyLimit(10)).toBe(10);
    });
  });
});

// ============================================================================
// Enhanced Controller Tests
// ============================================================================

describe("createEnhancedPenaltyController", () => {
  const defaultOptions: EnhancedPenaltyOptions = {
    isStable: false,
    maxPenalty: 10,
    decayMs: 1000,
  };

  it("should create controller with initial state", () => {
    const controller = createEnhancedPenaltyController(defaultOptions);

    expect(controller.state.penalty).toBe(0);
    expect(controller.state.reasonHistory).toEqual([]);
  });

  it("should return linear decay strategy by default", () => {
    const controller = createEnhancedPenaltyController(defaultOptions);

    expect(controller.getDecayStrategy()).toBe("linear");
  });

  it("should support custom decay strategy", () => {
    const controller = createEnhancedPenaltyController({
      ...defaultOptions,
      decayStrategy: "exponential",
    });

    expect(controller.getDecayStrategy()).toBe("exponential");
  });

  describe("raiseWithReason", () => {
    it("should increase penalty with reason weight", () => {
      const controller = createEnhancedPenaltyController(defaultOptions);

      controller.raiseWithReason("rate_limit");
      // Default weight for rate_limit is 2.0
      expect(controller.get()).toBeCloseTo(2.0, 1);
    });

    it("should record reason in history", () => {
      const controller = createEnhancedPenaltyController(defaultOptions);

      controller.raiseWithReason("timeout");
      controller.raiseWithReason("rate_limit");

      expect(controller.state.reasonHistory).toHaveLength(2);
      expect(controller.state.lastReason).toBe("rate_limit");
    });

    it("should support all penalty reasons", () => {
      const controller = createEnhancedPenaltyController(defaultOptions);

      const reasons: PenaltyReason[] = [
        "rate_limit",
        "timeout",
        "capacity",
        "schema_violation",
      ];

      reasons.forEach((reason) => {
        controller.raiseWithReason(reason);
      });

      expect(controller.state.reasonHistory).toHaveLength(4);
    });

    it("should apply custom reason weights", () => {
      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        reasonWeights: {
          rate_limit: 5.0, // Override default
        },
      });

      controller.raiseWithReason("rate_limit");

      expect(controller.get()).toBeCloseTo(5.0, 1);
    });
  });

  describe("getReasonStats", () => {
    it("should return zero stats initially", () => {
      const controller = createEnhancedPenaltyController(defaultOptions);

      const stats = controller.getReasonStats();

      expect(stats.rate_limit).toBe(0);
      expect(stats.timeout).toBe(0);
      expect(stats.capacity).toBe(0);
      expect(stats.schema_violation).toBe(0);
    });

    it("should count reasons correctly", () => {
      const controller = createEnhancedPenaltyController(defaultOptions);

      controller.raiseWithReason("timeout");
      controller.raiseWithReason("timeout");
      controller.raiseWithReason("rate_limit");

      const stats = controller.getReasonStats();

      expect(stats.timeout).toBe(2);
      expect(stats.rate_limit).toBe(1);
      expect(stats.capacity).toBe(0);
    });
  });

  describe("decay strategies", () => {
    it("should decay linearly by default", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        decayStrategy: "linear",
        decayMs: 1000,
      });

      controller.raiseWithReason("timeout");
      expect(controller.get()).toBe(1);

      vi.setSystemTime(now + 1000);
      expect(controller.get()).toBe(0);

      vi.useRealTimers();
    });

    it("should decay exponentially when configured", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        decayStrategy: "exponential",
        exponentialBase: 0.5,
        decayMs: 1000,
      });

      // Set high penalty
      for (let i = 0; i < 5; i++) {
        controller.raiseWithReason("timeout");
      }
      expect(controller.get()).toBe(5);

      // After 1 decay step: 5 * 0.5 = 2.5
      vi.setSystemTime(now + 1000);
      expect(controller.get()).toBeCloseTo(2.5, 1);

      // After 2 decay steps: 5 * 0.5^2 = 1.25
      vi.setSystemTime(now + 2000);
      expect(controller.get()).toBeCloseTo(1.25, 1);

      vi.useRealTimers();
    });

    it("should use hybrid decay when configured", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        decayStrategy: "hybrid",
        decayMs: 1000,
      });

      // High penalty (> 5) should use exponential
      for (let i = 0; i < 10; i++) {
        controller.raiseWithReason("timeout");
      }
      expect(controller.get()).toBe(10);

      // Hybrid: high penalty uses exponential (base 0.7)
      vi.setSystemTime(now + 1000);
      // 10 * 0.7 = 7
      expect(controller.get()).toBeCloseTo(7, 0);

      vi.useRealTimers();
    });
  });

  describe("history size limit", () => {
    it("should limit reason history size", () => {
      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        historySize: 5,
      });

      for (let i = 0; i < 10; i++) {
        controller.raiseWithReason("timeout");
      }

      expect(controller.state.reasonHistory.length).toBe(5);
    });

    it("should keep most recent entries", () => {
      const controller = createEnhancedPenaltyController({
        ...defaultOptions,
        historySize: 3,
      });

      controller.raiseWithReason("timeout");
      controller.raiseWithReason("rate_limit");
      controller.raiseWithReason("capacity");
      controller.raiseWithReason("timeout"); // This should push out first timeout

      const stats = controller.getReasonStats();
      expect(stats.timeout).toBe(1); // Only the most recent timeout
      expect(stats.rate_limit).toBe(1);
      expect(stats.capacity).toBe(1);
    });
  });
});

// ============================================================================
// Auto Controller Tests
// ============================================================================

describe("createAutoPenaltyController", () => {
  beforeEach(() => {
    resetAdaptivePenaltyModeCache();
  });

  afterEach(() => {
    resetAdaptivePenaltyModeCache();
  });

  it("should create enhanced controller by default", () => {
    delete process.env.PI_ADAPTIVE_PENALTY_MODE;
    resetAdaptivePenaltyModeCache();

    const controller = createAutoPenaltyController({
      isStable: false,
      maxPenalty: 10,
      decayMs: 1000,
    });

    // Enhanced controller has getDecayStrategy method
    expect(typeof (controller as EnhancedPenaltyController).getDecayStrategy).toBe("function");
  });

  it("should create legacy controller when mode is 'legacy'", () => {
    process.env.PI_ADAPTIVE_PENALTY_MODE = "legacy";
    resetAdaptivePenaltyModeCache();

    const controller = createAutoPenaltyController({
      isStable: false,
      maxPenalty: 10,
      decayMs: 1000,
    });

    // Legacy controller does not have getDecayStrategy method
    expect(typeof (controller as EnhancedPenaltyController).getDecayStrategy).toBe("undefined");
  });

  it("should return functional controller in both modes", () => {
    delete process.env.PI_ADAPTIVE_PENALTY_MODE;
    resetAdaptivePenaltyModeCache();

    const controller = createAutoPenaltyController({
      isStable: false,
      maxPenalty: 10,
      decayMs: 1000,
    });

    controller.raise("rate_limit");
    expect(controller.get()).toBeGreaterThan(0);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Adaptive Penalty Integration", () => {
  it("should handle realistic usage pattern", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const controller = createEnhancedPenaltyController({
      isStable: false,
      maxPenalty: 20,
      decayMs: 5000,
      decayStrategy: "linear",
    });

    // Initial state: no penalty
    expect(controller.applyLimit(10)).toBe(10);

    // Rate limit hit
    controller.raiseWithReason("rate_limit");
    // penalty = 2.0 (default weight)
    // 10 / (2+1) = 3.33 -> 3
    expect(controller.applyLimit(10)).toBe(3);

    // Another rate limit
    controller.raiseWithReason("rate_limit");
    // penalty = 4.0
    // 10 / (4+1) = 2
    expect(controller.applyLimit(10)).toBe(2);

    // Time passes, penalty decays
    vi.setSystemTime(now + 5000);
    // After 1 decay step: penalty = 4.0 - 1 = 3.0
    // 10 / (3+1) = 2.5 -> 2
    expect(controller.applyLimit(10)).toBe(2);

    // More time passes (10s more from last decay)
    vi.setSystemTime(now + 15000);
    // After 2 more decay steps from 3.0: penalty = max(0, 3.0 - 2) = 1.0
    // 10 / (1+1) = 5
    const penaltyAt15s = controller.get();
    expect(penaltyAt15s).toBeGreaterThanOrEqual(0);
    expect(penaltyAt15s).toBeLessThanOrEqual(2);
    expect(controller.applyLimit(10)).toBeGreaterThanOrEqual(3);

    // More time passes to fully decay
    vi.setSystemTime(now + 25000);
    // penalty should be 0 after enough decay
    const finalPenalty = controller.get();
    expect(finalPenalty).toBe(0);
    expect(controller.applyLimit(10)).toBe(10);

    vi.useRealTimers();
  });

  it("should handle stable mode for testing", () => {
    const controller = createAdaptivePenaltyController({
      isStable: true,
      maxPenalty: 10,
      decayMs: 1000,
    });

    // In stable mode, penalty should always be 0
    controller.raise("rate_limit");
    controller.raise("timeout");
    controller.raise("capacity");

    expect(controller.get()).toBe(0);
    expect(controller.applyLimit(100)).toBe(100);
  });
});
