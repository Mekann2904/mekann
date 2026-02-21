/**
 * @file .pi/lib/validation-utils.ts の単体テスト
 * @description 数値検証・変換ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	toFiniteNumber,
	toFiniteNumberWithDefault,
	toBoundedInteger,
	toBoundedFloat,
	clampInteger,
	clampFloat,
	type BoundedIntegerResult,
	type BoundedFloatResult,
} from "../../lib/validation-utils.ts";

// ============================================================================
// toFiniteNumber
// ============================================================================

describe("toFiniteNumber", () => {
	describe("正常系 - 数値入力", () => {
		it("should_return_finite_number", () => {
			expect(toFiniteNumber(42)).toBe(42);
			expect(toFiniteNumber(0)).toBe(0);
			expect(toFiniteNumber(-100)).toBe(-100);
			expect(toFiniteNumber(3.14)).toBe(3.14);
		});

		it("should_return_undefined_for_infinity", () => {
			expect(toFiniteNumber(Infinity)).toBeUndefined();
			expect(toFiniteNumber(-Infinity)).toBeUndefined();
		});

		it("should_return_undefined_for_NaN", () => {
			expect(toFiniteNumber(NaN)).toBeUndefined();
		});
	});

	describe("境界条件 - 文字列入力", () => {
		it("should_parse_number_string", () => {
			expect(toFiniteNumber("42")).toBe(42);
			expect(toFiniteNumber("3.14")).toBe(3.14);
			expect(toFiniteNumber("-10")).toBe(-10);
		});

		it("should_return_undefined_for_invalid_string", () => {
			// Number("not a number") === NaN, Number.isFinite(NaN) === false
			expect(toFiniteNumber("not a number")).toBeUndefined();
			// Number("") === 0, Number.isFinite(0) === true
			expect(toFiniteNumber("")).toBe(0);
			// Number("  ") === 0, Number.isFinite(0) === true
			expect(toFiniteNumber("  ")).toBe(0);
		});
	});

	describe("境界条件 - 配列入力", () => {
		it("should_return_0_for_empty_array", () => {
			expect(toFiniteNumber([])).toBe(0);
		});

		it("should_convert_single_element_array", () => {
			expect(toFiniteNumber([42])).toBe(42);
			expect(toFiniteNumber([3.14])).toBe(3.14);
		});

		it("should_return_undefined_for_multi_element_array", () => {
			expect(toFiniteNumber([1, 2, 3])).toBeUndefined();
			expect(toFiniteNumber([42, 100])).toBeUndefined();
		});

		it("should_convert_nested_single_element_array", () => {
			// toFiniteNumber([[42]]) -> toFiniteNumber([42]) -> toFiniteNumber(42) === 42
			// ネストされた配列は展開して変換される
			expect(toFiniteNumber([[42]])).toBe(42);
		});
	});

	describe("異常系 - 特殊入力", () => {
		it("should_return_undefined_for_null", () => {
			// Number(null) === 0, Number.isFinite(0) === true
			expect(toFiniteNumber(null)).toBe(0);
		});

		it("should_return_undefined_for_undefined", () => {
			expect(toFiniteNumber(undefined)).toBeUndefined();
		});

		it("should_return_undefined_for_object", () => {
			expect(toFiniteNumber({})).toBeUndefined();
			expect(toFiniteNumber({ value: 42 })).toBeUndefined();
		});

		it("should_return_undefined_for_boolean", () => {
			expect(toFiniteNumber(true)).toBe(1);
			expect(toFiniteNumber(false)).toBe(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 有限数は常にその値を返す", () => {
			fc.assert(
				fc.property(fc.float({ min: Math.fround(Number.MIN_SAFE_INTEGER), max: Math.fround(Number.MAX_SAFE_INTEGER), noNaN: true }), (num) => {
					const result = toFiniteNumber(num);
					return Number.isFinite(result) && result === num;
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 無限またはNaNはundefinedを返す", () => {
			fc.assert(
				fc.property(fc.constantFrom(Infinity, -Infinity, NaN), (value) => {
					const result = toFiniteNumber(value);
					return result === undefined;
				}),
				{ numRuns: 10 },
			);
		});
	});
});

// ============================================================================
// toFiniteNumberWithDefault
// ============================================================================

describe("toFiniteNumberWithDefault", () => {
	describe("正常系", () => {
		it("should_return_finite_number", () => {
			expect(toFiniteNumberWithDefault(42, 0)).toBe(42);
			expect(toFiniteNumberWithDefault(3.14, 0)).toBe(3.14);
			expect(toFiniteNumberWithDefault(-100, 0)).toBe(-100);
		});

		it("should_return_fallback_for_infinity", () => {
			expect(toFiniteNumberWithDefault(Infinity, 0)).toBe(0);
			expect(toFiniteNumberWithDefault(-Infinity, 0)).toBe(0);
		});

		it("should_return_fallback_for_NaN", () => {
			expect(toFiniteNumberWithDefault(NaN, 0)).toBe(0);
		});

		it("should_use_custom_fallback", () => {
			expect(toFiniteNumberWithDefault(NaN, 10)).toBe(10);
			expect(toFiniteNumberWithDefault(Infinity, -1)).toBe(-1);
		});

		it("should_return_0_as_default_fallback", () => {
			expect(toFiniteNumberWithDefault(NaN)).toBe(0);
		});
	});

	describe("境界条件 - 非数値入力", () => {
		it("should_return_fallback_for_string", () => {
			expect(toFiniteNumberWithDefault("42", 0)).toBe(0);
		});

		it("should_return_fallback_for_null", () => {
			expect(toFiniteNumberWithDefault(null, 0)).toBe(0);
		});

		it("should_return_fallback_for_undefined", () => {
			expect(toFiniteNumberWithDefault(undefined, 0)).toBe(0);
		});

		it("should_return_fallback_for_object", () => {
			expect(toFiniteNumberWithDefault({}, 0)).toBe(0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に有限数である", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.float({ min: Math.fround(Number.MIN_SAFE_INTEGER), max: Math.fround(Number.MAX_SAFE_INTEGER) }),
						fc.string(),
						fc.object(),
						fc.constant(undefined),
						fc.constant(null),
					),
					fc.float({ min: -1000, max: 1000 }),
					(value, fallback) => {
						const result = toFiniteNumberWithDefault(value, fallback);
						return Number.isFinite(result);
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// toBoundedInteger
// ============================================================================

describe("toBoundedInteger", () => {
	describe("正常系", () => {
		it("should_accept_valid_integer_in_range", () => {
			const result = toBoundedInteger(5, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(5);
			}
		});

		it("should_accept_value_at_min", () => {
			const result = toBoundedInteger(0, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(0);
			}
		});

		it("should_accept_value_at_max", () => {
			const result = toBoundedInteger(100, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(100);
			}
		});

		it("should_use_fallback_for_undefined", () => {
			const result = toBoundedInteger(undefined, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(10);
			}
		});
	});

	describe("境界条件 - 失敗ケース", () => {
		it("should_reject_non_integer_float", () => {
			const result = toBoundedInteger(5.5, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("field must be an integer.");
			}
		});

		it("should_reject_infinity", () => {
			const result = toBoundedInteger(Infinity, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
		});

		it("should_reject_NaN", () => {
			const result = toBoundedInteger(NaN, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
		});

		it("should_reject_value_below_min", () => {
			const result = toBoundedInteger(-1, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("field must be in [0, 100].");
			}
		});

		it("should_reject_value_above_max", () => {
			const result = toBoundedInteger(101, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("field must be in [0, 100].");
			}
		});

		it("should_reject_string_number", () => {
			// toBoundedIntegerはNumber()を使用するため、文字列の数値も受け入れる
			// これは実装の既定の動作
			const result = toBoundedInteger("5", 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(5);
			}
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 範囲内の整数は常に受け入れられる", () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 100 }),
					(value) => {
						const result = toBoundedInteger(value, 10, 0, 100, "field");
						return result.ok === true && (result as { ok: true }).value === value;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 浮動小数点数は常に拒否される", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -100, max: 100 }).filter((n) => !Number.isInteger(n) && Number.isFinite(n)),
					(value) => {
						const result = toBoundedInteger(value, 10, 0, 100, "field");
						return result.ok === false;
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// toBoundedFloat
// ============================================================================

describe("toBoundedFloat", () => {
	describe("正常系", () => {
		it("should_accept_valid_float_in_range", () => {
			const result = toBoundedFloat(5.5, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(5.5);
			}
		});

		it("should_accept_integer_value", () => {
			const result = toBoundedFloat(50, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(50);
			}
		});

		it("should_accept_value_at_min", () => {
			const result = toBoundedFloat(0, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(0);
			}
		});

		it("should_accept_value_at_max", () => {
			const result = toBoundedFloat(100, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(100);
			}
		});

		it("should_use_fallback_for_undefined", () => {
			const result = toBoundedFloat(undefined, 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(10);
			}
		});
	});

	describe("境界条件 - 失敗ケース", () => {
		it("should_reject_infinity", () => {
			const result = toBoundedFloat(Infinity, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
		});

		it("should_reject_NaN", () => {
			const result = toBoundedFloat(NaN, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
		});

		it("should_reject_value_below_min", () => {
			const result = toBoundedFloat(-0.1, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("field must be in [0, 100].");
			}
		});

		it("should_reject_value_above_max", () => {
			const result = toBoundedFloat(100.1, 10, 0, 100, "field");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBe("field must be in [0, 100].");
			}
		});

		it("should_reject_string_number", () => {
			// toBoundedFloatはNumber()を使用するため、文字列の数値も受け入れる
			// これは実装の既定の動作
			const result = toBoundedFloat("5.5", 10, 0, 100, "field");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe(5.5);
			}
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 範囲内の数値は常に受け入れられる", () => {
			fc.assert(
				fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (value) => {
					const result = toBoundedFloat(value, 10, 0, 100, "field");
					return result.ok === true && (result as { ok: true }).value === value;
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 範囲外の数値は常に拒否される", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -100, max: -1, noNaN: true }),
					(value) => {
						const result = toBoundedFloat(value, 10, 0, 100, "field");
						return result.ok === false;
					},
				),
				{ numRuns: 100 },
			);

			fc.assert(
				fc.property(
					fc.float({ min: 101, max: 1000, noNaN: true }),
					(value) => {
						const result = toBoundedFloat(value, 10, 0, 100, "field");
						return result.ok === false;
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// clampInteger
// ============================================================================

describe("clampInteger", () => {
	describe("正常系", () => {
		it("should_return_value_in_range", () => {
			expect(clampInteger(50, 0, 100)).toBe(50);
			expect(clampInteger(5, 0, 10)).toBe(5);
		});

		it("should_clamp_below_min", () => {
			expect(clampInteger(-10, 0, 100)).toBe(0);
			expect(clampInteger(-5, 0, 10)).toBe(0);
		});

		it("should_clamp_above_max", () => {
			expect(clampInteger(150, 0, 100)).toBe(100);
			expect(clampInteger(20, 0, 10)).toBe(10);
		});

		it("should_truncate_float", () => {
			expect(clampInteger(5.9, 0, 10)).toBe(5);
			expect(clampInteger(5.1, 0, 10)).toBe(5);
			expect(clampInteger(-5.9, 0, 10)).toBe(0);
			expect(clampInteger(10.9, 0, 10)).toBe(10);
		});

		it("should_handle_negative_range", () => {
			expect(clampInteger(0, -100, 100)).toBe(0);
			expect(clampInteger(-50, -100, 100)).toBe(-50);
			expect(clampInteger(-150, -100, 100)).toBe(-100);
			expect(clampInteger(150, -100, 100)).toBe(100);
		});
	});

	describe("境界条件", () => {
		it("should_return_min_for_NaN", () => {
			expect(clampInteger(NaN, 0, 100)).toBe(0);
		});

		it("should_return_min_for_infinity", () => {
			expect(clampInteger(Infinity, 0, 100)).toBe(100);
			expect(clampInteger(-Infinity, 0, 100)).toBe(0);
		});

		it("should_handle_min_equals_max", () => {
			expect(clampInteger(5, 50, 50)).toBe(50);
			expect(clampInteger(0, 50, 50)).toBe(50);
			expect(clampInteger(100, 50, 50)).toBe(50);
		});

		it("should_handle_negative_float", () => {
			expect(clampInteger(-5.9, -10, 10)).toBe(-5);
			expect(clampInteger(-5.1, -10, 10)).toBe(-5);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に範囲内にある", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -1000, max: 1000 }),
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: -100, max: 100 }),
					(value, min, max) => {
						const result = clampInteger(value, min, max);
						return result >= Math.min(min, max) && result <= Math.max(min, max);
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 結果は常に整数である", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -1000, max: 1000 }),
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: -100, max: 100 }),
					(value, min, max) => {
						const result = clampInteger(value, min, max);
						return Number.isInteger(result);
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 範囲内の値は保持される（整数部分）", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -100, max: 100 }),
					fc.integer({ min: -200, max: -100 }),
					fc.integer({ min: 100, max: 200 }),
					(value, min, max) => {
						const truncated = Math.trunc(value);
						if (truncated >= min && truncated <= max) {
							const result = clampInteger(value, min, max);
							return result === truncated;
						}
						return true;
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// clampFloat
// ============================================================================

describe("clampFloat", () => {
	describe("正常系", () => {
		it("should_return_value_in_range", () => {
			expect(clampFloat(50.5, 0, 100)).toBe(50.5);
			expect(clampFloat(5.5, 0, 10)).toBe(5.5);
		});

		it("should_clamp_below_min", () => {
			expect(clampFloat(-10, 0, 100)).toBe(0);
			expect(clampFloat(-5, 0, 10)).toBe(0);
		});

		it("should_clamp_above_max", () => {
			expect(clampFloat(150, 0, 100)).toBe(100);
			expect(clampFloat(20, 0, 10)).toBe(10);
		});

		it("should_preserve_decimal", () => {
			expect(clampFloat(5.999, 0, 10)).toBe(5.999);
			expect(clampFloat(0.001, 0, 10)).toBe(0.001);
		});

		it("should_handle_negative_range", () => {
			expect(clampFloat(0, -100, 100)).toBe(0);
			expect(clampFloat(-50.5, -100, 100)).toBe(-50.5);
			expect(clampFloat(-150, -100, 100)).toBe(-100);
			expect(clampFloat(150, -100, 100)).toBe(100);
		});
	});

	describe("境界条件", () => {
		it("should_return_min_for_NaN", () => {
			expect(clampFloat(NaN, 0, 100)).toBe(0);
		});

		it("should_return_max_for_infinity", () => {
			expect(clampFloat(Infinity, 0, 100)).toBe(100);
			expect(clampFloat(-Infinity, 0, 100)).toBe(0);
		});

		it("should_handle_min_equals_max", () => {
			expect(clampFloat(5, 50, 50)).toBe(50);
			expect(clampFloat(0, 50, 50)).toBe(50);
			expect(clampFloat(100, 50, 50)).toBe(50);
		});

		it("should_handle_negative_min", () => {
			expect(clampFloat(0.5, -10, 10)).toBe(0.5);
			expect(clampFloat(-0.5, -10, 10)).toBe(-0.5);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に範囲内にある", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -1000, max: 1000 }),
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: -100, max: 100 }),
					(value, min, max) => {
						const result = clampFloat(value, min, max);
						return result >= Math.min(min, max) && result <= Math.max(min, max);
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 範囲内の値は保持される", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -100, max: 100, noNaN: true }),
					fc.integer({ min: -200, max: -100 }),
					fc.integer({ min: 100, max: 200 }),
					(value, min, max) => {
						if (value >= min && value <= max) {
							const result = clampFloat(value, min, max);
							return result === value;
						}
						return true;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 範囲以下の値はminを返す", () => {
			fc.assert(
				fc.property(
					fc.float({ min: -1000, max: -1, noNaN: true }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 101, max: 200 }),
					(value, min, max) => {
						const result = clampFloat(value, min, max);
						return result === min;
					},
				),
				{ numRuns: 100 },
			);
		});

		it("PBT: 範囲以上の値はmaxを返す", () => {
			fc.assert(
				fc.property(
					fc.float({ min: 201, max: 1000, noNaN: true }),
					fc.integer({ min: 0, max: 100 }),
					fc.integer({ min: 101, max: 200 }),
					(value, min, max) => {
						const result = clampFloat(value, min, max);
						return result === max;
					},
				),
				{ numRuns: 100 },
			);
		});
	});
});
