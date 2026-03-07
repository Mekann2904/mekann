// Path: tests/unit/lib/long-running-runtime.test.ts
// What: 旧 long-running runtime API が supervisor backend へ正しく委譲されることを検証する
// Why: 互換レイヤーが壊れると autonomy_* の旧導線で durable backend の統一が崩れるため
// Related: .pi/lib/long-running-runtime.ts, .pi/lib/long-running-supervisor.ts, .pi/extensions/autonomy-policy.ts, docs/02-user-guide/25-long-running-runtime.md

import { beforeEach, describe, expect, it, vi } from "vitest";

const supervisorMocks = vi.hoisted(() => ({
  beginLongRunningSessionSync: vi.fn(() => ({
    session: {
      id: "lr-1",
      cwd: "/repo",
      ownerPid: 123,
      startedAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
      status: "active",
      journalPath: "/repo/.pi/long-running/sessions/lr-1/journal.jsonl",
      checkpointPath: "/repo/.pi/long-running/sessions/lr-1/checkpoint.json",
      plan: {
        acceptanceCriteria: [],
        fileModuleImpact: [],
        recentProgress: [],
      },
    },
  })),
  createLongRunningReplay: vi.fn(() => ({
    session: {
      id: "lr-1",
      cwd: "/repo",
      ownerPid: 123,
      startedAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
      status: "crashed",
      journalPath: "/repo/.pi/long-running/sessions/lr-1/journal.jsonl",
      checkpointPath: "/repo/.pi/long-running/sessions/lr-1/checkpoint.json",
      plan: {
        acceptanceCriteria: [],
        fileModuleImpact: [],
        recentProgress: [],
      },
    },
    resumeReason: "Previous session ended without a clean shutdown.",
    nextAction: "Resume verification from the failed step: test.",
    workspaceVerification: {
      phase: "verification",
      reason: "Resume verification from test.",
      requestedSteps: ["test"],
    },
    backgroundProcesses: [],
    recentEvents: [],
    warnings: [],
  })),
  finalizeLongRunningSession: vi.fn(),
  heartbeatLongRunningSession: vi.fn(() => ({
    id: "lr-1",
    cwd: "/repo",
    ownerPid: 123,
    startedAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:01:00.000Z",
    status: "active",
    journalPath: "/repo/.pi/long-running/sessions/lr-1/journal.jsonl",
    checkpointPath: "/repo/.pi/long-running/sessions/lr-1/checkpoint.json",
    plan: {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    },
  })),
  loadLatestLongRunningSession: vi.fn(() => ({
    id: "lr-1",
    cwd: "/repo",
    ownerPid: 999999,
    startedAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
    status: "active",
    journalPath: "/repo/.pi/long-running/sessions/lr-1/journal.jsonl",
    checkpointPath: "/repo/.pi/long-running/sessions/lr-1/checkpoint.json",
    plan: {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    },
  })),
  loadLongRunningSession: vi.fn((_cwd: string, _sessionId: string) => ({
    id: "lr-1",
    cwd: "/repo",
    ownerPid: 123,
    startedAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:01:00.000Z",
    status: "active",
    journalPath: "/repo/.pi/long-running/sessions/lr-1/journal.jsonl",
    checkpointPath: "/repo/.pi/long-running/sessions/lr-1/checkpoint.json",
    plan: {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    },
  })),
  loadLongRunningJournal: vi.fn(() => [
    {
      timestamp: "2026-03-08T00:00:00.000Z",
      type: "tool_call",
      summary: "tool call started: loop_run",
    },
    {
      timestamp: "2026-03-08T00:00:01.000Z",
      type: "subagent_run",
      summary: "compat checkpoint after loop_run",
    },
  ]),
  recordLongRunningEvent: vi.fn(),
  recordLongRunningToolCall: vi.fn(),
  recordLongRunningToolResult: vi.fn(),
  runLongRunningPreflight: vi.fn(() => ({
    ok: false,
    blockers: ["non-interactive execution cannot satisfy command permission is ask"],
    warnings: [],
    requiredPermissions: ["command", "write"],
    missingPermissions: ["command"],
    workspaceVerificationPhase: "verification",
    runtimeNeedsBackgroundProcess: false,
  })),
  runLongRunningSupervisorSweep: vi.fn(async () => ({
    warnings: [],
    recoveredSessionId: "lr-1",
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
  })),
}));

vi.mock("../../../.pi/lib/long-running-supervisor.js", () => supervisorMocks);

describe("long-running-runtime compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preflight report delegates to supervisor preflight", async () => {
    const { createAutonomyPreflightReport } = await import("../../../.pi/lib/long-running-runtime.js");

    const report = createAutonomyPreflightReport({
      cwd: "/repo",
      task: "Run tests and fix the implementation",
      nonInteractive: true,
      requireVerification: true,
    });

    expect(report.ok).toBe(false);
    expect(report.blockers[0]).toContain("command permission is ask");
    expect(supervisorMocks.runLongRunningPreflight).toHaveBeenCalled();
  });

  it("start session maps sync supervisor session into compatibility shape", async () => {
    const runtime = await import("../../../.pi/lib/long-running-runtime.js");

    const session = runtime.startLongRunningSession({
      cwd: "/repo",
      mode: "build",
      profile: "balanced",
    });

    expect(session.id).toBe("lr-1");
    expect(session.status).toBe("active");
    expect(supervisorMocks.beginLongRunningSessionSync).toHaveBeenCalled();
  });

  it("tool call and result are mirrored into supervisor journal", async () => {
    const runtime = await import("../../../.pi/lib/long-running-runtime.js");

    runtime.recordLongRunningToolCall({
      cwd: "/repo",
      sessionId: "lr-1",
      toolName: "loop_run",
      toolCallId: "call-1",
      toolInput: { task: "Investigate failure" },
    });
    await runtime.recordLongRunningToolResult({
      cwd: "/repo",
      sessionId: "lr-1",
      toolName: "loop_run",
      toolCallId: "call-1",
      isError: false,
      details: { outcomeCode: "SUCCESS" },
    });
    const journal = runtime.loadLongRunningJournal("/repo", 10);

    expect(supervisorMocks.recordLongRunningToolCall).toHaveBeenCalled();
    expect(supervisorMocks.recordLongRunningToolResult).toHaveBeenCalled();
    expect(supervisorMocks.recordLongRunningEvent).toHaveBeenCalledWith("/repo", expect.objectContaining({
      type: "subagent_run",
    }));
    expect(supervisorMocks.loadLongRunningJournal).toHaveBeenCalled();
    expect(journal.length).toBeGreaterThan(0);
    expect(journal.some((entry) => entry.kind === "checkpoint")).toBe(true);
  });

  it("recovery and resume report use supervisor replay state", async () => {
    const runtime = await import("../../../.pi/lib/long-running-runtime.js");

    const recovered = runtime.recoverLongRunningRuntime({
      cwd: "/repo",
      heartbeatTimeoutMs: 1,
    });
    const report = runtime.createLongRunningResumeReport("/repo");

    expect(recovered.recoveredSessions[0]?.status).toBe("crashed");
    expect(report.pendingSession?.id).toBe("lr-1");
    expect(report.workspaceVerification.phase).toBe("verification");
  });
});
