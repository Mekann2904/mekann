// Path: tests/unit/extensions/autonomy-policy.test.ts
// What: autonomy-policy extension の登録と runtime 挙動を検証するテスト
// Why: profile 切り替えと tool_call blocking が壊れないようにするため
// Related: .pi/extensions/autonomy-policy.ts, .pi/lib/autonomy-policy.ts, .pi/tests/lib/autonomy-policy.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const policyMocks = vi.hoisted(() => ({
  createAutonomyPolicyConfig: vi.fn((profile = "yolo") => ({
    enabled: true,
    profile,
    mode: "build",
    gatekeeper: profile === "yolo" ? "off" : "deterministic",
    permissions: {
      read: "allow",
      write: "allow",
      command: profile === "manual" ? "ask" : "allow",
      browser: "allow",
      mcp: "allow",
      mode_switch: "allow",
      subtasks: "allow",
      follow_up: "allow",
      todo: "allow",
    },
    updatedAt: "2026-03-07T00:00:00.000Z",
  })),
  loadAutonomyPolicyConfig: vi.fn(),
  resolveAutonomyDecision: vi.fn(),
  saveAutonomyPolicyConfig: vi.fn((config) => config),
}));

const supervisorMocks = vi.hoisted(() => ({
  runLongRunningPreflight: vi.fn(() => ({
    ok: false,
    blockers: ["non-interactive execution cannot satisfy command permission is ask"],
    warnings: [],
    requiredPermissions: ["write", "command"],
    missingPermissions: ["command"],
    workspaceVerificationPhase: "clear",
    runtimeNeedsBackgroundProcess: false,
  })),
  formatLongRunningPreflight: vi.fn(() => "# Long-Running Preflight\nok: false"),
  createLongRunningReplay: vi.fn(() => ({
    session: { id: "lr-1", status: "crashed" },
    resumeReason: "Previous session ended without a clean shutdown.",
    nextAction: "Resume verification from the failed step: test.",
    workspaceVerification: {
      phase: "verification",
      reason: "Resume verification from test.",
      requestedSteps: ["test"],
    },
    checkpointPath: "/tmp/checkpoint.json",
    journalPath: "/tmp/journal.jsonl",
    continuityPath: undefined,
    trajectoryPath: undefined,
    plan: {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    },
    recentEvents: [],
    backgroundProcesses: [],
    warnings: [],
  })),
  formatLongRunningReplay: vi.fn(() => "Long-running resume prompt"),
  loadLatestLongRunningSession: vi.fn(() => ({
    id: "lr-1",
    status: "active",
  })),
  loadLongRunningJournal: vi.fn(() => [
    { timestamp: "2026-03-07T00:00:00.000Z", type: "tool_call", summary: "Tool call started: loop_run" },
  ]),
  runLongRunningSupervisorSweep: vi.fn(async () => ({
    warnings: [],
    recoveredSessionId: "lr-old",
    background: {
      runningCount: 0,
      orphanedCount: 1,
      reclaimedCount: 1,
      running: [],
      orphaned: [],
      reclaimed: [],
    },
    subagents: {
      activeCount: 1,
      orphanedCount: 1,
      staleCount: 1,
      recoveredCount: 1,
      active: [],
      orphaned: [],
      stale: [],
      recovered: [],
    },
  })),
  recordLongRunningEvent: vi.fn(),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    Object: (value: unknown) => value,
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    Array: (value: unknown) => value,
    String: (value: unknown) => value,
    Boolean: (value: unknown) => value,
    Integer: (value: unknown) => value,
  },
}));

