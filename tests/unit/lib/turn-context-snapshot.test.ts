/**
 * @file .pi/lib/agent/turn-context-snapshot.ts の単体テスト
 * @description TurnExecutionContext の snapshot 化を検証する
 * @testFramework vitest
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadAutonomyPolicyConfig: vi.fn(),
  getSnapshot: vi.fn(),
  formatForPrompt: vi.fn(),
  buildPromptHints: vi.fn(),
  getAllDynamicTools: vi.fn(),
}));

vi.mock("../../../.pi/lib/autonomy-policy.js", () => ({
  applyModeToTools: vi.fn((toolNames: string[]) => toolNames),
  loadAutonomyPolicyConfig: mocks.loadAutonomyPolicyConfig,
}));

vi.mock("../../../.pi/lib/runtime-environment-cache.js", () => ({
  getRuntimeEnvironmentCache: vi.fn(() => ({
    getSnapshot: mocks.getSnapshot,
    formatForPrompt: mocks.formatForPrompt,
  })),
}));

vi.mock("../../../.pi/lib/tool-telemetry-store.js", () => ({
  getToolTelemetryStore: vi.fn(() => ({
    buildPromptHints: mocks.buildPromptHints,
  })),
}));

vi.mock("../../../.pi/lib/dynamic-tools/registry.js", () => ({
  DynamicToolRegistry: vi.fn(() => ({
    getAll: mocks.getAllDynamicTools,
  })),
}));

import {
  buildTurnExecutionContext,
  deriveTurnExecutionDecisions,
} from "../../../.pi/lib/agent/turn-context-builder.js";
import {
  applyReplayToolConstraints,
  applyReplayDecisionConstraints,
  createTurnExecutionSnapshot,
} from "../../../.pi/lib/agent/turn-context-snapshot.js";

describe("turn-context-snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSnapshot.mockReturnValue({
      repoRoot: "/repo",
      gitBranch: "main",
      packageManager: "npm",
      testFramework: "vitest",
      mainLanguage: "typescript",
      buildSystem: "package-scripts",
      largeDirectoriesToAvoid: ["node_modules", "dist"],
      frequentFiles: ["README.md", "package.json"],
      lastSuccessfulCommandByTool: {},
      detectedAtMs: 123,
    });
    mocks.formatForPrompt.mockReturnValue("# Runtime Environment Cache\nrepo_root=/repo");
    mocks.buildPromptHints.mockReturnValue(["Slow tool: bash took 2500ms"]);
    mocks.getAllDynamicTools.mockReturnValue([{ name: "repo_summary" }]);
    mocks.loadAutonomyPolicyConfig.mockReturnValue({
      enabled: true,
      profile: "high",
      mode: "build",
      gatekeeper: "deterministic",
      permissions: {
        read: "allow",
        write: "allow",
        command: "allow",
        browser: "allow",
        mcp: "allow",
        mode_switch: "allow",
        subtasks: "allow",
        follow_up: "allow",
        todo: "allow",
      },
      updatedAt: "2026-03-07T00:00:00.000Z",
    });
  });

  it("再現に必要な workspace policy tools decisions を保持する", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo/packages/app",
      availableToolNames: ["read", "code_search", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 120,
    });
    const decisions = deriveTurnExecutionDecisions(context, {
      taskKind: "research",
      wantsCommandExecution: true,
    });

    const snapshot = createTurnExecutionSnapshot(context, decisions);

    expect(snapshot.workspace.cwd).toBe("/repo/packages/app");
    expect(snapshot.workspace.workspaceRoot).toBe("/repo");
    expect(snapshot.policy.mode).toBe("build");
    expect(snapshot.tools.activeToolNames).toEqual(["code_search", "edit", "read"]);
    expect(snapshot.decisions?.allowSearchExtensions).toBe(true);
    expect(snapshot.decisions?.allowSubtaskDelegation).toBe(true);
    expect(snapshot.decisions?.preferredSubagentIds).toEqual(["researcher", "architect", "reviewer"]);
    expect(snapshot.decisions?.maxLoopIterations).toBe(6);
    expect(snapshot.decisions?.maxParallelSubagents).toBe(4);
    expect(snapshot.decisions?.retryOverrides.maxRetries).toBe(4);
  });

  it("replay 時は snapshot decision を上限として現在 decision を締める", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo/packages/app",
      availableToolNames: ["read", "code_search", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 120,
    });
    const current = deriveTurnExecutionDecisions(context, {
      taskKind: "implementation",
      wantsCommandExecution: true,
      taskText: "Implement parser fixes",
    });
    const constrained = applyReplayDecisionConstraints(current, {
      capturedAt: "2026-03-07T00:00:00.000Z",
      workspace: { cwd: "/repo/packages/app", workspaceRoot: "/repo" },
      policy: { profile: "balanced", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
      tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
      continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 120 },
      runtimeEnvironment: { repoRoot: "/repo", frequentFiles: [], largeDirectoriesToAvoid: [] },
      runtimeHints: [],
      decisions: {
        allowCommandExecution: false,
        allowSearchExtensions: false,
        allowSubtaskDelegation: true,
        preferredSubagentIds: ["tester", "reviewer"],
        maxLoopIterations: 2,
        maxParallelSubagents: 1,
        retryOverrides: { maxRetries: 1, initialDelayMs: 400, maxDelayMs: 1200 },
      },
    });

    expect(constrained.allowCommandExecution).toBe(false);
    expect(constrained.preferredSubagentIds).toEqual(["tester", "reviewer"]);
    expect(constrained.maxLoopIterations).toBe(2);
    expect(constrained.maxParallelSubagents).toBe(1);
    expect(constrained.retryOverrides.maxRetries).toBe(1);
  });

  it("replay 時は snapshot の active tools に合わせて tool exposure を縮める", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo/packages/app",
      availableToolNames: ["read", "code_search", "edit"],
      activeToolNames: ["read", "code_search", "edit"],
      dynamicToolNames: ["repo_summary", "git_probe"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 120,
    });

    const constrained = applyReplayToolConstraints(context, {
      capturedAt: "2026-03-07T00:00:00.000Z",
      workspace: { cwd: "/repo/packages/app", workspaceRoot: "/repo" },
      policy: { profile: "balanced", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
      tools: {
        availableToolNames: ["read", "edit"],
        activeToolNames: ["read"],
        dynamicToolNames: ["repo_summary"],
      },
      continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 120 },
      runtimeEnvironment: { repoRoot: "/repo", frequentFiles: [], largeDirectoriesToAvoid: [] },
      runtimeHints: [],
    });

    expect(constrained.tools.availableToolNames).toEqual(["edit", "read"]);
    expect(constrained.tools.activeToolNames).toEqual(["read"]);
    expect(constrained.tools.dynamicToolNames).toEqual(["repo_summary"]);
  });
});
