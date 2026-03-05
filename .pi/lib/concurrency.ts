/**
 * @abdd.meta
 * path: .pi/lib/concurrency.ts
 * role: 並列実行数制限付きワーカープール
 * why: 重複するプールロジックを削除し、キャンセル後の余分なタスク生成を防ぐため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts, .pi/lib/dag-weight-calculator.ts
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
 *   - 複数箇所（subagents等）で必要となる並列実行処理を共通化する
 *   - キャンセル処理の不整合を防ぎ、リソースリーク（ダングリングワーカー）を回避する
 *   - DynTaskMAS統合によりエージェントの専門性に基づく優先実行を可能にする
 * scope:
 *   in: アイテム配列、同時実行数、ワーカー関数、実行オプション（優先度スケジューリング含む）
 *   out: 各アイテムの処理結果配列、または最初に発生したエラー
 */

// File: .pi/lib/concurrency.ts
// Description: Provides a shared concurrency-limited worker pool with abort-aware scheduling.
// Why: Removes duplicated pool logic and avoids spawning extra work after cancellation.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts
import { createChildAbortController } from "./abort-utils";

/**
 * 並列実行のオプション設定
 * @summary 並列実行オプション
 * @param signal - 中断シグナル
 * @param abortOnError - エラー時に新規ワーカー起動を停止するか。
 *   trueの場合、最初のエラー発生後にpoolAbortController.abort()を呼び出し、
 *   新規ワーカーの起動を停止する。ただし、既に実行中のワーカーは自然終了まで
 *   継続し、ダングリングワーカー（永遠に終わらないワーカー）を防止する。
 *   このため、エラー発生後も一部のワーカーは処理を継続する可能性がある。
 * @param usePriorityScheduling - 優先度ベーススケジューリングを有効にするか
 * @param itemWeights - アイテムIDごとの重みマップ
 * @param getItemId - アイテムからIDを取得する関数
 * @param settleMode - 'throw'で最初のエラーで例外、'allSettled'で全結果を返す
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
  /** Promise.allSettledパターンで部分失敗を許容するか (default: 'throw') */
  settleMode?: 'throw' | 'allSettled';
}

/**
 * ワーカー実行結果の内部ラッパー
 * @summary 個別ワーカーの成功/失敗を追跡
 * @description 全ワーカーの完了を待ってからエラーをthrowするために使用
 * @property itemIndex - 元のアイテム配列内のインデックス（優先度スケジューリング前）
 * @property executionOrder - 実行順序（優先度スケジューリング後の順位）
 * @property result - 成功時の結果
 * @property error - 失敗時のエラー
 */
interface WorkerResult<TResult> {
  itemIndex: number;
  executionOrder: number;
  result?: TResult;
  error?: unknown;
}

/**
 * Settled result for allSettled mode
 * @summary 個別結果の成功/失敗ラッパー
 */
export type SettledResult<TResult> =
  | { status: 'fulfilled'; value: TResult; index: number }
  | { status: 'rejected'; reason: unknown; index: number };

/**
 * 並行数制限を正規化する
 * @summary 制限値を1以上itemCount以下に正規化
 * @param limit - 元の制限値
 * @param itemCount - アイテム総数
 * @returns 正規化された制限値（1 <= result <= itemCount）
 */
function toPositiveLimit(limit: number, itemCount: number): number {
  const safeLimit = Number.isFinite(limit) ? Math.trunc(limit) : 1;
  return Math.max(1, Math.min(itemCount, safeLimit));
}

/**
 * シグナルが中断状態かチェックし、中断時はエラーを投げる
 * @summary 中断シグナルの検証
 * @param signal - チェック対象のAbortSignal
 * @throws {Error} signalが中断状態の場合 "concurrency pool aborted"
 */
function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("concurrency pool aborted");
  }
}

/**
 * エラーがプール中断エラーか判定する
 * @summary プール中断エラーの識別
 * @param error - 判定対象のエラー
 * @returns プール中断エラーの場合true
 */
function isPoolAbortError(error: unknown): boolean {
  return error instanceof Error && error.message === "concurrency pool aborted";
}

