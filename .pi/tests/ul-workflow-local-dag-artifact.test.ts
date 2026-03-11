/**
 * path: .pi/tests/ul-workflow-local-dag-artifact.test.ts
 * what: UL workflow のローカル DAG フォールバック時の plan.md 保存内容を検証する
 * why: plan-synthesis が空でも集約ログで plan.md が壊れないようにするため
 * related: .pi/extensions/ul-workflow.ts, .pi/tests/ul-workflow-artifacts.test.ts, .pi/extensions/subagents.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const dagExecutorMock = vi.hoisted(() => ({
  executeDag: vi.fn(),
}));

vi.mock("../lib/dag-executor.js", () => ({
  executeDag: dagExecutorMock.executeDag,
}));

vi.mock("../extensions/subagents/storage.js", () => ({
  loadStorage: vi.fn(() => ({
    agents: [{ id: "architect", name: "Architect", enabled: true }],
  })),
  createDefaultAgents: vi.fn(() => [{ id: "architect", name: "Architect", enabled: true }]),
}));

vi.mock("../extensions/subagents/live-monitor.js", () => ({
  createSubagentLiveMonitor: vi.fn(() => ({
    markStarted: vi.fn(),
    appendChunk: vi.fn(),
    markFinished: vi.fn(),
    close: vi.fn(),
    wait: vi.fn(async () => {}),
  })),
}));

vi.mock("../extensions/subagents/task-execution.js", () => ({
  runSubagentTask: vi.fn(),
}));

vi.mock("../lib/runtime-sessions.js", () => ({
  generateSessionId: vi.fn(() => "test-session"),
  addSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("../extensions/agent-runtime.js", () => ({
  acquireRuntimeDispatchPermit: vi.fn(async () => ({
    allowed: true,
    lease: {
      consume: vi.fn(),
      release: vi.fn(),
    },
  })),
  getRuntimeSnapshot: vi.fn(() => ({
    limits: {
      maxParallelSubagentsPerRun: 3,
      capacityWaitMs: 1,
      capacityPollMs: 1,
    },
  })),
  getSharedRuntimeState: vi.fn(() => ({
    subagents: {
      activeRunRequests: 0,
      activeAgents: 0,
    },
  })),
  notifyRuntimeCapacityChanged: vi.fn(),
}));

vi.mock("../extensions/shared/runtime-helpers.js", () => ({
  buildRuntimeLimitError: vi.fn(() => "runtime-limit"),
  refreshRuntimeStatus: vi.fn(),
  startReservationHeartbeat: vi.fn(() => vi.fn()),
}));

import registerUlWorkflowExtension from "../extensions/ul-workflow.js";

type RegisteredTool = {
  execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
  const tools = new Map<string, RegisteredTool>();
  return {
    tools,
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    registerCommand() {
      // no-op
    },
  };
}

describe("UL workflow local DAG artifact fallback", () => {
  let pi: ReturnType<typeof createFakePi>;
  const createdTaskIds: string[] = [];

  beforeEach(() => {
    pi = createFakePi();
    registerUlWorkflowExtension(pi as any);
    dagExecutorMock.executeDag.mockReset();
  });

  afterEach(() => {
    for (const taskId of createdTaskIds.splice(0)) {
      rmSync(path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId), {
        recursive: true,
        force: true,
      });
    }
  });

  it("writes the last non-empty completed output instead of aggregated logs to plan.md", async () => {
    dagExecutorMock.executeDag.mockResolvedValue({
      overallStatus: "completed",
      totalDurationMs: 12,
      completedTaskIds: ["plan-findings", "plan-synthesis"],
      failedTaskIds: [],
      skippedTaskIds: [],
      taskResults: new Map([
        ["plan-findings", { status: "completed", output: { output: "# Plan\n\n- [ ] 正しい plan を保存する" } }],
        ["plan-synthesis", { status: "completed", output: { output: "" } }],
      ]),
    });

    const startTool = pi.tools.get("ul_workflow_start");
    const approveTool = pi.tools.get("ul_workflow_approve");
    const planTool = pi.tools.get("ul_workflow_plan");
    expect(startTool && approveTool && planTool).toBeDefined();

    const startResult = await startTool!.execute(
      "tc-local-dag-start",
      { task: "plan.md の保存が壊れないことを確認する" },
      undefined,
      undefined,
      {},
    );
    const taskId = startResult.details.taskId as string;
    createdTaskIds.push(taskId);

    const researchPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "research.md");
    writeFileSync(researchPath, "# Research\n\n既存の調査結果\n", "utf-8");

    await approveTool!.execute("tc-local-dag-approve", {}, undefined, undefined, {});
    await planTool!.execute(
      "tc-local-dag-plan",
      { task: "plan.md の保存が壊れないことを確認する", task_id: taskId },
      undefined,
      undefined,
      {},
    );

    const planPath = path.join(process.cwd(), ".pi", "ul-workflow", "tasks", taskId, "plan.md");
    const content = readFileSync(planPath, "utf-8");

    expect(content).toContain("# Plan");
    expect(content).toContain("正しい plan を保存する");
    expect(content).not.toContain("## plan-findings");
    expect(content).not.toContain("Status: COMPLETED");
  });
});
