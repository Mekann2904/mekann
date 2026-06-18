import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "./registry.js";

describe("AgentRegistry", () => {
  let registry: InstanceType<typeof AgentRegistry>;

  beforeEach(() => {
    registry = new AgentRegistry(4, 2);
  });

  function makeMeta(
    agentId: string,
    path: string,
    depth?: number,
  ) {
    const d = depth ?? path.split("/").length - 2;
    return {
      agentId,
      sessionId: `session-${agentId}`,
      agentPath: path,
      status: "pending_init" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: d,
      open: true,
      cancellationRequested: false,
    };
  }

  it("ensures root agent", () => {
    const root = registry.ensureRoot("session-1");
    expect(root.agentPath).toBe("/root");
    expect(root.open).toBe(true);
  });

  it("returns existing root if already open", () => {
    const root1 = registry.ensureRoot("session-1");
    const root2 = registry.ensureRoot("session-1");
    expect(root1).toBe(root2);
  });

  it("rejects duplicate open task path", () => {
    registry.ensureRoot("session-1");
    const reservation = registry.reserveSpawnSlot("/root/task1");
    const meta = makeMeta("agent-1", "/root/task1");
    registry.registerAgent(meta, reservation);

    expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow(
      "already exists",
    );
  });

  it("reservation tokens are opaque, unique, crypto-random strings (issue #152)", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot("/root/t1");
    const r2 = registry.reserveSpawnSlot("/root/t2");
    expect(typeof r1.token).toBe("string");
    expect(r1.token).not.toBe(r2.token);
    expect(r1.token.length).toBeGreaterThanOrEqual(16);
  });

  it("allows closed path to be reused", () => {
    registry.ensureRoot("session-1");
    const reservation = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent(makeMeta("agent-1", "/root/task1"), reservation);
    registry.close("/root/task1");

    const reservation2 = registry.reserveSpawnSlot("/root/task1");
    expect(() =>
      registry.registerAgent(
        makeMeta("agent-2", "/root/task1"),
        reservation2,
      ),
    ).not.toThrow();
  });

  it("enforces max agents", () => {
    registry = new AgentRegistry(2, 2);
    registry.ensureRoot("session-1"); // 1 open (root)

    const r1 = registry.reserveSpawnSlot("/root/t1");
    registry.registerAgent(makeMeta("a1", "/root/t1"), r1); // 2 open

    expect(() => registry.reserveSpawnSlot("/root/t2")).toThrow(
      "Maximum number of open agents",
    );
  });

  it("enforces max depth", () => {
    registry = new AgentRegistry(10, 1);
    registry.ensureRoot("session-1");

    const r = registry.reserveSpawnSlot("/root/a/b");
    expect(() =>
      registry.registerAgent(makeMeta("a1", "/root/a/b", 2), r),
    ).toThrow("Maximum agent depth exceeded");
    registry.rollbackReservation(r);
  });

  it("rollback frees reservation (via consumed/rolledBack tracking)", () => {
    registry.ensureRoot("session-1");
    const r = registry.reserveSpawnSlot("/root/task1");
    expect(r.consumed).toBe(false);
    expect(r.rolledBack).toBe(false);
    registry.rollbackReservation(r);
    expect(r.rolledBack).toBe(true);
  });

  it("closeDescendants closes deepest first", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot("/root/t1");
    registry.registerAgent(makeMeta("a1", "/root/t1"), r1);
    const r2 = registry.reserveSpawnSlot("/root/t1/sub");
    registry.registerAgent(makeMeta("a2", "/root/t1/sub"), r2);

    const desc = registry.getOpenDescendants("/root/t1");
    expect(desc).toHaveLength(1);
    expect(desc[0].agentPath).toBe("/root/t1/sub");
  });

  it("updateStatus publishes events", () => {
    const events: any[] = [];
    registry.subscribe((e) => events.push(e));

    registry.ensureRoot("session-1");
    const r = registry.reserveSpawnSlot("/root/t1");
    registry.registerAgent(makeMeta("a1", "/root/t1"), r);
    registry.updateStatus("/root/t1", "running");

    const statusEvents = events.filter(
      (e) => e.type === "agent_status_changed",
    );
    expect(statusEvents.length).toBeGreaterThan(0);
    expect(statusEvents[0].newStatus).toBe("running");
  });

  it("list returns sorted agents", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot("/root/bbb");
    registry.registerAgent(makeMeta("a1", "/root/bbb"), r1);
    const r2 = registry.reserveSpawnSlot("/root/aaa");
    registry.registerAgent(makeMeta("a2", "/root/aaa"), r2);

    const list = registry.list();
    expect(list.map((a) => a.agentPath)).toEqual([
      "/root",
      "/root/aaa",
      "/root/bbb",
    ]);
  });

  it("list filters by prefix", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot("/root/research/api");
    registry.registerAgent(makeMeta("a1", "/root/research/api"), r1);
    const r2 = registry.reserveSpawnSlot("/root/build/deps");
    registry.registerAgent(makeMeta("a2", "/root/build/deps"), r2);

    const list = registry.list("/root/research");
    expect(list).toHaveLength(1);
    expect(list[0].agentPath).toBe("/root/research/api");
  });

  it("clear resets everything", () => {
    registry.ensureRoot("session-1");
    registry.clear();
    expect(registry.get("/root")).toBeUndefined();
  });

  it("isOpen returns correct state", () => {
    registry.ensureRoot("session-1");
    expect(registry.isOpen("/root")).toBe(true);
    expect(registry.isOpen("/root/nonexistent")).toBe(false);
  });

  it("getByAgentId finds agents", () => {
    registry.ensureRoot("session-1");
    const r = registry.reserveSpawnSlot("/root/t1");
    registry.registerAgent(makeMeta("test-agent-1", "/root/t1"), r);
    expect(registry.getByAgentId("test-agent-1")).toBeDefined();
    expect(registry.getByAgentId("nonexistent")).toBeUndefined();
  });

  // ─── Atomic slot + path reservation tests ───────────────────

  it("reservations count toward maxAgents limit", () => {
    registry = new AgentRegistry(3, 2);
    registry.ensureRoot("session-1"); // 1 open (root)

    // Reserve a slot without committing — counts toward the limit
    const r1 = registry.reserveSpawnSlot("/root/t1");
    // openCount is 1, but activeCount (open + reserved) is 2
    expect(registry.openCount).toBe(1);

    // Reserve another slot — activeCount is now 3 (= maxAgents)
    const r2 = registry.reserveSpawnSlot("/root/t2");

    // Third reservation should fail (activeCount would be 4 > 3)
    expect(() => registry.reserveSpawnSlot("/root/t3")).toThrow(
      "Maximum number of open agents",
    );

    // Rollback r2 frees a slot
    registry.rollbackReservation(r2);
    expect(() => registry.reserveSpawnSlot("/root/t3")).not.toThrow();
  });

  it("duplicate path is rejected at reservation time", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot("/root/task1");

    // Same path reserved but not yet committed
    expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow(
      "reservation already exists",
    );

    // After commit, it should say "already exists" (open agent)
    registry.registerAgent(makeMeta("a1", "/root/task1"), r1);
    expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow(
      "already exists",
    );
  });

  it("rollback then re-spawn succeeds", () => {
    registry = new AgentRegistry(2, 2);
    registry.ensureRoot("session-1"); // 1 open (root)

    // Reserve and rollback
    const r1 = registry.reserveSpawnSlot("/root/task1");
    registry.rollbackReservation(r1);

    // Path is free again
    const r2 = registry.reserveSpawnSlot("/root/task1");
    registry.registerAgent(makeMeta("a1", "/root/task1"), r2);
    expect(registry.openCount).toBe(2);
  });

  it("clear also clears reservations", () => {
    registry.ensureRoot("session-1");
    registry.reserveSpawnSlot("/root/task1");
    registry.reserveSpawnSlot("/root/task2");

    registry.clear();

    // Should be able to reserve again after clear
    expect(() => registry.reserveSpawnSlot("/root/task1")).not.toThrow();
  });
});

// ─── Mailbox ─────────────────────────────────────────────────────

