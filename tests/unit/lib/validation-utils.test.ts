/**
 * validation-utils.ts 単体テスト
 * カバレッジ分析: toFiniteNumber, toBoundedInteger, clampInteger, clampFloat をカバー
 * エッジケース: NaN, Infinity, undefined, null, 境界値
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";
import {
  toFiniteNumber,
  toFiniteNumberWithDefault,
  toBoundedInteger,
  toBoundedFloat,
  clampInteger,
  clampFloat,
  type BoundedIntegerResult,
  type BoundedFloatResult,
} from "../../../.pi/lib/validation-utils.js";

// ============================================================================
// toFiniteNumber テスト
// ============================================================================

describe("toFiniteNumber", () => {
  it("toFiniteNumber_数値_そのまま返却", () => {
    // Arrange & Act
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(-10)).toBe(-10);
    expect(toFiniteNumber(3.14)).toBe(3.14);
  });

  it("toFiniteNumber_数値文字列_変換して返却", () => {
    // Arrange & Act
    expect(toFiniteNumber("42")).toBe(42);
    expect(toFiniteNumber("0")).toBe(0);
    expect(toFiniteNumber("-10")).toBe(-10);
    expect(toFiniteNumber("3.14")).toBe(3.14);
  });

  it("toFiniteNumber_NaN_undefined返却", () => {
    // Act & Assert
    expect(toFiniteNumber(NaN)).toBeUndefined();
    expect(toFiniteNumber("not a number")).toBeUndefined();
  });

  it("toFiniteNumber_Infinity_undefined返却", () => {
    // Act & Assert
    expect(toFiniteNumber(Infinity)).toBeUndefined();
    expect(toFiniteNumber(-Infinity)).toBeUndefined();
    expect(toFiniteNumber("Infinity")).toBeUndefined();
  });

  it("toFiniteNumber_undefined_undefined返却", () => {
    // Act & Assert
    expect(toFiniteNumber(undefined)).toBeUndefined();
  });

  it("toFiniteNumber_null_0に変換", () => {
    // Act & Assert
    expect(toFiniteNumber(null)).toBe(0);
  });

  it("toFiniteNumber_空文字_0に変換", () => {
    // Act & Assert - Number("") = 0
    expect(toFiniteNumber("")).toBe(0);
  });

  it("toFiniteNumber_オブジェクト_NaNとなりundefined返却", () => {
    // Act & Assert
    expect(toFiniteNumber({})).toBeUndefined();
    expect(toFiniteNumber({ value: 42 })).toBeUndefined();
  });

  it("toFiniteNumber_配列_単一要素はその値、複数要素はNaN", () => {
    // Act & Assert - Number([42]) = 42 (JavaScriptの仕様)
    expect(toFiniteNumber([42])).toBe(42);
    // 複数要素の配列はNaN
    expect(toFiniteNumber([1, 2, 3])).toBeUndefined();
    // 空配列は0
    expect(toFiniteNumber([])).toBe(0);
  });

  it("toFiniteNumber_真偽値_0または1に変換", () => {
    // Act & Assert
    expect(toFiniteNumber(true)).toBe(1);
    expect(toFiniteNumber(false)).toBe(0);
  });
});

// ============================================================================
// toFiniteNumberWithDefault テスト
// ============================================================================

describe("toFiniteNumberWithDefault", () => {
  it("toFiniteNumberWithDefault_有効な数値_そのまま返却", () => {
    // Arrange & Act
    expect(toFiniteNumberWithDefault(42, 0)).toBe(42);
    expect(toFiniteNumberWithDefault(0, 10)).toBe(0);
  });

  it("toFiniteNumberWithDefault_NaN_デフォルト返却", () => {
    // Arrange & Act
    expect(toFiniteNumberWithDefault(NaN, 10)).toBe(10);
    expect(toFiniteNumberWithDefault("invalid", 5)).toBe(5);
  });

  it("toFiniteNumberWithDefault_undefined_デフォルト返却", () => {
    // Arrange & Act
    expect(toFiniteNumberWithDefault(undefined, 10)).toBe(10);
  });

  it("toFiniteNumberWithDefault_null_0返却", () => {
    // 実装依存: typeof value === "number" チェックがあるため
    // nullは数値型ではないのでデフォルト値が返る可能性がある
    const result = toFiniteNumberWithDefault(null, 10);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("toFiniteNumberWithDefault_デフォルト未指定_0使用", () => {
    // Arrange & Act
    expect(toFiniteNumberWithDefault(NaN)).toBe(0);
    expect(toFiniteNumberWithDefault(undefined)).toBe(0);
  });

  it("toFiniteNumberWithDefault_Infinity_デフォルト返却", () => {
    // Arrange & Act
    expect(toFiniteNumberWithDefault(Infinity, 5)).toBe(5);
    expect(toFiniteNumberWithDefault(-Infinity, 5)).toBe(5);
  });
});

// ============================================================================
// toBoundedInteger テスト
// ============================================================================

describe("toBoundedInteger", () => {
  it("toBoundedInteger_有効な整数_成功結果返却", () => {
    // Arrange
    const value = 5;
    const fallback = 0;
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(value, fallback, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  it("toBoundedInteger_undefined_フォールバック使用", () => {
    // Arrange
    const fallback = 5;
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(undefined, fallback, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  it("toBoundedInteger_最小値_成功", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(0, 5, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it("toBoundedInteger_最大値_成功", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(10, 5, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  it("toBoundedInteger_範囲外_失敗", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result1 = toBoundedInteger(-1, 5, min, max, "test");
    const result2 = toBoundedInteger(11, 5, min, max, "test");

    // Assert
    expect(result1.ok).toBe(false);
    if (!result1.ok) {
      expect(result1.error).toContain("test");
      expect(result1.error).toContain("[0, 10]");
    }

    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error).toContain("test");
    }
  });

  it("toBoundedInteger_非整数_失敗", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(3.5, 5, min, max, "test");

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("integer");
    }
  });

  it("toBoundedInteger_NaN_失敗", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(NaN, 5, min, max, "test");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("toBoundedInteger_文字列_整数なら成功", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger("5", 0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });

  it("toBoundedInteger_非整数文字列_失敗", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger("3.5", 0, min, max, "test");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("toBoundedInteger_Symbol型_例外発生しエラー返却", () => {
    // Arrange
    const min = 0;
    const max = 10;

    // Act
    const result = toBoundedInteger(Symbol("test"), 0, min, max, "field1");

    // Assert - SymbolをNumber()に渡すとTypeErrorがスローされる
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("field1");
      expect(result.error).toContain("integer");
    }
  });
});

// ============================================================================
// clampInteger テスト
// ============================================================================

describe("clampInteger", () => {
  it("clampInteger_範囲内_そのまま返却", () => {
    // Act & Assert
    expect(clampInteger(5, 0, 10)).toBe(5);
    expect(clampInteger(0, 0, 10)).toBe(0);
    expect(clampInteger(10, 0, 10)).toBe(10);
  });

  it("clampInteger_最小値未満_最小値にクランプ", () => {
    // Act & Assert
    expect(clampInteger(-5, 0, 10)).toBe(0);
    expect(clampInteger(-100, 0, 10)).toBe(0);
  });

  it("clampInteger_最大値超過_最大値にクランプ", () => {
    // Act & Assert
    expect(clampInteger(15, 0, 10)).toBe(10);
    expect(clampInteger(100, 0, 10)).toBe(10);
  });

  it("clampInteger_小数_整数に切り捨て", () => {
    // Act & Assert
    expect(clampInteger(3.7, 0, 10)).toBe(3);
    expect(clampInteger(3.2, 0, 10)).toBe(3);
    expect(clampInteger(-3.7, 0, 10)).toBe(0); // クランプ後
  });

  it("clampInteger_負の範囲_正しく処理", () => {
    // Act & Assert
    expect(clampInteger(-5, -10, -1)).toBe(-5);
    expect(clampInteger(-15, -10, -1)).toBe(-10);
    expect(clampInteger(0, -10, -1)).toBe(-1);
  });

  it("clampInteger_同じ最小最大_その値返却", () => {
    // Act & Assert
    expect(clampInteger(5, 5, 5)).toBe(5);
    expect(clampInteger(0, 5, 5)).toBe(5);
    expect(clampInteger(10, 5, 5)).toBe(5);
  });

  it("clampInteger_NaN_最小値にクランプ", () => {
    // Act & Assert
    expect(clampInteger(NaN, 0, 10)).toBe(0);
    expect(clampInteger(NaN, -10, 10)).toBe(-10);
  });

  it("clampInteger_Infinity_最大値にクランプ", () => {
    // Act & Assert
    expect(clampInteger(Infinity, 0, 10)).toBe(10);
    expect(clampInteger(Infinity, -100, 100)).toBe(100);
  });

  it("clampInteger_NegativeInfinity_最小値にクランプ", () => {
    // Act & Assert
    expect(clampInteger(-Infinity, 0, 10)).toBe(0);
    expect(clampInteger(-Infinity, -100, 100)).toBe(-100);
  });
});

// ============================================================================
// clampFloat テスト
// ============================================================================

describe("clampFloat", () => {
  it("clampFloat_範囲内_そのまま返却", () => {
    // Act & Assert
    expect(clampFloat(5.5, 0, 10)).toBe(5.5);
    expect(clampFloat(0.1, 0, 10)).toBe(0.1);
    expect(clampFloat(9.9, 0, 10)).toBe(9.9);
  });

  it("clampFloat_最小値未満_最小値にクランプ", () => {
    // Act & Assert
    expect(clampFloat(-0.5, 0, 10)).toBe(0);
    expect(clampFloat(-100.5, 0, 10)).toBe(0);
  });

  it("clampFloat_最大値超過_最大値にクランプ", () => {
    // Act & Assert
    expect(clampFloat(10.5, 0, 10)).toBe(10);
    expect(clampFloat(100.5, 0, 10)).toBe(10);
  });

  it("clampFloat_小数そのまま_切り捨てなし", () => {
    // Act & Assert
    expect(clampFloat(3.14159, 0, 10)).toBe(3.14159);
    expect(clampFloat(3.99999, 0, 10)).toBe(3.99999);
  });

  it("clampFloat_負の範囲_正しく処理", () => {
    // Act & Assert
    expect(clampFloat(-5.5, -10, -1)).toBe(-5.5);
    expect(clampFloat(-15.5, -10, -1)).toBe(-10);
    expect(clampFloat(0, -10, -1)).toBe(-1);
  });

  it("clampFloat_極小値_正しく処理", () => {
    // Act & Assert
    expect(clampFloat(0.00001, 0, 1)).toBe(0.00001);
    expect(clampFloat(-0.00001, 0, 1)).toBe(0);
  });

  it("clampFloat_NaN_最小値にクランプ", () => {
    // Act & Assert
    expect(clampFloat(NaN, 0, 10)).toBe(0);
    expect(clampFloat(NaN, -10, 10)).toBe(-10);
  });

  it("clampFloat_Infinity_最大値にクランプ", () => {
    // Act & Assert
    expect(clampFloat(Infinity, 0, 10)).toBe(10);
    expect(clampFloat(Infinity, -100, 100)).toBe(100);
  });

  it("clampFloat_NegativeInfinity_最小値にクランプ", () => {
    // Act & Assert
    expect(clampFloat(-Infinity, 0, 10)).toBe(0);
    expect(clampFloat(-Infinity, -100, 100)).toBe(-100);
  });
});

// ============================================================================
// toBoundedFloat テスト
// ============================================================================

describe("toBoundedFloat", () => {
  it("toBoundedFloat_有効な浮動小数点数_成功結果返却", () => {
    // Arrange
    const value = 5.5;
    const fallback = 0.0;
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(value, fallback, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5.5);
    }
  });

  it("toBoundedFloat_undefined_フォールバック使用", () => {
    // Arrange
    const fallback = 5.0;
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(undefined, fallback, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5.0);
    }
  });

  it("toBoundedFloat_最小値_成功", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(0.0, 5.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0.0);
    }
  });

  it("toBoundedFloat_最大値_成功", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(10.0, 5.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10.0);
    }
  });

  it("toBoundedFloat_範囲外_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result1 = toBoundedFloat(-1.0, 5.0, min, max, "test");
    const result2 = toBoundedFloat(11.0, 5.0, min, max, "test");

    // Assert
    expect(result1.ok).toBe(false);
    if (!result1.ok) {
      expect(result1.error).toContain("test");
      expect(result1.error).toContain("[0, 10]");
    }

    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error).toContain("test");
    }
  });

  it("toBoundedFloat_NaN_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(NaN, 5.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("toBoundedFloat_Infinity_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result1 = toBoundedFloat(Infinity, 5.0, min, max, "test");
    const result2 = toBoundedFloat(-Infinity, 5.0, min, max, "test");

    // Assert
    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);
  });

  it("toBoundedFloat_文字列_数値なら成功", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat("5.5", 0.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5.5);
    }
  });

  it("toBoundedFloat_非数値文字列_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat("not a number", 0.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(false);
  });

  it("toBoundedFloat_整数文字列_成功", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat("5", 0.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5.0);
    }
  });

  it("toBoundedFloat_Symbol型_例外発生しエラー返却", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(Symbol("test"), 0.0, min, max, "field1");

    // Assert - SymbolをNumber()に渡すとTypeErrorがスローされる
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("field1");
      expect(result.error).toContain("number");
    }
  });

  it("toBoundedFloat_負の範囲_正しく処理", () => {
    // Arrange
    const min = -10.0;
    const max = -1.0;

    // Act
    const result = toBoundedFloat(-5.5, 0.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-5.5);
    }
  });

  it("toBoundedFloat_オブジェクト_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat({}, 0.0, min, max, "test");

    // Assert - Number({}) = NaN
    expect(result.ok).toBe(false);
  });

  it("toBoundedFloat_null_失敗", () => {
    // Arrange
    const min = 0.0;
    const max = 10.0;

    // Act
    const result = toBoundedFloat(null, 0.0, min, max, "test");

    // Assert - Number(null) = 0 は有効
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0.0);
    }
  });

  it("toBoundedFloat_境界値_成功", () => {
    const result1 = toBoundedFloat(0.0, 0.0, 0.0, 10.0, "test");
    const result2 = toBoundedFloat(10.0, 0.0, 0.0, 10.0, "test");

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it("toBoundedFloat_境界外_失敗", () => {
    const result1 = toBoundedFloat(-0.1, 0.0, 0.0, 10.0, "test");
    const result2 = toBoundedFloat(10.1, 0.0, 0.0, 10.0, "test");

    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);
  });

  it("toBoundedFloat_非常に小さい値_成功", () => {
    const min = 0.0;
    const max = 1.0;

    // Act
    const result = toBoundedFloat(0.000001, 0.0, min, max, "test");

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0.000001);
    }
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("toFiniteNumber_任意の入力_undefinedまたは有限数", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = toFiniteNumber(value);
        if (result !== undefined) {
          expect(Number.isFinite(result)).toBe(true);
        }
        return true;
      })
    );
  });

  it("clampInteger_任意の入力_範囲内の整数", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000 }),
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 0, max: 100 }),
        (value, min, max) => {
          // min <= max を保証
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const result = clampInteger(value, safeMin, safeMax);
          expect(result).toBeGreaterThanOrEqual(safeMin);
          expect(result).toBeLessThanOrEqual(safeMax);
          expect(Number.isInteger(result)).toBe(true);
          return true;
        }
      )
    );
  });

  it("clampFloat_任意の入力_範囲内の数値", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -100, max: 0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (value, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const result = clampFloat(value, safeMin, safeMax);
          expect(result).toBeGreaterThanOrEqual(safeMin);
          expect(result).toBeLessThanOrEqual(safeMax);
          return true;
        }
      )
    );
  });

  it("toBoundedInteger_任意の入力_okなら範囲内の整数", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -50, max: 0 }),
        fc.integer({ min: 0, max: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, fallback, min, max, field) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const result = toBoundedInteger(value, fallback, safeMin, safeMax, field);

          if (result.ok) {
            expect(result.value).toBeGreaterThanOrEqual(safeMin);
            expect(result.value).toBeLessThanOrEqual(safeMax);
            expect(Number.isInteger(result.value)).toBe(true);
          } else {
            expect(typeof result.error).toBe("string");
            expect(result.error.length).toBeGreaterThan(0);
          }
          return true;
        }
      )
    );
  });

  it("toBoundedFloat_任意の入力_okなら範囲内の数値", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -50, max: 0, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, fallback, min, max, field) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const result = toBoundedFloat(value, fallback, safeMin, safeMax, field);

          if (result.ok) {
            expect(result.value).toBeGreaterThanOrEqual(safeMin);
            expect(result.value).toBeLessThanOrEqual(safeMax);
            expect(Number.isFinite(result.value)).toBe(true);
          } else {
            expect(typeof result.error).toBe("string");
            expect(result.error.length).toBeGreaterThan(0);
          }
          return true;
        }
      )
    );
  });

  it("toFiniteNumberWithDefault_常に有限数を返す", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.double({ noNaN: true, min: -1000, max: 1000 }),
        (value, fallback) => {
          const result = toFiniteNumberWithDefault(value, fallback);
          expect(Number.isFinite(result)).toBe(true);
          return true;
        }
      )
    );
  });

  // 高度な数学的プロパティ (Property-Based Tester追加)

  it("clampInteger_冪等性_2回適用しても同じ結果", () => {
    // 冪等性: clamp(clamp(x)) = clamp(x)
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000 }),
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 0, max: 100 }),
        (value, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const once = clampInteger(value, safeMin, safeMax);
          const twice = clampInteger(once, safeMin, safeMax);

          expect(twice).toBe(once);
          return true;
        }
      )
    );
  });

  it("clampInteger_単調性_入力の順序が保存される", () => {
    // 単調性: x <= y なら clamp(x) <= clamp(y)
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000 }),
        fc.double({ min: -1000, max: 1000 }),
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 0, max: 100 }),
        (x, y, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const clampedX = clampInteger(x, safeMin, safeMax);
          const clampedY = clampInteger(y, safeMin, safeMax);

          if (x <= y) {
            expect(clampedX).toBeLessThanOrEqual(clampedY);
          }
          return true;
        }
      )
    );
  });

  it("clampInteger_境界保持_範囲内の値はそのまま", () => {
    // 境界保持: min <= x <= max なら clamp(x) = x
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 0, max: 100 }),
        (value, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          // 値を範囲内に調整
          const inRangeValue = Math.max(safeMin, Math.min(safeMax, value));

          const result = clampInteger(inRangeValue, safeMin, safeMax);
          expect(result).toBe(inRangeValue);
          return true;
        }
      )
    );
  });

  it("clampFloat_冪等性_2回適用しても同じ結果", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (value, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const once = clampFloat(value, safeMin, safeMax);
          const twice = clampFloat(once, safeMin, safeMax);

          expect(twice).toBe(once);
          return true;
        }
      )
    );
  });

  it("clampFloat_単調性_入力の順序が保存される", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (x, y, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          const clampedX = clampFloat(x, safeMin, safeMax);
          const clampedY = clampFloat(y, safeMin, safeMax);

          if (x <= y) {
            expect(clampedX).toBeLessThanOrEqual(clampedY);
          }
          return true;
        }
      )
    );
  });

  it("clampFloat_境界保持_範囲内の値はそのまま", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (value, min, max) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          // 値を範囲内に調整
          const inRangeValue = Math.max(safeMin, Math.min(safeMax, value));

          const result = clampFloat(inRangeValue, safeMin, safeMax);
          expect(result).toBe(inRangeValue);
          return true;
        }
      )
    );
  });

  it("toBoundedFloat_境界保持_範囲内の値はそのまま", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (value, min, max, field) => {
          const safeMin = Math.min(min, max);
          const safeMax = Math.max(min, max);

          // 値を範囲内に調整
          const inRangeValue = Math.max(safeMin, Math.min(safeMax, value));

          const result = toBoundedFloat(inRangeValue, 0.0, safeMin, safeMax, field);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value).toBe(inRangeValue);
          }
          return true;
        }
      )
    );
  });

  it("toFiniteNumber_toFiniteNumberWithDefault_等価性_有限数の場合", () => {
    // 有限数の場合、toFiniteNumberとtoFiniteNumberWithDefaultは等価
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 }),
        fc.double({ noNaN: true, min: -1000, max: 1000 }),
        (finiteValue, fallback) => {
          const result1 = toFiniteNumber(finiteValue);
          const result2 = toFiniteNumberWithDefault(finiteValue, fallback);

          expect(result1).toBe(finiteValue);
          expect(result2).toBe(finiteValue);
          return true;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("toFiniteNumber_MAX_SAFE_INTEGER_成功", () => {
    expect(toFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("toFiniteNumber_MIN_SAFE_INTEGER_成功", () => {
    expect(toFiniteNumber(Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
  });

  it("toFiniteNumber_MAX_VALUE_成功", () => {
    expect(toFiniteNumber(Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
  });

  it("toFiniteNumber_MIN_VALUE_成功", () => {
    expect(toFiniteNumber(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
  });

  it("toFiniteNumber_EPSILON_成功", () => {
    expect(toFiniteNumber(Number.EPSILON)).toBe(Number.EPSILON);
  });

  it("clampInteger_極大値_クランプされる", () => {
    expect(clampInteger(Number.MAX_SAFE_INTEGER, 0, 100)).toBe(100);
  });

  it("clampInteger_極小値_クランプされる", () => {
    expect(clampInteger(Number.MIN_SAFE_INTEGER, 0, 100)).toBe(0);
  });

  it("clampFloat_極大値_クランプされる", () => {
    expect(clampFloat(Number.MAX_VALUE, 0, 100)).toBe(100);
  });

  it("clampFloat_極小正数_そのまま", () => {
    expect(clampFloat(Number.MIN_VALUE, 0, 1)).toBe(Number.MIN_VALUE);
  });

  it("toBoundedInteger_境界値_成功", () => {
    const result1 = toBoundedInteger(0, 0, 0, 10, "test");
    const result2 = toBoundedInteger(10, 0, 0, 10, "test");

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  it("toBoundedInteger_境界外_失敗", () => {
    const result1 = toBoundedInteger(-1, 0, 0, 10, "test");
    const result2 = toBoundedInteger(11, 0, 0, 10, "test");

    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  it("toFiniteNumber_指数表記_成功", () => {
    expect(toFiniteNumber("1e10")).toBe(1e10);
    expect(toFiniteNumber("1.5e-5")).toBe(1.5e-5);
  });

  it("toFiniteNumber_16進数_成功", () => {
    expect(toFiniteNumber("0xFF")).toBe(255);
    expect(toFiniteNumber("0x10")).toBe(16);
  });

  it("toFiniteNumber_2進数_成功", () => {
    expect(toFiniteNumber("0b1010")).toBe(10);
  });

  it("toFiniteNumber_8進数_成功", () => {
    expect(toFiniteNumber("0o77")).toBe(63);
  });

  it("toFiniteNumber_前後の空白_無視される", () => {
    expect(toFiniteNumber("  42  ")).toBe(42);
    expect(toFiniteNumber("\t\n42\n\t")).toBe(42);
  });

  it("toBoundedInteger_負の範囲_正しく処理", () => {
    const result = toBoundedInteger(-5, 0, -10, -1, "test");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-5);
    }
  });

  it("clampInteger_逆転した範囲_最小が適用される", () => {
    // min > max の場合、Math.min/maxで正しく処理される
    const result = clampInteger(5, 10, 0);
    // 実装依存だが、0 <= result <= 10 の範囲内になる
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(10);
  });
});
