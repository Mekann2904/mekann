import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentRegistry } from "./registry.js";
import { SpawnQueue } from "./spawnQueue.js";
import type { AgentMetadata } from "./types.js";

function queuedAgent(path: string): AgentMetadata {
  return {
    agentId: "sub_queued",
    sessionId: "queued:sub_queued",
    agentPath: path,
    status: "queued",
    lastTaskMessage: "wait",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    depth: 1,
    open: true,
    cancellationRequested: false,
  };
}

describe("SpawnQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears queued timeout when an item is promoted into an execution slot", async () => {
    vi.useFakeTimers();
    const registry = new AgentRegistry(2, 2);
    registry.ensureRoot("root");
    registry.registerQueuedAgent(queuedAgent("/root/queued"));

    const onDrain = vi.fn(async () => undefined);
    const onQueueError = vi.fn();
    const queue = new SpawnQueue(registry, onDrain, { maxQueueMs: 10_000 }, onQueueError);

    queue.enqueue({
      params: { task_name: "queued", message: "wait" },
      ctx: { cwd: "/tmp" } as any,
      callerPath: "/root",
      canonicalPath: "/root/queued",
      depth: 1,
      agentId: "sub_queued",
      queuedMessages: [],
    });
    expect(vi.getTimerCount()).toBe(1);

    queue.scheduleDrain();
    await vi.runAllTicks();
    await Promise.resolve();

    expect(onDrain).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(onQueueError).not.toHaveBeenCalled();
  });
});
