/**
 * Tests for SubagentSurfaceSync — tool surface visibility
 * driven by lifecycle state.
 *
 * These tests verify the surface sync seam without depending on
 * tool handler internals or Pi extension registration.
 */

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
import { hasInteractiveSubagentState, hasPendingResults, syncSubagentToolSurface } from "./subagentSurfaceSync.js";
import type { AgentMetadata, SubagentAuthority } from "./types.js";
import { SubagentResultStore } from "./resultStore.js";

function registerAgent(registry: AgentRegistry, cwd: string, overrides: Partial<AgentMetadata> = {}): AgentMetadata {
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
    ...overrides,
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

const ctx = { cwd: "/tmp/subagent-surface-sync-test", model: { id: "model" }, modelRegistry: { find: vi.fn(), getAvailable: vi.fn() } } as any;

describe("hasInteractiveSubagentState", () => {
  it("returns false when only root exists", () => {
    const registry = new AgentRegistry(4, 3);
    registry.ensureRoot("root");
    expect(hasInteractiveSubagentState(registry.list())).toBe(false);
  });

  it("returns true when a subagent is running", () => {
    const registry = new AgentRegistry(4, 3);
    registry.ensureRoot("root");
    const cwd = mkdtempSync(path.join(tmpdir(), "surf-"));
    try {
      registerAgent(registry, cwd, { status: "running" });
      expect(hasInteractiveSubagentState(registry.list())).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns true when a subagent is queued", () => {
    const registry = new AgentRegistry(4, 3);
    registry.ensureRoot("root");
    const cwd = mkdtempSync(path.join(tmpdir(), "surf-"));
    try {
      registerAgent(registry, cwd, { status: "queued", agentPath: "/root/queued" });
      expect(hasInteractiveSubagentState(registry.list())).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns false when subagent is completed and closed", () => {
    const registry = new AgentRegistry(4, 3);
    registry.ensureRoot("root");
    const cwd = mkdtempSync(path.join(tmpdir(), "surf-"));
    try {
      registerAgent(registry, cwd, { status: "completed", open: false });
      expect(hasInteractiveSubagentState(registry.list())).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("hasPendingResults", () => {
  it("returns false when store is empty", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "surf-"));
    try {
      const store = new SubagentResultStore(cwd);
      expect(hasPendingResults(store)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("returns true when store has pending results", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "surf-"));
    try {
      const store = new SubagentResultStore(cwd);
      const registry = new AgentRegistry(4, 3);
      registry.ensureRoot("root");
      const agent = registerAgent(registry, cwd);
      store.save(agent, { schema: "subagent.result.v1", outcome: "observation", summary: "test", findings: [] });
      expect(hasPendingResults(store)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("syncSubagentToolSurface", () => {
  it("returns correct snapshot when no interactive agents exist", () => {
    const pi = { getActiveTools: vi.fn(() => []), setActiveTools: vi.fn() } as any;
    const registry = new AgentRegistry(4, 3);
    registry.ensureRoot("root");
    const snapshot = syncSubagentToolSurface(pi, registry.list(), undefined);
    expect(snapshot.hasInteractiveState).toBe(false);
    expect(snapshot.hasPendingResults).toBe(false);
  });
});

describe("SubagentLifecycle surface sync", () => {
  it("syncSurface delegates to syncSubagentToolSurface", () => {
    const registry = new AgentRegistry(4, 3);
    const mailbox = new Mailbox();
    const lifecycle = new SubagentLifecycle(registry, mailbox, ctx.cwd);
    lifecycle.initAdapters(adapters());

    const pi = { getActiveTools: vi.fn(() => []), setActiveTools: vi.fn() } as any;
    // Should not throw
    lifecycle.syncSurface(pi);
  });

  it("enableSurfaceSync subscribes to registry events and syncs on state change", () => {
    const registry = new AgentRegistry(4, 3);
    const mailbox = new Mailbox();
    const cwd = mkdtempSync(path.join(tmpdir(), "reactive-"));
    try {
      const lifecycle = new SubagentLifecycle(registry, mailbox, cwd);
      lifecycle.initAdapters(adapters());

      const setActiveToolsCalls: string[][] = [];
      const pi = {
        getActiveTools: vi.fn(() => []),
        setActiveTools: vi.fn((tools: string[]) => { setActiveToolsCalls.push([...tools]); }),
      } as any;

      lifecycle.enableSurfaceSync(pi);

      // Simulate agent registration → triggers registry subscriber
      registry.ensureRoot("root");
      const reservation = registry.reserveSpawnSlot("/root/task");
      registry.registerAgent({
        agentId: "a1", sessionId: "s1", agentPath: "/root/task", status: "running",
        lastTaskMessage: "start", createdAt: Date.now(), updatedAt: Date.now(),
        depth: 1, open: true, cancellationRequested: false, workspaceCwd: cwd,
      }, reservation);

      expect(setActiveToolsCalls.length).toBeGreaterThanOrEqual(1);
      lifecycle.disableSurfaceSync();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
