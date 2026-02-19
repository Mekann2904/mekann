/**
 * @abdd.meta
 * path: .pi/lib/concurrency.ts
 * role: 並列実行数を制限する非同期タスクプールの実装
 * why: 重複するプールロジックを排除し、キャンセル後の余計なタスク起動を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
 * public_api: runWithConcurrencyLimit, ConcurrencyRunOptions
 * invariants: limitは常に1以上の整数に正規化される、results配列のインデックスはitemsの順序と一致する、いずれかのワーカーが失敗した場合最初のエラーが再スローされる
 * side_effects: AbortSignalによる中断時、即座にErrorをスローして処理を停止する
 * failure_modes: limitが非数または無限大の場合は1にフォールバックする、空配列が渡されると即座に空配列を返す
 * @abdd.explain
 * overview: アイテム配列を指定された最大並列数で処理し、すべての完了を待機して結果を返すユーティリティ
 * what_it_does:
 *   - 入力limitを正の整数（1以上、items.length以下）に正規化する
 *   - 指定された数のワーカーを起動し、アイテムを順次消費してworker関数を実行する
 *   - AbortSignalの状態を監視し、中断要求があれば処理を停止する
 *   - 最初に発生したエラーを保持し、すべての処理完了後に再スローする
 * why_it_exists:
 *   - サブエージェントやチーム実行など、複数箇所で必要となる並列処理ロジックを共通化するため
 *   - 並列数制御と中止処理を一箇所に集約し、不整合やリソースリークを防ぐため
 * scope:
 *   in: アイテム配列、並列数、処理関数、中断シグナル
 *   out: 処理結果の配列（入力順）または最初のエラー
 */

// File: .pi/lib/concurrency.ts
// Description: Provides a shared concurrency-limited worker pool with abort-aware scheduling.
// Why: Removes duplicated pool logic and avoids spawning extra work after cancellation.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts

/**
 * 並列実行のオプション設定
 * @summary 並列実行オプション
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
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("concurrency pool aborted");
  }
}

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
