/**
 * tests/unit/extensions/loop-inspect.integration.test.ts
 * loop inspect ツール登録と snapshot 読み出しを確認する。
 * 保存済み turn context をツール経由で読めることを固定するために存在する。
 * 関連ファイル: .pi/extensions/loop.ts, .pi/lib/agent/turn-context-inspector.ts, .pi/extensions/subagents.ts
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import registerLoopExtension, { resetForTesting } from "../../../.pi/extensions/loop.ts";

type RegisteredTool = {
  name: string;
  execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
  const tools = new Map<string, RegisteredTool>();
  const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();

  return {
    tools,
    registerTool(def: any) {
      tools.set(def.name, def as RegisteredTool);
    },
    registerCommand() {
      // no-op
    },
    appendEntry() {
      // no-op
    },
    on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
      const handlers = events.get(eventName) ?? [];
      handlers.push(handler);
      events.set(eventName, handlers);
    },
    getThinkingLevel() {
      return "off";
    },
    sendMessage() {
      // no-op
    },
  };
}

describe("loop inspect integration", () => {
  let testCwd: string;
  let pi: ReturnType<typeof createFakePi>;

  beforeEach(() => {
    resetForTesting();
    testCwd = mkdtempSync(join(tmpdir(), "loop-inspect-it-"));
    pi = createFakePi();
    registerLoopExtension(pi as any);
  });

  afterEach(() => {
    rmSync(testCwd, { recursive: true, force: true });
  });

  it("registers loop_inspect_run tool", () => {
    expect(pi.tools.has("loop_inspect_run")).toBe(true);
    expect(pi.tools.has("loop_replay_run")).toBe(true);
  });

  it("loop_inspect_run reads latest summary snapshot", async () => {
    const tool = pi.tools.get("loop_inspect_run");
    expect(tool).toBeDefined();

    const summaryDir = join(testCwd, ".pi", "agent-loop");
    const summaryFile = join(summaryDir, "latest-summary.json");
    mkdirSync(summaryDir, { recursive: true });
    writeFileSync(summaryFile, JSON.stringify({
      summary: { runId: "loop-1" },
      turnContexts: [
        {
          iteration: 1,
          snapshot: {
            capturedAt: "2026-03-07T00:00:00.000Z",
            workspace: { cwd: "/repo", workspaceRoot: "/repo" },
            policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
            tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
            continuation: { isFirstTurn: true, startupKind: "baseline", previousContextAvailable: false, sessionElapsedMs: 0 },
            runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
            runtimeHints: [],
          },
        },
      ],
    }, null, 2));

    const result = await tool!.execute("tc-1", {}, undefined, undefined, {
      cwd: testCwd,
      ui: {},
    });

    expect(result.content[0].text).toContain("Turn Execution Snapshot");
    expect(result.details.iteration).toBe(1);
  });

  it("loop_replay_run prepares replay input from summary file", async () => {
    const tool = pi.tools.get("loop_replay_run");
    expect(tool).toBeDefined();

    const summaryDir = join(testCwd, ".pi", "agent-loop");
    const summaryFile = join(summaryDir, "replay-summary.json");
    mkdirSync(summaryDir, { recursive: true });
    writeFileSync(summaryFile, JSON.stringify({
      summary: {
        runId: "loop-2",
        task: "Refine the parser",
        goal: "tests pass",
        verificationCommand: "npm test",
        config: {
          maxIterations: 4,
          timeoutMs: 60000,
          requireCitation: false,
          verificationTimeoutMs: 60000,
        },
      },
      references: [
        { id: "R1", title: "notes", source: "./notes.md" },
      ],
      turnContexts: [
        {
          iteration: 1,
          snapshot: {
            capturedAt: "2026-03-07T00:00:00.000Z",
            workspace: { cwd: "/repo", workspaceRoot: "/repo" },
            policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
            tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
            continuation: { isFirstTurn: true, startupKind: "baseline", previousContextAvailable: false, sessionElapsedMs: 0 },
            runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
            runtimeHints: [],
          },
        },
      ],
    }, null, 2));

    const result = await tool!.execute("tc-2", { summaryFile, prepareOnly: true }, undefined, undefined, {
      cwd: testCwd,
      ui: {},
    });

    expect(result.content[0].text).toContain("Loop Replay Input");
    expect(result.content[0].text).toContain("Refine the parser");
    expect(result.details.prepared).toBe(true);
  });
});
