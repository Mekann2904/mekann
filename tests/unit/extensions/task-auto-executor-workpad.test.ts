/**
 * path: tests/unit/extensions/task-auto-executor-workpad.test.ts
 * role: task_run_next が workflow workpad を自動起動することを検証する
 * why: task queue からの自走開始時に durable record が抜けないようにするため
 * related: .pi/extensions/task-auto-executor.ts, .pi/lib/workflow-workpad.ts, tests/unit/extensions/task-auto-executor.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const ulWorkflowMocks = vi.hoisted(() => ({
  getInstanceId: vi.fn(() => "instance-1-123"),
  isProcessAlive: vi.fn(() => true),
  extractPidFromInstanceId: vi.fn(() => 123),
}));

vi.mock("../../../.pi/lib/core/ownership.js", () => ulWorkflowMocks);

const storageMocks = vi.hoisted(() => ({
  state: {
    tasks: [{
      id: "task-1",
      title: "Implement orchestration",
      description: "wire runner and queue",
      status: "todo",
      priority: "high",
      tags: [],
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
      retryCount: 0,
      completionGateStatus: "clear",
    }],
  },
  reset() {
    storageMocks.state = {
      tasks: [{
        id: "task-1",
        title: "Implement orchestration",
        description: "wire runner and queue",
        status: "todo",
        priority: "high",
        tags: [],
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        retryCount: 0,
        completionGateStatus: "clear",
      }],
    };
  },
  loadTaskStorage: vi.fn(() => structuredClone(storageMocks.state)),
  saveTaskStorage: vi.fn((nextState) => {
    storageMocks.state = structuredClone(nextState);
  }),
  mutateTaskStorage: vi.fn((input: { mutate: (storage: typeof storageMocks.state) => unknown }) => {
    const nextState = structuredClone(storageMocks.state);
    const result = input.mutate(nextState);
    storageMocks.saveTaskStorage(nextState);
    return result;
  }),
}));

vi.mock("../../../.pi/lib/storage/task-plan-store.js", () => storageMocks);

const workflowMocks = vi.hoisted(() => ({
  loadWorkflowDocument: vi.fn(() => ({
    exists: true,
    path: "/repo/WORKFLOW.md",
    frontmatter: {
      verification: {
        required_commands: ["npm run ci"],
      },
    },
    body: "# WORKFLOW",
  })),
  loadWorkpad: vi.fn(() => ({
    metadata: { id: "wp-1" },
    sections: {
      progress: "- changed files\n- proof artifact: summary",
      verification: "- workspace_verify passed\n- npm run policy:workspace\n- npm run verify:workspace -- --fail-on-interactive\n- npm run ci",
      review: "- reviewer acknowledged",
      next: "- no further action required",
    },
  })),
  createWorkpad: vi.fn(() => ({
    metadata: { id: "wp-1" },
  })),
  updateWorkpad: vi.fn(),
}));

vi.mock("../../../.pi/lib/workflow-workpad.js", () => workflowMocks);

const orchestrationMocks = vi.hoisted(() => ({
  claimSymphonyIssue: vi.fn(),
  getSymphonyIssueState: vi.fn(() => ({
    issueId: "task-1",
    workpadId: "wp-1",
    runState: "running",
    updatedAt: "2026-03-08T00:00:00.000Z",
  })),
  releaseSymphonyIssue: vi.fn(),
}));

vi.mock("../../../.pi/lib/symphony-orchestrator-state.js", () => orchestrationMocks);

const trackerMutationMocks = vi.hoisted(() => ({
  markSymphonyTrackerIssueCompleted: vi.fn(async () => undefined),
  markSymphonyTrackerIssueFailed: vi.fn(async () => undefined),
  markSymphonyTrackerIssueTodo: vi.fn(async () => undefined),
}));

vi.mock("../../../.pi/lib/symphony-tracker.js", () => trackerMutationMocks);

const longRunningMocks = vi.hoisted(() => ({
  createLongRunningReplay: vi.fn(() => ({
    session: {
      id: "lr-1",
      status: "crashed",
    },
    nextAction: "Resume the smallest unfinished slice.",
    resumeReason: "Interrupted tool call detected.",
    recentEvents: [
      { type: "tool_call", summary: "tool call started: subagent_run_dag" },
      { type: "tool_result", summary: "tool failed: subagent_run_dag" },
    ],
    warnings: ["Latest session crashed: lr-1"],
    workspaceVerification: { phase: "clear", requestedSteps: [], reason: "clear" },
    backgroundProcesses: [],
    plan: { acceptanceCriteria: [], fileModuleImpact: [], recentProgress: [] },
  })),
}));

vi.mock("../../../.pi/lib/long-running-supervisor.js", () => longRunningMocks);

const runtimeSessionMocks = vi.hoisted(() => {
  let listener: ((event: { type: string; data: unknown }) => void) | null = null;
  return {
    onSessionEvent: vi.fn((nextListener: (event: { type: string; data: unknown }) => void) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
    emit(event: { type: string; data: unknown }) {
      listener?.(event);
    },
  };
});

vi.mock("../../../.pi/lib/runtime-sessions.js", () => ({
  onSessionEvent: runtimeSessionMocks.onSessionEvent,
}));

const childProcessMocks = vi.hoisted(() => ({
  execFileSync: vi.fn(() => "commit-after\n"),
}));

vi.mock("node:child_process", () => childProcessMocks);

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    Object: (value: unknown) => value,
    Optional: (value: unknown) => value,
    Boolean: (value: unknown) => value,
  },
}));

function createPiMock() {
  const tools: any[] = [];
  const handlers = new Map<string, Function>();
  const commands: any[] = [];
  const sendUserMessage = vi.fn();

  return {
    tools,
    handlers,
    commands,
    sendUserMessage,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    registerCommand: vi.fn((name: string, command: any) => commands.push({ name, command })),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

function createSymphonyCommandContext(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/repo",
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      theme: {
        fg: (_tone: string, text: string) => text,
      },
    },
    newSession: vi.fn(async () => ({ cancelled: false })),
    sessionManager: {
      getSessionFile: vi.fn(() => "/repo/.pi/sessions/current.jsonl"),
    },
    ...overrides,
  };
}

describe("task-auto-executor workpad", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storageMocks.reset();
    rmSync(".pi/tasks/auto-executor-config.json", { force: true });
    rmSync(".pi/tasks/auto-executor-runtime.json", { force: true });
    ulWorkflowMocks.getInstanceId.mockReturnValue("instance-1-123");
    ulWorkflowMocks.isProcessAlive.mockReturnValue(true);
    ulWorkflowMocks.extractPidFromInstanceId.mockReturnValue(123);
    longRunningMocks.createLongRunningReplay.mockReturnValue({
      session: {
        id: "lr-1",
        status: "crashed",
      },
      nextAction: "Resume the smallest unfinished slice.",
      resumeReason: "Interrupted tool call detected.",
      recentEvents: [
        { type: "tool_call", summary: "tool call started: subagent_run_dag" },
      ],
      warnings: ["Latest session crashed: lr-1"],
      workspaceVerification: { phase: "clear", requestedSteps: [], reason: "clear" },
      backgroundProcesses: [],
      plan: { acceptanceCriteria: [], fileModuleImpact: [], recentProgress: [] },
    });
    childProcessMocks.execFileSync.mockReset();
    childProcessMocks.execFileSync.mockReturnValue("commit-after\n");
  });

  it("task_run_next で workpad を自動作成する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    const tool = pi.tools.find((entry) => entry.name === "task_run_next");
    const result = await tool.execute("t1", {}, undefined, undefined, { cwd: "/repo" });

    expect(workflowMocks.createWorkpad).toHaveBeenCalledWith("/repo", {
      task: "Implement orchestration",
      source: "auto:task_run_next",
      issueId: "task-1",
    });
    expect(orchestrationMocks.claimSymphonyIssue).toHaveBeenCalledWith({
      cwd: "/repo",
      issueId: "task-1",
      title: "Implement orchestration",
      source: "task-auto-executor",
      reason: "claimed from task_run_next",
      workpadId: "wp-1",
    });
    expect(result.content[0].text).toContain("WORKPAD");
    expect(result.details.workpadId).toBe("wp-1");
  });

  it("task_run_next は durable checkpoint を保存する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    const tool = pi.tools.find((entry) => entry.name === "task_run_next");
    await tool.execute("t1", {}, undefined, undefined, { cwd: "/repo" });

    const runtimeState = JSON.parse(readFileSync(".pi/tasks/auto-executor-runtime.json", "utf-8"));
    expect(runtimeState.checkpoints).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        title: "Implement orchestration",
        status: "claimed",
        workpadId: "wp-1",
      }),
    ]);
  });

  it("task_run_next は atomic claim に負けたら空結果を返す", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    storageMocks.mutateTaskStorage.mockImplementationOnce(() => null);

    extension(pi as never);
    const tool = pi.tools.find((entry) => entry.name === "task_run_next");
    const result = await tool.execute("t1", {}, undefined, undefined, { cwd: "/repo" });

    expect(result.content[0].text).toContain("実行待ちのタスクがありません。");
    expect(result.details.pendingCount).toBe(0);
    expect(orchestrationMocks.claimSymphonyIssue).not.toHaveBeenCalled();
  });

  it("/symphony command を登録する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    expect(pi.commands.map((entry) => entry.name)).toContain("symphony");
  });

  it("/symphony next は fresh session を作って dispatch する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();
    (pi as { executeTool?: ReturnType<typeof vi.fn> }).executeTool = vi.fn();
    const ctx = createSymphonyCommandContext();

    extension(pi as never);

    const symphonyCommand = pi.commands.find((entry) => entry.name === "symphony");
    await symphonyCommand.command.handler("next", ctx);

    expect(pi.executeTool).not.toHaveBeenCalled();
    expect(ctx.newSession).toHaveBeenCalledWith({
      parentSession: "/repo/.pi/sessions/current.jsonl",
    });
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const dispatchPrompt = pi.sendUserMessage.mock.calls[0][0];
    expect(dispatchPrompt).toContain("Handle this as a normal pi task in a fresh session.");
    expect(dispatchPrompt).toContain("Do not assume any previous ticket context.");
    expect(dispatchPrompt).toContain("Do not default to DAG.");
    expect(dispatchPrompt).toContain("Implement orchestration");
    expect(dispatchPrompt).toContain("workspace_verify と required verification commands を完了すること。");
    expect(dispatchPrompt).toContain("検証が通ってから、変更したファイルだけを git add し、必ず git commit を作成すること。");
    expect(dispatchPrompt.indexOf("workspace_verify と required verification commands を完了すること。")).toBeLessThan(
      dispatchPrompt.indexOf("git commit を作成すること。"),
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith("自動実行を開始しました: Implement orchestration", "info");
  });

  it("/symphony next は fresh session dispatcher がないと開始しない", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();
    const notify = vi.fn();

    extension(pi as never);

    const symphonyCommand = pi.commands.find((entry) => entry.name === "symphony");
    await symphonyCommand.command.handler("next", {
      cwd: "/repo",
      ui: {
        notify,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Symphony を開始できません。fresh session dispatcher が見つかりません。", "warning");
    expect(storageMocks.state.tasks[0].status).toBe("todo");
  });

  it("agent_end は Symphony を開始していない instance では自動実行しない", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const agentEndHandler = pi.handlers.get("agent_end");
    const notify = vi.fn();
    const setStatus = vi.fn();
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "task_run_next") {
        return {
          content: [{ type: "text", text: "claimed" }],
          details: {
            taskId: "task-1",
            title: "Implement orchestration",
            description: "wire runner and queue",
            kind: "implementation",
            reason: "one thing per loop",
            workpadId: "wp-1",
          },
        };
      }

      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "started" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await agentEndHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("agent_end は未開始 instance で follow-up turn も queue しない", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const agentEndHandler = pi.handlers.get("agent_end");
    const notify = vi.fn();
    const setStatus = vi.fn();

    await agentEndHandler?.({}, {
      cwd: "/repo",
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("agent_end は active instance でも fresh session を作れない文脈では次タスクへ自動移行しない", async () => {
    storageMocks.state = {
      tasks: [
        {
          id: "task-1",
          title: "Implement orchestration",
          description: "wire runner and queue",
          status: "todo",
          priority: "high",
          tags: [],
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          retryCount: 0,
          completionGateStatus: "clear",
        },
        {
          id: "task-2",
          title: "Follow-up cleanup",
          description: "second ticket",
          status: "todo",
          priority: "medium",
          tags: [],
          createdAt: "2026-03-08T00:00:01.000Z",
          updatedAt: "2026-03-08T00:00:01.000Z",
          retryCount: 0,
          completionGateStatus: "clear",
        },
      ],
    };

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();
    const commandCtx = createSymphonyCommandContext();

    extension(pi as never);

    const symphonyCommand = pi.commands.find((entry) => entry.name === "symphony");
    await symphonyCommand.command.handler("next", commandCtx);

    const agentEndHandler = pi.handlers.get("agent_end");
    const notify = vi.fn();
    const setStatus = vi.fn();

    await agentEndHandler?.({}, {
      cwd: "/repo",
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      "[Symphony] 次タスクは fresh session が必要です。この文脈では自動移行しません。`/symphony next` で開始してください。",
      "info",
    );
    expect(storageMocks.state.tasks[1].status).toBe("todo");
  });

  it("session_start では pending task があっても自動起動しない", async () => {
    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const notify = vi.fn();
    const setStatus = vi.fn();
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "task_run_next") {
        return {
          content: [{ type: "text", text: "claimed" }],
          details: {
            taskId: "task-1",
            title: "Implement orchestration",
            description: "wire runner and queue",
            kind: "implementation",
            reason: "one thing per loop",
            workpadId: "wp-1",
          },
        };
      }

      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "started" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it("session_start は UI がなくても自動起動しない", async () => {
    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "task_run_next") {
        return {
          content: [{ type: "text", text: "claimed" }],
          details: {
            taskId: "task-1",
            title: "Implement orchestration",
            description: "wire runner and queue",
            kind: "implementation",
            reason: "one thing per loop",
            workpadId: "wp-1",
          },
        };
      }

      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "started" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      executeTool,
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it("session_start は tool executor がなくても follow-up turn を queue しない", async () => {
    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const notify = vi.fn();
    const setStatus = vi.fn();

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("自動実行を開始しました"), "info");
    expect(setStatus).not.toHaveBeenCalledWith("auto-executor", "待機中: Implement orchestration...");
  });

  it("session_start は reclaimable な in_progress task も自動再開しない", async () => {
    storageMocks.state = {
      tasks: [{
        id: "task-1",
        title: "Resume orchestration",
        description: "recover stale worker",
        status: "in_progress",
        priority: "high",
        tags: [],
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        ownerInstanceId: "other-999",
        retryCount: 0,
        completionGateStatus: "clear",
      }],
    };
    ulWorkflowMocks.extractPidFromInstanceId.mockReturnValue(999);
    ulWorkflowMocks.isProcessAlive.mockReturnValue(false);

    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "task_run_next") {
        return {
          content: [{ type: "text", text: "claimed" }],
          details: {
            taskId: "task-1",
            title: "Resume orchestration",
            description: "recover stale worker",
            kind: "implementation",
            reason: "one thing per loop",
            workpadId: "wp-1",
          },
        };
      }

      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "started" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it("durable checkpoint があっても session_start だけでは resume しない", async () => {
    storageMocks.state = {
      tasks: [{
        id: "task-1",
        title: "Resume orchestration",
        description: "recover stale worker",
        status: "in_progress",
        priority: "high",
        tags: [],
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        ownerInstanceId: "other-999",
        retryCount: 0,
        completionGateStatus: "clear",
      }],
    };
    ulWorkflowMocks.extractPidFromInstanceId.mockReturnValue(999);
    ulWorkflowMocks.isProcessAlive.mockReturnValue(false);

    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      currentTaskId: "task-1",
      maxRetries: 2,
    }, null, 2));
    writeFileSync(".pi/tasks/auto-executor-runtime.json", JSON.stringify({
      checkpoints: [{
        taskId: "task-1",
        title: "Resume orchestration",
        description: "recover stale worker",
        kind: "implementation",
        reason: "durable checkpoint",
        workpadId: "wp-1",
        status: "interrupted",
        ownerInstanceId: "other-999",
        ownerPid: 999,
        attemptCount: 1,
        resumeCount: 0,
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        lastError: "tool timed out",
      }],
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "resumed" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it("task storage から消えた interrupted checkpoint task も未開始 instance の agent_end では resume しない", async () => {
    storageMocks.state = {
      tasks: [],
    };
    ulWorkflowMocks.extractPidFromInstanceId.mockReturnValue(999);
    ulWorkflowMocks.isProcessAlive.mockReturnValue(false);

    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));
    writeFileSync(".pi/tasks/auto-executor-runtime.json", JSON.stringify({
      checkpoints: [{
        taskId: "task-1",
        title: "Resume orchestration",
        description: "recover stale worker",
        kind: "implementation",
        reason: "durable checkpoint",
        workpadId: "wp-1",
        status: "interrupted",
        ownerInstanceId: "other-999",
        ownerPid: 999,
        attemptCount: 1,
        resumeCount: 0,
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        lastError: "tool timed out",
      }],
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const agentEndHandler = pi.handlers.get("agent_end");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      if (toolName === "subagent_run_dag") {
        return {
          content: [{ type: "text", text: "resumed" }],
          details: { outcomeCode: "SUCCESS" },
        };
      }

      throw new Error(`unexpected tool: ${toolName}`);
    });

    await agentEndHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify: vi.fn(),
        setStatus: vi.fn(),
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(storageMocks.state.tasks).toEqual([
      expect.objectContaining({
        id: "task-1",
        title: "Resume orchestration",
        status: "in_progress",
        priority: "high",
      }),
    ]);
  });

  it("他インスタンスの live な in_progress task があっても session_start は未開始 instance では何もしない", async () => {
    storageMocks.state = {
      tasks: [
        {
          id: "task-live",
          title: "Live orchestration",
          description: "owned elsewhere",
          status: "in_progress",
          priority: "high",
          tags: [],
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          ownerInstanceId: "other-999",
          retryCount: 0,
          completionGateStatus: "clear",
        },
        {
          id: "task-todo",
          title: "Implement orchestration",
          description: "wire runner and queue",
          status: "todo",
          priority: "high",
          tags: [],
          createdAt: "2026-03-08T00:00:00.000Z",
          updatedAt: "2026-03-08T00:00:00.000Z",
          retryCount: 0,
          completionGateStatus: "clear",
        },
      ],
    };
    ulWorkflowMocks.extractPidFromInstanceId.mockReturnValue(999);
    ulWorkflowMocks.isProcessAlive.mockReturnValue(true);

    writeFileSync(".pi/tasks/auto-executor-config.json", JSON.stringify({
      enabled: true,
      autoRun: true,
      maxRetries: 2,
    }, null, 2));

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const sessionStartHandler = pi.handlers.get("session_start");
    const executeTool = vi.fn();
    const notify = vi.fn();
    const setStatus = vi.fn();

    await sessionStartHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify,
        setStatus,
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(executeTool).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("workspace_verify の結果を task verification state に反映する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    const taskRunNextTool = pi.tools.find((entry) => entry.name === "task_run_next");
    await taskRunNextTool.execute("t1", {}, undefined, undefined, { cwd: "/repo" });

    const toolResultHandler = pi.handlers.get("tool_result");
    await toolResultHandler?.({
      toolName: "workspace_verify",
      isError: false,
      result: { summary: "all commands passed" },
    }, { cwd: "/repo" });

    const savedAfterVerify = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterVerify.tasks[0].workspaceVerificationStatus).toBe("passed");
    expect(savedAfterVerify.tasks[0].workspaceVerificationMessage).toBe("all commands passed");
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith("/repo", {
      id: "wp-1",
      section: "verification",
      content: "- workspace_verify passed: all commands passed",
      mode: "append",
    });
  });

  it("workspace_verify details.success=false を failed として反映する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    const taskRunNextTool = pi.tools.find((entry) => entry.name === "task_run_next");
    await taskRunNextTool.execute("t1", {}, undefined, undefined, { cwd: "/repo" });

    const toolResultHandler = pi.handlers.get("tool_result");
    await toolResultHandler?.({
      toolName: "workspace_verify",
      isError: false,
      result: {
        summary: "runtime timed out",
        details: {
          success: false,
        },
      },
    }, { cwd: "/repo" });

    const savedAfterVerify = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterVerify.tasks[0].workspaceVerificationStatus).toBe("failed");
    expect(savedAfterVerify.tasks[0].workspaceVerificationMessage).toBe("runtime timed out");
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith("/repo", {
      id: "wp-1",
      section: "verification",
      content: "- workspace_verify failed: runtime timed out",
      mode: "append",
    });
  });

  it("/symphony next 起動失敗時は claim を戻して orchestration を release する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();
    const ctx = createSymphonyCommandContext();
    pi.sendUserMessage.mockImplementation(() => {
      throw new Error("follow-up dispatch unavailable");
    });

    extension(pi as never);

    const symphonyCommand = pi.commands.find((entry) => entry.name === "symphony");
    await symphonyCommand.command.handler("next", ctx);

    expect(storageMocks.saveTaskStorage).toHaveBeenCalled();
    expect(orchestrationMocks.releaseSymphonyIssue).toHaveBeenCalledWith({
      cwd: "/repo",
      issueId: "task-1",
      title: "Implement orchestration",
      source: "task-auto-executor",
      reason: "auto-run dispatch failed: follow-up dispatch unavailable",
      workpadId: "wp-1",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith("/repo", {
      id: "wp-1",
      section: "verification",
      content: "- auto-run dispatch failed: follow-up dispatch unavailable",
      mode: "append",
    });
    expect(ctx.ui.notify).toHaveBeenCalledWith("自動実行の起動に失敗しました: Implement orchestration", "warning");
  });

  it("runtime session completed を受けて task を完了扱いにする", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "completed",
        message: "all checks passed",
      },
    });

    const savedAfterComplete = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterComplete.tasks[0].status).toBe("completed");
    expect(savedAfterComplete.tasks[0].completionGateStatus).toBe("clear");
    expect(savedAfterComplete.tasks[0].completionGateMessage).toBe("completion gate passed");
    expect(savedAfterComplete.tasks[0].proofArtifacts).toContain("summary");
    expect(savedAfterComplete.tasks[0].verifiedCommands).toContain("npm run ci");
    expect(savedAfterComplete.tasks[0].progressEvidence).toContain("- changed files");
    expect(savedAfterComplete.tasks[0].verificationEvidence).toContain("- workspace_verify passed");
    expect(savedAfterComplete.tasks[0].reviewEvidence).toContain("- reviewer acknowledged");
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "verification",
      content: "- auto-run session completed: all checks passed",
      mode: "append",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "next",
      content: "- no further action required",
      mode: "replace",
    });
  });

  it("git commit が増えていない completed は retry に戻す", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    childProcessMocks.execFileSync.mockReturnValue("commit-base\n");
    writeFileSync(".pi/tasks/auto-executor-runtime.json", JSON.stringify({
      checkpoints: [{
        taskId: "task-1",
        title: "Implement orchestration",
        description: "wire runner and queue",
        kind: "implementation",
        reason: "claimed from task_run_next",
        workpadId: "wp-1",
        status: "dispatched",
        ownerInstanceId: "instance-1-123",
        ownerPid: 123,
        attemptCount: 1,
        resumeCount: 0,
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
        startHeadCommit: "commit-base",
      }],
    }, null, 2));

    extension(pi as never);

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "completed",
        message: "done without commit",
      },
    });

    const savedAfterGateBlock = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterGateBlock.tasks[0].status).toBe("todo");
    expect(savedAfterGateBlock.tasks[0].retryCount).toBe(1);
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "verification",
      content: expect.stringContaining("git commit proof is missing"),
      mode: "append",
    });
  });

  it("completion gate blocker を task state に保存する", async () => {
    workflowMocks.loadWorkpad.mockReturnValueOnce({
      metadata: { id: "wp-1" },
      sections: {
        progress: "- progress only",
        verification: "- [ ] npm run ci",
        review: "",
        next: "- pending",
      },
    });

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "completed",
        message: "attempted close",
      },
    });

    const savedStates = storageMocks.saveTaskStorage.mock.calls.map((call) => call[0]);
    const blockedSnapshot = savedStates.find((state) => state.tasks[0].completionGateStatus === "blocked");

    expect(blockedSnapshot?.tasks[0].completionGateMessage).toContain("completion gate blocked");
    expect(blockedSnapshot?.tasks[0].completionGateBlockers).toContain("verification command not confirmed: npm run ci");
  });

  it("completion gate を満たさない completed は retry に戻す", async () => {
    workflowMocks.loadWorkflowDocument.mockReturnValueOnce({
      exists: true,
      path: "/repo/WORKFLOW.md",
      frontmatter: {
        verification: {
          required_commands: [
            "npm run policy:workspace",
            "npm run verify:workspace -- --fail-on-interactive",
          ],
        },
        completion_gate: {
          require_single_in_progress_step: true,
          require_proof_artifacts: true,
          require_workspace_verification: true,
        },
      },
      body: "# WORKFLOW",
    });
    workflowMocks.loadWorkpad.mockReturnValueOnce({
      metadata: { id: "wp-1" },
      sections: {
        progress: "- created",
        verification: "- [ ] npm run policy:workspace",
        review: "- pending",
        next: "- pending",
      },
    });

    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "completed",
        message: "done",
      },
    });

    const savedAfterGateBlock = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterGateBlock.tasks[0].status).toBe("todo");
    expect(savedAfterGateBlock.tasks[0].retryCount).toBe(1);
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "verification",
      content: expect.stringContaining("completion gate blocked:"),
      mode: "append",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "next",
      content: "- wait for retry window, then resume the same task automatically",
      mode: "replace",
    });
  });

  it("runtime session failed を受けて task を failed にする", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const toggleTool = pi.tools.find((entry) => entry.name === "task_auto_executor_toggle");
    await toggleTool.execute("toggle", { enabled: true }, undefined, undefined, {});

    orchestrationMocks.getSymphonyIssueState
      .mockReturnValueOnce({
        issueId: "task-1",
        workpadId: "wp-1",
        runState: "retrying",
        retryAttempt: 2,
        updatedAt: "2026-03-08T00:00:00.000Z",
      })
      .mockReturnValueOnce({
        issueId: "task-1",
        workpadId: "wp-1",
        runState: "retrying",
        retryAttempt: 2,
        updatedAt: "2026-03-08T00:00:00.000Z",
      });

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "failed",
        message: "tests failed",
      },
    });

    const savedAfterFailure = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterFailure.tasks[0].status).toBe("failed");
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "verification",
      content: "- auto-run session failed: tests failed (retry budget exhausted)",
      mode: "append",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "next",
      content: "- inspect the failure, repair the smallest broken slice, then rerun the task",
      mode: "replace",
    });
  });

  it("runtime session failed で retry budget 内なら todo に戻して backoff する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    runtimeSessionMocks.emit({
      type: "session_updated",
      data: {
        taskId: "task-1",
        status: "failed",
        message: "transient failure",
      },
    });

    const savedAfterRetry = storageMocks.saveTaskStorage.mock.calls.at(-1)?.[0];
    expect(savedAfterRetry.tasks[0].status).toBe("todo");
    expect(savedAfterRetry.tasks[0].retryCount).toBe(1);
    expect(typeof savedAfterRetry.tasks[0].nextRetryAt).toBe("string");
    expect(savedAfterRetry.tasks[0].lastError).toBe("transient failure");
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "verification",
      content: expect.stringContaining("- auto-run session failed, retry scheduled: transient failure"),
      mode: "append",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith(process.cwd(), {
      id: "wp-1",
      section: "next",
      content: "- wait for retry window, then resume the same task automatically",
      mode: "replace",
    });
  });
});
