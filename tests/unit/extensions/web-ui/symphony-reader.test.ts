/**
 * path: tests/unit/extensions/web-ui/symphony-reader.test.ts
 * role: Symphony snapshot reader の集約結果を検証する
 * why: workflow・task queue・workpad 集約が壊れないようにするため
 * related: .pi/extensions/web-ui/lib/symphony-reader.ts, .pi/extensions/web-ui/lib/workpad-reader.ts, .pi/lib/workflow-workpad.ts
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../.pi/lib/storage/task-plan-store.js", () => ({
  loadTaskStorage: vi.fn(() => ({
    tasks: [
      {
        id: "task-1",
        title: "Implement runner",
        status: "todo",
        priority: "high",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        retryCount: 1,
        nextRetryAt: "2099-01-01T00:00:00.000Z",
        lastError: "transient failure",
        workspaceVerificationStatus: "failed",
        workspaceVerifiedAt: "2026-03-08T02:10:00.000Z",
        workspaceVerificationMessage: "workspace verification failed",
        completionGateStatus: "blocked",
        completionGateUpdatedAt: "2026-03-08T02:11:00.000Z",
        completionGateMessage: "completion gate blocked: verification command not confirmed: npm test",
        completionGateBlockers: ["verification command not confirmed: npm test"],
        proofArtifacts: ["structured artifact"],
        verifiedCommands: ["npm test"],
        progressEvidence: ["- progress evidence"],
        verificationEvidence: ["- verification evidence"],
        reviewEvidence: ["- review evidence"],
      },
      {
        id: "task-2",
        title: "Verify flow",
        status: "completed",
        priority: "medium",
        createdAt: "2026-03-08T01:00:00.000Z",
        updatedAt: "2026-03-08T01:00:00.000Z",
      },
    ],
  })),
}));

vi.mock("../../../../.pi/lib/workflow-workpad.js", () => ({
  loadWorkflowDocument: vi.fn(() => ({
    exists: true,
    path: "/repo/WORKFLOW.md",
    frontmatter: {
      entrypoints: ["task_run_next", "workflow_workpad_start"],
      verification: { required_commands: ["npm test"] },
      completion_gate: {
        require_single_in_progress_step: true,
        require_proof_artifacts: true,
        require_workspace_verification: true,
      },
    },
    body: "Implement the issue and leave proof artifacts.",
  })),
}));

vi.mock("../../../../.pi/lib/symphony-config.js", () => ({
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
}));

vi.mock("../../../../.pi/extensions/web-ui/lib/ul-workflow-reader.js", () => ({
  getAllUlWorkflowTasks: vi.fn(() => [{ id: "ul-1", phase: "implement" }]),
  getActiveUlWorkflowTask: vi.fn(() => ({ id: "ul-1", phase: "implement" })),
}));

vi.mock("../../../../.pi/extensions/web-ui/lib/workpad-reader.js", () => ({
  getAllWorkpads: vi.fn(() => [{
    id: "wp-1",
    task: "Implement runner",
    updatedAt: "2026-03-08T02:00:00.000Z",
    sections: {
      progress: "- progress\n- proof artifact: test report",
      verification: "- verification",
      next: "- next",
    },
  }]),
}));

vi.mock("../../../../.pi/lib/symphony-orchestrator-state.js", () => ({
  listSymphonyIssueStates: vi.fn(() => [{
    issueId: "task-1",
    title: "Implement runner",
    runState: "running",
    updatedAt: "2026-03-08T02:30:00.000Z",
    reason: "execution tool started",
  }]),
  listSymphonyIssueEvents: vi.fn(() => [{
    at: "2026-03-08T02:31:00.000Z",
    issueId: "task-1",
    action: "running",
    reason: "execution tool started",
    source: "runtime-sessions",
    sessionId: "session-1",
  }]),
  getSymphonyIssueState: vi.fn((_cwd: string, issueId: string) => issueId === "task-1" ? {
    issueId: "task-1",
    title: "Implement runner",
    runState: "running",
    updatedAt: "2026-03-08T02:30:00.000Z",
    reason: "execution tool started",
  } : null),
}));

vi.mock("../../../../.pi/lib/symphony-scheduler.js", () => ({
  refreshSymphonyScheduler: vi.fn(async () => ({
    generatedAt: "2026-03-08T03:00:00.000Z",
    eligibleCount: 0,
    blockedCount: 2,
    terminalCount: 1,
    nextEligibleTask: null,
    candidates: [
      {
        id: "task-1",
        title: "Implement runner",
        priority: "high",
        status: "todo",
        eligible: false,
        reason: "retry-delayed",
      },
    ],
  })),
}));

vi.mock("../../../../.pi/lib/symphony-workspace-manager.js", () => ({
  getSymphonyWorkspaceInfo: vi.fn(({ issueId }: { issueId: string }) => ({
    issueId,
    workspaceKey: issueId,
    rootPath: "/repo/.pi/workspaces",
    path: `/repo/.pi/workspaces/${issueId}`,
    exists: issueId === "task-1",
  })),
}));

vi.mock("../../../../.pi/lib/symphony-orchestrator-loop.js", () => ({
  getSymphonyOrchestratorLoopState: vi.fn(() => ({
    running: true,
    pollIntervalMs: 30000,
    startedAt: "2026-03-08T03:30:00.000Z",
    lastTickAt: "2026-03-08T03:31:00.000Z",
    tickCount: 4,
    lastError: null,
    lastSnapshot: null,
  })),
}));

import {
  buildSymphonyIssueSnapshot,
  buildSymphonySnapshot,
  hydrateSymphonyIssueSnapshot,
} from "../../../../.pi/extensions/web-ui/lib/symphony-reader.js";
import { refreshSymphonyScheduler } from "../../../../.pi/lib/symphony-scheduler.js";

describe("symphony-reader", () => {
  it("workflow, queue, workpad を 1 つの snapshot に束ねる", async () => {
    const snapshot = await buildSymphonySnapshot("/repo", {
      activeLlm: 1,
      activeRequests: 1,
      queuedOrchestrations: 0,
      sessions: {
        total: 2,
        starting: 0,
        running: 1,
        completed: 1,
        failed: 0,
      },
    });

    expect(snapshot.workflow.exists).toBe(true);
    expect(snapshot.health.trackerStatus).toBe("ok");
    expect(snapshot.health.lastTrackerError).toBeNull();
    expect(snapshot.workflow.workspaceRoot).toBe("/repo/.pi/workspaces");
    expect(snapshot.workflow.trackerKind).toBe("task_queue");
    expect(snapshot.workflow.runtimeKind).toBe("pi-mono-extension");
    expect(snapshot.taskQueue.nextTask).toBeNull();
    expect(snapshot.taskQueue.retryScheduled).toBe(1);
    expect(snapshot.taskQueue.workspaceVerificationPassed).toBe(0);
    expect(snapshot.taskQueue.workspaceVerificationFailed).toBe(1);
    expect(snapshot.taskQueue.completionGateBlocked).toBe(1);
    expect(snapshot.workpads.latest?.id).toBe("wp-1");
    expect(snapshot.ulWorkflow.activeTaskId).toBe("ul-1");
    expect(snapshot.orchestrator.running).toBe(true);
    expect(snapshot.scheduler.eligibleCount).toBe(0);
    expect(snapshot.orchestration.running).toBe(1);
    expect(snapshot.runtime?.sessions.running).toBe(1);
  });

  it("task 単位の orchestration detail を返す", () => {
    const detail = buildSymphonyIssueSnapshot("task-1", "/repo", [{
      id: "session-1",
      taskId: "task-1",
      taskTitle: "Implement runner",
      status: "running",
      startedAt: Date.now(),
      agentId: "implementer",
      type: "subagent",
    }]);

    expect(detail?.id).toBe("task-1");
    expect(detail?.health.trackerStatus).toBe("ok");
    expect(detail?.orchestration?.runState).toBe("running");
    expect(detail?.runtime.activeSession?.id).toBe("session-1");
    expect(detail?.queue.position).toBeNull();
    expect(detail?.queue.blockedReason).toBe("retry-delayed");
    expect(detail?.queue.blockedBy).toEqual([]);
    expect(detail?.queue.candidateReason).toBeNull();
    expect(detail?.queue.retryAt).toBe("2099-01-01T00:00:00.000Z");
    expect(detail?.queue.lastError).toBe("transient failure");
    expect(detail?.verification.status).toBe("failed");
    expect(detail?.verification.verifiedAt).toBe("2026-03-08T02:10:00.000Z");
    expect(detail?.verification.message).toBe("workspace verification failed");
    expect(detail?.completionGate.status).toBe("blocked");
    expect(detail?.completionGate.updatedAt).toBe("2026-03-08T02:11:00.000Z");
    expect(detail?.completionGate.message).toContain("completion gate blocked");
    expect(detail?.completionGate.blockers).toContain("verification command not confirmed: npm test");
    expect(detail?.proofArtifacts).toContain("structured artifact");
    expect(detail?.debug.relatedSessions).toHaveLength(1);
    expect(detail?.debug.recentEvents[0]?.action).toBe("running");
    expect(detail?.workflow.verifiedCommands).toContain("npm test");
    expect(detail?.workflow.progressEvidence).toContain("- progress evidence");
    expect(detail?.workflow.verificationEvidence).toContain("- verification evidence");
    expect(detail?.workflow.reviewEvidence).toContain("- review evidence");
    expect(detail?.workflow.entrypoints).toContain("task_run_next");
    expect(detail?.workspace.path).toContain("/repo/.pi/workspaces/task-1");
  });

  it("issue detail を scheduler 情報で hydrate する", async () => {
    vi.mocked(refreshSymphonyScheduler).mockResolvedValueOnce({
      generatedAt: "2026-03-08T03:00:00.000Z",
      eligibleCount: 0,
      blockedCount: 1,
      terminalCount: 0,
      nextEligibleTask: null,
      candidates: [
        {
          id: "task-1",
          title: "Implement runner",
          priority: "high",
          status: "todo",
          eligible: false,
          reason: "blocked-by-active-issue",
          blockedBy: [{
            id: "task-9",
            identifier: "task-9",
            state: "In Progress",
          }],
        },
      ],
    });

    const detail = buildSymphonyIssueSnapshot("task-1", "/repo", []);
    const hydrated = await hydrateSymphonyIssueSnapshot(detail!, "/repo", []);

    expect(hydrated.queue.candidateReason).toBe("blocked-by-active-issue");
    expect(hydrated.queue.blockedReason).toBe("retry-delayed");
    expect(hydrated.queue.blockedBy).toEqual([{
      id: "task-9",
      identifier: "task-9",
      state: "In Progress",
    }]);
  });

  it("issue detail hydrate で tracker error を health に載せる", async () => {
    vi.mocked(refreshSymphonyScheduler).mockRejectedValueOnce(new Error("linear_graphql_errors: denied"));

    const detail = buildSymphonyIssueSnapshot("task-1", "/repo", []);
    const hydrated = await hydrateSymphonyIssueSnapshot(detail!, "/repo", []);

    expect(hydrated.health.trackerStatus).toBe("error");
    expect(hydrated.health.lastTrackerError).toContain("linear_graphql_errors: denied");
  });

  it("tracker refresh error を health に載せて snapshot を返す", async () => {
    vi.mocked(refreshSymphonyScheduler).mockRejectedValueOnce(new Error("linear_api_status:500"));

    const snapshot = await buildSymphonySnapshot("/repo", null);

    expect(snapshot.health.trackerStatus).toBe("error");
    expect(snapshot.health.lastTrackerError).toContain("linear_api_status:500");
    expect(snapshot.scheduler.candidates).toEqual([]);
  });
});
