/**
 * @file .pi/lib/retry-with-backoff.ts のカバレッジ向上用追加テスト
 * @description 未カバレッジの関数とエッジケースのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ターゲットモジュールの内部関数をテストするために
// テスト用にエクスポートされた内部関数を使用するか、
// 公開API経由で間接的にテストします。

describe("retry-with-backoff - 内部関数のカバレッジ向上", () => {
  describe("設定ファイル関連", () => {
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

    it("config_file_retryWithBackoff_complete_config", async () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          maxRetries: 10,
          initialDelayMs: 500,
          maxDelayMs: 20000,
          multiplier: 2.5,
          jitter: "partial" as const,
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act - モジュールを再ロードして設定を反映
        const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {});

        // Assert
        expect(result.maxRetries).toBe(10);
        expect(result.initialDelayMs).toBe(500);
        expect(result.maxDelayMs).toBe(20000);
        expect(result.multiplier).toBe(2.5);
        expect(result.jitter).toBe("partial");
      } finally {
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("config_file_retry_node_complete_config", async () => {
      // Arrange
      const config = {
        retry: {
          maxRetries: 7,
          initialDelayMs: 1200,
          maxDelayMs: 15000,
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {});

        // Assert
        expect(result.maxRetries).toBe(7);
        expect(result.initialDelayMs).toBe(1200);
        expect(result.maxDelayMs).toBe(15000);
      } finally {
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("config_file_both_retryWithBackoff_and_retry", async () => {
      // Arrange
      const config = {
        retryWithBackoff: {
          maxRetries: 5,
        },
        retry: {
          maxRetries: 10, // retryWithBackoffが優先される
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
        const result = resolveRetryWithBackoffConfig(TEST_CWD, {});

        // Assert - retryWithBackoffが優先
        expect(result.maxRetries).toBe(5);
      } finally {
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("config_file_empty_retry_node", async () => {
      // Arrange
      const config = {
        retry: {},
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
        const result = resolveRetryWithBackoffConfig(TEST_CWD);

        // Assert - デフォルト値が使用される
        expect(result.maxRetries).toBeGreaterThanOrEqual(0);
        expect(result.initialDelayMs).toBeGreaterThan(0);
      } finally {
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });

    it("config_file_nested_config", async () => {
      // Arrange
      const config = {
        nested: {
          config: {
            retry: {
              maxRetries: 3,
            },
          },
        },
      };

      try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        // Act
        const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
        const result = resolveRetryWithBackoffConfig(TEST_CWD);

        // Assert - retryノードが存在しないのでデフォルト
        expect(result.maxRetries).toBeGreaterThanOrEqual(0);
      } finally {
        try {
          fs.unlinkSync(CONFIG_PATH);
        } catch {
          // Ignore
        }
      }
    });
  });

  describe("sanitizeOverridesのエッジケース", () => {
    it("overrides_null_empty_object", async () => {
      // Arrange & Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");

      const result1 = resolveRetryWithBackoffConfig(undefined, null);
      const result2 = resolveRetryWithBackoffConfig(undefined, {});
      const result3 = resolveRetryWithBackoffConfig(undefined, undefined);

      // Assert - すべてデフォルト値が使用される
      expect(result1.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result2.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result3.maxRetries).toBeGreaterThanOrEqual(0);
    });

    it("overrides_undefined_values", async () => {
      // Arrange
      const overrides = {
        maxRetries: undefined,
        initialDelayMs: undefined,
        maxDelayMs: undefined,
        multiplier: undefined,
        jitter: undefined,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - デフォルト値が使用される
      expect(result.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result.initialDelayMs).toBeGreaterThan(0);
    });

    it("overrides_string_instead_of_number", async () => {
      // Arrange
      const overrides = {
        maxRetries: "5" as unknown,
        initialDelayMs: "1000" as unknown,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - 文字列は数値として解釈される
      expect(result.maxRetries).toBe(5);
      expect(result.initialDelayMs).toBe(1000);
    });

    it("overrides_infinity_value", async () => {
      // Arrange
      const overrides = {
        maxRetries: Infinity,
        multiplier: Infinity,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - Infinityはクランプされる
      expect(result.maxRetries).toBeLessThanOrEqual(20);
      expect(result.multiplier).toBeLessThanOrEqual(10);
    });

    it("overrides_NaN_value", async () => {
      // Arrange
      const overrides = {
        maxRetries: NaN,
        initialDelayMs: NaN,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - NaNは無視される
      expect(result.maxRetries).toBeGreaterThanOrEqual(0);
      expect(result.initialDelayMs).toBeGreaterThan(0);
    });
  });

  describe("clampIntegerの境界値", () => {
    it("clampInteger_min_boundary", async () => {
      // Arrange
      const overrides = {
        maxRetries: -1,
        initialDelayMs: 0,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.maxRetries).toBe(0);
      expect(result.initialDelayMs).toBe(1); // 最小値にクランプ
    });

    it("clampInteger_max_boundary", async () => {
      // Arrange
      const overrides = {
        maxRetries: 21,
        initialDelayMs: 700000,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.maxRetries).toBe(20);
      expect(result.initialDelayMs).toBe(600000);
    });

    it("clampInteger_exact_boundaries", async () => {
      // Arrange
      const overrides = {
        maxRetries: 0,
        maxDelayMs: 1,
        initialDelayMs: 600000,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.maxRetries).toBe(0);
      expect(result.maxDelayMs).toBeGreaterThanOrEqual(1);
      expect(result.initialDelayMs).toBe(600000);
    });
  });

  describe("clampFloatの境界値", () => {
    it("clampFloat_min_boundary", async () => {
      // Arrange
      const overrides = {
        multiplier: 0.5, // 最小より小さい
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.multiplier).toBe(1);
    });

    it("clampFloat_max_boundary", async () => {
      // Arrange
      const overrides = {
        multiplier: 10.5, // 最大より大きい
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.multiplier).toBe(10);
    });

    it("clampFloat_exact_boundaries", async () => {
      // Arrange
      const overrides = {
        multiplier: 1,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert
      expect(result.multiplier).toBe(1);
    });
  });

  describe("normalizeJitterのエッジケース", () => {
    it("normalizeJitter_mixed_case", async () => {
      // Arrange
      const overrides = {
        jitter: "FULL" as unknown,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - 大文字は小文字に変換される
      expect(result.jitter).toBe("full");
    });

    it("normalizeJitter_whitespace", async () => {
      // Arrange
      const overrides = {
        jitter: "  partial  " as unknown,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - 空白がトリムされる
      expect(result.jitter).toBe("partial");
    });

    it("normalizeJitter_number", async () => {
      // Arrange
      const overrides = {
        jitter: 123 as unknown,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - 数値は文字列に変換されるが無効
      expect(["full", "partial", "none"]).toContain(result.jitter);
    });

    it("normalizeJitter_boolean", async () => {
      // Arrange
      const overrides = {
        jitter: true as unknown,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - booleanは文字列に変換されるが無効
      expect(["full", "partial", "none"]).toContain(result.jitter);
    });
  });

  describe("toFiniteNumberのエッジケース", () => {
    it("toFiniteNumber_negative_zero", async () => {
      // Arrange
      const overrides = {
        maxRetries: -0,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - -0は0として扱われる
      expect(result.maxRetries).toBe(0);
    });

    it("toFiniteNumber_very_large_number", async () => {
      // Arrange
      const overrides = {
        maxRetries: Number.MAX_SAFE_INTEGER,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - クランプされる
      expect(result.maxRetries).toBeLessThanOrEqual(20);
    });

    it("toFiniteNumber_negative_infinity", async () => {
      // Arrange
      const overrides = {
        maxRetries: -Infinity,
      };

      // Act
      const { resolveRetryWithBackoffConfig } = await import("../../../.pi/lib/retry-with-backoff.js");
      const result = resolveRetryWithBackoffConfig(undefined, overrides);

      // Assert - -Infinityは無効
      expect(result.maxRetries).toBeGreaterThanOrEqual(0);
    });
  });

  describe("normalizeRateLimitKeyのエッジケース", () => {
    it("normalizeRateLimitKey_special_characters", async () => {
      // Arrange & Act
      const { getRateLimitGateSnapshot } = await import("../../../.pi/lib/retry-with-backoff.js");
      const snapshot1 = getRateLimitGateSnapshot("Test-Key_123");
      const snapshot2 = getRateLimitGateSnapshot("  spaces  ");

      // Assert
      expect(snapshot1.key).toBe("test-key_123"); // 小文字に変換
      expect(snapshot2.key).toBe("spaces");
    });

    it("normalizeRateLimitKey_unicode", async () => {
      // Arrange & Act
      const { getRateLimitGateSnapshot } = await import("../../../.pi/lib/retry-with-backoff.js");
      const snapshot = getRateLimitGateSnapshot("test-key-日本語");

      // Assert
      expect(snapshot.key).toBe("test-key-日本語");
    });

    it("normalizeRateLimitKey_numbers_only", async () => {
      // Arrange & Act
      const { getRateLimitGateSnapshot } = await import("../../../.pi/lib/retry-with-backoff.js");
      const snapshot = getRateLimitGateSnapshot("12345");

      // Assert
      expect(snapshot.key).toBe("12345");
    });

    it("normalizeRateLimitKey_emoji", async () => {
      // Arrange & Act
      const { getRateLimitGateSnapshot } = await import("../../../.pi/lib/retry-with-backoff.js");
      const snapshot = getRateLimitGateSnapshot("test🔑key");

      // Assert
      expect(snapshot.key).toBe("test🔑key");
    });
  });
});

describe("retry-with-backoff - エッジケースの追加テスト", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("extractRetryStatusCodeの追加エッジケース", () => {
    it("extract_status_from_error_with_toString", async () => {
      // Arrange
      const { extractRetryStatusCode } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = {
        toString: () => "Error 503",
      };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });

    it("extract_status_from_error_with_message_object", async () => {
      // Arrange
      const { extractRetryStatusCode } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = {
        message: {
          toString: () => "Error 429",
        },
      };

      // Act
      const result = extractRetryStatusCode(error);

      // Assert - messageがオブジェクト型で文字列でないため、ステータスコードは抽出されない
      expect(result).toBeUndefined();
    });

    it("extract_status_from_array", async () => {
      // Arrange
      const { extractRetryStatusCode } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = [500, 503, 429] as unknown;

      // Act
      const result = extractRetryStatusCode(error);

      // Assert - 配列は文字列に変換され、"500,503,429"となり、5xxがマッチする
      // String([500, 503, 429]) = "500,503,429" → 5xxにマッチ → 500
      expect(result).toBe(500);
    });

    it("extract_status_from_date", async () => {
      // Arrange
      const { extractRetryStatusCode } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = new Date("2025-01-15") as unknown;

      // Act
      const result = extractRetryStatusCode(error);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("isRetryableErrorの追加エッジケース", () => {
    it("should_retry_403_with_retryable_keyword", async () => {
      // Arrange
      const { isRetryableError } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = { status: 403 }; // 403は通常再試行対象外

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_retry_401_with_retryable_keyword", async () => {
      // Arrange
      const { isRetryableError } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = { status: 401 }; // 401は通常再試行対象外

      // Act
      const result = isRetryableError(error);

      // Assert
      expect(result).toBe(false);
    });

    it("should_retry_error_without_status_code", async () => {
      // Arrange
      const { isRetryableError } = await import("../../../.pi/lib/retry-with-backoff.js");
      const error = new Error("Generic error");

      // Act
      const result = isRetryableError(error);

      // Assert - メッセージに再試行可能なキーワードがなければfalse
      expect(result).toBe(false);
    });
  });

  describe("retryWithBackoffの追加エッジケース", () => {
    it("should_handle_operation_returning_undefined", async () => {
      // Arrange
      const operation = vi.fn().mockResolvedValue(undefined);
      const overrides = { maxRetries: 0 };

      // Act
      const { retryWithBackoff } = await import("../../../.pi/lib/retry-with-backoff.js");
      const promise = retryWithBackoff(operation, { overrides });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBeUndefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should_handle_operation_returning_null", async () => {
      // Arrange
      const operation = vi.fn().mockResolvedValue(null);
      const overrides = { maxRetries: 0 };

      // Act
      const { retryWithBackoff } = await import("../../../.pi/lib/retry-with-backoff.js");
      const promise = retryWithBackoff(operation, { overrides });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBeNull();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should_handle_zero_delay", async () => {
      // Arrange
      const error500 = { status: 500 };
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue("success");

      const overrides = {
        maxRetries: 3,
        initialDelayMs: 0, // 0ms
        jitter: "none" as const,
      };

      // Act
      const { retryWithBackoff } = await import("../../../.pi/lib/retry-with-backoff.js");
      const promise = retryWithBackoff(operation, { overrides });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should_handle_very_long_operation", async () => {
      // Arrange
      const operation = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return "success";
      });

      const overrides = { maxRetries: 0 };

      // Act
      const { retryWithBackoff } = await import("../../../.pi/lib/retry-with-backoff.js");
      const promise = retryWithBackoff(operation, { overrides });
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("computeBackoffDelayMsの追加エッジケース", () => {
    it("should_handle_very_large_attempt_number", async () => {
      // Arrange
      const { computeBackoffDelayMs } = await import("../../../.pi/lib/retry-with-backoff.js");
      const config = {
        maxRetries: 100,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none" as const,
      };

      // Act
      const result = computeBackoffDelayMs(1000, config);

      // Assert
      expect(result).toBe(10000); // maxDelayMsにクランプされる
    });

    it("should_handle_negative_attempt", async () => {
      // Arrange
      const { computeBackoffDelayMs } = await import("../../../.pi/lib/retry-with-backoff.js");
      const config = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none" as const,
      };

      // Act
      const result = computeBackoffDelayMs(-5, config);

      // Assert - 負の値は1として扱われる
      expect(result).toBe(1000);
    });

    it("should_handle_zero_attempt", async () => {
      // Arrange
      const { computeBackoffDelayMs } = await import("../../../.pi/lib/retry-with-backoff.js");
      const config = {
        maxRetries: 5,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        multiplier: 2,
        jitter: "none" as const,
      };

      // Act
      const result = computeBackoffDelayMs(0, config);

      // Assert - 0は1として扱われる
      expect(result).toBe(1000);
    });
  });
});
