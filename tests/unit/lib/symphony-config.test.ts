/**
 * path: tests/unit/lib/symphony-config.test.ts
 * role: Symphony config layer の frontmatter 解決と env 参照を検証する
 * why: tracker と polling の typed config が想定どおり読めることを保証するため
 * related: .pi/lib/symphony-config.ts, .pi/lib/workflow-workpad.ts, WORKFLOW.md
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../.pi/lib/workflow-workpad.js", () => ({
  loadWorkflowDocument: vi.fn(() => ({
    exists: true,
    path: "/repo/WORKFLOW.md",
    frontmatter: {
      tracker: {
        kind: "linear",
        api_key: "$LINEAR_API_KEY",
        project_slug: "mekann",
        active_states: "Todo,In Progress",
        terminal_states: ["Done", "Cancelled"],
      },
      polling: {
        interval_ms: "12345",
      },
      agent: {
        max_concurrent_agents: "7",
        max_retry_backoff_ms: "90000",
      },
      runtime: {
        kind: "pi-mono-extension",
        command: "pi",
      },
    },
    body: "",
  })),
}));

import { loadSymphonyConfig } from "../../../.pi/lib/symphony-config.js";

describe("symphony-config", () => {
  it("frontmatter と env を typed config に解決する", () => {
    vi.stubEnv("LINEAR_API_KEY", "lin-test");

    const config = loadSymphonyConfig("/repo");

    expect(config.tracker.kind).toBe("linear");
    expect(config.tracker.apiKey).toBe("lin-test");
    expect(config.tracker.projectSlug).toBe("mekann");
    expect(config.tracker.activeStates).toEqual(["Todo", "In Progress"]);
    expect(config.tracker.terminalStates).toEqual(["Done", "Cancelled"]);
    expect(config.polling.intervalMs).toBe(12345);
    expect(config.agent.maxConcurrentAgents).toBe(7);
    expect(config.agent.maxRetryBackoffMs).toBe(90000);
    expect(config.runtime.kind).toBe("pi-mono-extension");
    expect(config.runtime.command).toBe("pi");

    vi.unstubAllEnvs();
  });
});
