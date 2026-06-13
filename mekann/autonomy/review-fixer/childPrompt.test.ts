import { describe, it, expect } from "vitest";
import { buildChildPrompt } from "./childPrompt.js";
import type { ResolvedIssueContext } from "./issueContext.js";
import type { IssueDependencyStatus } from "../../utils/issue/github.js";

function makeIssueContext(overrides: Partial<ResolvedIssueContext> = {}): ResolvedIssueContext {
  const depStatus: IssueDependencyStatus = { openBlockers: [], blockedBy: [], error: undefined };
  return {
    number: 21,
    title: "Test issue",
    url: "https://github.com/example/repo/issues/21",
    body: "Test body",
    labels: ["bug"],
    remote: "example/repo",
    dependencyStatus: depStatus,
    ...overrides,
  };
}

const options = { maxFixRetries: 3 };

describe("buildChildPrompt", () => {
  const mockCwd = "/tmp/test-worktree";

  it("loads the existing thermo-nuclear skill via Pi skill expansion", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd, options);
    expect(prompt.startsWith("/skill:thermo-nuclear-code-quality-review")).toBe(true);
    expect(prompt).not.toContain("## Review Skill: thermo-nuclear-code-quality-review (MANDATORY)");
    expect(prompt).not.toContain("review-fixer.result.v1");
  });

  it("asks the child Pi to use the normal skill behavior", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd, options);
    expect(prompt).toContain("既存の thermo-nuclear-code-quality-review skill の手順・出力形式・判断基準に従ってください");
    expect(prompt).toContain("必要な修正があれば、この workspace に直接 edit してください");
    expect(prompt).toContain("最大 3 回まで修正と再検証");
  });

  it("includes issue context with number and title", () => {
    const ctx = makeIssueContext({ number: 42, title: "Fix the thing" });
    const prompt = buildChildPrompt(ctx, mockCwd, options);
    expect(prompt).toContain("#42");
    expect(prompt).toContain("Fix the thing");
    expect(prompt).toContain(ctx.url);
  });

  it("prohibits commit, push, PR, and nested subagents", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd, options);
    expect(prompt).toContain("commit / push / PR 作成は行わないでください");
    expect(prompt).toContain("subagent を起動せず");
  });
});
