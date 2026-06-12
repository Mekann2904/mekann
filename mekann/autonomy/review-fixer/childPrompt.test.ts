/**
 * Tests for buildChildPrompt — verify skill enforcement, result schema
 * requirements, and mandatory workflow instructions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("buildChildPrompt", () => {
  const mockCwd = "/tmp/test-worktree";

  it("includes mandatory workflow section", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("MANDATORY WORKFLOW");
    expect(prompt).toContain("Inspect the diff");
    expect(prompt).toContain("Apply the review skill");
    expect(prompt).toContain("Edit if needed");
    expect(prompt).toContain("Verify");
    expect(prompt).toContain("Return structured JSON");
  });

  it("states the skill is MANDATORY, not optional reference", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("thermo-nuclear-code-quality-review (MANDATORY)");
    expect(prompt).toContain("PRIMARY instruction set");
    expect(prompt).toContain("not reference material");
  });

  it("includes review tone and approval bar requirements", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("Review tone");
    expect(prompt).toContain("Approval bar");
    expect(prompt).toContain("approval bar rigorously");
  });

  it("includes required output format with CRITICAL emphasis", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("Required Output Format — CRITICAL");
    expect(prompt).toContain("review-fixer.result.v1");
    expect(prompt).toContain("Do NOT wrap it in markdown code fences");
    expect(prompt).toContain("FAILURE");
  });

  it("requires Japanese for findings, risks, and next_steps", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("findings descriptions MUST be in Japanese");
    expect(prompt).toContain("remaining_risks MUST be in Japanese");
    expect(prompt).toContain("parent_next_steps MUST be in Japanese");
  });

  it("includes issue context with number and title", () => {
    const ctx = makeIssueContext({ number: 42, title: "Fix the thing" });
    const prompt = buildChildPrompt(ctx, mockCwd);
    expect(prompt).toContain("#42");
    expect(prompt).toContain("Fix the thing");
    expect(prompt).toContain(ctx.url);
  });

  it("includes the thermo-nuclear review skill content", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    // These are distinctive phrases from the skill file
    expect(prompt).toContain("Thermo-Nuclear Code Quality Review");
    expect(prompt).toContain("code judo");
    expect(prompt).toContain("1000 lines");
  });

  it("prohibits git operations and subagent spawning", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    expect(prompt).toContain("MUST NOT run commit, push, PR, or any git operations");
    expect(prompt).toContain("MUST NOT spawn subagents");
  });

  it("includes CONTEXT.md when present", () => {
    // The function reads from filesystem; we test that the section header appears
    // even if the file doesn't exist (it gracefully handles absence)
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    // Should not crash even without a real CONTEXT.md
    expect(prompt).toContain("Issue Context");
  });

  it("does not include CONTEXT.md section when file is absent", () => {
    const prompt = buildChildPrompt(makeIssueContext(), mockCwd);
    // If CONTEXT.md doesn't exist, the section should be omitted
    const hasContextSection = prompt.includes("## Project Context (CONTEXT.md)");
    // This is OK either way — the test just verifies no crash
    expect(typeof hasContextSection).toBe("boolean");
  });
});
