/**
 * Coverage tests for agentControl.ts uncovered lines:
 *   - line 703: list() method body
 *   - lines 810-820: focus() method branches
 *   - line 829: shutdown() method
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(() =>
    Promise.resolve({
      session: {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
    }),
  ),
}));

import { AgentControl } from "./agentControl.js";
import type { AgentMetadata } from "./types.js";

const AgentControlAny = AgentControl as any;

function createMockPi() {
  return {
    getActiveTools: vi.fn(() => []),
  } as any;
}

const baseCtx = {
  cwd: "/tmp/test",
  model: { id: "test-model" },
  modelRegistry: {
    find: vi.fn(() => undefined),
    getAvailable: vi.fn(() => Promise.resolve([{ id: "test-model" }])),
  },
} as any;

/** Register an agent in the registry for testing list/focus/shutdown. */
function registerTestAgent(
  control: any,
  agentPath: string,
  overrides: Partial<AgentMetadata> = {},
): void {
  control.registry.ensureRoot("root");
  const meta: Partial<AgentMetadata> = {
    agentId: `agent-${agentPath.replace(/\//g, "_")}`,
    sessionId: "s1",
    agentPath,
    status: "running",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    depth: agentPath.split("/").length - 2,
    open: true,
    cancellationRequested: false,
    lastTaskMessage: "do something",
    nickname: "nick",
    role: "worker",
    authority: { mode: "propose_patch", require_base_hash: true },
    authorityEnforced: true,
    resultContract: undefined,
    display: undefined,
    ...overrides,
  };
  control.registry.agents.set(agentPath, meta);
}

// ─── list() ────────────────────────────────────────────────────

describe("AgentControl.list()", () => {
  it("maps agent metadata fields to snake_case result", () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1", {
      lastTaskMessage: "research this",
      nickname: "R1",
      role: "researcher",
      depth: 1,
      authority: { mode: "read_only", require_base_hash: false },
      authorityEnforced: false,
    });

    const result = control.list({ path_prefix: undefined });
    expect(result.agents).toHaveLength(2); // root + task1

    const listed = result.agents.find((a: any) => a.agent_path === "/root/task1");
    expect(listed).toBeDefined();
    expect(listed.agent_id).toContain("agent-");
    expect(listed.status).toBe("running");
    expect(listed.last_task).toBe("research this");
    expect(listed.nickname).toBe("R1");
    expect(listed.role).toBe("researcher");
    expect(listed.depth).toBe(1);
    expect(listed.authority).toEqual({ mode: "read_only", require_base_hash: false });
    expect(listed.authority_enforced).toBe(false);
    expect(listed.result_contract).toBeUndefined();
    expect(listed.display).toBeUndefined();
  });

  it("includes display when agent has one", () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-pi",
        status: "open",
        windowId: "w1",
        title: "task1 window",
        cwd: "/tmp",
        logPath: "/tmp/log.txt",
        socketPath: "/tmp/sock",
        pid: 1234,
      },
    });

    const result = control.list({});
    const listed = result.agents.find((a: any) => a.agent_path === "/root/task1");
    expect(listed.display).toEqual({
      kind: "kitty-pi",
      status: "open",
      window_id: "w1",
      title: "task1 window",
      log_path: "/tmp/log.txt",
      socket_path: "/tmp/sock",
      pid: 1234,
      error: undefined,
    });
  });

  it("filters by path_prefix", () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1");
    registerTestAgent(control, "/root/task2");

    const result = control.list({ path_prefix: "/root/task1" });
    // Only root + task1 should be returned
    const paths = result.agents.map((a: any) => a.agent_path);
    expect(paths).toContain("/root/task1");
    expect(paths).not.toContain("/root/task2");
  });
});

// ─── focus() ───────────────────────────────────────────────────

