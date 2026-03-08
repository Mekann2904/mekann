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
} from "../../../.pi/lib/symphony-tracker.js";

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
});
