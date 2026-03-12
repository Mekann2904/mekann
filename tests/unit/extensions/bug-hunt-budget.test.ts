// Path: tests/unit/extensions/bug-hunt-budget.test.ts
// What: bug-hunt の stage budget 配分を検証する
// Why: investigate / observe 用の時間予約が壊れる退行を防ぐため
// Related: .pi/extensions/bug-hunt/budget.ts, .pi/extensions/bug-hunt/runner.ts, tests/unit/extensions/bug-hunt.test.ts

import { describe, expect, it } from "vitest";

import {
  allocateBugHuntStageTimeout,
  hasBudgetForBugHuntStage,
} from "../../../.pi/extensions/bug-hunt/budget.js";

describe("bug-hunt budget", () => {
  it("query では後段のための tail budget を予約する", () => {
    expect(allocateBugHuntStageTimeout("query", 600_000)).toBe(60_000);
  });

  it("investigation は observer/report を残せないと開始しない", () => {
    expect(hasBudgetForBugHuntStage("investigation", 69_999)).toBe(false);
    expect(hasBudgetForBugHuntStage("investigation", 70_000)).toBe(true);
  });

  it("observer は report 用 budget を残した上で timeout を切る", () => {
    expect(allocateBugHuntStageTimeout("observer", 40_000)).toBe(30_000);
  });

  it("必要最小 budget を割ると明示的に失敗する", () => {
    expect(() => allocateBugHuntStageTimeout("hypothesis", 189_999)).toThrow(
      "iteration budget exhausted before hypothesis",
    );
  });
});
