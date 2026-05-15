/**
 * Subagent Extension — Mailbox / event queue.
 *
 * Provides async enqueue/consume with monotonic sequence IDs.
 * Avoids busy polling by using Promise resolvers.
 */

import type { LifecycleEvent, MailboxItem } from "./types.js";

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
    this.notifyWaiters((ap) => ap === item.toAgentPath);
    return full;
  }

  /**
   * Append a lifecycle event. Notifies any waiting consumer.
   */
  appendEvent(event: LifecycleEvent): void {
    this.events.push(event);
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
  pendingEventsFor(agentPath: string): LifecycleEvent[] {
    return this.events.filter(
      (event) =>
        "agentPath" in event &&
        (event as any).agentPath === agentPath,
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
    const pendingEvts = this.pendingEventsFor(agentPath);
    if (pending.length > 0 || pendingEvts.length > 0) {
      return Promise.resolve({ events: pendingEvts, mailbox: pending });
    }

    // Wait for notification
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        const mb = this.pendingFor(agentPath, afterSeq);
        const ev = this.pendingEventsFor(agentPath);
        resolve({ events: ev, mailbox: mb });
      }, timeoutMs);

      const waiter = {
        agentPath,
        afterSeq,
        resolve: (value: { events: LifecycleEvent[]; mailbox: MailboxItem[] }) => {
          clearTimeout(timer);
          resolve(value);
        },
      };
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

  private notifyWaiters(filter?: (agentPath: string) => boolean): void {
    for (const waiter of this.waiters) {
      if (filter && !filter(waiter.agentPath)) continue;
      const mb = this.pendingFor(waiter.agentPath, waiter.afterSeq);
      const ev = this.pendingEventsFor(waiter.agentPath);
      if (mb.length > 0 || ev.length > 0) {
        this.waiters.delete(waiter);
        waiter.resolve({ events: ev, mailbox: mb });
      }
    }
  }

  private notifyAllWaiters(): void {
    this.notifyWaiters();
  }
}
