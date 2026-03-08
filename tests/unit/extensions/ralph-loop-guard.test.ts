/**
 * path: tests/unit/extensions/ralph-loop-guard.test.ts
 * role: Ralph Loop guard の runtime enforcement を検証する
 * why: search-before-change と verification-before-closeout が壊れないようにするため
 * related: .pi/extensions/ralph-loop-guard.ts, .pi/lib/agent/runtime-notifications.ts, .pi/lib/agent/prompt-stack.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

function createPiMock() {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<any> | any>();

  return {
    handlers,
    on: vi.fn((name: string, handler: any) => handlers.set(name, handler)),
  };
}

describe("ralph-loop-guard extension", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("before_agent_start で Ralph Loop 状態を prompt に注入する", async () => {
    const extension = (await import("../../../.pi/extensions/ralph-loop-guard.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, { ui: { notify: vi.fn() } });
    const result = await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    expect(String(result?.systemPrompt)).toContain("Ralph Loop State");
    expect(String(result?.systemPrompt)).toContain("Runtime Notifications");
  });

  it("検索証跡なしの mutation を block する", async () => {
    const extension = (await import("../../../.pi/extensions/ralph-loop-guard.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, { ui: { notify: vi.fn() } });
    await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    const result = await pi.handlers.get("tool_call")?.({ toolName: "edit", input: { path: "a.ts" } }, {});

    expect(result?.block).toBe(true);
    expect(String(result?.reason)).toContain("search before change");
  });

  it("検索後の mutation を許可し、verification 前 closeout を block する", async () => {
    const extension = (await import("../../../.pi/extensions/ralph-loop-guard.js")).default;
    const pi = createPiMock();

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, { ui: { notify: vi.fn() } });
    await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    const searchResult = await pi.handlers.get("tool_call")?.({ toolName: "code_search", input: { query: "demo" } }, {});
    expect(searchResult).toBeUndefined();

    const mutationResult = await pi.handlers.get("tool_call")?.({ toolName: "edit", input: { path: "a.ts" } }, {});
    expect(mutationResult).toBeUndefined();

    const closeoutBlocked = await pi.handlers.get("tool_call")?.({
      toolName: "plan_update_step",
      input: { status: "completed" },
    }, {});
    expect(closeoutBlocked?.block).toBe(true);
    expect(String(closeoutBlocked?.reason)).toContain("plan step completed");
  });

  it("成功 verification 後は closeout を許可する", async () => {
    const extension = (await import("../../../.pi/extensions/ralph-loop-guard.js")).default;
    const pi = createPiMock();
    const notifications: Array<{ message: string; level: string }> = [];

    extension(pi as never);
    await pi.handlers.get("session_start")?.({}, {
      ui: { notify: (message: string, level: string) => notifications.push({ message, level }) },
    });
    await pi.handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await pi.handlers.get("tool_call")?.({ toolName: "code_search", input: { query: "demo" } }, {});
    await pi.handlers.get("tool_call")?.({ toolName: "edit", input: { path: "a.ts" } }, {});
    await pi.handlers.get("tool_call")?.({ toolName: "workspace_verify", input: {} }, {});
    await pi.handlers.get("tool_result")?.({
      toolName: "workspace_verify",
      input: {},
      isError: false,
    }, {
      ui: { notify: (message: string, level: string) => notifications.push({ message, level }) },
    });

    const closeoutResult = await pi.handlers.get("tool_call")?.({
      toolName: "plan_update_step",
      input: { status: "completed" },
    }, {});

    expect(closeoutResult).toBeUndefined();
    expect(notifications.some((entry) => entry.message.includes("verification succeeded"))).toBe(true);
  });
});
