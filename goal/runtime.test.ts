import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoalRuntime } from "./runtime.js";
import { GoalStore, type GoalStateEntry } from "./state.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockPi() {
  return {
    appendEntry: vi.fn(),
    getFlag: vi.fn(() => true),
    events: { emit: vi.fn(), on: vi.fn() },
    sendUserMessage: vi.fn(),
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
    registerFlag: vi.fn(),
    on: vi.fn(),
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
      getEntries: vi.fn(() => []),
    },
    isIdle: vi.fn(() => true),
    hasPendingMessages: vi.fn(() => false),
    ui: {
      notify: vi.fn(),
      confirm: vi.fn(),
      editor: vi.fn(),
      setWidget: vi.fn(),
    },
    ...overrides,
  } as any;
}

/** Helper: create a runtime with an active goal and fake timers ready. */
function setupRuntimeWithGoal(tokenBudget?: number | null) {
  const persistFn = vi.fn();
  const store = new GoalStore(persistFn);
  const pi = createMockPi() as any;
  const runtime = new GoalRuntime(store, pi);
  const ctx = createMockCtx();

  const goal = store.createGoal("test-thread-1", "Build the feature", tokenBudget);
  return { runtime, store, pi, ctx, goal, persistFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GoalRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. turn start captures active goal ──────────────────────

  it("turn start captures active goal", () => {
    const { runtime, ctx, goal } = setupRuntimeWithGoal();

    // Before turn start, active_goal_id is null
    expect(runtime.active_goal_id).toBeNull();

    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    expect(runtime.active_goal_id).toBe(goal.goal_id);
    expect(runtime.last_accounted_wall_clock).toBe(Date.now());
  });

  // ─── 2. tool completion accounts wall-clock time once ────────

  it("tool completion accounts wall-clock time once (via message_end token accounting)", () => {
    const { runtime, ctx, goal, store } = setupRuntimeWithGoal();

    // Start turn to establish baseline
    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    // Advance wall-clock by 5 seconds
    vi.advanceTimersByTime(5000);

    // Simulate message_end with usage data
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 12345,
          usage: { input: 100, output: 50, cacheRead: 0 },
        },
      },
      ctx,
    );

    const updated = store.getGoal()!;
    // Tokens: (100 - 0) + 50 = 150
    expect(updated.tokens_used).toBe(150);
    // Time: 5 seconds
    expect(updated.time_used_seconds).toBe(5);

    // Advance another 3 seconds and send duplicate timestamp — should be deduped
    vi.advanceTimersByTime(3000);
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 12345, // same timestamp
          usage: { input: 200, output: 100, cacheRead: 0 },
        },
      },
      ctx,
    );

    // Should not have double-counted
    const afterDup = store.getGoal()!;
    expect(afterDup.tokens_used).toBe(150);
    expect(afterDup.time_used_seconds).toBe(5);
  });

  // ─── 3. cached input is excluded from token delta ────────────

  it("cached input is excluded from token delta", () => {
    const { runtime, ctx, store } = setupRuntimeWithGoal();

    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 99999,
          usage: { input: 100, output: 50, cacheRead: 30 },
        },
      },
      ctx,
    );

    // Token delta = max(0, 100 - 30) + 50 = 120
    expect(store.getGoal()!.tokens_used).toBe(120);
  });

  // ─── 4. turn finish accounts final usage ─────────────────────

  it("turn finish accounts final usage", () => {
    const { runtime, ctx, store } = setupRuntimeWithGoal();

    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    // Advance 2 seconds during turn
    vi.advanceTimersByTime(2000);

    // End turn — should account remaining wall-clock time
    runtime.onTurnEnd({ turnIndex: 0 }, ctx);

    const goal = store.getGoal()!;
    expect(goal.time_used_seconds).toBe(2);
    // continuation_active should be reset
    expect(runtime.continuation_active).toBe(false);
  });

  // ─── 5. interrupt pauses active goal ─────────────────────────

  it("interrupt pauses active goal (aborted stopReason)", () => {
    const { runtime, ctx, store } = setupRuntimeWithGoal();

    runtime.onTurnStart({ turnIndex: 0 }, ctx);
    vi.advanceTimersByTime(3000);

    runtime.onAgentEnd(
      {
        messages: [
          { role: "user", content: "go" },
          { role: "assistant", stopReason: "aborted" },
        ],
      },
      ctx,
    );

    const goal = store.getGoal()!;
    expect(goal.status).toBe("paused");
    expect(runtime.active_goal_id).toBeNull();
    // Wall-clock should have been accounted before pause
    expect(goal.time_used_seconds).toBe(3);
  });

  // ─── 6. plan mode suppresses goal continuation ───────────────

  it("plan mode suppresses goal continuation", () => {
    const { runtime, pi, ctx } = setupRuntimeWithGoal();

    runtime.inPlanMode = true;
    runtime.maybeContinueIfIdle(ctx);

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  // ─── 7. active idle goal starts continuation turn ────────────

  it("active idle goal starts continuation turn", () => {
    const { runtime, pi, ctx, goal } = setupRuntimeWithGoal();

    runtime.maybeContinueIfIdle(ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Build the feature"),
      { deliverAs: "followUp" },
    );

    expect(runtime.continuation_active).toBe(true);
  });

  // ─── 8. queued user input prevents continuation ──────────────

  it("queued user input prevents continuation (hasPendingMessages = true)", () => {
    const { runtime, pi } = setupRuntimeWithGoal();

    const ctx = createMockCtx({
      hasPendingMessages: vi.fn(() => true),
    });

    runtime.maybeContinueIfIdle(ctx);

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(runtime.continuation_active).toBe(false);
  });

  // ─── 9. budget limit injects steering once per goal ──────────

  it("budget limit injects steering once per goal", () => {
    // Create a goal with a tight budget
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal(200);

    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    // First message_end that exceeds budget
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 1001,
          usage: { input: 100, output: 150, cacheRead: 0 },
        },
      },
      ctx,
    );

    // Budget steering should be injected
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Token budget limit reached"),
      { deliverAs: "followUp" },
    );

    // Budget should be limited now
    const goal = store.getGoal()!;
    expect(goal.status).toBe("budget_limited");

    // Reset status to active manually to test dedup (simulating external update)
    store.updateGoal({ status: "active" }, undefined, "runtime");
    runtime.active_goal_id = goal.goal_id;
    runtime.last_accounted_wall_clock = Date.now();

    // Another message_end with more tokens
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 1002,
          usage: { input: 50, output: 50, cacheRead: 0 },
        },
      },
      ctx,
    );

    // Should NOT send a second steering message for the same goal_id
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  // ─── 10. completion suppresses budget steering ───────────────

  it("completion suppresses budget steering", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal(200);

    runtime.onTurnStart({ turnIndex: 0 }, ctx);

    // Suppress budget steering (as update_goal would do when setting complete)
    runtime.suppressBudgetSteering();

    // Send usage that would exceed budget
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 2001,
          usage: { input: 100, output: 150, cacheRead: 0 },
        },
      },
      ctx,
    );

    // Budget steering should NOT be injected
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    // But goal should still be budget_limited from accounting
    const goal = store.getGoal()!;
    expect(goal.status).toBe("budget_limited");
  });

  // ─── 11. continuation_count guard pauses at max ────────────

  it("continuation_count guard pauses at max", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();

    // Set continuation_count to max
    store.updateGoal({ continuation_count: 5, last_continued_at_ms: Date.now() });

    runtime.maybeContinueIfIdle(ctx);

    // Should NOT send continuation — should pause instead
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("automatically paused after 5 continuations"),
      { deliverAs: "followUp" },
    );

    const goal = store.getGoal()!;
    expect(goal.status).toBe("paused");
    expect(runtime.continuation_active).toBe(false);
  });

  // ─── 12. cooldown prevents continuation ──────────────────────

  it("cooldown prevents continuation", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();

    // Set last_continued_at_ms to recent time (within cooldown)
    store.updateGoal({ continuation_count: 2, last_continued_at_ms: Date.now() - 1000 });

    runtime.maybeContinueIfIdle(ctx);

    // Should NOT send continuation due to cooldown
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(runtime.continuation_active).toBe(false);
  });

  // ─── 13. continuation increments count and updates timestamp ─

  it("continuation increments count and updates timestamp", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();

    // Set to 2 continuations with old timestamp (past cooldown)
    const oldTs = Date.now() - 5000;
    store.updateGoal({ continuation_count: 2, last_continued_at_ms: oldTs });

    runtime.maybeContinueIfIdle(ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);

    const goal = store.getGoal()!;
    expect(goal.continuation_count).toBe(3);
    expect(goal.last_continued_at_ms).toBeGreaterThan(oldTs);
  });

  // ─── 14. expectedGoalId prevents stale accounting ────────────

  it("expectedGoalId prevents stale accounting after goal replace", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();
    const goalA = store.getGoal()!;

    // Simulate turn start capturing goal A
    runtime.onTurnStart({ turnIndex: 0 }, ctx);
    expect(runtime.active_goal_id).toBe(goalA.goal_id);

    // Replace goal A with goal B at store level ONLY (not via onExternalSet)
    // This simulates a race where the store is updated but active_goal_id
    // hasn't been synced yet (e.g. delayed lifecycle event)
    const goalB = store.replaceGoal("test-thread-1", "New objective");
    // active_goal_id is still goalA's
    expect(runtime.active_goal_id).toBe(goalA.goal_id);
    // store's current goal is now goalB
    expect(store.getGoal()!.goal_id).toBe(goalB.goal_id);

    // Advance wall-clock
    vi.advanceTimersByTime(5000);

    // Simulate a delayed message_end — active_goal_id is still A
    // but store's goal is B. The expectedGoalId (= A) won't match B's id.
    runtime.onMessageEnd(
      {
        message: {
          role: "assistant",
          timestamp: 99999,
          usage: { input: 100, output: 50, cacheRead: 0 },
        },
      },
      ctx,
    );

    // goal B should NOT have received goal A's tokens
    const goalBAfter = store.getGoal()!;
    expect(goalBAfter.goal_id).toBe(goalB.goal_id);
    expect(goalBAfter.tokens_used).toBe(0);
  });

  // ─── 15. stale wall-clock accounting rejected ────────────────

  it("stale wall-clock accounting rejected after goal replace", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();
    const goalA = store.getGoal()!;

    // Turn start
    runtime.onTurnStart({ turnIndex: 0 }, ctx);
    vi.advanceTimersByTime(3000);

    // Replace with new goal
    const goalB = store.replaceGoal("test-thread-1", "New objective");
    runtime.onExternalSet(goalB, goalA);

    // Turn end tries to account wall-clock — active_goal_id is now goalB
    runtime.onTurnEnd({ turnIndex: 0 }, ctx);

    // goal B should not have inherited A's wall-clock time
    const goalBAfter = store.getGoal()!;
    expect(goalBAfter.time_used_seconds).toBe(0);
  });

  // ─── 16. continuation counter at max is not reset without explicit action ──

  it("continuation at max pauses goal without reset", () => {
    const { runtime, pi, ctx, store } = setupRuntimeWithGoal();

    // Set continuation_count to max
    store.updateGoal({ continuation_count: 5, last_continued_at_ms: Date.now() - 5000 });

    runtime.maybeContinueIfIdle(ctx);

    // Goal should be paused
    const goal = store.getGoal()!;
    expect(goal.status).toBe("paused");
    expect(goal.continuation_count).toBe(5); // not reset by auto-pause
  });
});
