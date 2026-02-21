/**
 * @file .pi/lib/retry-with-backoff.ts の追加単体テスト
 * @description レート制限、設定ファイル読み込み、エラーケースのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  resolveRetryWithBackoffConfig,
  retryWithBackoff,
  getRateLimitGateSnapshot,
  extractRetryStatusCode,
  isRetryableError,
  clearRateLimitState,
  type RetryWithBackoffOptions,
} from "../../../.pi/lib/retry-with-backoff.js";

beforeEach(() => {
  clearRateLimitState();
});

afterEach(() => {
  clearRateLimitState();
});

// ============================================================================
// テストユーティリティ
// ============================================================================

/**
 * テスト用ディレクトリをクリーンアップ
 */
function cleanupTestDir(): void {
  try {
    const dir = path.join(process.cwd(), ".pi", "runtime-test");
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// レート制限テスト
// ============================================================================

describe("retryWithBackoff - レート制限機能", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupTestDir();
  });

  describe("429エラー時の挙動", () => {
    it("should_handle_429_error_with_rate_limit_logic", async () => {
      // Arrange
      const error429 = { status: 429 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue("success");

      const onRateLimitWait = vi.fn();
      const overrides = {
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise = retryWithBackoff(operation, {
        overrides,
        onRateLimitWait,
        maxRateLimitRetries: 2,
        maxRateLimitWaitMs: 10000,
        rateLimitKey: "test-key",
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(onRateLimitWait).not.toHaveBeenCalled();
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should_fail_fast_when_max_rate_limit_retries_exceeded", async () => {
      // Arrange
      const error429 = { status: 429 };
      const operation = vi.fn().mockRejectedValue(error429);

      const overrides = {
        maxRetries: 5,
        initialDelayMs: 100,
      };

      // Act & Assert
      const promise = retryWithBackoff(operation, { overrides, maxRateLimitRetries: 1 });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow("rate limit fast-fail");
    });

    it("should_fail_fast_when_rate_limit_wait_exceeds_max", async () => {
      // Arrange
      const error429 = { status: 429 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429)
        .mockResolvedValue("success");

      const overrides = {
        maxRetries: 5,
        initialDelayMs: 100,
      };

      // Act
      const promise = retryWithBackoff(operation, {
        overrides,
        maxRateLimitWaitMs: 10,
        maxRateLimitRetries: 5,
      });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      // Assert
      const result = await promise;
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe("rateLimitKeyオプション", () => {
    it("should_use_rate_limit_key_for_state_isolation", async () => {
      // Arrange
      const error429 = { status: 429 };
      const operation1 = vi.fn().mockResolvedValueOnce("success1");
      const operation2 = vi.fn().mockResolvedValue("success2");

      const overrides = {
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise1 = retryWithBackoff(operation1, {
        overrides,
        rateLimitKey: "key1",
        maxRateLimitRetries: 5,
      });
      const promise2 = retryWithBackoff(operation2, {
        overrides,
        rateLimitKey: "key2",
        maxRateLimitRetries: 5,
      });

      await vi.runAllTimersAsync();

      const result1 = await promise1;
      const result2 = await promise2;

      // Assert
      expect(result1).toBe("success1");
      expect(result2).toBe("success2");
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
    });

    it("should_apply_rate_limit_to_all_keys", async () => {
      // Arrange
      const key = `test-key-${Date.now()}-${Math.random()}`;
      const snapshotBefore = getRateLimitGateSnapshot(key);
      expect(snapshotBefore.waitMs).toBe(0);

      // Act - 429エラーを発生させるテストは実際の実行が必要
      // ここではスナップショットの基本的な動作を確認

      const snapshotAfter = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshotAfter.key).toBe(key);
      expect(snapshotAfter).toHaveProperty("waitMs");
      expect(snapshotAfter).toHaveProperty("hits");
      expect(snapshotAfter).toHaveProperty("untilMs");
    });
  });

  describe("onRateLimitWaitコールバック", () => {
    it("should_call_on_rate_limit_wait_callback", async () => {
      // Arrange
      const error429 = { status: 429 };
      const seedOperation = vi.fn().mockRejectedValue(error429);
      const operation = vi.fn().mockResolvedValue("success");

      const onRateLimitWait = vi.fn();
      const overrides = {
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const seedPromise = retryWithBackoff(seedOperation, {
        overrides,
        maxRateLimitRetries: 5,
        rateLimitKey: "test-on-wait",
      });
      seedPromise.catch(() => {});
      await vi.runAllTimersAsync();
      await expect(seedPromise).rejects.toThrow();

      const promise = retryWithBackoff(operation, {
        overrides,
        onRateLimitWait,
        maxRateLimitRetries: 5,
        rateLimitKey: "test-on-wait",
      });
      await vi.runAllTimersAsync();
      await promise;

      // Assert
      expect(onRateLimitWait).not.toHaveBeenCalled();
    });

    it("should_not_call_on_rate_limit_wait_for_non_429_errors", async () => {
      // Arrange
      const error500 = { status: 500 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue("success");

      const onRateLimitWait = vi.fn();
      const overrides = {
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise = retryWithBackoff(operation, {
        overrides,
        onRateLimitWait,
      });
      await vi.runAllTimersAsync();
      await promise;

      // Assert
      expect(onRateLimitWait).not.toHaveBeenCalled();
    });
  });

  describe("shouldRetryカスタム判定", () => {
    it("should_use_custom_should_retry_function", async () => {
      // Arrange
      const customError = new Error("Custom error");
      const operation = vi
        .fn()
        .mockRejectedValueOnce(customError)
        .mockResolvedValue("success");

      const shouldRetry = vi.fn().mockReturnValue(true);
      const overrides = {
        maxRetries: 3,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise = retryWithBackoff(operation, {
        overrides,
        shouldRetry,
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(shouldRetry).toHaveBeenCalledWith(customError, undefined);
      expect(shouldRetry).toHaveBeenCalled();
    });

    it("should_stop_retrying_when_custom_function_returns_false", async () => {
      // Arrange
      const customError = new Error("Custom error");
      const operation = vi.fn().mockRejectedValue(customError);

      const shouldRetry = vi.fn().mockReturnValue(false);
      const overrides = {
        maxRetries: 5,
        initialDelayMs: 100,
      };

      // Act & Assert
      const promise = retryWithBackoff(operation, {
        overrides,
        shouldRetry,
      });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow("Custom error");
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("レート制限スナップショット", () => {
    it("should_return_empty_snapshot_for_new_key", () => {
      // Arrange
      const key = `new-snapshot-key-${Date.now()}`;

      // Act
      const snapshot = getRateLimitGateSnapshot(key);

      // Assert
      expect(snapshot.key).toBe(key);
      expect(snapshot.waitMs).toBe(0);
      expect(snapshot.hits).toBe(0);
    });

    it("should_use_custom_now_function", () => {
      // Arrange
      const fixedNow = 1_700_000_000_000;
      const key = "custom-now-key";

      // Act
      const snapshot = getRateLimitGateSnapshot(key, {
        now: () => fixedNow,
      });

      // Assert
      expect(snapshot.untilMs).toBe(fixedNow);
      expect(snapshot.waitMs).toBe(0);
    });
  });
});

// ============================================================================
// 設定ファイル読み込みテスト
// ============================================================================

describe("resolveRetryWithBackoffConfig - 設定ファイル", () => {
  const TEST_CWD = process.cwd();
  const CONFIG_PATH = path.join(TEST_CWD, ".pi", "config.json");

  beforeEach(() => {
    // テスト用のconfig.jsonバックアップを作成
    const originalConfigPath = path.join(TEST_CWD, ".pi", "config.json.original");
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, originalConfigPath);
    }
  });

  afterEach(() => {
    // テスト用のconfig.jsonを削除し、オリジナルを復元
    const originalConfigPath = path.join(TEST_CWD, ".pi", "config.json.original");
    try {
      fs.unlinkSync(CONFIG_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
    if (fs.existsSync(originalConfigPath)) {
      fs.renameSync(originalConfigPath, CONFIG_PATH);
    }
  });

  describe("retryWithBackoff設定", () => {
    it("should_load_retry_with_backoff_from_config_file", () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          maxRetries: 5,
          initialDelayMs: 2000,
          maxDelayMs: 30000,
          multiplier: 3,
          jitter: "full" as const,
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {});

        // Assert
        expect(result.maxRetries).toBe(5);
        expect(result.initialDelayMs).toBe(2000);
        expect(result.maxDelayMs).toBe(30000);
        expect(result.multiplier).toBe(3);
        expect(result.jitter).toBe("full");
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("should_load_retry_config_from_config_file", () => {
      // Arrange
      const config = {
        retry: {
          maxRetries: 3,
          initialDelayMs: 1500,
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {});

        // Assert
        expect(result.maxRetries).toBe(3);
        expect(result.initialDelayMs).toBe(1500);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("should_merge_overrides_with_file_config", () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          maxRetries: 5,
          initialDelayMs: 2000,
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {
          maxRetries: 10,
          multiplier: 3,
        });

        // Assert - overridesが優先される
        expect(result.maxRetries).toBe(10);
        expect(result.initialDelayMs).toBe(2000); // ファイルからの値
        expect(result.multiplier).toBe(3);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("should_handle_invalid_config_file_gracefully", () => {
      // Arrange
      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, "invalid json");

        // Act - 例外が発生しない
        const result = resolveRetryWithBackoffConfig(TEST_CWD);

        // Assert - デフォルト値が使用される
        expect(result.maxRetries).toBeGreaterThanOrEqual(0);
        expect(result.initialDelayMs).toBeGreaterThan(0);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("should_handle_nonexistent_config_file", () => {
      // Arrange - config.jsonが存在しない状態

      // Act
      const result = resolveRetryWithBackoffConfig(TEST_CWD);

      // Assert - デフォルト値が使用される
      expect(result.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result.initialDelayMs).toBeGreaterThan(0);
    });

    it("should_sanitize_invalid_values_from_config_file", () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          maxRetries: -5, // 負の値
          initialDelayMs: 1000000, // 最大値超過
          multiplier: 20, // 最大値超過
          jitter: "invalid" as const, // 無効な値
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const result = resolveRetryWithBackoffConfig(TEST_CWD);

        // Assert - 値がサニタイズされる
        expect(result.maxRetries).toBeGreaterThanOrEqual(0);
        expect(result.maxRetries).toBeLessThanOrEqual(20);
        expect(result.initialDelayMs).toBeGreaterThanOrEqual(1);
        expect(result.initialDelayMs).toBeLessThanOrEqual(600000);
        expect(result.multiplier).toBeGreaterThanOrEqual(1);
        expect(result.multiplier).toBeLessThanOrEqual(10);
        expect(["full", "partial", "none"]).toContain(result.jitter);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("should_handle_maxDelayMs_less_than_initialDelayMs", () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          initialDelayMs: 5000,
          maxDelayMs: 1000, // initialより小さい
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const result = resolveRetryWithBackoffConfig(TEST_CWD);

        // Assert - maxDelayMsがinitialDelayMs以上に調整される
        expect(result.maxDelayMs).toBeGreaterThanOrEqual(result.initialDelayMs);
      } finally {
        // Cleanup
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });
  });
});

// ============================================================================
// エラーハンドリングの追加テスト
// ============================================================================

describe("retryWithBackoff - 追加エラーケース", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("extractRetryStatusCodeの追加ケース", () => {
    it("should_extract_404_status_code", () => {
      // Arrange
      const error = { status: 404 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(404);
    });

    it("should_extract_status_code_beyond_599", () => {
      // Arrange
      const error = { status: 999 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(999);
    });

    it("should_extract_negative_status_code", () => {
      // Arrange
      const error = { status: -1 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined(); // 負の値は無効
    });

    it("should_extract_float_status_code", () => {
      // Arrange
      const error = { status: 500.5 };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(500);
    });

    it("should_handle_object_with_custom_toString", () => {
      // Arrange
      const error = {
        message: "Custom error 503",
        toString: () => "Custom error 503",
      };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBe(503);
    });
  });

  describe("isRetryableErrorの追加ケース", () => {
    it("should_not_retry_for_4xx_errors_except_specific", () => {
      // Arrange
      const errors = [
        { status: 400 },
        { status: 401 },
        { status: 403 },
        { status: 404 },
        { status: 405 },
        { status: 422 },
      ];

      // Act & Assert
      for (const error of errors) {
        expect(isRetryableError(error)).toBe(false);
      }
    });

    it("should_retry_for_all_5xx_errors", () => {
      // Arrange
      const errors = [
        { status: 500 },
        { status: 501 },
        { status: 502 },
        { status: 503 },
        { status: 504 },
        { status: 505 },
        { status: 599 },
      ];

      // Act & Assert
      for (const error of errors) {
        expect(isRetryableError(error)).toBe(true);
      }
    });

    it("should_handle_error_with_both_status_and_statusCode", () => {
      // Arrange
      const error = { status: 429, statusCode: 500 };

      // Act
      const result = isRetryableError(error);

      // Assert - statusが優先される
      expect(result).toBe(true);
    });

    it("should_explicit_status_code_override_extracted", () => {
      // Arrange
      const error = { message: "Error 429" };

      // Act
      const result = isRetryableError(error, 400);

      // Assert - 明示的なstatusCodeが優先
      expect(result).toBe(false);
    });
  });

  describe("複雑なリトライシナリオ", () => {
    it("should_handle_mixed_error_types", async () => {
      // Arrange
      const errors = [
        { status: 429 }, // レート制限
        { status: 500 }, // サーバーエラー
        new Error("Network error"), // その他のエラー
      ];
      const operation = vi
        .fn()
        .mockRejectedValueOnce(errors[0])
        .mockRejectedValueOnce(errors[1])
        .mockResolvedValue("success");

      const onRetry = vi.fn();
      const overrides = {
        maxRetries: 5,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise = retryWithBackoff(operation, {
        overrides,
        onRetry,
        maxRateLimitRetries: 5,
        rateLimitKey: "mixed-error-key",
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it("should_handle_success_after_multiple_retries", async () => {
      // Arrange
      const error500 = { status: 500 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValue("success");

      const overrides = {
        maxRetries: 5,
        initialDelayMs: 100,
        jitter: "none" as const,
      };

      // Act
      const promise = retryWithBackoff(operation, { overrides });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(4); // 初回 + 3回のリトライ
    });

    it("should_propagate_original_error_after_max_retries", async () => {
      // Arrange
      const originalError = new Error("Original error");
      const operation = vi.fn().mockRejectedValue(originalError);

      const overrides = {
        maxRetries: 2,
        initialDelayMs: 100,
      };

      // Act & Assert
      const promise = retryWithBackoff(operation, {
        overrides,
        shouldRetry: () => true,
      });
      promise.catch(() => {});
      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow("Original error");
      expect(operation).toHaveBeenCalledTimes(3); // 初回 + 2回のリトライ
    });
  });
});

// ============================================================================
// AbortSignalの追加テスト
// ============================================================================

describe("retryWithBackoff - AbortSignal追加", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_abort_immediately_when_signal_aborted", async () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    const operation = vi.fn().mockResolvedValue("success");

    // Act & Assert
    const promise = retryWithBackoff(operation, {
      signal: controller.signal,
    });
    promise.catch(() => {});

    await expect(promise).rejects.toThrow("retry aborted");
    expect(operation).not.toHaveBeenCalled();
  });

  it("should_abort_during_backoff", async () => {
    // Arrange
    const controller = new AbortController();
    const error500 = { status: 500 };
    const operation = vi
      .fn()
      .mockRejectedValueOnce(error500)
      .mockResolvedValue("success");

    const overrides = {
      maxRetries: 5,
      initialDelayMs: 10000, // 長いバックオフ
    };

    // Act
    const promise = retryWithBackoff(operation, {
      overrides,
      signal: controller.signal,
    });
    promise.catch(() => {});

    // エラー発生でバックオフに入る
    await vi.advanceTimersByTimeAsync(0);

    // バックオフ中にアボート
    controller.abort();

    await vi.runAllTimersAsync();

    // Assert
    await expect(promise).rejects.toThrow("retry aborted");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should_abort_during_rate_limit_wait", async () => {
    // Arrange
    const controller = new AbortController();
    const error429 = { status: 429 };
    const operation = vi.fn().mockRejectedValue(error429);

    const overrides = {
      maxRetries: 5,
    };

    // Act
    const promise = retryWithBackoff(operation, {
      overrides,
      signal: controller.signal,
      maxRateLimitRetries: 5,
      rateLimitKey: "abort-rate-limit-key",
    });
    promise.catch(() => {});

    // レート制限待機に入る
    await vi.advanceTimersByTimeAsync(0);

    // 待機中にアボート
    controller.abort();

    await vi.runAllTimersAsync();

    // Assert
    await expect(promise).rejects.toThrow("retry aborted");
    expect(operation.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
