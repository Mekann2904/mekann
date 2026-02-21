/**
 * path: tests/unit/lib/dynamic-tools-safety.test.ts
 * role: dynamic-toolsの安全性検出ルールを検証する
 * why: 間接evalや文字列タイマー実行の検出漏れを防ぐため
 * related: .pi/lib/dynamic-tools/safety.ts, tests/unit/lib/dynamic-tools-registry.test.ts
 */

import { describe, expect, it } from "vitest";
import { analyzeCodeSafety } from "../../../.pi/lib/dynamic-tools/safety.js";

describe("dynamic tools safety", () => {
  it("detects setTimeout string execution", () => {
    const result = analyzeCodeSafety(`setTimeout("console.log('x')", 0);`);
    expect(result.issues.some((issue) => issue.type === "eval-usage")).toBe(true);
  });

  it("detects indirect eval via bracket notation", () => {
    const result = analyzeCodeSafety(`window["eval"]("2 + 2");`);
    expect(result.issues.some((issue) => issue.type === "eval-usage")).toBe(true);
  });
});
