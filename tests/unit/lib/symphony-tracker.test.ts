/**
 * path: tests/unit/lib/symphony-tracker.test.ts
 * role: Symphony tracker adapter の task_queue fallback を検証する
 * why: local issue source が scheduler から安定して読めることを保証するため
 * related: .pi/lib/symphony-tracker.ts, .pi/lib/symphony-config.ts, .pi/lib/storage/task-plan-store.ts
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

vi.mock("../../../.pi/lib/storage/task-plan-store.js", () => ({
  loadTaskStorage: vi.fn(() => ({
    tasks: [
      {
        id: "task-1",
        title: "Implement orchestration",
        description: "build tracker layer",
        status: "todo",
        priority: "high",
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
      },
      {
        id: "task-2",
        title: "Done task",
        status: "completed",
        priority: "low",
        createdAt: "2026-03-08T01:00:00.000Z",
        updatedAt: "2026-03-08T01:00:00.000Z",
      },
    ],
  })),
}));

vi.mock("../../../.pi/extensions/web-ui/lib/ul-workflow-reader.js", () => ({
  getAllUlWorkflowTasks: vi.fn(() => [{
    id: "ul-1",
    title: "UL implementation",
    description: "drive the workflow loop",
    status: "in_progress",
    priority: "medium",
    createdAt: "2026-03-08T00:30:00.000Z",
    updatedAt: "2026-03-08T00:45:00.000Z",
    phase: "implement",
  }]),
}));

import {
  fetchSymphonyCandidateIssues,
  fetchSymphonyIssueStatesByIds,
  fetchSymphonyIssuesByStates,
  SymphonyTrackerError,
} from "../../../.pi/lib/symphony-tracker.js";
import { loadSymphonyConfig } from "../../../.pi/lib/symphony-config.js";

describe("symphony-tracker", () => {
  it("task_queue active states を candidate issues に変換する", async () => {
    const issues = await fetchSymphonyCandidateIssues("/repo");

    expect(issues).toHaveLength(2);
    expect(issues[0]?.id).toBe("task-1");
    expect(issues[0]?.state).toBe("Todo");
    expect(issues[0]?.priority).toBe(2);
    expect(issues[1]?.id).toBe("ul-1");
    expect(issues[1]?.state).toBe("In Progress");
    expect(issues[1]?.labels).toContain("ul-workflow");
  });

  it("state と id で issue を取得できる", async () => {
    const terminal = await fetchSymphonyIssuesByStates("/repo", ["Done"]);
    const byIds = await fetchSymphonyIssueStatesByIds("/repo", ["task-2"]);

    expect(terminal[0]?.id).toBe("task-2");
    expect(byIds[0]?.state).toBe("Done");
  });

  it("UL workflow task も id refresh で取得できる", async () => {
    const byIds = await fetchSymphonyIssueStatesByIds("/repo", ["ul-1"]);

    expect(byIds).toHaveLength(1);
    expect(byIds[0]?.id).toBe("ul-1");
    expect(byIds[0]?.state).toBe("In Progress");
    expect(byIds[0]?.labels).toContain("ul-workflow");
  });

  it("linear issue payload を blocked_by と label 正規化付きで変換する", async () => {
    vi.mocked(loadSymphonyConfig).mockReturnValueOnce({
      workflowPath: "/repo/WORKFLOW.md",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "lin_api_test",
        projectSlug: "proj",
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
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [{
              id: "lin-1",
              identifier: "PRJ-1",
              title: "Implement Linear adapter",
              description: "normalize payload",
              priority: 2,
              state: { name: "Todo" },
              labels: { nodes: [{ name: "Bug" }, { name: "bug" }] },
              inverseRelations: {
                nodes: [{
                  type: "blocks",
                  issue: {
                    id: "lin-2",
                    identifier: "PRJ-2",
                    state: { name: "In Progress" },
                  },
                }],
              },
            }],
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
          },
        },
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    const issues = await fetchSymphonyCandidateIssues("/repo");

    expect(issues).toHaveLength(1);
    expect(issues[0]?.labels).toEqual(["bug"]);
    expect(issues[0]?.blocked_by).toEqual([{
      id: "lin-2",
      identifier: "PRJ-2",
      state: "In Progress",
    }]);

    vi.unstubAllGlobals();
  });

  it("linear request error を tracker error code 付きで返す", async () => {
    vi.mocked(loadSymphonyConfig).mockReturnValueOnce({
      workflowPath: "/repo/WORKFLOW.md",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "lin_api_test",
        projectSlug: "proj",
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
    });

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    await expect(fetchSymphonyCandidateIssues("/repo")).rejects.toMatchObject<SymphonyTrackerError>({
      code: "linear_api_request",
    });

    vi.unstubAllGlobals();
  });

  it("linear non-200 status を tracker error code 付きで返す", async () => {
    vi.mocked(loadSymphonyConfig).mockReturnValueOnce({
      workflowPath: "/repo/WORKFLOW.md",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "lin_api_test",
        projectSlug: "proj",
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
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
    })));

    await expect(fetchSymphonyCandidateIssues("/repo")).rejects.toMatchObject<SymphonyTrackerError>({
      code: "linear_api_status",
      message: "500",
    });

    vi.unstubAllGlobals();
  });

  it("linear project_slug が無い場合は typed error を返す", async () => {
    vi.mocked(loadSymphonyConfig).mockReturnValueOnce({
      workflowPath: "/repo/WORKFLOW.md",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "lin_api_test",
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
    });

    await expect(fetchSymphonyCandidateIssues("/repo")).rejects.toMatchObject<SymphonyTrackerError>({
      code: "missing_tracker_project_slug",
    });
  });

  it("linear pagination endCursor が欠けた場合は typed error を返す", async () => {
    vi.mocked(loadSymphonyConfig).mockReturnValueOnce({
      workflowPath: "/repo/WORKFLOW.md",
      tracker: {
        kind: "linear",
        endpoint: "https://api.linear.app/graphql",
        apiKey: "lin_api_test",
        projectSlug: "proj",
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
    });

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [],
            pageInfo: {
              hasNextPage: true,
              endCursor: null,
            },
          },
        },
      }),
    })));

    await expect(fetchSymphonyCandidateIssues("/repo")).rejects.toMatchObject<SymphonyTrackerError>({
      code: "linear_missing_end_cursor",
    });

    vi.unstubAllGlobals();
  });
});
