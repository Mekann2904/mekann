/**
 * tests/unit/extensions/subagents.integration.test.ts
 * subagents拡張の低モック統合テスト（ツール登録と基本実行フロー）を検証する。
 * subagents.test.tsのモック中心テストを補完し、実際の拡張挙動を確認するために存在する。
 * 関連ファイル: .pi/extensions/subagents.ts, .pi/extensions/subagents/storage.ts, tests/unit/extensions/subagents.test.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerSubagentExtension from "../../../.pi/extensions/subagents.js";

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
    expect(toolNames).toContain("subagent_run");
    expect(toolNames).toContain("subagent_run_parallel");
    expect(toolNames).toContain("subagent_status");
    expect(toolNames).toContain("subagent_runs");
    expect(toolNames).toContain("subagent_jobs");
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
    expect(existsSync(join(testCwd, ".pi", "subagents", "storage.json"))).toBe(true);
  });

  it("subagent_jobs returns empty state before background execution", async () => {
    const tool = pi.tools.get("subagent_jobs");
    expect(tool).toBeDefined();

    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };
    const result = await tool!.execute("tc-2", { limit: 10 }, undefined, undefined, ctx);

    expect(result.content[0].text).toContain("No background subagent jobs yet.");
    expect(Array.isArray(result.details.jobs)).toBe(true);
    expect(result.details.jobs).toHaveLength(0);
  });

  it("session_start initializes storage and emits load notification", async () => {
    const ctx = {
      cwd: testCwd,
      model: undefined,
      ui: { notify: pi.uiNotify },
    };

    await pi.emit("session_start", {}, ctx);

    expect(existsSync(join(testCwd, ".pi", "subagents", "storage.json"))).toBe(true);
    expect(pi.uiNotify).toHaveBeenCalledWith(
      "Subagent extension loaded (subagent_list, subagent_run, subagent_run_parallel, subagent_jobs)",
      "info",
    );
  });
});
