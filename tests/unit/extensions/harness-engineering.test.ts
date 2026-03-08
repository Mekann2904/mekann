/**
 * path: tests/unit/extensions/harness-engineering.test.ts
 * role: harness engineering 拡張の tool 登録と report 出力を検証する
 * why: エージェントからの自己診断入口が退行しないようにするため
 * related: .pi/extensions/harness-engineering.ts, .pi/lib/harness-engineering.ts, tests/unit/lib/harness-engineering.test.ts, package.json
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLib = vi.hoisted(() => ({
  assessHarnessEngineering: vi.fn(() => ({
    cwd: "/repo",
    workflowPath: "/repo/.github/workflows/test.yml",
    overallScore: 88,
    readiness: "strong",
    pillars: [],
    recommendations: ["Add missing marker"],
    strengths: ["Execution Harness: workspace-verification"],
  })),
  renderHarnessAssessmentMarkdown: vi.fn(() => "# Harness Engineering Report"),
  createAgentFirstWorkflowTemplate: vi.fn(() => "# WORKFLOW"),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    Object: (value: unknown) => value,
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    String: (value: unknown) => value,
  },
}));

vi.mock("../../../.pi/lib/harness-engineering.js", () => mockLib);

import registerHarnessEngineering from "../../../.pi/extensions/harness-engineering.js";

let activePi: ReturnType<typeof createMockPi> | null = null;

function createMockPi() {
  const tools: any[] = [];
  const commands = new Map<string, any>();
  const handlers = new Map<string, Function>();

  return {
    tools,
    commands,
    handlers,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    registerCommand: vi.fn((name: string, definition: any) => commands.set(name, definition)),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

describe("harness-engineering extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await activePi?.handlers.get("session_shutdown")?.({}, { cwd: "/repo" });
    activePi = null;
  });

  it("report tool は診断レポートを返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerHarnessEngineering(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "harness_engineering_assess");

    const result = await tool.execute(
      "tool-1",
      { action: "report" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockLib.assessHarnessEngineering).toHaveBeenCalledWith("/repo");
    expect(result.content[0].text).toContain("Harness Engineering Report");
  });

  it("workflow_template action は workflow 文面を返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerHarnessEngineering(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "harness_engineering_assess");
    const result = await tool.execute(
      "tool-2",
      { action: "workflow_template" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(result.content[0].text).toBe("# WORKFLOW");
  });
});
