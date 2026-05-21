/**
 * Coverage tests for uncovered lines in index.ts (449-555, 600-685).
 *
 * Covers:
 * - Tool execute handlers: list_agent_results, show_agent_result,
 *   apply_agent_results, reject_agent_result, retry_agent_result, close_agent
 * - Command handlers: /agents, /wait-agent, /focus-agent, /close-agent
 * - startChildMode function (child-mode IPC lifecycle)
 *
 * NOTE: The test process may have PI_SUBAGENT_ROLE=child in its environment.
 * Parent-mode tests override process.env to ensure clean state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockApi, loadExtension, type MockApi } from "./test-helpers.js";

// ─── Mock the SDK ────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────

const baseCtx = {
  cwd: "/tmp/test",
  model: { id: "test-model" },
  modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
};

// Store original env and ensure parent-mode tests have clean PI_SUBAGENT_ROLE
const originalSubagentRole = process.env.PI_SUBAGENT_ROLE;

async function setupWithSession() {
  // Ensure parent mode
  const savedRole = process.env.PI_SUBAGENT_ROLE;
  delete process.env.PI_SUBAGENT_ROLE;
  try {
    const mock = createMockApi();
    await loadExtension(mock);
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
    return mock;
  } finally {
    if (savedRole !== undefined) process.env.PI_SUBAGENT_ROLE = savedRole;
  }
}

function getTool(mock: MockApi, name: string) {
  return mock._registeredTools.find((t) => t.name === name)!;
}

function makeCommandCtx(notifications: string[] = []) {
  return {
    cwd: "/tmp/test",
    ui: { notify: vi.fn((msg: string) => notifications.push(msg)) },
  };
}

// ─── Tool execute handlers (lines 449-510) ───────────────────────

describe("tool execute handlers — result & close tools", () => {
  it("list_agent_results returns results via tool execute", async () => {
    const mock = await setupWithSession();
    const tool = getTool(mock, "list_agent_results");
    const result = await tool.execute("id1", {}, undefined, undefined, baseCtx);
    expect(result.content[0].text).toBeDefined();
    expect(result.details).toBeDefined();
  });

  it("show_agent_result throws for nonexistent result_id", async () => {
    const mock = await setupWithSession();
    const tool = getTool(mock, "show_agent_result");
    await expect(
      tool.execute("id1", { result_id: "nonexistent" }, undefined, undefined, baseCtx),
    ).rejects.toThrow();
  });

  it("apply_agent_results calls applyAgentResults", async () => {
    const mock = await setupWithSession();
    const tool = getTool(mock, "apply_agent_results");
    const result = await tool.execute("id1", {}, undefined, undefined, baseCtx);
    expect(result.content[0].text).toBeDefined();
    expect(result.details).toBeDefined();
  });

  it("reject_agent_result throws for nonexistent result_id", async () => {
    const mock = await setupWithSession();
    const tool = getTool(mock, "reject_agent_result");
    await expect(
      tool.execute("id1", { result_id: "nonexistent" }, undefined, undefined, baseCtx),
    ).rejects.toThrow();
  });

  it("retry_agent_result throws for nonexistent result_id", async () => {
    const mock = await setupWithSession();
    const tool = getTool(mock, "retry_agent_result");
    await expect(
      tool.execute("id1", { result_id: "nonexistent" }, undefined, undefined, baseCtx),
    ).rejects.toThrow();
  });

  it("close_agent tool closes a spawned agent", async () => {
    const mock = await setupWithSession();

    const spawnTool = getTool(mock, "spawn_agent");
    await spawnTool.execute(
      "id1",
      { task_name: "task/close-test", message: "Test" },
      undefined, undefined, baseCtx,
    );

    const closeTool = getTool(mock, "close_agent");
    const result = await closeTool.execute(
      "id1",
      { target: "/root/task/close-test" },
      undefined, undefined, baseCtx,
    );
    expect(result.content[0].text).toContain("Closed");
    expect(result.details.closed).toContain("/root/task/close-test");
  });
});

// ─── Command handlers (lines 520-575) ────────────────────────────

describe("command handlers", () => {
  it("/agents lists agents", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["agents"].handler("", ctx);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0]).toContain("/root");
  });

  it("/agents filters by prefix", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    const spawnTool = getTool(mock, "spawn_agent");
    await spawnTool.execute("id1", { task_name: "alpha/task1", message: "A" }, undefined, undefined, baseCtx);
    await spawnTool.execute("id2", { task_name: "beta/task2", message: "B" }, undefined, undefined, baseCtx);

    await mock._commands["agents"].handler("/root/alpha", ctx);
    expect(notifications[0]).toContain("alpha");
  });

  it("/wait-agent calls wait and formats output", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["wait-agent"].handler("100", ctx);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("/wait-agent with short timeout", async () => {
    const mock = await setupWithSession();
    // Set a short min wait timeout so the test doesn't hang
    mock._flags = { "subagent-min-wait-timeout-ms": "10" };
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["wait-agent"].handler("50", ctx);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("/focus-agent warns when no target provided", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["focus-agent"].handler("", ctx);
    expect(notifications[0]).toContain("Usage");
  });

  it("/focus-agent calls focus with target", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    // Spawn an agent first so focus has a valid target
    const spawnTool = getTool(mock, "spawn_agent");
    await spawnTool.execute("id1", { task_name: "focus/test", message: "Test" }, undefined, undefined, baseCtx);

    await mock._commands["focus-agent"].handler("/root/focus/test", ctx);
    expect(notifications.length).toBeGreaterThan(0);
  });

  it("/close-agent warns when no target provided", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["close-agent"].handler("", ctx);
    expect(notifications[0]).toContain("Usage");
  });

  it("/close-agent closes agent by target path", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    const spawnTool = getTool(mock, "spawn_agent");
    await spawnTool.execute(
      "id1",
      { task_name: "close/cmd-test", message: "Test" },
      undefined, undefined, baseCtx,
    );

    await mock._commands["close-agent"].handler("/root/close/cmd-test", ctx);
    expect(notifications[0]).toContain("Closed");
  });

  it("/close-agent shows error for unknown target", async () => {
    const mock = await setupWithSession();
    const notifications: string[] = [];
    const ctx = makeCommandCtx(notifications);

    await mock._commands["close-agent"].handler("/root/nonexistent", ctx);
    expect(notifications.length).toBeGreaterThan(0);
    expect(notifications[0]).toContain("Error");
  });
});

// ─── startChildMode (lines 596-688) ──────────────────────────────
//
// These tests need the module to see PI_SUBAGENT_ROLE=child.
// Since loadExtension uses dynamic import (cached), we use vi.resetModules()
// within isolatedModules-style patterns. Each test is self-contained.

describe("startChildMode", () => {
  afterEach(() => {
    delete (globalThis as any).__piSubagentChildStarted;
  });

  function createChildMockApi() {
    return {
      ...createMockApi(),
      sendMessage: vi.fn(),
    };
  }

  function setupChildDeps(clientOverrides: Record<string, any> = {}) {
    const mockClientInstance = {
      connect: vi.fn(async function(this: any) {}),
      send: vi.fn(async function(this: any) {}),
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        return () => {};
      }),
      close: vi.fn(async function(this: any) {}),
      ...clientOverrides,
    };

    vi.doMock("./ipc.js", () => ({
      SubagentClient: vi.fn(function(this: any) {
        return mockClientInstance;
      }),
      SubagentHub: vi.fn(),
    }));

    return { mockClientInstance };
  }

  function setupSDKMock() {
    vi.doMock("@earendil-works/pi-coding-agent", () => ({
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
  }

  it("exits when required env vars are missing", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    delete process.env.PI_SUBAGENT_ID;
    delete process.env.PI_SUBAGENT_PATH;
    delete process.env.PI_SUBAGENT_PARENT_SOCKET;
    // Clean global guard
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps();

    try {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mock = createChildMockApi();

      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("PI_SUBAGENT_ID"),
      );
      expect(process.exitCode).toBe(1);

      consoleErrorSpy.mockRestore();
    } finally {
      process.env = savedEnv;
      process.exitCode = undefined as any;
    }
  });

  it("initializes child mode with full env vars", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-1";
    process.env.PI_SUBAGENT_PATH = "/root/task1";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket";
    process.env.PI_SUBAGENT_INITIAL_MESSAGE = "Hello";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      expect(mockClientInstance.connect).toHaveBeenCalled();
      expect(mockClientInstance.onMessage).toHaveBeenCalled();
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles session_start and sends hello", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-2";
    process.env.PI_SUBAGENT_PATH = "/root/task2";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-2";
    process.env.PI_SUBAGENT_INITIAL_MESSAGE = "Initial msg";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test", shutdown: vi.fn() });

      const calls = mockClientInstance.send.mock.calls.map((c: any) => c[0]);
      const helloCall = calls.find((c: any) => c.type === "hello");
      expect(helloCall).toBeDefined();
      expect(helloCall.agentId).toBe("child-2");
      expect(helloCall.agentPath).toBe("/root/task2");
      expect(helloCall.capabilities).toContain("hello");

      const statusCall = calls.find((c: any) => c.type === "status" && c.status === "running");
      expect(statusCall).toBeDefined();

      // Initial message sent via sendUserMessage
      expect(mock.sendUserMessage).toHaveBeenCalledWith("Initial msg");
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles shutdown message", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-3";
    process.env.PI_SUBAGENT_PATH = "/root/task3";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-3";
    delete (globalThis as any).__piSubagentChildStarted;

    let messageHandler: ((msg: any) => void) | undefined;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps({
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        messageHandler = handler;
        return () => { messageHandler = undefined; };
      }),
    });

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test", shutdown: vi.fn() });

      messageHandler!({ type: "shutdown", id: "msg-1" });
      await new Promise((r) => setTimeout(r, 50));

      const calls = mockClientInstance.send.mock.calls.map((c: any) => c[0]);
      const shutdownStatus = calls.find((c: any) => c.type === "status" && c.status === "shutdown");
      expect(shutdownStatus).toBeDefined();
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles followup message when idle", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-4";
    process.env.PI_SUBAGENT_PATH = "/root/task4";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-4";
    delete (globalThis as any).__piSubagentChildStarted;

    let messageHandler: ((msg: any) => void) | undefined;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps({
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        messageHandler = handler;
        return () => { messageHandler = undefined; };
      }),
    });

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, {
        cwd: "/tmp/test",
        isIdle: vi.fn(() => true),
      });

      messageHandler!({ type: "followup", id: "msg-2", message: "Do more work" });
      await new Promise((r) => setTimeout(r, 50));

      expect(mock.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("Follow-up from parent"),
        undefined,
      );
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles followup when not idle", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-5";
    process.env.PI_SUBAGENT_PATH = "/root/task5";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-5";
    delete (globalThis as any).__piSubagentChildStarted;

    let messageHandler: ((msg: any) => void) | undefined;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps({
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        messageHandler = handler;
        return () => { messageHandler = undefined; };
      }),
    });

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, {
        cwd: "/tmp/test",
        isIdle: vi.fn(() => false),
      });

      messageHandler!({ type: "followup", id: "msg-3", message: "Extra work" });
      await new Promise((r) => setTimeout(r, 50));

      expect(mock.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining("Follow-up from parent"),
        { deliverAs: "followUp" },
      );
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles message from another agent", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-6";
    process.env.PI_SUBAGENT_PATH = "/root/task6";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-6";
    delete (globalThis as any).__piSubagentChildStarted;

    let messageHandler: ((msg: any) => void) | undefined;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps({
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        messageHandler = handler;
        return () => { messageHandler = undefined; };
      }),
    });

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

      messageHandler!({
        type: "message",
        id: "msg-4",
        fromAgentPath: "/root/review",
        message: "Here is my review",
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mock.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          customType: "subagent_message",
          content: expect.stringContaining("Message from /root/review"),
          display: true,
        }),
        expect.objectContaining({ deliverAs: "nextTurn" }),
      );
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles interrupt message", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-7";
    process.env.PI_SUBAGENT_PATH = "/root/task7";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-7";
    delete (globalThis as any).__piSubagentChildStarted;

    let messageHandler: ((msg: any) => void) | undefined;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps({
      onMessage: vi.fn(function(this: any, handler: (msg: any) => void) {
        messageHandler = handler;
        return () => { messageHandler = undefined; };
      }),
    });

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      const abortFn = vi.fn();
      await mock._hooks["session_start"]({}, {
        cwd: "/tmp/test",
        abort: abortFn,
      });

      messageHandler!({ type: "interrupt", id: "msg-5" });
      await new Promise((r) => setTimeout(r, 50));

      expect(abortFn).toHaveBeenCalled();
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles agent_end with assistant messages", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-8";
    process.env.PI_SUBAGENT_PATH = "/root/task8";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-8";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

      await mock._hooks["agent_end"]({
        messages: [
          { role: "user", content: "Do work" },
          { role: "assistant", content: [{ type: "text", text: "Done!" }] },
        ],
      });

      const calls = mockClientInstance.send.mock.calls.map((c: any) => c[0]);
      const completedStatus = calls.find((c: any) => c.type === "status" && c.status === "completed");
      expect(completedStatus).toBeDefined();
      const finalMsg = calls.find((c: any) => c.type === "final");
      expect(finalMsg).toBeDefined();
      expect(finalMsg.message).toContain("Done!");
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles agent_end without assistant messages", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-8b";
    process.env.PI_SUBAGENT_PATH = "/root/task8b";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-8b";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
      await mock._hooks["agent_end"]({});

      const calls = mockClientInstance.send.mock.calls.map((c: any) => c[0]);
      const finalMsg = calls.find((c: any) => c.type === "final");
      expect(finalMsg).toBeDefined();
      expect(finalMsg.message).toBe("(agent completed)");
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles agent_start", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-9";
    process.env.PI_SUBAGENT_PATH = "/root/task9";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-9";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
      mockClientInstance.send.mockClear();

      await mock._hooks["agent_start"]({});

      expect(mockClientInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "status", status: "running" }),
      );
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles session_shutdown", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-10";
    process.env.PI_SUBAGENT_PATH = "/root/task10";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-10";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    const { mockClientInstance } = setupChildDeps();

    try {
      const mock = createChildMockApi();
      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });
      mockClientInstance.send.mockClear();

      await mock._hooks["session_shutdown"]({});

      expect(mockClientInstance.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "status", status: "shutdown" }),
      );
      expect(mockClientInstance.close).toHaveBeenCalled();
    } finally {
      process.env = savedEnv;
    }
  });

  it("child mode handles IPC connect error", async () => {
    const savedEnv = { ...process.env };
    process.env.PI_SUBAGENT_ROLE = "child";
    process.env.PI_SUBAGENT_ID = "child-err";
    process.env.PI_SUBAGENT_PATH = "/root/task-err";
    process.env.PI_SUBAGENT_PARENT_SOCKET = "/tmp/test-socket-err";
    delete (globalThis as any).__piSubagentChildStarted;

    vi.resetModules();
    setupSDKMock();
    setupChildDeps({
      connect: vi.fn(async function(this: any) { throw new Error("Connection refused"); }),
    });

    try {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mock = createChildMockApi();

      const { default: subagentExtension } = await import("./index.js");
      await subagentExtension(mock as any);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("IPC error"),
      );
      expect(process.exitCode).toBe(1);

      consoleErrorSpy.mockRestore();
    } finally {
      process.env = savedEnv;
      process.exitCode = undefined as any;
    }
  });
});
