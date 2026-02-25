/**
 * 並行性安全性テスト
 * デッドロック検証とAbortControllerの階層管理をテスト
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runWithConcurrencyLimit } from "../../lib/concurrency";
import { createChildAbortController, createChildAbortControllers } from "../../lib/abort-utils";

describe("Concurrency Safety Tests", () => {
  describe("runWithConcurrencyLimit", () => {
    it("should execute all items with correct results", async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await runWithConcurrencyLimit(
        items,
        2,
        async (item) => item * 2
      );
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it("should respect concurrency limit", async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      await runWithConcurrencyLimit(
        items,
        3,
        async (item) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await new Promise((resolve) => setTimeout(resolve, 10));
          currentConcurrent--;
          return item;
        }
      );

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it("should propagate abort signal correctly", async () => {
      const controller = new AbortController();
      const items = Array.from({ length: 10 }, (_, i) => i);

      const promise = runWithConcurrencyLimit(
        items,
        2,
        async (item, index, signal) => {
          if (index === 2) {
            controller.abort();
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
          return item;
        },
        { signal: controller.signal }
      );

      await expect(promise).rejects.toThrow();
    });

    it("should handle empty items array", async () => {
      const results = await runWithConcurrencyLimit(
        [],
        2,
        async (item) => item
      );
      expect(results).toEqual([]);
    });

    it("should throw first error when abortOnError is true", async () => {
      const items = [1, 2, 3, 4, 5];
      const promise = runWithConcurrencyLimit(
        items,
        2,
        async (item) => {
          if (item === 3) {
            throw new Error("Test error at 3");
          }
          return item;
        },
        { abortOnError: true }
      );

      await expect(promise).rejects.toThrow("Test error at 3");
    });
  });

  describe("createChildAbortController", () => {
    it("should create child controller linked to parent", () => {
      const parentController = new AbortController();
      const { controller: childController, cleanup } = createChildAbortController(
        parentController.signal
      );

      expect(childController.signal.aborted).toBe(false);

      parentController.abort();
      expect(childController.signal.aborted).toBe(true);

      cleanup();
    });

    it("should immediately abort if parent is already aborted", () => {
      const parentController = new AbortController();
      parentController.abort();

      const { controller: childController, cleanup } = createChildAbortController(
        parentController.signal
      );

      expect(childController.signal.aborted).toBe(true);

      cleanup();
    });

    it("should work without parent signal", () => {
      const { controller, cleanup } = createChildAbortController();

      expect(controller.signal.aborted).toBe(false);

      controller.abort();
      expect(controller.signal.aborted).toBe(true);

      cleanup();
    });
  });

  describe("createChildAbortControllers", () => {
    it("should create multiple child controllers", () => {
      const parentController = new AbortController();
      const { controllers, cleanup } = createChildAbortControllers(
        3,
        parentController.signal
      );

      expect(controllers).toHaveLength(3);
      expect(controllers.every((c) => !c.signal.aborted)).toBe(true);

      parentController.abort();
      expect(controllers.every((c) => c.signal.aborted)).toBe(true);

      cleanup();
    });
  });
});
