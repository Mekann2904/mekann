/**
 * path: tests/unit/extensions/workspace-verification.test.ts
 * role: workspace-verification 拡張の自動検証フックと完了ゲートを検証する
 * why: 書き込み検知、自動実行、完了ブロックの退行を防ぐため
 * related: .pi/extensions/workspace-verification.ts, .pi/lib/workspace-verification.ts, tests/unit/lib/workspace-verification.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  tools: [] as Array<{ name: string; execute: Function }>,
  notifications: [] as Array<{ message: string; level: string }>,
  config: {
    enabled: true,
    profile: "auto",
    autoDetectRunbook: true,
    autoRunOnTurnEnd: true,
    gateMode: "strict",
    commandTimeoutMs: 120000,
    artifactRetentionRuns: 20,
    enabledSteps: {
      lint: true,
      typecheck: true,
      test: true,
      build: false,
      runtime: false,
      ui: false,
    },
    commands: {
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      test: "npm test",
      build: "npm run build",
    },
    runtime: {
      enabled: false,
      command: "npm run dev",
      label: "workspace-dev-server",
      startupTimeoutMs: 20000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: false,
      timeoutMs: 120000,
      commands: [],
    },
  },
  resolvedPlan: {
    profile: "web-app",
    commands: {
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      test: "npm test",
      build: "npm run build",
    },
    runtime: {
      enabled: true,
      command: "npm run dev",
      label: "workspace-dev-server",
      readyPort: 3000,
      startupTimeoutMs: 20000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: true,
      baseUrl: "http://127.0.0.1:3000",
      timeoutMs: 120000,
      commands: ["open ${baseUrl}", "snapshot"],
    },
    acceptanceCriteria: ["UI が壊れていないこと"],
    validationCommands: ["npm run lint", "npm run typecheck", "npm test"],
    sources: ["/repo/AGENTS.md"],
  },
  state: {
    dirty: false,
    running: false,
    writeCount: 0,
    lastWriteAt: undefined,
    lastWriteTool: undefined,
    lastVerifiedAt: undefined,
    lastRun: undefined,
  },
  runCalls: [] as Array<{ trigger: string; steps?: string[] }>,
}));

vi.mock("../../../.pi/lib/workspace-verification.js", () => ({
  createWorkspaceVerificationConfig: vi.fn(() => mockApi.config),
  loadWorkspaceVerificationConfig: vi.fn(() => mockApi.config),
  loadWorkspaceVerificationState: vi.fn(() => mockApi.state),
  resolveWorkspaceVerificationPlan: vi.fn(() => mockApi.resolvedPlan),
  saveWorkspaceVerificationConfig: vi.fn((_cwd, next) => {
    mockApi.config = {
      ...mockApi.config,
      ...next,
      enabledSteps: { ...mockApi.config.enabledSteps, ...(next.enabledSteps ?? {}) },
      commands: { ...mockApi.config.commands, ...(next.commands ?? {}) },
      runtime: { ...mockApi.config.runtime, ...(next.runtime ?? {}) },
      ui: { ...mockApi.config.ui, ...(next.ui ?? {}) },
    };
    return mockApi.config;
  }),
  markWorkspaceDirty: vi.fn(({ toolName }) => {
    mockApi.state = {
      ...mockApi.state,
      dirty: true,
      running: false,
      writeCount: mockApi.state.writeCount + 1,
      lastWriteAt: "2026-03-07T00:00:00.000Z",
      lastWriteTool: toolName,
    };
    return mockApi.state;
  }),
  markVerificationRunning: vi.fn(() => mockApi.state),
  persistWorkspaceVerificationArtifacts: vi.fn((_cwd, _config, run) => ({
    ...run,
    artifactDir: "/repo/.pi/verification-runs/latest",
    stepResults: run.stepResults.map((item: any, index: number) => ({
      ...item,
      artifactPath: `/repo/.pi/verification-runs/latest/${index + 1}-${item.step}.log`,
    })),
  })),
  finalizeVerificationRun: vi.fn(({ run }) => {
    mockApi.state = {
      ...mockApi.state,
      dirty: !run.success,
      running: false,
      lastVerifiedAt: run.success ? run.finishedAt : mockApi.state.lastVerifiedAt,
      lastRun: run,
    };
    return mockApi.state;
  }),
  shouldAutoRunVerification: vi.fn(() => mockApi.state.dirty && !mockApi.state.running),
  isCompletionBlocked: vi.fn((_config, state) => Boolean(state.dirty)),
  getResolvedCommandForStep: vi.fn((_plan, step) => mockApi.resolvedPlan.commands[step] ?? ""),
  resolveEnabledSteps: vi.fn(() => ["lint", "typecheck", "test", "runtime", "ui"]),
  runWorkspaceCommand: vi.fn(async () => ({
    command: "npm test",
    success: true,
    exitCode: 0,
    timedOut: false,
    durationMs: 25,
    stdout: "ok",
    stderr: "",
  })),
  formatWorkspaceVerificationStatus: vi.fn(() => "status"),
  parseWorkspaceCommand: vi.fn((command: string) => ({
    executable: command.split(/\s+/)[0],
    args: command.split(/\s+/).slice(1),
  })),
}));

vi.mock("../../../.pi/lib/background-processes.js", () => ({
  listBackgroundProcesses: vi.fn(() => []),
  loadBackgroundProcessConfig: vi.fn(() => ({ enabled: true })),
  saveBackgroundProcessConfig: vi.fn(),
  startBackgroundProcess: vi.fn(async () => ({
    ready: true,
    record: { id: "bg-1", pid: 1001, readinessStatus: "ready" },
  })),
  waitForBackgroundProcessReady: vi.fn(async () => ({ ready: true, record: { readinessStatus: "ready" } })),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_command, _args, _options, callback) => callback?.(null, { stdout: "ok", stderr: "" })),
}));

function createPiMock() {
  mockApi.handlers = new Map();
  mockApi.tools = [];
  mockApi.notifications = [];
  mockApi.runCalls = [];
  mockApi.state = {
    dirty: false,
    running: false,
    writeCount: 0,
    lastWriteAt: undefined,
    lastWriteTool: undefined,
    lastVerifiedAt: undefined,
    lastRun: undefined,
  };

  return {
    registerTool: vi.fn((tool) => {
      const originalExecute = tool.execute;
      mockApi.tools.push({
        ...tool,
        execute: async (...args: unknown[]) => {
          if (tool.name === "workspace_verify") {
            const params = args[1] as { trigger?: string; steps?: string[] };
            mockApi.runCalls.push({ trigger: params.trigger ?? "manual", steps: params.steps });
          }
          return originalExecute(...args);
        },
      });
    }),
    on: vi.fn((event, handler) => {
      mockApi.handlers.set(event, handler);
    }),
  };
}

describe("workspace-verification extension", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("registers verification tools", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    expect(mockApi.tools.map((tool) => tool.name)).toEqual([
      "workspace_verify",
      "workspace_verify_status",
      "workspace_verify_plan",
      "workspace_verification_config",
    ]);
  });

  it("marks the workspace dirty after a successful write tool", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const handler = mockApi.handlers.get("tool_result");
    await handler?.(
      { toolName: "edit", isError: false },
      {
        cwd: "/repo",
        ui: {
          notify: (message: string, level: string) => mockApi.notifications.push({ message, level }),
        },
      },
    );

    expect(mockApi.state.dirty).toBe(true);
    expect(mockApi.state.lastWriteTool).toBe("edit");
  });

  it("blocks task completion while verification is stale", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.dirty = true;

    const handler = mockApi.handlers.get("tool_call");
    const result = await handler?.(
      { toolName: "task_complete", input: {} },
      { cwd: "/repo" },
    );

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("workspace_verify");
  });

  it("auto-runs verification on turn end when the workspace is dirty", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.dirty = true;

    const handler = mockApi.handlers.get("turn_end");
    await handler?.({}, {
      cwd: "/repo",
      ui: {
        notify: (message: string, level: string) => mockApi.notifications.push({ message, level }),
      },
    });

    expect(mockApi.state.lastRun?.trigger).toBe("auto");
    expect(mockApi.state.lastRun?.artifactDir).toContain("verification-runs");
  });

  it("shows the resolved verification plan", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify_plan");
    const result = await tool?.execute("tool-1", {}, undefined, undefined, { cwd: "/repo" });

    expect(result?.content[0]?.text).toContain("\"profile\": \"web-app\"");
  });
});
