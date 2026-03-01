/**
 * @abdd.meta
 * @path .pi/tests/lib/boundary-enforcer.test.ts
 * @role Test suite for system boundary enforcement
 * @why Verify limit enforcement, violation tracking, and clamping
 * @related ../../lib/boundary-enforcer.ts
 * @public_api Tests for BoundaryEnforcer class and related functions
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BoundaryEnforcer,
  BoundaryViolationError,
  DEFAULT_BOUNDARY_LIMITS,
  getBoundaryEnforcer,
  resetBoundaryEnforcer,
  type BoundaryLimits,
} from "../../lib/boundary-enforcer";

describe("boundary-enforcer", () => {
  describe("DEFAULT_BOUNDARY_LIMITS", () => {
    it("DEFAULT_BOUNDARY_LIMITS_hasExpectedValues", () => {
      expect(DEFAULT_BOUNDARY_LIMITS.maxConcurrency).toBe(64);
      expect(DEFAULT_BOUNDARY_LIMITS.maxTimeout).toBe(600_000);
      expect(DEFAULT_BOUNDARY_LIMITS.maxRetries).toBe(10);
      expect(DEFAULT_BOUNDARY_LIMITS.maxRateLimitWait).toBe(120_000);
      expect(DEFAULT_BOUNDARY_LIMITS.maxQueueSize).toBe(10_000);
    });
  });

  describe("BoundaryViolationError", () => {
    it("BoundaryViolationError_createsErrorWithDetails", () => {
      const error = new BoundaryViolationError("concurrency", 100, 64);

      expect(error.name).toBe("BoundaryViolationError");
      expect(error.boundary).toBe("concurrency");
      expect(error.value).toBe(100);
      expect(error.limit).toBe(64);
      expect(error.message).toContain("concurrency");
      expect(error.message).toContain("100");
      expect(error.message).toContain("64");
    });

    it("BoundaryViolationError_usesCustomMessage", () => {
      const error = new BoundaryViolationError(
        "timeout",
        5000,
        3000,
        "Custom error message"
      );

      expect(error.message).toBe("Custom error message");
    });
  });

  describe("BoundaryEnforcer", () => {
    let enforcer: BoundaryEnforcer;

    beforeEach(() => {
      enforcer = new BoundaryEnforcer();
    });

    describe("constructor", () => {
      it("constructor_createsEnforcer_withDefaultLimits", () => {
        const limits = enforcer.getLimits();

        expect(limits).toEqual(DEFAULT_BOUNDARY_LIMITS);
      });

      it("constructor_createsEnforcer_withCustomLimits", () => {
        const customEnforcer = new BoundaryEnforcer({
          maxConcurrency: 32,
          maxTimeout: 300_000,
        });

        const limits = customEnforcer.getLimits();

        expect(limits.maxConcurrency).toBe(32);
        expect(limits.maxTimeout).toBe(300_000);
        expect(limits.maxRetries).toBe(DEFAULT_BOUNDARY_LIMITS.maxRetries);
      });
    });

    describe("getLimits", () => {
      it("getLimits_returnsCopyOfLimits", () => {
        const limits1 = enforcer.getLimits();
        const limits2 = enforcer.getLimits();

        expect(limits1).not.toBe(limits2);
        expect(limits1).toEqual(limits2);
      });
    });

    describe("enforceConcurrency", () => {
      it("enforceConcurrency_withinLimit_doesNotThrow", () => {
        expect(() => enforcer.enforceConcurrency(32)).not.toThrow();
        expect(() => enforcer.enforceConcurrency(64)).not.toThrow();
      });

      it("enforceConcurrency_exceedsLimit_throwsError", () => {
        expect(() => enforcer.enforceConcurrency(65)).toThrow(BoundaryViolationError);
        expect(() => enforcer.enforceConcurrency(100)).toThrow(BoundaryViolationError);
      });

      it("enforceConcurrency_recordsViolation", () => {
        try {
          enforcer.enforceConcurrency(100);
        } catch (e) {
          // Expected
        }

        const violations = enforcer.getViolations();
        expect(violations.length).toBe(1);
        expect(violations[0].boundary).toBe("concurrency");
        expect(violations[0].value).toBe(100);
      });
    });

    describe("enforceTimeout", () => {
      it("enforceTimeout_withinLimit_doesNotThrow", () => {
        expect(() => enforcer.enforceTimeout(300_000)).not.toThrow();
        expect(() => enforcer.enforceTimeout(600_000)).not.toThrow();
      });

      it("enforceTimeout_exceedsLimit_throwsError", () => {
        expect(() => enforcer.enforceTimeout(600_001)).toThrow(BoundaryViolationError);
        expect(() => enforcer.enforceTimeout(1_000_000)).toThrow(BoundaryViolationError);
      });

      it("enforceTimeout_recordsViolation", () => {
        try {
          enforcer.enforceTimeout(1_000_000);
        } catch (e) {
          // Expected
        }

        const violations = enforcer.getViolations();
        expect(violations.some((v) => v.boundary === "timeout")).toBe(true);
      });
    });

    describe("enforceRetries", () => {
      it("enforceRetries_withinLimit_doesNotThrow", () => {
        expect(() => enforcer.enforceRetries(5)).not.toThrow();
        expect(() => enforcer.enforceRetries(10)).not.toThrow();
      });

      it("enforceRetries_exceedsLimit_throwsError", () => {
        expect(() => enforcer.enforceRetries(11)).toThrow(BoundaryViolationError);
        expect(() => enforcer.enforceRetries(20)).toThrow(BoundaryViolationError);
      });

      it("enforceRetries_recordsViolation", () => {
        try {
          enforcer.enforceRetries(20);
        } catch (e) {
          // Expected
        }

        const violations = enforcer.getViolations();
        expect(violations.some((v) => v.boundary === "retries")).toBe(true);
      });
    });

    describe("enforceRateLimitWait", () => {
      it("enforceRateLimitWait_withinLimit_doesNotThrow", () => {
        expect(() => enforcer.enforceRateLimitWait(60_000)).not.toThrow();
        expect(() => enforcer.enforceRateLimitWait(120_000)).not.toThrow();
      });

      it("enforceRateLimitWait_exceedsLimit_throwsError", () => {
        expect(() => enforcer.enforceRateLimitWait(120_001)).toThrow(BoundaryViolationError);
        expect(() => enforcer.enforceRateLimitWait(300_000)).toThrow(BoundaryViolationError);
      });
    });

    describe("enforceQueueSize", () => {
      it("enforceQueueSize_withinLimit_doesNotThrow", () => {
        expect(() => enforcer.enforceQueueSize(5_000)).not.toThrow();
        expect(() => enforcer.enforceQueueSize(10_000)).not.toThrow();
      });

      it("enforceQueueSize_exceedsLimit_throwsError", () => {
        expect(() => enforcer.enforceQueueSize(10_001)).toThrow(BoundaryViolationError);
        expect(() => enforcer.enforceQueueSize(50_000)).toThrow(BoundaryViolationError);
      });
    });

    describe("clamp", () => {
      it("clamp_withinRange_returnsValue", () => {
        expect(enforcer.clamp(50, 0, 100)).toBe(50);
      });

      it("clamp_belowMin_returnsMin", () => {
        expect(enforcer.clamp(-10, 0, 100)).toBe(0);
      });

      it("clamp_aboveMax_returnsMax", () => {
        expect(enforcer.clamp(150, 0, 100)).toBe(100);
      });
    });

    describe("clampConcurrency", () => {
      it("clampConcurrency_withinRange_returnsValue", () => {
        expect(enforcer.clampConcurrency(32)).toBe(32);
      });

      it("clampConcurrency_belowMin_returnsMin", () => {
        expect(enforcer.clampConcurrency(0)).toBe(1);
        expect(enforcer.clampConcurrency(-5)).toBe(1);
      });

      it("clampConcurrency_aboveMax_returnsMax", () => {
        expect(enforcer.clampConcurrency(100)).toBe(64);
      });
    });

    describe("clampTimeout", () => {
      it("clampTimeout_withinRange_returnsValue", () => {
        expect(enforcer.clampTimeout(300_000)).toBe(300_000);
      });

      it("clampTimeout_belowMin_returnsMin", () => {
        expect(enforcer.clampTimeout(-100)).toBe(0);
      });

      it("clampTimeout_aboveMax_returnsMax", () => {
        expect(enforcer.clampTimeout(1_000_000)).toBe(600_000);
      });
    });

    describe("clampRetries", () => {
      it("clampRetries_withinRange_returnsValue", () => {
        expect(enforcer.clampRetries(5)).toBe(5);
      });

      it("clampRetries_belowMin_returnsMin", () => {
        expect(enforcer.clampRetries(-5)).toBe(0);
      });

      it("clampRetries_aboveMax_returnsMax", () => {
        expect(enforcer.clampRetries(20)).toBe(10);
      });
    });

    describe("getViolations", () => {
      it("getViolations_noViolations_returnsEmptyArray", () => {
        expect(enforcer.getViolations()).toEqual([]);
      });

      it("getViolations_returnsCopyOfViolations", () => {
        try {
          enforcer.enforceConcurrency(100);
        } catch (e) {
          // Expected
        }

        const violations1 = enforcer.getViolations();
        const violations2 = enforcer.getViolations();

        expect(violations1).not.toBe(violations2);
        expect(violations1).toEqual(violations2);
      });
    });

    describe("clearViolations", () => {
      it("clearViolations_removesAllViolations", () => {
        try {
          enforcer.enforceConcurrency(100);
        } catch (e) {
          // Expected
        }

        expect(enforcer.getViolations().length).toBe(1);

        enforcer.clearViolations();

        expect(enforcer.getViolations()).toEqual([]);
      });
    });

    describe("getViolationStats", () => {
      it("getViolationStats_noViolations_returnsEmptyMap", () => {
        const stats = enforcer.getViolationStats();

        expect(stats.size).toBe(0);
      });

      it("getViolationStats_countsViolationsByBoundary", () => {
        try {
          enforcer.enforceConcurrency(100);
        } catch (e) {
          // Expected
        }
        try {
          enforcer.enforceConcurrency(200);
        } catch (e) {
          // Expected
        }
        try {
          enforcer.enforceTimeout(1_000_000);
        } catch (e) {
          // Expected
        }

        const stats = enforcer.getViolationStats();

        expect(stats.get("concurrency")).toBe(2);
        expect(stats.get("timeout")).toBe(1);
      });
    });
  });

  describe("getBoundaryEnforcer", () => {
    beforeEach(() => {
      resetBoundaryEnforcer();
    });

    afterEach(() => {
      resetBoundaryEnforcer();
    });

    it("getBoundaryEnforcer_returnsSingleton", () => {
      const enforcer1 = getBoundaryEnforcer();
      const enforcer2 = getBoundaryEnforcer();

      expect(enforcer1).toBe(enforcer2);
    });

    it("getBoundaryEnforcer_usesCustomLimits", () => {
      resetBoundaryEnforcer();
      const enforcer = getBoundaryEnforcer({ maxConcurrency: 32 });

      expect(enforcer.getLimits().maxConcurrency).toBe(32);
    });
  });

  describe("resetBoundaryEnforcer", () => {
    it("resetBoundaryEnforcer_createsNewInstance", () => {
      const enforcer1 = getBoundaryEnforcer();
      resetBoundaryEnforcer();
      const enforcer2 = getBoundaryEnforcer();

      expect(enforcer1).not.toBe(enforcer2);
    });
  });

  describe("integration tests", () => {
    it("full boundary enforcement workflow", () => {
      const enforcer = new BoundaryEnforcer({
        maxConcurrency: 10,
        maxTimeout: 60_000,
        maxRetries: 3,
      });

      // Valid operations
      expect(() => enforcer.enforceConcurrency(5)).not.toThrow();
      expect(() => enforcer.enforceTimeout(30_000)).not.toThrow();
      expect(() => enforcer.enforceRetries(2)).not.toThrow();

      // Clamping
      expect(enforcer.clampConcurrency(20)).toBe(10);
      expect(enforcer.clampTimeout(120_000)).toBe(60_000);
      expect(enforcer.clampRetries(10)).toBe(3);

      // Violations
      try {
        enforcer.enforceConcurrency(20);
      } catch (e) {
        expect(e).toBeInstanceOf(BoundaryViolationError);
      }

      // Stats
      const stats = enforcer.getViolationStats();
      expect(stats.get("concurrency")).toBe(1);

      // Clear
      enforcer.clearViolations();
      expect(enforcer.getViolations()).toEqual([]);
    });

    it("multiple boundary types tracking", () => {
      const enforcer = new BoundaryEnforcer();

      // Trigger multiple violations
      const triggerViolations = () => {
        try {
          enforcer.enforceConcurrency(100);
        } catch (e) {
          // Expected
        }
        try {
          enforcer.enforceRetries(20);
        } catch (e) {
          // Expected
        }
        try {
          enforcer.enforceTimeout(1_000_000);
        } catch (e) {
          // Expected
        }
      };

      triggerViolations();

      const violations = enforcer.getViolations();
      expect(violations.length).toBe(3);

      const stats = enforcer.getViolationStats();
      expect(stats.size).toBe(3);
    });
  });
});
