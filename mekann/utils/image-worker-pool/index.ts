/**
 * Generic worker pool for reusing workers across multiple tasks.
 *
 * Avoids per-call worker creation overhead by maintaining a pool of
 * idle workers that can be reused for subsequent tasks.
 */

export interface PoolWorker {
  postMessage(msg: unknown): void;
  once(event: "message" | "error", handler: (arg: unknown) => void): void;
  terminate(): Promise<void> | void;
}

export interface WorkerPoolOptions {
  maxSize: number;
  idleTimeoutMs: number;
  createWorker: () => PoolWorker;
}

interface PendingTask {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

interface ActiveWorker {
  worker: PoolWorker;
}

export function createWorkerPool(options: WorkerPoolOptions) {
  const { maxSize, idleTimeoutMs, createWorker } = options;
  const idleWorkers: PoolWorker[] = [];
  const activeWorkers: ActiveWorker[] = [];
  const pendingQueue: { input: unknown; task: PendingTask }[] = [];
  const idleTimers: ReturnType<typeof setTimeout>[] = [];
  let shutdown = false;

  function drainQueue() {
    while (pendingQueue.length > 0) {
      const worker = acquireWorker();
      if (!worker) break;
      const item = pendingQueue.shift()!;
      dispatch(worker, item.input, item.task);
    }
  }

  function acquireWorker(): PoolWorker | null {
    if (shutdown) return null;
    if (idleWorkers.length > 0) {
      return idleWorkers.pop()!;
    }
    if (activeWorkers.length < maxSize) {
      return createWorker();
    }
    return null;
  }

  function dispatch(worker: PoolWorker, input: unknown, task: PendingTask) {
    const active: ActiveWorker = { worker };
    activeWorkers.push(active);

    worker.once("message", (msg: unknown) => {
      removeActive(active);
      task.resolve((msg as { result: unknown }).result);
      releaseWorker(worker);
      drainQueue();
    });

    worker.once("error", (err: unknown) => {
      removeActive(active);
      task.reject(err instanceof Error ? err : new Error(String(err)));
      drainQueue();
    });

    worker.postMessage({ taskId: Date.now(), input });
  }

  function removeActive(active: ActiveWorker) {
    const idx = activeWorkers.indexOf(active);
    if (idx !== -1) activeWorkers.splice(idx, 1);
  }

  function releaseWorker(worker: PoolWorker) {
    if (shutdown) {
      worker.terminate();
      return;
    }
    idleWorkers.push(worker);

    // Set idle timeout
    const timer = setTimeout(() => {
      const idx = idleWorkers.indexOf(worker);
      if (idx !== -1) {
        idleWorkers.splice(idx, 1);
        worker.terminate();
      }
      const tIdx = idleTimers.indexOf(timer);
      if (tIdx !== -1) idleTimers.splice(tIdx, 1);
    }, idleTimeoutMs);
    idleTimers.push(timer);
  }

  return {
    execute(input: unknown): Promise<unknown> {
      if (shutdown) return Promise.reject(new Error("Pool is shut down"));

      const worker = acquireWorker();
      if (worker) {
        return new Promise<unknown>((resolve, reject) => {
          dispatch(worker, input, { resolve, reject });
        });
      }

      // No worker available, queue the task
      return new Promise<unknown>((resolve, reject) => {
        pendingQueue.push({ input, task: { resolve, reject } });
      });
    },

    async shutdown() {
      shutdown = true;
      // Clear idle timers
      for (const timer of idleTimers) clearTimeout(timer);
      idleTimers.length = 0;
      // Terminate idle workers
      const terminations = idleWorkers.map((w) => Promise.resolve(w.terminate()));
      idleWorkers.length = 0;
      await Promise.all(terminations);
      // Active workers will be terminated when their tasks complete
      for (const active of activeWorkers) {
        await Promise.resolve(active.worker.terminate());
      }
      activeWorkers.length = 0;
    },
  };
}
