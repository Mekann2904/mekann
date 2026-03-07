/**
 * tests/unit/extensions/subagents.integration.test.ts
 * subagents拡張の低モック統合テスト（ツール登録と基本実行フロー）を検証する。
 * subagents.test.tsのモック中心テストを補完し、実際の拡張挙動を確認するために存在する。
 * 関連ファイル: .pi/extensions/subagents.ts, .pi/extensions/subagents/storage.ts, tests/unit/extensions/subagents.test.ts
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerSubagentExtension, { resetForTesting } from "../../../.pi/extensions/subagents.js";

type RegisteredTool = {
  name: string;
  execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
  const tools = new Map<string, RegisteredTool>();
  const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();

  return {
    tools,
    uiNotify: vi.fn(),
    sendMessage: vi.fn(),
    appendEntry: vi.fn(),
    eventsEmit: vi.fn(),
    registerTool(def: any) {
      tools.set(def.name, def as RegisteredTool);
    },
    registerCommand(_name: string, _def: any) {
      // no-op
    },
    on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
      const handlers = events.get(eventName) ?? [];
      handlers.push(handler);
      events.set(eventName, handlers);
    },
    events: {
      emit: vi.fn(),
    },
    async emit(eventName: string, event: any, ctx: any): Promise<void> {
      const handlers = events.get(eventName) ?? [];
      for (const handler of handlers) {
        await handler(event, ctx);
      }
    },
  };
}

describe("subagents extension integration", () => {
  let testCwd: string;
  let pi: ReturnType<typeof createFakePi>;

  beforeEach(() => {
    resetForTesting();
    testCwd = mkdtempSync(join(tmpdir(), "subagents-ext-it-"));
    pi = createFakePi();
    registerSubagentExtension(pi as any);
  });

  afterEach(() => {
    rmSync(testCwd, { recursive: true, force: true });
  });

  it("registers core subagent tools", () => {
    const toolNames = Array.from(pi.tools.keys());
    expect(toolNames).toContain("subagent_list");
    expect(toolNames).toContain("subagent_create");
    expect(toolNames).toContain("subagent_configure");
    expect(toolNames).toContain("subagent_run_dag");
    expect(toolNames).toContain("subagent_status");
    expect(toolNames).toContain("subagent_runs");
    expect(toolNames).toContain("subagent_inspect_run");
    expect(toolNames).toContain("subagent_replay_run");
    expect(toolNames).toContain("agent_benchmark_status");
  });

  it("subagent_list returns persisted default agents", async () => {
    const tool = pi.tools.get("subagent_list");
    expect(tool).toBeDefined();

    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };
    const result = await tool!.execute("tc-1", {}, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("Subagents:");
    expect(Array.isArray(result.details.agents)).toBe(true);
    expect(result.details.agents.length).toBeGreaterThan(0);
    expect(result.details.agents.some((agent: any) => agent.id === "researcher")).toBe(true);
  });

  it("subagent_status returns empty state before execution", async () => {
    const tool = pi.tools.get("subagent_status");
    expect(tool).toBeDefined();

    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };
    const result = await tool!.execute("tc-2", {}, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("active");
    expect(typeof result.details.activeRunRequests).toBe("number");
    expect(typeof result.details.activeAgents).toBe("number");
  });

  it("session_start initializes storage and emits load notification", async () => {
    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };

    await pi.emit("session_start", {}, ctx);

    expect(pi.uiNotify).toHaveBeenCalled();
    expect(pi.uiNotify.mock.calls[0]?.[0]).toContain("Subagent extension loaded");
  });

  it("subagent_inspect_run reads turn context from artifact file", async () => {
    const tool = pi.tools.get("subagent_inspect_run");
    expect(tool).toBeDefined();

    const artifactPath = join(testCwd, "artifact.json");
    writeFileSync(artifactPath, JSON.stringify({
      turnContext: {
        capturedAt: "2026-03-07T00:00:00.000Z",
        workspace: { cwd: "/repo/app", workspaceRoot: "/repo" },
        policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
        tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
        continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 10 },
        runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
        runtimeHints: [],
      },
    }, null, 2));

    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };
    const result = await tool!.execute("tc-3", { outputFile: artifactPath }, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("Turn Execution Snapshot");
    expect(result.details.snapshot.workspace.cwd).toBe("/repo/app");
  });

  it("subagent_replay_run prepares replay input from artifact file", async () => {
    const tool = pi.tools.get("subagent_replay_run");
    expect(tool).toBeDefined();

    const artifactPath = join(testCwd, "artifact-replay.json");
    writeFileSync(artifactPath, JSON.stringify({
      run: {
        runId: "run-1",
        agentId: "researcher",
        task: "Investigate the parser behavior",
      },
      turnContext: {
        capturedAt: "2026-03-07T00:00:00.000Z",
        workspace: { cwd: "/repo/app", workspaceRoot: "/repo" },
        policy: { profile: "high", mode: "build", gatekeeper: "deterministic", updatedAt: "2026-03-07T00:00:00.000Z" },
        tools: { availableToolNames: ["read"], activeToolNames: ["read"], dynamicToolNames: [] },
        continuation: { isFirstTurn: false, startupKind: "delta", previousContextAvailable: true, sessionElapsedMs: 10 },
        runtimeEnvironment: { repoRoot: "/repo", mainLanguage: "typescript", packageManager: "npm", testFramework: "vitest", frequentFiles: [], largeDirectoriesToAvoid: [] },
        runtimeHints: [],
      },
    }, null, 2));

    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };
    const result = await tool!.execute("tc-4", { outputFile: artifactPath, prepareOnly: true }, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("Subagent Replay Input");
    expect(result.content[0].text).toContain("Investigate the parser behavior");
    expect(result.details.prepared).toBe(true);
  });
});
