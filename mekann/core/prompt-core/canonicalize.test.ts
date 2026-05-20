import { describe, expect, it } from "vitest";
import { canonicalizeJson, canonicalizeText, sortFragments } from "./canonicalize.js";
describe("canonicalize", () => {
  it("normalizes CRLF, trailing whitespace, blank lines, final newline", () => { expect(canonicalizeText("  a  \r\n\r\n\r\nb\t \n")).toBe("a\n\nb\n"); });
  it("sorts JSON keys, omits undefined, marks Date", () => { expect(canonicalizeJson({ b: 1, a: undefined, c: { z: 1, d: new Date() } })).toBe('{\n  "b": 1,\n  "c": {\n    "d": "[Date]",\n    "z": 1\n  }\n}'); });
  it("sortFragments uses canonical order", () => { const base = { scope: "global" as const, version: "v1", content: "x" }; const sorted = sortFragments([{ ...base, id: "b", source: "b", kind: "unknown" as const, stability: "dynamic" as const, priority: 1 }, { ...base, id: "a", source: "a", kind: "coding_guidelines" as const, stability: "stable" as const, priority: 2 }, { ...base, id: "c", source: "a", kind: "coding_guidelines" as const, stability: "stable" as const, priority: 1 }]); expect(sorted.map(f => f.id)).toEqual(["c", "a", "b"]); });
});
