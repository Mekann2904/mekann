import { describe, it, expect, vi, beforeEach } from "vitest";
import goalExtension from "./index.js";
import { collectGoalEntriesChronologically } from "./goalLifecycle.js";
import { GoalStore, type GoalStateEntry } from "./state.js";
import { clearPromptProvidersForTests, collectPromptFragments } from "../../core/prompt-core/index.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPi(overrides?: Record<string, any>) {
  const tools: Array<{ name: string; execute: Function }> = [];
  const handlers: Record<string, Function> = {};
  const pi = {
    tools,
    appendEntry: vi.fn((_entry: any) => {}),
    getFlag: vi.fn(() => true),
    events: { emit: vi.fn(), on: vi.fn() },
    registerTool: vi.fn((def: any) => tools.push(def)),
    registerCommand: vi.fn(),
    registerFlag: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    sendUserMessage: vi.fn(),
    ...overrides,
  };
  // Also store handlers for later retrieval
  (pi as any)._handlers = handlers;
  return pi;
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
 * Bootstrap: run extension factory, fire session_start, return everything.
 */
function bootstrap(piOverrides?: Record<string, any>, ctxOverrides?: Record<string, any>) {
  const mockPi = createMockPi(piOverrides);
  goalExtension(mockPi as any);
  const handlers = (mockPi as any)._handlers;

  const ctx = createMockCtx(ctxOverrides);
  // Fire session_start
  if (handlers["session_start"]) {
    handlers["session_start"]({}, ctx);
  }

  return { mockPi, ctx, handlers };
}

