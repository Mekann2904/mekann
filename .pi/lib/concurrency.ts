/**
 * @abdd.meta
 * path: .pi/lib/concurrency.ts
 * role: 並列実行数制限付きワーカープール
 * why: 重複するプールロジックを削除し、キャンセル後の余分なタスク生成を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
 * public_api: runWithConcurrencyLimit, ConcurrencyRunOptions
 * invariants: limitは常に1以上でitemCount以下に正規化される
 * side_effects: abortOnError時、最初のエラー発生でプール全体を中止する
 * failure_modes: signalが中断状態の場合即座にエラー終了する
 * @abdd.explain
 * overview: 指定した上限数で非同期タスクを並列実行し、中断信号とエラー制御を提供する
 * what_it_does:
 *   - アイテム配列と同時実行数を受け取り、制限内でワーカーを実行する
 *   - AbortSignalによるキャンセルと中止通知伝播を行う
 *   - 最初のエラーを保持し、abortOnError設定に基づいて処理を打ち切る
 *   - 全タスクの完了を待機し、結果配列またはエラーを返す
 * why_it_exists:
 *   - 複数箇所（subagents, agent-teams等）で必要となる並列実行処理を共通化する
 *   - キャンセル処理の不整合を防ぎ、リソースリーク（ダングリングワーカー）を回避する
 * scope:
 *   in: アイテム配列、同時実行数、ワーカー関数、実行オプション
 *   out: 各アイテムの処理結果配列、または最初に発生したエラー
 */

// File: .pi/lib/concurrency.ts
// Description: Provides a shared concurrency-limited worker pool with abort-aware scheduling.
// Why: Removes duplicated pool logic and avoids spawning extra work after cancellation.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
import { createChildAbortController } from "./abort-utils";

/**
 * 並列実行のオプション設定
 * @summary 並列実行オプション
 */
export interface ConcurrencyRunOptions {
  signal?: AbortSignal;
  abortOnError?: boolean;
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

function isPoolAbortError(error: unknown): boolean {
  return error instanceof Error && error.message === "concurrency pool aborted";
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
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: ConcurrencyRunOptions = {},
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const abortOnError = options.abortOnError !== false;

  // Debug info: abortOnError=true時、エラー発生後も実行中ワーカーは完了まで続行する
  // これはダングリングワーカー（永遠に終わらないワーカー）を防ぐための意図的な設計
  if (abortOnError && items.length > 5 && process.env.PI_DEBUG_CONCURRENCY === "1") {
    console.debug(
      "[concurrency] abortOnError=true with %d items - Workers continue after first error to avoid dangling workers",
      items.length
    );
  }

  const normalizedLimit = toPositiveLimit(limit, items.length);
  const results: WorkerResult<TResult>[] = new Array(items.length);
  let cursor = 0;
  let firstError: unknown;
  const { controller: poolAbortController, cleanup } = createChildAbortController(options.signal);
  const effectiveSignal = poolAbortController.signal;

  const runWorker = async (): Promise<void> => {
    while (true) {
      try {
        ensureNotAborted(effectiveSignal);
      } catch (error) {
        if (firstError !== undefined && isPoolAbortError(error)) return;
        throw error;
      }
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }

      try {
        const result = await worker(items[currentIndex], currentIndex, effectiveSignal);
        results[currentIndex] = { index: currentIndex, result };
      } catch (error) {
        // Capture the first error but continue processing to avoid dangling workers
        if (firstError === undefined) {
          firstError = error;
          if (abortOnError) {
            poolAbortController.abort();
          }
        }
        results[currentIndex] = { index: currentIndex, error };
      }

      try {
        ensureNotAborted(effectiveSignal);
      } catch (error) {
        if (firstError !== undefined && isPoolAbortError(error)) return;
        throw error;
      }
    }
  };

  try {
    // Run all workers and wait for completion
    await Promise.all(
      Array.from({ length: normalizedLimit }, () => runWorker()),
    );
  } finally {
    cleanup();
  }

  // If any worker failed, throw the first error encountered
  if (firstError !== undefined) {
    throw firstError;
  }

  ensureNotAborted(effectiveSignal);

  // Unwrap results with explicit guards for unexpected holes.
  // Track which indices had errors for more precise error messages.
  const errorIndices: number[] = [];
  return results.map((item, index) => {
    if (!item) {
      throw new Error(`concurrency pool internal error: missing result at index ${index}`);
    }
    if (item?.error) {
      // エラー発生インデックスを記録（デバッグ用）
      errorIndices.push(index);
      throw item.error;
    }
    return item.result as TResult;
  });
}
