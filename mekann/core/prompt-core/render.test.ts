import { describe, expect, it } from "vitest";
import { renderPromptFragments } from "./render.js";
const f = (id: string, stability: any, content: string, priority = 1, source = "s") => ({ id, source, kind: "coding_guidelines" as const, stability, scope: "global" as const, priority, version: "v1", content });
describe("render", () => {
  it("separates sections and marker format", () => { const r = renderPromptFragments([f("st", "stable", "stable"), f("se", "semi_stable", "semi"), f("dy", "dynamic", "dyn")]); expect(r.stableText).toContain("<!-- prompt-fragments:Stable extension instructions -->"); expect(r.semiStableText).toContain("Semi-stable session context"); expect(r.dynamicText).toContain("Dynamic turn context"); expect(r.stableText).toContain("<!-- fragment:s:st:coding_guidelines:stable:v1 -->"); expect(r.stableText).not.toContain("dyn"); });
  it("orders by priority/source/kind/id", () => { const r = renderPromptFragments([f("b", "stable", "b", 2), f("a", "stable", "a", 1)]); expect(r.stableText.indexOf("fragment:s:a")).toBeLessThan(r.stableText.indexOf("fragment:s:b")); });
  it("stablePrefixHash ignores dynamic changes", () => { const a = renderPromptFragments([f("st", "stable", "stable"), f("dy", "dynamic", "one")]); const b = renderPromptFragments([f("st", "stable", "stable"), f("dy", "dynamic", "two")]); expect(a.stablePrefixHash).toBe(b.stablePrefixHash); });
  it("stablePrefixHash changes when stable changes", () => { expect(renderPromptFragments([f("st", "stable", "one")]).stablePrefixHash).not.toBe(renderPromptFragments([f("st", "stable", "two")]).stablePrefixHash); });
});
