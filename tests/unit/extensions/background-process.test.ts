/**
 * path: tests/unit/extensions/background-process.test.ts
 * role: background-process 拡張の登録と shutdown 動作を検証する
 * why: ツール名と lifecycle フックの退行を防ぐため
 * related: .pi/extensions/background-process.ts, .pi/lib/background-processes.ts, tests/unit/lib/background-processes.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  tools: [] as Array<{ name: string; execute: Function }>,
  handlers: new Map<string, Function>(),
  notifications: [] as Array<{ message: string; level: string }>,
}));

vi.mock("../../../.pi/lib/background-processes.js", () => ({
  startBackgroundProcess: vi.fn((input) => ({
    record: {
      id: "bg-1",
      label: input.label ?? "server",
      command: input.command,
      cwd: input.cwd ?? "/repo",
      pid: 1001,
      shell: "/bin/sh",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
      startedAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      ownerPid: 999,
      keepAliveOnShutdown: input.keepAliveOnShutdown ?? true,
      status: "running",
      readinessStatus: "ready",
    },
    ready: true,
  })),
  listBackgroundProcesses: vi.fn(({ includeExited }) =>
    includeExited === false
      ? [{
          id: "bg-1",
          label: "server",
          command: "npm run dev",
          cwd: "/repo",
          pid: 1001,
          shell: "/bin/sh",
          logPath: "/repo/.pi/background-processes/logs/bg-1.log",
          startedAt: "2026-03-07T00:00:00.000Z",
          updatedAt: "2026-03-07T00:00:00.000Z",
          ownerPid: 999,
          keepAliveOnShutdown: true,
          status: "running",
          readinessStatus: "ready",
        }]
      : [],
  ),
  stopBackgroundProcess: vi.fn(async () => ({
    signal: "SIGTERM",
    record: {
      id: "bg-1",
      label: "server",
      command: "npm run dev",
      cwd: "/repo",
      pid: 1001,
      shell: "/bin/sh",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
      startedAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:01.000Z",
      ownerPid: 999,
      keepAliveOnShutdown: true,
      status: "stopped",
      readinessStatus: "ready",
      stoppedAt: "2026-03-07T00:00:01.000Z",
    },
  })),
  readBackgroundProcessLog: vi.fn(() => ({
    record: {
      id: "bg-1",
      label: "server",
      command: "npm run dev",
      cwd: "/repo",
      pid: 1001,
      shell: "/bin/sh",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
      startedAt: "2026-03-07T00:00:00.000Z",
      updatedAt: "2026-03-07T00:00:00.000Z",
      ownerPid: 999,
      keepAliveOnShutdown: true,
      status: "running",
      readinessStatus: "ready",
    },
    content: "ready",
  })),
  loadBackgroundProcessConfig: vi.fn(() => ({
    enabled: true,
    maxRunningProcesses: 4,
    defaultKeepAliveOnShutdown: true,
    defaultStartupTimeoutMs: 15000,
    cleanupOnSessionShutdown: true,
  })),
  saveBackgroundProcessConfig: vi.fn((_cwd, patch) => ({
    enabled: patch.enabled ?? true,
    maxRunningProcesses: patch.maxRunningProcesses ?? 4,
    defaultKeepAliveOnShutdown: patch.defaultKeepAliveOnShutdown ?? true,
    defaultStartupTimeoutMs: patch.defaultStartupTimeoutMs ?? 15000,
    cleanupOnSessionShutdown: patch.cleanupOnSessionShutdown ?? true,
  })),
  stopAllBackgroundProcesses: vi.fn(async () => []),
  stopBackgroundProcessesForOwner: vi.fn(async () => []),
  isLongRunningCommand: vi.fn((command: string) => /npm run dev/.test(command)),
}));

function createPiMock() {
  mockApi.tools = [];
  mockApi.handlers = new Map();
  mockApi.notifications = [];

  return {
    registerTool: vi.fn((tool) => {
      mockApi.tools.push(tool);
    }),
    on: vi.fn((event, handler) => {
      mockApi.handlers.set(event, handler);
    }),
  };
}

describe("background-process extension", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers background process tools", async () => {
    const extension = (await import("../../../.pi/extensions/background-process.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    expect(mockApi.tools.map((tool) => tool.name)).toEqual([
      "background_process_start",
      "background_process_list",
      "background_process_stop",
      "background_process_log",
      "background_process_stop_all",
      "background_process_config",
    ]);
  });

  it("injects background process guidance into system prompt", async () => {
    const extension = (await import("../../../.pi/extensions/background-process.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const handler = mockApi.handlers.get("before_agent_start");
    const result = await handler?.({ systemPrompt: "base prompt" }, {});

    expect(result?.systemPrompt).toContain("BACKGROUND_PROCESS_GUIDANCE");
    expect(result?.systemPrompt).toContain("background_process_start");
    expect(result?.systemPrompt).toContain("npm run dev");
  });

  it("notifies when running background processes exist on session start", async () => {
    const extension = (await import("../../../.pi/extensions/background-process.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const handler = mockApi.handlers.get("session_start");
    await handler?.({}, {
      cwd: "/repo",
      ui: {
        notify: (message: string, level: string) => {
          mockApi.notifications.push({ message, level });
        },
      },
    });

    expect(mockApi.notifications[0]?.message).toContain("1 background process");
  });

  it("stops non-persistent owned processes on session shutdown", async () => {
    const { stopBackgroundProcessesForOwner } = await import("../../../.pi/lib/background-processes.js");
    const extension = (await import("../../../.pi/extensions/background-process.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const handler = mockApi.handlers.get("session_shutdown");
    await handler?.({}, {});

    expect(stopBackgroundProcessesForOwner).toHaveBeenCalled();
  });

  it("blocks bash tool calls for long-running commands when enabled", async () => {
    const extension = (await import("../../../.pi/extensions/background-process.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const handler = mockApi.handlers.get("tool_call");
    const result = await handler?.(
      { toolName: "bash", input: { command: "npm run dev" } },
      { cwd: "/repo" },
    );

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("background_process_start");
  });
});
