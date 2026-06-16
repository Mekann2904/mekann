/**
 * index.entry.test.ts — 拡張機能エントリポイント (ツール/コマンド登録) と followupTask のテスト
 *
 * subagent/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./test-helpers.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";
import { createMockApi, loadExtension } from "./test-helpers.js";

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
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

describe("extension entry point", () => {
  it("registers 7 tools", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(mock._registeredTools).toHaveLength(7);
    const names = mock._registeredTools.map((t) => t.name);
    expect(names).toContain("delegate_agent");
    expect(names).toContain("spawn_agent");
    expect(names).toContain("message_agent");
    expect(names).toContain("wait_agent");
    expect(names).toContain("list_agents");
    expect(names).toContain("close_agent");
    expect(names).toContain("agent_results");
  });

  it("keeps only delegate_agent active for subagent surface at session start", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
    expect(mock._activeTools).toContain("delegate_agent");
    expect(mock._activeTools).not.toContain("spawn_agent");
    expect(mock._activeTools).not.toContain("message_agent");
    expect(mock._activeTools).not.toContain("wait_agent");
    expect(mock._activeTools).not.toContain("list_agents");
    expect(mock._activeTools).not.toContain("close_agent");
    expect(mock._activeTools).not.toContain("agent_results");
  });

  it("activates subagent management tools after spawn", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    await spawnTool.execute("id1", { task_name: "task1", message: "test" }, undefined, undefined, { cwd: "/tmp/test", model: { id: "test-model" } });
    expect(mock._activeTools).toEqual(expect.arrayContaining(["message_agent", "wait_agent", "list_agents", "close_agent"]));
    expect(mock._activeTools).not.toContain("agent_results");
  });

  it("registers commands", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(Object.keys(mock._commands)).toContain("agents");
    expect(Object.keys(mock._commands)).toContain("wait-agent");
    expect(Object.keys(mock._commands)).toContain("close-agent");
    expect(Object.keys(mock._commands)).toContain("focus-agent");
  });

  it("registers flags", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    const flagNames = mock._registeredFlags.map((f) => f.name);
    expect(flagNames).toContain("subagent-max-agents");
    expect(flagNames).toContain("subagent-max-depth");
    expect(flagNames).toContain("subagent-default-wait-timeout-ms");
    expect(flagNames).toContain("subagent-min-wait-timeout-ms");
    expect(flagNames).toContain("subagent-display");
    expect(flagNames).toContain("subagent-pi-command");
    expect(flagNames).toContain("subagent-extension-path");
    const displayFlag = mock._registeredFlags.find((f) => f.name === "subagent-display")!;
    const unsafeFlag = mock._registeredFlags.find((f) => f.name === "subagent-allow-unsafe-external-pi")!;
    expect((displayFlag.config as any).default).toBe("external-split");
    expect((unsafeFlag.config as any).default).toBe("true");
    // The --subagent-max-agents description must report the enforced hard cap
    // (4), not the default (1). Issue #83 / C-010.
    const maxAgentsFlag = mock._registeredFlags.find((f) => f.name === "subagent-max-agents")!;
    const maxAgentsDesc = (maxAgentsFlag.config as any).description as string;
    expect(maxAgentsDesc).toContain("Hard-capped at 4");
    expect(maxAgentsDesc).not.toContain("Hard-capped at 1");
    expect(flagNames).toContain("subagent-allow-nested");
    expect(flagNames).toContain("subagent-default-reasoning-effort");
  });

  it("registers session_start and session_shutdown hooks", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(mock._hooks["session_start"]).toBeDefined();
    expect(mock._hooks["session_shutdown"]).toBeDefined();
  });

  it("spawn_agent promptGuidelines require English task briefs and parent-facing output", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    const guidelines: string[] = spawnTool.promptGuidelines;
    const joined = guidelines.join("\n");
    // English instruction requirement
    expect(joined).toContain("in English");
    // Parent-facing output requirement
    expect(joined).toContain("parent agent, not for humans");
    expect(joined).toContain("compact structured results");
  });

  it("message_agent promptGuidelines require English", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    const messageTool = mock._registeredTools.find((t: any) => t.name === "message_agent")!;
    const joined = (messageTool.promptGuidelines as string[]).join("\n");
    expect(joined).toContain("English");
  });

  it("list_agents tool returns empty when no agents spawned", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start to initialize control
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const listTool = mock._registeredTools.find(
      (t) => t.name === "list_agents",
    )!;
    const result = await listTool.execute("id1", {}, undefined, undefined, {
      cwd: "/tmp/test",
      model: undefined,
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
    });
    // Root agent is always present after session_start
    expect(result.content[0].text).toContain("/root");
    expect(result.content[0].text).toContain("running");
  });

  it("spawn_agent tool calls createAgentSession", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find(
      (t) => t.name === "spawn_agent",
    )!;
    const result = await spawnTool.execute(
      "id1",
      { task_name: "research/api", message: "Investigate API" },
      undefined,
      undefined,
      {
        cwd: "/tmp/test",
        model: { id: "test-model" },
        modelRegistry: {
          find: () => undefined,
          getAvailable: () => Promise.resolve([]),
        },
      },
    );

    expect(result.details.agent_id).toBeDefined();
    expect(result.details.task_name).toBe("/root/research/api");
    expect(result.details.status).toBe("pending_init");

    const { createAgentSession } = await import(
      "@earendil-works/pi-coding-agent"
    );
    expect(createAgentSession).toHaveBeenCalled();
  });

  it("/agents command shows agents", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    // Spawn an agent first
    const spawnTool = mock._registeredTools.find(
      (t) => t.name === "spawn_agent",
    )!;
    await spawnTool.execute(
      "id1",
      { task_name: "test/task1", message: "Test" },
      undefined,
      undefined,
      {
        cwd: "/tmp/test",
        model: { id: "test-model" },
        modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      },
    );

    // Run /agents command
    const notifications: string[] = [];
    const ctx = {
      cwd: "/tmp/test",
      ui: {
        notify: vi.fn((msg: string) => notifications.push(msg)),
      },
    };
    await mock._commands["agents"].handler("", ctx);
    expect(notifications[0]).toContain("/root");
  });
});

describe("followupTask terminal status rejection", () => {
  const baseCtx = {
    cwd: "/tmp/test",
    model: { id: "test-model" },
    modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
  };

  async function spawnAndGetControl(mockApi: ReturnType<typeof createMockApi>) {
    await loadExtension(mockApi);
    await mockApi._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mockApi._registeredTools.find((t) => t.name === "spawn_agent")!;
    await spawnTool.execute(
      "id1",
      { task_name: "research/api", message: "Investigate" },
      undefined, undefined, baseCtx,
    );

    // Access the AgentControl via the message_agent tool's closure
    const followupTool = mockApi._registeredTools.find((t) => t.name === "message_agent")!;
    return { mockApi, followupTool };
  }

  it("rejects followup to a completed agent", async () => {
    const { mockApi, followupTool } = await spawnAndGetControl(createMockApi());

    // Access control via session_start hook to set status directly
    // We use the close method to shut down, then manually set status to completed
    const listTool = mockApi._registeredTools.find((t) => t.name === "list_agents")!;
    const listResult = await listTool.execute("id1", {}, undefined, undefined, baseCtx);
    expect(listResult.details.agents.length).toBeGreaterThan(1);

    // Use AgentControl directly: get it from the module's internal state
    // Instead, test via the registry by using the close + manual status approach
    // Actually, let's test via the tool interface by simulating completion
    // We need direct access to AgentControl. Let's get it from index.ts exports.
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-completed",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: false,
      cancellationRequested: false,
    }, r);

    await expect(
      control.followupTask({ target: "/root/task1", message: "more work" }, baseCtx as any),
    ).rejects.toThrow("Cannot follow up a terminal agent");
  });

  it("rejects followup to an errored agent", async () => {
    const mockApi = createMockApi();
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-errored",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "errored",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: false,
      cancellationRequested: false,
    }, r);

    await expect(
      control.followupTask({ target: "/root/task1", message: "retry" }, baseCtx as any),
    ).rejects.toThrow("Cannot follow up a terminal agent");
  });

  it("rejects followup to a shutdown agent", async () => {
    const mockApi = createMockApi();
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-shutdown",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "shutdown",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: false,
      cancellationRequested: false,
    }, r);

    await expect(
      control.followupTask({ target: "/root/task1", message: "more work" }, baseCtx as any),
    ).rejects.toThrow("Cannot follow up a terminal agent");
  });

  it("rejects followup to an interrupted agent", async () => {
    const mockApi = createMockApi();
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-interrupted",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "interrupted",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: false,
      cancellationRequested: false,
    }, r);

    await expect(
      control.followupTask({ target: "/root/task1", message: "more work" }, baseCtx as any),
    ).rejects.toThrow("Cannot follow up a terminal agent");
  });

  it("allows followup to a running agent", async () => {
    const mockApi = createMockApi();
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-running",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    // Should NOT throw — agent is running and open
    const result = await control.followupTask(
      { target: "/root/task1", message: "more work" }, baseCtx as any,
    );
    expect(result.queued).toBe(true);
  });

  it("allows followup to a pending_init agent", async () => {
    const mockApi = createMockApi();
    const { AgentControl } = await import("./agentControl.js");
    const control = new AgentControl(mockApi as any, 4, 2);
    control.registry.ensureRoot("root");
    const r = control.registry.reserveSpawnSlot("/root/task1");
    control.registry.registerAgent({
      agentId: "test-pending",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "pending_init",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    // Should NOT throw — agent is pending_init and open
    const result = await control.followupTask(
      { target: "/root/task1", message: "more work" }, baseCtx as any,
    );
    expect(result.queued).toBe(true);
  });
});
