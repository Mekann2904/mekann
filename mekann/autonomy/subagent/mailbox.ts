/**
 * Subagent Extension — Mailbox / event queue.
 *
 * Provides async enqueue/consume with monotonic sequence IDs.
 * Avoids busy polling by using Promise resolvers.
 */

import type { LifecycleEvent, MailboxItem } from "./types.js";

const MAX_RETAINED_RECORDS = 10_000;

/** Compact status-change chains: keep only the last status per agent in a window. */
function compactStatusEvents(events: LifecycleEvent[]): LifecycleEvent[] {
  const out: LifecycleEvent[] = [];
  const lastStatusByAgent = new Map<string, LifecycleEvent>();
  for (const event of events) {
    if (event.type === "agent_status_changed") {
      lastStatusByAgent.set(event.agentPath, event);
    } else {
      if (lastStatusByAgent.size > 0) {
        for (const [, last] of lastStatusByAgent) out.push(last);
        lastStatusByAgent.clear();
      }
      out.push(event);
    }
  }
  // Flush remaining
  for (const [, last] of lastStatusByAgent) out.push(last);
  return out;
}

export class Mailbox {
  private seq = 0;
  private items: MailboxItem[] = [];
  private events: LifecycleEvent[] = [];
  private waiters = new Set<{
    agentPath: string;
    afterSeq: number;
    resolve: (value: { events: LifecycleEvent[]; mailbox: MailboxItem[] }) => void;
  }>();

  /**
   * Enqueue a mailbox item. Notifies any waiting consumer.
   */
  enqueue(item: Omit<MailboxItem, "seq">): MailboxItem {
    const full: MailboxItem = { ...item, seq: ++this.seq };
    this.items.push(full);
    this.pruneRetainedRecords();
    this.notifyWaiters((ap) => ap === item.toAgentPath);
    return full;
  }

  /**
   * Append a lifecycle event. Notifies any waiting consumer.
   */
  appendEvent(event: LifecycleEvent): void {
    (event as any).seq = ++this.seq;
    this.events.push(event);
    this.pruneRetainedRecords();
    // Notify based on the event's agentPath
    const agentPath =
      "agentPath" in event ? (event as any).agentPath as string : undefined;
    if (agentPath) {
      this.notifyWaiters((ap) => ap === agentPath);
    }
    // Also notify parent if this is a final message
    if (event.type === "agent_final_message" && event.parentAgentId) {
      // Parent path resolution is done externally; we just notify all waiters
      this.notifyAllWaiters();
    }
  }

  /**
   * Get pending mailbox items for a given agent path with seq > afterSeq.
   */
  pendingFor(agentPath: string, afterSeq = 0): MailboxItem[] {
    return this.items.filter(
      (item) => item.toAgentPath === agentPath && item.seq > afterSeq,
    );
  }

  /**
   * Get pending lifecycle events for a given agent path.
   */
  pendingEventsFor(agentPath: string, afterSeq = 0): LifecycleEvent[] {
    return this.events.filter(
      (event) =>
        "agentPath" in event &&
        (event as any).agentPath === agentPath &&
        event.seq !== undefined && event.seq > afterSeq,
    );
  }

  /**
   * Get all events with seq info (for persistence).
   */
  allEvents(): LifecycleEvent[] {
    return [...this.events];
  }

  /**
   * Get all mailbox items (for persistence).
   */
  allItems(): MailboxItem[] {
    return [...this.items];
  }

  /**
   * Wait for new items/events for a given agent path.
   * Returns immediately if there are pending items after afterSeq.
   * Otherwise waits up to timeoutMs.
   */
  waitForUpdate(
    agentPath: string,
    afterSeq: number,
    timeoutMs: number,
  ): Promise<{ events: LifecycleEvent[]; mailbox: MailboxItem[] }> {
    // Check for immediate results
    const pending = this.pendingFor(agentPath, afterSeq);
    const pendingEvts = this.pendingEventsFor(agentPath, afterSeq);
    if (pending.length > 0 || pendingEvts.length > 0) {
      return Promise.resolve({ events: pendingEvts, mailbox: pending });
    }

    // Wait for notification
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const waiter = {
        agentPath,
        afterSeq,
        resolve: (value: { events: LifecycleEvent[]; mailbox: MailboxItem[] }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(value);
        },
      };
      timer = setTimeout(() => {
        const mb = this.pendingFor(agentPath, afterSeq);
        const ev = this.pendingEventsFor(agentPath, afterSeq);
        waiter.resolve({ events: ev, mailbox: mb });
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  /**
   * Get current monotonic sequence number.
   */
  get currentSeq(): number {
    return this.seq;
  }

  /**
   * Snapshot current state for an agent path without waiting.
   * Returns events + mailbox items with seq > afterSeq.
   */
  snapshot(agentPath: string, afterSeq = 0): { events: LifecycleEvent[]; mailbox: MailboxItem[] } {
    return {
      events: this.pendingEventsFor(agentPath, afterSeq),
      mailbox: this.pendingFor(agentPath, afterSeq),
    };
  }

  /**
   * Get the most recent final result mailbox item for an agent path.
   */
  latestFinalResult(agentPath: string): MailboxItem | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.toAgentPath === agentPath && item.kind === "final_result") {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Clear all state. Used on session_shutdown.
   */
  clear(): void {
    this.items = [];
    this.events = [];
    this.seq = 0;
    // Reject all waiters with empty results
    for (const waiter of this.waiters) {
      waiter.resolve({ events: [], mailbox: [] });
    }
    this.waiters.clear();
  }

  // ─── Internal ────────────────────────────────────────────────

  private pruneRetainedRecords(): void {
    if (this.items.length > MAX_RETAINED_RECORDS) {
      this.items = this.items.slice(-MAX_RETAINED_RECORDS);
    }
    if (this.events.length > MAX_RETAINED_RECORDS) {
      this.events = compactStatusEvents(this.events.slice(-MAX_RETAINED_RECORDS));
    }
  }

  private notifyWaiters(filter?: (agentPath: string) => boolean): void {
    for (const waiter of [...this.waiters]) {
      if (filter && !filter(waiter.agentPath)) continue;
      const mb = this.pendingFor(waiter.agentPath, waiter.afterSeq);
      const ev = this.pendingEventsFor(waiter.agentPath, waiter.afterSeq);
      if (mb.length > 0 || ev.length > 0) {
        waiter.resolve({ events: ev, mailbox: mb });
      }
    }
  }

  private notifyAllWaiters(): void {
    this.notifyWaiters();
  }
}
