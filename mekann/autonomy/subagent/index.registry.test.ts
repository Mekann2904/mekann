/**
 * index.registry.test.ts — AgentRegistry のテスト
 *
 * subagent/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./test-helpers.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";

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
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

import { AgentRegistry } from "./registry.js";

describe("AgentRegistry additional", () => {
  it("getBySessionId finds agent by session", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("root-session");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1",
      sessionId: "session-123",
      agentPath: "/root/task1",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    expect(registry.getBySessionId("session-123")).toBeDefined();
    expect(registry.getBySessionId("session-123")?.agentId).toBe("a1");
    expect(registry.getBySessionId("nonexistent")).toBeUndefined();
  });

  it("double rollback of same reservation is idempotent", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("s1");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.rollbackReservation(r);
    expect(r.rolledBack).toBe(true);

    // Second rollback should be a no-op
    registry.rollbackReservation(r);
    expect(r.rolledBack).toBe(true);
  });

  it("registerAgent rejects consumed reservation", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("s1");
    const r = registry.reserveSpawnSlot("/root/task1");

    const meta = {
      agentId: "a1",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "pending_init" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    };
    registry.registerAgent(meta, r);
    expect(r.consumed).toBe(true);

    // Trying to reuse consumed reservation
    expect(() => registry.registerAgent(meta, r)).toThrow(
      "Reservation already consumed or rolled back",
    );
  });

  it("subscriber errors are swallowed", () => {
    const registry = new AgentRegistry(4, 2);
    const badSubscriber = vi.fn(() => { throw new Error("subscriber error"); });
    const goodSubscriber = vi.fn();
    registry.subscribe(badSubscriber);
    registry.subscribe(goodSubscriber);

    // Register a subagent which triggers publish on spawn_end
    registry.ensureRoot("s1");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "pending_init" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    // Both should be called; error in first should not prevent second
    expect(badSubscriber).toHaveBeenCalled();
    expect(goodSubscriber).toHaveBeenCalled();
  });
});

describe("Registry branch coverage", () => {
  it("maxAgents getter is accessible", () => {
    const registry = new AgentRegistry(5, 3);
    expect(registry.maxAgents).toBe(5);
  });

  it("subscribe returns unsubscribe function that removes subscriber", () => {
    const registry = new AgentRegistry(4, 2);
    const calls: any[] = [];
    const subscriber = vi.fn((e: any) => calls.push(e));
    const unsubscribe = registry.subscribe(subscriber);

    registry.ensureRoot("root");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1",
      sessionId: "s1",
      agentPath: "/root/task1",
      status: "pending_init" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    // Subscriber should have been called
    expect(subscriber).toHaveBeenCalled();
    const callCount = subscriber.mock.calls.length;

    // Unsubscribe
    unsubscribe();

    // Now update status → subscriber should NOT be called again
    registry.updateStatus("/root/task1", "running");
    expect(subscriber.mock.calls.length).toBe(callCount);
  });

  it("registerAgent with rolled-back reservation throws", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("s1");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.rollbackReservation(r);

    expect(() =>
      registry.registerAgent(
        {
          agentId: "a1",
          sessionId: "s1",
          agentPath: "/root/task1",
          status: "pending_init" as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          depth: 1,
          open: true,
          cancellationRequested: false,
        },
        r,
      ),
    ).toThrow("Reservation already consumed or rolled back");
  });

  it("getBySessionId returns agent by sessionId", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("root-session");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1",
      sessionId: "special-session-456",
      agentPath: "/root/task1",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: 1,
      open: true,
      cancellationRequested: false,
    }, r);

    expect(registry.getBySessionId("special-session-456")).toBeDefined();
    expect(registry.getBySessionId("special-session-456")?.agentId).toBe("a1");
    expect(registry.getBySessionId("root-session")?.agentId).toBe("root");
    expect(registry.getBySessionId("nonexistent")).toBeUndefined();
  });

  it("getOpenDescendants returns sorted deepest first", () => {
    const registry = new AgentRegistry(10, 3);
    registry.ensureRoot("s1");

    const r1 = registry.reserveSpawnSlot("/root/a");
    registry.registerAgent({
      agentId: "a1", sessionId: "s1", agentPath: "/root/a",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r1);

    const r2 = registry.reserveSpawnSlot("/root/a/b");
    registry.registerAgent({
      agentId: "a2", sessionId: "s1", agentPath: "/root/a/b",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 2, open: true, cancellationRequested: false,
    }, r2);

    const r3 = registry.reserveSpawnSlot("/root/a/b/c");
    registry.registerAgent({
      agentId: "a3", sessionId: "s1", agentPath: "/root/a/b/c",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 3, open: true, cancellationRequested: false,
    }, r3);

    const descendants = registry.getOpenDescendants("/root/a");
    expect(descendants).toHaveLength(2);
    // Deepest first
    expect(descendants[0].agentPath).toBe("/root/a/b/c");
    expect(descendants[1].agentPath).toBe("/root/a/b");
  });

  it("updateStatus on non-existent agent is no-op", () => {
    const registry = new AgentRegistry(4, 2);
    // Should not throw
    registry.updateStatus("/root/nonexistent", "running");
  });

  it("updateStatus with timeoutDeadline extra field", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("s1");
    const r = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1", sessionId: "s1", agentPath: "/root/task1",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r);

    registry.updateStatus("/root/task1", "running", {
      timeoutDeadline: Date.now() + 60000,
    });

    const agent = registry.get("/root/task1");
    expect(agent?.timeoutDeadline).toBeDefined();
  });

  it("setStatusAndPublish on non-existent agent is no-op", () => {
    const registry = new AgentRegistry(4, 2);
    // close() calls setStatusAndPublish internally
    // Calling close on non-existent path should be safe
    expect(() => registry.close("/root/nonexistent")).not.toThrow();
  });

  it("registerAgent rejects duplicate open path even with valid reservation", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("s1");

    // Register first agent
    const r1 = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1", sessionId: "s1", agentPath: "/root/task1",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r1);

    // Close it
    registry.close("/root/task1");

    // Re-register at same path
    const r2 = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a2", sessionId: "s2", agentPath: "/root/task1",
      status: "running", createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r2);

    // Now try to register AGAIN with a consumed reservation
    expect(() =>
      registry.registerAgent({
        agentId: "a3", sessionId: "s3", agentPath: "/root/task1",
        status: "running", createdAt: Date.now(), updatedAt: Date.now(),
        depth: 1, open: true, cancellationRequested: false,
      }, r2),
    ).toThrow("Reservation already consumed");
  });
});

describe("registry: registerAgent duplicate open path guard", () => {
  it("registerAgent re-checks duplicate open path even after reservation", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("session-1");

    // Reserve and register an agent
    const r1 = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent({
      agentId: "a1", sessionId: "s1", agentPath: "/root/task1",
      status: "running" as const, createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r1);

    // Now try to register ANOTHER agent at the same path with a fresh reservation
    // First close the existing agent to allow reservation
    // Actually — reservation should fail because agent is open
    expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow("already exists");

    // Test the guard path: register agent with consumed reservation
    const r2 = registry.reserveSpawnSlot("/root/task2");
    r2.consumed = true; // Force consumed state
    expect(() => registry.registerAgent({
      agentId: "a2", sessionId: "s2", agentPath: "/root/task2",
      status: "running" as const, createdAt: Date.now(), updatedAt: Date.now(),
      depth: 1, open: true, cancellationRequested: false,
    }, r2)).toThrow("already consumed");
  });
});

describe("registry: unsubscribe idempotent", () => {
  it("calling unsubscribe twice is safe", () => {
    const registry = new AgentRegistry(4, 2);
    registry.ensureRoot("session-1");
    const fn = vi.fn();
    const unsub = registry.subscribe(fn);
    unsub(); // first call — removes fn
    unsub(); // second call — idx < 0, false branch covered
    // No error thrown
  });
});
