// File: .pi/lib/concurrency.ts
// Description: Provides a shared concurrency-limited worker pool with abort-aware scheduling.
// Why: Removes duplicated pool logic and avoids spawning extra work after cancellation.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts

/**
 * /**
 * * 並行実行のオプション設定
 * *
 * * 中止シグナルを指定して、実行中のタスクをキャンセル可能にする。
 * *
 * * @property signal - 中止シグナル。キャンセル時に実行中の
 */
export interface ConcurrencyRunOptions {
  signal?: AbortSignal;
}

/**
 * Result wrapper for tracking success/failure of individual workers.
 * Used internally to ensure all workers complete before throwing errors.
 */
interface WorkerResult<TResult> {
  index: number;
  result?: TResult;
  error?: unknown;
}

function toPositiveLimit(limit: number, itemCount: number): number {
  const safeLimit = Number.isFinite(limit) ? Math.trunc(limit) : 1;
  return Math.max(1, Math.min(itemCount, safeLimit));
/**
 * 指定した並行数制限で非同期タスクを実行する
 *
 * @param items - 処理対象のアイテム配列
 * @param limit - 同時実行数の上限
 * @param worker - 各アイテムを処理する非同期関数
 * @param options - 実行オプション（AbortSignalなど）
 * @returns 各アイテムの処理結果の配列
 * @example
 * const results = await runWithConcurrencyLimit(
 *   [1, 2, 3, 4, 5],
 *   2,
 *   async (item) => item * 2,
 *   { signal: abortController.signal }
 * );
 */
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
  const results: WorkerResult<TResult>[] = new Array(items.length);
  let cursor = 0;
  let firstError: unknown;

  const runWorker = async (): Promise<void> => {
    while (true) {
      ensureNotAborted(options.signal);
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }

      try {
        const result = await worker(items[currentIndex], currentIndex);
        results[currentIndex] = { index: currentIndex, result };
      } catch (error) {
        // Capture the first error but continue processing to avoid dangling workers
        if (firstError === undefined) {
          firstError = error;
        }
        results[currentIndex] = { index: currentIndex, error };
      }

      ensureNotAborted(options.signal);
    }
  };

  // Run all workers and wait for completion
  await Promise.all(
    Array.from({ length: normalizedLimit }, () => runWorker()),
  );

  ensureNotAborted(options.signal);

  // If any worker failed, throw the first error encountered
  if (firstError !== undefined) {
    throw firstError;
  }

  // Unwrap results, filtering out any undefined (should not happen at this point)
  return results.map((item) => {
    if (item?.error) {
      // This should have been caught above, but handle defensively
      throw item.error;
    }
    return item!.result as TResult;
  });
}
