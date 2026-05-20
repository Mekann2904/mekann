import { describe, it, expect, vi, beforeEach } from "vitest";
import goalExtension from "./index.js";
import { clearPromptProvidersForTests, collectPromptFragments } from "../prompt-core/index.js";

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

    it("replays custom entries from branch in reverse chronological order", async () => {
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

      // Capture persisted entries
      const persistedEntries = mockPi.appendEntry.mock.calls.map(
        (call: any[]) => call[1],
      );
      expect(persistedEntries.length).toBeGreaterThan(0);

      // Simulate new session with those entries (leaf→root order as getBranch returns)
      const newPi = createMockPi();
      goalExtension(newPi as any);
      const newHandlers = (newPi as any)._handlers;

      const branch = persistedEntries.map((entry: any) => ({
        type: "custom",
        customType: "goal-state",
        data: entry,
      }));

      const newCtx = createMockCtx({
        sessionManager: {
          getSessionId: vi.fn(() => "test-thread-1"),
          isPersisted: vi.fn(() => true),
          getBranch: vi.fn(() => branch.reverse()), // reversed to simulate leaf→root
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
      expect(fragments[1].content).toContain("My active goal");
      expect(fragments[1].content).not.toContain("Tokens used");
      expect(fragments[2].content).toContain("Tokens used");
    });
  });

  describe("plan mode integration", () => {
    it("sets runtime.inPlanMode when plan-mode event fires", async () => {
      const { mockPi, ctx } = bootstrap();

      // Find the plan-mode event handler
      const planModeHandler = mockPi.events.on.mock.calls.find(
        (call: any[]) => call[0] === "mekann:plan-mode:status",
      );
      expect(planModeHandler).toBeDefined();

      // Fire plan mode event
      const handler = planModeHandler![1] as Function;
      handler({ mode: "plan" });

      // Fire main mode event
      handler({ mode: "main" });

      // No assertion on internal state, just verify handler doesn't throw
    });

    it("handles missing plan-mode event gracefully", async () => {
      // Create extension with events.on that throws
      const mockPi = createMockPi({
        events: {
          emit: vi.fn(),
          on: vi.fn(() => {
            throw new Error("plan-mode not loaded");
          }),
        },
      });
      // Should not throw during initialization
      expect(() => goalExtension(mockPi as any)).not.toThrow();
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