vi.mock("../../../.pi/lib/autonomy-policy.js", () => ({
  PERMISSION_KEYS: [
    "read",
    "write",
    "command",
    "browser",
    "mcp",
    "mode_switch",
    "subtasks",
    "follow_up",
    "todo",
  ],
  applyModeToTools: vi.fn((tools: string[], mode: string) =>
    mode === "plan" ? tools.filter((tool) => !["bash", "edit", "write", "loop_run"].includes(tool)) : tools
  ),
  createAutonomyPolicyConfig: policyMocks.createAutonomyPolicyConfig,
  loadAutonomyPolicyConfig: policyMocks.loadAutonomyPolicyConfig,
  resolveAutonomyDecision: policyMocks.resolveAutonomyDecision,
  saveAutonomyPolicyConfig: policyMocks.saveAutonomyPolicyConfig,
  summarizePolicy: vi.fn((config) => `profile=${config.profile}\nmode=${config.mode}`),
}));

vi.mock("../../../.pi/lib/long-running-supervisor.js", () => ({
  runLongRunningPreflight: supervisorMocks.runLongRunningPreflight,
  formatLongRunningPreflight: supervisorMocks.formatLongRunningPreflight,
  createLongRunningReplay: supervisorMocks.createLongRunningReplay,
  formatLongRunningReplay: supervisorMocks.formatLongRunningReplay,
  loadLatestLongRunningSession: supervisorMocks.loadLatestLongRunningSession,
  loadLongRunningJournal: supervisorMocks.loadLongRunningJournal,
  runLongRunningSupervisorSweep: supervisorMocks.runLongRunningSupervisorSweep,
  recordLongRunningEvent: supervisorMocks.recordLongRunningEvent,
}));

import registerAutonomyPolicy from "../../../.pi/extensions/autonomy-policy.js";

let activePi: ReturnType<typeof createMockPi> | null = null;

function createMockPi() {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();
  const tools: any[] = [];
  const commands = new Map<string, any>();
  const ctx = {
    hasUI: true,
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      confirm: vi.fn(async () => true),
    },
  };

  return {
    handlers,
    tools,
    commands,
    ctx,
    on: vi.fn((name: string, handler: any) => handlers.set(name, handler)),
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    registerCommand: vi.fn((name: string, def: any) => commands.set(name, def)),
    getAllTools: vi.fn(() => [
      { name: "read" },
      { name: "bash" },
      { name: "edit" },
      { name: "write" },
      { name: "loop_run" },
      { name: "subagent_run" },
    ]),
    setActiveTools: vi.fn(),
  };
}

