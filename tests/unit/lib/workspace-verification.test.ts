/**
 * path: tests/unit/lib/workspace-verification.test.ts
 * role: workspace-verification ライブラリの状態管理とコマンド解析を検証する
 * why: dirty 判定と自動実行条件の退行を防ぐため
 * related: .pi/lib/workspace-verification.ts, .pi/lib/storage/state-keys.ts, tests/unit/extensions/workspace-verification.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  planStorage: {
    plans: [] as Array<Record<string, unknown>>,
    currentPlanId: undefined as string | undefined,
  },
}));

vi.mock("../../../.pi/lib/storage/sqlite-state-store.js", () => ({
  readJsonState: vi.fn(({ stateKey, createDefault }) => {
    if (!mockState.storage.has(stateKey)) {
      mockState.storage.set(stateKey, createDefault());
    }
    return mockState.storage.get(stateKey);
  }),
  writeJsonState: vi.fn(({ stateKey, value }) => {
    mockState.storage.set(stateKey, value);
  }),
}));

vi.mock("../../../.pi/lib/storage/storage-lock.js", () => ({
  withFileLock: vi.fn((_target: string, fn: () => unknown) => fn()),
}));

vi.mock("../../../.pi/lib/storage/task-plan-store.js", () => ({
  loadPlanStorage: vi.fn(() => mockState.planStorage),
  savePlanStorage: vi.fn((storage) => {
    mockState.planStorage = storage;
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => mockState.files.has(path) || mockState.dirs.has(path)),
  mkdirSync: vi.fn((path: string) => {
    mockState.dirs.add(path);
  }),
  readFileSync: vi.fn((path: string) => mockState.files.get(path) ?? ""),
  readdirSync: vi.fn((path: string) => {
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const file of mockState.files.keys()) {
      if (file.startsWith(prefix)) {
        names.add(file.slice(prefix.length).split("/")[0] ?? "");
      }
    }
    return [...names];
  }),
  statSync: vi.fn(() => ({
    mtimeMs: Date.now(),
    isDirectory: () => true,
  })),
  rmSync: vi.fn(),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockState.files.set(path, content);
  }),
}));

describe("workspace-verification library", () => {
  beforeEach(() => {
    mockState.storage.clear();
    mockState.files.clear();
    mockState.dirs.clear();
    mockState.planStorage = {
      plans: [],
      currentPlanId: undefined,
    };
    vi.restoreAllMocks();
  });

  it("parses quoted commands", async () => {
    const { parseWorkspaceCommand } = await import("../../../.pi/lib/workspace-verification.js");
    const parsed = parseWorkspaceCommand('npm run test -- --grep "api smoke"');

    expect(parsed.executable).toBe("npm");
    expect(parsed.args).toEqual(["run", "test", "--", "--grep", "api smoke"]);
  });

  it("rejects shell operators", async () => {
    const { parseWorkspaceCommand } = await import("../../../.pi/lib/workspace-verification.js");
    const parsed = parseWorkspaceCommand("npm test && npm run lint");

    expect(parsed.error).toContain("shell operators");
  });

  it("marks workspace dirty and clears it after successful verification", async () => {
    const {
      markWorkspaceDirty,
      loadWorkspaceVerificationState,
      finalizeVerificationRun,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const dirtyState = markWorkspaceDirty({ cwd: "/repo", toolName: "edit" });
    expect(dirtyState.dirty).toBe(true);
    expect(dirtyState.lastWriteTool).toBe("edit");

    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        trigger: "manual",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: true,
        artifactDir: "/repo/.pi/verification-runs/latest",
        stepResults: [],
      },
    });

    const finalState = loadWorkspaceVerificationState("/repo");
    expect(finalState.dirty).toBe(false);
    expect(finalState.pendingProofReview).toBe(true);
    expect(finalState.lastVerifiedAt).toBe("2026-03-07T00:00:10.000Z");
  });

  it("requires proof review after a successful verification until artifacts are acknowledged", async () => {
    const {
      createWorkspaceVerificationConfig,
      finalizeVerificationRun,
      acknowledgeVerificationArtifacts,
      isCompletionBlocked,
      loadWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const config = createWorkspaceVerificationConfig();

    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        trigger: "manual",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: true,
        artifactDir: "/repo/.pi/verification-runs/latest",
        resolvedPlan: {
          profile: "library",
          commands: {},
          runtime: {
            enabled: false,
            command: "",
            label: "workspace-dev-server",
            startupTimeoutMs: 1000,
            keepAliveOnShutdown: true,
          },
          ui: {
            enabled: false,
            timeoutMs: 1000,
            commands: [],
          },
          acceptanceCriteria: [],
          validationCommands: [],
          recommendedSteps: ["lint", "typecheck", "test"],
          reasons: [],
          proofArtifacts: ["verification summary"],
          sources: [],
        },
        stepResults: [],
      },
    });

    let state = loadWorkspaceVerificationState("/repo");
    expect(state.pendingProofReview).toBe(true);
    expect(isCompletionBlocked(config, state)).toBe(true);

    acknowledgeVerificationArtifacts({ cwd: "/repo" });

    state = loadWorkspaceVerificationState("/repo");
    expect(state.pendingProofReview).toBe(false);
    expect(state.lastReviewedArtifactDir).toBe("/repo/.pi/verification-runs/latest");
    expect(isCompletionBlocked(config, state)).toBe(false);
  });

  it("auto-requires a review artifact for risky verification plans", async () => {
    const {
      createWorkspaceVerificationConfig,
      shouldRequireReviewArtifact,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const config = createWorkspaceVerificationConfig();

    expect(shouldRequireReviewArtifact(config, {
      profile: "backend",
      commands: {},
      runtime: {
        enabled: false,
        command: "",
        label: "workspace-dev-server",
        startupTimeoutMs: 1000,
        keepAliveOnShutdown: true,
      },
      ui: {
        enabled: false,
        timeoutMs: 1000,
        commands: [],
      },
      acceptanceCriteria: [],
      validationCommands: [],
      recommendedSteps: ["lint", "typecheck", "test"],
      reasons: ["Build or packaging impact detected"],
      proofArtifacts: ["verification summary", "review notes"],
      sources: [],
    })).toBe(true);

    expect(shouldRequireReviewArtifact({
      ...config,
      autoRequireReviewArtifact: false,
    }, {
      profile: "library",
      commands: {},
      runtime: {
        enabled: false,
        command: "",
        label: "workspace-dev-server",
        startupTimeoutMs: 1000,
        keepAliveOnShutdown: true,
      },
      ui: {
        enabled: false,
        timeoutMs: 1000,
        commands: [],
      },
      acceptanceCriteria: [],
      validationCommands: [],
      recommendedSteps: ["lint"],
      reasons: [],
      proofArtifacts: ["verification summary", "review notes"],
      sources: [],
    })).toBe(false);
  });

  it("requires replanning after repeated identical failures and records an eval case", async () => {
    const {
      createWorkspaceVerificationConfig,
      finalizeVerificationRun,
      loadWorkspaceVerificationState,
      isCompletionBlocked,
      acknowledgeReplanDecision,
    } = await import("../../../.pi/lib/workspace-verification.js");

    mockState.planStorage = {
      currentPlanId: "plan-1",
      plans: [{
        id: "plan-1",
        name: "Repair failing lint",
        status: "active",
        progressLog: [],
      }],
    };

    const config = createWorkspaceVerificationConfig();
    const failedRun = {
      trigger: "manual" as const,
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:00:10.000Z",
      success: false,
      artifactDir: "/repo/.pi/verification-runs/latest",
      resolvedPlan: {
        profile: "web-app" as const,
        commands: { lint: "npm run lint" },
        runtime: {
          enabled: false,
          command: "",
          label: "workspace-dev-server",
          startupTimeoutMs: 1000,
          keepAliveOnShutdown: true,
        },
        ui: {
          enabled: false,
          timeoutMs: 1000,
          commands: [],
        },
        acceptanceCriteria: ["lint が通ること"],
        validationCommands: ["npm run lint"],
        recommendedSteps: ["lint"],
        reasons: ["Behavioral regression risk detected"],
        proofArtifacts: ["verification summary"],
        sources: [],
      },
      stepResults: [{
        step: "lint" as const,
        success: false,
        skipped: false,
        durationMs: 10,
        command: "npm run lint",
        stderr: "lint failed in /repo/src/app.ts",
        error: "lint failed in /repo/src/app.ts",
      }],
    };

    finalizeVerificationRun({ cwd: "/repo", run: failedRun });
    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        ...failedRun,
        finishedAt: "2026-03-07T00:00:20.000Z",
      },
    });
    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        ...failedRun,
        finishedAt: "2026-03-07T00:00:30.000Z",
      },
    });

    let state = loadWorkspaceVerificationState("/repo");
    expect(state.replanRequired).toBe(true);
    expect(state.repeatedFailureCount).toBe(3);
    expect(state.lastEvalCasePath).toContain(".pi/evals/workspace-verification");
    expect(isCompletionBlocked(config, state)).toBe(true);

    acknowledgeReplanDecision({ cwd: "/repo", strategy: "lint 対象を src/app.ts に絞って修正する" });

    state = loadWorkspaceVerificationState("/repo");
    expect(state.replanRequired).toBe(false);
    expect(state.lastRepairStrategy).toContain("src/app.ts");
    expect(Array.isArray(mockState.planStorage.plans[0]?.progressLog)).toBe(true);
    expect(String(mockState.planStorage.plans[0]?.progressLog?.[0])).toContain("Replan strategy recorded");
  });

  it("persists a structured review artifact and can acknowledge it", async () => {
    const {
      persistWorkspaceReviewArtifact,
      acknowledgeReviewArtifact,
      loadWorkspaceVerificationState,
      saveWorkspaceVerificationState,
      createWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    mockState.planStorage = {
      currentPlanId: "plan-1",
      plans: [{
        id: "plan-1",
        name: "Review scope",
        status: "active",
        acceptanceCriteria: ["test が通ること"],
        fileModuleImpact: ["src/auth.ts"],
        testVerification: ["npm test"],
        progressLog: ["2026-03-07T00:00:00.000Z planner: Started"],
      }],
    };

    const artifact = persistWorkspaceReviewArtifact({
      cwd: "/repo",
      run: {
        trigger: "manual",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: true,
        artifactDir: "/repo/.pi/verification-runs/latest",
        resolvedPlan: {
          profile: "backend",
          commands: {},
          runtime: {
            enabled: false,
            command: "",
            label: "workspace-dev-server",
            startupTimeoutMs: 1000,
            keepAliveOnShutdown: true,
          },
          ui: {
            enabled: false,
            timeoutMs: 1000,
            commands: [],
          },
          acceptanceCriteria: ["auth が壊れていないこと"],
          validationCommands: ["npm test"],
          recommendedSteps: ["test"],
          reasons: [],
          proofArtifacts: ["verification summary"],
          sources: [],
        },
        stepResults: [{
          step: "test",
          success: true,
          skipped: false,
          durationMs: 10,
          command: "npm test",
        }],
      },
    });

    expect(artifact.path).toContain(".pi/workspace-verification/reviews/");
    expect(mockState.files.get(artifact.path)).toContain("security");
    expect(artifact.review.severity.highest).toBe("high");

    saveWorkspaceVerificationState("/repo", {
      ...createWorkspaceVerificationState(),
      pendingReviewArtifact: true,
      lastReviewArtifactPath: artifact.path,
    });

    const acknowledged = acknowledgeReviewArtifact({
      cwd: "/repo",
      decision: "accept",
      rationale: "Security-sensitive scope was manually reviewed.",
    });
    expect(acknowledged.pendingReviewArtifact).toBe(false);
    expect(acknowledged.lastReviewArtifactPath).toBe(artifact.path);
    expect(acknowledged.lastReviewDecision).toBe("accept");

    const state = loadWorkspaceVerificationState("/repo");
    expect(state.lastReviewArtifactAt).toBeDefined();
  });

  it("requires explicit rationale for high-severity review artifacts", async () => {
    const {
      persistWorkspaceReviewArtifact,
      acknowledgeReviewArtifact,
      saveWorkspaceVerificationState,
      createWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    mockState.planStorage = {
      currentPlanId: "plan-1",
      plans: [{
        id: "plan-1",
        name: "Security review",
        status: "active",
        acceptanceCriteria: ["token rotation is safe"],
        fileModuleImpact: ["auth workflow"],
        testVerification: ["npm test"],
        progressLog: [],
      }],
    };

    const artifact = persistWorkspaceReviewArtifact({
      cwd: "/repo",
      run: {
        trigger: "manual",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: true,
        artifactDir: "/repo/.pi/verification-runs/latest",
        resolvedPlan: {
          profile: "backend",
          commands: {},
          runtime: {
            enabled: false,
            command: "",
            label: "workspace-dev-server",
            startupTimeoutMs: 1000,
            keepAliveOnShutdown: true,
          },
          ui: {
            enabled: false,
            timeoutMs: 1000,
            commands: [],
          },
          acceptanceCriteria: ["token rotation is safe"],
          validationCommands: ["npm test"],
          recommendedSteps: ["test"],
          reasons: ["Security-sensitive change detected"],
          proofArtifacts: ["verification summary", "review notes"],
          sources: [],
        },
        stepResults: [{
          step: "test",
          success: true,
          skipped: false,
          durationMs: 10,
          command: "npm test",
        }],
      },
    });

    saveWorkspaceVerificationState("/repo", {
      ...createWorkspaceVerificationState(),
      pendingReviewArtifact: true,
      lastReviewArtifactPath: artifact.path,
    });

    expect(() => acknowledgeReviewArtifact({
      cwd: "/repo",
      decision: "accept",
    })).toThrow("review rationale");
  });

  it("auto-runs only when the last write is newer than the last run", async () => {
    const {
      createWorkspaceVerificationConfig,
      shouldAutoRunVerification,
      markWorkspaceDirty,
      finalizeVerificationRun,
      loadWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const config = createWorkspaceVerificationConfig();
    markWorkspaceDirty({ cwd: "/repo", toolName: "write" });

    let state = loadWorkspaceVerificationState("/repo");
    expect(shouldAutoRunVerification(config, state)).toBe(true);

    const writeTimestamp = Date.parse(state.lastWriteAt ?? "");
    const finishedAt = Number.isFinite(writeTimestamp)
      ? new Date(writeTimestamp + 5_000).toISOString()
      : new Date().toISOString();

    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        trigger: "auto",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt,
        success: false,
        stepResults: [],
      },
    });

    state = loadWorkspaceVerificationState("/repo");
    expect(shouldAutoRunVerification(config, state)).toBe(false);
  });

  it("extracts a web-app runbook from package.json and plans", async () => {
    mockState.files.set("/repo/package.json", JSON.stringify({
      scripts: {
        lint: "eslint .",
        typecheck: "tsc --noEmit",
        test: "vitest run",
        build: "vite build",
        dev: "vite --port 4173",
      },
      devDependencies: {
        vite: "^6.0.0",
        react: "^19.0.0",
      },
    }));
    mockState.files.set("/repo/AGENTS.md", "# AGENTS.md\n");
    mockState.files.set("/repo/plans/feature.md", [
      "# Acceptance Criteria",
      "- UI が壊れていないこと",
      "# Test & Verification",
      "- `npm run lint`",
      "- `npm run typecheck`",
      "- `npm test`",
      "- `npm run dev`",
      "- http://127.0.0.1:4173",
    ].join("\n"));

    const {
      buildWorkspaceVerificationRunbook,
      resolveWorkspaceVerificationPlan,
      createWorkspaceVerificationConfig,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const runbook = buildWorkspaceVerificationRunbook("/repo");
    expect(runbook.profile).toBe("web-app");
    expect(runbook.runtime.enabled).toBe(true);
    expect(runbook.runtime.readyPort).toBe(4173);
    expect(runbook.ui.enabled).toBe(true);
    expect(runbook.recommendedSteps).toEqual(["lint", "typecheck", "test", "runtime", "ui"]);
    expect(runbook.proofArtifacts).toContain("browser evidence");

    const resolved = resolveWorkspaceVerificationPlan(createWorkspaceVerificationConfig(), "/repo");
    expect(Boolean(resolved.commands.build)).toBe(true);
    expect(resolved.sources.length).toBeGreaterThan(0);
  });

  it("adds build-oriented verification when file impact mentions config and packaging", async () => {
    mockState.files.set("/repo/package.json", JSON.stringify({
      scripts: {
        lint: "eslint .",
        typecheck: "tsc --noEmit",
        test: "vitest run",
        build: "vite build",
      },
      devDependencies: {
        vite: "^6.0.0",
      },
    }));
    mockState.files.set("/repo/README.md", [
      "# Changed Files",
      "- package.json",
      "- vite.config.ts",
      "",
      "# Test & Verification",
      "- `npm run build`",
      "- `npm test`",
      "- review security and coverage",
    ].join("\n"));

    const { buildWorkspaceVerificationRunbook } = await import("../../../.pi/lib/workspace-verification.js");
    const runbook = buildWorkspaceVerificationRunbook("/repo");

    expect(runbook.recommendedSteps).toContain("build");
    expect(runbook.reasons).toContain("Build or packaging impact detected");
    expect(runbook.proofArtifacts).toContain("build output");
    expect(runbook.proofArtifacts).toContain("review notes");
  });

  it("persists verification artifacts", async () => {
    const {
      persistWorkspaceVerificationArtifacts,
      createWorkspaceVerificationConfig,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const run = persistWorkspaceVerificationArtifacts("/repo", createWorkspaceVerificationConfig(), {
      trigger: "manual",
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:00:10.000Z",
      success: true,
      resolvedPlan: {
        profile: "library",
        commands: {},
        runtime: {
          enabled: false,
          command: "",
          label: "workspace-dev-server",
          startupTimeoutMs: 1000,
          keepAliveOnShutdown: true,
        },
        ui: {
          enabled: false,
          timeoutMs: 1000,
          commands: [],
        },
        acceptanceCriteria: [],
        validationCommands: [],
        recommendedSteps: ["lint", "typecheck", "test"],
        reasons: [],
        proofArtifacts: ["verification summary"],
        sources: [],
      },
      stepResults: [{
        step: "test",
        success: true,
        skipped: false,
        durationMs: 10,
        command: "npm test",
        stdout: "ok",
        stderr: "",
      }],
    });

    expect(run.artifactDir).toContain(".pi/verification-runs");
    expect([...mockState.files.keys()].some((path) => path.endsWith("summary.json"))).toBe(true);
    expect(run.stepResults[0]?.artifactPath).toContain(".log");
  });

  it("persists a continuity pack with next suggested action", async () => {
    const {
      persistWorkspaceVerificationContinuityPack,
      createWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    mockState.planStorage = {
      currentPlanId: "plan-1",
      plans: [{
        id: "plan-1",
        name: "Continuity test",
        status: "active",
        acceptanceCriteria: ["UI が壊れていないこと"],
        fileModuleImpact: ["src/app.tsx"],
        testVerification: ["npm test"],
        progressLog: ["2026-03-07T00:00:00.000Z planner: Started"],
        steps: [{ title: "Repair UI", status: "in_progress" }],
      }],
    };

    const state = {
      ...createWorkspaceVerificationState(),
      replanRequired: true,
      replanReason: "Repeated verification failure",
      lastRun: {
        trigger: "manual" as const,
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: false,
        artifactDir: "/repo/.pi/verification-runs/latest",
        resolvedPlan: {
          profile: "web-app" as const,
          commands: {},
          runtime: {
            enabled: false,
            command: "",
            label: "workspace-dev-server",
            startupTimeoutMs: 1000,
            keepAliveOnShutdown: true,
          },
          ui: {
            enabled: false,
            timeoutMs: 1000,
            commands: [],
          },
          acceptanceCriteria: [],
          validationCommands: [],
          recommendedSteps: ["test"],
          reasons: [],
          proofArtifacts: ["verification summary"],
          sources: [],
        },
        stepResults: [{
          step: "test" as const,
          success: false,
          skipped: false,
          durationMs: 10,
          error: "test failed",
        }],
      },
    };

    const continuityPath = persistWorkspaceVerificationContinuityPack("/repo", state, state.lastRun?.resolvedPlan);

    expect(continuityPath).toContain(".pi/workspace-verification/continuity.json");
    expect(mockState.files.get(continuityPath)).toContain("workspace_verify_replan");
    expect(mockState.files.get(continuityPath)).toContain("src/app.tsx");
  });
});
