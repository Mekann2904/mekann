import { describe, expect, it } from "vitest";
import { inspectFinalPayloadText, inspectFragments, inspectStablePrefix } from "./inspect.js";
const f = (id: string, content: string, extra = {}) => ({ id, source: "s", kind: "coding_guidelines" as const, stability: "stable" as const, scope: "global" as const, priority: 1, version: "v1", content, ...extra });
describe("inspect", () => {
  it("flags Tokens used and Time used in stable as error", () => { const w = inspectFragments([f("x", "Tokens used: 12\nTime used: 5s\nRemaining tokens: 8")]); expect(w.some(x => x.severity === "error" && x.code === "VOLATILE_VALUE_IN_STABLE_FRAGMENT")).toBe(true); });
  it("does not flag metadata-marked fixed policy references to current time", () => { expect(inspectFragments([f("a", "When asked for the current time, run a command.", { source: "any-policy", metadata: { volatileTermsArePolicyReferences: true } }) as any])).toEqual([]); });
  it("flags stable avoid_cache as an error", () => { const w = inspectFragments([f("s", "x", { cacheIntent: "avoid_cache" }) as any]); expect(w[0]).toMatchObject({ severity: "error", code: "STABLE_FRAGMENT_AVOID_CACHE_CONFLICT", fragmentId: "s" }); });
  it("flags dynamic prefer_cache", () => { const w = inspectFragments([f("d", "x", { stability: "dynamic", cacheIntent: "prefer_cache" }) as any]); expect(w[0].code).toBe("DYNAMIC_FRAGMENT_CACHE_INTENT"); });
  it("flags unknown stable", () => { const w = inspectFragments([f("u", "x", { kind: "unknown" }) as any]); expect(w[0].code).toBe("UNKNOWN_FRAGMENT_NOT_STABLE"); });
  it("short stable prefix is info", () => { expect(inspectStablePrefix("short")[0].severity).toBe("info"); });
  it("detects volatile before stable marker conservatively", () => { const w = inspectFinalPayloadText("Tokens used: 42\n<!-- prompt-fragments:Stable extension instructions -->"); expect(w[0].code).toBe("FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END"); expect(inspectFinalPayloadText("general words\n<!-- prompt-fragments:Stable extension instructions -->")).toEqual([]); });
});
