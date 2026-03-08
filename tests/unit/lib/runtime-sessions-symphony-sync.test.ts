/**
 * path: tests/unit/lib/runtime-sessions-symphony-sync.test.ts
 * role: runtime session lifecycle から Symphony durable state への同期を検証する
 * why: subagent 実行が orchestration state に自動反映されることを保証するため
 * related: .pi/lib/runtime-sessions.ts, .pi/lib/symphony-orchestrator-state.ts, .pi/extensions/web-ui/src/routes/runtime.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const orchestrationMocks = vi.hoisted(() => ({
  claimSymphonyIssue: vi.fn(),
  getSymphonyIssueState: vi.fn(() => ({ retryAttempt: 2 })),
  queueSymphonyIssueRetry: vi.fn(),
  releaseSymphonyIssue: vi.fn(),
  startSymphonyIssueRun: vi.fn(),
}));

vi.mock("../../../.pi/lib/symphony-orchestrator-state.js", () => orchestrationMocks);

const workspaceMocks = vi.hoisted(() => ({
  ensureSymphonyWorkspace: vi.fn(async () => undefined),
  runSymphonyWorkspaceHook: vi.fn(async () => undefined),
}));

vi.mock("../../../.pi/lib/symphony-workspace-manager.js", () => workspaceMocks);

describe("runtime-sessions symphony sync", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PI_ENABLE_RUNTIME_SESSION_ORCHESTRATION_SYNC_TEST", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starting/running/failed/completed を orchestration state に反映する", async () => {
    const runtimeSessions = await import("../../../.pi/lib/runtime-sessions.js");
    runtimeSessions.clearAllSessions();

    runtimeSessions.addSession({
      id: "session-1",
      type: "subagent",
      agentId: "implementer",
      taskId: "task-1",
      taskTitle: "Implement orchestration",
      status: "starting",
      startedAt: Date.now(),
    });

    runtimeSessions.updateSession("session-1", {
      status: "running",
      message: "working",
    });

    runtimeSessions.updateSession("session-1", {
      status: "failed",
      message: "verify failed",
    });

    runtimeSessions.updateSession("session-1", {
      status: "completed",
      message: "done",
      completedAt: Date.now(),
    });

    await vi.waitFor(() => {
      expect(workspaceMocks.ensureSymphonyWorkspace).toHaveBeenCalledWith(expect.objectContaining({
        issueId: "task-1",
      }));
    });
    await vi.waitFor(() => {
      expect(workspaceMocks.runSymphonyWorkspaceHook).toHaveBeenCalledWith(expect.objectContaining({
        issueId: "task-1",
        hook: "before_run",
      }));
    });
    await vi.waitFor(() => {
      expect(workspaceMocks.runSymphonyWorkspaceHook).toHaveBeenCalledWith(expect.objectContaining({
        issueId: "task-1",
        hook: "after_run",
      }));
    });

    expect(orchestrationMocks.claimSymphonyIssue).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-1",
      sessionId: "session-1",
    }));
    expect(orchestrationMocks.startSymphonyIssueRun).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-1",
      sessionId: "session-1",
    }));
    expect(orchestrationMocks.queueSymphonyIssueRetry).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-1",
      retryAttempt: 3,
    }));
    expect(orchestrationMocks.releaseSymphonyIssue).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-1",
      sessionId: "session-1",
    }));
  });
});
