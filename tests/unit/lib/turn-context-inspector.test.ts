/**
 * @file .pi/lib/agent/turn-context-inspector.ts の単体テスト
 * @description 永続化された turn context snapshot の読み出しを検証する
 * @testFramework vitest
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  formatTurnExecutionSnapshot,
  loadLoopReplayInput,
  loadLoopTurnContextSnapshots,
  loadSubagentReplayInput,
  loadSubagentTurnContextSnapshot,
} from "../../../.pi/lib/agent/turn-context-inspector.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "turn-context-inspector-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("turn-context-inspector", () => {
  it("subagent artifact から turnContext を読み出す", () => {
    const dir = createTempDir();
    const file = join(dir, "run.json");
    writeFileSync(file, JSON.stringify({
      run: { runId: "run-1" },
      turnContext: {
        capturedAt: "2026-03-07T00:00:00.000Z",
        workspace: { cwd: "/repo/app", workspaceRoot: "/repo" },
        policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
        tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
        continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 12 },
        runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
        runtimeHints: ["Slow tool: bash took 2500ms"],
        decisions: {
          allowCommandExecution: true,
          allowSearchExtensions: false,
          allowSubtaskDelegation: true,
          preferredSubagentIds: ["implementer", "tester", "reviewer"],
          maxLoopIterations: 6,
          maxParallelSubagents: 4,
          retryOverrides: { maxRetries: 3 },
        },
      },
    }, null, 2));

    const snapshot = loadSubagentTurnContextSnapshot(file);

    expect(snapshot.workspace.cwd).toBe("/repo/app");
    expect(snapshot.policy.mode).toBe("build");
    expect(formatTurnExecutionSnapshot(snapshot)).toContain("Autonomy: high/build");
    expect(formatTurnExecutionSnapshot(snapshot)).toContain("Preferred subagents: implementer, tester, reviewer");
    expect(formatTurnExecutionSnapshot(snapshot)).toContain("parallel_cap=4");
  });

  it("loop summary から iteration ごとの turnContexts を読み出す", () => {
    const dir = createTempDir();
    const file = join(dir, "summary.json");
    writeFileSync(file, JSON.stringify({
      summary: { runId: "loop-1" },
      turnContexts: [
        {
          iteration: 2,
          snapshot: {
            capturedAt: "2026-03-07T00:00:01.000Z",
            workspace: { cwd: "/repo", workspaceRoot: "/repo" },
            policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
            tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
            continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 20 },
            runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
            runtimeHints: [],
          },
        },
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

    const entries = loadLoopTurnContextSnapshots(file);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.iteration).toBe(1);
    expect(entries[1]?.iteration).toBe(2);
  });

  it("subagent artifact から replay input を読み出す", () => {
    const dir = createTempDir();
    const file = join(dir, "run-replay.json");
    writeFileSync(file, JSON.stringify({
      run: { runId: "run-2", agentId: "researcher", task: "Inspect parser" },
      prompt: "Prompt body",
      output: "Result body",
      turnContext: {
        capturedAt: "2026-03-07T00:00:00.000Z",
        workspace: { cwd: "/repo/app", workspaceRoot: "/repo" },
        policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
        tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
        continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 12 },
        runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
        runtimeHints: [],
      },
    }, null, 2));

    const replay = loadSubagentReplayInput(file);

    expect(replay.run.agentId).toBe("researcher");
    expect(replay.run.task).toBe("Inspect parser");
    expect(replay.prompt).toBe("Prompt body");
  });

  it("loop summary から replay input を読み出す", () => {
    const dir = createTempDir();
    const file = join(dir, "loop-replay.json");
    writeFileSync(file, JSON.stringify({
      summary: {
        runId: "loop-3",
        task: "Refine parser",
        goal: "tests pass",
        verificationCommand: "npm test",
        config: {
          maxIterations: 4,
          timeoutMs: 60000,
          requireCitation: false,
          verificationTimeoutMs: 60000,
        },
      },
      references: [{ id: "R1", title: "notes", source: "./notes.md" }],
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

    const replay = loadLoopReplayInput(file);

    expect(replay.summary.task).toBe("Refine parser");
    expect(replay.references).toHaveLength(1);
    expect(replay.snapshots[0]?.iteration).toBe(1);
  });
});
