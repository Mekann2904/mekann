/**
 * @jest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  retryWithBackoff,
  resolveRetryWithBackoffConfig,
  computeBackoffDelayMs,
  extractRetryStatusCode,
  isNetworkErrorRetryable,
  clearRateLimitState,
  getRateLimitGateSnapshot,
  RetryWithBackoffConfig,
  RetryJitterMode,
} from "../../lib/retry-with-backoff.js";

describe("resolveRetryWithBackoffConfig", () => {
  it("should return default config when no overrides", () => {
    const config = resolveRetryWithBackoffConfig();
    expect(config.maxRetries).toBe(0);
    expect(config.initialDelayMs).toBe(800);
    expect(config.maxDelayMs).toBe(4000);
    expect(config.multiplier).toBe(2);
    expect(config.jitter).toBe("none");
  });

  it("should merge overrides", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      maxRetries: 3,
      initialDelayMs: 1000,
    });
    expect(config.maxRetries).toBe(3);
    expect(config.initialDelayMs).toBe(1000);
    expect(config.maxDelayMs).toBe(4000);
  });

  it("should clamp maxDelayMs to initialDelayMs if smaller", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      initialDelayMs: 5000,
      maxDelayMs: 1000,
    });
    expect(config.maxDelayMs).toBe(5000);
  });

  it("should sanitize invalid jitter", () => {
    const config = resolveRetryWithBackoffConfig(undefined, {
      jitter: "invalid" as RetryJitterMode,
    });
    expect(config.jitter).toBe("none");
  });

  it("should clamp multiplier to valid range", () => {
    const config1 = resolveRetryWithBackoffConfig(undefined, {
      multiplier: 0.5,
    });
    expect(config1.multiplier).toBe(1);

    const config2 = resolveRetryWithBackoffConfig(undefined, {
      multiplier: 20,
    });
    expect(config2.multiplier).toBe(10);
  });
});

describe("computeBackoffDelayMs", () => {
  const baseConfig: RetryWithBackoffConfig = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    multiplier: 2,
    jitter: "none",
  };

  it("should compute exponential backoff", () => {
    expect(computeBackoffDelayMs(1, baseConfig)).toBe(100);
    expect(computeBackoffDelayMs(2, baseConfig)).toBe(200);
    expect(computeBackoffDelayMs(3, baseConfig)).toBe(400);
    expect(computeBackoffDelayMs(4, baseConfig)).toBe(800);
  });

  it("should cap at maxDelayMs", () => {
    const config = { ...baseConfig, maxDelayMs: 300 };
    expect(computeBackoffDelayMs(3, config)).toBe(300);
    expect(computeBackoffDelayMs(4, config)).toBe(300);
  });

  it("should handle attempt 0 as attempt 1", () => {
    expect(computeBackoffDelayMs(0, baseConfig)).toBe(100);
    expect(computeBackoffDelayMs(-1, baseConfig)).toBe(100);
  });

  describe("jitter modes", () => {
    it("should apply full jitter", () => {
      const config = { ...baseConfig, jitter: "full" as RetryJitterMode };
      const delays = new Set<number>();
      for (let i = 0; i < 100; i++) {
        delays.add(computeBackoffDelayMs(1, config));
      }
      // With full jitter, we should see variety
      expect(delays.size).toBeGreaterThan(1);
      // All values should be in range [1, 100]
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(100);
      }
    });

    it("should apply partial jitter", () => {
      const config = { ...baseConfig, jitter: "partial" as RetryJitterMode };
      const delays = new Set<number>();
      for (let i = 0; i < 100; i++) {
        delays.add(computeBackoffDelayMs(1, config));
      }
      // With partial jitter, we should see variety
      expect(delays.size).toBeGreaterThan(1);
      // All values should be in range [50, 100]
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(50);
        expect(d).toBeLessThanOrEqual(100);
      }
    });

    it("should not apply jitter when jitter is none", () => {
      const config = { ...baseConfig, jitter: "none" as RetryJitterMode };
      const delays = new Set<number>();
      for (let i = 0; i < 100; i++) {
        delays.add(computeBackoffDelayMs(1, config));
      }
      expect(delays.size).toBe(1);
      expect(delays.has(100)).toBe(true);
    });
  });
});

describe("extractRetryStatusCode", () => {
  it("should extract status from error object", () => {
    const error = { status: 429 };
    expect(extractRetryStatusCode(error)).toBe(429);
  });

  it("should extract statusCode from error object", () => {
    const error = { statusCode: 500 };
    expect(extractRetryStatusCode(error)).toBe(500);
  });

  it("should extract from error message", () => {
    expect(extractRetryStatusCode(new Error("Error 429"))).toBe(429);
    expect(extractRetryStatusCode(new Error("500 Internal Server Error"))).toBe(500);
    expect(extractRetryStatusCode(new Error("502 Bad Gateway"))).toBe(502);
  });

  it("should detect rate limit keywords", () => {
    expect(extractRetryStatusCode(new Error("Too many requests"))).toBe(429);
    expect(extractRetryStatusCode(new Error("Rate limit exceeded"))).toBe(429);
    expect(extractRetryStatusCode(new Error("Quota exceeded"))).toBe(429);
  });

  it("should detect network errors as 503", () => {
    expect(extractRetryStatusCode(new Error("ECONNRESET"))).toBe(503);
    expect(extractRetryStatusCode(new Error("ETIMEDOUT"))).toBe(503);
    expect(extractRetryStatusCode(new Error("Socket hang up"))).toBe(503);
    expect(extractRetryStatusCode(new Error("Network error"))).toBe(503);
  });

  it("should return undefined for non-retryable errors", () => {
    expect(extractRetryStatusCode(new Error("Not found"))).toBeUndefined();
    expect(extractRetryStatusCode(new Error("Bad request"))).toBeUndefined();
    expect(extractRetryStatusCode(null)).toBeUndefined();
    expect(extractRetryStatusCode(undefined)).toBeUndefined();
  });

  it("should handle objects with throwing toString", () => {
    const obj = {
      toString: () => {
        throw new Error("toString failed");
      },
    };
    expect(extractRetryStatusCode(obj)).toBeUndefined();
  });
});

describe("isNetworkErrorRetryable", () => {
  it("should return true for 429", () => {
    expect(isNetworkErrorRetryable(null, 429)).toBe(true);
  });

  it("should return true for 5xx errors", () => {
    expect(isNetworkErrorRetryable(null, 500)).toBe(true);
    expect(isNetworkErrorRetryable(null, 502)).toBe(true);
    expect(isNetworkErrorRetryable(null, 503)).toBe(true);
    expect(isNetworkErrorRetryable(null, 504)).toBe(true);
  });

  it("should return false for 4xx errors except 429", () => {
    expect(isNetworkErrorRetryable(null, 400)).toBe(false);
    expect(isNetworkErrorRetryable(null, 401)).toBe(false);
    expect(isNetworkErrorRetryable(null, 403)).toBe(false);
    expect(isNetworkErrorRetryable(null, 404)).toBe(false);
  });

  it("should detect retryable errors from message", () => {
    expect(isNetworkErrorRetryable(new Error("ECONNRESET"))).toBe(true);
    expect(isNetworkErrorRetryable(new Error("ETIMEDOUT"))).toBe(true);
    expect(isNetworkErrorRetryable(new Error("Network error"))).toBe(true);
  });
});

describe("retryWithBackoff", () => {
  beforeEach(() => {
    clearRateLimitState();
  });

  afterEach(() => {
    clearRateLimitState();
  });

  it("should return result on success", async () => {
    const result = await retryWithBackoff(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("should not retry when maxRetries is 0", async () => {
    let callCount = 0;
    
    await expect(
      retryWithBackoff(
        () => {
          callCount++;
          return Promise.reject(new Error("Failed"));
        },
        { overrides: { maxRetries: 0 } }
      )
    ).rejects.toThrow("Failed");

    expect(callCount).toBe(1);
  });

  it("should retry on retryable errors", async () => {
    let callCount = 0;
    
    const result = await retryWithBackoff(
      () => {
        callCount++;
        if (callCount < 3) {
          const error = new Error("ECONNRESET");
          return Promise.reject(error);
        }
        return Promise.resolve("success");
      },
      { overrides: { maxRetries: 3, initialDelayMs: 10 } }
    );

    expect(result).toBe("success");
    expect(callCount).toBe(3);
  });

  it("should not retry on non-retryable errors", async () => {
    let callCount = 0;
    
    await expect(
      retryWithBackoff(
        () => {
          callCount++;
          return Promise.reject(new Error("Not retryable"));
        },
        { overrides: { maxRetries: 3, initialDelayMs: 10 } }
      )
    ).rejects.toThrow("Not retryable");

    expect(callCount).toBe(1);
  });

  it("should throw after max retries exceeded", async () => {
    let callCount = 0;
    
    await expect(
      retryWithBackoff(
        () => {
          callCount++;
          const error = new Error("ECONNRESET");
          return Promise.reject(error);
        },
        { overrides: { maxRetries: 2, initialDelayMs: 10 } }
      )
    ).rejects.toThrow("ECONNRESET");

    expect(callCount).toBe(3); // Initial + 2 retries
  });

  it("should call onRetry callback", async () => {
    let callCount = 0;
    const onRetry = vi.fn();
    
    await retryWithBackoff(
      () => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error("ECONNRESET"));
        }
        return Promise.resolve("success");
      },
      {
        overrides: { maxRetries: 2, initialDelayMs: 10 },
        onRetry,
      }
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxRetries: 2,
        error: expect.any(Error),
      })
    );
  });

  it("should abort on AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      retryWithBackoff(
        () => Promise.resolve(42),
        { signal: controller.signal }
      )
    ).rejects.toThrow("abort");
  });

  it("should use custom shouldRetry function", async () => {
    let callCount = 0;
    
    await expect(
      retryWithBackoff(
        () => {
          callCount++;
          return Promise.reject(new Error("Custom error"));
        },
        {
          overrides: { maxRetries: 3, initialDelayMs: 10 },
          shouldRetry: (error) => error instanceof Error && error.message === "Custom error",
        }
      )
    ).rejects.toThrow("Custom error");

    expect(callCount).toBe(4); // Initial + 3 retries
  });
});

describe("getRateLimitGateSnapshot", () => {
  beforeEach(() => {
    clearRateLimitState();
  });

  afterEach(() => {
    clearRateLimitState();
  });

  it("should return zero wait for unknown key", async () => {
    const snapshot = await getRateLimitGateSnapshot("unknown-key");
    expect(snapshot.waitMs).toBe(0);
    expect(snapshot.hits).toBe(0);
  });

  it("should normalize key", async () => {
    const snapshot1 = await getRateLimitGateSnapshot("Test-Key");
    const snapshot2 = await getRateLimitGateSnapshot("test-key");
    expect(snapshot1.key).toBe("test-key");
    expect(snapshot2.key).toBe("test-key");
  });
});
