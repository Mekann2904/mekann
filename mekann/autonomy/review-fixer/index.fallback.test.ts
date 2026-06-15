/**
 * Tests for the review_fixer tool's errored-result fallback hint.
 *
 * When the child Pi review fails (delegate.status === "errored"), the result
 * message must surface the thermo-nuclear-code-quality-review force-load
 * fallback so the agent can run the same review manually in the parent session
 * (the skill is hidden from the Issue Work Pi skill surface — ADR-0023 — but
 * remains force-loadable via /skill:<name>).
 *
 * Heavy mocking is intentional: execute() spans issue resolution, the subagent
 * delegate call, hash snapshots, and git status. We stub each to reach the
 * errored branch in isolation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const registeredProviders: unknown[] = [];
vi.mock("../../core/prompt-core/index.js", () => ({
  registerPromptProvider: (p: unknown) => { registeredProviders.push(p); },
}));

const mockDelegate = vi.fn();
vi.mock("../subagent/controlFactory.js", () => ({
  createSubagentControl: () => ({
    delegate: mockDelegate,
    shutdown: async () => {},
  }),
}));

vi.mock("./schemas.js", () => ({
  ReviewFixerParamsSchema: { type: "object", properties: {}, required: [] },
}));

const mockResolveIssueContext = vi.fn();
const mockCheckIssueReadiness = vi.fn();
vi.mock("./issueContext.js", () => ({
  resolveIssueContext: mockResolveIssueContext,
  checkIssueReadiness: mockCheckIssueReadiness,
}));

vi.mock("./changedFiles.js", () => ({
  snapshotContentHashes: () => new Map<string, string>(),
  computeChangedFiles: () => [],
}));

vi.mock("./settingsLoader.js", () => ({
  loadReviewFixerSettings: () => ({ maxFixRetries: 0, model: undefined, reasoningEffort: undefined }),
}));

vi.mock("./childPrompt.js", () => ({
  buildChildPrompt: () => "stub-child-prompt",
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  // index.ts only calls execFileSync for `git status --porcelain`; stub that
  // while keeping execFile (used transitively by pi-session.ts) intact.
  return { ...actual, execFileSync: () => "" };
});

const mockIssue = {
  number: 42,
  title: "Test issue",
  url: "https://github.com/o/r/issues/42",
  labels: [],
  body: "",
  isBlocked: false,
};

beforeEach(() => {
  registeredProviders.length = 0;
  mockDelegate.mockReset();
  mockResolveIssueContext.mockReset();
  mockCheckIssueReadiness.mockReset();
  // Enable the extension for an Issue Work Pi session.
  process.env.MEKANN_ISSUE_PI = "1";
  delete process.env.PI_SUBAGENT_ROLE;
});

describe("review_fixer errored-result fallback hint", () => {
  it("surfaces the thermo-nuclear force-load fallback when the child review fails", async () => {
    mockResolveIssueContext.mockResolvedValue(mockIssue);
    mockCheckIssueReadiness.mockReturnValue(null);
    mockDelegate.mockResolvedValue({
      status: "errored",
      agent_id: "agent-1",
      task_name: "review-fixer-42",
      final_result: "",
    });

    const { default: reviewFixerExtension } = await import("./index.js");
    const tools: Array<Record<string, unknown>> = [];
    const api = {
      registerTool: (t: Record<string, unknown>) => { tools.push(t); },
      on: () => {},
    };
    await reviewFixerExtension(api as never);

    const tool = tools.find((t) => t.name === "review_fixer") as {
      execute: (...args: unknown[]) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    };
    expect(tool).toBeDefined();

    const result = await tool.execute("id", {}, undefined, undefined, { cwd: "/tmp" });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain("FAILED");
    // The fallback must point at the hidden-but-force-loadable skill.
    expect(text).toContain("/skill:thermo-nuclear-code-quality-review");
    expect(text).toContain("force-loadable");
  });
});
