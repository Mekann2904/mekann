import { describe, it, expect, vi, beforeEach } from "vitest";
import goalExtension from "./index.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPi() {
  const tools: Array<{ name: string; execute: Function }> = [];
  return {
    tools,
    appendEntry: vi.fn((_entry: any) => {}),
    getFlag: vi.fn(() => true),
    events: { emit: vi.fn(), on: vi.fn() },
    registerTool: vi.fn((def: any) => tools.push(def)),
    registerCommand: vi.fn(),
    registerFlag: vi.fn(),
    on: vi.fn(),
    sendUserMessage: vi.fn(),
  };
}

function createMockCtx(overrides?: Record<string, any>) {
  return {
    cwd: "/test",
    hasUI: true,
    sessionManager: {
      getSessionId: vi.fn(() => "test-thread-1"),
      isPersisted: vi.fn(() => true),
      getBranch: vi.fn(() => []),
    },
    isIdle: vi.fn(() => true),
    hasPendingMessages: vi.fn(() => false),
    getContextUsage: vi.fn(() => undefined),
    compact: vi.fn(),
    ui: {
      notify: vi.fn(),
      confirm: vi.fn(() => Promise.resolve(true)),
      editor: vi.fn(() => Promise.resolve("edited objective")),
      setWidget: vi.fn(),
    },
    ...overrides,
  } as any;
}

/**
 * Bootstrap the extension + initialize the session store/runtime
 * by firing the captured `session_start` handler.
 */
