import { describe, expect, it, beforeEach, vi } from "vitest";
import { observeToolRegistrations } from "../observations.js";
import { state } from "./state.js";

function resetContextTrackerState(): void {
  state.tools.clear();
  state.toolSchemaTotalBytes = 0;
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
    await vi.waitFor(() => expect(state.tools.get("example_tool")?.schemaBytes).toBeGreaterThan(0));
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
});
