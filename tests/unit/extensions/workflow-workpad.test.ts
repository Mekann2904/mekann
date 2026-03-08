/**
 * path: tests/unit/extensions/workflow-workpad.test.ts
 * role: workflow workpad 拡張のツール登録と CRUD フローを検証する
 * why: エージェントが workpad を使って durable に進捗を残せる入口を守るため
 * related: .pi/extensions/workflow-workpad.ts, .pi/lib/workflow-workpad.ts, tests/unit/lib/workflow-workpad.test.ts, WORKFLOW.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLib = vi.hoisted(() => ({
  createWorkpad: vi.fn(() => ({
    metadata: {
      id: "wp-1",
      task: "Fix drift",
      updatedAt: "2026-03-08T00:00:00.000Z",
    },
    path: "/repo/.pi/workpads/wp-1.md",
  })),
  updateWorkpad: vi.fn(() => ({
    metadata: {
      id: "wp-1",
      task: "Fix drift",
      updatedAt: "2026-03-08T00:01:00.000Z",
    },
    path: "/repo/.pi/workpads/wp-1.md",
  })),
  loadWorkflowDocument: vi.fn(() => ({
    exists: true,
    body: "# WORKFLOW",
    frontmatter: {},
    path: "/repo/WORKFLOW.md",
  })),
  loadWorkpad: vi.fn(() => ({
    metadata: {
      id: "wp-1",
      task: "Fix drift",
      updatedAt: "2026-03-08T00:01:00.000Z",
    },
    path: "/repo/.pi/workpads/wp-1.md",
  })),
  listWorkpads: vi.fn(() => [{
    metadata: {
      id: "wp-1",
      task: "Fix drift",
      updatedAt: "2026-03-08T00:01:00.000Z",
    },
    path: "/repo/.pi/workpads/wp-1.md",
  }]),
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

vi.mock("../../../.pi/lib/workflow-workpad.js", () => mockLib);

import registerWorkflowWorkpad from "../../../.pi/extensions/workflow-workpad.js";

let activePi: ReturnType<typeof createMockPi> | null = null;

function createMockPi() {
  const tools: any[] = [];
  const handlers = new Map<string, Function>();

  return {
    tools,
    handlers,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

describe("workflow-workpad extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await activePi?.handlers.get("session_shutdown")?.({}, { cwd: "/repo" });
    activePi = null;
  });

  it("start tool は workpad を作成する", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerWorkflowWorkpad(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "workflow_workpad_start");
    const result = await tool.execute("t1", { task: "Fix drift" }, undefined, undefined, { cwd: "/repo" });

    expect(mockLib.createWorkpad).toHaveBeenCalledWith("/repo", {
      task: "Fix drift",
      source: undefined,
      issueId: undefined,
    });
    expect(result.content[0].text).toContain("wp-1");
  });

  it("show workflow action は workflow を返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerWorkflowWorkpad(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "workflow_workpad_show");
    const result = await tool.execute("t2", { action: "workflow" }, undefined, undefined, { cwd: "/repo" });

    expect(result.content[0].text).toContain("# WORKFLOW");
  });
});
