import { describe, it, expect, vi, beforeEach } from "vitest";
import goalExtension from "./index.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockPi() {
  const tools: Array<{ name: string; execute: Function }> = [];
  return {
    tools,
    sendMessage: vi.fn(),
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
      "success",
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

    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal resumed", "success");
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
      "success",
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
      "success",
    );
  });

  // 9. --budget prefix parsing
  it("parses --budget prefix in objective", async () => {
    await goalCommand.handler("--budget 5000 Build the feature", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Build the feature"),
      "success",
    );
  });

  // 10. --budget suffix parsing
  it("parses --budget suffix in objective", async () => {
    await goalCommand.handler("Build the feature --budget 5000", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Build the feature"),
      "success",
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
    // 0 matches \d+ but validateTokenBudget rejects it
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("positive integer"),
      "error",
    );
  });
});
