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
  beforeEach(() => {
    executeDagMock.mockReset();
    executeWithAdaptOrchMock.mockReset();
    addNodeMock.mockReset();
    addDependencyMock.mockReset();
    addInputContextMock.mockReset();
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
});