/**
 * 指定した並行数制限で非同期タスクを実行する
 *
 * DynTaskMAS統合: usePriorityScheduling=true時、itemWeightsに基づいて
 * 高優先度アイテム（重みが大きいアイテム）を先に実行する。
 *
 * 【重要: abortOnError の動作について】
 * abortOnError=true（デフォルト）の場合、最初のエラー発生後:
 * 1. poolAbortController.abort() が呼び出され、新規ワーカーの起動が停止される
 * 2. 既に実行中のワーカーは while ループ内で自然終了まで継続する
 * 3. これによりダングリングワーカー（永遠に終わらないワーカー）を防止する
 * 4. そのため、エラー発生後も一部のワーカーは処理を継続し、結果が返る可能性がある
 *
 * この動作は意図的な設計であり、リソースリークを防ぐためである。
 * 即座の全ワーカー強制終了が必要な場合は、別途 AbortSignal を使用すること。
 *
 * @param items - 処理対象のアイテム配列
 * @param limit - 同時実行数の上限
 * @param worker - 各アイテムを処理する非同期関数
 * @param options - 実行オプション（AbortSignal、優先度スケジューリングなど）
 * @returns settleMode='throw'時は各アイテムの処理結果配列、'allSettled'時はSettledResult配列
 * @throws abortOnError=trueかつエラー発生時、最初のエラーをthrowする
 *   （ただし、全ワーカーの完了を待ってからthrowされる）
 * @example
 * // Basic usage
 * const results = await runWithConcurrencyLimit(
 *   [1, 2, 3, 4, 5],
 *   2,
 *   async (item) => item * 2,
 *   { signal: abortController.signal }
 * );
 *
 * // With allSettled mode (partial failure handling)
 * const results = await runWithConcurrencyLimit(
 *   ['a', 'b', 'c'],
 *   2,
 *   async (item) => process(item),
 *   { settleMode: 'allSettled' }
 * );
 * const succeeded = results.filter(r => r.status === 'fulfilled');
 * const failed = results.filter(r => r.status === 'rejected');
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
  options: ConcurrencyRunOptions<TInput> & { settleMode: 'allSettled' },
): Promise<SettledResult<TResult>[]>;
export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options?: ConcurrencyRunOptions<TInput> & { settleMode?: 'throw' },
): Promise<TResult[]>;
export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: ConcurrencyRunOptions<TInput>,
): Promise<TResult[] | SettledResult<TResult>[]>;
export async function runWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number, signal?: AbortSignal) => Promise<TResult>,
  options: ConcurrencyRunOptions<TInput> = {},
): Promise<TResult[] | SettledResult<TResult>[]> {
  if (items.length === 0) return [];

  const abortOnError = options.abortOnError !== false;
  const settleMode = options.settleMode ?? 'throw';
  const { usePriorityScheduling, itemWeights, getItemId } = options;

  // IMPORTANT: abortOnError=true時の動作について
  // 最初のエラー発生後:
  // 1. poolAbortController.abort() が呼ばれ、新規ワーカー起動が停止される
  // 2. 既存の実行中ワーカーは while ループ内で自然終了まで継続する
  // 3. これによりダングリングワーカー（永遠に終わらないワーカー）を防止する
  // 4. そのため、エラー発生後も一部のワーカーは処理を継続し、結果が返る可能性がある
  // この動作は意図的な設計であり、リソースリーク防止のためである
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
        results[currentIndex] = { itemIndex: currentIndex, executionOrder: cursorIndex, result };
      } catch (error) {
        // Capture the first error but continue processing to avoid dangling workers
        if (firstError === undefined) {
          firstError = error;
          if (abortOnError) {
            poolAbortController.abort();
          }
        }
        results[currentIndex] = { itemIndex: currentIndex, executionOrder: cursorIndex, error };
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

  // allSettled mode: return SettledResult array for partial failure handling
  // NOTE: allSettled では firstError が存在しても throw しない（契約どおり配列で返す）
  if (settleMode === 'allSettled') {
    return Array.from({ length: items.length }, (_, index) => {
      const item = results[index];
      if (!item) {
        return {
          status: 'rejected' as const,
          reason: new Error(`concurrency pool internal error: missing result at itemIndex=${index}`),
          index,
        };
      }
      if (item.error) {
        return { status: 'rejected' as const, reason: item.error, index };
      }
      return { status: 'fulfilled' as const, value: item.result as TResult, index };
    });
  }

  // throw mode: If any worker failed, throw the first error encountered
  // Note: Check firstError BEFORE ensureNotAborted to preserve the original error message
  if (firstError !== undefined) {
    throw firstError;
  }

  // Only check abort status if no worker error occurred
  ensureNotAborted(effectiveSignal);

  // Unwrap results with explicit guards for unexpected holes.
  // Track which indices had errors for more precise error messages.
  const errorIndices: number[] = [];
  return results.map((item, index) => {
    if (!item) {
      throw new Error(`concurrency pool internal error: missing result at itemIndex=${index}`);
    }
    if (item?.error) {
      // エラー発生インデックスを記録（デバッグ用）
      // BUG-013 fix: executionOrderを含めてデバッグ情報を強化
      const execOrder = 'executionOrder' in item ? item.executionOrder : 'N/A';
      errorIndices.push(index);
      console.debug(`[concurrency] Worker error at itemIndex=${index}, executionOrder=${execOrder}`);
      throw item.error;
    }
    return item.result as TResult;
  });
}
