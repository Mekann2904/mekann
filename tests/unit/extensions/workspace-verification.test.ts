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
    requireProofReview: true,
    requireReviewArtifact: false,
    autoRequireReviewArtifact: true,
    requireReplanOnRepeatedFailure: true,
    enableEvalCorpus: true,
    checkpointOnMutation: true,
    checkpointOnFailure: true,
    antiLoopThreshold: 3,
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
    recommendedSteps: ["lint", "typecheck", "test", "runtime", "ui"],
    reasons: ["UI or browser-facing change detected"],
    proofArtifacts: ["verification summary", "step logs", "browser evidence", "review notes"],
    sources: ["/repo/AGENTS.md"],
  },
  state: {
    dirty: false,
    running: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: 0,
    lastWriteAt: undefined,
    lastWriteTool: undefined,
    lastVerifiedAt: undefined,
    lastReviewedAt: undefined,
    lastReviewedArtifactDir: undefined,
    lastReviewArtifactAt: undefined,
    lastReviewArtifactPath: undefined,
    lastReviewDecision: undefined,
    lastReviewRationale: undefined,
    lastReplanAt: undefined,
    lastRepairStrategy: undefined,
    lastMutationCheckpointId: undefined,
    lastFailureCheckpointId: undefined,
    lastFailureFingerprint: undefined,
    replanReason: undefined,
    lastEvalCasePath: undefined,
    continuityPath: undefined,
    lastRun: undefined,
  },
  runCalls: [] as Array<{ trigger: string; steps?: string[] }>,
  checkpoints: [] as Array<{ priority: string; metadata?: Record<string, unknown>; state?: Record<string, unknown> }>,
  trajectoryEvents: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../.pi/lib/workspace-verification.js", () => ({
  acknowledgeReplanDecision: vi.fn(({ strategy }) => {
    mockApi.state = {
      ...mockApi.state,
      replanRequired: false,
      replanReason: undefined,
      lastReplanAt: "2026-03-07T00:06:00.000Z",
      lastRepairStrategy: strategy,
    };
    return mockApi.state;
  }),
  acknowledgeReviewArtifact: vi.fn(({ path }) => {
    mockApi.state = {
      ...mockApi.state,
      pendingReviewArtifact: false,
      lastReviewArtifactAt: "2026-03-07T00:07:00.000Z",
      lastReviewArtifactPath: path ?? mockApi.state.lastReviewArtifactPath,
      lastReviewDecision: "accept",
      lastReviewRationale: "Reviewed manually",
    };
    return mockApi.state;
  }),
  createWorkspaceVerificationConfig: vi.fn(() => mockApi.config),
  loadWorkspaceVerificationConfig: vi.fn(() => mockApi.config),
  loadWorkspaceVerificationState: vi.fn(() => mockApi.state),
  resolveWorkspaceVerificationPlan: vi.fn(() => mockApi.resolvedPlan),
  shouldRequireReviewArtifact: vi.fn((config, resolvedPlan) => Boolean(
    config.requireReviewArtifact
    || (config.autoRequireReviewArtifact && resolvedPlan?.proofArtifacts?.includes("review notes"))
  )),
  acknowledgeVerificationArtifacts: vi.fn(({ artifactDir }) => {
    mockApi.state = {
      ...mockApi.state,
      pendingProofReview: false,
      lastReviewedAt: "2026-03-07T00:05:00.000Z",
      lastReviewedArtifactDir: artifactDir ?? mockApi.state.lastRun?.artifactDir,
    };
    return mockApi.state;
  }),
  appendWorkspaceVerificationTrajectoryEvent: vi.fn(({ entry }) => {
    mockApi.trajectoryEvents.push(entry);
    return {
      path: "/repo/.pi/workspace-verification/trajectory.json",
      entries: mockApi.trajectoryEvents,
    };
  }),
  createWorkspaceVerificationReplayInput: vi.fn((_cwd, state, resolvedPlan) => ({
    summary: {
      profile: resolvedPlan?.profile,
      currentStep: "Repair UI",
      nextSuggestedAction: "Run workspace_verify against the relevant verification steps.",
      resumePhase: "verification",
      resumeStep: "test",
      artifactDir: state.lastRun?.artifactDir,
      continuityPath: state.continuityPath,
      trajectoryPath: "/repo/.pi/workspace-verification/trajectory.json",
    },
    plan: {
      currentStep: "Repair UI",
      acceptanceCriteria: [],
      fileModuleImpact: [],
      testVerification: [],
      recentProgress: [],
    },
    state,
    resolvedPlan,
    trajectory: mockApi.trajectoryEvents,
  })),
  resolveWorkspaceVerificationResumePlan: vi.fn((state) => ({
    phase: state.replanRequired
      ? "replan"
      : state.pendingReviewArtifact
        ? "review"
        : state.pendingProofReview
          ? "proof_review"
          : state.dirty
            ? "verification"
            : "clear",
    requestedSteps: state.dirty ? ["test"] : [],
    reason: state.dirty ? "Resume verification from the failed step: test." : "Workspace verification is clear.",
    resumeStep: state.dirty ? "test" : undefined,
  })),
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
      pendingProofReview: false,
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
      pendingProofReview: Boolean(run.success && run.artifactDir),
      pendingReviewArtifact: Boolean(
        run.success
        && (mockApi.config.requireReviewArtifact || (mockApi.config.autoRequireReviewArtifact && run.resolvedPlan?.proofArtifacts?.includes("review notes")))
      ),
      replanRequired: Boolean(!run.success && mockApi.state.repeatedFailureCount + 1 >= mockApi.config.antiLoopThreshold),
      repeatedFailureCount: run.success ? 0 : mockApi.state.repeatedFailureCount + 1,
      lastVerifiedAt: run.success ? run.finishedAt : mockApi.state.lastVerifiedAt,
      lastReviewedAt: run.success ? undefined : mockApi.state.lastReviewedAt,
      lastReviewedArtifactDir: run.success ? undefined : mockApi.state.lastReviewedArtifactDir,
      lastReviewArtifactAt: run.success ? undefined : mockApi.state.lastReviewArtifactAt,
      lastEvalCasePath: run.success ? mockApi.state.lastEvalCasePath : "/repo/.pi/evals/workspace-verification/case.json",
      replanReason: !run.success && mockApi.state.repeatedFailureCount + 1 >= mockApi.config.antiLoopThreshold
        ? "Repeated verification failure"
        : undefined,
      lastRun: run,
    };
    return mockApi.state;
  }),
  persistWorkspaceVerificationContinuityPack: vi.fn(() => "/repo/.pi/workspace-verification/continuity.json"),
  persistWorkspaceReviewArtifact: vi.fn(() => ({
    path: "/repo/.pi/workspace-verification/reviews/latest-review.md",
    review: {
      findings: {
        bugs: [],
        security: [],
        regression: [],
        testGaps: [],
        rollback: [],
      },
      severity: {
        highest: "high",
        requiresExplicitDecision: true,
        blockingCategories: ["security"],
        summary: ["Security-sensitive surface changed."],
      },
    },
  })),
  shouldAutoRunVerification: vi.fn(() => mockApi.state.dirty && !mockApi.state.running),
  saveWorkspaceVerificationState: vi.fn((_cwd, next) => {
    mockApi.state = next;
    return mockApi.state;
  }),
  isCompletionBlocked: vi.fn((config, state) => Boolean(
    state.dirty
    || (config.requireProofReview && state.pendingProofReview)
    || ((config.requireReviewArtifact || config.autoRequireReviewArtifact) && state.pendingReviewArtifact)
    || (config.requireReplanOnRepeatedFailure && state.replanRequired)
  )),
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
  formatWorkspaceVerificationTrajectory: vi.fn(() => "trajectory"),
  parseWorkspaceCommand: vi.fn((command: string) => ({
    executable: command.split(/\s+/)[0],
    args: command.split(/\s+/).slice(1),
  })),
}));

