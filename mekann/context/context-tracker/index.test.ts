import { describe, expect, it, beforeEach, vi } from "vitest";
import { observeToolRegistrations } from "../tool-registration-observer.js";
import { getContextIntelligenceReport, getContextMonitorSnapshot, recordContextMonitorSample } from "./server.js";
import { state } from "../context-control/state.js";
import { buildContextBudgetPlan } from "../context-control/planner.js";
import { toolSurfaceAnalysis } from "../context-control/analysis.js";

function resetContextTrackerState(): void {
  state.tools.clear();
  state.toolSchemaTotalBytes = 0;
  state.samples.splice(0);
  state.nextId = 1;
}

describe("context tool registration observation", () => {
  beforeEach(() => {
    resetContextTrackerState();
  });

  it("records tool schema bytes at the registerTool boundary", async () => {
    const registered: any[] = [];
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn((tool: any) => registered.push(tool)),
    } as any;

    observeToolRegistrations(pi);
    pi.registerTool({ name: "example_tool", label: "Example", description: "Example", parameters: { type: "object", properties: { query: { type: "string" } } } as any, execute: async () => ({ content: "ok" }) });

    expect(registered.map((tool) => tool.name)).toEqual(["example_tool"]);
    expect(state.tools.get("example_tool")?.schemaBytes).toBeGreaterThan(0);
    expect(state.toolSchemaTotalBytes).toBe(state.tools.get("example_tool")?.schemaBytes);
  });

  it("records after the underlying tool registration succeeds", () => {
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(() => { throw new Error("registration failed"); }),
    } as any;

    observeToolRegistrations(pi);
    expect(() => pi.registerTool({ name: "failed_record", label: "Failed", description: "Failed", parameters: { type: "object" } as any, execute: async () => ({ content: "ok" }) })).toThrow("registration failed");

    expect(state.tools.has("failed_record")).toBe(false);
  });

  it("does not double-wrap the same Pi API", async () => {
    const registered: any[] = [];
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn((tool: any) => registered.push(tool)),
    } as any;

    observeToolRegistrations(pi);
    observeToolRegistrations(pi);
    pi.registerTool({ name: "single_record", label: "Single", description: "Single", parameters: { type: "object", properties: { value: { type: "string" } } } as any, execute: async () => ({ content: "ok" }) });

    expect(registered).toHaveLength(1);
    expect(state.tools.has("single_record")).toBe(true);
    expect(state.tools.size).toBe(1);
  });

  it("preserves the underlying registerTool return value", () => {
    const handle = { dispose: vi.fn() };
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(() => handle),
    } as any;

    observeToolRegistrations(pi);
    const result = pi.registerTool({ name: "returning_tool", parameters: { type: "object" }, execute: async () => ({ content: "ok" }) });

    expect(result).toBe(handle);
    expect(state.tools.has("returning_tool")).toBe(true);
  });

  it("updates same-name tool schema totals to reflect the current registration surface", () => {
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    } as any;

    observeToolRegistrations(pi);
    pi.registerTool({ name: "changing_tool", parameters: { type: "object", properties: { a: { type: "string" } } }, execute: async () => ({ content: "ok" }) });
    const first = state.tools.get("changing_tool")!.schemaBytes;
    pi.registerTool({ name: "changing_tool", parameters: { type: "object", properties: { a: { type: "string" }, b: { type: "string" } } }, execute: async () => ({ content: "ok" }) });
    const second = state.tools.get("changing_tool")!.schemaBytes;

    expect(second).toBeGreaterThan(first);
    expect(state.toolSchemaTotalBytes).toBe(second);
  });

  it("records non-zero schema bytes when canonicalization throws (BigInt parameters)", () => {
    // BigInt makes canonicalizeJson/JSON.stringify throw; previously the
    // per-module byteLen returned 0, hiding this tool from the schema
    // surface total. safeByteLen must fall back to a non-zero length.
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    } as any;

    observeToolRegistrations(pi);
    pi.registerTool({ name: "bigint_tool", parameters: { type: "object", properties: { count: { type: "integer" } }, big: 10n } as any, execute: async () => ({ content: "ok" }) });

    const bytes = state.tools.get("bigint_tool")?.schemaBytes;
    expect(bytes).toBeGreaterThan(0);
    expect(state.toolSchemaTotalBytes).toBe(bytes);
  });

  it("keeps context intelligence derived values scoped to the requested sample set", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 1000, messageBytes: 700, systemPromptBytes: 100, resultBytes: 10 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "tool_end", summary: { toolName: "a_tool", resultBytes: 100 } });
    recordContextMonitorSample({ cwd: "/repo/b", sessionId: "b", phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 9000, messageBytes: 100, systemPromptBytes: 8000, resultBytes: 90000 } });
    recordContextMonitorSample({ cwd: "/repo/b", sessionId: "b", phase: "tool_end", summary: { toolName: "b_tool", resultBytes: 90000 } });

    const report = getContextIntelligenceReport("report", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.context.tokens).toBe(1000);
    expect(report.context.payloadBytes).toBe(1000);
    expect(report.health.risk).toBe("low");
    expect(report.toolOutputBreakdown.map((item: any) => item.label)).toEqual(["a_tool"]);
    expect(report.topContributors.some((item: any) => item.source === "b_tool")).toBe(false);
  });

  it("does not let partially global samples bypass other scoped dimensions", () => {
    recordContextMonitorSample({ sessionId: "b", phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 9000 } });
    recordContextMonitorSample({ cwd: "/repo/b", phase: "provider_request", summary: { contextTokens: 8000, contextPercent: 80, payloadBytes: 8000 } });
    recordContextMonitorSample({ phase: "provider_request", summary: { contextTokens: 7000, contextPercent: 70, payloadBytes: 7000 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 1000 } });

    const report = getContextIntelligenceReport("timeline", 10, { cwd: "/repo/a", sessionId: "a", mode: "include-global" }) as any;

    expect(report.timeline.map((sample: any) => sample.summary.contextTokens)).toEqual([7000, 1000]);
  });

  it("uses strict scope by default instead of mixing unscoped samples into scoped reports", () => {
    recordContextMonitorSample({ phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 9000, messageBytes: 100, systemPromptBytes: 8000 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 1000, messageBytes: 700, systemPromptBytes: 100 } });

    const report = getContextIntelligenceReport("report", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.context.tokens).toBe(1000);
    expect(report.context.payloadBytes).toBe(1000);
    expect(report.health.risk).toBe("low");
  });

  it("includes project-scoped observations in the matching session view", () => {
    recordContextMonitorSample({ cwd: "/repo/a", phase: "cacheable_context", summary: { prefixHash: "a", prefixChars: 123 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 1000 } });

    const report = getContextIntelligenceReport("timeline", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.timeline.map((sample: any) => sample.phase)).toEqual(["cacheable_context", "provider_request"]);
  });

  it("turns context observations into planner decisions", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "context", summary: { messageCount: 2, messageBytes: 90_000, messageBreakdown: [{ role: "tool", source: "tool:bash", bytes: 70_000 }] } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "tool_end", summary: { toolName: "bash", resultBytes: 80_000 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 100_000, messageBytes: 90_000, systemPromptBytes: 5_000 } });

    const report = getContextIntelligenceReport("budget", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.planner.pressure).toBe("critical");
    expect(report.planner.budget.dynamicTailMaxBytes).toBe(4096);
    expect(report.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "summarize", target: "tool:bash", priority: "high" }),
      expect.objectContaining({ kind: "externalize", target: "tool:bash" }),
      expect.objectContaining({ kind: "omit", target: "dynamic-tail:low-priority-fragments", priority: "high" }),
    ]));
  });

  it("turns cache efficiency telemetry into tuning decisions", () => {
    const plan = buildContextBudgetPlan([], {}, { actualWarmRequestCount: 3, actualWarmTokenHitRateWeighted: 0.2, providerPrefixHashChanges: 5, dynamicTruncationCount: 2, dynamicTruncationOmittedChars: 9000 });

    expect(plan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "retrieve", target: "cache-friendly-prompt:prefix-churn", priority: "high" }),
      expect.objectContaining({ kind: "monitor", target: "cache-friendly-prompt:provider-prefix-hash" }),
      expect.objectContaining({ kind: "summarize", target: "dynamic-tail:truncated-fragments" }),
    ]));
  });

  it("exposes planner decisions in the monitor snapshot", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 90_000 } });

    const snapshot = getContextMonitorSnapshot({ cwd: "/repo/a", sessionId: "a" }) as any;

    expect(snapshot.contextPlan.pressure).toBe("critical");
    expect(snapshot.contextPlan.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "omit", target: "dynamic-tail:low-priority-fragments" }),
    ]));
  });

  it("keeps output-gate artifacts retrieval-oriented", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "context", summary: { messageCount: 1, messageBytes: 1000, messageBreakdown: [{ role: "tool", source: "[output-gate] Large bash output stored. artifact: og_abc_1", bytes: 1000 }] } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 10_000 } });

    const report = getContextIntelligenceReport("budget", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "retrieve", target: "output-gate:og_abc_1", priority: "medium" }),
    ]));
  });

  it("tracks selected-tool surface churn for prompt-cache review", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "prompt", summary: { toolCount: 2, tools: ["bash", "read"], toolSetHash: "set-a", toolOrderHash: "order-a", toolOrderStable: true } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "prompt", summary: { toolCount: 2, tools: ["read", "bash"], toolSetHash: "set-a", toolOrderHash: "order-b", toolOrderStable: false } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 10_000 } });

    const surface = toolSurfaceAnalysis({ cwd: "/repo/a", sessionId: "a" });
    const report = getContextIntelligenceReport("budget", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(surface.toolSetHashChanges).toBe(0);
    expect(surface.toolOrderHashChanges).toBe(1);
    expect(surface.toolOrderStable).toBe(false);
    expect(report.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "monitor", target: "tools:canonical-order" }),
    ]));
  });

  it("adds token estimates to context planner savings", () => {
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "context", summary: { messageCount: 1, messageBytes: 70_000, messageBreakdown: [{ role: "tool", source: "tool:bash", bytes: 70_000 }] } });

    const report = getContextIntelligenceReport("budget", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "summarize", target: "tool:bash", expectedSavingsTokens: expect.any(Number) }),
    ]));
  });

  it("keeps cacheable-context overflow as retrieval-oriented planner work", () => {
    recordContextMonitorSample({ cwd: "/repo/a", phase: "cacheable_context", summary: { prefixChars: 31_000, maxPrefixChars: 32_000, prefixHash: "p" } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 10_000, messageBytes: 2_000, systemPromptBytes: 7_000 } });

    const report = getContextIntelligenceReport("budget", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "retrieve", target: "cacheable-context:overflow-fragments", priority: "medium" }),
      expect.objectContaining({ kind: "retrieve", target: "system-prompt:optional-guidance" }),
    ]));
  });
});
