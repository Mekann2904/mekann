import { describe, it, expect } from "vitest";
import {
  escapeXmlText,
  formatDuration,
  continuationPrompt,
  budgetLimitPrompt,
  objectiveUpdatedPrompt,
  renderGoalPolicy,
  renderGoalObjectiveContext,
  renderGoalRuntimeState,
  renderGoalContext,
  renderGoalSummary,
  renderNoGoal,
  renderWidget,
} from "./prompts.js";
import type { Goal } from "./state.js";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function createMockGoal(overrides?: Partial<Goal>): Goal {
  return {
    goal_id: "g-1",
    thread_id: "t-1",
    objective: "Test objective",
    status: "active",
    tokens_used: 100,
    token_budget: null,
    time_used_seconds: 45,
    continuation_count: 2,
    max_continuations: 5,
    last_continued_at_ms: null,
    source: "tool",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Goal;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("goal/prompts", () => {
  describe("escapeXmlText", () => {
    it("escapes &, <, >", () => {
      expect(escapeXmlText("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
    });

    it("returns plain text unchanged", () => {
      expect(escapeXmlText("hello world")).toBe("hello world");
    });
  });

  describe("formatDuration", () => {
    it("formats seconds under 60", () => {
      expect(formatDuration(30)).toBe("30s");
    });

    it("formats minutes and seconds", () => {
      expect(formatDuration(125)).toBe("2m 5s");
    });

    it("formats hours and minutes", () => {
      expect(formatDuration(3725)).toBe("1h 2m");
    });

    it("formats exactly 60 seconds as 1m 0s", () => {
      expect(formatDuration(60)).toBe("1m 0s");
    });

    it("formats exactly 3600 seconds as 1h 0m", () => {
      expect(formatDuration(3600)).toBe("1h 0m");
    });
  });

  describe("continuationPrompt", () => {
    it("includes objective and continuation count", () => {
      const goal = createMockGoal();
      const prompt = continuationPrompt(goal);
      expect(prompt).toContain("Test objective");
      expect(prompt).toContain("2 / 5");
      expect(prompt).toContain("Tokens used: 100");
      expect(prompt).toContain("Time used: 45s");
    });

    it("includes budget when set", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const prompt = continuationPrompt(goal);
      expect(prompt).toContain("Token budget: 5000");
      expect(prompt).toContain("Remaining tokens: 4900");
    });

    it("escapes XML in objective", () => {
      const goal = createMockGoal({ objective: "Use <code> & stuff" });
      const prompt = continuationPrompt(goal);
      expect(prompt).toContain("&lt;code&gt; &amp; stuff");
      expect(prompt).not.toContain("<code>");
    });
  });

  describe("budgetLimitPrompt", () => {
    it("includes budget info and instructions", () => {
      const goal = createMockGoal({ tokens_used: 5000, token_budget: 5000 });
      const prompt = budgetLimitPrompt(goal);
      expect(prompt).toContain("Token budget limit reached");
      expect(prompt).toContain("5000 / 5000");
      expect(prompt).toContain("Time used:");
      expect(prompt).toContain("update_goal");
    });

    it("shows remaining tokens", () => {
      const goal = createMockGoal({ tokens_used: 4500, token_budget: 5000 });
      const prompt = budgetLimitPrompt(goal);
      expect(prompt).toContain("Remaining: 500");
    });
  });

  describe("objectiveUpdatedPrompt", () => {
    it("includes old and new objectives", () => {
      const prompt = objectiveUpdatedPrompt("Old goal", "New goal");
      expect(prompt).toContain("Previous objective: Old goal");
      expect(prompt).toContain("New objective: New goal");
      expect(prompt).toContain("Goal objective updated");
    });

    it("escapes XML in objectives", () => {
      const prompt = objectiveUpdatedPrompt("a <b>", "c & d");
      expect(prompt).toContain("&lt;b&gt;");
      expect(prompt).toContain("&amp;");
    });
  });

  describe("split cache-friendly goal prompt contexts", () => {
    it("renderGoalPolicy contains fixed instructions", () => {
      const policy = renderGoalPolicy();
      expect(policy).toContain("[Goal Policy]");
      expect(policy).toContain("update_goal");
    });

    it("renderGoalObjectiveContext contains objective/status/bounds but not runtime counters", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const text = renderGoalObjectiveContext(goal);
      expect(text).toContain("Test objective");
      expect(text).toContain("Status: active");
      expect(text).toContain("Token budget upper bound: 5000");
      expect(text).toContain("Max continuations upper bound: 5");
      expect(text).not.toContain("Tokens used");
      expect(text).not.toContain("Time used");
      expect(text).not.toContain("Continuation: 2");
      expect(text).not.toContain("Remaining tokens");
    });

    it("renderGoalRuntimeState contains runtime counters", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const text = renderGoalRuntimeState(goal);
      expect(text).toContain("Tokens used: 100");
      expect(text).toContain("Remaining tokens: 4900");
      expect(text).toContain("Time used: 45s");
      expect(text).toContain("Continuation: 2 / 5");
    });
  });

  describe("renderGoalContext", () => {
    it("returns empty string for non-active goal", () => {
      const goal = createMockGoal({ status: "paused" });
      expect(renderGoalContext(goal)).toBe("");
    });

    it("returns context with budget info", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const ctx = renderGoalContext(goal);
      expect(ctx).toContain("Active Goal Context");
      expect(ctx).toContain("Test objective");
      expect(ctx).toContain("Token budget: 5000");
      expect(ctx).toContain("remaining: 4900");
    });

    it("returns context without budget info", () => {
      const goal = createMockGoal({ token_budget: null });
      const ctx = renderGoalContext(goal);
      expect(ctx).toContain("Tokens used: 100");
      expect(ctx).not.toContain("Token budget:");
    });

    it("includes continuation info", () => {
      const goal = createMockGoal();
      const ctx = renderGoalContext(goal);
      expect(ctx).toContain("2 / 5");
    });
  });

  describe("renderGoalSummary", () => {
    it("renders active goal summary", () => {
      const goal = createMockGoal();
      const lines = renderGoalSummary(goal);
      expect(lines[0]).toContain("active");
      expect(lines[1]).toContain("Test objective");
    });

    it("renders with budget", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const lines = renderGoalSummary(goal);
      expect(lines.some((l) => l.includes("Budget:"))).toBe(true);
      expect(lines.some((l) => l.includes("4900 remaining"))).toBe(true);
    });

    it("renders without budget", () => {
      const goal = createMockGoal({ token_budget: null });
      const lines = renderGoalSummary(goal);
      expect(lines.some((l) => l.includes("Budget:"))).toBe(false);
    });
  });

  describe("renderNoGoal", () => {
    it("returns no-goal message with commands", () => {
      const lines = renderNoGoal();
      expect(lines[0]).toBe("No active goal");
      expect(lines.some((l) => l.includes("/goal"))).toBe(true);
    });
  });

  describe("renderWidget", () => {
    it("returns undefined for null goal", () => {
      expect(renderWidget(null)).toBeUndefined();
    });

    it("returns undefined for complete goal", () => {
      const goal = createMockGoal({ status: "complete" });
      expect(renderWidget(goal)).toBeUndefined();
    });

    it("renders active goal with budget", () => {
      const goal = createMockGoal({ token_budget: 5000 });
      const lines = renderWidget(goal)!;
      expect(lines[0]).toContain("active");
      expect(lines[0]).toContain("Test objective");
      expect(lines[1]).toContain("100/5000");
    });

    it("renders paused goal without budget", () => {
      const goal = createMockGoal({ status: "paused", token_budget: null });
      const lines = renderWidget(goal)!;
      expect(lines[0]).toContain("paused");
      expect(lines[1]).toContain("Tokens: 100");
      expect(lines[1]).not.toContain("/");
    });

    it("truncates long objective", () => {
      const longObj = "A".repeat(100);
      const goal = createMockGoal({ objective: longObj });
      const lines = renderWidget(goal)!;
      expect(lines[0].length).toBeLessThan(longObj.length + 20);
    });

    it("renders budget_limited status", () => {
      const goal = createMockGoal({ status: "budget_limited" });
      const lines = renderWidget(goal)!;
      expect(lines[0]).toContain("limited by budget");
    });
  });
});
