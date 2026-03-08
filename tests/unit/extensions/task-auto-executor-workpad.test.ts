/**
 * path: tests/unit/extensions/task-auto-executor-workpad.test.ts
 * role: task_run_next が workflow workpad を自動起動することを検証する
 * why: task queue からの自走開始時に durable record が抜けないようにするため
 * related: .pi/extensions/task-auto-executor.ts, .pi/lib/workflow-workpad.ts, tests/unit/extensions/task-auto-executor.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../.pi/extensions/ul-workflow.js", () => ({
  getInstanceId: vi.fn(() => "instance-1-123"),
  isProcessAlive: vi.fn(() => true),
  extractPidFromInstanceId: vi.fn(() => 123),
}));

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

  return {
    tools,
    handlers,
    commands,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    registerCommand: vi.fn((name: string, command: any) => commands.push({ name, command })),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

describe("task-auto-executor workpad", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storageMocks.reset();
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

  it("autoRun 有効時は agent_end から既存ツール経由で自動実行する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const toggleTool = pi.tools.find((entry) => entry.name === "task_auto_executor_toggle");
    await toggleTool.execute("toggle", { enabled: true, autoRun: true }, undefined, undefined, {});

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

    expect(executeTool).toHaveBeenNthCalledWith(1, {
      toolName: "task_run_next",
      params: {},
    });
    expect(executeTool).toHaveBeenNthCalledWith(2, {
      toolName: "subagent_run_dag",
      params: {
        task: "Implement orchestration\n\n詳細: wire runner and queue",
        taskId: "task-1",
        extraContext: expect.stringContaining("taskId: task-1"),
        autoGenerate: true,
      },
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith("/repo", {
      id: "wp-1",
      section: "progress",
      content: "- auto-run dispatch started via task_auto_executor",
      mode: "append",
    });
    expect(notify).toHaveBeenCalledWith("自動実行を開始しました: Implement orchestration", "info");
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

  it("autoRun 起動失敗時は claim を戻して orchestration を release する", async () => {
    const extension = (await import("../../../.pi/extensions/task-auto-executor.js")).default;
    const pi = createPiMock();

    extension(pi as never);

    const toggleTool = pi.tools.find((entry) => entry.name === "task_auto_executor_toggle");
    await toggleTool.execute("toggle", { enabled: true, autoRun: true }, undefined, undefined, {});

    const agentEndHandler = pi.handlers.get("agent_end");
    const notify = vi.fn();
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

      throw new Error("subagent runner unavailable");
    });

    await agentEndHandler?.({}, {
      cwd: "/repo",
      executeTool,
      ui: {
        notify,
        setStatus: vi.fn(),
        theme: {
          fg: (_tone: string, text: string) => text,
        },
      },
    });

    expect(storageMocks.saveTaskStorage).toHaveBeenCalled();
    expect(orchestrationMocks.releaseSymphonyIssue).toHaveBeenCalledWith({
      cwd: "/repo",
      issueId: "task-1",
      title: "Implement orchestration",
      source: "task-auto-executor",
      reason: "auto-run dispatch failed: subagent runner unavailable",
      workpadId: "wp-1",
    });
    expect(workflowMocks.updateWorkpad).toHaveBeenCalledWith("/repo", {
      id: "wp-1",
      section: "verification",
      content: "- auto-run dispatch failed: subagent runner unavailable",
      mode: "append",
    });
    expect(notify).toHaveBeenCalledWith("自動実行の起動に失敗しました: Implement orchestration", "warning");
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
