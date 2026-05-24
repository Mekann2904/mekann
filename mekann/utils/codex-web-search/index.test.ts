import { describe, it, expect } from "vitest";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import codexWebSearch from "./index.js";

interface MockExtensionAPI {
  registerTool: (tool: ToolDefinition) => void;
  getTools: () => ToolDefinition[];
}

function createMockApi(): MockExtensionAPI {
  const tools: ToolDefinition[] = [];
  return {
    registerTool: (tool: ToolDefinition) => tools.push(tool),
    getTools: () => tools,
  };
}

// Helper to get the static schema properties from a TypeBox object schema
function getSchemaProperties(tool: ToolDefinition): Record<string, unknown> {
  const params = (tool as any).parameters as any;
  return params?.properties ?? {};
}

describe("codexWebSearch tool registration", () => {
  const api = createMockApi();
  codexWebSearch(api as any);
  const tool = api.getTools()[0];

  it("registers tool with name 'codex_web_search'", () => {
    expect(tool.name).toBe("codex_web_search");
  });

  it("includes 'query' in parameter schema", () => {
    const props = getSchemaProperties(tool);
    expect(props).toHaveProperty("query");
  });

  it("includes 'searchContextSize' in parameter schema", () => {
    const props = getSchemaProperties(tool);
    expect(props).toHaveProperty("searchContextSize");
  });

  it("does NOT expose token/accountId/model/baseUrl/externalWebAccess in parameter schema", () => {
    const props = getSchemaProperties(tool);
    expect(props).not.toHaveProperty("token");
    expect(props).not.toHaveProperty("accountId");
    expect(props).not.toHaveProperty("model");
    expect(props).not.toHaveProperty("baseUrl");
    expect(props).not.toHaveProperty("externalWebAccess");
  });

  it("has promptSnippet set", () => {
    expect((tool as any).promptSnippet).toBeTruthy();
  });

  it("has at least 8 promptGuidelines", () => {
    const guidelines = (tool as any).promptGuidelines as string[];
    expect(guidelines).toBeDefined();
    expect(guidelines.length).toBeGreaterThanOrEqual(8);
  });

  it("has executionMode 'parallel'", () => {
    expect((tool as any).executionMode).toBe("parallel");
  });
});