vi.mock("../../../.pi/lib/checkpoint-manager.js", () => ({
  getCheckpointManager: vi.fn(() => ({
    save: vi.fn(async (payload) => {
      mockApi.checkpoints.push(payload);
      return { success: true, checkpointId: `cp-${mockApi.checkpoints.length}` };
    }),
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
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: 0,
    lastWriteAt: undefined,
    lastWriteTool: undefined,
    lastVerifiedAt: undefined,
    lastReviewedAt: undefined,
    lastReviewedArtifactDir: undefined,
    lastReviewArtifactAt: undefined,
    lastReviewArtifactPath: undefined,
    lastReviewDecision: undefined,
    lastReviewRationale: undefined,
    lastReplanAt: undefined,
    lastRepairStrategy: undefined,
    lastMutationCheckpointId: undefined,
    lastFailureCheckpointId: undefined,
    lastFailureFingerprint: undefined,
    replanReason: undefined,
    lastEvalCasePath: undefined,
    continuityPath: undefined,
    lastRun: undefined,
  };
  mockApi.checkpoints = [];
  mockApi.trajectoryEvents = [];

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
      "workspace_verify_trajectory",
      "workspace_verify_replay",
      "workspace_verify_plan",
      "workspace_verify_ack",
      "workspace_verify_review",
      "workspace_verify_review_ack",
      "workspace_verify_replan",
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
    expect(mockApi.state.lastMutationCheckpointId).toBe("cp-1");
    expect(mockApi.checkpoints[0]?.metadata?.kind).toBe("mutation");
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

  it("blocks task completion until proof artifacts are acknowledged", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.pendingProofReview = true;

    const handler = mockApi.handlers.get("tool_call");
    const result = await handler?.(
      { toolName: "task_complete", input: {} },
      { cwd: "/repo" },
    );

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("workspace_verify_ack");
  });

  it("blocks completion until review artifact is acknowledged", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.pendingReviewArtifact = true;

    const handler = mockApi.handlers.get("tool_call");
    const result = await handler?.(
      { toolName: "task_complete", input: {} },
      { cwd: "/repo" },
    );

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("workspace_verify_review");
  });

  it("blocks further mutations when replanning is required", async () => {
    const extension = (await import("../../../.pi/extensions/workspace-verification.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.replanRequired = true;
    mockApi.state.replanReason = "Repeated verification failure";

    const handler = mockApi.handlers.get("tool_call");
    const result = await handler?.(
      { toolName: "edit", input: {} },
      { cwd: "/repo" },
    );

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("workspace_verify_replan");
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

  it("saves a failure checkpoint when verification fails", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.config = {
      ...mockApi.config,
      checkpointOnFailure: true,
      antiLoopThreshold: 1,
    };

    const workspaceCommandModule = await import("../../../.pi/lib/workspace-verification.js");
    vi.mocked(workspaceCommandModule.runWorkspaceCommand).mockResolvedValueOnce({
      command: "npm run lint",
      success: false,
      exitCode: 1,
      timedOut: false,
      durationMs: 25,
      stdout: "",
      stderr: "lint failed",
      error: "lint failed",
    });

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify");
    const result = await tool?.execute("tool-1", { trigger: "manual", steps: ["lint"] }, undefined, undefined, {
      cwd: "/repo",
      ui: {
        notify: (message: string, level: string) => mockApi.notifications.push({ message, level }),
      },
    });

    expect(result?.details.success).toBe(false);
    expect(mockApi.state.lastFailureCheckpointId).toBe("cp-1");
    expect(mockApi.state.replanRequired).toBe(true);
    expect(mockApi.checkpoints[0]?.metadata?.kind).toBe("verification-failure");
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

  it("shows the workspace verification trajectory", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify_trajectory");
    const result = await tool?.execute("tool-1", {}, undefined, undefined, { cwd: "/repo" });

    expect(result?.content[0]?.text).toContain("trajectory");
  });

  it("replays verification from the durable resume point", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.dirty = true;

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify_replay");
    const result = await tool?.execute("tool-1", {}, undefined, undefined, {
      cwd: "/repo",
      ui: {
        notify: (message: string, level: string) => mockApi.notifications.push({ message, level }),
      },
    });

    expect(mockApi.state.lastRun?.success).toBe(true);
    expect(result?.content[0]?.text).toContain("resume_reason");
  });

  it("acknowledges the latest proof artifacts", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.pendingProofReview = true;
    mockApi.state.lastRun = {
      trigger: "manual",
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:00:10.000Z",
      success: true,
      artifactDir: "/repo/.pi/verification-runs/latest",
      resolvedPlan: mockApi.resolvedPlan,
      stepResults: [],
    };

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify_ack");
    const result = await tool?.execute("tool-1", {}, undefined, undefined, { cwd: "/repo" });

    expect(mockApi.state.pendingProofReview).toBe(false);
    expect(result?.content[0]?.text).toContain("/repo/.pi/verification-runs/latest");
  });

  it("acknowledges a new repair strategy after repeated failures", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.replanRequired = true;
    mockApi.state.replanReason = "Repeated verification failure";

    const tool = mockApi.tools.find((item) => item.name === "workspace_verify_replan");
    const result = await tool?.execute(
      "tool-1",
      { strategy: "lint 対象を絞ってから test を再実行する" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockApi.state.replanRequired).toBe(false);
    expect(mockApi.state.lastRepairStrategy).toContain("lint");
    expect(result?.content[0]?.text).toContain("Replan acknowledged");
  });

  it("generates and acknowledges a review artifact", async () => {
    const extensionModule = await import("../../../.pi/extensions/workspace-verification.js");
    const extension = extensionModule.default;
    const pi = createPiMock();
    extension(pi as never);

    mockApi.state.lastRun = {
      trigger: "manual",
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:00:10.000Z",
      success: true,
      artifactDir: "/repo/.pi/verification-runs/latest",
      resolvedPlan: mockApi.resolvedPlan,
      stepResults: [],
    };

    const reviewTool = mockApi.tools.find((item) => item.name === "workspace_verify_review");
    const reviewResult = await reviewTool?.execute("tool-1", {}, undefined, undefined, { cwd: "/repo" });

    expect(mockApi.state.pendingReviewArtifact).toBe(true);
    expect(reviewResult?.content[0]?.text).toContain("Review artifact generated");

    const ackTool = mockApi.tools.find((item) => item.name === "workspace_verify_review_ack");
    const ackResult = await ackTool?.execute("tool-1", {
      decision: "accept",
      rationale: "Manual security review completed",
    }, undefined, undefined, { cwd: "/repo" });

    expect(mockApi.state.pendingReviewArtifact).toBe(false);
    expect(ackResult?.content[0]?.text).toContain("Review artifact acknowledged");
    expect(mockApi.state.lastReviewDecision).toBe("accept");
  });
});
