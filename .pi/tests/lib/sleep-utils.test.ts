/**
 * @jest-environment node
 */
import { describe, it, expect, vi } from "vitest";
import { sleep } from "../../lib/sleep-utils.js";

describe("sleep", () => {
  it("should resolve immediately for ms <= 0", async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("should resolve immediately for negative ms", async () => {
    const start = Date.now();
    await sleep(-100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("should wait for approximately the specified time", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(100);
  });

  it("should return a Promise", () => {
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it("should resolve with undefined", async () => {
    const result = await sleep(1);
    expect(result).toBeUndefined();
  });

  it("should handle multiple concurrent sleeps", async () => {
    const start = Date.now();
    await Promise.all([sleep(30), sleep(30), sleep(30)]);
    const elapsed = Date.now() - start;
    // All should complete in ~30ms, not 90ms
    expect(elapsed).toBeLessThan(80);
  });
});
