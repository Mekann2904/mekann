import { describe, it, expect } from "vitest";
import {
  doTheThing,
  calc,
  processData,
  helper,
  helper2,
  formatResult,
} from "./index.ts";

describe("doTheThing", () => {
  it("returns correct summary for simple user order", () => {
    const result = doTheThing("user", "order", { amount: 100, vip: false });
    expect(result).toContain("user");
    expect(result).toContain("order");
    expect(result).toContain("100");
  });

  it("applies VIP discount for vip user", () => {
    const result = doTheThing("user", "order", { amount: 100, vip: true });
    expect(result).toContain("90");
  });

  it("handles admin refund", () => {
    const result = doTheThing("admin", "refund", { amount: 50, vip: false });
    expect(result).toContain("admin");
    expect(result).toContain("refund");
  });

  it("handles guest with zero amount", () => {
    const result = doTheThing("guest", "browse", { amount: 0, vip: false });
    expect(result).toContain("guest");
  });

  it("handles unknown type", () => {
    const result = doTheThing("alien", "order", { amount: 10, vip: false });
    expect(result).toContain("unknown");
  });

  it("handles missing data gracefully", () => {
    const result = doTheThing("user", "order", {} as any);
    expect(result).toBeDefined();
  });
});

describe("calc", () => {
  it("adds two numbers", () => {
    expect(calc("add", 2, 3)).toBe(5);
  });

  it("subtracts two numbers", () => {
    expect(calc("sub", 5, 3)).toBe(2);
  });

  it("multiplies two numbers", () => {
    expect(calc("mul", 4, 3)).toBe(12);
  });

  it("divides two numbers", () => {
    expect(calc("div", 10, 2)).toBe(5);
  });

  it("returns 0 for division by zero", () => {
    expect(calc("div", 10, 0)).toBe(0);
  });

  it("returns 0 for unknown operation", () => {
    expect(calc("mod" as any, 10, 3)).toBe(0);
  });
});

describe("processData", () => {
  it("processes an array of items", () => {
    const items = [
      { type: "a", val: 10 },
      { type: "b", val: 20 },
    ];
    const result = processData(items);
    expect(result).toBe(34); // (10*1.2) + (20*1.1) = 12 + 22 = 34
  });

  it("handles empty array", () => {
    expect(processData([])).toBe(0);
  });

  it("handles unknown type", () => {
    const items = [{ type: "z", val: 10 }];
    expect(processData(items)).toBe(0);
  });
});

describe("helper / helper2", () => {
  it("helper returns formatted string", () => {
    expect(helper("foo", 42)).toBe("foo:42");
  });

  it("helper2 returns formatted string", () => {
    expect(helper2("bar", 99)).toBe("bar:99");
  });
});

describe("formatResult", () => {
  it("formats a result object", () => {
    const result = formatResult({ total: 100, count: 5 });
    expect(result).toContain("100");
    expect(result).toContain("5");
  });
});
