/**
 * @abdd.meta
 * path: .pi/lib/concurrency.ts
 * role: 並列実行数制限付きワーカープール
 * why: 重複するプールロジックを削除し、キャンセル後の余分なタスク生成を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts, .pi/lib/dag-weight-calculator.ts
 * public_api: runWithConcurrencyLimit, runWithEarlyStop, ConcurrencyRunOptions, EarlyStopOptions
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
 *   - DynTaskMAS: 優先度ベーススケジューリング（usePriorityScheduling）をサポート
 *   - Early-stop条件による早期終了をサポートする
 * why_it_exists:
 *   - 複数箇所（subagents, agent-teams等）で必要となる並列実行処理を共通化する
 *   - キャンセル処理の不整合を防ぎ、リソースリーク（ダングリングワーカー）を回避する
 *   - DynTaskMAS統合によりエージェント/チームの専門性に基づく優先実行を可能にする
 * scope:
 *   in: アイテム配列、同時実行数、ワーカー関数、実行オプション（優先度スケジューリング含む）
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
 * @param signal - 中断シグナル
 * @param abortOnError - エラー時にプール全体を中止するか
 * @param usePriorityScheduling - 優先度ベーススケジューリングを有効にするか
 * @param itemWeights - アイテムIDごとの重みマップ
 * @param getItemId - アイテムからIDを取得する関数
 */
export interface ConcurrencyRunOptions<T = unknown> {
  signal?: AbortSignal;
  abortOnError?: boolean;
  /** DynTaskMAS: 優先度ベーススケジューリングを有効にする */
  usePriorityScheduling?: boolean;
  /** DynTaskMAS: アイテムIDごとの重みマップ */
  itemWeights?: Map<string, number>;
  /** DynTaskMAS: アイテムからIDを取得する関数 */
  getItemId?: (item: T) => string;
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
 * DynTaskMAS統合: usePriorityScheduling=true時、itemWeightsに基づいて
 * 高優先度アイテム（重みが大きいアイテム）を先に実行する。
 *
 * @param items - 処理対象のアイテム配列
 * @param limit - 同時実行数の上限
 * @param worker - 各アイテムを処理する非同期関数
 * @param options - 実行オプション（AbortSignal、優先度スケジューリングなど）
 * @returns 各アイテムの処理結果の配列
 * @example
 * // Basic usage
 * const results = await runWithConcurrencyLimit(
 *   [1, 2, 3, 4, 5],
 *   2,
 *   async (item) => item * 2,
 *   { signal: abortController.signal }
 * );
 *
 * // With priority scheduling
 * const weights = new Map([['a', 1.2], ['b', 0.5], ['c', 1.0]]);
 * const results = await runWithConcurrencyLimit(
 *   ['a', 'b', 'c'],
 *   2,
 *   async (item) => process(item),
 *   {
 *     usePriorityScheduling: true,
 *     itemWeights: weights,
 *     getItemId: (item) => item,
 *   }
 * );
 */
export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: ConcurrencyRunOptions<TInput> = {},
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const abortOnError = options.abortOnError !== false;
  const { usePriorityScheduling, itemWeights, getItemId } = options;

  // Debug info: abortOnError=true時、エラー発生後も実行中ワーカーは完了まで続行する
  // これはダングリングワーカー（永遠に終わらないワーカー）を防ぐための意図的な設計
  if (abortOnError && items.length > 5 && process.env.PI_DEBUG_CONCURRENCY === "1") {
    console.debug(
      "[concurrency] abortOnError=true with %d items - Workers continue after first error to avoid dangling workers",
      items.length
    );
  }

  const normalizedLimit = toPositiveLimit(limit, items.length);

  // DynTaskMAS: 優先度ベースでアイテムを並べ替え
  // 重みが大きい（優先度が高い）アイテムを先に実行
  let sortedIndices: number[];
  if (usePriorityScheduling && itemWeights && getItemId) {
    // 重みの降順でソート（重い=優先度高）
    sortedIndices = items
      .map((item, index) => ({
        index,
        weight: itemWeights.get(getItemId(item)) ?? 1.0,
      }))
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.index);

    if (process.env.PI_DEBUG_CONCURRENCY === "1") {
      console.debug(
        "[concurrency] Priority scheduling enabled, order: %s",
        sortedIndices.map((i) => `${getItemId(items[i])}(${itemWeights.get(getItemId(items[i]))?.toFixed(2) ?? "1.00"})`).join(", ")
      );
    }
  } else {
    // デフォルト: 元の順序
    sortedIndices = items.map((_, index) => index);
  }

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
      const cursorIndex = cursor;
      cursor += 1;
      if (cursorIndex >= sortedIndices.length) {
        return;
      }

      // 優先度順に並べ替えられたインデックスから元のインデックスを取得
      const currentIndex = sortedIndices[cursorIndex];

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
