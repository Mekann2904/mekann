/**
 * Generic worker pool for reusing workers across multiple tasks.
 *
 * Avoids per-call worker creation overhead by maintaining a pool of
 * idle workers that can be reused for subsequent tasks.
 */

export interface PoolWorker {
  postMessage(msg: unknown): void;
  once(event: "message" | "error", handler: (arg: unknown) => void): void;
  /**
   * Remove a listener previously registered with `once`. Optional: when a
   * worker implementation does not expose it, the pool degrades to the old
   * behavior. Real Node.js worker_threads Workers expose `off`, which lets
   * the pool remove the un-fired counterpart listener and avoid leaking one
   * listener per dispatch across worker reuse.
   */
  off?(event: "message" | "error", handler: (arg: unknown) => void): void;
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
  // Monotonic per-pool task id. `Date.now()` collided when two tasks were
  // dispatched within the same millisecond (issue #152 / IC-038, same root as
  // #144); a strictly increasing counter is unique for the pool lifetime and
  // immune to same-ms dispatch races.
  let taskCounter = 0;

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

    // Both handlers are registered with `once`, but only one of "message" or
    // "error" fires per task. Without removing the un-fired handler, a reused
    // worker would accumulate one stale listener per dispatch, eventually
    // tripping MaxListenersExceededWarning and leaking memory. Remove the
    // counterpart as soon as the task settles.
    let settled = false;
    const onMessage = (msg: unknown) => {
      if (settled) return;
      settled = true;
      worker.off?.("error", onError);
      removeActive(active);
      task.resolve((msg as { result: unknown }).result);
      releaseWorker(worker);
      drainQueue();
    };
    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      worker.off?.("message", onMessage);
      removeActive(active);
      task.reject(err instanceof Error ? err : new Error(String(err)));
      drainQueue();
    };

    worker.once("message", onMessage);
    worker.once("error", onError);

    worker.postMessage({ taskId: ++taskCounter, input });
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
