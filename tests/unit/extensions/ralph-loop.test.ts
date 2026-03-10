/**
 * path: tests/unit/extensions/ralph-loop.test.ts
 * role: Ralph loop 拡張の tool 登録と委譲を検証する
 * why: pi-mono から file-based Ralph loop を正しい入口で使えるようにするため
 * related: .pi/extensions/ralph-loop.ts, .pi/lib/ralph-loop.ts, tests/unit/lib/ralph-loop.test.ts, package.json
 *
 * @summary Ralph Loop拡張機能のユニットテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLib = vi.hoisted(() => ({
  initRalphLoop: vi.fn(() => ({
    paths: {
      rootDir: "/repo/.pi/ralph",
      prdPath: "/repo/.pi/ralph/prd.json",
      progressPath: "/repo/.pi/ralph/progress.txt",
      promptPath: "/repo/.pi/ralph/PROMPT_build.md",
      promptPlanPath: "/repo/.pi/ralph/PROMPT_plan.md",
      promptBuildPath: "/repo/.pi/ralph/PROMPT_build.md",
      promptPlanWorkPath: "/repo/.pi/ralph/PROMPT_plan_work.md",
      implementationPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
      fixPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
      agentMdPath: "/repo/.pi/ralph/AGENTS.md",
      specsDir: "/repo/.pi/ralph/specs",
      archiveDir: "/repo/.pi/ralph/archive",
      lastBranchPath: "/repo/.pi/ralph/.last-branch",
    },
    created: {
      prd: true,
      progress: true,
      promptPlan: true,
      promptBuild: true,
      promptPlanWork: true,
      implementationPlan: true,
      fixPlan: true,
      agentMd: true,
      specs: true,
    },
    message: "ファイルを作成しました",
  })),
  inspectRalphLoop: vi.fn(() => ({
    runtime: "pi",
    mode: "build",
    activeBranch: "feature-one",
    previousBranch: null,
    archivedTo: null,
    promptExists: true,
    promptPlanExists: true,
    promptBuildExists: true,
    promptPlanWorkExists: true,
    prdExists: true,
    progressExists: true,
    fixPlanExists: true,
    implementationPlanExists: true,
    agentMdExists: true,
    specsExists: true,
    paths: {
      rootDir: "/repo/.pi/ralph",
      prdPath: "/repo/.pi/ralph/prd.json",
      progressPath: "/repo/.pi/ralph/progress.txt",
      promptPath: "/repo/.pi/ralph/PROMPT_build.md",
      promptPlanPath: "/repo/.pi/ralph/PROMPT_plan.md",
      promptBuildPath: "/repo/.pi/ralph/PROMPT_build.md",
      promptPlanWorkPath: "/repo/.pi/ralph/PROMPT_plan_work.md",
      implementationPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
      fixPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
      agentMdPath: "/repo/.pi/ralph/AGENTS.md",
      specsDir: "/repo/.pi/ralph/specs",
      archiveDir: "/repo/.pi/ralph/archive",
      lastBranchPath: "/repo/.pi/ralph/.last-branch",
    },
  })),
  runRalphLoop: vi.fn(async () => ({
    status: {
      runtime: "pi",
      mode: "build",
      activeBranch: "feature-one",
      previousBranch: null,
      archivedTo: null,
      promptExists: true,
      promptPlanExists: true,
      promptBuildExists: true,
      promptPlanWorkExists: true,
      prdExists: true,
      progressExists: true,
      fixPlanExists: true,
      implementationPlanExists: true,
      agentMdExists: true,
      specsExists: true,
      paths: {
        rootDir: "/repo/.pi/ralph",
        prdPath: "/repo/.pi/ralph/prd.json",
        progressPath: "/repo/.pi/ralph/progress.txt",
        promptPath: "/repo/.pi/ralph/PROMPT_build.md",
        promptPlanPath: "/repo/.pi/ralph/PROMPT_plan.md",
        promptBuildPath: "/repo/.pi/ralph/PROMPT_build.md",
        promptPlanWorkPath: "/repo/.pi/ralph/PROMPT_plan_work.md",
        implementationPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
        fixPlanPath: "/repo/.pi/ralph/IMPLEMENTATION_PLAN.md",
        agentMdPath: "/repo/.pi/ralph/AGENTS.md",
        specsDir: "/repo/.pi/ralph/specs",
        archiveDir: "/repo/.pi/ralph/archive",
        lastBranchPath: "/repo/.pi/ralph/.last-branch",
      },
    },
    mode: "build",
    promptPathUsed: "/repo/.pi/ralph/PROMPT_build.md",
    workScope: undefined,
    completed: true,
    stopReason: "complete",
    iterations: [{ iteration: 1, stdout: "COMPLETE", stderr: "", exitCode: 0, completed: true }],
  })),
}));

vi.mock("../../../.pi/lib/ralph-loop.js", () => mockLib);

import registerRalphLoop from "../../../.pi/extensions/ralph-loop.js";

let activePi: ReturnType<typeof createPiMock> | null = null;

function createPiMock() {
  const tools: any[] = [];
  const handlers = new Map<string, Function>();

  return {
    tools,
    cwd: "/repo",
    registerTool: vi.fn((tool) => {
      tools.push(tool);
    }),
    on: vi.fn((event, handler) => {
      handlers.set(event, handler);
    }),
    emit: vi.fn((event, ...args) => {
      const handler = handlers.get(event);
      return handler?.(...args);
    }),
  };
}

describe("ralph-loop extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activePi = null;
  });

  afterEach(async () => {
    if (activePi) {
      await activePi.emit("session_shutdown");
    }
  });

  it("3つのツールを登録する", () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);

    const toolNames = pi.tools.map((t: any) => t.name);
    expect(toolNames).toContain("ralph_loop_init");
    expect(toolNames).toContain("ralph_loop_status");
    expect(toolNames).toContain("ralph_loop_run");
    expect(pi.tools).toHaveLength(3);
  });

  it("init tool は lib.initRalphLoop を呼ぶ", async () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);

    const tool = pi.tools.find((entry) => entry.name === "ralph_loop_init");
    const result = await tool.execute(
      "tool-0",
      { runtime: "pi", force: true },
      undefined,
      undefined,
      { cwd: "/repo" }
    );

    expect(mockLib.initRalphLoop).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "pi",
      mode: "build",
      stateDir: undefined,
      promptPath: undefined,
      force: true,
    });
    expect(result.content[0].text).toContain("Ralph Loop を初期化しました");
    expect(result.content[0].text).toContain("prd.json");
  });

  it("status tool は lib.inspectRalphLoop を呼ぶ", async () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);

    const tool = pi.tools.find((entry) => entry.name === "ralph_loop_status");
    const result = await tool.execute(
      "tool-1",
      { runtime: "pi" },
      undefined,
      undefined,
      { cwd: "/repo" }
    );

    expect(mockLib.inspectRalphLoop).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "pi",
      mode: "build",
      stateDir: undefined,
      promptPath: undefined,
    });
    expect(result.content[0].text).toContain("state_dir: /repo/.pi/ralph");
    expect(result.content[0].text).toContain("agents_md: /repo/.pi/ralph/AGENTS.md");
  });

  it("run tool は lib.runRalphLoop を呼ぶ", async () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);

    const tool = pi.tools.find((entry) => entry.name === "ralph_loop_run");
    const result = await tool.execute(
      "tool-2",
      { runtime: "pi", max_iterations: 3, sleep_ms: 0 },
      undefined,
      undefined,
      { cwd: "/repo" }
    );

    expect(mockLib.runRalphLoop).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "pi",
      mode: "build",
      workScope: undefined,
      maxIterations: 3,
      sleepMs: 0,
      stateDir: undefined,
      promptPath: undefined,
    });
    expect(result.content[0].text).toContain("completed: true");
    expect(result.content[0].text).toContain("run_mode: build");
  });

  it("2回目の登録は無視される", () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);
    registerRalphLoop(pi as never);

    expect(pi.registerTool).toHaveBeenCalledTimes(3);
  });

  it("session_shutdown でリセットされる", async () => {
    const pi = createPiMock();
    activePi = pi;
    registerRalphLoop(pi as never);

    expect(pi.registerTool).toHaveBeenCalledTimes(3);

    await pi.emit("session_shutdown");

    // 再登録可能になる
    registerRalphLoop(pi as never);
    expect(pi.registerTool).toHaveBeenCalledTimes(6);
  });
});