describe("AgentControl.focus()", () => {
  it("returns warning when agent has no display", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1", { display: undefined });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(false);
    expect(result.warning).toContain("No open kitty display");
  });

  it("returns warning when display kind is not kitty-pi or kitty-split", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "none",
        status: "open",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(false);
    expect(result.warning).toContain("No open kitty display");
  });

  it("returns warning when display status is not open", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-pi",
        status: "closed",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(false);
    expect(result.warning).toContain("No open kitty display");
  });

  it("returns focused=true when kitty.focus succeeds (kitty-pi)", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { focus: vi.fn(() => Promise.resolve()) };
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-pi",
        status: "open",
        windowId: "w1",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(true);
    expect(control.kitty.focus).toHaveBeenCalled();
  });

  it("returns focused=true when kitty.focus succeeds (kitty-split)", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { focus: vi.fn(() => Promise.resolve()) };
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-split",
        status: "open",
        windowId: "w2",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(true);
  });

  it("returns warning with Error message when kitty.focus throws Error", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { focus: vi.fn(() => Promise.reject(new Error("kitty crashed"))) };
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-pi",
        status: "open",
        windowId: "w1",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(false);
    expect(result.warning).toBe("kitty crashed");
  });

  it("returns warning with String(err) when kitty.focus throws non-Error", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { focus: vi.fn(() => Promise.reject("string error")) };
    registerTestAgent(control, "/root/task1", {
      display: {
        kind: "kitty-pi",
        status: "open",
        windowId: "w1",
      } as any,
    });

    const result = await control.focus("/root/task1", baseCtx);
    expect(result.focused).toBe(false);
    expect(result.warning).toBe("string error");
  });

  it("throws when agent not found", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.registry.ensureRoot("root");

    await expect(control.focus("/root/nonexistent", baseCtx)).rejects.toThrow("Agent not found");
  });
});

// ─── shutdown() ────────────────────────────────────────────────

describe("AgentControl.shutdown()", () => {
  it("closes all agents with open displays and clears registry", async () => {
    const kittyClose = vi.fn(() => Promise.resolve());
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { close: kittyClose };

    registerTestAgent(control, "/root/task1", {
      display: { kind: "kitty-pi", status: "open", windowId: "w1" } as any,
    });
    registerTestAgent(control, "/root/task2", {
      display: { kind: "kitty-pi", status: "closed", windowId: "w2" } as any,
    });

    // Spy on closeSingle (private). We'll verify kitty.close was called for open display.
    await control.shutdown();

    // kitty.close should be called for the open display (task1)
    expect(kittyClose).toHaveBeenCalledTimes(1);

    // Registry should be cleared
    expect(control.registry.list()).toHaveLength(0);
    // Mailbox clear was called (private events array) — verify via spy
    const clearSpy = vi.spyOn(control.mailbox, "clear");
    // Already cleared by shutdown — just verify registry is empty
    expect(control.registry.list()).toHaveLength(0);
  });

  it("handles kitty.close rejection gracefully during shutdown", async () => {
    const kittyClose = vi.fn(() => Promise.reject(new Error("close failed")));
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { close: kittyClose };

    registerTestAgent(control, "/root/task1", {
      display: { kind: "kitty-pi", status: "open", windowId: "w1" } as any,
    });

    // Should not throw
    await expect(control.shutdown()).resolves.toBeUndefined();
    expect(control.registry.list()).toHaveLength(0);
  });

  it("handles runtimes and childSessions during shutdown", async () => {
    const kittyClose = vi.fn(() => Promise.resolve());
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { close: kittyClose, focus: vi.fn(), appendLog: vi.fn() };

    registerTestAgent(control, "/root/task1");

    // Put entries in runtimes map — closeSingle will be called for them
    control.runtimes.set("/root/task1", {
      mode: "in_process",
      agentId: "agent-root_task1",
      session: {
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
    });

    // Spy on closeSingle to verify it's called
    const closeSingleSpy = vi.spyOn(control as any, "closeSingle");

    await control.shutdown();

    expect(closeSingleSpy).toHaveBeenCalledWith("/root/task1");
    expect(control.registry.list()).toHaveLength(0);
  });

  it("handles closeSingle rejection gracefully", async () => {
    const control = new AgentControlAny(createMockPi(), 4, 2);
    control.kitty = { close: vi.fn(() => Promise.resolve()), appendLog: vi.fn() };

    registerTestAgent(control, "/root/task1");

    // Make closeSingle fail by having an abort that rejects
    control.runtimes.set("/root/task1", {
      mode: "in_process",
      agentId: "agent-root_task1",
      session: {
        abort: vi.fn(() => Promise.reject(new Error("abort failed"))),
        dispose: vi.fn(),
      },
    });

    // Should not throw — catch(() => undefined) handles it
    await expect(control.shutdown()).resolves.toBeUndefined();
  });
});
