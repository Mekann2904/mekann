import { describe, it, expect } from "vitest";
import { keyOfTarget, intersects, isHighRisk, isBreakingOrUnknown } from "./semantic.js";
import type { SemanticTarget, SemanticRisk, PublicSurfaceDelta } from "./types.js";

describe("keyOfTarget", () => {
  it("joins kind and name with colon", () => {
    expect(keyOfTarget({ kind: "symbol", name: "foo" })).toBe("symbol:foo");
  });

  it("works with file kind", () => {
    expect(keyOfTarget({ kind: "file", name: "src/a.ts" })).toBe("file:src/a.ts");
  });

  it("works with various kinds", () => {
    expect(keyOfTarget({ kind: "api_route", name: "GET /api" })).toBe("api_route:GET /api");
    expect(keyOfTarget({ kind: "db_table", name: "users" })).toBe("db_table:users");
  });
});

describe("intersects", () => {
  it("returns common elements", () => {
    const a = new Set([1, 2, 3]);
    const b = new Set([2, 3, 4]);
    expect(intersects(a, b)).toEqual([2, 3]);
  });

  it("returns empty array for disjoint sets", () => {
    const a = new Set([1, 2]);
    const b = new Set([3, 4]);
    expect(intersects(a, b)).toEqual([]);
  });

  it("returns all elements when sets are equal", () => {
    const a = new Set(["x", "y"]);
    const b = new Set(["x", "y"]);
    expect(intersects(a, b).sort()).toEqual(["x", "y"]);
  });

  it("works with empty sets", () => {
    expect(intersects(new Set(), new Set())).toEqual([]);
    expect(intersects(new Set([1]), new Set())).toEqual([]);
    expect(intersects(new Set(), new Set([1]))).toEqual([]);
  });
});

describe("isHighRisk", () => {
  it("returns true for high risk", () => {
    expect(isHighRisk({ level: "high" })).toBe(true);
  });

  it("returns false for low risk", () => {
    expect(isHighRisk({ level: "low" })).toBe(false);
  });

  it("returns false for medium risk", () => {
    expect(isHighRisk({ level: "medium" })).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isHighRisk(undefined)).toBe(false);
  });
});

describe("isBreakingOrUnknown", () => {
  it("returns true for breaking", () => {
    expect(isBreakingOrUnknown({ surface: "typescript_export", name: "foo", change: "remove", compatibility: "breaking" })).toBe(true);
  });

  it("returns true for unknown", () => {
    expect(isBreakingOrUnknown({ surface: "rest_api", name: "bar", change: "modify", compatibility: "unknown" })).toBe(true);
  });

  it("returns false for compatible", () => {
    expect(isBreakingOrUnknown({ surface: "config_schema", name: "baz", change: "add", compatibility: "compatible" })).toBe(false);
  });
});
