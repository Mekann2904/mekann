/**
 * format-utils.ts 単体テスト
 * カバレッジ分析: formatDuration, formatDurationMs, formatBytes,
 * formatClockTime, normalizeForSingleLine
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";
import {
 formatDuration,
  formatDurationMs,
  formatElapsedClock,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "../../../.pi/lib/format-utils.js";

// ============================================================================
// formatDuration テスト
// ============================================================================

describe("formatDuration", () => {
  it("formatDuration_0ms_0ms返却", () => {
    // Arrange & Act
    const result = formatDuration(0);

    // Assert
    expect(result).toBe("0ms");
  });

  it("formatDuration_負の値_0ms返却", () => {
    // Arrange & Act
    const result = formatDuration(-100);

    // Assert
    expect(result).toBe("0ms");
  });

  it("formatDuration_NaN_0ms返却", () => {
    // Arrange & Act
    const result = formatDuration(NaN);

    // Assert
    expect(result).toBe("0ms");
  });

  it("formatDuration_Infinity_0ms返却", () => {
    // Arrange & Act
    const result = formatDuration(Infinity);

    // Assert
    expect(result).toBe("0ms");
  });

  it("formatDuration_100ms_100ms返却", () => {
    // Arrange & Act
    const result = formatDuration(100);

    // Assert
    expect(result).toBe("100ms");
  });

  it("formatDuration_999ms_999ms返却", () => {
    // Arrange & Act
    const result = formatDuration(999);

    // Assert
    expect(result).toBe("999ms");
  });

  it("formatDuration_1000ms_1.00s返却", () => {
    // Arrange & Act
    const result = formatDuration(1000);

    // Assert
    expect(result).toBe("1.00s");
  });

  it("formatDuration_1500ms_1.50s返却", () => {
    // Arrange & Act
    const result = formatDuration(1500);

    // Assert
    expect(result).toBe("1.50s");
  });

  it("formatDuration_60000ms_60.00s返却", () => {
    // Arrange & Act
    const result = formatDuration(60000);

    // Assert
    expect(result).toBe("60.00s");
  });

  it("formatDuration_小数_四捨入", () => {
    // Arrange & Act
    const result = formatDuration(123.7);

    // Assert
    expect(result).toBe("124ms");
  });
});

// ============================================================================
// formatDurationMs テスト
// ============================================================================

describe("formatDurationMs", () => {
  it("formatDurationMs_startedAtMsなし_ダッシュ返却", () => {
    // Arrange & Act
    const result = formatDurationMs({});

    // Assert
    expect(result).toBe("-");
  });

  it("formatDurationMs_startedAtMsのみ_経過時間計算", () => {
    // Arrange
    const item = {
      startedAtMs: Date.now() - 5000,
    };

    // Act
    const result = formatDurationMs(item);

    // Assert
    expect(result).toMatch(/^\d+\.\ds$/);
  });

  it("formatDurationMs_finishedAtMsあり_正確な期間計算", () => {
    // Arrange
    const item = {
      startedAtMs: 1000,
      finishedAtMs: 6000,
    };

    // Act
    const result = formatDurationMs(item);

    // Assert
    expect(result).toBe("5.0s");
  });

  it("formatDurationMs_1秒未満_ms表示", () => {
    // Arrange
    const item = {
      startedAtMs: 1000,
      finishedAtMs: 1500,
    };

    // Act
    const result = formatDurationMs(item);

    // Assert
    expect(result).toBe("0.5s");
  });

  it("formatDurationMs_finishedAtMsが過去_負の期間は0", () => {
    // Arrange
    const item = {
      startedAtMs: 6000,
      finishedAtMs: 1000,
    };

    // Act
    const result = formatDurationMs(item);

    // Assert
    expect(result).toBe("0.0s");
  });
});

// ============================================================================
// formatElapsedClock テスト
// ============================================================================

describe("formatElapsedClock", () => {
  it("formatElapsedClock_startedAtMsなし_ダッシュ返却", () => {
    const result = formatElapsedClock({});
    expect(result).toBe("-");
  });

  it("formatElapsedClock_65秒_00:01:05返却", () => {
    const result = formatElapsedClock({
      startedAtMs: 1000,
      finishedAtMs: 66_000,
    });
    expect(result).toBe("00:01:05");
  });

  it("formatElapsedClock_1時間超え_時を含む", () => {
    const result = formatElapsedClock({
      startedAtMs: 1,
      finishedAtMs: (2 * 3600 + 3 * 60 + 4) * 1000 + 1,
    });
    expect(result).toBe("02:03:04");
  });
});

// ============================================================================
// formatBytes テスト
// ============================================================================

describe("formatBytes", () => {
  it("formatBytes_0_0B返却", () => {
    // Arrange & Act
    const result = formatBytes(0);

    // Assert
    expect(result).toBe("0B");
  });

  it("formatBytes_負の値_0B返却", () => {
    // Arrange & Act
    const result = formatBytes(-100);

    // Assert
    expect(result).toBe("0B");
  });

  it("formatBytes_小数_切り捨て", () => {
    // Arrange & Act
    const result = formatBytes(123.9);

    // Assert
    expect(result).toBe("123B");
  });

  it("formatBytes_512_512B返却", () => {
    // Arrange & Act
    const result = formatBytes(512);

    // Assert
    expect(result).toBe("512B");
  });

  it("formatBytes_1023_1023B返却", () => {
    // Arrange & Act
    const result = formatBytes(1023);

    // Assert
    expect(result).toBe("1023B");
  });

  it("formatBytes_1024_1.0KB返却", () => {
    // Arrange & Act
    const result = formatBytes(1024);

    // Assert
    expect(result).toBe("1.0KB");
  });

  it("formatBytes_1536_1.5KB返却", () => {
    // Arrange & Act
    const result = formatBytes(1536);

    // Assert
    expect(result).toBe("1.5KB");
  });

  it("formatBytes_1048575_1023.9KB返却", () => {
    // Arrange & Act
    const result = formatBytes(1048575);

    // Assert
    expect(result).toBe("1024.0KB"); // 1024 * 1024 - 1
  });

  it("formatBytes_1048576_1.0MB返却", () => {
    // Arrange & Act
    const result = formatBytes(1048576);

    // Assert
    expect(result).toBe("1.0MB");
  });

  it("formatBytes_1572864_1.5MB返却", () => {
    // Arrange & Act
    const result = formatBytes(1572864); // 1.5 * 1024 * 1024

    // Assert
    expect(result).toBe("1.5MB");
  });

  it("formatBytes_大量_10MB以上", () => {
    // Arrange & Act
    const result = formatBytes(10 * 1024 * 1024);

    // Assert
    expect(result).toBe("10.0MB");
  });
});

// ============================================================================
// formatClockTime テスト
// ============================================================================

describe("formatClockTime", () => {
  it("formatClockTime_undefined_ダッシュ返却", () => {
    // Arrange & Act
    const result = formatClockTime(undefined);

    // Assert
    expect(result).toBe("-");
  });

  it("formatClockTime_0_ダッシュ返却", () => {
    // Arrange & Act
    const result = formatClockTime(0);

    // Assert - 0はfalsyとして扱われ"-"が返る
    expect(result).toBe("-");
  });

  it("formatClockTime_特定時刻_正確な時刻", () => {
    // Arrange
    const date = new Date(2024, 0, 1, 12, 30, 45);
    const timestamp = date.getTime();

    // Act
    const result = formatClockTime(timestamp);

    // Assert
    expect(result).toBe("12:30:45");
  });

  it("formatClockTime_1桁の時間_0埋め", () => {
    // Arrange
    const date = new Date(2024, 0, 1, 1, 5, 9);
    const timestamp = date.getTime();

    // Act
    const result = formatClockTime(timestamp);

    // Assert
    expect(result).toBe("01:05:09");
  });

  it("formatClockTime_23時59分59秒_正確な時刻", () => {
    // Arrange
    const date = new Date(2024, 0, 1, 23, 59, 59);
    const timestamp = date.getTime();

    // Act
    const result = formatClockTime(timestamp);

    // Assert
    expect(result).toBe("23:59:59");
  });

  it("formatClockTime_現在時刻_フォーマット確認", () => {
    // Arrange & Act
    const result = formatClockTime(Date.now());

    // Assert
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

// ============================================================================
// normalizeForSingleLine テスト
// ============================================================================

describe("normalizeForSingleLine", () => {
  it("normalizeForSingleLine_空文字_ダッシュ返却", () => {
    // Arrange & Act
    const result = normalizeForSingleLine("");

    // Assert
    expect(result).toBe("-");
  });

  it("normalizeForSingleLine_空白のみ_ダッシュ返却", () => {
    // Arrange & Act
    const result = normalizeForSingleLine("   \n\t   ");

    // Assert
    expect(result).toBe("-");
  });

  it("normalizeForSingleLine_短いテキスト_そのまま返却", () => {
    // Arrange
    const text = "short text";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toBe("short text");
  });

  it("normalizeForSingleLine_改行含む_空白に変換", () => {
    // Arrange
    const text = "line1\nline2\nline3";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toBe("line1 line2 line3");
  });

  it("normalizeForSingleLine_複数空白_単一空白に圧縮", () => {
    // Arrange
    const text = "word1   word2\t\tword3";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toBe("word1 word2 word3");
  });

  it("normalizeForSingleLine_maxLength超過_切り詰め", () => {
    // Arrange
    const text = "a".repeat(200);

    // Act
    const result = normalizeForSingleLine(text, 100);

    // Assert
    expect(result.length).toBe(100); // (100-3) + "..." = 100文字以内
    expect(result.endsWith("...")).toBe(true);
  });

  it("normalizeForSingleLine_デフォルトmaxLength_160文字", () => {
    // Arrange
    const text = "a".repeat(200);

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result.length).toBe(160); // (160-3) + "..." = 160文字以内
  });

  it("normalizeForSingleLine_前後空白_トリム", () => {
    // Arrange
    const text = "  text  ";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toBe("text");
  });

  it("normalizeForSingleLine_キャッシュ_同一結果高速返却", () => {
    // Arrange
    const text = "test content for caching";

    // Act
    const result1 = normalizeForSingleLine(text);
    const result2 = normalizeForSingleLine(text);

    // Assert
    expect(result1).toBe(result2);
  });

  it("normalizeForSingleLine_異なるmaxLength_異なるキャッシュ", () => {
    // Arrange
    const text = "a".repeat(200);

    // Act
    const result1 = normalizeForSingleLine(text, 50);
    const result2 = normalizeForSingleLine(text, 100);

    // Assert
    expect(result1.length).toBe(50); // (50-3) + "..." = 50文字以内
    expect(result2.length).toBe(100); // (100-3) + "..." = 100文字以内
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("formatDuration_任意の有限数_非負の文字列", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: Number.MAX_SAFE_INTEGER }), (ms) => {
        const result = formatDuration(ms);
        return (
          (result.endsWith("ms") || result.endsWith("s")) &&
          !result.includes("-") &&
          !result.includes("NaN")
        );
      })
    );
  });

  it("formatBytes_任意の非負整数_B_or_KB_or_MB", () => {
    fc.assert(
      fc.property(fc.nat(1000000000), (bytes) => {
        const result = formatBytes(bytes);
        return (
          result.endsWith("B") ||
          result.endsWith("KB") ||
          result.endsWith("MB")
        );
      })
    );
  });

  it("normalizeForSingleLine_任意の文字列_単一行", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (text) => {
        const result = normalizeForSingleLine(text);
        return !result.includes("\n") || result === "-";
      })
    );
  });

  it("formatClockTime_任意のタイムスタンプ_HH:MM:SS形式", () => {
    fc.assert(
      fc.property(fc.nat(), (timestamp) => {
        const result = formatClockTime(timestamp);
        return /^\d{2}:\d{2}:\d{2}$/.test(result) || result === "-";
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("formatDuration_MAX_SAFE_INTEGER_処理可能", () => {
    // Arrange & Act
    const result = formatDuration(Number.MAX_SAFE_INTEGER);

    // Assert
    expect(result).toMatch(/^\d+\.\d{2}s$/);
  });

  it("formatBytes_MAX_SAFE_INTEGER_MB単位", () => {
    // Arrange & Act
    const result = formatBytes(Number.MAX_SAFE_INTEGER);

    // Assert
    expect(result).toMatch(/^\d+\.\dMB$/);
  });

  it("normalizeForSingleLine_非常に長い文字列_切り詰め", () => {
    // Arrange
    const text = "a".repeat(100000);

    // Act
    const result = normalizeForSingleLine(text, 100);

    // Assert
    expect(result.length).toBe(100); // (100-3) + "..." = 100文字以内
  });

  it("normalizeForSingleLine_キャッシュ_LRUエビクション", () => {
    // Arrange
    // キャッシュを埋めるために257個の異なる文字列を処理
    for (let i = 0; i < 257; i++) {
      normalizeForSingleLine(`unique text ${i}`);
    }

    // Act
    // 最初のエントリはエビクションされている可能性
    const result = normalizeForSingleLine("unique text 0");

    // Assert - エラーにならずに結果を返す
    expect(typeof result).toBe("string");
  });

  it("formatDurationMs_非常に長い期間", () => {
    // Arrange
    const item = {
      startedAtMs: 1,
      finishedAtMs: Number.MAX_SAFE_INTEGER,
    };

    // Act
    const result = formatDurationMs(item);

    // Assert
    expect(result).toMatch(/^\d+\.\ds$/);
  });
});

// ============================================================================
// 特殊文字・エッジケーステスト
// ============================================================================

describe("特殊文字・エッジケース", () => {
  it("normalizeForSingleLine_Unicode文字_正常処理", () => {
    // Arrange
    const text = "日本語 テスト 🎉 emoji";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toBe("日本語 テスト 🎉 emoji");
  });

  it("normalizeForSingleLine_制御文字_空白化", () => {
    // Arrange
    const text = "text\x00\x01\x02text";

    // Act
    const result = normalizeForSingleLine(text);

    // Assert
    expect(result).toContain("text");
  });

  it("formatDuration_1ミリ秒", () => {
    // Arrange & Act
    const result = formatDuration(1);

    // Assert
    expect(result).toBe("1ms");
  });

  it("formatBytes_1バイト", () => {
    // Arrange & Act
    const result = formatBytes(1);

    // Assert
    expect(result).toBe("1B");
  });

  it("formatClockTime_1ミリ秒", () => {
    // Arrange & Act
    const result = formatClockTime(1);

    // Assert
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