function bootstrap() {
  const mockPi = createMockPi();
  goalExtension(mockPi as any);

  // Fire session_start to initialize store & runtime
  const sessionStartHandler = mockPi.on.mock.calls.find(
    (call: any[]) => call[0] === "session_start",
  )![1] as Function;
  const ctx = createMockCtx();
  sessionStartHandler({}, ctx);

  // Extract the /goal command handler
  const goalCommand = mockPi.registerCommand.mock.calls.find(
    (call: any[]) => call[0] === "goal",
  )![1] as { handler: Function; description?: string };

  return { mockPi, ctx, goalCommand };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("/goal command", () => {
  let mockPi: ReturnType<typeof createMockPi>;
  let ctx: ReturnType<typeof createMockCtx>;
  let goalCommand: { handler: Function; description?: string };

  beforeEach(() => {
    ({ mockPi, ctx, goalCommand } = bootstrap());
  });

  // 1. /goal with no goal shows "No active goal"
  it("shows 'No active goal' when no goal exists", async () => {
    await goalCommand.handler("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalled();
    const call = ctx.ui.notify.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("No active goal"),
    );
    expect(call).toBeDefined();
  });

  // 2. /goal with goal shows summary
  it("shows goal summary when a goal exists", async () => {
    // Set a goal via the default syntax
    await goalCommand.handler("Write documentation", ctx);

    // Reset notify calls so we can check the status call
    ctx.ui.notify.mockClear();

    // Now invoke /goal with no args (status)
    await goalCommand.handler("", ctx);

    expect(ctx.ui.notify).toHaveBeenCalled();
    const call = ctx.ui.notify.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0].includes("Write documentation"),
    );
    expect(call).toBeDefined();
  });

  // 3. /goal <objective> sets goal
  it("sets a new goal when given an objective", async () => {
    await goalCommand.handler("Implement auth", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Goal set: Implement auth"),
      "info",
    );
  });

  // 4. /goal clear clears (with confirm = true)
  it("clears the goal when confirmed", async () => {
    await goalCommand.handler("Temporary goal", ctx);

    ctx.ui.confirm.mockResolvedValue(true);
    await goalCommand.handler("clear", ctx);

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Clear goal?",
      expect.stringContaining("Temporary goal"),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal cleared", "info");
  });

  // 5. /goal pause pauses active goal
  it("pauses the active goal", async () => {
    await goalCommand.handler("Active goal to pause", ctx);

    ctx.ui.notify.mockClear();
    await goalCommand.handler("pause", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal paused", "info");
  });

  // 6. /goal resume resumes paused goal
  it("resumes a paused goal", async () => {
    await goalCommand.handler("Goal to resume", ctx);
    await goalCommand.handler("pause", ctx);

    ctx.ui.notify.mockClear();
    await goalCommand.handler("resume", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal resumed", "info");
  });

  // 7. /goal edit updates objective (mock editor to return new text)
  it("edits the goal objective", async () => {
    await goalCommand.handler("Original objective", ctx);

    ctx.ui.notify.mockClear();
    ctx.ui.editor.mockResolvedValue("Updated objective text");

    await goalCommand.handler("edit", ctx);

    expect(ctx.ui.editor).toHaveBeenCalledWith(
      "Edit goal objective:",
      "Original objective",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Updated objective text"),
      "info",
    );
  });

  // 8. existing goal replacement requires confirmation
  it("requires confirmation to replace an existing goal", async () => {
    await goalCommand.handler("First objective", ctx);

    ctx.ui.notify.mockClear();
    ctx.ui.confirm.mockResolvedValue(true);

    // Try to set a new goal (should prompt for confirmation)
    await goalCommand.handler("Replacement objective", ctx);

    expect(ctx.ui.confirm).toHaveBeenCalledWith(
      "Replace existing goal?",
      expect.stringContaining("First objective"),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Replacement objective"),
      "info",
    );
  });

  // 9. --budget prefix parsing
  it("parses --budget prefix in objective", async () => {
    await goalCommand.handler("--budget 5000 Build the feature", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Build the feature"),
      "info",
    );
  });

  // 10. --budget suffix parsing
  it("parses --budget suffix in objective", async () => {
    await goalCommand.handler("Build the feature --budget 5000", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Build the feature"),
      "info",
    );
  });

  // 11. /goal budget 10abc rejects
  it("rejects invalid budget value 10abc", async () => {
    await goalCommand.handler("Temporary goal", ctx);
    ctx.ui.notify.mockClear();

    await goalCommand.handler("budget 10abc", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("positive integer"),
      "warning",
    );
  });

  // 12. /goal budget 0 rejects
  it("rejects budget value 0", async () => {
    await goalCommand.handler("Temporary goal", ctx);
    ctx.ui.notify.mockClear();

    await goalCommand.handler("budget 0", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("positive integer"),
      "warning",
    );
  });

  // 13. /goal --budget 10abc foo rejects
  it("rejects --budget with invalid value in objective", async () => {
    await goalCommand.handler("--budget 10abc foo", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --budget"),
      "warning",
    );
  });

  // 14. /goal foo --budget 10abc rejects
  it("rejects suffix --budget with invalid value", async () => {
    await goalCommand.handler("foo --budget 10abc", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --budget"),
      "warning",
    );
  });

  // 15. /goal --budget 0 foo rejects
  it("rejects --budget 0 in objective", async () => {
    await goalCommand.handler("--budget 0 foo", ctx);
    // 0 matches \d+ but Number.isSafeInteger check with <= 0 rejects it
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("positive integer"),
      "warning",
    );
  });

  // 16. /goal resume works after pause
  it("resume works after pause", async () => {
    await goalCommand.handler("Test goal", ctx);
    ctx.ui.notify.mockClear();

    await goalCommand.handler("pause", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal paused", "info");

    ctx.ui.notify.mockClear();
    await goalCommand.handler("resume", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal resumed", "info");
  });

  // 17. /goal rejects objective containing --budget without a number
  it("rejects objective containing --budget without a number", async () => {
    // Token-based: --budget is found as a token, next token is not a pure digit string
    await goalCommand.handler("fix behavior --budget", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --budget"),
      "warning",
    );
  });

  // 18. /goal pause with no goal shows warning
  it("pause with no goal shows warning", async () => {
    await goalCommand.handler("pause", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No goal to pause", "warning");
  });

  // 19. /goal pause already paused shows warning
  it("pause on already paused goal shows warning", async () => {
    await goalCommand.handler("Goal to pause", ctx);
    await goalCommand.handler("pause", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("pause", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already paused"),
      "warning",
    );
  });

  // 20. /goal resume with no goal shows warning
  it("resume with no goal shows warning", async () => {
    await goalCommand.handler("resume", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No goal to resume", "warning");
  });

  // 21. /goal resume when already active shows info
  it("resume on already active goal shows info", async () => {
    await goalCommand.handler("Active goal", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("resume", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already active"),
      "info",
    );
  });

  // 22. /goal clear with no goal shows warning
  it("clear with no goal shows warning", async () => {
    await goalCommand.handler("clear", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No goal to clear", "warning");
  });

  // 23. /goal clear cancelled
  it("clear cancelled shows info", async () => {
    await goalCommand.handler("To be cleared", ctx);
    ctx.ui.confirm.mockResolvedValue(false);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("clear", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Cancelled", "info");
  });

  // 24. /goal edit with no goal shows warning
  it("edit with no goal shows warning", async () => {
    await goalCommand.handler("edit", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No goal to edit", "warning");
  });

  // 25. /goal edit unchanged (same text) shows info
  it("edit unchanged shows info", async () => {
    await goalCommand.handler("Same objective", ctx);
    ctx.ui.editor.mockResolvedValue("Same objective"); // same text
    ctx.ui.notify.mockClear();
    await goalCommand.handler("edit", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal unchanged", "info");
  });

  // 26. /goal edit cancelled (empty return) shows info
  it("edit cancelled (null) shows info", async () => {
    await goalCommand.handler("Original obj", ctx);
    ctx.ui.editor.mockResolvedValue(null as any);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("edit", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal unchanged", "info");
  });

  // 27. /goal budget with no arg shows current budget
  it("budget with no arg shows current budget", async () => {
    await goalCommand.handler("--budget 5000 Budgeted goal", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Current budget: 5000"),
      "info",
    );
  });

  // 28. /goal budget with no arg and no goal
  it("budget with no arg and no goal shows warning", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith("No active goal", "warning");
  });

  // 29. /goal budget none removes budget
  it("budget none removes budget", async () => {
    await goalCommand.handler("--budget 5000 Budgeted", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget none", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("unlimited"),
      "info",
    );
  });

  // 30. /goal budget with no goal to set
  it("budget value with no goal shows warning", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget 1000", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No goal to set budget"),
      "warning",
    );
  });

  // 31. /goal set with no objective shows usage
  it("set with no objective shows usage", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("set", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage: /goal set <objective>"),
      "warning",
    );
  });

  // 32. /goal set with objective works
  it("set with objective creates goal", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("set Build the thing", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Build the thing"),
      "info",
    );
  });

  // 33. /goal with unknown subcommand treats as objective
  it("unknown subcommand treated as objective", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("some random objective", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("some random objective"),
      "info",
    );
  });

  // 34. Replacement cancelled
  it("goal replacement cancelled by user", async () => {
    await goalCommand.handler("First objective", ctx);
    ctx.ui.confirm.mockResolvedValue(false);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("Second objective", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Goal replacement cancelled",
      "info",
    );
  });

  // 35. /goal --budget with only budget and no objective
  it("--budget with no objective shows usage", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("--budget 5000", ctx);
    // The objective after removing --budget 5000 is empty string
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Usage:"),
      "warning",
    );
  });

  // 36. /goal budget shows 'none' when no budget set
  it("budget with no arg shows 'none' when no budget", async () => {
    await goalCommand.handler("Goal without budget", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Current budget: none"),
      "info",
    );
  });

  // 37. /goal resume rejects when budget exhausted
  it("resume rejects when token budget exhausted", async () => {
    await goalCommand.handler("--budget 100 Budget limited goal", ctx);
    // Manually update tokens_used to exceed budget
    const goal = (mockPi as any).appendEntry.mock.calls;
    // We need to access the store to update tokens
    // Use get_goal tool to verify, then update via store
    const getGoalTool = mockPi.tools.find((t: any) => t.name === "get_goal");
    const result = await getGoalTool.execute("tc", {}, undefined, undefined, ctx);
    const goalId = result.details.goal.goal_id;

    // Simulate token usage via runtime's onMessageEnd
    const agentStartHandler = mockPi.on.mock.calls.find(
      (call: any[]) => call[0] === "agent_start",
    )?.[1] as Function;
    const turnStartHandler = mockPi.on.mock.calls.find(
      (call: any[]) => call[0] === "turn_start",
    )?.[1] as Function;
    const msgEndHandler = mockPi.on.mock.calls.find(
      (call: any[]) => call[0] === "message_end",
    )?.[1] as Function;

    if (agentStartHandler) await agentStartHandler();
    if (turnStartHandler) await turnStartHandler({}, ctx);
    if (msgEndHandler) {
      await msgEndHandler(
        { message: { role: "assistant", timestamp: 9999, usage: { input: 80, output: 30, cacheRead: 0 } } },
        ctx,
      );
    }

    // Now pause
    await goalCommand.handler("pause", ctx);
    ctx.ui.notify.mockClear();

    // Try to resume — should fail due to exhausted budget
    await goalCommand.handler("resume", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Cannot resume"),
      "warning",
    );
  });

  // 38. /goal command disabled when flag off
  it("command handler rejects when goals flag disabled", async () => {
    mockPi.getFlag.mockReturnValue(false);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("some objective", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("disabled"),
      "warning",
    );
  });

  // 39. /goal command disabled when session not persisted
  it("command handler rejects when session not persisted", async () => {
    ctx.sessionManager.isPersisted.mockReturnValue(false);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("some objective", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("persisted"),
      "warning",
    );
  });

  // 40. resume reactivates a paused goal after prior continuation activity
  it("resume reactivates a paused goal after prior continuation activity", async () => {
    await goalCommand.handler("Continue goal", ctx);
    // Pause then resume should bring the goal back to active. Prior continuations
    // no longer gate resume (the per-goal continuation ceiling was removed).
    await goalCommand.handler("pause", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("resume", ctx);

    const allNotifies = ctx.ui.notify.mock.calls.map((c: any[]) => c[0]);
    expect(allNotifies.some((n: string) => n.includes("resumed") || n.includes("Goal resumed"))).toBe(true);
  });

  // 41. /goal budget sets valid budget
  it("budget command sets a valid token budget", async () => {
    await goalCommand.handler("Budget test", ctx);
    ctx.ui.notify.mockClear();
    await goalCommand.handler("budget 5000", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Budget set"),
      "info",
    );
  });

  // 42. /goal set <objective> explicitly sets objective
  it("set subcommand creates a goal", async () => {
    ctx.ui.notify.mockClear();
    await goalCommand.handler("set My explicit objective", ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Goal set"),
      "info",
    );
  });
});
