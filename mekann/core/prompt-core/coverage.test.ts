import { beforeEach, describe, expect, it } from "vitest";
import { renderDynamicTailMessage, renderPromptFragments, renderSection } from "./render.js";
import { containsVolatileSignal, inspectFragments, inspectFinalPayloadText, inspectStablePrefix } from "./inspect.js";
import { clearPromptProvidersForTests, collectPromptFragments, registerPromptProvider, unregisterPromptProvider } from "./registry.js";

// ---------------------------------------------------------------------------
// render.ts coverage
// ---------------------------------------------------------------------------

const dyn = (id: string, content: string, priority = 1) => ({
  id,
  source: "s",
  kind: "coding_guidelines" as const,
  stability: "dynamic" as const,
  scope: "global" as const,
  priority,
  version: "v1",
  content,
});

describe("render coverage", () => {
  it("omits dynamic fragment when remaining <= 0 (line 14-15)", () => {
    // Create dynamic fragments whose total exceeds DYNAMIC_TOTAL_MAX_CHARS (24_000)
    const big = "x".repeat(24_001);
    const r = renderPromptFragments([dyn("d1", big), dyn("d2", "short")]);
    // d2 should be omitted because d1 already consumed the budget
    const truncationWarnings = r.warnings.filter(
      (w) => w.code === "DYNAMIC_CONTEXT_TRUNCATED" && w.fragmentId === "d2",
    );
    expect(truncationWarnings.length).toBeGreaterThanOrEqual(1);
    expect(r.dynamicText).toContain("omitted");
  });

  it("truncates dynamic fragment when content exceeds remaining (line 18-20)", () => {
    // First fragment uses 23_900 chars, second fragment is 200 chars → truncated
    const frag1 = dyn("d1", "a".repeat(23_900));
    const frag2 = dyn("d2", "b".repeat(200));
    const r = renderPromptFragments([frag1, frag2]);
    const truncationWarnings = r.warnings.filter(
      (w) => w.code === "DYNAMIC_CONTEXT_TRUNCATED" && w.fragmentId === "d2",
    );
    expect(truncationWarnings.length).toBeGreaterThanOrEqual(1);
    // The truncated content should contain the truncation notice
    expect(r.dynamicText).toContain("truncated");
  });

  it("renderDynamicTailMessage delegates to renderSection (line 33)", () => {
    const result = renderDynamicTailMessage([]);
    // renderSection returns "" for empty fragments
    expect(result).toBe("");

    const withFrags = renderDynamicTailMessage([dyn("d1", "hello")]);
    expect(withFrags).toContain("Dynamic turn context");
    expect(withFrags).toContain("hello");
  });

  it("renderSection with fragments produces expected format", () => {
    const result = renderSection("Test Section", [dyn("d1", "body text")]);
    expect(result).toContain("<!-- prompt-fragments:Test Section -->");
    expect(result).toContain("## Test Section");
    expect(result).toContain("body text");
  });
});

// ---------------------------------------------------------------------------
// inspect.ts coverage
// ---------------------------------------------------------------------------

