/**
 * path: tests/unit/lib/workspace-verification-ci.test.ts
 * role: workspace verification の CI runner を検証する
 * why: repo-level quality gate が relevant steps と artifact 保存を崩さないようにするため
 * related: .pi/lib/workspace-verification-ci.ts, .pi/lib/workspace-verification.ts, scripts/run-workspace-verification-ci.ts, .github/workflows/test.yml
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  commands: [] as string[],
  savedStates: [] as Array<Record<string, unknown>>,
  changedFiles: [".pi/lib/workspace-verification-ci.ts", "tests/unit/lib/workspace-verification-ci.test.ts"],
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => `${mockState.changedFiles.join("\n")}\n`),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      return String(path).includes("tests/unit/lib/workspace-verification-ci.test.ts")
        || String(path).includes("tests/unit/lib/workspace-verification.test.ts")
        || String(path).includes("tests/unit/extensions/workspace-verification.test.ts");
    }),
    writeFileSync: vi.fn(),
  };
});

vi.mock("../../../.pi/lib/workspace-verification.js", () => ({
  createWorkspaceVerificationConfig: vi.fn(() => ({
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
    commandTimeoutMs: 1000,
    artifactRetentionRuns: 20,
    enabledSteps: {
      lint: true,
      typecheck: true,
      test: true,
      build: true,
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
      startupTimeoutMs: 1000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: false,
      timeoutMs: 1000,
      commands: [],
    },
  })),
  resolveWorkspaceVerificationPlan: vi.fn((_config, _cwd) => ({
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
      label: "workspace-web-app",
      startupTimeoutMs: 1000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: true,
      baseUrl: "http://127.0.0.1:3000",
      timeoutMs: 1000,
      commands: ["open ${baseUrl}", "snapshot"],
    },
    acceptanceCriteria: ["lint と test が通ること"],
    validationCommands: ["npm run lint", "npm test"],
    recommendedSteps: ["lint", "typecheck", "test", "runtime", "ui"],
    reasons: ["UI or browser-facing change detected"],
    proofArtifacts: ["verification summary", "browser evidence"],
    sources: ["/repo/README.md"],
  })),
  resolveEnabledSteps: vi.fn((_config, _plan, requested) => requested ?? ["lint", "typecheck", "test", "runtime", "ui"]),
  getResolvedCommandForStep: vi.fn((plan, step) => plan.commands[step] ?? ""),
  runWorkspaceCommand: vi.fn(async ({ command }) => {
    mockState.commands.push(command);
    return {
      command,
      success: command !== "npm test",
      exitCode: command === "npm test" ? 1 : 0,
      timedOut: false,
      durationMs: 10,
      stdout: command === "npm test" ? "" : "ok",
      stderr: command === "npm test" ? "failed" : "",
      error: command === "npm test" ? "failed" : undefined,
    };
  }),
  persistWorkspaceVerificationArtifacts: vi.fn((_cwd, _config, run) => ({
    ...run,
    artifactDir: "/repo/.pi/verification-runs/latest",
    stepResults: run.stepResults.map((item, index) => ({
      ...item,
      artifactPath: `/repo/.pi/verification-runs/latest/${index + 1}-${item.step}.log`,
    })),
  })),
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
    },
  })),
  acknowledgeReviewArtifact: vi.fn(() => ({
    dirty: false,
    running: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: 0,
    lastReviewArtifactAt: "2026-03-07T00:07:00.000Z",
    lastReviewArtifactPath: "/repo/.pi/workspace-verification/reviews/latest-review.md",
  })),
  finalizeVerificationRun: vi.fn(({ run }) => ({
    dirty: !run.success,
    running: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: run.success ? 0 : 1,
    lastRun: run,
  })),
  persistWorkspaceVerificationContinuityPack: vi.fn(() => "/repo/.pi/workspace-verification/continuity.json"),
  saveWorkspaceVerificationState: vi.fn((_cwd, next) => {
    mockState.savedStates.push(next);
    return next;
  }),
}));

describe("workspace-verification-ci", () => {
  beforeEach(() => {
    mockState.commands = [];
    mockState.savedStates = [];
    delete process.env.CI_WORKSPACE_VERIFY_UI_BASE_URL;
    delete process.env.CI_WORKSPACE_VERIFY_UI_COMMAND;
    vi.restoreAllMocks();
  });

  it("runs command steps and skips interactive steps in CI", async () => {
    const { runWorkspaceVerificationCi } = await import("../../../.pi/lib/workspace-verification-ci.js");
    const result = await runWorkspaceVerificationCi({ cwd: "/repo" });

    expect(mockState.commands).toEqual([
      "npx eslint \".pi/lib/workspace-verification-ci.ts\" --max-warnings=0",
      "npm run typecheck",
      "npx vitest run \"tests/unit/lib/workspace-verification-ci.test.ts\"",
    ]);
    expect(result.skippedInteractiveSteps).toEqual(["runtime", "ui"]);
    expect(result.run.success).toBe(true);
    expect(result.summaryText).toContain("skipped_interactive_steps: runtime, ui");
    expect(result.summaryText).toContain("changed_files: .pi/lib/workspace-verification-ci.ts, tests/unit/lib/workspace-verification-ci.test.ts");
    expect(mockState.savedStates.at(-1)?.continuityPath).toBe("/repo/.pi/workspace-verification/continuity.json");
  });

  it("can fail early when interactive verification is requested as mandatory", async () => {
    const { runWorkspaceVerificationCi } = await import("../../../.pi/lib/workspace-verification-ci.js");

    await expect(runWorkspaceVerificationCi({
      cwd: "/repo",
      failOnInteractiveRecommendations: true,
    })).rejects.toThrow("interactive verification recommended in CI");
  });

  it("downgrades legacy typecheck failures outside changed files", async () => {
    const verificationModule = await import("../../../.pi/lib/workspace-verification.js");
    vi.mocked(verificationModule.runWorkspaceCommand)
      .mockResolvedValueOnce({
        command: "npx eslint \".pi/lib/workspace-verification-ci.ts\" \"tests/unit/lib/workspace-verification-ci.test.ts\" --max-warnings=0",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
      })
      .mockResolvedValueOnce({
        command: "npm run typecheck",
        success: false,
        exitCode: 2,
        timedOut: false,
        durationMs: 10,
        stdout: "",
        stderr: ".pi/extensions/web-ui/index.ts(233,11): error TS2451: Cannot redeclare block-scoped variable.",
        error: "typecheck failed",
      })
      .mockResolvedValueOnce({
        command: "npx vitest run \"tests/unit/lib/workspace-verification-ci.test.ts\"",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
      });

    const { runWorkspaceVerificationCi } = await import("../../../.pi/lib/workspace-verification-ci.js");
    const result = await runWorkspaceVerificationCi({ cwd: "/repo" });

    expect(result.run.success).toBe(true);
    expect(result.stepResults.find((item) => item.step === "typecheck")?.error).toContain("legacy typecheck diagnostics");
    expect(result.stepResults.find((item) => item.step === "test")?.command).toBe("npx vitest run \"tests/unit/lib/workspace-verification-ci.test.ts\"");
  });

  it("runs optional UI browser evidence in CI when a command is provided", async () => {
    process.env.CI_WORKSPACE_VERIFY_UI_BASE_URL = "https://preview.example.test";
    process.env.CI_WORKSPACE_VERIFY_UI_COMMAND = "playwright-cli snapshot ${baseUrl}";

    const verificationModule = await import("../../../.pi/lib/workspace-verification.js");
    vi.mocked(verificationModule.runWorkspaceCommand)
      .mockResolvedValueOnce({
        command: "npx eslint \".pi/lib/workspace-verification-ci.ts\" --max-warnings=0",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
      })
      .mockResolvedValueOnce({
        command: "npm run typecheck",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
      })
      .mockResolvedValueOnce({
        command: "npx vitest run \"tests/unit/lib/workspace-verification-ci.test.ts\"",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "ok",
        stderr: "",
      })
      .mockResolvedValueOnce({
        command: "playwright-cli snapshot https://preview.example.test",
        success: true,
        exitCode: 0,
        timedOut: false,
        durationMs: 10,
        stdout: "snapshot saved",
        stderr: "",
      });

    const { runWorkspaceVerificationCi } = await import("../../../.pi/lib/workspace-verification-ci.js");
    const result = await runWorkspaceVerificationCi({ cwd: "/repo" });

    expect(result.skippedInteractiveSteps).toEqual(["runtime"]);
    expect(result.stepResults.find((item) => item.step === "ui")?.command).toBe(
      "playwright-cli snapshot https://preview.example.test",
    );
  });
});
