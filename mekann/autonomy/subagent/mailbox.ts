/**
 * Subagent Extension — Mailbox / event queue.
 *
 * Provides async enqueue/consume with monotonic sequence IDs.
 * Avoids busy polling by using Promise resolvers.
 */

import type { LifecycleEvent, MailboxItem } from "./types.js";

const DEFAULT_MAX_RETAINED_RECORDS = 10_000;

/** Result of a mailbox wait. `timed_out` is authoritative: it is `true` only
 * when the wait settled because the deadline elapsed, so callers can
 * distinguish a genuine timeout from an empty-but-successful notification
 * (issue #152 / IC-029). */
export interface MailboxWaitResult {
  events: LifecycleEvent[];
  mailbox: MailboxItem[];
  timed_out: boolean;
}

export interface MailboxOptions {
  /** Max items/events retained before eviction (issue #152). */
  maxRetainedRecords?: number;
}

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
    resolve: (value: MailboxWaitResult) => void;
  }>();

  constructor(private readonly options: MailboxOptions = {}) {}

  private get maxRetainedRecords(): number {
    const v = this.options.maxRetainedRecords;
    return typeof v === "number" && v > 0 ? v : DEFAULT_MAX_RETAINED_RECORDS;
  }

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
  ): Promise<MailboxWaitResult> {
    return this.waitForUpdateInternal(agentPath, afterSeq, timeoutMs);
  }

  /**
   * Wait for new items/events without any timeout. Intended for fully
   * synchronous delegation where the caller must not observe a timeout result.
   * `timed_out` is therefore always `false`.
   */
  waitForUpdateIndefinitely(agentPath: string, afterSeq: number): Promise<MailboxWaitResult> {
    return this.waitForUpdateInternal(agentPath, afterSeq);
  }

  private waitForUpdateInternal(
    agentPath: string,
    afterSeq: number,
    timeoutMs?: number,
  ): Promise<MailboxWaitResult> {
    // Check for immediate results
    const pending = this.pendingFor(agentPath, afterSeq);
    const pendingEvts = this.pendingEventsFor(agentPath, afterSeq);
    if (pending.length > 0 || pendingEvts.length > 0) {
      return Promise.resolve({ events: pendingEvts, mailbox: pending, timed_out: false });
    }

    // Wait for notification
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiter = {
        agentPath,
        afterSeq,
        resolve: (value: MailboxWaitResult) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(value);
        },
      };
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          // Deadline elapsed. This is an authoritative timeout signal even if a
          // message raced in just now: the caller learns that no timely
          // notification settled the wait (issue #152 / IC-029).
          const mb = this.pendingFor(agentPath, afterSeq);
          const ev = this.pendingEventsFor(agentPath, afterSeq);
          waiter.resolve({ events: ev, mailbox: mb, timed_out: true });
        }, timeoutMs);
      }
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
    // Resolve all waiters with empty results (not a timeout).
    for (const waiter of this.waiters) {
      waiter.resolve({ events: [], mailbox: [], timed_out: false });
    }
    this.waiters.clear();
  }

  // ─── Internal ────────────────────────────────────────────────

  private pruneRetainedRecords(): void {
    const cap = this.maxRetainedRecords;
    if (this.items.length > cap) {
      this.items = this.items.slice(-cap);
    }
    if (this.events.length > cap) {
      this.events = compactStatusEvents(this.events.slice(-cap));
    }
  }

  private notifyWaiters(filter?: (agentPath: string) => boolean): void {
    for (const waiter of [...this.waiters]) {
      if (filter && !filter(waiter.agentPath)) continue;
      const mb = this.pendingFor(waiter.agentPath, waiter.afterSeq);
      const ev = this.pendingEventsFor(waiter.agentPath, waiter.afterSeq);
      if (mb.length > 0 || ev.length > 0) {
        waiter.resolve({ events: ev, mailbox: mb, timed_out: false });
      }
    }
  }

  private notifyAllWaiters(): void {
    this.notifyWaiters();
  }
}
