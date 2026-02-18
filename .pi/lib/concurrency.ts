/**
 * @abdd.meta
 * path: .pi/lib/concurrency.ts
 * role: 並行実行数制限付きワーカープールの提供
 * why: 複数モジュールでのプールロジック重複を排除し、キャンセル後の不要なタスク起動を防止するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
 * public_api: ConcurrencyRunOptions, runWithConcurrencyLimit
 * invariants:
 *   - limitは必ず1以上、かつitems.length以下に正規化される
 *   - items.length === 0の場合、即座に空配列を返す
 *   - 結果配列の順序は入力配列の順序と一致する
 * side_effects: なし（純粋な非同期処理のみ）
 * failure_modes:
 *   - AbortSignalがaborted状態の場合、"concurrency pool aborted"エラーをスロー
 *   - worker関数で例外発生時、最初のエラーを記録し全ワーカー完了後に再スロー
 * @abdd.explain
 * overview: AbortSignal対応の並行実行数制御ユーティリティ
 * what_it_does:
 *   - 指定した並行数上限で非同期タスクを順次実行する
 *   - 中止シグナル検知時に即座に例外をスローして実行を中断する
 *   - エラー発生時は全ワーカーの完了を待機し、最初のエラーをスローする
 * why_it_exists:
 *   - サブエージェントやチーム実行での並行処理を統一管理するため
 *   - キャンセル後の無駄なタスク起動を防ぐため
 * scope:
 *   in: TInput型の配列、並行数上限、非同期worker関数、AbortSignal（省略可）
 *   out: TResult型の配列（入力順序を維持）
 */

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

 /**
  * 指定した並列数でアイテムを処理する
  * @param items 処理対象のアイテム配列
  * @param limit 最大並列数
  * @param worker 各アイテムを処理する非同期関数
  * @param options 実行オプション
  * @returns すべての処理結果を含む配列
  */
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
