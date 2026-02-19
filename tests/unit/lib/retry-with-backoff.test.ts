/**
 * @file .pi/lib/retry-with-backoff.ts の単体テスト
 * @description リトライロジック、指数バックオフのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  resolveRetryWithBackoffConfig,
  extractRetryStatusCode,
  isRetryableError,
  computeBackoffDelayMs,
  retryWithBackoff,
  getRateLimitGateSnapshot,
  type RetryWithBackoffConfig,
  type RetryJitterMode,
} from "@lib/retry-with-backoff";

// ============================================================================
// resolveRetryWithBackoffConfig
// ============================================================================

describe("resolveRetryWithBackoffConfig", () => {
  describe("正常系", () => {
    it("should_return_default_config_when_no_overrides", () => {
      // Arrange - overridesなし

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, undefined);

      // Assert
      expect(config.maxRetries).toBeGreaterThanOrEqual(0);
      expect(config.initialDelayMs).toBeGreaterThan(0);
      expect(config.maxDelayMs).toBeGreaterThanOrEqual(config.initialDelayMs);
      expect(config.multiplier).toBeGreaterThanOrEqual(1);
    });

    it("should_apply_valid_overrides", () => {
      // Arrange
      const overrides = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
      };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(1000);
      expect(config.maxDelayMs).toBe(10000);
    });

    it("should_clamp_maxRetries_to_valid_range", () => {
      // Arrange
      const overrides = { maxRetries: 100 }; // 上限超過

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(config.maxRetries).toBeLessThanOrEqual(20);
    });

    it("should_clamp_negative_values", () => {
      // Arrange
      const overrides = {
        maxRetries: -5,
        initialDelayMs: -100,
      };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(config.maxRetries).toBeGreaterThanOrEqual(0);
      expect(config.initialDelayMs).toBeGreaterThanOrEqual(1);
    });
  });

  describe("境界値", () => {
    it("should_handle_zero_maxRetries", () => {
      // Arrange
      const overrides = { maxRetries: 0 };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(config.maxRetries).toBe(0);
    });

    it("should_handle_maximum_maxRetries", () => {
      // Arrange
      const overrides = { maxRetries: 20 };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(config.maxRetries).toBe(20);
    });

    it("should_adjust_maxDelayMs_when_smaller_than_initial", () => {
      // Arrange
      const overrides = {
        initialDelayMs: 5000,
        maxDelayMs: 1000, // initialより小さい
      };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - maxDelayMsはinitialDelayMs以上に調整される
      expect(config.maxDelayMs).toBeGreaterThanOrEqual(config.initialDelayMs);
    });
  });

  describe("jitterモード", () => {
    it("should_accept_valid_jitter_modes", () => {
      // Arrange
      const modes: RetryJitterMode[] = ["full", "partial", "none"];

      for (const mode of modes) {
        const overrides = { jitter: mode };

        // Act
        const config = resolveRetryWithBackoffConfig(undefined, overrides);

        // Assert
        expect(config.jitter).toBe(mode);
      }
    });

    it("should_ignore_invalid_jitter_mode", () => {
      // Arrange
      const overrides = { jitter: "invalid" as RetryJitterMode };

      // Act
      const config = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - 無効な値は無視されデフォルトが使用される
      expect(["full", "partial", "none"]).toContain(config.jitter);
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_always_return_valid_config", () => {
      fc.assert(
        fc.property(
          fc.record({
            maxRetries: fc.integer(),
            initialDelayMs: fc.integer(),
            maxDelayMs: fc.integer(),
            multiplier: fc.float(),
            jitter: fc.constantFrom("full", "partial", "none", "invalid"),
          }),
          (overrides) => {
            const config = resolveRetryWithBackoffConfig(undefined, overrides);

            // 不変条件の検証
            return (
              config.maxRetries >= 0 &&
              config.maxRetries <= 20 &&
              config.initialDelayMs >= 1 &&
              config.maxDelayMs >= config.initialDelayMs &&
              config.multiplier >= 1 &&
              config.multiplier <= 10
            );
          },
        ),
      );
    });
  });
});

// ============================================================================
// extractRetryStatusCode
// ============================================================================

describe("extractRetryStatusCode", () => {
  describe("正常系 - オブジェクトから抽出", () => {
    it("should_extract_status_from_error_object", () => {
      // Arrange
      const error = { status: 429 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });

    it("should_extract_statusCode_from_error_object", () => {
      // Arrange
      const error = { statusCode: 500 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(500);
    });

    it("should_prioritize_status_over_statusCode", () => {
      // Arrange
      const error = { status: 429, statusCode: 500 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });
  });

  describe("正常系 - メッセージから抽出", () => {
    it("should_extract_429_from_message", () => {
      // Arrange
      const error = new Error("Rate limit exceeded: 429 Too Many Requests");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });

    it("should_extract_500_from_message", () => {
      // Arrange
      const error = new Error("Internal Server Error 500");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(500);
    });

    it("should_extract_401_from_message", () => {
      // Arrange
      const error = new Error("Unauthorized (401)");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(401);
    });

    it("should_extract_403_from_message", () => {
      // Arrange
      const error = new Error("Forbidden: 403");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(403);
    });
  });

  describe("正常系 - レート制限キーワード", () => {
    it("should_return_429_for_rate_limit_message", () => {
      // Arrange
      const error = new Error("rate limit exceeded");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });

    it("should_return_429_for_too_many_requests_message", () => {
      // Arrange
      const error = new Error("Too Many Requests");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });

    it("should_return_429_for_quota_exceeded_message", () => {
      // Arrange
      const error = new Error("quota exceeded");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(429);
    });
  });

  describe("境界値", () => {
    it("should_return_undefined_for_no_match", () => {
      // Arrange
      const error = new Error("Generic error");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_return_undefined_for_null_error", () => {
      // Arrange
      const error = null;

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_return_undefined_for_undefined_error", () => {
      // Arrange
      const error = undefined;

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_not_extract_4xx_other_than_specific_codes", () => {
      // Arrange
      const error = new Error("Not Found 404");

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_return_valid_status_code_or_undefined", () => {
      fc.assert(
        fc.property(fc.anything(), (error) => {
          const result = extractRetryStatusCode(error);

          if (result === undefined) return true;
          if (result === 429 || result === 401 || result === 403) return true;
          if (result >= 500 && result <= 599) return true;
          return false;
        }),
      );
    });
  });
});

// ============================================================================
// isRetryableError
// ============================================================================

describe("isRetryableError", () => {
  describe("正常系 - retryable", () => {
    it("should_return_true_for_429", () => {
      // Arrange
      const error = { status: 429 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_true_for_500", () => {
      // Arrange
      const error = { status: 500 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_true_for_502", () => {
      // Arrange
      const error = { status: 502 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_true_for_503", () => {
      // Arrange
      const error = { status: 503 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(true);
    });

    it("should_return_true_for_504", () => {
      // Arrange
      const error = { status: 504 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("正常系 - not retryable", () => {
    it("should_return_false_for_400", () => {
      // Arrange
      const error = { status: 400 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_401", () => {
      // Arrange
      const error = { status: 401 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_403", () => {
      // Arrange
      const error = { status: 403 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_404", () => {
      // Arrange
      const error = { status: 404 };

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("境界値", () => {
    it("should_return_false_for_no_status_code", () => {
      // Arrange
      const error = new Error("No status");

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_use_explicit_status_code_over_extraction", () => {
      // Arrange
      const error = { message: "Error 429" };

      // Act
      const result = isRetryableError(error, 500);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_return_boolean_for_any_input", () => {
      fc.assert(
        fc.property(
          fc.anything(),
          fc.oneof(fc.constant(undefined), fc.integer({ min: 100, max: 599 })),
          (error, statusCode) => {
            const result = isRetryableError(error, statusCode);
            return typeof result === "boolean";
          },
        ),
      );
    });
  });
});

// ============================================================================
// computeBackoffDelayMs
// ============================================================================

describe("computeBackoffDelayMs", () => {
  describe("正常系", () => {
    it("should_compute_exponential_backoff", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none",
      };

      // Act & Assert
      expect(computeBackoffDelayMs(1, config)).toBe(1000); // 1000 * 2^0
      expect(computeBackoffDelayMs(2, config)).toBe(2000); // 1000 * 2^1
      expect(computeBackoffDelayMs(3, config)).toBe(4000); // 1000 * 2^2
      expect(computeBackoffDelayMs(4, config)).toBe(8000); // 1000 * 2^3
    });

    it("should_clamp_to_maxDelayMs", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 10,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
        jitter: "none",
      };

      // Act & Assert
      expect(computeBackoffDelayMs(10, config)).toBe(5000); // maxDelayMsに制限
    });

    it("should_handle_zero_attempt_as_one", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none",
      };

      // Act
      const result = computeBackoffDelayMs(0, config);

      // Assert - 0は1として処理される
      expect(result).toBe(1000);
    });
  });

  describe("jitterモード", () => {
    it("should_not_apply_jitter_when_none", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none",
      };

      // Act
      const result1 = computeBackoffDelayMs(1, config);
      const result2 = computeBackoffDelayMs(1, config);

      // Assert - deterministic
      expect(result1).toBe(result2);
    });

    it("should_apply_full_jitter", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "full",
      };

      // Act
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        results.add(computeBackoffDelayMs(1, config));
      }

      // Assert - 複数の異なる値が生成される
      expect(results.size).toBeGreaterThan(1);
      // すべての値は0からinitialDelayMsの範囲内
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(1000);
      }
    });

    it("should_apply_partial_jitter", () => {
      // Arrange
      const config: RetryWithBackoffConfig = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "partial",
      };

      // Act
      const results: number[] = [];
      for (let i = 0; i < 100; i++) {
        results.push(computeBackoffDelayMs(1, config));
      }

      // Assert - すべての値はinitialDelayMs/2からinitialDelayMsの範囲内
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(500); // 1000/2
        expect(r).toBeLessThanOrEqual(1000);
      }
    });
  });

  describe("プロパティベーステスト", () => {
    it("should_always_return_positive_delay", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.record({
            maxRetries: fc.integer({ min: 0, max: 20 }),
            initialDelayMs: fc.integer({ min: 1, max: 60000 }),
            maxDelayMs: fc.integer({ min: 1, max: 60000 }),
            multiplier: fc.double({ min: 1, max: 10, noNaN: true }),
            jitter: fc.constantFrom("full", "partial", "none") as fc.Arbitrary<RetryJitterMode>,
          }),
          (attempt, config) => {
            // maxDelayMs >= initialDelayMsを保証
            const safeConfig = {
              ...config,
              maxDelayMs: Math.max(config.maxDelayMs, config.initialDelayMs),
            };
            const result = computeBackoffDelayMs(attempt, safeConfig);
            return result > 0 && result <= safeConfig.maxDelayMs;
          },
        ),
      );
    });
  });
});

// ============================================================================
// getRateLimitGateSnapshot
// ============================================================================

describe("getRateLimitGateSnapshot", () => {
  describe("正常系", () => {
    it("should_return_snapshot_with_valid_key", () => {
      // Arrange
      const key = "test-key";

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot).toHaveProperty("key");
      expect(snapshot).toHaveProperty("waitMs");
      expect(snapshot).toHaveProperty("hits");
      expect(snapshot).toHaveProperty("untilMs");
    });

    it("should_return_zero_wait_for_new_key", () => {
      // Arrange
      const key = `new-key-${Date.now()}`;

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.waitMs).toBe(0);
    });

    it("should_normalize_key_to_lowercase", () => {
      // Arrange
      const key = "TEST-KEY";

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.key).toBe("test-key");
    });
  });

  describe("境界値", () => {
    it("should_handle_undefined_key", () => {
      // Arrange
      const key = undefined;

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.key).toBe("global");
    });

    it("should_handle_empty_string_key", () => {
      // Arrange
      const key = "";

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.key).toBe("global");
    });

    it("should_handle_whitespace_only_key", () => {
      // Arrange
      const key = "   ";

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.key).toBe("global");
    });
  });
});

// ============================================================================
// retryWithBackoff
// ============================================================================

describe("retryWithBackoff", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("正常系", () => {
    it("should_return_result_on_success", async () => {
      // Arrange
      const operation = vi.fn().mockResolvedValue("success");

      // Act
      const promise = retryWithBackoff(operation);
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should_retry_on_retryable_error", async () => {
      // Arrange
      const error500 = { status: 500 }; // Use 500 instead of 429 to avoid rate limit fast-fail
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue("success");

      const overrides = { maxRetries: 3, initialDelayMs: 100, jitter: "none" as const };

      // Act
      const promise = retryWithBackoff(operation, { overrides });
      // Attach catch handler immediately to prevent unhandled rejection
      const resultPromise = promise.catch((e) => { throw e; });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      // Assert
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should_not_retry_on_non_retryable_error", async () => {
      // Arrange
      const error400 = { status: 400 };
      const operation = vi.fn().mockRejectedValue(error400);

      const overrides = { maxRetries: 3 };

      // Act & Assert
      const promise = retryWithBackoff(operation, { overrides });
      // Attach catch handler immediately
      promise.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error400);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("リトライ制限", () => {
    it("should_throw_after_max_retries", async () => {
      // Arrange
      const error500 = { status: 500 }; // Use 500 instead of 429
      const operation = vi.fn().mockRejectedValue(error500);

      const overrides = { maxRetries: 2, initialDelayMs: 10, jitter: "none" as const };

      // Act & Assert
      const promise = retryWithBackoff(operation, { overrides });
      // Attach catch handler immediately
      promise.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toEqual(error500);
      expect(operation).toHaveBeenCalledTimes(3); // 初回 + 2回のリトライ
    });
  });

  describe("AbortSignal", () => {
    it("should_throw_on_abort_signal_during_backoff", async () => {
      // This test verifies that abort is detected during the backoff sleep.
      // With fake timers, we need to carefully sequence the operations.
      
      // Arrange
      const controller = new AbortController();
      const operation = vi
        .fn()
        .mockRejectedValueOnce({ status: 500 })  // First call fails, triggers retry
        .mockResolvedValue("success");           // Second call would succeed

      const overrides = { maxRetries: 5, initialDelayMs: 10000, jitter: "none" as const };

      // Act
      const promise = retryWithBackoff(operation, { overrides, signal: controller.signal });
      // Attach catch handler immediately to prevent unhandled rejection
      const errorPromise = promise.catch((e) => e);
      
      // Flush microtasks by advancing 0 time - this lets the function start and throw
      await vi.advanceTimersByTimeAsync(0);
      
      // Now the function is in sleepWithAbort(10000). Abort the signal.
      controller.abort();
      
      // Run remaining timers - but the abort should have already rejected
      await vi.runAllTimersAsync();

      // Assert - should reject due to abort
      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("retry aborted");
    });

    it("should_throw_immediately_if_already_aborted", async () => {
      // Arrange
      const controller = new AbortController();
      controller.abort();
      const operation = vi.fn().mockResolvedValue("success");

      // Act
      const promise = retryWithBackoff(operation, { signal: controller.signal });

      // Assert
      await expect(promise).rejects.toThrow("retry aborted");
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe("コールバック", () => {
    it("should_call_onRetry_on_each_retry", async () => {
      // Arrange
      const error500 = { status: 500 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValue("success");

      const onRetry = vi.fn();
      const overrides = { maxRetries: 5, initialDelayMs: 10, jitter: "none" as const };

      // Act
      const promise = retryWithBackoff(operation, { overrides, onRetry });
      await vi.runAllTimersAsync();
      await promise;

      // Assert
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });
});
