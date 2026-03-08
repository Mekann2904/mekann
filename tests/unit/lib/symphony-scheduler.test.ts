/**
 * path: tests/unit/lib/symphony-scheduler.test.ts
 * role: Symphony scheduler の candidate 選定と reconcile を検証する
 * why: refresh 時の eligible 判定と stale running の retry 化が壊れないようにするため
 * related: .pi/lib/symphony-scheduler.ts, .pi/lib/symphony-orchestrator-state.ts, .pi/extensions/web-ui/src/routes/runtime.ts
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../.pi/lib/symphony-config.js", () => ({
  loadSymphonyConfig: vi.fn(() => ({
    workflowPath: "/repo/WORKFLOW.md",
    tracker: {
      kind: "task_queue",
      endpoint: "https://api.linear.app/graphql",
      apiKey: null,
      projectSlug: null,
      activeStates: ["Todo", "In Progress"],
      terminalStates: ["Done", "Cancelled", "Failed"],
    },
    polling: { intervalMs: 30000 },
    agent: { maxConcurrentAgents: 10, maxRetryBackoffMs: 300000 },
    runtime: {
      kind: "pi-mono-extension",
      command: "pi",
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
  })),
  normalizeSymphonyStateName: vi.fn((value: string) => value.trim().toLowerCase()),
}));

vi.mock("../../../.pi/lib/symphony-tracker.js", () => ({
  fetchSymphonyCandidateIssues: vi.fn(async () => [
    {
      id: "task-1",
      identifier: "task-1",
      title: "Implement runner",
      description: null,
      priority: 2,
      state: "Todo",
      branch_name: null,
      url: null,
      labels: [],
      blocked_by: [],
      created_at: "2026-03-08T00:00:00.000Z",
      updated_at: "2026-03-08T00:00:00.000Z",
    },
    {
      id: "task-2",
      identifier: "task-2",
      title: "Repair stale run",
      description: null,
      priority: 1,
      state: "In Progress",
      branch_name: null,
      url: null,
      labels: [],
      blocked_by: [],
      created_at: "2026-03-08T00:01:00.000Z",
      updated_at: "2026-03-08T00:01:00.000Z",
      retry_at: null,
    },
  ]),
  fetchSymphonyIssuesByStates: vi.fn(async (_cwd: string, states: string[]) => {
    if (states.includes("Done")) {
      return [{
        id: "task-3",
        identifier: "task-3",
        title: "Closed work",
        description: null,
        priority: 4,
        state: "Done",
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: "2026-03-08T00:02:00.000Z",
        updated_at: "2026-03-08T00:02:00.000Z",
      }];
    }
    return [];
  }),
  fetchSymphonyIssueStatesByIds: vi.fn(async (_cwd: string, ids: string[]) => {
    return ids.flatMap((id) => {
      if (id === "task-2") {
        return [{
          id: "task-2",
          identifier: "task-2",
          title: "Repair stale run",
          description: null,
          priority: 1,
          state: "In Progress",
          branch_name: null,
          url: null,
          labels: [],
          blocked_by: [],
          created_at: "2026-03-08T00:01:00.000Z",
          updated_at: "2026-03-08T00:01:00.000Z",
          retry_at: null,
        }];
      }
      if (id === "task-3") {
        return [{
          id: "task-3",
          identifier: "task-3",
          title: "Closed work",
          description: null,
          priority: 4,
          state: "Done",
          branch_name: null,
          url: null,
          labels: [],
          blocked_by: [],
          created_at: "2026-03-08T00:02:00.000Z",
          updated_at: "2026-03-08T00:02:00.000Z",
          retry_at: null,
        }];
      }
      return [];
    });
  }),
}));

const orchestrationMocks = vi.hoisted(() => ({
  listSymphonyIssueStates: vi.fn(() => [
    {
      issueId: "task-2",
      title: "Repair stale run",
      runState: "running",
      retryAttempt: 1,
      sessionId: "session-2",
      workpadId: "wp-2",
    },
    {
      issueId: "task-3",
      title: "Closed work",
      runState: "running",
      retryAttempt: 1,
      sessionId: "session-3",
      workpadId: "wp-3",
    },
  ]),
  getSymphonyIssueState: vi.fn((_cwd: string, issueId: string) => {
    if (issueId === "task-2") {
      return {
        issueId: "task-2",
        title: "Repair stale run",
        runState: "running",
        retryAttempt: 1,
        sessionId: "session-2",
        workpadId: "wp-2",
      };
    }
    if (issueId === "task-3") {
      return {
        issueId: "task-3",
        title: "Closed work",
        runState: "running",
        retryAttempt: 1,
        sessionId: "session-3",
        workpadId: "wp-3",
      };
    }
    return null;
  }),
  queueSymphonyIssueRetry: vi.fn(),
  releaseSymphonyIssue: vi.fn(),
}));

vi.mock("../../../.pi/lib/symphony-orchestrator-state.js", () => orchestrationMocks);

const workspaceMocks = vi.hoisted(() => ({
  removeSymphonyWorkspace: vi.fn(async () => undefined),
}));

vi.mock("../../../.pi/lib/symphony-workspace-manager.js", () => workspaceMocks);

import { refreshSymphonyScheduler } from "../../../.pi/lib/symphony-scheduler.js";

describe("symphony-scheduler", () => {
  it("eligible task を優先順で返す", async () => {
    const snapshot = await refreshSymphonyScheduler("/repo", []);

    expect(snapshot.eligibleCount).toBe(1);
    expect(snapshot.nextEligibleTask?.id).toBe("task-1");
    expect(snapshot.candidates[0]?.id).toBe("task-2");
  });

  it("retry_at が未来なら eligible にしない", async () => {
    const { refreshSymphonyScheduler: refreshWithDelay } = await import("../../../.pi/lib/symphony-scheduler.js");
    const trackerModule = await import("../../../.pi/lib/symphony-tracker.js");
    vi.mocked(trackerModule.fetchSymphonyCandidateIssues).mockResolvedValueOnce([
      {
        id: "task-9",
        identifier: "task-9",
        title: "Retry later",
        description: null,
        priority: 2,
        state: "Todo",
        branch_name: null,
        url: null,
        labels: [],
        blocked_by: [],
        created_at: "2026-03-08T00:00:00.000Z",
        updated_at: "2026-03-08T00:00:00.000Z",
        retry_at: "2099-01-01T00:00:00.000Z",
      },
    ] as never);

    const snapshot = await refreshWithDelay("/repo", []);

    expect(snapshot.eligibleCount).toBe(0);
    expect(snapshot.candidates[0]?.reason).toBe("retry-delayed");
  });

  it("reconcile=true で stale running を retrying にし terminal を release する", async () => {
    await refreshSymphonyScheduler("/repo", [], { reconcile: true });

    expect(orchestrationMocks.queueSymphonyIssueRetry).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-2",
      retryAttempt: 2,
    }));
    expect(orchestrationMocks.releaseSymphonyIssue).toHaveBeenCalledWith(expect.objectContaining({
      issueId: "task-3",
      reason: "issue reached terminal state: Done",
    }));
    expect(workspaceMocks.removeSymphonyWorkspace).toHaveBeenCalledWith({
      cwd: "/repo",
      issueId: "task-3",
    });
  });
});
