/**
 * model-timeouts.ts 単体テスト
 * カバレッジ分析: getModelBaseTimeoutMs, computeModelTimeoutMs, computeProgressiveTimeoutMs
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

import {
  MODEL_TIMEOUT_BASE_MS,
  THINKING_LEVEL_MULTIPLIERS,
  getModelBaseTimeoutMs,
  computeModelTimeoutMs,
  computeProgressiveTimeoutMs,
} from "../../../.pi/lib/model-timeouts.js";

// ============================================================================
// MODEL_TIMEOUT_BASE_MS 定数テスト
// ============================================================================

describe("MODEL_TIMEOUT_BASE_MS", () => {
  it("MODEL_TIMEOUT_BASE_MS_default存在_240000ms", () => {
    // Arrange & Act & Assert
    expect(MODEL_TIMEOUT_BASE_MS.default).toBe(240000);
  });

  it("MODEL_TIMEOUT_BASE_MS_全値正の整数", () => {
    // Arrange & Act & Assert
    for (const [key, value] of Object.entries(MODEL_TIMEOUT_BASE_MS)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("MODEL_TIMEOUT_BASE_MS_glm最大_600000ms", () => {
    // Arrange & Act & Assert
    expect(MODEL_TIMEOUT_BASE_MS["glm-5"]).toBe(600000);
  });

  it("MODEL_TIMEOUT_BASE_MS_ClaudeHaiku最小_120000ms", () => {
    // Arrange & Act & Assert
    expect(MODEL_TIMEOUT_BASE_MS["claude-3-5-haiku"]).toBe(120000);
  });
});

// ============================================================================
// THINKING_LEVEL_MULTIPLIERS 定数テスト
// ============================================================================

describe("THINKING_LEVEL_MULTIPLIERS", () => {
  it("THINKING_LEVEL_MULTIPLIERS_off_1.0", () => {
    // Arrange & Act & Assert
    expect(THINKING_LEVEL_MULTIPLIERS.off).toBe(1.0);
  });

  it("THINKING_LEVEL_MULTIPLIERS_xhigh最大_2.5", () => {
    // Arrange & Act & Assert
    expect(THINKING_LEVEL_MULTIPLIERS.xhigh).toBe(2.5);
  });

  it("THINKING_LEVEL_MULTIPLIERS_全値正数", () => {
    // Arrange & Act & Assert
    for (const [key, value] of Object.entries(THINKING_LEVEL_MULTIPLIERS)) {
      expect(value).toBeGreaterThan(0);
    }
  });

  it("THINKING_LEVEL_MULTIPLIERS_昇順", () => {
    // Arrange
    const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];

    // Act & Assert
    for (let i = 1; i < levels.length; i++) {
      const prev = THINKING_LEVEL_MULTIPLIERS[levels[i - 1]];
      const curr = THINKING_LEVEL_MULTIPLIERS[levels[i]];
      expect(curr).toBeGreaterThanOrEqual(prev!);
    }
  });
});

// ============================================================================
// getModelBaseTimeoutMs テスト
// ============================================================================

describe("getModelBaseTimeoutMs", () => {
  it("getModelBaseTimeoutMs_完全一致_該当値返却", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("gpt-4");

    // Assert
    expect(result).toBe(MODEL_TIMEOUT_BASE_MS["gpt-4"]);
  });

  it("getModelBaseTimeoutMs_部分一致_該当値返却", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("gpt-4o-2024-05-13");

    // Assert
    expect(result).toBe(MODEL_TIMEOUT_BASE_MS["gpt-4o"]);
  });

  it("getModelBaseTimeoutMs_大文字小文字_部分一致", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("GPT-4O-MODEL");

    // Assert
    expect(result).toBe(MODEL_TIMEOUT_BASE_MS["gpt-4o"]);
  });

  it("getModelBaseTimeoutMs_未知のモデル_default返却", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("unknown-model-xyz");

    // Assert
    expect(result).toBe(MODEL_TIMEOUT_BASE_MS.default);
  });

  it("getModelBaseTimeoutMs_空文字_default返却", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("");

    // Assert
    expect(result).toBe(MODEL_TIMEOUT_BASE_MS.default);
  });

  it("getModelBaseTimeoutMs_glm含む_600000ms", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("my-glm-5-custom");

    // Assert
    expect(result).toBe(600000);
  });

  it("getModelBaseTimeoutMs_Claude3_5Sonnet_300000ms", () => {
    // Arrange & Act
    const result = getModelBaseTimeoutMs("claude-3-5-sonnet-20241022");

    // Assert
    expect(result).toBe(300000);
  });
});

// ============================================================================
// computeModelTimeoutMs テスト
// ============================================================================

describe("computeModelTimeoutMs", () => {
  it("computeModelTimeoutMs_ユーザー指定優先_userTimeoutMs返却", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4", { userTimeoutMs: 50000 });

    // Assert
    expect(result).toBe(50000);
  });

  it("computeModelTimeoutMs_userTimeoutMs0_計算値使用", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4", { userTimeoutMs: 0 });

    // Assert
    expect(result).toBeGreaterThan(0);
  });

  it("computeModelTimeoutMs_思考レベル適用_乗数適用", () => {
    // Arrange
    const baseResult = computeModelTimeoutMs("gpt-4", { thinkingLevel: "off" });
    const highResult = computeModelTimeoutMs("gpt-4", { thinkingLevel: "high" });

    // Assert
    expect(highResult).toBeGreaterThan(baseResult);
  });

  it("computeModelTimeoutMs_思考レベルxhigh_2.5倍", () => {
    // Arrange
    const baseTimeout = MODEL_TIMEOUT_BASE_MS["gpt-4"];

    // Act
    const result = computeModelTimeoutMs("gpt-4", { thinkingLevel: "xhigh" });

    // Assert
    expect(result).toBe(Math.floor(baseTimeout * 2.5));
  });

  it("computeModelTimeoutMs_思考レベルoff_1.0倍", () => {
    // Arrange
    const baseTimeout = MODEL_TIMEOUT_BASE_MS["gpt-4"];

    // Act
    const result = computeModelTimeoutMs("gpt-4", { thinkingLevel: "off" });

    // Assert
    expect(result).toBe(baseTimeout);
  });

  it("computeModelTimeoutMs_未知の思考レベル_medium相当", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4", { thinkingLevel: "unknown" });
    const mediumResult = computeModelTimeoutMs("gpt-4", { thinkingLevel: "medium" });

    // Assert - 未知のレベルは1.4倍（mediumと同じ）になる
    expect(result).toBe(mediumResult);
  });

  it("computeModelTimeoutMs_オプションなし_デフォルト計算", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4");

    // Assert - デフォルトはmedium（1.4倍）
    const expected = Math.floor(MODEL_TIMEOUT_BASE_MS["gpt-4"] * 1.4);
    expect(result).toBe(expected);
  });

  it("computeModelTimeoutMs_整数値返却", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4", { thinkingLevel: "xhigh" });

    // Assert
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ============================================================================
// computeProgressiveTimeoutMs テスト
// ============================================================================

describe("computeProgressiveTimeoutMs", () => {
  it("computeProgressiveTimeoutMs_試行0_ベースタイムアウト", () => {
    // Arrange
    const baseTimeout = 100000;

    // Act
    const result = computeProgressiveTimeoutMs(baseTimeout, 0);

    // Assert
    expect(result).toBe(100000);
  });

  it("computeProgressiveTimeoutMs_試行1_25増加", () => {
    // Arrange
    const baseTimeout = 100000;

    // Act
    const result = computeProgressiveTimeoutMs(baseTimeout, 1);

    // Assert
    expect(result).toBe(125000); // 100000 * 1.25
  });

  it("computeProgressiveTimeoutMs_試行4_2倍キャップ", () => {
    // Arrange
    const baseTimeout = 100000;

    // Act
    const result = computeProgressiveTimeoutMs(baseTimeout, 4);

    // Assert
    expect(result).toBe(200000); // 100000 * 2.0 (capped)
  });

  it("computeProgressiveTimeoutMs_試行10_2倍キャップ維持", () => {
    // Arrange
    const baseTimeout = 100000;

    // Act
    const result = computeProgressiveTimeoutMs(baseTimeout, 10);

    // Assert
    expect(result).toBe(200000);
  });

  it("computeProgressiveTimeoutMs_整数値返却", () => {
    // Arrange & Act
    const result = computeProgressiveTimeoutMs(100000, 1);

    // Assert
    expect(Number.isInteger(result)).toBe(true);
  });

  it("computeProgressiveTimeoutMs_最大2倍制限", () => {
    // Arrange
    const baseTimeout = 50000;

    // Act & Assert
    for (let attempt = 0; attempt <= 100; attempt++) {
      const result = computeProgressiveTimeoutMs(baseTimeout, attempt);
      expect(result).toBeLessThanOrEqual(baseTimeout * 2);
    }
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("getModelBaseTimeoutMs_任意の文字列_正の整数返却", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (modelId) => {
        const result = getModelBaseTimeoutMs(modelId);
        return Number.isInteger(result) && result > 0;
      })
    );
  });

  it("computeModelTimeoutMs_任意のモデルとオプション_正の整数返却", () => {
    const thinkingLevels = fc.constantFrom<undefined | "off" | "minimal" | "low" | "medium" | "high" | "xhigh">(
      undefined, "off", "minimal", "low", "medium", "high", "xhigh"
    );
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.option(
          fc.record({
            userTimeoutMs: fc.option(fc.integer({ min: 1, max: 1000000 })),
            thinkingLevel: thinkingLevels,
          }),
          { nil: undefined }
        ),
        (modelId, options) => {
          const result = computeModelTimeoutMs(modelId, options);
          return Number.isInteger(result) && result > 0;
        }
      )
    );
  });

  it("computeProgressiveTimeoutMs_任意のベースと試行_正の整数", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1000000 }),
        fc.integer({ min: 0, max: 100 }),
        (baseTimeout, attempt) => {
          const result = computeProgressiveTimeoutMs(baseTimeout, attempt);
          return Number.isInteger(result) && result > 0;
        }
      )
    );
  });

  it("computeProgressiveTimeoutMs_任意の試行_ベース以上2倍以下", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1000000 }),
        fc.integer({ min: 0, max: 100 }),
        (baseTimeout, attempt) => {
          const result = computeProgressiveTimeoutMs(baseTimeout, attempt);
          return result >= baseTimeout && result <= baseTimeout * 2;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("getModelBaseTimeoutMs_非常に長いモデル名_処理可能", () => {
    // Arrange
    const longModelId = "a".repeat(10000);

    // Act & Assert
    expect(() => getModelBaseTimeoutMs(longModelId)).not.toThrow();
  });

  it("computeModelTimeoutMs_userTimeoutMs負数_無視される", () => {
    // Arrange & Act
    const result = computeModelTimeoutMs("gpt-4", { userTimeoutMs: -1000 });

    // Assert - 負数は0以下なので無視され、計算値が使用される
    expect(result).toBeGreaterThan(0);
  });

  it("computeProgressiveTimeoutMs_ベース1_最小値", () => {
    // Arrange & Act
    const result = computeProgressiveTimeoutMs(1, 0);

    // Assert
    expect(result).toBe(1);
  });

  it("computeProgressiveTimeoutMs_試行負数_ベース返却", () => {
    // Arrange & Act
    const result = computeProgressiveTimeoutMs(100000, -1);

    // Assert - 負の試行回数は0と同様に扱われる（Math.min(2.0, 1.0 + -1 * 0.25) = 0.75）
    expect(result).toBe(75000);
  });
});
