/**
 * path: tests/unit/lib/long-running-supervisor.test.ts
 * role: long-running supervisor の durable journal、resume、preflight を検証する
 * why: crash-resume と unattended preflight の退行を防ぐため
 * related: .pi/lib/long-running-supervisor.ts, .pi/lib/workspace-verification.ts, .pi/lib/background-processes.ts, .pi/extensions/long-running-supervisor.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const backgroundMocks = vi.hoisted(() => ({
  isProcessAlive: vi.fn(() => true),
  listBackgroundProcesses: vi.fn(() => []),
  loadBackgroundProcessConfig: vi.fn(() => ({
    enabled: true,
    maxRunningProcesses: 4,
    defaultKeepAliveOnShutdown: true,
    defaultStartupTimeoutMs: 15000,
    cleanupOnSessionShutdown: true,
  })),
  sweepBackgroundProcesses: vi.fn(async () => ({
    running: [],
    orphaned: [],
    reclaimed: [],
  })),
}));

const autonomyMocks = vi.hoisted(() => ({
  loadAutonomyPolicyConfig: vi.fn(() => ({
    enabled: true,
    profile: "balanced",
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
    updatedAt: "2026-03-08T00:00:00.000Z",
  })),
}));

const planMocks = vi.hoisted(() => ({
  loadPlanStorage: vi.fn(() => ({
    currentPlanId: "plan-1",
    plans: [{
      id: "plan-1",
      name: "Long run",
      status: "active",
      acceptanceCriteria: ["it resumes"],
      fileModuleImpact: ["root journal"],
      progressLog: ["created plan"],
      steps: [{ title: "Resume root task", status: "in_progress" }],
    }],
  })),
}));

const workspaceMocks = vi.hoisted(() => ({
  loadWorkspaceVerificationConfig: vi.fn(() => ({
    enabled: true,
    profile: "auto",
    autoDetectRunbook: true,
    autoRunOnTurnEnd: false,
    gateMode: "strict",
    requireProofReview: false,
    requireReviewArtifact: false,
    autoRequireReviewArtifact: false,
    requireReplanOnRepeatedFailure: false,
    enableEvalCorpus: false,
    checkpointOnMutation: false,
    checkpointOnFailure: false,
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
      review: false,
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
  })),
  loadWorkspaceVerificationState: vi.fn(() => ({
    dirty: false,
    running: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: 0,
    continuityPath: undefined,
    trajectoryPath: undefined,
  })),
  resolveWorkspaceVerificationPlan: vi.fn(() => ({
    profile: "library",
    commands: {
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      test: "npm test",
      build: undefined,
    },
    runtime: {
      enabled: false,
      command: "",
      label: "workspace-dev-server",
      startupTimeoutMs: 20000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: false,
      timeoutMs: 120000,
      commands: [],
    },
    acceptanceCriteria: ["it resumes"],
    validationCommands: ["npm test"],
    recommendedSteps: ["lint", "typecheck", "test"],
    reasons: ["test-sensitive change"],
    proofArtifacts: ["verification summary"],
    sources: ["README.md"],
  })),
  resolveWorkspaceVerificationResumePlan: vi.fn(() => ({
    phase: "clear",
    requestedSteps: [],
    reason: "Workspace verification is clear.",
  })),
}));

vi.mock("../../../.pi/lib/background-processes.js", () => backgroundMocks);
vi.mock("../../../.pi/lib/autonomy-policy.js", () => autonomyMocks);
vi.mock("../../../.pi/lib/storage/task-plan-store.js", () => planMocks);
vi.mock("../../../.pi/lib/workspace-verification.js", () => workspaceMocks);

describe("long-running-supervisor lib", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "lr-supervisor-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("unclean active session を crash 扱いにして新しい session を開始する", async () => {
    const {
      beginLongRunningSession,
      loadLatestLongRunningSession,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    const first = await beginLongRunningSession({ cwd });
    const firstSessionPath = join(cwd, ".pi", "long-running", "sessions", first.session.id, "session.json");
    const stale = JSON.parse(readFileSync(firstSessionPath, "utf-8")) as Record<string, unknown>;
    stale.ownerPid = 424242;
    stale.status = "active";
    writeFileSync(firstSessionPath, `${JSON.stringify(stale, null, 2)}\n`, "utf-8");
    backgroundMocks.isProcessAlive.mockReturnValue(false);

    const second = await beginLongRunningSession({ cwd });
    const recoveredPath = join(cwd, ".pi", "long-running", "sessions", first.session.id, "session.json");
    const recovered = JSON.parse(readFileSync(recoveredPath, "utf-8")) as Record<string, unknown>;
    const latest = loadLatestLongRunningSession(cwd);

    expect(second.sweep.recoveredSessionId).toBe(first.session.id);
    expect(recovered.status).toBe("crashed");
    expect(latest?.resumedFromSessionId).toBe(first.session.id);
    expect(existsSync(join(cwd, ".pi", "long-running", "sessions", second.session.id, "checkpoint.json"))).toBe(true);
  });

  it("heartbeat が止まった active session を stale crash として回収する", async () => {
    const {
      beginLongRunningSession,
      runLongRunningSupervisorSweep,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    const { session } = await beginLongRunningSession({ cwd });
    const sessionPath = join(cwd, ".pi", "long-running", "sessions", session.id, "session.json");
    const stale = JSON.parse(readFileSync(sessionPath, "utf-8")) as Record<string, unknown>;
    stale.ownerPid = 424242;
    stale.updatedAt = "2000-01-01T00:00:00.000Z";
    writeFileSync(sessionPath, `${JSON.stringify(stale, null, 2)}\n`, "utf-8");
    backgroundMocks.isProcessAlive.mockReturnValue(true);

    const sweep = await runLongRunningSupervisorSweep({ cwd });
    const recovered = JSON.parse(readFileSync(sessionPath, "utf-8")) as Record<string, unknown>;

    expect(sweep.recoveredSessionId).toBe(session.id);
    expect(recovered.status).toBe("crashed");
    expect(String(recovered.lastError)).toContain("heartbeat expired");
  });

  it("preflight が pending proof review と ask permission を blocker にする", async () => {
    const { runLongRunningPreflight } = await import("../../../.pi/lib/long-running-supervisor.js");

    workspaceMocks.loadWorkspaceVerificationState.mockReturnValue({
      dirty: true,
      running: false,
      pendingProofReview: true,
      pendingReviewArtifact: false,
      replanRequired: false,
      writeCount: 1,
      repeatedFailureCount: 0,
      continuityPath: undefined,
      trajectoryPath: undefined,
    });
    workspaceMocks.resolveWorkspaceVerificationResumePlan.mockReturnValue({
      phase: "verification",
      requestedSteps: ["test"],
      reason: "Resume verification from test.",
      resumeStep: "test",
    });
    autonomyMocks.loadAutonomyPolicyConfig.mockReturnValue({
      enabled: true,
      profile: "balanced",
      mode: "build",
      gatekeeper: "deterministic",
      permissions: {
        read: "allow",
        write: "allow",
        command: "ask",
        browser: "allow",
        mcp: "allow",
        mode_switch: "allow",
        subtasks: "allow",
        follow_up: "allow",
        todo: "allow",
      },
      updatedAt: "2026-03-08T00:00:00.000Z",
    });

    const result = runLongRunningPreflight(cwd);

    expect(result.ok).toBe(false);
    expect(result.blockers).toContain("workspace verification proof review is pending");
    expect(result.blockers).toContain("verification resume needs command permission, but command is ask");
    expect(result.missingPermissions).toContain("command");
  });

  it("stale / orphan subagent run を supervisor sweep が回収する", async () => {
    const {
      beginLongRunningSession,
      registerActiveSubagentRun,
      runLongRunningSupervisorSweep,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    await beginLongRunningSession({ cwd });
    registerActiveSubagentRun({
      cwd,
      runId: "run-stale",
      agentId: "researcher",
      task: "collect facts",
    });

    const activeRunsPath = join(cwd, ".pi", "long-running", "active-subagent-runs.json");
    const storedRuns = JSON.parse(readFileSync(activeRunsPath, "utf-8")) as Array<Record<string, unknown>>;
    storedRuns[0].ownerPid = 424242;
    storedRuns[0].heartbeatAt = "2026-03-08T00:00:00.000Z";
    writeFileSync(activeRunsPath, `${JSON.stringify(storedRuns, null, 2)}\n`, "utf-8");
    backgroundMocks.isProcessAlive.mockReturnValue(false);

    const sweep = await runLongRunningSupervisorSweep({ cwd });
    const afterRuns = JSON.parse(readFileSync(activeRunsPath, "utf-8")) as Array<Record<string, unknown>>;

    expect(sweep.subagents.orphanedCount).toBe(1);
    expect(sweep.subagents.recoveredCount).toBe(1);
    expect(afterRuns).toEqual([]);
    expect(sweep.warnings.some((item) => item.includes("Recovered 1 stale/orphan subagent run"))).toBe(true);
  });

  it("resume replay が active subagent run を warning と next action に反映する", async () => {
    const {
      beginLongRunningSession,
      createLongRunningReplay,
      registerActiveSubagentRun,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    await beginLongRunningSession({ cwd });
    registerActiveSubagentRun({
      cwd,
      runId: "run-active",
      agentId: "implementer",
      task: "finish patch",
    });

    const replay = createLongRunningReplay(cwd);

    expect(replay.warnings).toContain("Active subagent runs detected: 1");
    expect(replay.nextAction).toBe("Inspect or recover active subagent runs before resuming.");
  });

  it("resume replay が current plan step を single next action として返す", async () => {
    const {
      beginLongRunningSession,
      createLongRunningReplay,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    await beginLongRunningSession({ cwd });
    const replay = createLongRunningReplay(cwd);

    expect(replay.nextAction).toBe("Resume the single highest-priority plan step: Resume root task.");
  });

  it("preflight が active subagent run を unattended blocker にする", async () => {
    const {
      beginLongRunningSession,
      registerActiveSubagentRun,
      runLongRunningPreflight,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    await beginLongRunningSession({ cwd });
    registerActiveSubagentRun({
      cwd,
      runId: "run-blocked",
      agentId: "reviewer",
      task: "review delta",
    });

    const result = runLongRunningPreflight(cwd);

    expect(result.ok).toBe(false);
    expect(result.blockers).toContain(
      "active subagent runs are still recorded; recover or wait for them before starting another unattended execution",
    );
  });

  it("破損した active-subagent-runs.json があっても replay と preflight が継続できる", async () => {
    const {
      beginLongRunningSession,
      createLongRunningReplay,
      runLongRunningPreflight,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    await beginLongRunningSession({ cwd });
    const brokenPath = join(cwd, ".pi", "long-running", "active-subagent-runs.json");
    writeFileSync(brokenPath, "{broken-json\n", "utf-8");

    const replay = createLongRunningReplay(cwd);
    const preflight = runLongRunningPreflight(cwd);

    expect(replay.session?.id).toBeDefined();
    expect(preflight.ok).toBe(true);
  });

  it("破損した session.json があっても begin session が新しい durable session を開始できる", async () => {
    const {
      beginLongRunningSession,
      loadLatestLongRunningSession,
    } = await import("../../../.pi/lib/long-running-supervisor.js");

    const first = await beginLongRunningSession({ cwd });
    const sessionPath = join(cwd, ".pi", "long-running", "sessions", first.session.id, "session.json");
    writeFileSync(sessionPath, "{broken-json\n", "utf-8");

    const second = await beginLongRunningSession({ cwd });
    const latest = loadLatestLongRunningSession(cwd);

    expect(second.session.id).not.toBe(first.session.id);
    expect(latest?.id).toBe(second.session.id);
  });
});