describe("autonomy-policy extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyMocks.loadAutonomyPolicyConfig.mockReturnValue(policyMocks.createAutonomyPolicyConfig());
    policyMocks.resolveAutonomyDecision.mockReturnValue({
      permissionKey: "read",
      permissionDecision: "allow",
      finalDecision: "allow",
      reason: "policy=allow, capability=read",
    });
  });

  afterEach(async () => {
    if (activePi) {
      await activePi.handlers.get("session_shutdown")?.({}, activePi.ctx);
      activePi = null;
    }
  });

  it("session_start で plan mode を active tools に反映する", async () => {
    const pi = createMockPi();
    activePi = pi;
    policyMocks.loadAutonomyPolicyConfig.mockReturnValue({
      ...policyMocks.createAutonomyPolicyConfig(),
      mode: "plan",
    });

    registerAutonomyPolicy(pi as any);
    await pi.handlers.get("session_start")?.({}, pi.ctx);

    expect(pi.setActiveTools).toHaveBeenCalledWith(["read", "subagent_run"]);
    expect(pi.ctx.ui.setStatus).toHaveBeenCalledWith("autonomy-policy", "auto:plan/yolo");
  });

  it("deny decision は tool_call を block する", async () => {
    const pi = createMockPi();
    activePi = pi;
    policyMocks.resolveAutonomyDecision.mockReturnValue({
      permissionKey: "command",
      permissionDecision: "allow",
      finalDecision: "deny",
      reason: "policy=allow, capability=command, gatekeeper=destructive command pattern blocked",
    });

    registerAutonomyPolicy(pi as any);
    const result = await pi.handlers.get("tool_call")?.(
      { toolName: "bash", input: { command: "rm -rf /tmp/demo" } },
      pi.ctx
    );

    expect(result).toEqual({
      block: true,
      reason: "policy=allow, capability=command, gatekeeper=destructive command pattern blocked",
    });
    expect(supervisorMocks.recordLongRunningEvent).toHaveBeenCalled();
  });

  it("ask decision は confirm を使う", async () => {
    const pi = createMockPi();
    activePi = pi;
    policyMocks.resolveAutonomyDecision.mockReturnValue({
      permissionKey: "command",
      permissionDecision: "allow",
      finalDecision: "ask",
      reason: "policy=allow, capability=command, gatekeeper=command substitution requires approval",
    });

    registerAutonomyPolicy(pi as any);
    const result = await pi.handlers.get("tool_call")?.(
      { toolName: "bash", input: { command: "echo $(pwd)" } },
      pi.ctx
    );

    expect(pi.ctx.ui.confirm).toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it("non-interactive ask decision は fail-safe で block する", async () => {
    const pi = createMockPi();
    activePi = pi;
    pi.ctx.hasUI = false;
    policyMocks.resolveAutonomyDecision.mockReturnValue({
      permissionKey: "command",
      permissionDecision: "allow",
      finalDecision: "ask",
      reason: "policy=allow, capability=command, gatekeeper=high iteration count requires approval",
    });

    registerAutonomyPolicy(pi as any);
    const result = await pi.handlers.get("tool_call")?.(
      { toolName: "loop_run", input: { iterations: 30 } },
      pi.ctx
    );

    expect(result?.block).toBe(true);
  });

  it("autonomy_policy tool で yolo profile に切り替えられる", async () => {
    const pi = createMockPi();
    activePi = pi;

    registerAutonomyPolicy(pi as any);
    const tool = pi.tools.find((entry) => entry.name === "autonomy_policy");
    expect(tool).toBeDefined();

    await tool.execute("call-1", { action: "set_profile", profile: "yolo" }, undefined, undefined, pi.ctx);

    expect(policyMocks.saveAutonomyPolicyConfig).toHaveBeenCalled();
    const saved = policyMocks.saveAutonomyPolicyConfig.mock.calls.at(-1)?.[0];
    expect(saved.profile).toBe("yolo");
  });

  it("autonomy_preflight tool returns blocker summary", async () => {
    const pi = createMockPi();
    activePi = pi;

    registerAutonomyPolicy(pi as any);
    const tool = pi.tools.find((entry) => entry.name === "autonomy_preflight");
    expect(tool).toBeDefined();

    const result = await tool.execute("call-2", { nonInteractive: true }, undefined, undefined, pi.ctx);

    expect(String(result.content[0].text)).toContain("Long-Running Preflight");
    expect(supervisorMocks.runLongRunningPreflight).toHaveBeenCalled();
  });

  it("autonomy_resume tool exposes resume prompt", async () => {
    const pi = createMockPi();
    activePi = pi;

    registerAutonomyPolicy(pi as any);
    const tool = pi.tools.find((entry) => entry.name === "autonomy_resume");
    expect(tool).toBeDefined();

    const result = await tool.execute("call-3", {}, undefined, undefined, pi.ctx);

    expect(result.content[0].text).toBe("Long-running resume prompt");
  });

  it("autonomy_supervisor tool exposes unified supervisor sweep", async () => {
    const pi = createMockPi();
    activePi = pi;

    registerAutonomyPolicy(pi as any);
    const tool = pi.tools.find((entry) => entry.name === "autonomy_supervisor");
    expect(tool).toBeDefined();

    const result = await tool.execute("call-4", { action: "recover" }, undefined, undefined, pi.ctx);

    expect(String(result.content[0].text)).toContain("recovered_subagent_runs=1");
    expect(supervisorMocks.runLongRunningSupervisorSweep).toHaveBeenCalled();
  });
});
