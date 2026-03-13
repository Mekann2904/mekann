/**
 * path: tests/unit/extensions/autoresearch-tbench.test.ts
 * role: autoresearch-tbench 拡張の command と tool 登録を検証する
 * why: pi 内から terminal-bench 改善ループを呼ぶ入口が退行しないようにするため
 * related: .pi/extensions/autoresearch-tbench.ts, .pi/lib/autoresearch-tbench.ts, scripts/autoresearch-tbench.ts, package.json
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLib = vi.hoisted(() => ({
  initAutoresearchTbench: vi.fn(async () => ({
    branchName: "autoresearch/mekann-tbench",
    headCommit: "abc123",
    state: {
      runConfig: {
        taskNames: ["task-a", "task-b"],
      },
    },
  })),
  baselineAutoresearchTbench: vi.fn(async () => ({
    outcome: "baseline",
    score: {
      successCount: 2,
      completedTrials: 2,
      totalTrials: 2,
      errorCount: 0,
      meanReward: 1,
      elapsedMs: 1000,
    },
    commit: "abc123",
    run: {
      jobDir: "/repo/.pi/autoresearch/tbench/jobs/job-1",
      resultPath: "/repo/.pi/autoresearch/tbench/jobs/job-1/result.json",
      artifacts: {
        logPath: "/repo/.pi/autoresearch/tbench/experiments/run.log",
      },
    },
  })),
  runAutoresearchTbench: vi.fn(async () => ({
    outcome: "improved",
    score: {
      successCount: 2,
      completedTrials: 2,
      totalTrials: 2,
      errorCount: 0,
      meanReward: 1,
      elapsedMs: 900,
    },
    commit: "def456",
    run: {
      jobDir: "/repo/.pi/autoresearch/tbench/jobs/job-2",
      resultPath: "/repo/.pi/autoresearch/tbench/jobs/job-2/result.json",
      artifacts: {
        logPath: "/repo/.pi/autoresearch/tbench/experiments/run-2.log",
      },
    },
  })),
  requestStopAutoresearchTbench: vi.fn(() => ({
    requested: true,
    state: {
      activeRun: {
        pid: 1234,
        label: "baseline",
        startedAt: "2026-03-14T00:00:00.000Z",
      },
      stopRequestedAt: "2026-03-14T00:01:00.000Z",
    },
    reason: "stop requested for pid=1234",
  })),
  getAutoresearchTbenchStatus: vi.fn(async () => ({
    state: {
      tag: "mekann-tbench",
      gitEnabled: true,
      bestCommit: "def456",
      baselineCommit: "abc123",
      experimentCount: 2,
      runConfig: {
        taskSelector: "easy=2",
        taskNames: ["task-a", "task-b"],
        dataset: "terminal-bench@2.0",
        datasetPath: null,
        model: "glm-5",
        nConcurrent: 2,
        jobsDir: "/repo/.pi/autoresearch/tbench/jobs",
      },
      bestScore: {
        successCount: 2,
        completedTrials: 2,
        totalTrials: 2,
        errorCount: 0,
        meanReward: 1,
        elapsedMs: 900,
      },
    },
    paths: {
      rootDir: "/repo/.pi/autoresearch/tbench",
      statePath: "/repo/.pi/autoresearch/tbench/state.json",
      resultsTsvPath: "/repo/.pi/autoresearch/tbench/results.tsv",
      experimentsDir: "/repo/.pi/autoresearch/tbench/experiments",
      jobsDir: "/repo/.pi/autoresearch/tbench/jobs",
    },
  })),
  renderAutoresearchTbenchStatus: vi.fn(() => "tag=mekann-tbench"),
  formatAutoresearchTbenchScore: vi.fn(() => "success=2 completed=2/2 mean_reward=1.0000 errors=0 elapsed_ms=900"),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    Object: (value: unknown) => value,
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    String: () => "string",
    Array: (value: unknown) => value,
    Boolean: () => "boolean",
    Number: () => "number",
  },
}));

vi.mock("../../../.pi/lib/autoresearch-tbench.js", () => mockLib);

import registerAutoresearchTbench from "../../../.pi/extensions/autoresearch-tbench.js";

function createMockPi() {
  const tools: any[] = [];
  const commands = new Map<string, any>();
  const handlers = new Map<string, Function>();

  return {
    tools,
    commands,
    handlers,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    registerCommand: vi.fn((name: string, definition: any) => commands.set(name, definition)),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

describe("autoresearch-tbench extension", () => {
  let activePi: ReturnType<typeof createMockPi> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await activePi?.handlers.get("session_shutdown")?.({}, { cwd: "/repo" });
    activePi = null;
  });

  it("tool init は lib の init を呼ぶ", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerAutoresearchTbench(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "autoresearch_tbench");
    const result = await tool.execute(
      "tool-1",
      {
        action: "init",
        selection: "easy=2,medium=2,hard=2",
        tag: "mekann-tbench",
      },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockLib.initAutoresearchTbench).toHaveBeenCalledWith("/repo", expect.objectContaining({
      selection: "easy=2,medium=2,hard=2",
      tag: "mekann-tbench",
    }));
    expect(result.content[0].text).toContain("initialized branch=autoresearch/mekann-tbench");
  });

  it("slash command run は lib の run を呼び、結果を通知する", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerAutoresearchTbench(pi as any);

    const command = pi.commands.get("autoresearch-tbench");
    const notify = vi.fn();

    await command.handler("run label=try-adaptorch", {
      cwd: "/repo",
      ui: { notify },
    });

    expect(mockLib.runAutoresearchTbench).toHaveBeenCalledWith("/repo", expect.objectContaining({
      label: "try-adaptorch",
    }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("outcome=improved"), "info");
  });

  it("slash command stop は lib の stop を呼び、理由を通知する", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerAutoresearchTbench(pi as any);

    const command = pi.commands.get("autoresearch-tbench");
    const notify = vi.fn();

    await command.handler("stop", {
      cwd: "/repo",
      ui: { notify },
    });

    expect(mockLib.requestStopAutoresearchTbench).toHaveBeenCalledWith("/repo");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("requested=true"), "info");
  });

  it("status tool は render 済みテキストを返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerAutoresearchTbench(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "autoresearch_tbench");
    const result = await tool.execute(
      "tool-2",
      { action: "status" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockLib.getAutoresearchTbenchStatus).toHaveBeenCalledWith("/repo");
    expect(result.content[0].text).toBe("tag=mekann-tbench");
  });

  it("tool stop は stop 結果を返す", async () => {
    const pi = createMockPi();
    activePi = pi;
    registerAutoresearchTbench(pi as any);

    const tool = pi.tools.find((entry) => entry.name === "autoresearch_tbench");
    const result = await tool.execute(
      "tool-3",
      { action: "stop" },
      undefined,
      undefined,
      { cwd: "/repo" },
    );

    expect(mockLib.requestStopAutoresearchTbench).toHaveBeenCalledWith("/repo");
    expect(result.content[0].text).toContain("stop requested for pid=1234");
  });
});
