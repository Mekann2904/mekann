import { describe, expect, it } from "vitest";
import { canonicalizeJson, canonicalizeText, estimateTokens, sortFragments } from "./canonicalize.js";
describe("canonicalize", () => {
  it("normalizes CRLF, trailing whitespace, blank lines, final newline", () => { expect(canonicalizeText("  a  \r\n\r\n\r\nb\t \n")).toBe("a\n\nb\n"); });
  it("sorts JSON keys, omits undefined, marks Date", () => { expect(canonicalizeJson({ b: 1, a: undefined, c: { z: 1, d: new Date() } })).toBe('{\n  "b": 1,\n  "c": {\n    "d": "[Date]",\n    "z": 1\n  }\n}'); });
  it("sortFragments uses canonical order", () => { const base = { scope: "global" as const, version: "v1", content: "x" }; const sorted = sortFragments([{ ...base, id: "b", source: "b", kind: "unknown" as const, stability: "dynamic" as const, priority: 1 }, { ...base, id: "a", source: "a", kind: "coding_guidelines" as const, stability: "stable" as const, priority: 2 }, { ...base, id: "c", source: "a", kind: "coding_guidelines" as const, stability: "stable" as const, priority: 1 }]); expect(sorted.map(f => f.id)).toEqual(["c", "a", "b"]); });
});

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => { expect(estimateTokens("")).toBe(0); });
  it("estimates ASCII at ~4 chars/token", () => { expect(estimateTokens("abcdefgh")).toBe(2); });
  it("weights CJK at ~1 token/char (was ceil(n/4) before)", () => {
    expect(estimateTokens("あ")).toBe(1);
    expect(estimateTokens("あいう")).toBe(3);
    expect(estimateTokens("漢字表")).toBe(3);
  });
  it("weights emoji at ~1 token/char without splitting surrogate pairs", () => {
    expect(estimateTokens("😀")).toBe(1);
    expect(estimateTokens("😀😀")).toBe(2);
  });
  it("weights hangul/kana/fullwidth as high-density", () => {
    expect(estimateTokens("가나다")).toBe(3); // hangul
    expect(estimateTokens("ａｂｃ")).toBe(3); // fullwidth ASCII
  });
  it("mixes scripts", () => {
    // "ab" (0.25*2=0.5) + "あ" (1) + "😀" (1) = 2.5 → ceil 3
    expect(estimateTokens("abあ😀")).toBe(3);
  });
  it("no longer underestimates a large Japanese prompt", () => {
    // Old length/4 estimate for 4000 hiragana chars = 1000 tokens; weighted = 4000.
    expect(estimateTokens("あ".repeat(4000))).toBe(4000);
  });
});
