// File: .pi/lib/concurrency.ts
// Description: Provides a shared concurrency-limited worker pool with abort-aware scheduling.
// Why: Removes duplicated pool logic and avoids spawning extra work after cancellation.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts

export interface ConcurrencyRunOptions {
  signal?: AbortSignal;
}

function toPositiveLimit(limit: number, itemCount: number): number {
  const safeLimit = Number.isFinite(limit) ? Math.trunc(limit) : 1;
  return Math.max(1, Math.min(itemCount, safeLimit));
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("concurrency pool aborted");
  }
}

export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TResult>,
  options: ConcurrencyRunOptions = {},
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const normalizedLimit = toPositiveLimit(limit, items.length);
  const results: TResult[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      ensureNotAborted(options.signal);
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
      ensureNotAborted(options.signal);
    }
  };

  await Promise.all(
    Array.from({ length: normalizedLimit }, async () => {
      await runWorker();
    }),
  );

  ensureNotAborted(options.signal);
  return results;
}
