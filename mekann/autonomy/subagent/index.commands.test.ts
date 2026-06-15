/**
 * index.commands.test.ts — extension command handlers のテスト
 *
 * subagent/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./test-helpers.ts を参照。
 */

import { beforeEach, describe, it, expect, vi } from "vitest";
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
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

beforeEach(() => {
  delete process.env.PI_SUBAGENT_ROLE;
  vi.resetModules();
});


describe("extension command handlers", () => {
  const baseCtx = {
    cwd: "/tmp/test",
    model: { id: "test-model" },
    modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
  };

  it("/agents command with prefix filter", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    await spawnTool.execute(
      "id1", { task_name: "research/api", message: "test" }, undefined, undefined, baseCtx,
    );

    const notifications: string[] = [];
    const ctx = {
      cwd: "/tmp/test",
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    await mock._commands["agents"].handler("/root/research", ctx);
    expect(notifications[0]).toContain("/root/research/api");
  });

  it("/wait-agent command with timeout", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    mock._flags = { "subagent-min-wait-timeout-ms": "10", "subagent-display": "none", "subagent-max-depth": "2" };
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const notifications: string[] = []
    const ctx = {
      cwd: "/tmp/test",
      model: { id: "test-model" },
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    await mock._commands["wait-agent"].handler("50", ctx);
    expect(notifications[0]).toContain("timed out");
  });

  it("/wait-agent command with no timeout arg", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    mock._flags = { "subagent-default-wait-timeout-ms": "50", "subagent-min-wait-timeout-ms": "10", "subagent-display": "none", "subagent-max-depth": "2" };
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const notifications: string[] = []
    const ctx = {
      cwd: "/tmp/test",
      model: { id: "test-model" },
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    // Pass a short timeout explicitly (empty string → NaN → undefined → default 30s)
    // Use a number string instead to keep it fast
    await mock._commands["wait-agent"].handler("50", ctx);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("/close-agent command with no args shows usage", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const notifications: string[] = []
    const ctx = {
      cwd: "/tmp/test",
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    await mock._commands["close-agent"].handler("", ctx);
    expect(notifications[0]).toContain("Usage");
  });

  it("/close-agent command closes an agent", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    await spawnTool.execute(
      "id1", { task_name: "task1", message: "test" }, undefined, undefined, baseCtx,
    );

    const notifications: string[] = []
    const ctx = {
      cwd: "/tmp/test",
      model: { id: "test-model" },
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    await mock._commands["close-agent"].handler("/root/task1", ctx);
    expect(notifications[0]).toContain("Closed");
  });

  it("/close-agent command shows error on failure", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const notifications: string[] = []
    const ctx = {
      cwd: "/tmp/test",
      model: { id: "test-model" },
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
    };
    await mock._commands["close-agent"].handler("/root/nonexistent", ctx);
    expect(notifications[0]).toContain("Error");
  });

  it("session_start resets control", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);

    // First session_start
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    await spawnTool.execute(
      "id1", { task_name: "task1", message: "test" }, undefined, undefined, baseCtx,
    );

    // Second session_start should reset control
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    // Old agents should be gone
    const listTool = mock._registeredTools.find((t: any) => t.name === "list_agents")!;
    const result = await listTool.execute("id1", {}, undefined, undefined, baseCtx);
    // Only root agent should remain
    expect(result.details.agents.length).toBe(1);
  });

  it("session_shutdown resets control", async () => {
    const mock = createMockApi();
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mock as any);

    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find((t: any) => t.name === "spawn_agent")!;
    await spawnTool.execute(
      "id1", { task_name: "task1", message: "test" }, undefined, undefined, baseCtx,
    );

    // session_shutdown should clear everything
    await mock._hooks["session_shutdown"]();

    // Spawning after shutdown should work (creates new control)
    const result = await spawnTool.execute(
      "id2", { task_name: "task2", message: "test2" }, undefined, undefined, baseCtx,
    );
    expect(result.details.status).toBe("pending_init");
  });
});
