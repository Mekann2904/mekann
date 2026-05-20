import { beforeEach, describe, expect, it } from "vitest";
import { clearPromptProvidersForTests, collectPromptFragments, listPromptProviders, registerPromptProvider } from "./registry.js";
import { renderPromptFragments } from "./render.js";
const ctx = { cwd: "/tmp" };
describe("registry", () => {
  beforeEach(() => clearPromptProvidersForTests());
  it("keeps provider registration order", async () => { registerPromptProvider({ id: "a", getFragments: () => [{ id: "a1", source: "a", kind: "unknown", stability: "dynamic", scope: "turn", priority: 1, version: "v1", content: "a" }] }); registerPromptProvider({ id: "b", getFragments: () => [{ id: "b1", source: "b", kind: "unknown", stability: "dynamic", scope: "turn", priority: 1, version: "v1", content: "b" }] }); expect(listPromptProviders().map(p => p.id)).toEqual(["a", "b"]); expect((await collectPromptFragments(ctx)).map(f => f.id)).toEqual(["a1", "b1"]); });
  it("replaces duplicate id", async () => { registerPromptProvider({ id: "a", getFragments: () => [] }); registerPromptProvider({ id: "a", getFragments: () => [{ id: "new", source: "a", kind: "unknown", stability: "dynamic", scope: "turn", priority: 1, version: "v1", content: "x" }] }); expect(listPromptProviders()).toHaveLength(1); expect((await collectPromptFragments(ctx))[0].id).toBe("new"); });
  it("converts provider errors to dynamic diagnostic fragments", async () => { registerPromptProvider({ id: "bad", getFragments: () => { throw new Error("boom"); } }); const [f] = await collectPromptFragments(ctx); expect(f).toMatchObject({ id: "prompt-provider-error:bad", source: "prompt-core", kind: "unknown", stability: "dynamic", cacheIntent: "avoid_cache" }); expect(f.content).toContain("boom"); });
  it("disabled fragments are ignored by render", () => { const r = renderPromptFragments([{ id: "x", source: "s", kind: "coding_guidelines", stability: "stable", scope: "global", priority: 1, version: "v1", content: "hidden", enabled: false }]); expect(r.stableText).toBe(""); expect(r.fragmentHashes).toHaveLength(0); });
});
