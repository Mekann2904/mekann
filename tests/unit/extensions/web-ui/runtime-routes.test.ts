/**
 * path: tests/unit/extensions/web-ui/runtime-routes.test.ts
 * role: Symphony runtime route の success / failure payload を検証する
 * why: refresh と tick の tracker error surface を API 契約として固定するため
 * related: .pi/extensions/web-ui/src/routes/runtime.ts, .pi/extensions/web-ui/lib/symphony-reader.ts, .pi/lib/symphony-orchestrator-loop.ts, .pi/lib/symphony-scheduler.ts
 */

import { describe, expect, it, vi } from "vitest";

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
  startSymphonyOrchestratorLoop: vi.fn(() => ({
    running: true,
    pollIntervalMs: 30000,
    startedAt: "2026-03-08T03:30:00.000Z",
    lastTickAt: "2026-03-08T03:31:00.000Z",
    tickCount: 4,
    lastError: null,
    lastSnapshot: null,
  })),
  stopSymphonyOrchestratorLoop: vi.fn(() => ({
    running: false,
    pollIntervalMs: 30000,
    startedAt: "2026-03-08T03:30:00.000Z",
    lastTickAt: "2026-03-08T03:31:00.000Z",
    tickCount: 4,
    lastError: null,
    lastSnapshot: null,
  })),
  tickSymphonyOrchestrator: vi.fn(),
}));

vi.mock("../../../../.pi/lib/symphony-scheduler.js", () => ({
  refreshSymphonyScheduler: vi.fn(),
}));

vi.mock("../../../../.pi/lib/symphony-orchestrator-state.js", () => ({
  listSymphonyIssueStates: vi.fn(() => []),
}));

vi.mock("../../../../.pi/lib/runtime-sessions.js", () => ({
  getActiveSessions: vi.fn(() => []),
  getSession: vi.fn(() => null),
  onSessionEvent: vi.fn(() => undefined),
}));

vi.mock("../../../../.pi/extensions/web-ui/lib/symphony-reader.js", () => ({
  buildSymphonyIssueSnapshot: vi.fn(() => null),
  hydrateSymphonyIssueSnapshot: vi.fn(),
  buildSymphonySnapshot: vi.fn(async () => ({
    generatedAt: "2026-03-08T04:00:00.000Z",
    health: {
      trackerStatus: "error",
      lastTrackerError: "linear_api_status:500",
    },
    workflow: {
      exists: true,
      path: "/repo/WORKFLOW.md",
      workspaceRoot: "/repo/.pi/workspaces",
      trackerKind: "linear",
      trackerProjectSlug: "proj",
      runtimeKind: "pi-mono-extension",
      entrypoints: [],
      requiredCommands: [],
      completionGate: {
        singleInProgress: true,
        proofArtifacts: true,
        workspaceVerification: true,
      },
      bodyPreview: "body",
    },
    taskQueue: {
      total: 0,
      todo: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
      failed: 0,
      retryScheduled: 0,
      workspaceVerificationPassed: 0,
      workspaceVerificationFailed: 0,
      completionGateBlocked: 0,
      nextTask: null,
    },
    ulWorkflow: {
      total: 0,
      activeTaskId: null,
      activePhase: null,
    },
    workpads: {
      total: 0,
      latest: null,
      recent: [],
    },
    orchestrator: {
      running: true,
      pollIntervalMs: 30000,
      startedAt: "2026-03-08T03:30:00.000Z",
      lastTickAt: "2026-03-08T03:31:00.000Z",
      tickCount: 4,
      lastError: "linear_api_status:500",
    },
    scheduler: {
      generatedAt: "2026-03-08T04:00:00.000Z",
      eligibleCount: 0,
      blockedCount: 0,
      terminalCount: 0,
      nextEligibleTask: null,
      candidates: [],
    },
    orchestration: {
      totalTracked: 0,
      claimed: 0,
      running: 0,
      retrying: 0,
      released: 0,
      recent: [],
    },
    runtime: {
      activeLlm: 0,
      activeRequests: 0,
      queuedOrchestrations: 0,
      sessions: {
        total: 0,
        starting: 0,
        running: 0,
        completed: 0,
        failed: 0,
      },
    },
  })),
}));

import { runtimeRoutes, cleanupRuntimeSSE } from "../../../../.pi/extensions/web-ui/src/routes/runtime.js";
import { tickSymphonyOrchestrator } from "../../../../.pi/lib/symphony-orchestrator-loop.js";
import { refreshSymphonyScheduler } from "../../../../.pi/lib/symphony-scheduler.js";

describe("runtime-routes", () => {
  it("tick failure を 503 と health 付きで返す", async () => {
    vi.mocked(tickSymphonyOrchestrator).mockRejectedValueOnce(new Error("linear_api_status:500"));

    const response = await runtimeRoutes.request("http://localhost/symphony/orchestrator/tick", {
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("tracker_refresh_failed");
    expect(payload.data.health.trackerStatus).toBe("error");
    expect(payload.data.health.lastTrackerError).toContain("linear_api_status:500");
  });

  it("refresh failure を 503 と snapshot 付きで返す", async () => {
    vi.mocked(refreshSymphonyScheduler).mockRejectedValueOnce(new Error("linear_graphql_errors: denied"));

    const response = await runtimeRoutes.request("http://localhost/symphony/refresh", {
      method: "POST",
    });
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("tracker_refresh_failed");
    expect(payload.data.health.trackerStatus).toBe("error");
    expect(payload.data.health.lastTrackerError).toContain("linear_graphql_errors: denied");
    expect(payload.data.snapshot.health.trackerStatus).toBe("error");
  });
});

cleanupRuntimeSSE();
