import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWorkerPool } from "./index.js";

describe("WorkerPool", () => {
  let pool: ReturnType<typeof createWorkerPool>;
  let taskCounter = 0;

  // Mock worker that resolves after a short delay
  const createMockWorker = () => {
    const workers: {
      onMessage: ((msg: unknown) => void) | null;
      onError: ((err: Error) => void) | null;
      terminated: boolean;
    }[] = [];

    const mockCreate = () => {
      const w = { onMessage: null as ((msg: unknown) => void) | null, onError: null as ((err: Error) => void) | null, terminated: false };
      workers.push(w);
      const taskId = taskCounter++;

      return {
        postMessage(msg: { taskId: string; input: unknown }) {
          // Simulate async work
          setTimeout(() => {
            if (w.onMessage) w.onMessage({ taskId: msg.taskId, result: `processed-${String(msg.input)}` });
          }, 10);
        },
        once(event: string, handler: (arg: unknown) => void) {
          if (event === "message") w.onMessage = handler;
          if (event === "error") w.onError = handler;
        },
        terminate: vi.fn(async () => {
          w.terminated = true;
        }),
      };
    };

    return { mockCreate, workers };
  };

  beforeEach(() => {
    taskCounter = 0;
  });

  afterEach(async () => {
    if (pool) await pool.shutdown();
  });

  it("reuses idle workers for sequential tasks", async () => {
    const { mockCreate } = createMockWorker();
    pool = createWorkerPool({ maxSize: 2, idleTimeoutMs: 30000, createWorker: mockCreate });

    const r1 = await pool.execute("task-a");
    expect(r1).toBe("processed-task-a");

    const r2 = await pool.execute("task-b");
    expect(r2).toBe("processed-task-b");
  });

  it("creates multiple workers for concurrent tasks", async () => {
    let createCount = 0;
    const { mockCreate } = createMockWorker();
    const countingCreate = () => { createCount++; return mockCreate(); };

    pool = createWorkerPool({ maxSize: 3, idleTimeoutMs: 30000, createWorker: countingCreate });

    const [r1, r2, r3] = await Promise.all([
      pool.execute("concurrent-1"),
      pool.execute("concurrent-2"),
      pool.execute("concurrent-3"),
    ]);

    expect(r1).toBe("processed-concurrent-1");
    expect(r2).toBe("processed-concurrent-2");
    expect(r3).toBe("processed-concurrent-3");
    expect(createCount).toBe(3);
  });

  it("terminates idle workers on shutdown", async () => {
    const { mockCreate } = createMockWorker();
    pool = createWorkerPool({ maxSize: 2, idleTimeoutMs: 30000, createWorker: mockCreate });

    await pool.execute("task");
    await pool.shutdown();
    // shutdown should not throw
  });

  it("respects maxSize limit", async () => {
    let createCount = 0;
    const { mockCreate } = createMockWorker();
    const countingCreate = () => { createCount++; return mockCreate(); };

    pool = createWorkerPool({ maxSize: 2, idleTimeoutMs: 30000, createWorker: countingCreate });

    // Launch 4 concurrent tasks with pool size 2
    const results = await Promise.all([
      pool.execute("c1"),
      pool.execute("c2"),
      pool.execute("c3"),
      pool.execute("c4"),
    ]);

    expect(results).toEqual(["processed-c1", "processed-c2", "processed-c3", "processed-c4"]);
    expect(createCount).toBeLessThanOrEqual(2);
  });

  it("handles errors from workers gracefully", async () => {
    const mockCreate = () => ({
      postMessage() {
        // no-op, simulate timeout
      },
      once(event: string, handler: (arg: unknown) => void) {
        if (event === "error") {
          setTimeout(() => handler(new Error("worker failed")), 10);
        }
      },
      terminate: vi.fn(async () => {}),
    });

    pool = createWorkerPool({ maxSize: 1, idleTimeoutMs: 30000, createWorker: mockCreate });

    await expect(pool.execute("fail-task")).rejects.toThrow("worker failed");
  });

  it("does not accumulate un-fired error listeners across worker reuse", async () => {
    // Regression: dispatch registers both `once("message")` and
    // `once("error")`, but only one fires per task. Previously the un-fired
    // handler stayed attached, so each reuse of a pooled worker leaked one
    // listener. With maxSize 1 a single worker is reused for every task.
    const errorListenerCounts: number[] = [];
    let liveErrorHandlers = 0;

    const createWorker = () => ({
      postMessage(msg: { taskId: string; input: unknown }) {
        setTimeout(() => {
          // EventEmitter `once` semantics: the fired handler auto-removes.
          if (messageHandler) {
            const h = messageHandler;
            messageHandler = null;
            h({ taskId: msg.taskId, result: `processed-${String(msg.input)}` });
          }
        }, 5);
      },
      once(event: string, handler: (arg: unknown) => void) {
        if (event === "message") messageHandler = handler;
        if (event === "error") {
          errorHandler = handler;
          liveErrorHandlers += 1;
        }
      },
      off(event: string, handler: (arg: unknown) => void) {
        if (event === "error" && errorHandler === handler) {
          errorHandler = null;
          liveErrorHandlers -= 1;
        }
      },
      terminate: vi.fn(async () => {}),
    });
    let messageHandler: ((msg: unknown) => void) | null = null;
    let errorHandler: ((err: unknown) => void) | null = null;

    pool = createWorkerPool({ maxSize: 1, idleTimeoutMs: 30000, createWorker });

    for (let i = 0; i < 5; i++) {
      await pool.execute(`task-${i}`);
      errorListenerCounts.push(liveErrorHandlers);
    }

    // After each task resolves via "message", its paired "error" listener must
    // have been removed. With the leak this would be [1, 2, 3, 4, 5].
    expect(errorListenerCounts).toEqual([0, 0, 0, 0, 0]);
  });
});