function getTool(mockPi: ReturnType<typeof createMockPi>, name: string) {
  return mockPi.tools.find((t) => t.name === name)!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("goal lifecycle and events", () => {
  beforeEach(() => clearPromptProvidersForTests());
  describe("session_start", () => {
    it("clears store/runtime and widget when goals flag is disabled", async () => {
      const mockPi = createMockPi({ getFlag: vi.fn(() => false) });
      goalExtension(mockPi as any);
      const handlers = (mockPi as any)._handlers;

      const ctx = createMockCtx();
      await handlers["session_start"]({}, ctx);

      // Widget should be cleared
      expect(ctx.ui.setWidget).toHaveBeenCalledWith("goal", undefined);

      // Tools should return DISABLED_RESPONSE
      const getGoalTool = getTool(mockPi, "get_goal");
      const result = await getGoalTool.execute("tc-1", {}, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("disabled");
    });

    it("clears store/runtime when session is not persisted", async () => {
      const mockPi = createMockPi();
      goalExtension(mockPi as any);
      const handlers = (mockPi as any)._handlers;

      const ctx = createMockCtx({
        sessionManager: {
          getSessionId: vi.fn(() => "test-thread-1"),
          isPersisted: vi.fn(() => false),
          getBranch: vi.fn(() => []),
        },
      });
      await handlers["session_start"]({}, ctx);

      expect(ctx.ui.setWidget).toHaveBeenCalledWith("goal", undefined);

      const getGoalTool = getTool(mockPi, "get_goal");
      const result = await getGoalTool.execute("tc-1", {}, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("disabled");
    });

    it("replays persisted custom entries into the goal store (chronological)", async () => {
      const mockPi = createMockPi();
      goalExtension(mockPi as any);
      const handlers = (mockPi as any)._handlers;

      // First, create a goal via normal flow to get a valid entry
      const initCtx = createMockCtx();
      await handlers["session_start"]({}, initCtx);

      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute(
        "tc-1",
        { objective: "Persisted goal" },
        undefined,
        undefined,
        initCtx,
      );

      // Capture persisted entries (data payloads only)
      const persistedEntries = mockPi.appendEntry.mock.calls.map(
        (call: any[]) => call[1],
      );
      expect(persistedEntries.length).toBeGreaterThan(0);

      // Wrap each persisted payload as a realistic pi custom entry. Each one
      // carries its own `timestamp` (stamped by the SDK at append time); the
      // replay now sorts on it, so the branch array order no longer matters.
      const baseTime = Date.parse("2026-01-01T00:00:00.000Z");
      const branch = persistedEntries.map((entry: any, i: number) => ({
        type: "custom" as const,
        customType: "goal-state",
        data: entry,
        id: `entry-${i}`,
        parentId: i === 0 ? null : `entry-${i - 1}`,
        timestamp: new Date(baseTime + i * 1000).toISOString(),
      }));

      // Simulate a new session. getBranch() currently returns root→leaf, but
      // replay derives order from each entry's own timestamp, so the array
      // order is irrelevant (order-independence is covered by the
      // `collectGoalEntriesChronologically` property tests below).
      const newPi = createMockPi();
      goalExtension(newPi as any);
      const newHandlers = (newPi as any)._handlers;

      const newCtx = createMockCtx({
        sessionManager: {
          getSessionId: vi.fn(() => "test-thread-1"),
          isPersisted: vi.fn(() => true),
          getBranch: vi.fn(() => branch),
        },
      });
      await newHandlers["session_start"]({}, newCtx);

      const getGoalTool = getTool(newPi, "get_goal");
      const result = await getGoalTool.execute("tc-2", {}, undefined, undefined, newCtx);
      expect(result.content[0].text).toContain("Persisted goal");
    });
  });

  describe("session_shutdown", () => {
    it("clears runtime and store on shutdown", async () => {
      const { mockPi, ctx, handlers } = bootstrap();

      // Create a goal
      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "Shutdown test" }, undefined, undefined, ctx);

      // Fire shutdown
      await handlers["session_shutdown"]();

      // After shutdown, tools should return DISABLED (store is null)
      const getGoalTool = getTool(mockPi, "get_goal");
      const result = await getGoalTool.execute("tc-2", {}, undefined, undefined, ctx);
      expect(result.content[0].text).toContain("disabled");
    });
  });

  describe("agent lifecycle hooks", () => {
    it("calls runtime.onAgentStart on agent_start", async () => {
      const { mockPi, ctx, handlers } = bootstrap();
      // This should not throw — just delegates to runtime
      await handlers["agent_start"]();
      // No assertion on return value; just verify no error
    });

    it("calls runtime.onTurnStart on turn_start", async () => {
      const { mockPi, ctx, handlers } = bootstrap();
      await handlers["turn_start"]({}, ctx);
    });

    it("calls updateWidget on message_end", async () => {
      const { ctx, handlers } = bootstrap();
      ctx.ui.setWidget.mockClear();
      await handlers["message_end"]({ message: { role: "assistant", usage: { input: 10, output: 20 } } }, ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("calls updateWidget on tool_execution_end", async () => {
      const { ctx, handlers } = bootstrap();
      ctx.ui.setWidget.mockClear();
      await handlers["tool_execution_end"]({}, ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("calls updateWidget on turn_end", async () => {
      const { ctx, handlers } = bootstrap();
      ctx.ui.setWidget.mockClear();
      await handlers["turn_end"]({}, ctx);
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("calls updateWidget and maybeContinueIfIdle on agent_end", async () => {
      const { ctx, handlers } = bootstrap();
      ctx.ui.setWidget.mockClear();
      await handlers["agent_end"](
        { messages: [{ role: "assistant", stopReason: "end_turn" }] },
        ctx,
      );
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("does not continue when no store on agent_end", async () => {
      const { mockPi, ctx, handlers } = bootstrap();
      // Shutdown to clear store
      await handlers["session_shutdown"]();
      ctx.ui.setWidget.mockClear();

      // agent_end with no store should not throw
      await handlers["agent_end"](
        { messages: [{ role: "assistant", stopReason: "end_turn" }] },
        ctx,
      );
    });
  });

  describe("prompt provider", () => {
    it("registers no before_agent_start direct prompt injection", async () => {
      const { handlers } = bootstrap();
      expect(handlers["before_agent_start"]).toBeUndefined();
    });

    it("returns no fragments when disabled or no active goal", async () => {
      const mockPi = createMockPi({ getFlag: vi.fn(() => false) });
      goalExtension(mockPi as any);
      await (mockPi as any)._handlers["session_start"]({}, createMockCtx());
      expect(await collectPromptFragments({ cwd: "/test" })).toEqual([]);

      clearPromptProvidersForTests();
      bootstrap();
      expect(await collectPromptFragments({ cwd: "/test" })).toEqual([]);
    });

    it("returns no fragments when goal is not active", async () => {
      const { mockPi, ctx } = bootstrap();
      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "Test" }, undefined, undefined, ctx);
      const goalCommand = (mockPi as any).registerCommand.mock.calls.find((call: any[]) => call[0] === "goal")![1];
      await goalCommand.handler("pause", ctx);
      expect(await collectPromptFragments({ cwd: "/test" })).toEqual([]);
    });

    it("returns stable policy, semi-stable objective, and dynamic runtime for active goal", async () => {
      const { mockPi, ctx } = bootstrap();
      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "My active goal", token_budget: 5000 }, undefined, undefined, ctx);
      const fragments = await collectPromptFragments({ cwd: "/test" });
      expect(fragments.map((f) => [f.kind, f.stability])).toEqual([
        ["goal_policy", "stable"],
        ["goal_objective", "semi_stable"],
        ["goal_runtime_state", "dynamic"],
      ]);
      // Objective fragment must contain only the objective text: status and
      // budget are dynamic and must not leak into the semi-stable prefix.
      expect(fragments[1].content).toContain("My active goal");
      expect(fragments[1].content).not.toContain("Status:");
      expect(fragments[1].content).not.toContain("Token budget upper bound");
      expect(fragments[1].content).not.toContain("Tokens used");
      // Status and budget live in the dynamic runtime-state fragment.
      expect(fragments[2].content).toContain("Status: active");
      expect(fragments[2].content).toContain("Tokens used");
      expect(fragments[2].content).toContain("Token budget upper bound: 5000");
    });
  });

  describe("emitUpdated and emitCleared", () => {
    it("emits goal:updated event and updates widget on create", async () => {
      const { mockPi, ctx } = bootstrap();
      mockPi.events.emit.mockClear();
      ctx.ui.setWidget.mockClear();

      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "Emit test" }, undefined, undefined, ctx);

      expect(mockPi.events.emit).toHaveBeenCalledWith(
        "goal:updated",
        expect.objectContaining({
          thread_id: "test-thread-1",
          goal: expect.objectContaining({ objective: "Emit test" }),
        }),
      );
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });

    it("emits goal:cleared event when goal is deleted", async () => {
      const { mockPi, ctx } = bootstrap();
      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "To be deleted" }, undefined, undefined, ctx);

      mockPi.events.emit.mockClear();
      ctx.ui.setWidget.mockClear();

      // Delete via command
      const goalCommand = (mockPi as any).registerCommand.mock.calls.find(
        (call: any[]) => call[0] === "goal",
      )![1];
      await goalCommand.handler("clear", ctx);

      expect(mockPi.events.emit).toHaveBeenCalledWith(
        "goal:cleared",
        expect.objectContaining({ thread_id: "test-thread-1" }),
      );
      expect(ctx.ui.setWidget).toHaveBeenCalled();
    });
  });

  describe("persist function", () => {
    it("calls appendEntry with goal-state custom type", async () => {
      const { mockPi, ctx } = bootstrap();
      mockPi.appendEntry.mockClear();

      const createTool = getTool(mockPi, "create_goal");
      await createTool.execute("tc-1", { objective: "Persist test" }, undefined, undefined, ctx);

      expect(mockPi.appendEntry).toHaveBeenCalledWith(
        "goal-state",
        expect.any(Object),
      );
    });
  });

  describe("updateWidget with no UI", () => {
    it("skips setWidget when hasUI is false", async () => {
      const { mockPi, ctx, handlers } = bootstrap();
      const noUiCtx = createMockCtx({ hasUI: false });

      // Re-run session start with no-UI context
      await handlers["session_start"]({}, noUiCtx);
      // setWidget should not be called on no-UI ctx
      expect(noUiCtx.ui.setWidget).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Order-independent replay (ADR-0028 / IC-216)
// ---------------------------------------------------------------------------
// Replay derives chronological order from each pi entry's own `timestamp`
// instead of trusting the array order returned by getBranch(). These property
// tests assert that any permutation of the branch yields the same payloads
// AND the same reconstructed store state — proving replay no longer couples
// to the SDK's undocumented branch ordering.

describe("collectGoalEntriesChronologically (order-independent replay)", () => {
  const CUSTOM_TYPE = "goal-state";
  const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

  /** Wrap goal-state payloads as pi custom entries with chronological metadata. */
  function wrapBranch(payloads: GoalStateEntry[]): any[] {
    return payloads.map((data, i) => ({
      type: "custom" as const,
      customType: CUSTOM_TYPE,
      data,
      id: `e${i}`,
      parentId: i === 0 ? null : `e${i - 1}`,
      // Timestamp reflects the entry's true chronological position (index),
      // not its position in whatever array it ends up in.
      timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
    }));
  }

  /** Reorder an array by a permutation of indices (deterministic shuffle). */
  function permute<T>(arr: readonly T[], order: number[]): T[] {
    return order.map((i) => arr[i]);
  }

  /** Produce realistic goal-state entries via the real (pure) GoalStore. */
  function captureLifecycleEntries(): GoalStateEntry[] {
    const captured: GoalStateEntry[] = [];
    const store = new GoalStore((e) => captured.push(e));
    store.createGoal("t1", "First", null, "user"); // set: objective "First"
    store.updateGoal({ objective: "Second" }, undefined, "user"); // set: objective "Second"
    store.accountGoalUsage(5, 100); // usage: tokens_used 100
    return captured;
  }

  it("returns the same payloads for chronological, reversed, and shuffled input", () => {
    const payloads = captureLifecycleEntries();
    expect(payloads).toHaveLength(3);
    const chronological = wrapBranch(payloads);

    const baseline = collectGoalEntriesChronologically(chronological, CUSTOM_TYPE);
    // Baseline is the payloads in their original chronological order.
    expect(baseline).toEqual(payloads);

    // Fully reversed array (e.g. if the SDK switched traversal direction).
    expect(collectGoalEntriesChronologically([...chronological].reverse(), CUSTOM_TYPE)).toEqual(
      payloads,
    );
    // Arbitrary permutation.
    const shuffled = permute(chronological, [2, 0, 1]);
    expect(collectGoalEntriesChronologically(shuffled, CUSTOM_TYPE)).toEqual(payloads);
  });

  it("reconstructs the same final store state regardless of branch order", () => {
    const payloads = captureLifecycleEntries();
    const chronological = wrapBranch(payloads);

    const permutations = [
      chronological, // root→leaf (SDK current)
      [...chronological].reverse(), // leaf→root
      permute(chronological, [2, 0, 1]), // arbitrary
      permute(chronological, [1, 2, 0]), // arbitrary
    ];

    for (const branch of permutations) {
      const ordered = collectGoalEntriesChronologically(branch, CUSTOM_TYPE);
      const goal = GoalStore.fromEntries(ordered, () => {}).getGoal();
      // Only correct (chronological) application yields the updated objective
      // AND the accounted usage; any misordering would clobber tokens_used or
      // revert the objective.
      expect(goal?.objective).toBe("Second");
      expect(goal?.tokens_used).toBe(100);
    }
  });

  it("handles set→clear order-independently (clear wins only when truly later)", () => {
    const captured: GoalStateEntry[] = [];
    const store = new GoalStore((e) => captured.push(e));
    store.createGoal("t1", "Doomed", null, "user"); // set
    store.deleteGoal("user"); // clear (later)
    expect(captured).toHaveLength(2);

    const chronological = wrapBranch(captured);
    const permutations = [chronological, [...chronological].reverse()];

    for (const branch of permutations) {
      const ordered = collectGoalEntriesChronologically(branch, CUSTOM_TYPE);
      // Correct order applies set then clear → no goal. Misordering (clear
      // then set) would leave a goal present.
      expect(GoalStore.fromEntries(ordered, () => {}).getGoal()).toBeNull();
    }
  });

  it("ignores entries of other custom types", () => {
    const payloads = captureLifecycleEntries();
    const goal = wrapBranch(payloads);
    const other = payloads.map((data, i) => ({
      type: "custom" as const,
      customType: "other-extension",
      data,
      id: `o${i}`,
      parentId: null,
      timestamp: new Date(BASE_TIME + i * 1000).toISOString(),
    }));

    expect(collectGoalEntriesChronologically([...goal, ...other], CUSTOM_TYPE)).toEqual(payloads);
  });
});
