/**
 * Path: tests/unit/extensions/loop.test.ts
 * Role: loop 拡張テストファイルの有効なテストスイートを提供する。
 * Why: 空ファイルによる Vitest の "No test suite found" エラーを防ぐため。
 * Related: .pi/extensions/loop.ts, tests/unit/extensions/plan.test.ts
 */

import { describe, expect, it } from "vitest";

describe("loop extension", () => {
  it("has a valid test suite placeholder", () => {
    expect(true).toBe(true);
  });
});
