/**
 * SpawnQueue — bounded FIFO queue for subagent spawn delegations.
 *
 * Owns queue admission, position tracking, and drain scheduling.
 * Calls onDrain callback when an execution slot opens.
 * Pure data structure — no spawn logic lives here.
 */

import type { AgentRegistry } from "./registry.js";
import type { QueuedSpawnDelegation } from "./subagentLifecycle.js";

export interface QueueAdmission {
  position: number;
  queuedAhead: number;
}

export class SpawnQueue {
  private items: QueuedSpawnDelegation[] = [];
  private draining = false;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly onDrain: (item: QueuedSpawnDelegation) => Promise<void>,
  ) {}

  get length(): number {
    return this.items.length;
  }

  enqueue(item: QueuedSpawnDelegation): QueueAdmission {
    this.items.push(item);
    const position = this.items.length;
    this.refreshPositions();
    return { position, queuedAhead: position - 1 };
  }

  remove(agentPath: string): boolean {
    const index = this.items.findIndex((i) => i.canonicalPath === agentPath);
    if (index < 0) return false;
    this.items.splice(index, 1);
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
        this.refreshPositions();
        const agent = this.registry.get(item.canonicalPath);
        if (!agent?.open || agent.status !== "queued") continue;
        try {
          await this.onDrain(item);
        } catch {
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
}
