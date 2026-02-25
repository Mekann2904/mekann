/**
 * Safety Property Tests - Idempotency Verification
 *
 * Phase 3.2: Safety Property - Idempotency
 *
 * This test suite verifies that extension operations are idempotent,
 * meaning they produce the same result when called multiple times.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * 深い等価性をチェック
 * @summary 深い等価性チェック
 * @param a - 比較対象1
 * @param b - 比較対象2
 * @returns 等しい場合true
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

/**
 * 関数のべき等性を検証
 * @summary べき等性検証
 * @param fn - 検証対象の関数
 * @param times - 実行回数
 * @returns 検証結果
 */
export async function verifyIdempotency<T>(
  fn: () => Promise<T>,
  times: number = 3
): Promise<{ idempotent: boolean; results: T[]; error?: string }> {
  const results: T[] = [];

  for (let i = 0; i < times; i++) {
    try {
      results.push(await fn());
    } catch (error) {
      return {
        idempotent: false,
        results,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // すべての結果が最初の結果と等しいかチェック
  const firstResult = results[0];
  const idempotent = results.every(r => deepEqual(r, firstResult));

  return { idempotent, results };
}

/**
 * 同期関数のべき等性を検証
 * @summary 同期関数べき等性検証
 * @param fn - 検証対象の関数
 * @param times - 実行回数
 * @returns 検証結果
 */
export function verifyIdempotencySync<T>(
  fn: () => T,
  times: number = 3
): { idempotent: boolean; results: T[]; error?: string } {
  const results: T[] = [];

  for (let i = 0; i < times; i++) {
    try {
      results.push(fn());
    } catch (error) {
      return {
        idempotent: false,
        results,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  const firstResult = results[0];
  const idempotent = results.every(r => deepEqual(r, firstResult));

  return { idempotent, results };
}

// ============================================================================
// Test Suite: Core Idempotency Tests
// ============================================================================

describe("Idempotency Verification Utilities", () => {
  describe("verifyIdempotency", () => {
    it("should return idempotent=true for pure functions", async () => {
      const fn = async () => ({ value: 42 });
      const result = await verifyIdempotency(fn, 3);

      expect(result.idempotent).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it("should return idempotent=true for deterministic functions", async () => {
      let counter = 0;
      const fn = async () => {
        counter++;
        return { call: counter, fixed: "value" };
      };

      // 呼び出しごとに結果が異なるのでべき等ではない
      const result = await verifyIdempotency(fn, 3);
      expect(result.idempotent).toBe(false);
    });

    it("should handle errors gracefully", async () => {
      const fn = async () => {
        throw new Error("Test error");
      };

      const result = await verifyIdempotency(fn, 3);

      expect(result.idempotent).toBe(false);
      expect(result.error).toBe("Test error");
    });
  });

  describe("verifyIdempotencySync", () => {
    it("should return idempotent=true for pure sync functions", () => {
      const fn = () => ({ value: "constant" });
      const result = verifyIdempotencySync(fn, 3);

      expect(result.idempotent).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it("should handle sync errors", () => {
      const fn = () => {
        throw new Error("Sync error");
      };

      const result = verifyIdempotencySync(fn, 3);

      expect(result.idempotent).toBe(false);
      expect(result.error).toBe("Sync error");
    });
  });
});

// ============================================================================
// Test Suite: Resource Tracker Idempotency
// ============================================================================

describe("ResourceTracker Idempotency", () => {
  beforeEach(async () => {
    const { ResourceTracker } = await import("../../lib/resource-tracker.js");
    ResourceTracker.getInstance().clear();
  });

  afterEach(async () => {
    const { ResourceTracker } = await import("../../lib/resource-tracker.js");
    ResourceTracker.getInstance().clear();
  });

  it("should report consistent leak counts after clear", async () => {
    const { ResourceTracker } = await import("../../lib/resource-tracker.js");
    const tracker = ResourceTracker.getInstance();

    const fn = async () => {
      tracker.clear();
      return tracker.getLeakCount();
    };

    const result = await verifyIdempotency(fn, 5);
    expect(result.idempotent).toBe(true);
    expect(result.results[0]).toBe(0);
  });

  it("should report consistent leak summaries", async () => {
    const { ResourceTracker } = await import("../../lib/resource-tracker.js");
    const tracker = ResourceTracker.getInstance();

    const fn = async () => {
      tracker.clear();
      return tracker.getLeakSummary();
    };

    const result = await verifyIdempotency(fn, 3);
    expect(result.idempotent).toBe(true);
    expect(result.results[0]).toBe("No resource leaks detected.");
  });
});

// ============================================================================
// Test Suite: Schema Validator Idempotency
// ============================================================================

describe("SchemaValidator Idempotency", () => {
  it("should produce consistent validation results", async () => {
    const { validateToolInput } = await import("../../lib/schema-validator.js");

    const tool = {
      name: "test-tool",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number" }
        },
        required: ["value"]
      }
    };

    const input = { value: 42 };

    const fn = async () => validateToolInput(tool, input);
    const result = await verifyIdempotency(fn, 5);

    expect(result.idempotent).toBe(true);
    expect(result.results[0].valid).toBe(true);
  });

  it("should produce consistent error messages for invalid input", async () => {
    const { validateToolInput } = await import("../../lib/schema-validator.js");

    const tool = {
      name: "test-tool",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number" }
        },
        required: ["value"]
      }
    };

    const input = { value: "not-a-number" };

    const fn = async () => validateToolInput(tool, input);
    const result = await verifyIdempotency(fn, 3);

    expect(result.idempotent).toBe(true);
    expect(result.results[0].valid).toBe(false);
    expect(result.results[0].errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test Suite: Boundary Enforcer Idempotency
// ============================================================================

describe("BoundaryEnforcer Idempotency", () => {
  it("should produce consistent clamp results", async () => {
    const { BoundaryEnforcer } = await import("../../lib/boundary-enforcer.js");
    const enforcer = new BoundaryEnforcer({ maxConcurrency: 10 });

    const fn = () => enforcer.clampConcurrency(15);
    const result = verifyIdempotencySync(fn, 5);

    expect(result.idempotent).toBe(true);
    expect(result.results[0]).toBe(10);
  });

  it("should produce consistent limit values", async () => {
    const { BoundaryEnforcer } = await import("../../lib/boundary-enforcer.js");
    const enforcer = new BoundaryEnforcer({
      maxConcurrency: 5,
      maxTimeout: 10000,
      maxRetries: 3
    });

    const fn = () => enforcer.getLimits();
    const result = verifyIdempotencySync(fn, 3);

    expect(result.idempotent).toBe(true);
    expect(result.results[0].maxConcurrency).toBe(5);
    expect(result.results[0].maxTimeout).toBe(10000);
    expect(result.results[0].maxRetries).toBe(3);
  });
});

// ============================================================================
// Test Suite: Output Validation Idempotency
// ============================================================================

describe("OutputValidation Idempotency", () => {
  it("should produce consistent validation results", async () => {
    const { validateSubagentOutput } = await import("../../lib/output-validation.js");

    const output = `SUMMARY: Test summary
CLAIM: Test claim
EVIDENCE: file.ts:10
CONFIDENCE: 0.8
RESULT: Test result
NEXT_STEP: none`;

    const fn = async () => validateSubagentOutput(output);
    const result = await verifyIdempotency(fn, 5);

    expect(result.idempotent).toBe(true);
    expect(result.results[0].ok).toBe(true);
  });

  it("should produce consistent failure reasons", async () => {
    const { validateSubagentOutput } = await import("../../lib/output-validation.js");

    const output = "Too short";

    const fn = async () => validateSubagentOutput(output);
    const result = await verifyIdempotency(fn, 3);

    expect(result.idempotent).toBe(true);
    expect(result.results[0].ok).toBe(false);
    expect(result.results[0].reason).toContain("too short");
  });
});
