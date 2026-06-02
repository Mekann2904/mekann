import { describe, expect, it, beforeEach, vi } from "vitest";
import { observeToolRegistrations } from "../tool-registration-observer.js";
import { getContextIntelligenceReport, recordContextMonitorSample } from "./server.js";
import { state } from "./state.js";

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

  it("uses strict scope by default instead of mixing unscoped samples into scoped reports", () => {
    recordContextMonitorSample({ phase: "provider_request", summary: { contextTokens: 9000, contextPercent: 90, payloadBytes: 9000, messageBytes: 100, systemPromptBytes: 8000 } });
    recordContextMonitorSample({ cwd: "/repo/a", sessionId: "a", phase: "provider_request", summary: { contextTokens: 1000, contextPercent: 10, payloadBytes: 1000, messageBytes: 700, systemPromptBytes: 100 } });

    const report = getContextIntelligenceReport("report", 10, { cwd: "/repo/a", sessionId: "a" }) as any;

    expect(report.context.tokens).toBe(1000);
    expect(report.context.payloadBytes).toBe(1000);
    expect(report.health.risk).toBe("low");
  });
});
