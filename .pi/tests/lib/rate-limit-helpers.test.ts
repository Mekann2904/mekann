/**
 * @abdd.meta
 * path: .pi/lib/__tests__/rate-limit-helpers.test.ts
 * role: レート制限関連ヘルパー関数のユニットテスト
 * why: 429エラー対応とリトライロジックの正確性を保証するため
 * related: .pi/lib/retry-with-backoff.ts, .pi/lib/adaptive-rate-controller.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等であり、外部依存を持たない
 * side_effects: なし
 * failure_modes: テスト失敗時は実装の不具合を示す
 * @abdd.explain
 * overview: retry-with-backoffとadaptive-rate-controllerのヘルパー関数をテストする
 * what_it_does:
 *   - extractRetryStatusCodeの各種ケースをテスト
 *   - isNetworkErrorRetryableの判定ロジックをテスト
 *   - computeBackoffDelayMsの計算ロジックをテスト
 * why_it_exists: レート制限対応の信頼性を確保するため
 * scope:
 *   in: テストケース定義
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  extractRetryStatusCode,
  isNetworkErrorRetryable,
  computeBackoffDelayMs,
  resolveRetryWithBackoffConfig,
  type RetryWithBackoffConfig,
} from "@lib/retry-with-backoff.js";

describe("extractRetryStatusCode", () => {
  it("should extract 429 from error object with status property", () => {
    const error = { status: 429, message: "Too Many Requests" };
    expect(extractRetryStatusCode(error)).toBe(429);
  });

  it("should extract 500 from error object with statusCode property", () => {
    const error = { statusCode: 500, message: "Internal Server Error" };
    expect(extractRetryStatusCode(error)).toBe(500);
  });

  it("should extract 429 from error message", () => {
    const error = new Error("Request failed with status 429");
    expect(extractRetryStatusCode(error)).toBe(429);
  });

  it("should extract 503 from rate limit message", () => {
    const error = new Error("Too many requests - rate limit exceeded");
    expect(extractRetryStatusCode(error)).toBe(429);
  });

  it("should extract 503 from network error message", () => {
    const error = new Error("ECONNRESET connection reset");
    expect(extractRetryStatusCode(error)).toBe(503);
  });

  it("should return undefined for non-retryable errors", () => {
    const error = { message: "Bad request" };
    expect(extractRetryStatusCode(error)).toBeUndefined();
  });

  it("should handle null/undefined gracefully", () => {
    expect(extractRetryStatusCode(null)).toBeUndefined();
    expect(extractRetryStatusCode(undefined)).toBeUndefined();
  });

  it("should handle non-object errors", () => {
    expect(extractRetryStatusCode("string error")).toBeUndefined();
  });

  it("should handle circular reference objects safely", () => {
    const error: Record<string, unknown> = { message: "error" };
    error.self = error;
    // Should not throw
    expect(() => extractRetryStatusCode(error)).not.toThrow();
  });
});

describe("isNetworkErrorRetryable", () => {
  it("should return true for 429 status code", () => {
    expect(isNetworkErrorRetryable(null, 429)).toBe(true);
  });

  it("should return true for 5xx status codes", () => {
    expect(isNetworkErrorRetryable(null, 500)).toBe(true);
    expect(isNetworkErrorRetryable(null, 502)).toBe(true);
    expect(isNetworkErrorRetryable(null, 503)).toBe(true);
    expect(isNetworkErrorRetryable(null, 504)).toBe(true);
  });

  it("should return false for 4xx status codes (except 429)", () => {
    expect(isNetworkErrorRetryable(null, 400)).toBe(false);
    expect(isNetworkErrorRetryable(null, 401)).toBe(false);
    expect(isNetworkErrorRetryable(null, 403)).toBe(false);
    expect(isNetworkErrorRetryable(null, 404)).toBe(false);
  });

  it("should return true for network error messages", () => {
    expect(isNetworkErrorRetryable(new Error("ECONNRESET"))).toBe(true);
    expect(isNetworkErrorRetryable(new Error("ETIMEDOUT"))).toBe(true);
    expect(isNetworkErrorRetryable(new Error("socket hang up"))).toBe(true);
    expect(isNetworkErrorRetryable(new Error("network error"))).toBe(true);
  });

  it("should return false for non-retryable errors", () => {
    expect(isNetworkErrorRetryable(new Error("Invalid input"))).toBe(false);
    expect(isNetworkErrorRetryable(null)).toBe(false);
  });
});

describe("computeBackoffDelayMs", () => {
  const defaultConfig: RetryWithBackoffConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    jitter: "none",
  };

  it("should compute exponential backoff correctly", () => {
    // attempt 1: 1000 * 2^0 = 1000
    expect(computeBackoffDelayMs(1, defaultConfig)).toBe(1000);
    // attempt 2: 1000 * 2^1 = 2000
    expect(computeBackoffDelayMs(2, defaultConfig)).toBe(2000);
    // attempt 3: 1000 * 2^2 = 4000
    expect(computeBackoffDelayMs(3, defaultConfig)).toBe(4000);
    // attempt 4: 1000 * 2^3 = 8000
    expect(computeBackoffDelayMs(4, defaultConfig)).toBe(8000);
  });

  it("should cap at maxDelayMs", () => {
    const config = { ...defaultConfig, maxDelayMs: 5000 };
    // attempt 10: 1000 * 2^9 = 512000, but capped at 5000
    expect(computeBackoffDelayMs(10, config)).toBe(5000);
  });

  it("should handle attempt 0 gracefully", () => {
    // attempt 0 is treated as 1
    expect(computeBackoffDelayMs(0, defaultConfig)).toBe(1000);
  });

  it("should handle negative attempts gracefully", () => {
    // negative attempts are treated as 1
    expect(computeBackoffDelayMs(-1, defaultConfig)).toBe(1000);
  });

  it("should apply jitter when configured", () => {
    const configWithJitter = { ...defaultConfig, jitter: "full" as const };
    const delays = new Set<number>();
    
    // Run multiple times to check for jitter variation
    for (let i = 0; i < 100; i++) {
      delays.add(computeBackoffDelayMs(1, configWithJitter));
    }
    
    // With full jitter, we should see variation
    expect(delays.size).toBeGreaterThan(1);
    // All values should be positive and <= initialDelayMs + 1
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1);
      expect(delay).toBeLessThanOrEqual(1001);
    }
  });
});

describe("resolveRetryWithBackoffConfig", () => {
  it("should return default config when no overrides", () => {
    const config = resolveRetryWithBackoffConfig();
    expect(config.maxRetries).toBeDefined();
    expect(config.initialDelayMs).toBeDefined();
    expect(config.maxDelayMs).toBeDefined();
    expect(config.multiplier).toBeDefined();
    expect(config.jitter).toBeDefined();
  });

  it("should apply valid overrides", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      maxRetries: 5,
      initialDelayMs: 2000,
    });
    expect(config.maxRetries).toBe(5);
    expect(config.initialDelayMs).toBe(2000);
  });

  it("should clamp invalid overrides", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      maxRetries: 100, // Should be clamped
      initialDelayMs: -100, // Should be clamped
    });
    expect(config.maxRetries).toBeLessThanOrEqual(20);
    expect(config.initialDelayMs).toBeGreaterThanOrEqual(1);
  });

  it("should ensure maxDelayMs >= initialDelayMs", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      initialDelayMs: 10000,
      maxDelayMs: 1000, // Invalid: less than initial
    });
    // Should be adjusted
    expect(config.maxDelayMs).toBeGreaterThanOrEqual(config.initialDelayMs);
  });
});
