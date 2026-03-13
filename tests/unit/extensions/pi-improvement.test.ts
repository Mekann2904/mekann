/**
 * path: tests/unit/extensions/pi-improvement.test.ts
 * role: pi-improvement 拡張の prompt 注入と report tool を検証する
 * why: 実運転の改善ブリーフが安定して使えることを保証するため
 * related: .pi/extensions/pi-improvement.ts, .pi/lib/pi-improvement.ts, .pi/lib/agent/prompt-stack.ts, package.json
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockImprovement = vi.hoisted(() => ({
  collectPiImprovementReport: vi.fn(() => ({
    generatedAt: "2026-03-13T00:00:00.000Z",
    cwd: "/repo",
    health: "critical",
    summary: "Recent pi runs show hard failures.",
    focuses: [
      { title: "workspace verification failure", detail: "Failing steps: test" },
    ],
    verification: {
      dirty: true,
      running: false,
      failureSteps: ["test"],
      lastErrorSummary: ["test: expected 1 to be 2"],
    },
    failingFeatures: [
      { feature: "core-agent/default", count: 2, lastError: "timeout" },
    ],
  })),
  renderPiImprovementBrief: vi.fn(() => "# Pi Improvement Brief\n\nhealth: critical"),
  renderPiImprovementReport: vi.fn(() => "# Pi Improvement Report"),
  writePiImprovementReport: vi.fn(() => "/repo/.pi/reports/pi-improvement-report.md"),
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

vi.mock("../../../.pi/lib/pi-improvement.js", () => mockImprovement);

import registerPiImprovement from "../../../.pi/extensions/pi-improvement.js";

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

describe("pi-improvement extension", () => {
  let activePi: ReturnType<typeof createMockPi> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await activePi?.handlers.get("session_shutdown")?.({}, { cwd: "/repo" });
    activePi = null;
  });

  it("before_agent_start で改善ブリーフを system prompt に注入する", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerPiImprovement(pi as any);

    const handler = pi.handlers.get("before_agent_start");
    const result = await handler?.({ systemPrompt: "base prompt" }, { cwd: "/repo" });

    expect(mockImprovement.collectPiImprovementReport).toHaveBeenCalledWith("/repo");
    expect(String(result?.systemPrompt)).toContain("# Pi Improvement Brief");
  });

  it("pi_improvement_report は write_report action で出力先を返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerPiImprovement(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "pi_improvement_report");
    const result = await tool.execute(
      "tool-1",
      { action: "write_report" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockImprovement.writePiImprovementReport).toHaveBeenCalledWith("/repo", undefined);
    expect(result.content[0].text).toContain("Pi improvement report written");
  });
});
