/**
 * @abdd.meta
 * path: tests/helpers/custom-matchers.ts
 * role: Custom Vitest matchers for domain-specific assertions
 * why: Eliminate 40+ duplicate assertion patterns across test files
 * related: tests/setup-vitest.ts, vitest.config.ts
 * public_api: toHaveRequiredProperties, toCompleteWithin, toBeValidUuid, toBeSorted
 * invariants: All matchers return { pass, message } structure
 * side_effects: None (pure assertion functions)
 * failure_modes: Invalid input types may cause runtime errors
 * @abdd.explain
 * overview: Provides custom assertion matchers for Vitest tests
 * what_it_does: Extends expect() with domain-specific property checks
 * why_it_exists: DRY principle - centralize common assertion patterns
 * scope:
 *   in: Object validation, async timing, UUID format, array sorting
 *   out: Complex domain logic, external state
 */

import { expect } from "vitest";

/**
 * Custom matcher definitions
 */
expect.extend({
  /**
   * Validates that an object has all required properties
   * @param received - Object to validate
   * @param required - Array of required property names
   */
  toHaveRequiredProperties(
    received: unknown,
    required: string[]
  ): { pass: boolean; message: () => string } {
    const missing = required.filter((prop) => !(prop in (received as object)));

    return {
      pass: missing.length === 0,
      message: () =>
        missing.length === 0
          ? `expected object not to have properties: ${required.join(", ")}`
          : `expected object to have properties: ${missing.join(", ")}`,
    };
  },

  /**
   * Validates that an async function completes within specified time
   * @param received - Async function to execute
   * @param ms - Maximum allowed duration in milliseconds
   */
  async toCompleteWithin(
    received: () => Promise<unknown>,
    ms: number
  ): Promise<{ pass: boolean; message: () => string }> {
    const start = Date.now();
    try {
      await received();
      const duration = Date.now() - start;
      return {
        pass: duration <= ms,
        message: () =>
          `expected function to complete within ${ms}ms, but took ${duration}ms`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () =>
          `expected function to complete within ${ms}ms, but threw: ${error}`,
      };
    }
  },

  /**
   * Validates that a string is a valid UUID format
   * @param received - String to validate
   */
  toBeValidUuid(received: string): { pass: boolean; message: () => string } {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return {
      pass: uuidRegex.test(received),
      message: () => `expected ${received} to be a valid UUID`,
    };
  },

  /**
   * Validates that an array is sorted
   * @param received - Array to validate
   * @param options - Sorting options (descending: boolean)
   */
  toBeSorted(
    received: unknown,
    options: { descending?: boolean } = {}
  ): { pass: boolean; message: () => string } {
    const { descending = false } = options;

    if (!Array.isArray(received)) {
      return {
        pass: false,
        message: () => `expected ${received} to be an array`,
      };
    }

    if (received.length <= 1) {
      return {
        pass: true,
        message: () => "array with 0 or 1 elements is always sorted",
      };
    }

    let isSorted = true;
    const arr = received as unknown[];

    for (let i = 1; i < arr.length; i++) {
      if (descending) {
        if (arr[i] > arr[i - 1]) {
          isSorted = false;
          break;
        }
      } else {
        if (arr[i] < arr[i - 1]) {
          isSorted = false;
          break;
        }
      }
    }

    return {
      pass: isSorted,
      message: () =>
        `expected array to be sorted ${descending ? "descending" : "ascending"}`,
    };
  },
});

/**
 * TypeScript type declarations for custom matchers
 */
declare module "vitest" {
  interface Assertion {
    /**
     * Asserts that the object has all specified required properties
     */
    toHaveRequiredProperties(required: string[]): void;
    /**
     * Asserts that the async function completes within specified milliseconds
     */
    toCompleteWithin(ms: number): Promise<void>;
    /**
     * Asserts that the string is a valid UUID v4 format
     */
    toBeValidUuid(): void;
    /**
     * Asserts that the array is sorted (ascending by default)
     */
    toBeSorted(options?: { descending?: boolean }): void;
  }
}
