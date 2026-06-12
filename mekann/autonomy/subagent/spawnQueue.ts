/**
 * SpawnQueue — bounded FIFO queue for subagent spawn delegations.
 *
 * Owns queue admission, position tracking, drain scheduling, and timeout.
 * Calls onDrain callback when an execution slot opens.
 * Pure data structure — no spawn logic lives here.
 */

import type { AgentRegistry } from "./registry.js";
import type { QueuedSpawnDelegation } from "./subagentLifecycle.js";

export interface QueueAdmission {
  position: number;
  queuedAhead: number;
}

export interface QueueTimeoutOptions {
  /** Max milliseconds a queued agent can wait before being auto-rejected. Default: no timeout. */
  maxQueueMs?: number;
}

export class SpawnQueue {
  private items: QueuedSpawnDelegation[] = [];
  private draining = false;
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly registry: AgentRegistry,
    private readonly onDrain: (item: QueuedSpawnDelegation) => Promise<void>,
    private readonly timeoutOptions: QueueTimeoutOptions = {},
    private readonly onQueueError?: (item: QueuedSpawnDelegation, reason: string) => void,
  ) {}

  get length(): number {
    return this.items.length;
  }

  enqueue(item: QueuedSpawnDelegation): QueueAdmission {
    this.items.push(item);
    const position = this.items.length;
    this.refreshPositions();
    this.startTimeout(item);
    return { position, queuedAhead: position - 1 };
  }

  remove(agentPath: string): boolean {
    const index = this.items.findIndex((i) => i.canonicalPath === agentPath);
    if (index < 0) return false;
    this.items.splice(index, 1);
    this.clearTimeout(agentPath);
    this.refreshPositions();
    return true;
  }

  queueMessage(agentPath: string, message: string): boolean {
    const item = this.items.find((i) => i.canonicalPath === agentPath);
    if (!item) return false;
    item.queuedMessages.push(message);
    return true;
  }

  /**
   * Try to drain queued items into execution slots.
   * Called after enqueue and after a runtime closes.
   */
  scheduleDrain(): void {
    queueMicrotask(() => {
      void this.drainLoop();
    });
  }

  private async drainLoop(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.items.length > 0 && this.registry.hasExecutionCapacity()) {
        const item = this.items.shift()!;
        this.clearTimeout(item.canonicalPath);
        this.refreshPositions();
        const agent = this.registry.get(item.canonicalPath);
        if (!agent?.open || agent.status !== "queued") continue;
        try {
          await this.onDrain(item);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          this.onQueueError?.(item, `queue drain failed: ${reason}`);
          this.registry.updateStatus(item.canonicalPath, "errored");
          this.registry.close(item.canonicalPath, "errored");
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private refreshPositions(): void {
    this.items.forEach((item, index) => {
      this.registry.updateAgent(item.canonicalPath, {
        queuePosition: index + 1,
        queuedAhead: index,
      });
    });
  }

  // ─── Timeout management ──────────────────────────────────────

  private startTimeout(item: QueuedSpawnDelegation): void {
    const maxMs = this.timeoutOptions.maxQueueMs;
    if (!maxMs || maxMs <= 0) return;
    this.clearTimeout(item.canonicalPath);
    const timer = setTimeout(() => {
      const stillQueued = this.items.some((i) => i.canonicalPath === item.canonicalPath);
      if (!stillQueued) return;
      this.remove(item.canonicalPath);
      this.onQueueError?.(item, `queue timeout after ${maxMs}ms`);
      this.registry.updateStatus(item.canonicalPath, "errored");
      this.registry.close(item.canonicalPath, "errored");
    }, maxMs);
    timer.unref();
    this.timeoutTimers.set(item.canonicalPath, timer);
  }

  private clearTimeout(agentPath: string): void {
    const existing = this.timeoutTimers.get(agentPath);
    if (existing) {
      clearTimeout(existing);
      this.timeoutTimers.delete(agentPath);
    }
  }
}
