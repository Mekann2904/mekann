/**
 * @jest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  toFiniteNumber,
  toFiniteNumberWithDefault,
  toBoundedInteger,
  toBoundedFloat,
  clampInteger,
  clampFloat,
  BoundedIntegerResult,
  BoundedFloatResult,
} from "../../../lib/core/validation-utils.js";

describe("toFiniteNumber", () => {
  it("should return number for valid numbers", () => {
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber(-10)).toBe(-10);
    expect(toFiniteNumber(3.14)).toBe(3.14);
    expect(toFiniteNumber(-0.5)).toBe(-0.5);
  });

  it("should convert numeric strings", () => {
    expect(toFiniteNumber("42")).toBe(42);
    expect(toFiniteNumber("3.14")).toBe(3.14);
    expect(toFiniteNumber("-10")).toBe(-10);
    expect(toFiniteNumber("0")).toBe(0);
  });

  it("should return undefined for non-finite numbers", () => {
    expect(toFiniteNumber(Infinity)).toBeUndefined();
    expect(toFiniteNumber(-Infinity)).toBeUndefined();
    expect(toFiniteNumber(NaN)).toBeUndefined();
  });

  it("should return undefined for non-numeric strings", () => {
    expect(toFiniteNumber("abc")).toBeUndefined();
    expect(toFiniteNumber("123abc")).toBeUndefined();
  });

  it("should convert empty string to 0", () => {
    // Number("") === 0 in JavaScript
    expect(toFiniteNumber("")).toBe(0);
  });

  it("should return undefined for objects", () => {
    expect(toFiniteNumber({})).toBeUndefined();
    expect(toFiniteNumber({ value: 42 })).toBeUndefined();
    expect(toFiniteNumber({ toString: () => "42" })).toBeUndefined();
    expect(toFiniteNumber({ valueOf: () => 42 })).toBeUndefined();
  });

  it("should convert null and undefined to 0 or undefined", () => {
    // Number(null) === 0, Number(undefined) === NaN
    expect(toFiniteNumber(null)).toBe(0);
    expect(toFiniteNumber(undefined)).toBeUndefined();
  });

  it("should convert booleans to numbers", () => {
    // Number(true) === 1, Number(false) === 0 in JavaScript
    expect(toFiniteNumber(true)).toBe(1);
    expect(toFiniteNumber(false)).toBe(0);
  });

  it("should return undefined for functions", () => {
    expect(toFiniteNumber(() => 42)).toBeUndefined();
  });

  it("should throw or return undefined for symbols", () => {
    // Symbol throws when converted to number
    expect(() => toFiniteNumber(Symbol("test"))).toThrow();
  });

  it("should handle single-element arrays", () => {
    expect(toFiniteNumber([42])).toBe(42);
    expect(toFiniteNumber([3.14])).toBe(3.14);
    expect(toFiniteNumber(["42"])).toBe(42);
  });

  it("should return 0 for empty arrays", () => {
    expect(toFiniteNumber([])).toBe(0);
  });

  it("should return undefined for multi-element arrays", () => {
    expect(toFiniteNumber([1, 2])).toBeUndefined();
    expect(toFiniteNumber([1, 2, 3])).toBeUndefined();
  });

  it("should handle nested arrays", () => {
    // [[42]] -> [42] (single element) -> 42
    expect(toFiniteNumber([[42]])).toBe(42);
    // [[]] -> [] (empty) -> 0
    expect(toFiniteNumber([[]])).toBe(0);
  });
});

describe("toFiniteNumberWithDefault", () => {
  it("should return number if already finite", () => {
    expect(toFiniteNumberWithDefault(42)).toBe(42);
    expect(toFiniteNumberWithDefault(-10)).toBe(-10);
    expect(toFiniteNumberWithDefault(3.14)).toBe(3.14);
  });

  it("should return default for non-finite values", () => {
    expect(toFiniteNumberWithDefault(NaN)).toBe(0);
    expect(toFiniteNumberWithDefault(Infinity)).toBe(0);
    expect(toFiniteNumberWithDefault("abc")).toBe(0);
    expect(toFiniteNumberWithDefault(null)).toBe(0);
    expect(toFiniteNumberWithDefault(undefined)).toBe(0);
  });

  it("should use custom fallback", () => {
    expect(toFiniteNumberWithDefault(NaN, 10)).toBe(10);
    expect(toFiniteNumberWithDefault("abc", 100)).toBe(100);
    expect(toFiniteNumberWithDefault(null, -1)).toBe(-1);
  });

  it("should use 0 if fallback is not finite", () => {
    expect(toFiniteNumberWithDefault(NaN, NaN)).toBe(0);
    expect(toFiniteNumberWithDefault(NaN, Infinity)).toBe(0);
  });

  it("should accept valid numeric strings", () => {
    // Note: toFiniteNumberWithDefault checks typeof value === "number" first
    // String "42" is not a number type, so it returns fallback
    expect(toFiniteNumberWithDefault("42", 0)).toBe(0);
    expect(toFiniteNumberWithDefault(42, 0)).toBe(42);
  });
});

describe("toBoundedInteger", () => {
  it("should return valid integer within bounds", () => {
    const result = toBoundedInteger(5, 0, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("should use fallback when value is undefined", () => {
    const result = toBoundedInteger(undefined, 5, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("should reject non-integer values", () => {
    const result = toBoundedInteger(3.14, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be an integer." });
  });

  it("should reject values below minimum", () => {
    const result = toBoundedInteger(-1, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be in [0, 10]." });
  });

  it("should reject values above maximum", () => {
    const result = toBoundedInteger(11, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be in [0, 10]." });
  });

  it("should accept boundary values", () => {
    expect(toBoundedInteger(0, 0, 0, 10, "test")).toEqual({ ok: true, value: 0 });
    expect(toBoundedInteger(10, 0, 0, 10, "test")).toEqual({ ok: true, value: 10 });
  });

  it("should handle string numbers", () => {
    const result = toBoundedInteger("5", 0, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("should reject non-numeric strings", () => {
    const result = toBoundedInteger("abc", 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be an integer." });
  });

  it("should reject NaN", () => {
    const result = toBoundedInteger(NaN, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be an integer." });
  });

  it("should reject Infinity", () => {
    const result = toBoundedInteger(Infinity, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be an integer." });
  });

  it("should handle negative ranges", () => {
    const result = toBoundedInteger(-5, 0, -10, -1, "test");
    expect(result).toEqual({ ok: true, value: -5 });
  });
});

describe("toBoundedFloat", () => {
  it("should return valid float within bounds", () => {
    const result = toBoundedFloat(3.14, 0, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 3.14 });
  });

  it("should return valid integer within bounds", () => {
    const result = toBoundedFloat(5, 0, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it("should use fallback when value is undefined", () => {
    const result = toBoundedFloat(undefined, 2.5, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 2.5 });
  });

  it("should reject values below minimum", () => {
    const result = toBoundedFloat(-0.1, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be in [0, 10]." });
  });

  it("should reject values above maximum", () => {
    const result = toBoundedFloat(10.1, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be in [0, 10]." });
  });

  it("should accept boundary values", () => {
    expect(toBoundedFloat(0, 0, 0, 10, "test")).toEqual({ ok: true, value: 0 });
    expect(toBoundedFloat(10, 0, 0, 10, "test")).toEqual({ ok: true, value: 10 });
  });

  it("should handle string numbers", () => {
    const result = toBoundedFloat("3.14", 0, 0, 10, "test");
    expect(result).toEqual({ ok: true, value: 3.14 });
  });

  it("should reject non-numeric strings", () => {
    const result = toBoundedFloat("abc", 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be a number." });
  });

  it("should reject NaN", () => {
    const result = toBoundedFloat(NaN, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be a number." });
  });

  it("should reject Infinity", () => {
    const result = toBoundedFloat(Infinity, 0, 0, 10, "testField");
    expect(result).toEqual({ ok: false, error: "testField must be a number." });
  });

  it("should handle negative ranges", () => {
    const result = toBoundedFloat(-5.5, 0, -10, -1, "test");
    expect(result).toEqual({ ok: true, value: -5.5 });
  });
});

describe("clampInteger", () => {
  it("should return value if within bounds", () => {
    expect(clampInteger(5, 0, 10)).toBe(5);
    expect(clampInteger(0, 0, 10)).toBe(0);
    expect(clampInteger(10, 0, 10)).toBe(10);
  });

  it("should clamp to minimum if below", () => {
    expect(clampInteger(-5, 0, 10)).toBe(0);
    expect(clampInteger(-100, 0, 10)).toBe(0);
  });

  it("should clamp to maximum if above", () => {
    expect(clampInteger(15, 0, 10)).toBe(10);
    expect(clampInteger(100, 0, 10)).toBe(10);
  });

  it("should truncate to integer", () => {
    expect(clampInteger(3.14, 0, 10)).toBe(3);
    expect(clampInteger(3.9, 0, 10)).toBe(3);
    expect(clampInteger(-3.9, 0, 10)).toBe(0); // Clamped to min
  });

  it("should handle NaN", () => {
    expect(clampInteger(NaN, 0, 10)).toBe(0);
  });

  it("should handle Infinity", () => {
    expect(clampInteger(Infinity, 0, 10)).toBe(10);
    expect(clampInteger(-Infinity, 0, 10)).toBe(0);
  });

  it("should handle negative ranges", () => {
    expect(clampInteger(-5, -10, -1)).toBe(-5);
    expect(clampInteger(-15, -10, -1)).toBe(-10);
    expect(clampInteger(0, -10, -1)).toBe(-1);
  });

  it("should handle same min and max", () => {
    expect(clampInteger(5, 5, 5)).toBe(5);
    expect(clampInteger(0, 5, 5)).toBe(5);
    expect(clampInteger(10, 5, 5)).toBe(5);
  });
});

describe("clampFloat", () => {
  it("should return value if within bounds", () => {
    expect(clampFloat(5.5, 0, 10)).toBe(5.5);
    expect(clampFloat(0, 0, 10)).toBe(0);
    expect(clampFloat(10, 0, 10)).toBe(10);
  });

  it("should clamp to minimum if below", () => {
    expect(clampFloat(-5.5, 0, 10)).toBe(0);
    expect(clampFloat(-0.1, 0, 10)).toBe(0);
  });

  it("should clamp to maximum if above", () => {
    expect(clampFloat(10.1, 0, 10)).toBe(10);
    expect(clampFloat(100, 0, 10)).toBe(10);
  });

  it("should preserve decimal places", () => {
    expect(clampFloat(3.14159, 0, 10)).toBe(3.14159);
    expect(clampFloat(9.999, 0, 10)).toBe(9.999);
  });

  it("should handle NaN", () => {
    expect(clampFloat(NaN, 0, 10)).toBe(0);
  });

  it("should handle Infinity", () => {
    expect(clampFloat(Infinity, 0, 10)).toBe(10);
    expect(clampFloat(-Infinity, 0, 10)).toBe(0);
  });

  it("should handle negative ranges", () => {
    expect(clampFloat(-5.5, -10, -1)).toBe(-5.5);
    expect(clampFloat(-15, -10, -1)).toBe(-10);
    expect(clampFloat(0, -10, -1)).toBe(-1);
  });

  it("should handle same min and max", () => {
    expect(clampFloat(5.5, 5, 5)).toBe(5);
    expect(clampFloat(0, 5, 5)).toBe(5);
    expect(clampFloat(10, 5, 5)).toBe(5);
  });

  it("should handle very small numbers", () => {
    expect(clampFloat(0.0001, 0, 1)).toBe(0.0001);
    expect(clampFloat(-0.0001, 0, 1)).toBe(0);
  });

  it("should handle very large numbers", () => {
    expect(clampFloat(1e10, 0, 1e6)).toBe(1e6);
    expect(clampFloat(1e6, 0, 1e10)).toBe(1e6);
  });
});
