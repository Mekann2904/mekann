/**
 * path: tests/unit/lib/symphony-orchestrator-loop.test.ts
 * role: Symphony orchestrator loop の起動・tick・停止を検証する
 * why: 常駐 loop が polling 設定を読み、scheduler tick を回せることを保証するため
 * related: .pi/lib/symphony-orchestrator-loop.ts, .pi/lib/symphony-scheduler.ts, .pi/lib/workflow-workpad.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const schedulerMocks = vi.hoisted(() => ({
  refreshSymphonyScheduler: vi.fn(async () => ({
    generatedAt: "2026-03-08T04:00:00.000Z",
    eligibleCount: 1,
    blockedCount: 0,
    terminalCount: 0,
    nextEligibleTask: {
      id: "task-1",
      title: "Implement runner",
      priority: "high",
      status: "todo",
    },
    candidates: [],
  })),
  runSymphonyStartupTerminalCleanup: vi.fn(async () => []),
}));

vi.mock("../../../.pi/lib/symphony-scheduler.js", () => schedulerMocks);

const configMocks = vi.hoisted(() => ({
  loadSymphonyConfig: vi.fn(() => ({
    workflowPath: "/repo/WORKFLOW.md",
    tracker: {
      kind: "task_queue",
      endpoint: "https://api.linear.app/graphql",
      apiKey: null,
      projectSlug: null,
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done"],
    },
    polling: {
      intervalMs: 1234,
    },
    agent: {
      maxConcurrentAgents: 10,
      maxRetryBackoffMs: 300000,
    },
    runtime: {
      kind: "pi-mono-extension",
      command: "pi",
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
  })),
}));

vi.mock("../../../.pi/lib/symphony-config.js", () => configMocks);

const orchestratorStateMocks = vi.hoisted(() => ({
  repairSymphonyOrchestratorState: vi.fn(() => []),
}));

vi.mock("../../../.pi/lib/symphony-orchestrator-state.js", () => orchestratorStateMocks);

describe("symphony-orchestrator-loop", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(async () => {
    const loop = await import("../../../.pi/lib/symphony-orchestrator-loop.js");
    loop.resetSymphonyOrchestratorLoopForTests();
    vi.useRealTimers();
  });

  it("start -> tick -> stop を管理する", async () => {
    const loop = await import("../../../.pi/lib/symphony-orchestrator-loop.js");

    const started = loop.startSymphonyOrchestratorLoop({
      cwd: "/repo",
      runtimeSessions: () => [{ taskId: "task-1", status: "running" }],
    });

    await vi.waitFor(() => {
      expect(schedulerMocks.refreshSymphonyScheduler).toHaveBeenCalledWith(
        "/repo",
        [{ taskId: "task-1", status: "running" }],
        { reconcile: true },
      );
    });

    expect(started.running).toBe(true);
    expect(started.pollIntervalMs).toBe(1234);
    expect(orchestratorStateMocks.repairSymphonyOrchestratorState).toHaveBeenCalledWith(
      "/repo",
      [{ taskId: "task-1", status: "running" }],
    );
    expect(schedulerMocks.runSymphonyStartupTerminalCleanup).toHaveBeenCalledWith("/repo");

    vi.advanceTimersByTime(1234);
    await vi.waitFor(() => {
      expect(loop.getSymphonyOrchestratorLoopState().tickCount).toBeGreaterThanOrEqual(2);
    });

    const stopped = loop.stopSymphonyOrchestratorLoop();
    expect(stopped.running).toBe(false);
  });
});
