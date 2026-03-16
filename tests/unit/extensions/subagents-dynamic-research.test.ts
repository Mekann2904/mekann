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
const generateDagFromTaskMock = vi.fn();
const runSubagentTaskMock = vi.fn();

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
      {
        id: "implementer",
        name: "Implementer",
        description: "Implementation specialist",
        systemPrompt: "You implement.",
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
  runSubagentTask: runSubagentTaskMock.mockImplementation(async () => ({
    runRecord: { status: "completed", summary: "ok", error: undefined },
    output: "done",
    prompt: "prompt",
    promptStackSummary: undefined,
    runtimeNotificationCount: 0,
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

vi.mock("../../../.pi/lib/dag-generator.js", () => ({
  generateDagFromTask: generateDagFromTaskMock,
  DagGenerationError: class DagGenerationError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = "DagGenerationError";
      this.code = code;
    }
  },
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
    generateDagFromTaskMock.mockReset();
    runSubagentTaskMock.mockReset();
    runSubagentTaskMock.mockImplementation(async () => ({
      runRecord: { agentId: "researcher", status: "completed", summary: "ok", error: undefined },
      output: "done",
      prompt: "prompt",
      promptStackSummary: undefined,
      runtimeNotificationCount: 0,
    }));
    const subagentsModule = await import("../../../.pi/extensions/subagents.js");
    if (typeof subagentsModule.resetForTesting === "function") {
      subagentsModule.resetForTesting();
    }
  });

  it("plan も autoGenerate=true もない場合は auto DAG を始めない", async () => {
    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-auto-gate",
      {
        task: "Fix auth bug",
      },
      undefined,
      undefined,
      {
        cwd: "/tmp/subagents-dynamic",
        model: { id: "gpt-test", provider: "openai" },
      },
    );

    expect(generateDagFromTaskMock).not.toHaveBeenCalled();
    expect(result.details.error).toBe("plan_required");
    expect(result.content[0].text).toContain("autoGenerate=true");
  });

  it("parallel mode は明示依存がない限り自動で DAG へ昇格しない", async () => {
    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-parallel",
      {
        task: "Fix auth bug",
        subagentIds: ["researcher", "implementer"],
        extraContext: "Read the failing files and patch the bug.",
      },
      undefined,
      undefined,
      {
        cwd: "/tmp/subagents-dynamic",
        model: { id: "gpt-test", provider: "openai" },
      },
    );

    expect(generateDagFromTaskMock).not.toHaveBeenCalled();
    expect(executeDagMock).not.toHaveBeenCalled();
    expect(result.details.error).not.toBe("plan_required");
  });

  it("DAG 実行では root context を extraContext にだけ渡し、task 本文へ二重注入しない", async () => {
    executeDagMock.mockImplementation(async (plan, executor) => {
      const task = plan.tasks[0];
      await executor(task, "## Result from dep-task\nprevious finding");
      return {
        planId: plan.id,
        overallStatus: "completed",
        totalDurationMs: 1,
        completedTaskIds: [task.id],
        failedTaskIds: [],
        skippedTaskIds: [],
        taskResults: new Map([
          [task.id, { taskId: task.id, status: "completed", output: { output: "implemented" }, durationMs: 1 }],
        ]),
      };
    });

    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    await tool.execute(
      "tc-context",
      {
        task: "Fix auth bug",
        autoGenerate: false,
        enableAdaptOrch: false,
        extraContext: "Ticket context: reproduce first, then patch only the auth regression.",
        plan: {
          id: "explicit-dag",
          description: "explicit dag",
          tasks: [
            { id: "implement-auth", description: "Fix auth bug", assignedAgent: "implementer", dependencies: [] },
          ],
        },
      },
      undefined,
      undefined,
      {
        cwd: "/tmp/subagents-dynamic",
        model: { id: "gpt-test", provider: "openai" },
      },
    );

    expect(runSubagentTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      task: "Fix auth bug",
      extraContext: expect.stringContaining("## Shared Task Context"),
    }));
    expect(runSubagentTaskMock.mock.calls[0]?.[0]?.extraContext).toContain("Ticket context: reproduce first");
    expect(runSubagentTaskMock.mock.calls[0]?.[0]?.extraContext).toContain("## Result from dep-task");
    expect(runSubagentTaskMock.mock.calls[0]?.[0]?.task).not.toContain("## Context from Previous Tasks");
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

  it("dynamicImplement 指定時は legacy executeDag で implement fixup を差し込む", async () => {
    executeDagMock.mockImplementation(async (_plan, _executor, options) => {
      await options.onBatchSettled?.(
        {
          results: new Map([
            ["implement-core", { status: "completed", output: { output: "core done" } }],
            ["implement-gap-check", {
              status: "completed",
              output: {
                output: [
                  "DEEP_DIVE_FIXUP: yes",
                  "DEEP_DIVE_VERIFICATION: no",
                  "RATIONALE: one more fixup pass is needed",
                ].join("\n"),
              },
            }],
          ]),
          completedTaskIds: ["implement-gap-check"],
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
          completedTaskIds: ["implement-gap-check"],
          failedTaskIds: [],
          results: [],
        },
      );

      return {
        planId: "ul-implement-dynamic-dag",
        overallStatus: "completed",
        totalDurationMs: 1,
        completedTaskIds: ["implement-gap-check", "implement-synthesis"],
        failedTaskIds: [],
        skippedTaskIds: [],
        taskResults: new Map([
          ["implement-gap-check", { taskId: "implement-gap-check", status: "completed", output: { output: "gap done" }, durationMs: 1 }],
          ["implement-synthesis", { taskId: "implement-synthesis", status: "completed", output: { output: "implemented" }, durationMs: 1 }],
        ]),
      };
    });

    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-3",
      {
        task: "通知基盤を実装する",
        autoGenerate: false,
        plan: {
          id: "ul-implement-dynamic-dag",
          description: "dynamic implement",
          tasks: [
            { id: "implement-core", description: "core", assignedAgent: "implementer", dependencies: [] },
            { id: "implement-gap-check", description: "gap", assignedAgent: "implementer", dependencies: ["implement-core"] },
            { id: "implement-synthesis", description: "synthesis", assignedAgent: "implementer", dependencies: ["implement-gap-check"] },
          ],
        },
        dynamicImplement: {
          task: "通知基盤を実装する",
          gapTaskId: "implement-gap-check",
          synthesisTaskId: "implement-synthesis",
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
      id: "implement-deep-dive-fixup",
      assignedAgent: "implementer",
    }));
    expect(addDependencyMock).toHaveBeenCalledWith("implement-synthesis", "implement-deep-dive-fixup");
    expect(addInputContextMock).toHaveBeenCalledWith("implement-synthesis", "implement-deep-dive-fixup");
    expect(result.details.followupDecision).toEqual({
      needsFixupDeepDive: true,
      needsVerificationDeepDive: false,
      rationale: "one more fixup pass is needed",
    });
  });

  it("dynamicReview 指定時は legacy executeDag で review deep-dive を差し込む", async () => {
    executeDagMock.mockImplementation(async (_plan, _executor, options) => {
      await options.onBatchSettled?.(
        {
          results: new Map([
            ["review-readout", { status: "completed", output: { output: "readout" } }],
            ["review-gap-check", {
              status: "completed",
              output: {
                output: [
                  "DEEP_DIVE_RISK: yes",
                  "DEEP_DIVE_VERIFICATION: no",
                  "RATIONALE: security review needs more detail",
                ].join("\n"),
              },
            }],
          ]),
          completedTaskIds: ["review-gap-check"],
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
          completedTaskIds: ["review-gap-check"],
          failedTaskIds: [],
          results: [],
        },
      );

      return {
        planId: "ul-review-dynamic-dag",
        overallStatus: "completed",
        totalDurationMs: 1,
        completedTaskIds: ["review-gap-check", "review-synthesis"],
        failedTaskIds: [],
        skippedTaskIds: [],
        taskResults: new Map([
          ["review-gap-check", { taskId: "review-gap-check", status: "completed", output: { output: "gap done" }, durationMs: 1 }],
          ["review-synthesis", { taskId: "review-synthesis", status: "completed", output: { output: "# Review\n\nfinal doc" }, durationMs: 1 }],
        ]),
      };
    });

    const registerSubagentExtension = (await import("../../../.pi/extensions/subagents.js")).default;
    const pi = createFakePi();
    registerSubagentExtension(pi as any);

    const tool = pi.tools.get("subagent_run_dag");
    const result = await tool.execute(
      "tc-4",
      {
        task: "通知基盤をレビューする",
        autoGenerate: false,
        plan: {
          id: "ul-review-dynamic-dag",
          description: "dynamic review",
          tasks: [
            { id: "review-readout", description: "readout", assignedAgent: "reviewer", dependencies: [] },
            { id: "review-gap-check", description: "gap", assignedAgent: "reviewer", dependencies: ["review-readout"] },
            { id: "review-synthesis", description: "synthesis", assignedAgent: "reviewer", dependencies: ["review-gap-check"] },
          ],
        },
        dynamicReview: {
          task: "通知基盤をレビューする",
          gapTaskId: "review-gap-check",
          synthesisTaskId: "review-synthesis",
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
      id: "review-deep-dive-risk",
      assignedAgent: "reviewer",
    }));
    expect(addDependencyMock).toHaveBeenCalledWith("review-synthesis", "review-deep-dive-risk");
    expect(addInputContextMock).toHaveBeenCalledWith("review-synthesis", "review-deep-dive-risk");
    expect(result.details.followupDecision).toEqual({
      needsRiskDeepDive: true,
      needsVerificationDeepDive: false,
      rationale: "security review needs more detail",
    });
  });
});
