import { describe, expect, it, beforeEach, vi } from "vitest";
import contextTrackerExtension from "./index.js";
import { state } from "./state.js";

function resetContextTrackerState(): void {
  state.tools.clear();
  state.toolSchemaTotalBytes = 0;
}

describe("context tracker tool registration observation", () => {
  beforeEach(() => {
    resetContextTrackerState();
  });

  it("records tool schema bytes at the registerTool boundary", () => {
    const registered: any[] = [];
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: vi.fn((tool: any) => registered.push(tool)),
    } as any;

    contextTrackerExtension(pi);
    pi.registerTool({ name: "example_tool", parameters: { type: "object", properties: { query: { type: "string" } } } });

    expect(registered.map((tool) => tool.name)).toEqual(["example_tool"]);
    expect(state.tools.get("example_tool")?.schemaBytes).toBeGreaterThan(0);
    expect(state.toolSchemaTotalBytes).toBe(state.tools.get("example_tool")?.schemaBytes);
  });

  it("does not double-wrap the same ExtensionAPI", () => {
    const originalRegisterTool = vi.fn();
    const pi = {
      on: vi.fn(),
      registerCommand: vi.fn(),
      registerTool: originalRegisterTool,
    } as any;

    contextTrackerExtension(pi);
    contextTrackerExtension(pi);
    pi.registerTool({ name: "single_record", parameters: { type: "object" } });

    expect(originalRegisterTool).toHaveBeenCalledOnce();
    expect(state.tools.size).toBe(1);
    expect(state.tools.has("single_record")).toBe(true);
  });
});
