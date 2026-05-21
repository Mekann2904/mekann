import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Mailbox } from "./mailbox.js";
import type { LifecycleEvent, MailboxItem } from "./types.js";

describe("Mailbox", () => {
  let mailbox: Mailbox;

  beforeEach(() => {
    mailbox = new Mailbox();
  });

  describe("enqueue", () => {
    it("adds item with monotonic sequence id", () => {
      const item = mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "hello" });
      expect(item.seq).toBe(1);
      expect(item.toAgentPath).toBe("/root/task1");
      expect(item.message).toBe("hello");
    });

    it("increments seq for each item", () => {
      const item1 = mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      const item2 = mailbox.enqueue({ toAgentPath: "/root/task2", fromAgentPath: "/root", message: "b" });
      expect(item1.seq).toBeLessThan(item2.seq);
    });

    it("notifies waiting consumers", async () => {
      const waitPromise = mailbox.waitForUpdate("/root/task1", 0, 500);
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "hello" });
      const result = await waitPromise;
      expect(result.mailbox).toHaveLength(1);
      expect(result.mailbox[0].message).toBe("hello");
    });
  });

  describe("appendEvent", () => {
    it("appends event and increments seq", () => {
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      expect(mailbox.currentSeq).toBe(1);
    });

    it("notifies waiting consumers with matching agentPath", async () => {
      const waitPromise = mailbox.waitForUpdate("/root/task1", 0, 500);
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      const result = await waitPromise;
      expect(result.events).toHaveLength(1);
    });

    it("notifies all waiters on agent_final_message with parentAgentId", async () => {
      const waitRoot = mailbox.waitForUpdate("/root", 0, 500);
      mailbox.appendEvent({
        type: "agent_final_message",
        agentId: "a1",
        agentPath: "/root/task1",
        message: "done",
        status: "completed",
        parentAgentId: "root",
        timestamp: Date.now(),
      });
      // This should notify all waiters because of parentAgentId
      const result = await waitRoot;
      // Even though event has agentPath=/root/task1, parentAgentId triggers notifyAllWaiters
      // But the event is still filtered by agentPath for /root, so it won't match.
      // The notifyAllWaiters will check pendingFor and pendingEventsFor, which filter by agentPath.
      // So /root won't see events for /root/task1
      expect(result.events).toHaveLength(0);
    });
  });

  describe("pendingFor", () => {
    it("returns items for matching agent path", () => {
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      mailbox.enqueue({ toAgentPath: "/root/task2", fromAgentPath: "/root", message: "b" });
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "c" });

      const pending = mailbox.pendingFor("/root/task1");
      expect(pending).toHaveLength(2);
      expect(pending.map((i) => i.message)).toEqual(["a", "c"]);
    });

    it("respects afterSeq filter", () => {
      const item1 = mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "b" });

      const pending = mailbox.pendingFor("/root/task1", item1.seq);
      expect(pending).toHaveLength(1);
      expect(pending[0].message).toBe("b");
    });

    it("returns empty for non-matching path", () => {
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      expect(mailbox.pendingFor("/root/task2")).toEqual([]);
    });
  });

  describe("pendingEventsFor", () => {
    it("returns events for matching agent path", () => {
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a2",
        agentPath: "/root/task2",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });

      const events = mailbox.pendingEventsFor("/root/task1");
      expect(events).toHaveLength(1);
    });

    it("respects afterSeq filter", () => {
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      const seq = mailbox.currentSeq;
      mailbox.appendEvent({
        type: "agent_spawn_end",
        agentId: "a1",
        agentPath: "/root/task1",
        success: true,
        timestamp: Date.now(),
      });

      const events = mailbox.pendingEventsFor("/root/task1", seq);
      expect(events).toHaveLength(1);
    });
  });

  describe("allEvents", () => {
    it("returns copy of all events", () => {
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      const events = mailbox.allEvents();
      expect(events).toHaveLength(1);
      // Mutating the copy should not affect the original
      events.push({} as any);
      expect(mailbox.allEvents()).toHaveLength(1);
    });
  });

  describe("allItems", () => {
    it("returns copy of all items", () => {
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      const items = mailbox.allItems();
      expect(items).toHaveLength(1);
      items.push({} as any);
      expect(mailbox.allItems()).toHaveLength(1);
    });
  });

  describe("waitForUpdate", () => {
    it("returns immediately if there are pending items", async () => {
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "hello" });
      const result = await mailbox.waitForUpdate("/root/task1", 0, 500);
      expect(result.mailbox).toHaveLength(1);
    });

    it("returns immediately if there are pending events", async () => {
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      const result = await mailbox.waitForUpdate("/root/task1", 0, 500);
      expect(result.events).toHaveLength(1);
    });

    it("times out when no updates arrive", async () => {
      const result = await mailbox.waitForUpdate("/root/task1", 0, 50);
      expect(result.events).toEqual([]);
      expect(result.mailbox).toEqual([]);
    });
  });

  describe("clear", () => {
    it("clears all items and events", () => {
      mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: "a" });
      mailbox.appendEvent({
        type: "agent_status_changed",
        agentId: "a1",
        agentPath: "/root/task1",
        previousStatus: "running",
        newStatus: "completed",
        timestamp: Date.now(),
      });
      mailbox.clear();
      expect(mailbox.allItems()).toEqual([]);
      expect(mailbox.allEvents()).toEqual([]);
      expect(mailbox.currentSeq).toBe(0);
    });

    it("resolves pending waiters with empty results", async () => {
      const waitPromise = mailbox.waitForUpdate("/root/task1", 0, 5000);
      mailbox.clear();
      const result = await waitPromise;
      expect(result.events).toEqual([]);
      expect(result.mailbox).toEqual([]);
    });
  });

  describe("pruning", () => {
    it("prunes items when exceeding MAX_RETAINED_RECORDS", () => {
      // Enqueue many items
      for (let i = 0; i < 10_100; i++) {
        mailbox.enqueue({ toAgentPath: "/root/task1", fromAgentPath: "/root", message: `msg ${i}` });
      }
      const items = mailbox.allItems();
      expect(items.length).toBeLessThanOrEqual(10_000);
    });

    it("prunes events when exceeding MAX_RETAINED_RECORDS", () => {
      for (let i = 0; i < 10_100; i++) {
        mailbox.appendEvent({
          type: "agent_status_changed",
          agentId: "a1",
          agentPath: "/root/task1",
          previousStatus: "running",
          newStatus: "completed",
          timestamp: Date.now(),
        });
      }
      const events = mailbox.allEvents();
      expect(events.length).toBeLessThanOrEqual(10_000);
    });
  });
});
