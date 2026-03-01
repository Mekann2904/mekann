/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runWithConcurrencyLimit,
  ConcurrencyRunOptions,
  SettledResult,
} from "../../lib/concurrency.js";

describe("runWithConcurrencyLimit", () => {
  it("should return empty array for empty items", async () => {
    const results = await runWithConcurrencyLimit(
      [],
      2,
      async (item) => item
    );
    expect(results).toEqual([]);
  });

  it("should process all items", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await runWithConcurrencyLimit(
      items,
      2,
      async (item) => item * 2
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("should respect concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    await runWithConcurrencyLimit(items, 2, async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return item;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("should pass correct index to worker", async () => {
    const items = ["a", "b", "c"];
    const results = await runWithConcurrencyLimit(
      items,
      2,
      async (item, index) => ({ item, index })
    );
    expect(results).toEqual([
      { item: "a", index: 0 },
      { item: "b", index: 1 },
      { item: "c", index: 2 },
    ]);
  });

  it("should handle single item", async () => {
    const results = await runWithConcurrencyLimit(
      [42],
      2,
      async (item) => item * 2
    );
    expect(results).toEqual([84]);
  });

  it("should normalize limit greater than item count", async () => {
    const items = [1, 2];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    await runWithConcurrencyLimit(items, 10, async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return item;
    });

    expect(maxConcurrent).toBe(2);
  });

  it("should normalize limit to 1 for invalid values", async () => {
    const items = [1, 2, 3];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    await runWithConcurrencyLimit(items, 0, async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return item;
    });

    expect(maxConcurrent).toBe(1);
  });

  it("should normalize NaN limit to 1", async () => {
    const items = [1, 2, 3];
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    await runWithConcurrencyLimit(items, NaN, async (item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      currentConcurrent--;
      return item;
    });

    expect(maxConcurrent).toBe(1);
  });

  describe("abort handling", () => {
    it("should throw immediately if already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        runWithConcurrencyLimit(
          [1, 2, 3],
          2,
          async (item) => item,
          { signal: controller.signal }
        )
      ).rejects.toThrow("concurrency pool aborted");
    });

    it("should stop processing on abort", async () => {
      const controller = new AbortController();
      const processedItems: number[] = [];

      const promise = runWithConcurrencyLimit(
        [1, 2, 3, 4, 5],
        1,
        async (item) => {
          if (item === 2) {
            controller.abort();
          }
          processedItems.push(item);
          await new Promise((resolve) => setTimeout(resolve, 20));
          return item;
        },
        { signal: controller.signal }
      );

      await expect(promise).rejects.toThrow();
      expect(processedItems.length).toBeLessThan(5);
    });
  });

  describe("error handling", () => {
    it("should throw first error by default", async () => {
      const items = [1, 2, 3];
      
      await expect(
        runWithConcurrencyLimit(items, 2, async (item) => {
          if (item === 2) throw new Error("Item 2 failed");
          return item;
        })
      ).rejects.toThrow("Item 2 failed");
    });

    it("should not abort on error when abortOnError is false", async () => {
      const items = [1, 2, 3];
      const processedItems: number[] = [];

      await expect(
        runWithConcurrencyLimit(
          items,
          1,
          async (item) => {
            processedItems.push(item);
            if (item === 2) throw new Error("Item 2 failed");
            return item;
          },
          { abortOnError: false }
        )
      ).rejects.toThrow("Item 2 failed");
    });
  });

  describe("allSettled mode", () => {
    it("should return all results with status in allSettled mode", async () => {
      const items = [1, 2, 3];
      const results = await runWithConcurrencyLimit(
        items,
        2,
        async (item) => {
          if (item === 2) throw new Error("Item 2 failed");
          return item * 2;
        },
        { settleMode: "allSettled" }
      );

      expect(results).toEqual([
        { status: "fulfilled", value: 2, index: 0 },
        { status: "rejected", reason: expect.any(Error), index: 1 },
        { status: "fulfilled", value: 6, index: 2 },
      ]);
    });

    it("should return all fulfilled when no errors", async () => {
      const items = [1, 2, 3];
      const results = await runWithConcurrencyLimit(
        items,
        2,
        async (item) => item * 2,
        { settleMode: "allSettled" }
      );

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
      expect(results.map((r) => (r as { value: number }).value)).toEqual([2, 4, 6]);
    });

    it("should handle all failures", async () => {
      const items = [1, 2, 3];
      const results = await runWithConcurrencyLimit(
        items,
        2,
        async () => {
          throw new Error("All fail");
        },
        { settleMode: "allSettled" }
      );

      expect(results.every((r) => r.status === "rejected")).toBe(true);
    });
  });

  describe("priority scheduling", () => {
    it("should process items in priority order when enabled", async () => {
      const items = ["a", "b", "c"];
      const weights = new Map([
        ["a", 0.5],
        ["b", 1.5],
        ["c", 1.0],
      ]);
      const processedOrder: string[] = [];

      await runWithConcurrencyLimit(
        items,
        1,
        async (item) => {
          processedOrder.push(item);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return item;
        },
        {
          usePriorityScheduling: true,
          itemWeights: weights,
          getItemId: (item) => item,
        }
      );

      // b (1.5) should be first, then c (1.0), then a (0.5)
      expect(processedOrder).toEqual(["b", "c", "a"]);
    });

    it("should use original order when priority scheduling is disabled", async () => {
      const items = ["a", "b", "c"];
      const weights = new Map([
        ["a", 0.5],
        ["b", 1.5],
        ["c", 1.0],
      ]);
      const processedOrder: string[] = [];

      await runWithConcurrencyLimit(
        items,
        1,
        async (item) => {
          processedOrder.push(item);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return item;
        },
        {
          usePriorityScheduling: false,
          itemWeights: weights,
          getItemId: (item) => item,
        }
      );

      expect(processedOrder).toEqual(["a", "b", "c"]);
    });
  });

  describe("edge cases", () => {
    it("should handle large number of items", async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const results = await runWithConcurrencyLimit(
        items,
        10,
        async (item) => item * 2
      );
      expect(results).toHaveLength(100);
      expect(results[50]).toBe(100);
    });

    it("should preserve item order regardless of completion order", async () => {
      const items = [1, 2, 3];
      const delays = [30, 10, 20]; // Item 2 finishes first
      
      const results = await runWithConcurrencyLimit(items, 3, async (item, index) => {
        await new Promise((resolve) => setTimeout(resolve, delays[index]));
        return item;
      });

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