describe("inspect coverage", () => {
  it("containsVolatileSignal detects volatile value patterns", () => {
    expect(containsVolatileSignal("request_id: abc123")).toBe(true);
    expect(containsVolatileSignal("timestamp: 2024-01-01")).toBe(true);
    expect(containsVolatileSignal("Tokens used: 42")).toBe(true);
    expect(containsVolatileSignal("Time used: 5s")).toBe(true);
    expect(containsVolatileSignal("Remaining tokens: 100")).toBe(true);
    expect(containsVolatileSignal("plain text with nothing volatile")).toBe(false);
  });

  it("containsVolatileSignal detects volatile warning terms", () => {
    expect(containsVolatileSignal("The current time is now.")).toBe(true);
    expect(containsVolatileSignal("current date: today")).toBe(true);
    expect(containsVolatileSignal("use now() function")).toBe(true);
    expect(containsVolatileSignal("call Date() to get time")).toBe(true);
    expect(containsVolatileSignal("use new Date()")).toBe(true);
    expect(containsVolatileSignal("latest search results")).toBe(true);
    expect(containsVolatileSignal("search result: xyz")).toBe(true);
    expect(containsVolatileSignal("tool result: xyz")).toBe(true);
    expect(containsVolatileSignal("run diagnostics")).toBe(true);
    expect(containsVolatileSignal("this is a continuation")).toBe(true);
  });

  it("flags stable fragment with volatile term but no value pattern as warning (not error)", () => {
    // "current time" is a volatile term but not a value pattern
    const w = inspectFragments([
      {
        id: "s1",
        source: "s",
        kind: "coding_guidelines" as const,
        stability: "stable" as const,
        scope: "global" as const,
        priority: 1,
        version: "v1",
        content: "Check the current time if asked.",
      },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("VOLATILE_VALUE_IN_STABLE_FRAGMENT");
    expect(w[0].severity).toBe("warning"); // not "error" because no value pattern
  });

  it("does not flag stable fragment when volatileTermsArePolicyReferences is true and no value patterns", () => {
    // This covers allowsPolicyReference returning true
    const w = inspectFragments([
      {
        id: "s1",
        source: "s",
        kind: "coding_guidelines" as const,
        stability: "stable" as const,
        scope: "global" as const,
        priority: 1,
        version: "v1",
        content: "When asked for current time, run a command.",
        metadata: { volatileTermsArePolicyReferences: true },
      } as any,
    ]);
    expect(w).toEqual([]);
  });

  it("does flag when volatileTermsArePolicyReferences is true but content has value patterns", () => {
    // hasVolatileValuePattern returns true → allowsPolicyReference returns false
    const w = inspectFragments([
      {
        id: "s1",
        source: "s",
        kind: "coding_guidelines" as const,
        stability: "stable" as const,
        scope: "global" as const,
        priority: 1,
        version: "v1",
        content: "Tokens used: 42",
        metadata: { volatileTermsArePolicyReferences: true },
      } as any,
    ]);
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("VOLATILE_VALUE_IN_STABLE_FRAGMENT");
    expect(w[0].severity).toBe("error");
  });

  it("does not flag non-stable fragments with volatile content", () => {
    const w = inspectFragments([
      {
        id: "d1",
        source: "s",
        kind: "coding_guidelines" as const,
        stability: "dynamic" as const,
        scope: "global" as const,
        priority: 1,
        version: "v1",
        content: "Tokens used: 42",
      },
    ]);
    expect(w).toEqual([]);
  });

  it("does not flag disabled fragments", () => {
    const w = inspectFragments([
      {
        id: "s1",
        source: "s",
        kind: "coding_guidelines" as const,
        stability: "stable" as const,
        scope: "global" as const,
        priority: 1,
        version: "v1",
        content: "Tokens used: 42",
        enabled: false,
      },
    ]);
    expect(w).toEqual([]);
  });

  it("inspectStablePrefix returns empty for long prefix", () => {
    const longText = "x".repeat(5000); // 5000 chars → ~1250 tokens > 1024
    expect(inspectStablePrefix(longText)).toEqual([]);
  });

  it("inspectFinalPayloadText returns empty when marker is at position 0", () => {
    const text = "<!-- prompt-fragments:Stable extension instructions -->\ncontent";
    expect(inspectFinalPayloadText(text)).toEqual([]);
  });

  it("inspectFinalPayloadText returns empty when marker is not found", () => {
    expect(inspectFinalPayloadText("no marker here")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// registry.ts coverage
// ---------------------------------------------------------------------------

describe("registry coverage", () => {
  beforeEach(() => clearPromptProvidersForTests());

  it("handles non-Error thrown by provider (line 5: String(e))", async () => {
    registerPromptProvider({
      id: "strerr",
      getFragments: () => {
        throw "string error"; // eslint-disable-line no-throw-literal
      },
    });
    const [f] = await collectPromptFragments({ cwd: "/tmp" });
    expect(f.id).toBe("prompt-provider-error:strerr");
    expect(f.content).toContain("string error");
  });

  it("unregisterPromptProvider removes provider", async () => {
    registerPromptProvider({
      id: "tmp",
      getFragments: () => [{ id: "t1", source: "tmp", kind: "unknown", stability: "dynamic", scope: "turn", priority: 1, version: "v1", content: "t" }],
    });
    unregisterPromptProvider("tmp");
    const frags = await collectPromptFragments({ cwd: "/tmp" });
    expect(frags).toHaveLength(0);
  });

  it("collectPromptFragments handles async getFragments", async () => {
    registerPromptProvider({
      id: "async",
      getFragments: async () => [{ id: "a1", source: "async", kind: "unknown", stability: "dynamic", scope: "turn", priority: 1, version: "v1", content: "async content" }],
    });
    const frags = await collectPromptFragments({ cwd: "/tmp" });
    expect(frags).toHaveLength(1);
    expect(frags[0].id).toBe("a1");
  });
});
