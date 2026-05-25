import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const session = {
  sessionId: "mock-session-id",
  subscribe: vi.fn(() => vi.fn()),
  prompt: vi.fn(() => Promise.resolve()),
  sendCustomMessage: vi.fn(() => Promise.resolve()),
  sendUserMessage: vi.fn(() => Promise.resolve()),
  isStreaming: false,
  abort: vi.fn(() => Promise.resolve()),
  dispose: vi.fn(),
  agent: { state: { tools: [{ name: "read" }, { name: "edit" }] } },
};

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(() => Promise.resolve({ session })),
  SessionManager: { inMemory: vi.fn(() => ({})) },
}));

import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { SubagentLifecycle, type SpawnDelegationAdapters } from "./subagentLifecycle.js";
import type { AgentMetadata, SubagentAuthority } from "./types.js";

function registerAgent(registry: AgentRegistry, cwd: string): AgentMetadata {
  const reservation = registry.reserveSpawnSlot("/root/task");
  const agent: AgentMetadata = {
    agentId: "a1",
    sessionId: "s1",
    agentPath: "/root/task",
    status: "running",
    lastTaskMessage: "start",
    createdAt: 1,
    updatedAt: 1,
    depth: 1,
    open: true,
    cancellationRequested: false,
    workspaceCwd: cwd,
  };
  registry.registerAgent(agent, reservation);
  return agent;
}

function adapters(overrides: Partial<SpawnDelegationAdapters> = {}): SpawnDelegationAdapters {
  const externalPiSlots = new Set<string>();
  return {
    pi: { getActiveTools: vi.fn(() => []) } as any,
    displayMode: "none",
    kitty: { appendLog: vi.fn(), close: vi.fn(), launchPiWindow: vi.fn(), launchPiSplit: vi.fn() } as any,
    hubFactory: vi.fn() as any,
    piCommand: "pi",
    helloTimeoutMs: 10,
    allowUnsafeExternalPi: false,
    maxQueuedSubagents: 2,
    maxExternalPiSubagents: 1,
    externalPiSlots,
    normalizeAuthority: (authority?: SubagentAuthority) => ({ mode: "propose_patch", require_base_hash: true, max_patch_bytes: 1_000, ...(authority ?? {}) }),
    authorityPreamble: () => undefined,
    filterToolsByAuthority: (tools) => tools,
    resolveModel: vi.fn(async (_model, ctx: any) => ctx.model),
    resolveThinkingLevel: () => undefined,
    displayResult: (display) => display ? { kind: display.kind, status: display.status } : undefined,
    ...overrides,
  };
}

const ctx = { cwd: "/tmp/subagent-lifecycle-test", model: { id: "model" }, modelRegistry: { find: vi.fn(), getAvailable: vi.fn() } } as any;

describe("SubagentLifecycle", () => {
  it("stores structured subagent results and enqueues a final_result", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "sl-"));
    try {
      const registry = new AgentRegistry(4, 3);
      const mailbox = new Mailbox();
      registerAgent(registry, cwd);
      const lifecycle = new SubagentLifecycle(registry, mailbox, cwd);

      const message = lifecycle.handleFinalText({
        agentId: "a1",
        agentPath: "/root/task",
        callerPath: "/root",
        status: "completed",
        cwd,
        finalText: JSON.stringify({ schema: "subagent.result.v1", outcome: "no_change", summary: "nothing to change" }),
      });

      expect(message).toContain("no_change");
      expect(registry.get("/root/task")?.lastTaskMessage).toBe(message);
      expect(lifecycle.resultStoreFor(cwd).list()).toHaveLength(1);
      expect(mailbox.pendingFor("/root").at(-1)?.kind).toBe("final_result");
      expect(mailbox.allEvents().at(-1)?.type).toBe("agent_final_message");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to truncated text when final text is not a structured result", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "sl-"));
    try {
      const registry = new AgentRegistry(4, 3);
      const mailbox = new Mailbox();
      registerAgent(registry, cwd);
      const lifecycle = new SubagentLifecycle(registry, mailbox, cwd);

      const message = lifecycle.handleFinalText({ agentId: "a1", agentPath: "/root/task", callerPath: "/root", status: "completed", cwd, finalText: "plain final text" });

      expect(message).toBe("plain final text");
      expect(lifecycle.resultStoreFor(cwd).list()).toHaveLength(0);
      expect(mailbox.pendingFor("/root").at(-1)?.content).toBe("plain final text");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("owns queued subagent admission and queued messages", async () => {
    const registry = new AgentRegistry(1, 2);
    const mailbox = new Mailbox();
    const lifecycle = new SubagentLifecycle(registry, mailbox, ctx.cwd);

    const result = await lifecycle.spawnDelegation({
      params: { task_name: "queued", message: "wait" },
      ctx,
      callerPath: "/root",
      agentId: "sub_queued",
      adapters: adapters(),
    });

    expect(result).toMatchObject({ task_name: "/root/queued", status: "queued", queue_position: 1, queued_ahead: 0 });
    expect(registry.get("/root/queued")?.status).toBe("queued");
    expect(lifecycle.queueMessageToQueued("/root/queued", "extra context")).toBe(true);
    expect(lifecycle.removeQueued("/root/queued")).toBe(true);
  });

  it("owns runtime close cleanup for in-process sessions", async () => {
    session.abort.mockClear();
    session.dispose.mockClear();
    const registry = new AgentRegistry(2, 2);
    const mailbox = new Mailbox();
    const lifecycle = new SubagentLifecycle(registry, mailbox, ctx.cwd);
    const runtimeAdapters = adapters();

    await lifecycle.spawnDelegation({
      params: { task_name: "running", message: "go" },
      ctx,
      callerPath: "/root",
      agentId: "sub_running",
      adapters: runtimeAdapters,
    });

    await lifecycle.closeRuntime("/root/running", { kitty: runtimeAdapters.kitty, externalPiSlots: runtimeAdapters.externalPiSlots });

    expect(session.abort).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(registry.get("/root/running")?.status).toBe("shutdown");
    expect(lifecycle.getRuntime("/root/running")).toBeUndefined();
  });
});
