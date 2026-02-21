/**
 * runtime-utils.ts 単体テスト
 * カバレッジ分析: trimForError, buildRateLimitKey, buildTraceTaskId, normalizeTimeoutMs, toRetryOverrides, toConcurrencyLimit
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";

import {
  trimForError,
  buildRateLimitKey,
  buildTraceTaskId,
  normalizeTimeoutMs,
  toRetryOverrides,
  toConcurrencyLimit,
} from "../../../.pi/lib/runtime-utils.js";

// ============================================================================
// trimForError テスト
// ============================================================================

describe("trimForError", () => {
  it("trimForError_短いメッセージ_そのまま返却", () => {
    // Arrange
    const message = "Short error message";

    // Act
    const result = trimForError(message);

    // Assert
    expect(result).toBe("Short error message");
  });

  it("trimForError_長いメッセージ_切り詰め", () => {
    // Arrange
    const message = "a".repeat(1000);

    // Act
    const result = trimForError(message);

    // Assert
    expect(result.length).toBe(603); // 600 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("trimForError_空白正規化_単一スペース", () => {
    // Arrange
    const message = "error   message\t\twith\n\nwhitespace";

    // Act
    const result = trimForError(message);

    // Assert
    expect(result).toBe("error message with whitespace");
  });

  it("trimForError_前後空白_削除", () => {
    // Arrange
    const message = "  trimmed message  ";

    // Act
    const result = trimForError(message);

    // Assert
    expect(result).toBe("trimmed message");
  });

  it("trimForError_カスタム最大長_適用", () => {
    // Arrange
    const message = "a".repeat(200);

    // Act
    const result = trimForError(message, 100);

    // Assert
    expect(result.length).toBe(103); // 100 + "..."
  });

  it("trimForError_空文字_空文字返却", () => {
    // Arrange & Act
    const result = trimForError("");

    // Assert
    expect(result).toBe("");
  });

  it("trimForError_最大長境界_そのまま", () => {
    // Arrange
    const message = "a".repeat(600);

    // Act
    const result = trimForError(message);

    // Assert
    expect(result).toBe(message);
  });

  it("trimForError_最大長プラス1_切り詰め", () => {
    // Arrange
    const message = "a".repeat(601);

    // Act
    const result = trimForError(message);

    // Assert
    expect(result.length).toBe(603);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ============================================================================
// buildRateLimitKey テスト
// ============================================================================

describe("buildRateLimitKey", () => {
  it("buildRateLimitKey_基本_小文字結合", () => {
    // Arrange & Act
    const result = buildRateLimitKey("OpenAI", "GPT-4");

    // Assert
    expect(result).toBe("openai::gpt-4");
  });

  it("buildRateLimitKey_大文字混在_小文字化", () => {
    // Arrange & Act
    const result = buildRateLimitKey("Anthropic", "Claude-3-5-Sonnet");

    // Assert
    expect(result).toBe("anthropic::claude-3-5-sonnet");
  });

  it("buildRateLimitKey_既に小文字_そのまま", () => {
    // Arrange & Act
    const result = buildRateLimitKey("google", "gemini-pro");

    // Assert
    expect(result).toBe("google::gemini-pro");
  });

  it("buildRateLimitKey_空プロバイダ_処理可能", () => {
    // Arrange & Act
    const result = buildRateLimitKey("", "model");

    // Assert
    expect(result).toBe("::model");
  });

  it("buildRateLimitKey_空モデル_処理可能", () => {
    // Arrange & Act
    const result = buildRateLimitKey("provider", "");

    // Assert
    expect(result).toBe("provider::");
  });

  it("buildRateLimitKey_区切り文字_ダブルコロン", () => {
    // Arrange & Act
    const result = buildRateLimitKey("p", "m");

    // Assert
    expect(result).toContain("::");
  });
});

// ============================================================================
// buildTraceTaskId テスト
// ============================================================================

describe("buildTraceTaskId", () => {
  it("buildTraceTaskId_基本_コロン区切り", () => {
    // Arrange & Act
    const result = buildTraceTaskId("trace-123", "delegate-456", 7);

    // Assert
    expect(result).toBe("trace-123:delegate-456:7");
  });

  it("buildTraceTaskId_undefinedトレースID_フォールバック", () => {
    // Arrange & Act
    const result = buildTraceTaskId(undefined, "delegate-456", 1);

    // Assert
    expect(result).toBe("trace-unknown:delegate-456:1");
  });

  it("buildTraceTaskId_空トレースID_フォールバック", () => {
    // Arrange & Act
    const result = buildTraceTaskId("", "delegate-456", 1);

    // Assert
    expect(result).toBe("trace-unknown:delegate-456:1");
  });

  it("buildTraceTaskId_空白のみトレースID_trim後空文字", () => {
    // Arrange & Act
    const result = buildTraceTaskId("   ", "delegate-456", 1);

    // Assert - trim後は空文字になるが、空文字はそのまま使用される
    expect(result).toBe(":delegate-456:1");
  });

  it("buildTraceTaskId_負のシーケンス_0に正規化", () => {
    // Arrange & Act
    const result = buildTraceTaskId("trace-123", "delegate-456", -5);

    // Assert
    expect(result).toBe("trace-123:delegate-456:0");
  });

  it("buildTraceTaskId_小数シーケンス_整数化", () => {
    // Arrange & Act
    const result = buildTraceTaskId("trace-123", "delegate-456", 3.7);

    // Assert
    expect(result).toBe("trace-123:delegate-456:3");
  });

  it("buildTraceTaskId_空デリゲートID_フォールバック", () => {
    // Arrange & Act
    const result = buildTraceTaskId("trace-123", "", 1);

    // Assert
    expect(result).toBe("trace-123:delegate-unknown:1");
  });

  it("buildTraceTaskId_前後空白_削除", () => {
    // Arrange & Act
    const result = buildTraceTaskId("  trace-123  ", "  delegate-456  ", 1);

    // Assert
    expect(result).toBe("trace-123:delegate-456:1");
  });
});

// ============================================================================
// normalizeTimeoutMs テスト
// ============================================================================

describe("normalizeTimeoutMs", () => {
  it("normalizeTimeoutMs_正の数_整数化", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(30000, 10000);

    // Assert
    expect(result).toBe(30000);
  });

  it("normalizeTimeoutMs_小数_整数化", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(30000.7, 10000);

    // Assert
    expect(result).toBe(30000);
  });

  it("normalizeTimeoutMs_undefined_フォールバック", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(undefined, 10000);

    // Assert
    expect(result).toBe(10000);
  });

  it("normalizeTimeoutMs_負の数_0返却", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(-5000, 10000);

    // Assert
    expect(result).toBe(0);
  });

  it("normalizeTimeoutMs_0_0返却", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(0, 10000);

    // Assert
    expect(result).toBe(0);
  });

  it("normalizeTimeoutMs_Infinity_フォールバック", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(Infinity, 10000);

    // Assert
    expect(result).toBe(10000);
  });

  it("normalizeTimeoutMs_NaN_フォールバック", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(NaN, 10000);

    // Assert
    expect(result).toBe(10000);
  });

  it("normalizeTimeoutMs_文字列_数値変換", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs("30000", 10000);

    // Assert
    expect(result).toBe(30000);
  });

  it("normalizeTimeoutMs_オブジェクト_フォールバック", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs({ toString: () => "30000" }, 10000);

    // Assert
    expect(result).toBe(10000);
  });

  it("normalizeTimeoutMs_配列_フォールバック", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs([30000], 10000);

    // Assert
    expect(result).toBe(10000);
  });

  it("normalizeTimeoutMs_最小正数_1返却", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(0.5, 10000);

    // Assert
    expect(result).toBe(1);
  });
});

// ============================================================================
// toRetryOverrides テスト
// ============================================================================

describe("toRetryOverrides", () => {
  it("toRetryOverrides_undefined_undefined返却", () => {
    // Arrange & Act
    const result = toRetryOverrides(undefined);

    // Assert
    expect(result).toBeUndefined();
  });

  it("toRetryOverrides_null_undefined返却", () => {
    // Arrange & Act
    const result = toRetryOverrides(null);

    // Assert
    expect(result).toBeUndefined();
  });

  it("toRetryOverrides_空オブジェクト_空オブジェクト", () => {
    // Arrange & Act
    const result = toRetryOverrides({});

    // Assert
    expect(result).toEqual({});
  });

  it("toRetryOverrides_有効な値_抽出", () => {
    // Arrange
    const input = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      multiplier: 2.0,
      jitter: "full" as const,
    };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result).toEqual(input);
  });

  it("toRetryOverrides_無効なjitter_除外", () => {
    // Arrange
    const input = {
      maxRetries: 5,
      jitter: "invalid",
    };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result).toEqual({ maxRetries: 5, jitter: undefined });
  });

  it("toRetryOverrides_jitterPartial_有効", () => {
    // Arrange
    const input = { jitter: "partial" };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result?.jitter).toBe("partial");
  });

  it("toRetryOverrides_jitterNone_有効", () => {
    // Arrange
    const input = { jitter: "none" };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result?.jitter).toBe("none");
  });

  it("toRetryOverrides_数値以外のmaxRetries_除外", () => {
    // Arrange
    const input = { maxRetries: "5" };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result?.maxRetries).toBeUndefined();
  });

  it("toRetryOverrides_部分的な値_抽出", () => {
    // Arrange
    const input = {
      maxRetries: 3,
      unrelated: "value",
    };

    // Act
    const result = toRetryOverrides(input);

    // Assert
    expect(result).toEqual({ maxRetries: 3 });
  });
});

// ============================================================================
// toConcurrencyLimit テスト
// ============================================================================

describe("toConcurrencyLimit", () => {
  it("toConcurrencyLimit_正の数_整数化", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(5, 2);

    // Assert
    expect(result).toBe(5);
  });

  it("toConcurrencyLimit_小数_整数化", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(5.7, 2);

    // Assert
    expect(result).toBe(5);
  });

  it("toConcurrencyLimit_undefined_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(undefined, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_0_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(0, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_負の数_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(-5, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_Infinity_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(Infinity, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_NaN_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(NaN, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_文字列_数値変換", () => {
    // Arrange & Act
    const result = toConcurrencyLimit("5", 2);

    // Assert
    expect(result).toBe(5);
  });

  it("toConcurrencyLimit_オブジェクト_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit({ toString: () => "5" }, 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_配列_フォールバック", () => {
    // Arrange & Act
    const result = toConcurrencyLimit([5], 2);

    // Assert
    expect(result).toBe(2);
  });

  it("toConcurrencyLimit_最小正数_1返却", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(0.5, 2);

    // Assert
    expect(result).toBe(1);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("trimForError_任意の文字列_最大長以下", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (message) => {
        const result = trimForError(message);
        return result.length <= 603;
      })
    );
  });

  it("buildRateLimitKey_任意の文字列_小文字", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), fc.string({ maxLength: 50 }), (provider, model) => {
        const result = buildRateLimitKey(provider, model);
        return result === result.toLowerCase();
      })
    );
  });

  it("buildTraceTaskId_任意の値_文字列返却", () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
        fc.string({ maxLength: 50 }),
        fc.integer({ min: 0, max: 1000 }),
        (traceId, delegateId, sequence) => {
          const result = buildTraceTaskId(traceId, delegateId, sequence);
          return typeof result === "string" && result.length > 0;
        }
      )
    );
  });

  it("normalizeTimeoutMs_任意の値_正の整数または0", () => {
    fc.assert(
      fc.property(fc.anything(), fc.integer({ min: 1, max: 100000 }), (value, fallback) => {
        const result = normalizeTimeoutMs(value, fallback);
        return (Number.isInteger(result) && result >= 0);
      })
    );
  });

  it("toConcurrencyLimit_任意の値_正の整数またはフォールバック", () => {
    fc.assert(
      fc.property(fc.anything(), fc.integer({ min: 1, max: 100 }), (value, fallback) => {
        const result = toConcurrencyLimit(value, fallback);
        return Number.isInteger(result) && result >= 1;
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("trimForError_非常に長いメッセージ_切り詰め", () => {
    // Arrange
    const message = "a".repeat(100000);

    // Act
    const result = trimForError(message);

    // Assert
    expect(result.length).toBe(603);
  });

  it("buildRateLimitKey_特殊文字含む_処理可能", () => {
    // Arrange & Act
    const result = buildRateLimitKey("pro/vider", "mod@el#123");

    // Assert
    expect(result).toContain("::");
  });

  it("normalizeTimeoutMs_最大整数_処理可能", () => {
    // Arrange & Act
    const result = normalizeTimeoutMs(Number.MAX_SAFE_INTEGER, 10000);

    // Assert
    expect(result).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("toConcurrencyLimit_非常に大きい値_処理可能", () => {
    // Arrange & Act
    const result = toConcurrencyLimit(1000000, 2);

    // Assert
    expect(result).toBe(1000000);
  });
});
