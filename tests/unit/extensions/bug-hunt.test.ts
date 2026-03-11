// Path: tests/unit/extensions/bug-hunt.test.ts
// What: bug-hunt extension の start / status / stop 契約を検証する
// Why: 永続ループ制御の退行を防ぐため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/storage.ts, .pi/lib/background-processes.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  state: {
    version: 1,
    runId: null,
    status: "idle",
    backgroundProcessId: null,
    startedAt: null,
    stoppedAt: null,
    lastHeartbeatAt: null,
    lastIterationAt: null,
    lastSummary: null,
    lastError: null,
    stopRequested: false,
    iterationCount: 0,
    reportedCount: 0,
    intervalMs: 30000,
    timeoutMs: 180000,
    taskPrompt: "default task",
    model: null,
    reportedFingerprints: [],
  },
  processes: [] as Array<{
    id: string;
    status: string;
    logPath: string;
  }>,
}));

vi.mock("../../../.pi/extensions/bug-hunt/storage.js", () => ({
  createBugHuntRunId: vi.fn(() => "bug-hunt-run-1"),
  createDefaultBugHuntState: vi.fn(() => ({
    version: 1,
    runId: null,
    status: "idle",
    backgroundProcessId: null,
    startedAt: null,
    stoppedAt: null,
    lastHeartbeatAt: null,
    lastIterationAt: null,
    lastSummary: null,
    lastError: null,
    stopRequested: false,
    iterationCount: 0,
    reportedCount: 0,
    intervalMs: 30000,
    timeoutMs: 180000,
    taskPrompt: "default task",
    model: null,
    reportedFingerprints: [],
  })),
  loadBugHuntState: vi.fn(() => ({ ...mockState.state })),
  saveBugHuntState: vi.fn((state) => {
    mockState.state = { ...state };
    return mockState.state;
  }),
}));

vi.mock("../../../.pi/lib/background-processes.js", () => ({
  saveBackgroundProcessConfig: vi.fn(),
  listBackgroundProcesses: vi.fn(() => mockState.processes),
  startBackgroundProcess: vi.fn(async () => {
    mockState.processes = [{
      id: "bg-1",
      status: "running",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
    }];
    return {
      ready: true,
      record: {
        id: "bg-1",
        status: "running",
        logPath: "/repo/.pi/background-processes/logs/bg-1.log",
      },
    };
  }),
  stopBackgroundProcess: vi.fn(async () => {
    mockState.processes = [{
      id: "bg-1",
      status: "stopped",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
    }];
    return {
      signal: "SIGTERM",
      record: mockState.processes[0],
    };
  }),
}));

function createPiMock() {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();

  return {
    tools,
    commands,
    handlers,
    registerTool: vi.fn((tool) => {
      tools.set(tool.name, tool);
    }),
    registerCommand: vi.fn((name, command) => {
      commands.set(name, command);
    }),
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
  };
}

describe("bug-hunt extension", () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.state = {
      version: 1,
      runId: null,
      status: "idle",
      backgroundProcessId: null,
      startedAt: null,
      stoppedAt: null,
      lastHeartbeatAt: null,
      lastIterationAt: null,
      lastSummary: null,
      lastError: null,
      stopRequested: false,
      iterationCount: 0,
      reportedCount: 0,
      intervalMs: 30000,
      timeoutMs: 180000,
      taskPrompt: "default task",
      model: null,
      reportedFingerprints: [],
    };
    mockState.processes = [];
  });

  it("start/status/stop tools を登録する", async () => {
    const { default: extension, resetForTesting } = await import("../../../.pi/extensions/bug-hunt/index.js");
    resetForTesting();
    const pi = createPiMock();

    extension(pi as never);

    expect(Array.from(pi.tools.keys())).toEqual([
      "bug_hunt_start",
      "bug_hunt_status",
      "bug_hunt_stop",
    ]);
    expect(pi.commands.has("bug-hunt")).toBe(true);
  });

  it("bug_hunt_start が state を running にして background runner を起動する", async () => {
    const { default: extension, resetForTesting } = await import("../../../.pi/extensions/bug-hunt/index.js");
    resetForTesting();
    const pi = createPiMock();

    extension(pi as never);

    const tool = pi.tools.get("bug_hunt_start");
    const result = await tool.execute("call-1", {
      task: "Find task bugs",
    }, undefined, undefined, {
      cwd: "/repo",
      model: {
        provider: "openai",
        id: "gpt-5",
      },
    });

    expect(result.content[0].text).toContain("bug-hunt started");
    expect(mockState.state.status).toBe("running");
    expect(mockState.state.runId).toBe("bug-hunt-run-1");
    expect(mockState.state.backgroundProcessId).toBe("bg-1");
  });

  it("既に動作中なら bug_hunt_start は再起動しない", async () => {
    mockState.state = {
      ...mockState.state,
      runId: "bug-hunt-run-1",
      status: "running",
      backgroundProcessId: "bg-1",
      model: {
        provider: "openai",
        id: "gpt-5",
      },
    };
    mockState.processes = [{
      id: "bg-1",
      status: "running",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
    }];

    const { default: extension, resetForTesting } = await import("../../../.pi/extensions/bug-hunt/index.js");
    resetForTesting();
    const pi = createPiMock();

    extension(pi as never);

    const tool = pi.tools.get("bug_hunt_start");
    const result = await tool.execute("call-1", {}, undefined, undefined, {
      cwd: "/repo",
      model: {
        provider: "openai",
        id: "gpt-5",
      },
    });

    expect(result.content[0].text).toContain("already running");
  });

  it("bug_hunt_stop が stopRequested を立てる", async () => {
    mockState.state = {
      ...mockState.state,
      runId: "bug-hunt-run-1",
      status: "running",
      backgroundProcessId: "bg-1",
      model: {
        provider: "openai",
        id: "gpt-5",
      },
    };
    mockState.processes = [{
      id: "bg-1",
      status: "running",
      logPath: "/repo/.pi/background-processes/logs/bg-1.log",
    }];

    const { default: extension, resetForTesting } = await import("../../../.pi/extensions/bug-hunt/index.js");
    resetForTesting();
    const pi = createPiMock();

    extension(pi as never);

    const tool = pi.tools.get("bug_hunt_stop");
    const result = await tool.execute("call-1", {}, undefined, undefined, {
      cwd: "/repo",
    });

    expect(result.content[0].text).toContain("status: stopped");
    expect(mockState.state.stopRequested).toBe(true);
    expect(mockState.state.status).toBe("stopped");
  });
});
