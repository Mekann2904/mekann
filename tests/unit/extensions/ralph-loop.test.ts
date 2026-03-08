/**
 * path: tests/unit/extensions/ralph-loop.test.ts
 * role: Ralph loop 拡張の tool 登録と委譲を検証する
 * why: pi-mono から file-based Ralph loop を正しい入口で使えるようにするため
 * related: .pi/extensions/ralph-loop.ts, .pi/lib/ralph-loop.ts, tests/unit/lib/ralph-loop.test.ts, package.json
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockLib = vi.hoisted(() => ({
  inspectRalphLoop: vi.fn(() => ({
    runtime: "pi",
    activeBranch: "feature-one",
    previousBranch: null,
    archivedTo: null,
    promptExists: true,
    prdExists: true,
    progressExists: true,
    paths: {
      rootDir: "/repo/.pi/ralph",
      prdPath: "/repo/.pi/ralph/prd.json",
      progressPath: "/repo/.pi/ralph/progress.txt",
      archiveDir: "/repo/.pi/ralph/archive",
      lastBranchPath: "/repo/.pi/ralph/.last-branch",
      promptPath: "/repo/.pi/ralph/PI.md",
    },
  })),
  runRalphLoop: vi.fn(async () => ({
    completed: true,
    stopReason: "complete",
    iterations: [{ iteration: 1, stdout: "COMPLETE", stderr: "", exitCode: 0, completed: true }],
    status: {
      runtime: "pi",
      activeBranch: "feature-one",
      previousBranch: null,
      archivedTo: null,
      promptExists: true,
      prdExists: true,
      progressExists: true,
      paths: {
        rootDir: "/repo/.pi/ralph",
        prdPath: "/repo/.pi/ralph/prd.json",
        progressPath: "/repo/.pi/ralph/progress.txt",
        archiveDir: "/repo/.pi/ralph/archive",
        lastBranchPath: "/repo/.pi/ralph/.last-branch",
        promptPath: "/repo/.pi/ralph/PI.md",
      },
    },
  })),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    Object: (value: unknown) => value,
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    String: (value: unknown) => value,
    Integer: (value: unknown) => value,
  },
}));

vi.mock("../../../.pi/lib/ralph-loop.js", () => mockLib);

import registerRalphLoop from "../../../.pi/extensions/ralph-loop.js";

let activePi: ReturnType<typeof createPiMock> | null = null;

function createPiMock() {
  const tools: any[] = [];
  const handlers = new Map<string, Function>();

  return {
    tools,
    handlers,
    registerTool: vi.fn((tool: any) => tools.push(tool)),
    on: vi.fn((name: string, handler: Function) => handlers.set(name, handler)),
  };
}

describe("ralph-loop extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await activePi?.handlers.get("session_shutdown")?.({}, {});
    activePi = null;
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
      { cwd: "/repo" },
    );

    expect(mockLib.inspectRalphLoop).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "pi",
      stateDir: undefined,
      promptPath: undefined,
    });
    expect(result.content[0].text).toContain("state_dir: /repo/.pi/ralph");
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
      { cwd: "/repo" },
    );

    expect(mockLib.runRalphLoop).toHaveBeenCalledWith({
      cwd: "/repo",
      runtime: "pi",
      maxIterations: 3,
      sleepMs: 0,
      stateDir: undefined,
      promptPath: undefined,
    });
    expect(result.content[0].text).toContain("completed: true");
  });
});
