/**
 * @file .pi/lib/agent/turn-context-builder.ts の単体テスト
 * @description TurnExecutionContext の構築と整形を検証する
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
  applyModeToTools: vi.fn((toolNames: string[], mode: string) =>
    mode === "plan" ? toolNames.filter((toolName) => toolName !== "edit") : toolNames,
  ),
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
  buildTurnExecutionRuntimeSection,
  deriveTurnExecutionDecisions,
  formatTurnExecutionContextBlock,
} from "../../../.pi/lib/agent/turn-context-builder.js";

describe("turn-context-builder", () => {
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
      lastSuccessfulCommandByTool: { bash: "npm test" },
      detectedAtMs: 123,
    });
    mocks.formatForPrompt.mockReturnValue("# Runtime Environment Cache\nrepo_root=/repo");
    mocks.buildPromptHints.mockReturnValue(["Slow tool: bash took 2500ms"]);
    mocks.getAllDynamicTools.mockReturnValue([{ name: "repo_summary" }, { name: "git_probe" }]);
    mocks.loadAutonomyPolicyConfig.mockReturnValue({
      enabled: true,
      profile: "high",
      mode: "plan",
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

  it("workspace root を基準に policy と active tools を解決する", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo/packages/app",
      availableToolNames: ["read", "edit", "plan_create"],
      startupKind: "baseline",
      isFirstTurn: true,
      previousContextAvailable: false,
      sessionElapsedMs: 12,
    });

    expect(mocks.loadAutonomyPolicyConfig).toHaveBeenCalledWith("/repo");
    expect(context.workspace.workspaceRoot).toBe("/repo");
    expect(context.tools.activeToolNames).toEqual(["plan_create", "read"]);
    expect(context.tools.dynamicToolNames).toEqual(["git_probe", "repo_summary"]);
  });

  it("turn context block にターン判断の主要信号を出す", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo",
      collaborationMode: "default",
      sandboxPolicy: "workspace-write",
      networkPolicy: "restricted",
      availableToolNames: ["read", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 2500,
    });

    const block = formatTurnExecutionContextBlock(context);

    expect(block).toContain("# Turn Execution Context");
    expect(block).toContain("cwd=/repo");
    expect(block).toContain("sandbox_policy=workspace-write");
    expect(block).toContain("autonomy_mode=plan");
    expect(block).toContain("startup_kind=delta");
  });

  it("runtime section に環境キャッシュと直近ヒントを載せる", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["read"],
      startupKind: "baseline",
      isFirstTurn: true,
      previousContextAvailable: false,
      sessionElapsedMs: 100,
    });

    const section = buildTurnExecutionRuntimeSection(context);

    expect(section).toContain("respect_cwd_as_workspace_anchor=true");
    expect(section).toContain("# Runtime Environment Cache");
    expect(section).toContain("# Recent Runtime Hints");
    expect(section).toContain("Slow tool: bash took 2500ms");
    expect(section).toContain("preferred_subagents=implementer,tester,reviewer");
    expect(section).toContain("max_loop_iterations=2");
    expect(section).toContain("max_parallel_subagents=1");
    expect(section).toContain("retry_max_retries=1");
  });

  it("plan mode では command と search 拡張を抑制し retry も縮小する", () => {
    const context = buildTurnExecutionContext({
      cwd: "/repo",
      availableToolNames: ["file_candidates", "code_search", "edit"],
      startupKind: "delta",
      isFirstTurn: false,
      previousContextAvailable: true,
      sessionElapsedMs: 500,
    });

    const decisions = deriveTurnExecutionDecisions(context, {
      taskKind: "research",
      wantsCommandExecution: true,
    });

    expect(decisions.allowCommandExecution).toBe(false);
    expect(decisions.allowSearchExtensions).toBe(false);
    expect(decisions.allowSubtaskDelegation).toBe(false);
    expect(decisions.preferredSubagentIds).toEqual(["researcher", "architect", "reviewer"]);
    expect(decisions.maxLoopIterations).toBe(2);
    expect(decisions.maxParallelSubagents).toBe(1);
    expect(decisions.retryOverrides.maxRetries).toBe(0);
  });
});
