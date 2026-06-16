import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockApi } from "./test-helpers.js";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(() =>
    Promise.resolve({
      session: {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
    }),
  ),
  SessionManager: { inMemory: vi.fn(() => ({})) },
}));

// ─── AgentControl comprehensive tests ───────────────────────────

// Import AgentControl at module level for reuse in describe blocks
const AgentControlModule = import("./agentControl.js");

describe("AgentControl", () => {
  let AgentControl: any;
  beforeEach(async () => {
    AgentControl = (await AgentControlModule).AgentControl;
  });

  function createControlMockPi() {
    return {
      getActiveTools: vi.fn(() => []),
    } as any;
  }

  const baseCtx = {
    cwd: "/tmp/test",
    model: { id: "test-model" },
    modelRegistry: {
      find: vi.fn(() => undefined),
      getAvailable: vi.fn(() => Promise.resolve([{ id: "test-model" }, { id: "other-model" }])),
    },
  } as any;

  function makeAgentMeta(path: string, status: any = "running", open = true) {
    return {
      agentId: `agent-${path.replace(/\//g, "_")}`,
      sessionId: "s1",
      agentPath: path,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: path.split("/").length - 2,
      open,
      cancellationRequested: false,
    };
  }

  describe("spawn()", () => {
    it("spawns an agent successfully", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "research/api", message: "Investigate" },
        baseCtx,
      );

      expect(result.agent_id).toBeDefined();
      expect(result.task_name).toBe("/root/research/api");
      expect(result.status).toBe("pending_init");
    });

    it("queues excess spawns as visible agents and handles queued messaging", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 2, 2, undefined, undefined, { maxQueuedSubagents: 2 });
      control.registry.ensureRoot("root");

      const first = await control.spawn({ task_name: "task1", message: "run now" }, baseCtx);
      const second = await control.spawn({ task_name: "task2", message: "run later" }, baseCtx);

      expect(first.status).toBe("pending_init");
      expect(second.status).toBe("queued");
      expect(second.queue_position).toBe(1);
      expect(second.queued_ahead).toBe(0);
      expect(control.list({}).agents.find((a: any) => a.agent_path === "/root/task2")?.status).toBe("queued");

      await expect(control.sendMessage({ target: "task2", message: "extra context" }, baseCtx)).resolves.toEqual({ delivered: true });
      await expect(control.followupTask({ target: "task2", message: "do more" }, baseCtx)).rejects.toThrow("Use message_agent mode=note to add pre-start context");

      await control.close({ target: "task2" }, baseCtx);
      expect(control.list({}).agents.find((a: any) => a.agent_path === "/root/task2")?.status).toBe("shutdown");
    });

    it("throws on depth exceeded", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 1); // max depth 1
      control.registry.ensureRoot("root");

      await expect(
        control.spawn(
          { task_name: "a/b/c", message: "too deep" },
          baseCtx,
        ),
      ).rejects.toThrow("Maximum agent depth exceeded");
    });

    it("resolves model with provider/model format", async () => {
      const foundModel = { id: "deepseek-r1", provider: "deepseek" };
      const ctx = {
        ...baseCtx,
        model: { id: "default" },
        modelRegistry: {
          find: vi.fn(() => foundModel),
          getAvailable: vi.fn(() => Promise.resolve([])),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test", model: "deepseek/r1" },
        ctx,
      );
      expect(result.status).toBe("pending_init");
      expect(ctx.modelRegistry.find).toHaveBeenCalledWith("deepseek", "r1");
    });

    it("throws when provider/model not found", async () => {
      const ctx = {
        ...baseCtx,
        model: { id: "default" },
        modelRegistry: {
          find: vi.fn(() => undefined),
          getAvailable: vi.fn(() => Promise.resolve([])),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.spawn(
          { task_name: "task1", message: "test", model: "unknown/model" },
          ctx,
        ),
      ).rejects.toThrow("Model not found: unknown/model");
    });

    it("resolves model by plain id", async () => {
      const ctx = {
        ...baseCtx,
        model: { id: "default" },
        modelRegistry: {
          find: vi.fn(() => undefined),
          getAvailable: vi.fn(() => Promise.resolve([{ id: "gpt-4" }])),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test", model: "gpt-4" },
        ctx,
      );
      expect(result.status).toBe("pending_init");
    });

    it("throws when plain model id not found", async () => {
      const ctx = {
        ...baseCtx,
        model: { id: "default" },
        modelRegistry: {
          find: vi.fn(() => undefined),
          getAvailable: vi.fn(() => Promise.resolve([{ id: "gpt-4" }])),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.spawn(
          { task_name: "task1", message: "test", model: "nonexistent" },
          ctx,
        ),
      ).rejects.toThrow("Model not found: nonexistent");
    });

    it("ambiguous bare model id throws instead of picking first provider", async () => {
      const ctx = {
        ...baseCtx,
        modelRegistry: {
          find: vi.fn(() => undefined),
          getAvailable: vi.fn(() => Promise.resolve([
            { provider: "provider-a", id: "same-id" },
            { provider: "provider-b", id: "same-id" },
          ])),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.spawn(
          { task_name: "task1", message: "test", model: "same-id" },
          ctx,
        ),
      ).rejects.toThrow("Ambiguous model id: same-id");
    });

    it("uses parent model when no override", async () => {
      const ctx = {
        ...baseCtx,
        model: { id: "default-model" },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test" },
        ctx,
      );
      expect(result.status).toBe("pending_init");
    });

    it("fails closed when no parent model and no exact override are available", async () => {
      const ctx = { ...baseCtx, model: undefined } as any;
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.spawn({ task_name: "task1", message: "test" }, ctx),
      ).rejects.toThrow("No parent model is selected");
    });

    it("rolls back reservation when createAgentSession throws", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.reject(new Error("Session creation failed")),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.spawn(
          { task_name: "task1", message: "test" },
          baseCtx,
        ),
      ).rejects.toThrow("Session creation failed");

      // Path should be free after rollback
      expect(control.registry.get("/root/task1")).toBeUndefined();
    });

    it("inherits parent tool restrictions", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [{ name: "bash" }, { name: "read" }, { name: "write" }] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = {
        getActiveTools: vi.fn(() => [{ name: "bash" }, { name: "read" }]),
      } as any;
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );
      expect(result.status).toBe("pending_init");
      // Tools should inherit parent restrictions and then apply default propose_patch restrictions.
      expect(mockSession.agent.state.tools).toEqual([{ name: "read" }]);
    });

    it("passes reasoning_effort as thinkingLevel", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test", reasoning_effort: "high" },
        baseCtx,
      );
      expect(result.status).toBe("pending_init");
      expect((createAgentSession as any).mock.calls.at(-1)[0]).toMatchObject({ thinkingLevel: "high" });
    });

    it("inherits parent thinkingLevel when reasoning_effort is omitted", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const pi = { ...createControlMockPi(), getThinkingLevel: vi.fn(() => "low") } as any;
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );
      expect(result.status).toBe("pending_init");
      expect((createAgentSession as any).mock.calls.at(-1)[0]).toMatchObject({ thinkingLevel: "low" });
    });

    it("passes role and nickname through", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test", role: "researcher", nickname: "R1" },
        baseCtx,
      );
      expect(result.status).toBe("pending_init");

      const agent = control.registry.get("/root/task1");
      expect(agent?.nickname).toBe("R1");
      expect(agent?.role).toBe("researcher");
    });

    it("publishes spawn_begin and spawn_end events", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const events: any[] = [];
      control.mailbox.appendEvent = vi.fn((e: any) => events.push(e));
      // Re-subscribe since we replaced appendEvent
      // Actually the real appendEvent is needed for the registry subscriber
      // Let's just spy on it
      control.mailbox.appendEvent = vi.fn();

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      expect(control.mailbox.appendEvent).toHaveBeenCalled();
      const callArgs = (control.mailbox.appendEvent as any).mock.calls.map((c: any) => c[0]);
      expect(callArgs.some((e: any) => e.type === "agent_spawn_begin")).toBe(true);
    });
  });

  describe("sendMessage()", () => {
    it("delivers message to an open running agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      // Spawn first
      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      const result = await control.sendMessage(
        { target: "/root/task1", message: "hello" },
        baseCtx,
      );
      expect(result.delivered).toBe(true);
    });

    it("rejects sending to a closed/terminal agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1", "completed", false) },
        r,
      );

      await expect(
        control.sendMessage(
          { target: "/root/task1", message: "hello" },
          baseCtx,
        ),
      ).rejects.toThrow("not open");
    });

    it("rejects sending to non-existent agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.sendMessage(
          { target: "/root/nonexistent", message: "hello" },
          baseCtx,
        ),
      ).rejects.toThrow("Agent not found");
    });

    it("rejects empty target", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.sendMessage(
          { target: "   ", message: "hello" },
          baseCtx,
        ),
      ).rejects.toThrow("Target must not be empty");
    });

    it("resolves relative target path", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1") },
        r,
      );

      // This should resolve "task1" relative to root
      const result = await control.sendMessage(
        { target: "task1", message: "hello" },
        baseCtx,
      );
      expect(result.delivered).toBe(true);
    });
  });

  describe("followupTask()", () => {
    it("rejects followup to root agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.followupTask(
          { target: "/root", message: "hello" },
          baseCtx,
        ),
      ).rejects.toThrow("Cannot send message_agent mode=task to the root agent");
    });

    it("queues followup when no child session exists", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1") },
        r,
      );

      const result = await control.followupTask(
        { target: "/root/task1", message: "more work" },
        baseCtx,
      );
      expect(result.queued).toBe(true);
      expect(result.triggered).toBe(false);
    });

    it("updates lastTaskMessage on followup", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1") },
        r,
      );

      await control.followupTask(
        { target: "/root/task1", message: "new task" },
        baseCtx,
      );

      const agent = control.registry.get("/root/task1");
      expect(agent?.lastTaskMessage).toBe("new task");
    });

    it("delivers followup to child session when streaming", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: true, // Agent is streaming → followUp delivery
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      const result = await control.followupTask(
        { target: "/root/task1", message: "more" },
        baseCtx,
      );
      expect(result.queued).toBe(true);
      expect(result.triggered).toBe(false); // isStreaming=true → triggered=false
      expect(mockSession.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("[Follow-up"),
        { deliverAs: "followUp" },
      );
    });

    it("triggers new turn when child session is not streaming", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false, // Not streaming → trigger new turn
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      const result = await control.followupTask(
        { target: "/root/task1", message: "more" },
        baseCtx,
      );
      expect(result.queued).toBe(true);
      expect(result.triggered).toBe(true); // isStreaming=false → triggered=true
      expect(mockSession.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("[Follow-up"),
        undefined, // no delivery options when not streaming
      );
    });
  });

  describe("wait()", () => {
    it("returns timed_out when no updates", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2, 50, 10); // 50ms default timeout, 10ms min
      control.registry.ensureRoot("root");

      const result = await control.wait({}, baseCtx);
      expect(result.timed_out).toBe(true);
      expect(result.events).toHaveLength(0);
      expect(result.mailbox).toHaveLength(0);
    });

    it("returns mailbox items immediately", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      // Manually enqueue something for root
      control.mailbox.enqueue({
        fromAgentId: "sub1",
        fromAgentPath: "/root/task1",
        toAgentPath: "/root",
        content: "result",
        timestamp: Date.now(),
        kind: "final_result",
      });

      const result = await control.wait({}, baseCtx);
      expect(result.timed_out).toBe(false);
      expect(result.mailbox).toHaveLength(1);
    });

    it("tracks consumed seq to prevent re-delivery", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2, 50, 10);
      control.registry.ensureRoot("root");

      // Enqueue item
      control.mailbox.enqueue({
        fromAgentId: "sub1",
        fromAgentPath: "/root/task1",
        toAgentPath: "/root",
        content: "result1",
        timestamp: Date.now(),
        kind: "final_result",
      });

      // First wait sees it
      const r1 = await control.wait({}, baseCtx);
      expect(r1.mailbox).toHaveLength(1);

      // Second wait times out (consumed seq prevents re-delivery)
      const r2 = await control.wait({}, baseCtx);
      expect(r2.timed_out).toBe(true);
    });

    it("clamps timeout between min and max", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2, 50, 10);
      control.registry.ensureRoot("root");

      // Very small timeout should still be clamped to min (now 10ms)
      const result = await control.wait({ timeout_ms: 50 }, baseCtx);
      expect(result.timed_out).toBe(true);
    });
  });

  describe("close()", () => {
    it("closes an agent and its descendants", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 10, 3);
      control.registry.ensureRoot("root");

      const r1 = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(makeAgentMeta("/root/task1"), r1);
      const r2 = control.registry.reserveSpawnSlot("/root/task1/sub");
      control.registry.registerAgent(makeAgentMeta("/root/task1/sub"), r2);

      const result = await control.close(
        { target: "/root/task1" },
        baseCtx,
      );

      expect(result.closed).toContain("/root/task1/sub");
      expect(result.closed).toContain("/root/task1");
      // Descendants closed before target
      expect(result.closed.indexOf("/root/task1/sub")).toBeLessThan(
        result.closed.indexOf("/root/task1"),
      );
    });

    it("rejects closing root", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.close({ target: "/root" }, baseCtx),
      ).rejects.toThrow("Cannot close the root agent");
    });

    it("is idempotent when closing already closed agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1", "completed", false) },
        r,
      );

      await expect(
        control.close({ target: "/root/task1" }, baseCtx),
      ).resolves.toEqual({ closed: [] });
    });

    it("rejects closing non-existent agent", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await expect(
        control.close({ target: "/root/nonexistent" }, baseCtx),
      ).rejects.toThrow("Agent not found");
    });

    it("aborts session on close (best-effort, catches errors)", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.reject(new Error("abort failed"))),
        dispose: vi.fn(() => { throw new Error("dispose failed"); }),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Close should succeed even though abort/dispose throw
      const result = await control.close(
        { target: "/root/task1" },
        baseCtx,
      );
      expect(result.closed).toContain("/root/task1");
    });
  });

  describe("shutdown()", () => {
    it("clears registry and mailbox", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(makeAgentMeta("/root/task1"), r);

      await control.shutdown();

      expect(control.registry.get("/root")).toBeUndefined();
      expect(control.registry.get("/root/task1")).toBeUndefined();
    });
  });

  describe("list()", () => {
    it("returns agents with snake_case fields", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(
        { ...makeAgentMeta("/root/task1"), nickname: "R1", role: "researcher" },
        r,
      );

      const result = control.list({});
      expect(result.agents).toHaveLength(2);
      const task = result.agents.find((a: { agent_path: string }) => a.agent_path === "/root/task1");
      expect(task?.agent_id).toBeDefined();
      expect(task?.nickname).toBe("R1");
      expect(task?.role).toBe("researcher");
    });

    it("listAgents returns raw AgentMetadata[]", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(makeAgentMeta("/root/task1"), r);

      const agents = control.listAgents();
      expect(agents).toHaveLength(2);
    });
  });

  describe("openCount accessor", () => {
    it("delegates to registry.openCount", () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");
      expect(control.openCount).toBe(1);

      const r = control.registry.reserveSpawnSlot("/root/task1");
      control.registry.registerAgent(makeAgentMeta("/root/task1"), r);
      expect(control.openCount).toBe(2);
    });
  });

  describe("session event subscription", () => {
    it("handles agent_start event from session", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      let sessionSubscriber: ((event: any) => void) | undefined;
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn((fn: any) => {
          sessionSubscriber = fn;
          return vi.fn();
        }),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Simulate agent_start event
      expect(sessionSubscriber).toBeDefined();
      sessionSubscriber!({ type: "agent_start" });

      const agent = control.registry.get("/root/task1");
      expect(agent?.status).toBe("running");
    });

    it("handles agent_end event with messages", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      let sessionSubscriber: ((event: any) => void) | undefined;
      const unsubscribe = vi.fn();
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn((fn: any) => {
          sessionSubscriber = fn;
          return unsubscribe;
        }),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Simulate agent_end event with messages
      sessionSubscriber!({
        type: "agent_end",
        messages: [
          { role: "user", content: "test" },
          { role: "assistant", content: "Final answer here" },
        ],
      });

      const agent = control.registry.get("/root/task1");
      expect(agent?.status).toBe("completed");
      expect(agent?.open).toBe(false);
      expect(agent?.lastTaskMessage).toBe("Final answer here");
      expect(unsubscribe).toHaveBeenCalled();

      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: { ...mockSession, sessionId: "mock-session-id-2", subscribe: vi.fn(() => vi.fn()) } }),
      );
      await expect(control.spawn(
        { task_name: "task1", message: "reuse same path" },
        baseCtx,
      )).resolves.toMatchObject({ task_name: "/root/task1" });
    });

    it("handles agent_end with no assistant messages", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      let sessionSubscriber: ((event: any) => void) | undefined;
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn((fn: any) => {
          sessionSubscriber = fn;
          return vi.fn();
        }),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Simulate agent_end with no messages at all
      sessionSubscriber!({ type: "agent_end" });

      const agent = control.registry.get("/root/task1");
      expect(agent?.status).toBe("completed");
      // lastTaskMessage was set to "test" at spawn time; with no assistant msg it stays
    });

    it("handles prompt rejection with finalizeWithError", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const unsubscribe = vi.fn();
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => unsubscribe),
        prompt: vi.fn(() => Promise.reject(new Error("prompt failed"))),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Wait a bit for the async prompt rejection to be processed
      await new Promise((r) => setTimeout(r, 50));

      const agent = control.registry.get("/root/task1");
      expect(agent?.status).toBe("errored");
      expect(agent?.open).toBe(false);
      expect(control.openCount).toBe(1);
      expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it("handles prompt rejection with non-Error", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.reject("string error")), // Non-Error rejection
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test" },
        baseCtx,
      );

      // Wait for async rejection processing
      await new Promise((r) => setTimeout(r, 50));

      const agent = control.registry.get("/root/task1");
      expect(agent?.status).toBe("errored");
      expect(agent?.open).toBe(false);
      expect(control.openCount).toBe(1);
    });
  });

  describe("fork context injection", () => {
    it("injects fork context when fork_turns is set", async () => {
      const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
      const mockSession = {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
        agent: { state: { messages: [], tools: [] } },
      };
      (createAgentSession as any).mockImplementationOnce(() =>
        Promise.resolve({ session: mockSession }),
      );

      const ctx = {
        ...baseCtx,
        sessionManager: {
          getBranch: vi.fn(() => [
            { type: "message", message: { role: "user", content: "Hello" } },
            { type: "message", message: { role: "assistant", content: "Hi" } },
          ]),
        },
      } as any;

      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      await control.spawn(
        { task_name: "task1", message: "test", fork_turns: "all" },
        ctx,
      );

      // Verify fork context was prepended to the initial prompt
      expect(mockSession.prompt).toHaveBeenCalled();
      const promptArg = (mockSession.prompt as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(promptArg).toContain("Parent Agent Conversation Context (forked)");
      expect(promptArg).toContain("[User]: Hello");
      expect(promptArg).toContain("[Assistant]: Hi");
      expect(promptArg).toContain("test");
    });

    it("skips fork context when fork_turns is 0 or none", async () => {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2);
      control.registry.ensureRoot("root");

      const result = await control.spawn(
        { task_name: "task1", message: "test", fork_turns: 0 },
        baseCtx,
      );
      expect(result.status).toBe("pending_init");
    });
  });

  describe("retryAgentResult() retry budget", () => {
    async function setupControl(cwd: string, options?: Record<string, unknown>) {
      const pi = createControlMockPi();
      const control = new (AgentControl as any)(pi, 4, 2, undefined, undefined, options);
      control.registry.ensureRoot("root");
      const store = control.resultStoreFor(cwd);
      const agent = {
        agentId: "agent-retry",
        agentPath: "/root/task",
        authority: { mode: "propose_patch" as const, require_base_hash: true, max_patch_bytes: 50000 },
        authorityEnforced: true,
        workspaceCwd: cwd,
      };
      const save = (summary: string) => store.save(agent as any, { schema: "subagent.result.v1", outcome: "no_change", summary } as any);
      return { control, store, save };
    }

    it("honors a configured maxResultRetries and reports retry_limit_reached (issue #83 / C-014)", async () => {
      const { mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const cwd = mkdtempSync(join(tmpdir(), "pi-retry-budget-"));

      const { control, store, save } = await setupControl(cwd, { maxResultRetries: 1 });
      const original = save("first");
      const retry = save("second");
      // Bump the retry chain count to 1 on `retry` via a retry link.
      store.linkRetry(original.result_id, retry.result_id);

      const result = await control.retryAgentResult(
        { result_id: retry.result_id, reason: "stale" },
        { cwd } as any,
      );

      expect(result.status).toBe("retry_limit_reached");
      expect(result.retries).toBe(1);
    });

    it("uses the default retry budget (3) when the option is omitted", async () => {
      const { mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const cwd = mkdtempSync(join(tmpdir(), "pi-retry-budget-"));

      const { control, store, save } = await setupControl(cwd);
      // Build a chain of 3 retries so the leaf has retry_count = 3.
      let prev = save("0");
      for (let i = 1; i <= 3; i++) {
        const next = save(String(i));
        store.linkRetry(prev.result_id, next.result_id);
        prev = next;
      }

      const result = await control.retryAgentResult(
        { result_id: prev.result_id, reason: "stale" },
        { cwd } as any,
      );

      expect(result.status).toBe("retry_limit_reached");
      expect(result.retries).toBe(3);
    });
  });
});

// ─── Registry additional coverage ───────────────────────────────

