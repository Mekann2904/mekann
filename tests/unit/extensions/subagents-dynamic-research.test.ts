/**
 * tests/unit/extensions/subagents-dynamic-research.test.ts
 * subagent_run_dag の dynamic research 拡張を検証する
 * 外部 DAG 実行でも gap-check 後に deep-dive を差し込めることを固定する
 * Related: .pi/extensions/subagents.ts, .pi/lib/dag-executor.ts, .pi/extensions/ul-workflow.ts
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const executeDagMock = vi.fn();
const executeWithAdaptOrchMock = vi.fn();
const addNodeMock = vi.fn();
const addDependencyMock = vi.fn();
const addInputContextMock = vi.fn();

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    String: (value?: unknown) => value,
    Optional: (value: unknown) => value,
    Object: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    Number: (value?: unknown) => value,
    Array: (value: unknown) => value,
    Boolean: (value?: unknown) => value,
  },
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: vi.fn(),
}));

vi.mock("../../../.pi/extensions/subagents/storage.js", () => ({
  loadStorage: vi.fn(() => ({
    agents: [
      {
        id: "researcher",
        name: "Researcher",
        description: "Research specialist",
        systemPrompt: "You research.",
        enabled: "enabled",
      },
    ],
    currentAgentId: "researcher",
    runs: [],
  })),
  createDefaultAgents: vi.fn(() => []),
  saveStorageWithPatterns: vi.fn(async () => {}),
}));

vi.mock("../../../.pi/extensions/agent-runtime.js", () => ({
  acquireRuntimeDispatchPermit: vi.fn(async () => ({
    allowed: true,
    lease: {
      consume: vi.fn(),
      release: vi.fn(),
    },
  })),
  formatRuntimeStatusLine: vi.fn(() => "status"),
  getRuntimeSnapshot: vi.fn(() => ({
    limits: {
      maxParallelSubagentsPerRun: 4,
      maxTotalActiveLlm: 4,
      capacityWaitMs: 10,
      capacityPollMs: 1,
    },
    subagentActiveRequests: 0,
    subagentActiveAgents: 0,
    teamActiveRuns: 0,
    teamActiveAgents: 0,
    totalActiveRequests: 0,
    totalActiveLlm: 0,
  })),
  getSharedRuntimeState: vi.fn(() => ({
    activeRunRequests: 0,
    activeAgents: 0,
    subagents: { activeRunRequests: 0, activeAgents: 0 },
    teams: { activeTeamRuns: 0, activeTeammates: 0 },
  })),
  notifyRuntimeCapacityChanged: vi.fn(),
  resetRuntimeTransientState: vi.fn(),
}));

vi.mock("../../../.pi/extensions/shared/runtime-helpers.js", () => ({
  buildRuntimeLimitError: vi.fn(() => "limit error"),
  startReservationHeartbeat: vi.fn(() => () => {}),
  refreshRuntimeStatus: vi.fn(),
}));

vi.mock("../../../.pi/extensions/subagents/live-monitor.js", () => ({
  createSubagentLiveMonitor: vi.fn(() => ({
    markStarted: vi.fn(),
    appendChunk: vi.fn(),
    markFinished: vi.fn(),
    close: vi.fn(),
    wait: vi.fn(async () => {}),
  })),
}));

vi.mock("../../../.pi/extensions/subagents/task-execution.js", () => ({
  runSubagentTask: vi.fn(async () => ({
    runRecord: { status: "completed", summary: "ok", error: undefined },
    output: "done",
    prompt: "prompt",
  })),
}));

vi.mock("../../../.pi/lib/runtime-sessions.js", () => ({
  generateSessionId: vi.fn(() => "session-1"),
  addSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("../../../.pi/lib/agent/benchmark-harness.js", () => ({
  createSubagentBenchmarkRun: vi.fn(() => ({ id: "bench-1" })),
  mergePromptStackBenchmarkSummaries: vi.fn(() => undefined),
}));

vi.mock("../../../.pi/lib/agent/benchmark-store.js", () => ({
  recordAgentBenchmarkRun: vi.fn(),
  loadAgentBenchmarkComparison: vi.fn(),
  loadAgentBenchmarkStore: vi.fn(),
}));

vi.mock("../../../.pi/lib/cost-estimator", () => ({
  getCostEstimator: vi.fn(() => ({ estimate: vi.fn() })),
}));

vi.mock("../../../.pi/lib/provider-limits", () => ({
  detectTier: vi.fn(() => "standard"),
  getConcurrencyLimit: vi.fn(() => 4),
}));

vi.mock("../../../.pi/lib/comprehensive-logger", () => ({
  getLogger: vi.fn(() => ({
    startOperation: vi.fn(),
    endOperation: vi.fn(),
  })),
}));

vi.mock("../../../.pi/lib/dag-executor.js", () => ({
  executeDag: executeDagMock,
}));

vi.mock("../../../.pi/lib/dag/adaptorch-adapter.js", () => ({
  executeWithAdaptOrch: executeWithAdaptOrchMock,
  isGlobalAdaptOrchEnabled: vi.fn(() => true),
}));

function createFakePi() {
  const tools = new Map<string, any>();
  return {
    tools,
    appendEntry: vi.fn(),
    registerTool(def: any) {
      tools.set(def.name, def);
    },
    registerCommand: vi.fn(),
    on: vi.fn(),
  };
}

describe("subagent_run_dag dynamic research", () => {
  beforeEach(async () => {
    executeDagMock.mockReset();
    executeWithAdaptOrchMock.mockReset();
    addNodeMock.mockReset();
    addDependencyMock.mockReset();
    addInputContextMock.mockReset();
    const subagentsModule = await import("../../../.pi/extensions/subagents.js");
    if (typeof subagentsModule.resetForTesting === "function") {
      subagentsModule.resetForTesting();
    }
  });

  it("dynamicResearch 指定時は legacy executeDag で deep-dive を差し込む", async () => {
    executeDagMock.mockImplementation(async (_plan, _executor, options) => {
      await options.onBatchSettled?.(
        {
          results: new Map([
            ["research-intent", { status: "completed", output: { output: "intent" } }],
            ["research-gap-check", {
              status: "completed",
              output: {
                output: [
                  "DEEP_DIVE_EXTERNAL: yes",
                  "DEEP_DIVE_CODEBASE: no",
                  "RATIONALE: external docs are still unclear",
                ].join("\n"),
              },
            }],
          ]),
          completedTaskIds: ["research-gap-check"],
          failedTaskIds: [],
          getStats: () => ({ total: 2, completed: 2, failed: 0, pending: 0, running: 0 }),
          addNode: addNodeMock,
          removeNode: vi.fn(),
          addDependency: addDependencyMock,
          addInputContext: addInputContextMock,
          removeDependency: vi.fn(),
          requeueTask: vi.fn(),
          getTask: vi.fn(),
        },
        {
          completedTaskIds: ["research-gap-check"],
          failedTaskIds: [],
          results: [],
        },
      );

      return {
        planId: "ul-research-dynamic-dag",
        overallStatus: "completed",
        totalDurationMs: 1,
        completedTaskIds: ["research-gap-check", "research-synthesis"],
        failedTaskIds: [],
        skippedTaskIds: [],
        taskResults: new Map([
          ["research-gap-check", { taskId: "research-gap-check", status: "completed", output: { output: "gap done" }, durationMs: 1 }],
          ["research-synthesis", { taskId: "research-synthesis", status: "completed", output: { output: "# Research\n\nfinal doc" }, durationMs: 1 }],
        ]),
      };
    });

    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-1",
      {
        task: "通知基盤を設計する",
        autoGenerate: false,
        plan: {
          id: "ul-research-dynamic-dag",
          description: "dynamic research",
          tasks: [
            { id: "research-intent", description: "intent", assignedAgent: "researcher", dependencies: [] },
            { id: "research-gap-check", description: "gap", assignedAgent: "researcher", dependencies: ["research-intent"] },
            { id: "research-synthesis", description: "synthesis", assignedAgent: "researcher", dependencies: ["research-gap-check"] },
          ],
        },
        dynamicResearch: {
          task: "通知基盤を設計する",
          gapTaskId: "research-gap-check",
          synthesisTaskId: "research-synthesis",
        },
      },
      undefined,
      undefined,
      {
        cwd: "/tmp/subagents-dynamic",
        model: { id: "gpt-test", provider: "openai" },
      },
    );

    expect(executeDagMock).toHaveBeenCalledTimes(1);
    expect(executeWithAdaptOrchMock).not.toHaveBeenCalled();
    expect(addNodeMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "research-deep-dive-external",
      assignedAgent: "researcher",
    }));
    expect(addDependencyMock).toHaveBeenCalledWith("research-synthesis", "research-deep-dive-external");
    expect(addInputContextMock).toHaveBeenCalledWith("research-synthesis", "research-deep-dive-external");
    expect(result.details.followupDecision).toEqual({
      needsExternalDeepDive: true,
      needsCodebaseDeepDive: false,
      rationale: "external docs are still unclear",
    });
  });

  it("dynamicPlan 指定時は legacy executeDag で plan deep-dive を差し込む", async () => {
    executeDagMock.mockImplementation(async (_plan, _executor, options) => {
      await options.onBatchSettled?.(
        {
          results: new Map([
            ["plan-findings", { status: "completed", output: { output: "findings" } }],
            ["plan-gap-check", {
              status: "completed",
              output: {
                output: [
                  "DEEP_DIVE_CHANGES: yes",
                  "DEEP_DIVE_VALIDATION: no",
                  "RATIONALE: implementation scope is still vague",
                ].join("\n"),
              },
            }],
          ]),
          completedTaskIds: ["plan-gap-check"],
          failedTaskIds: [],
          getStats: () => ({ total: 2, completed: 2, failed: 0, pending: 0, running: 0 }),
          addNode: addNodeMock,
          removeNode: vi.fn(),
          addDependency: addDependencyMock,
          addInputContext: addInputContextMock,
          removeDependency: vi.fn(),
          requeueTask: vi.fn(),
          getTask: vi.fn(),
        },
        {
          completedTaskIds: ["plan-gap-check"],
          failedTaskIds: [],
          results: [],
        },
      );

      return {
        planId: "ul-plan-dynamic-dag",
        overallStatus: "completed",
        totalDurationMs: 1,
        completedTaskIds: ["plan-gap-check", "plan-synthesis"],
        failedTaskIds: [],
        skippedTaskIds: [],
        taskResults: new Map([
          ["plan-gap-check", { taskId: "plan-gap-check", status: "completed", output: { output: "gap done" }, durationMs: 1 }],
          ["plan-synthesis", { taskId: "plan-synthesis", status: "completed", output: { output: "# Plan\n\nfinal doc" }, durationMs: 1 }],
        ]),
      };
    });

    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-2",
      {
        task: "通知基盤の plan を作る",
        autoGenerate: false,
        plan: {
          id: "ul-plan-dynamic-dag",
          description: "dynamic plan",
          tasks: [
            { id: "plan-findings", description: "findings", assignedAgent: "architect", dependencies: [] },
            { id: "plan-gap-check", description: "gap", assignedAgent: "architect", dependencies: ["plan-findings"] },
            { id: "plan-synthesis", description: "synthesis", assignedAgent: "architect", dependencies: ["plan-gap-check"] },
          ],
        },
        dynamicPlan: {
          task: "通知基盤の plan を作る",
          gapTaskId: "plan-gap-check",
          synthesisTaskId: "plan-synthesis",
        },
      },
      undefined,
      undefined,
      {
        cwd: "/tmp/subagents-dynamic",
        model: { id: "gpt-test", provider: "openai" },
      },
    );

    expect(executeDagMock).toHaveBeenCalledTimes(1);
    expect(executeWithAdaptOrchMock).not.toHaveBeenCalled();
    expect(addNodeMock).toHaveBeenCalledWith(expect.objectContaining({
      id: "plan-deep-dive-changes",
      assignedAgent: "architect",
    }));
    expect(addDependencyMock).toHaveBeenCalledWith("plan-synthesis", "plan-deep-dive-changes");
    expect(addInputContextMock).toHaveBeenCalledWith("plan-synthesis", "plan-deep-dive-changes");
    expect(result.details.followupDecision).toEqual({
      needsChangesDeepDive: true,
      needsValidationDeepDive: false,
      rationale: "implementation scope is still vague",
    });
  });
});
