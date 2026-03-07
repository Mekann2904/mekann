/**
 * path: tests/unit/extensions/long-running-supervisor.test.ts
 * role: long-running-supervisor 拡張の登録と lifecycle forwarding を検証する
 * why: root journal / resume prompt / preflight tool の接続が壊れないようにするため
 * related: .pi/extensions/long-running-supervisor.ts, .pi/lib/long-running-supervisor.ts, tests/unit/lib/long-running-supervisor.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const libMocks = vi.hoisted(() => ({
  beginLongRunningSession: vi.fn(async () => ({
    session: {
      id: "lr-1",
      status: "active",
    },
    sweep: {
      warnings: ["Recovered unclean session: lr-old"],
      recoveredSessionId: "lr-old",
      background: {
        runningCount: 0,
        orphanedCount: 0,
        reclaimedCount: 0,
        running: [],
        orphaned: [],
        reclaimed: [],
      },
      subagents: {
        activeCount: 0,
        orphanedCount: 0,
        staleCount: 0,
        recoveredCount: 0,
        active: [],
        orphaned: [],
        stale: [],
        recovered: [],
      },
    },
  })),
  createLongRunningReplay: vi.fn(() => ({
    session: { id: "lr-1", status: "crashed" },
    nextAction: "Resume verification from the failed step: test.",
    resumeReason: "Previous session ended without a clean shutdown.",
    workspaceVerification: { phase: "verification", reason: "Resume verification from test.", requestedSteps: ["test"] },
    recentEvents: [],
    backgroundProcesses: [],
    warnings: ["Latest session crashed: lr-1"],
  })),
  runLongRunningPreflight: vi.fn(() => ({
    ok: false,
    blockers: ["command permission is ask"],
    warnings: [],
    requiredPermissions: ["read", "write", "command"],
    missingPermissions: ["command"],
    workspaceVerificationPhase: "verification",
    runtimeNeedsBackgroundProcess: false,
  })),
  formatLongRunningReplay: vi.fn(() => "# Long-Running Replay\nnext_action: resume"),
  formatLongRunningPreflight: vi.fn(() => "# Long-Running Preflight\nok: false"),
  heartbeatLongRunningSession: vi.fn(),
  recordLongRunningEvent: vi.fn(),
  recordLongRunningToolCall: vi.fn(),
  recordLongRunningToolResult: vi.fn(),
  recordLongRunningAgentLifecycle: vi.fn(),
  finalizeLongRunningSession: vi.fn(),
  runLongRunningSupervisorSweep: vi.fn(async () => ({
    warnings: [],
    recoveredSessionId: undefined,
    background: {
      runningCount: 1,
      orphanedCount: 0,
      reclaimedCount: 0,
      running: [],
      orphaned: [],
      reclaimed: [],
    },
    subagents: {
      activeCount: 2,
      orphanedCount: 1,
      staleCount: 1,
      recoveredCount: 1,
      active: [],
      orphaned: [],
      stale: [],
      recovered: [],
    },
  })),
}));

vi.mock("../../../.pi/lib/long-running-supervisor.js", () => libMocks);

function createPiMock() {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
  const tools: any[] = [];

  return {
    handlers,
    tools,
    on: vi.fn((name: string, handler: any) => handlers.set(name, handler)),
    registerTool: vi.fn((tool: any) => tools.push(tool)),
  };
}

describe("long-running-supervisor extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("tools を登録し、session_start で recovery 通知を出す", async () => {
    const extension = (await import("../../../.pi/extensions/long-running-supervisor.js")).default;
    const pi = createPiMock();
    const notifications: Array<{ message: string; level: string }> = [];

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, {
      cwd: "/repo",
      ui: {
        notify: (message: string, level: string) => notifications.push({ message, level }),
      },
    });

    expect(pi.tools.map((tool) => tool.name)).toEqual([
      "long_running_status",
      "long_running_preflight",
      "long_running_resume",
      "long_running_supervisor",
    ]);
    expect(notifications.some((item) => item.message.includes("Recovered crashed long-running session"))).toBe(true);
  });

  it("before_agent_start で replay と preflight を system prompt に注入する", async () => {
    const extension = (await import("../../../.pi/extensions/long-running-supervisor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    const result = await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, { cwd: "/repo" });

    expect(String(result?.systemPrompt)).toContain("LONG_RUNNING_SUPERVISOR");
    expect(String(result?.systemPrompt)).toContain("Long-Running Replay");
    expect(String(result?.systemPrompt)).toContain("Long-Running Preflight");
  });

  it("tool_call / tool_result / session_shutdown を lib へ forwarding する", async () => {
    const extension = (await import("../../../.pi/extensions/long-running-supervisor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, { cwd: "/repo", ui: { notify: vi.fn() } });
    await pi.handlers.get("tool_call")?.({ toolName: "write", input: { path: "a.ts" } }, { cwd: "/repo" });
    await pi.handlers.get("tool_result")?.({ toolName: "write", isError: false }, { cwd: "/repo" });
    await pi.handlers.get("session_shutdown")?.({}, { cwd: "/repo" });

    expect(libMocks.recordLongRunningToolCall).toHaveBeenCalledWith("/repo", "lr-1", expect.any(Object));
    expect(libMocks.recordLongRunningToolResult).toHaveBeenCalledWith("/repo", "lr-1", expect.any(Object));
    expect(libMocks.finalizeLongRunningSession).toHaveBeenCalledWith("/repo", "lr-1", "clean_shutdown");
  });

  it("execution tool を preflight blocker で止める", async () => {
    const extension = (await import("../../../.pi/extensions/long-running-supervisor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, { cwd: "/repo", ui: { notify: vi.fn() } });
    const result = await pi.handlers.get("tool_call")?.({ toolName: "loop_run", input: { task: "demo" } }, { cwd: "/repo" });

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("long-running preflight blocked loop_run");
    expect(libMocks.recordLongRunningEvent).toHaveBeenCalled();
  });
});
