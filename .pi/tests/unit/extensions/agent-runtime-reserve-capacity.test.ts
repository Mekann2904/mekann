/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * reserveRuntimeCapacityのエラーハンドリングテスト
 * AbortSignalによる意図的なキャンセルと予期せぬシステムエラーを区別する
 */
describe("reserveRuntimeCapacity error handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return aborted:true for AbortSignal cancellation", async () => {
    const { reserveRuntimeCapacity } = await import(
      "../../../extensions/agent-runtime.js"
    );

    const controller = new AbortController();
    // 即座にアボート
    controller.abort();

    const result = await reserveRuntimeCapacity({
      maxWaitMs: 1000,
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should return valid result structure for successful capacity check", async () => {
    const { reserveRuntimeCapacity } = await import(
      "../../../extensions/agent-runtime.js"
    );

    // キャパシティが利用可能な場合のテスト（maxWaitMs=0で即時チェック）
    const result = await reserveRuntimeCapacity({
      maxWaitMs: 0,
    });

    // 結果構造が正しいことを確認
    expect(result).toHaveProperty("aborted");
    expect(result).toHaveProperty("waitedMs");
    expect(result).toHaveProperty("attempts");
    expect(result).toHaveProperty("timedOut");
    expect(result).toHaveProperty("allowed");
    // errorフィールドはオプショナル（エラー時のみ設定）
    // 正常時はerrorが未定義
  });

  it("RuntimeCapacityReserveResult should support optional error field", async () => {
    // 型が正しくインポートできることを確認
    const result: import("../../../lib/runtime-types.js").RuntimeCapacityReserveResult =
      {
        allowed: true,
        reason: "test",
        waitedMs: 0,
        attempts: 0,
        timedOut: false,
        aborted: false,
        error: "test error",
      };

    expect(result.error).toBe("test error");
    expect(result.aborted).toBe(false);
  });
});
