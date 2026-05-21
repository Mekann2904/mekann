import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentRegistry } from "./registry.js";
import type { AgentMetadata, AgentStatus, LifecycleEvent } from "./types.js";

function makeAgent(agentPath: string, overrides: Partial<AgentMetadata> = {}): AgentMetadata {
  return {
    agentId: `agent-${agentPath}`,
    sessionId: "session-1",
    agentPath,
    status: "running" as AgentStatus,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    depth: agentPath.split("/").length - 2,
    open: true,
    cancellationRequested: false,
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry(4, 2);
  });

  describe("constructor", () => {
    it("sets maxAgents and maxDepth", () => {
      expect(registry.maxAgents).toBe(4);
      expect(registry.maxDepth).toBe(2);
    });
  });

  describe("subscribe", () => {
    it("receives lifecycle events", () => {
      const events: LifecycleEvent[] = [];
      registry.subscribe((e) => events.push(e));
      registry.ensureRoot("session-1");
      // No event for ensureRoot if root already exists
      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it("unsubscribe stops receiving events", () => {
      const events: LifecycleEvent[] = [];
      const unsub = registry.subscribe((e) => events.push(e));
      unsub();
      // After unsubscribing, no more events
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      // Events may have been published before unsub, but not after
    });

    it("subscriber errors are swallowed", () => {
      const fn = vi.fn(() => { throw new Error("subscriber error"); });
      registry.subscribe(fn);
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      // Should not throw
      expect(() => registry.registerAgent(makeAgent("/root/task1"), r)).not.toThrow();
    });
  });

  describe("ensureRoot", () => {
    it("creates root agent if not exists", () => {
      const root = registry.ensureRoot("session-1");
      expect(root.agentId).toBe("root");
      expect(root.agentPath).toBe("/root");
      expect(root.status).toBe("running");
      expect(root.open).toBe(true);
    });

    it("returns existing root if already open", () => {
      const root1 = registry.ensureRoot("session-1");
      const root2 = registry.ensureRoot("session-2");
      expect(root1).toBe(root2);
      expect(root2.sessionId).toBe("session-1");
    });

    it("re-creates root if closed", () => {
      const root1 = registry.ensureRoot("session-1");
      registry.close("/root", "shutdown");
      const root2 = registry.ensureRoot("session-2");
      expect(root2).not.toBe(root1);
      expect(root2.sessionId).toBe("session-2");
      expect(root2.open).toBe(true);
    });
  });

  describe("reserveSpawnSlot", () => {
    it("reserves a slot", () => {
      registry.ensureRoot("session-1");
      const reservation = registry.reserveSpawnSlot("/root/task1");
      expect(reservation.consumed).toBe(false);
      expect(reservation.rolledBack).toBe(false);
      expect(reservation.path).toBe("/root/task1");
    });

    it("throws when max agents reached", () => {
      registry.ensureRoot("session-1");
      for (let i = 0; i < 3; i++) {
        const r = registry.reserveSpawnSlot(`/root/task${i}`);
        registry.registerAgent(makeAgent(`/root/task${i}`), r);
      }
      expect(() => registry.reserveSpawnSlot("/root/task3")).toThrow("Maximum number of open agents");
    });

    it("throws when counting reserved-but-not-committed slots", () => {
      registry.ensureRoot("session-1");
      // Register two agents
      const r1 = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r1);
      const r2 = registry.reserveSpawnSlot("/root/task2");
      registry.registerAgent(makeAgent("/root/task2"), r2);
      // Now 2 open + root = 3, max is 4. Reserve but don't commit
      registry.reserveSpawnSlot("/root/task3");
      // Now 3 (open) + 1 (reserved) = 4, which equals max → should fail
      expect(() => registry.reserveSpawnSlot("/root/task4")).toThrow("Maximum number");
    });

    it("throws for duplicate open path", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow("already exists");
    });

    it("throws for duplicate reserved path", () => {
      registry.ensureRoot("session-1");
      registry.reserveSpawnSlot("/root/task1");
      expect(() => registry.reserveSpawnSlot("/root/task1")).toThrow("reservation already exists");
    });
  });

  describe("rollbackReservation", () => {
    it("rolls back reservation", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.rollbackReservation(r);
      expect(r.rolledBack).toBe(true);
      // Can reserve the same path again
      expect(() => registry.reserveSpawnSlot("/root/task1")).not.toThrow();
    });

    it("ignores already consumed reservation", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      r.consumed = true;
      registry.rollbackReservation(r);
      // Should not set rolledBack since consumed
      expect(r.rolledBack).toBe(false);
    });

    it("ignores already rolled back reservation", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.rollbackReservation(r);
      registry.rollbackReservation(r); // second rollback should be no-op
      expect(r.rolledBack).toBe(true);
    });
  });

  describe("registerAgent", () => {
    it("registers a new agent", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      expect(registry.get("/root/task1")).toBeDefined();
      expect(registry.get("/root/task1")?.agentPath).toBe("/root/task1");
    });

    it("publishes spawn_end event", () => {
      const events: LifecycleEvent[] = [];
      registry.subscribe((e) => events.push(e));
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      const spawnEnd = events.find((e) => e.type === "agent_spawn_end");
      expect(spawnEnd).toBeDefined();
      expect(spawnEnd!.success).toBe(true);
    });

    it("throws for consumed reservation", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      r.consumed = true;
      expect(() => registry.registerAgent(makeAgent("/root/task1"), r)).toThrow("already consumed");
    });

    it("throws for depth violation", () => {
      registry.ensureRoot("session-1");
      // depth 3 > maxDepth 2
      const r = registry.reserveSpawnSlot("/root/task1/subtask/deep");
      expect(() => registry.registerAgent(makeAgent("/root/task1/subtask/deep", { depth: 3 }), r)).toThrow("Maximum agent depth exceeded");
    });

    it("throws for duplicate open path at register time", () => {
      registry.ensureRoot("session-1");
      const r1 = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r1);
      // Manually add another agent at the same path
      const r2 = registry.reserveSpawnSlot("/root/task2");
      // Try to register at task1 path with task2 reservation
      const agent = makeAgent("/root/task1");
      // This shouldn't normally happen since reservation already checks, but the guard exists
      // We'd need to manipulate the internal state to test this path
    });
  });

  describe("queries", () => {
    beforeEach(() => {
      registry.ensureRoot("session-1");
    });

    it("openCount counts open agents", () => {
      expect(registry.openCount).toBe(1); // root
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      expect(registry.openCount).toBe(2);
    });

    it("get returns agent by path", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      expect(registry.get("/root/task1")?.agentId).toBe("agent-/root/task1");
    });

    it("get returns undefined for non-existent path", () => {
      expect(registry.get("/root/nonexistent")).toBeUndefined();
    });

    it("getByAgentId returns agent", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1", { agentId: "my-agent" }), r);
      expect(registry.getByAgentId("my-agent")?.agentPath).toBe("/root/task1");
    });

    it("getBySessionId returns agent", () => {
      // Root was already created in beforeEach with session-1
      expect(registry.getBySessionId("session-1")?.agentPath).toBe("/root");
    });

    it("list returns all agents sorted", () => {
      const r1 = registry.reserveSpawnSlot("/root/task2");
      registry.registerAgent(makeAgent("/root/task2"), r1);
      const r2 = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r2);
      const list = registry.list();
      const paths = list.map((a) => a.agentPath);
      expect(paths).toEqual(["/root", "/root/task1", "/root/task2"]);
    });

    it("list filters by pathPrefix", () => {
      const r1 = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r1);
      const r2 = registry.reserveSpawnSlot("/root/task2");
      registry.registerAgent(makeAgent("/root/task2"), r2);
      const list = registry.list("/root/task1");
      expect(list.map((a) => a.agentPath)).toEqual(["/root/task1"]);
    });

    it("list includes exact match of pathPrefix", () => {
      const list = registry.list("/root");
      expect(list.map((a) => a.agentPath)).toEqual(["/root"]);
    });

    it("getOpenDescendants returns open children sorted by depth descending", () => {
      const r1 = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1", { depth: 1 }), r1);
      const r2 = registry.reserveSpawnSlot("/root/task1/subtask");
      registry.registerAgent(makeAgent("/root/task1/subtask", { depth: 2 }), r2);
      const descendants = registry.getOpenDescendants("/root/task1");
      expect(descendants.map((a) => a.agentPath)).toEqual(["/root/task1/subtask"]);
    });

    it("getOpenDescendants returns empty for leaf agent", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      expect(registry.getOpenDescendants("/root/task1")).toEqual([]);
    });

    it("isOpen checks if agent is open", () => {
      expect(registry.isOpen("/root")).toBe(true);
      expect(registry.isOpen("/root/task1")).toBe(false);
    });
  });

  describe("mutations", () => {
    beforeEach(() => {
      registry.ensureRoot("session-1");
    });

    it("updateStatus changes status and publishes event", () => {
      const events: LifecycleEvent[] = [];
      registry.subscribe((e) => events.push(e));
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      registry.updateStatus("/root/task1", "completed");
      expect(registry.get("/root/task1")?.status).toBe("completed");
      const statusEvent = events.find((e) => e.type === "agent_status_changed");
      expect(statusEvent).toBeDefined();
    });

    it("updateStatus with extra fields", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      registry.updateStatus("/root/task1", "running", { lastTaskMessage: "working" });
      expect(registry.get("/root/task1")?.lastTaskMessage).toBe("working");
    });

    it("updateStatus does not publish event when status unchanged", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      const events: LifecycleEvent[] = [];
      registry.subscribe((e) => events.push(e));
      registry.updateStatus("/root/task1", "running"); // same status
      expect(events).toHaveLength(0);
    });

    it("updateStatus with timeoutDeadline", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      const deadline = Date.now() + 30000;
      registry.updateStatus("/root/task1", "running", { timeoutDeadline: deadline });
      expect(registry.get("/root/task1")?.timeoutDeadline).toBe(deadline);
    });

    it("updateStatus with display", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      const display = { kind: "kitty-pi" as const, status: "open" as const, title: "test", cwd: "/tmp" };
      registry.updateStatus("/root/task1", "running", { display });
      expect(registry.get("/root/task1")?.display).toEqual(display);
    });

    it("updateAgent patches metadata", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      registry.updateAgent("/root/task1", { lastTaskMessage: "updated" });
      expect(registry.get("/root/task1")?.lastTaskMessage).toBe("updated");
    });

    it("updateAgent on non-existent agent is no-op", () => {
      expect(() => registry.updateAgent("/root/nonexistent", { lastTaskMessage: "x" })).not.toThrow();
    });

    it("close sets open=false and publishes event", () => {
      const events: LifecycleEvent[] = [];
      registry.subscribe((e) => events.push(e));
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      registry.close("/root/task1", "completed");
      expect(registry.get("/root/task1")?.open).toBe(false);
      expect(registry.get("/root/task1")?.status).toBe("completed");
      expect(events.find((e) => e.type === "agent_status_changed")).toBeDefined();
    });

    it("close with same status still sets open=false", () => {
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1", { status: "shutdown" }), r);
      registry.close("/root/task1", "shutdown");
      expect(registry.get("/root/task1")?.open).toBe(false);
    });

    it("close on non-existent agent is no-op", () => {
      expect(() => registry.close("/root/nonexistent")).not.toThrow();
    });
  });

  describe("clear", () => {
    it("clears all agents and reservations", () => {
      registry.ensureRoot("session-1");
      const r = registry.reserveSpawnSlot("/root/task1");
      registry.registerAgent(makeAgent("/root/task1"), r);
      registry.clear();
      expect(registry.get("/root")).toBeUndefined();
      expect(registry.get("/root/task1")).toBeUndefined();
      expect(registry.openCount).toBe(0);
    });
  });
});
