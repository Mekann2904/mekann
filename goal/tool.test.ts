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
    ui: { notify: vi.fn(), confirm: vi.fn(), editor: vi.fn(), setWidget: vi.fn() },
    ...overrides,
  } as any;
}

function getTool(mockPi: ReturnType<typeof createMockPi>, name: string) {
  return mockPi.tools.find((t) => t.name === name)!;
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

  return { mockPi, ctx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("goal tools", () => {
  let mockPi: ReturnType<typeof createMockPi>;
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ({ mockPi, ctx } = bootstrap());
  });

  // 1. get_goal returns current goal and remaining tokens
  it("get_goal returns current goal and remaining tokens", async () => {
    // Create a goal first
    const createTool = getTool(mockPi, "create_goal");
    await createTool.execute(
      "tc-1",
      { objective: "Build the feature", token_budget: 5000 },
      undefined,
      undefined,
      ctx,
    );

    const goalTool = getTool(mockPi, "get_goal");
    const result = await goalTool.execute("tc-2", {}, undefined, undefined, ctx);

    expect(result.content[0].type).toBe("text");
    const text: string = result.content[0].text;
    expect(text).toContain("Build the feature");
    expect(text).toContain("Status: active");
    expect(text).toContain("Token budget: 5000");
    expect(text).toContain("Remaining tokens: 5000");
    expect(text).toContain("Tokens used: 0");
    expect(result.details.remaining_tokens).toBe(5000);
  });

  // 2. create_goal succeeds when no goal exists
  it("create_goal succeeds when no goal exists", async () => {
    const createTool = getTool(mockPi, "create_goal");
    const result = await createTool.execute(
      "tc-1",
      { objective: "Refactor the module" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toBe("Goal created: Refactor the module");
    expect(result.details.goal).toBeDefined();
    expect(result.details.goal.objective).toBe("Refactor the module");
    expect(result.details.goal.status).toBe("active");
    expect(result.details.goal.token_budget).toBeNull();
  });

  // 3. create_goal returns model-readable error when goal already exists
  it("create_goal returns model-readable error when goal already exists", async () => {
    const createTool = getTool(mockPi, "create_goal");

    // Create the first goal
    await createTool.execute(
      "tc-1",
      { objective: "First goal" },
      undefined,
      undefined,
      ctx,
    );

    // Try to create a second goal — should fail
    const result = await createTool.execute(
      "tc-2",
      { objective: "Second goal" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("[ERROR]");
    expect(result.content[0].text).toContain("Goal already exists");
    expect(result.details.error).toBeDefined();
  });

  // 4. update_goal only accepts complete (status must be "complete")
  it("update_goal only accepts status='complete'", async () => {
    const createTool = getTool(mockPi, "create_goal");
    await createTool.execute(
      "tc-1",
      { objective: "Complete this task" },
      undefined,
      undefined,
      ctx,
    );

    const updateTool = getTool(mockPi, "update_goal");
    const result = await updateTool.execute(
      "tc-2",
      { status: "complete" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("Goal marked as complete");
    expect(result.details.goal.status).toBe("complete");
  });

  // 5. update_goal reports final budget usage when complete
  it("update_goal reports final budget usage when complete", async () => {
    const createTool = getTool(mockPi, "create_goal");
    await createTool.execute(
      "tc-1",
      { objective: "Budget-tracked task", token_budget: 10000 },
      undefined,
      undefined,
      ctx,
    );

    const updateTool = getTool(mockPi, "update_goal");
    const result = await updateTool.execute(
      "tc-2",
      { status: "complete" },
      undefined,
      undefined,
      ctx,
    );

    const text: string = result.content[0].text;
    expect(text).toContain("Final usage:");
    expect(text).toContain("tokens");
    expect(text).toContain("s");
    expect(result.details.final_usage).toBeDefined();
    expect(result.details.final_usage).toHaveProperty("tokens");
    expect(result.details.final_usage).toHaveProperty("time");
  });

  // 6. update_goal rejects when goal is already complete
  it("update_goal rejects when goal is already complete", async () => {
    const createTool = getTool(mockPi, "create_goal");
    await createTool.execute(
      "tc-1",
      { objective: "Done task" },
      undefined,
      undefined,
      ctx,
    );

    const updateTool = getTool(mockPi, "update_goal");

    // Mark as complete
    await updateTool.execute(
      "tc-2",
      { status: "complete" },
      undefined,
      undefined,
      ctx,
    );

    // Try to update again
    const result = await updateTool.execute(
      "tc-3",
      { status: "complete" },
      undefined,
      undefined,
      ctx,
    );

    expect(result.content[0].text).toContain("[ERROR]");
    expect(result.content[0].text).toContain("already complete");
  });

  // 7. update_goal complete synchronizes runtime active state
  it("update_goal complete synchronizes runtime active state", async () => {
    const createTool = getTool(mockPi, "create_goal");
    await createTool.execute(
      "tc-1",
      { objective: "Complete this task" },
      undefined,
      undefined,
      ctx,
    );

    const updateTool = getTool(mockPi, "update_goal");
    await updateTool.execute(
      "tc-2",
      { status: "complete" },
      undefined,
      undefined,
      ctx,
    );

    // After complete, runtime should not send continuation on maybeContinueIfIdle
    // This verifies that onExternalSet was called and active_goal_id was cleared
    mockPi.sendUserMessage.mockClear();

    // Simulate the agent_end -> maybeContinueIfIdle flow
    const agentEndHandler = mockPi.on.mock.calls.find(
      (call: any[]) => call[0] === "agent_end",
    )![1] as Function;
    await agentEndHandler(
      { messages: [{ role: "assistant", stopReason: "end_turn" }] },
      ctx,
    );

    // No continuation should be sent for a completed goal
    expect(mockPi.sendUserMessage).not.toHaveBeenCalled();
  });
});
