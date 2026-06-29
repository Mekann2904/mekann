import { describe, it, expect, beforeEach } from "vitest";
import { Mailbox } from "./mailbox.js";

describe("Mailbox", () => {
  let mailbox: InstanceType<typeof Mailbox>;

  beforeEach(() => {
    mailbox = new Mailbox();
  });

  it("enqueue assigns monotonic seq", () => {
    const item1 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    const item2 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "world",
      timestamp: Date.now(),
      kind: "message",
    });
    expect(item1.seq).toBeLessThan(item2.seq);
    expect(item2.seq).toBe(item1.seq + 1);
  });

  it("pendingFor returns items for the target path", () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "for task1",
      timestamp: Date.now(),
      kind: "message",
    });
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task2",
      content: "for task2",
      timestamp: Date.now(),
      kind: "message",
    });

    const pending = mailbox.pendingFor("/root/task1");
    expect(pending).toHaveLength(1);
    expect(pending[0].content).toBe("for task1");
  });

  it("pendingFor respects afterSeq", () => {
    const item1 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "first",
      timestamp: Date.now(),
      kind: "message",
    });
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "second",
      timestamp: Date.now(),
      kind: "message",
    });

    const pending = mailbox.pendingFor("/root/task1", item1.seq);
    expect(pending).toHaveLength(1);
    expect(pending[0].content).toBe("second");
  });

  it("waitForUpdate resolves immediately for pending items", async () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });

    const result = await mailbox.waitForUpdate("/root/task1", 0, 100);
    expect(result.mailbox).toHaveLength(1);
  });

  it("waitForUpdate times out when no items", async () => {
    const result = await mailbox.waitForUpdate("/root/task1", 0, 50);
    expect(result.mailbox).toHaveLength(0);
    expect(result.events).toHaveLength(0);
    // Authoritative timeout signal (issue #152 / IC-029).
    expect(result.timed_out).toBe(true);
  });

  it("waitForUpdate reports timed_out=false on a real notification", async () => {
    const promise = mailbox.waitForUpdate("/root/task1", 0, 1000);
    await new Promise((r) => setTimeout(r, 5));
    mailbox.enqueue({ fromAgentId: "root", fromAgentPath: "/root", toAgentPath: "/root/task1", content: "hi", timestamp: Date.now(), kind: "message" });
    const result = await promise;
    expect(result.mailbox).toHaveLength(1);
    expect(result.timed_out).toBe(false);
  });

  it("waitForUpdate reports timed_out=false for immediate pending items", async () => {
    mailbox.enqueue({ fromAgentId: "root", fromAgentPath: "/root", toAgentPath: "/root/task1", content: "hi", timestamp: Date.now(), kind: "message" });
    const result = await mailbox.waitForUpdate("/root/task1", 0, 50);
    expect(result.timed_out).toBe(false);
  });

  it("waitForUpdateIndefinitely never reports a timeout", async () => {
    const promise = mailbox.waitForUpdateIndefinitely("/root/task1", 0);
    mailbox.enqueue({ fromAgentId: "root", fromAgentPath: "/root", toAgentPath: "/root/task1", content: "hi", timestamp: Date.now(), kind: "message" });
    const result = await promise;
    expect(result.timed_out).toBe(false);
  });

  it("honours a configurable retention cap", () => {
    const small = new Mailbox({ maxRetainedRecords: 3 });
    for (let i = 0; i < 10; i++) {
      small.enqueue({ fromAgentId: "root", fromAgentPath: "/root", toAgentPath: "/root/task1", content: `m${i}`, timestamp: Date.now(), kind: "message" });
    }
    expect(small.allItems()).toHaveLength(3);
    expect(small.allItems()[0]!.content).toBe("m7");
  });

  it("waitForUpdate resolves when item is enqueued", async () => {
    const promise = mailbox.waitForUpdate("/root/task1", 0, 200);

    // Enqueue after a small delay
    setTimeout(() => {
      mailbox.enqueue({
        fromAgentId: "root",
        fromAgentPath: "/root",
        toAgentPath: "/root/task1",
        content: "delayed",
        timestamp: Date.now(),
        kind: "message",
      });
    }, 20);

    const result = await promise;
    expect(result.mailbox).toHaveLength(1);
    expect(result.mailbox[0].content).toBe("delayed");
  });

  it("clear rejects all waiters", async () => {
    const promise = mailbox.waitForUpdate("/root/task1", 0, 100);
    mailbox.clear();
    const result = await promise;
    expect(result.mailbox).toHaveLength(0);
  });

  it("appendEvent stores events", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });

    const events = mailbox.pendingEventsFor("/root/task1");
    expect(events).toHaveLength(1);
  });

  it("currentSeq increments", () => {
    expect(mailbox.currentSeq).toBe(0);
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    expect(mailbox.currentSeq).toBe(1);
  });

  it("allEvents returns copy", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });
    const events = mailbox.allEvents();
    expect(events).toHaveLength(1);
    // Mutating the copy shouldn't affect the mailbox
    events.length = 0;
    expect(mailbox.allEvents()).toHaveLength(1);
  });

  it("allItems returns copy", () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    const items = mailbox.allItems();
    expect(items).toHaveLength(1);
    items.length = 0;
    expect(mailbox.allItems()).toHaveLength(1);
  });

  // ─── Lifecycle event seq / dedup tests ────────────────────────

  it("appendEvent assigns monotonic seq", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "running",
      newStatus: "completed",
      timestamp: Date.now(),
    });

    const events = mailbox.allEvents();
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBeDefined();
    expect(events[1].seq).toBeDefined();
    expect(events[0].seq!).toBeLessThan(events[1].seq!);
  });

  it("pendingEventsFor filters by afterSeq", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "running",
      newStatus: "completed",
      timestamp: Date.now(),
    });

    // All events
    const all = mailbox.pendingEventsFor("/root/task1");
    expect(all).toHaveLength(2);

    // Only events after the first one's seq
    const firstSeq = all[0].seq!;
    const later = mailbox.pendingEventsFor("/root/task1", firstSeq);
    expect(later).toHaveLength(1);
    expect((later[0] as any).newStatus).toBe("completed");
  });

  it("pendingEventsFor returns empty when all events are consumed", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "completed",
      timestamp: Date.now(),
    });

    const all = mailbox.pendingEventsFor("/root/task1");
    expect(all).toHaveLength(1);

    const afterLast = mailbox.pendingEventsFor("/root/task1", all[0].seq!);
    expect(afterLast).toHaveLength(0);
  });

  it("waitForUpdate does not return already-consumed events", async () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });

    // First wait sees the event
    const result1 = await mailbox.waitForUpdate("/root/task1", 0, 100);
    expect(result1.events).toHaveLength(1);
    const consumedSeq = result1.events[0].seq!;

    // Second wait with afterSeq=consumedSeq should see nothing
    const result2 = await mailbox.waitForUpdate("/root/task1", consumedSeq, 50);
    expect(result2.events).toHaveLength(0);
    expect(result2.mailbox).toHaveLength(0);
  });

  it("events and mailbox items share the same seq counter", () => {
    const item = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "msg",
      timestamp: Date.now(),
      kind: "message",
    });

    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });

    const events = mailbox.allEvents();
    // Event seq should be item seq + 1 (shared counter)
    expect(events[0].seq).toBe(item.seq + 1);
  });

  it("mixed mailbox items and events respect lastConsumedSeq correctly", async () => {
    // Enqueue a message (seq=1)
    const item = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });

    // Append an event (seq=2)
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });

    // First wait sees both
    const result1 = await mailbox.waitForUpdate("/root/task1", 0, 100);
    expect(result1.mailbox).toHaveLength(1);
    expect(result1.events).toHaveLength(1);

    // maxSeq is the larger of item.seq and event.seq
    const maxSeq = Math.max(item.seq, result1.events[0].seq!);

    // Second wait after consuming all should see nothing
    const result2 = await mailbox.waitForUpdate("/root/task1", maxSeq, 50);
    expect(result2.mailbox).toHaveLength(0);
    expect(result2.events).toHaveLength(0);
  });

  it("multiple events are returned in seq order", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "running",
      newStatus: "completed",
      timestamp: Date.now(),
    });
    mailbox.appendEvent({
      type: "agent_final_message",
      agentId: "a1",
      agentPath: "/root/task1",
      message: "done",
      status: "completed",
      timestamp: Date.now(),
    });

    const events = mailbox.pendingEventsFor("/root/task1");
    expect(events).toHaveLength(3);
    expect(events[0].seq).toBeLessThan(events[1].seq!);
    expect(events[1].seq).toBeLessThan(events[2].seq!);
    expect((events[0] as any).newStatus).toBe("running");
    expect((events[1] as any).newStatus).toBe("completed");
    expect(events[2].type).toBe("agent_final_message");
  });
});

// ─── Persistence ─────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────

