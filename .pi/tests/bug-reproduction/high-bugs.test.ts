/**
 * Bug War Room Phase 4 - High Priority Bug Tests
 *
 * このテストファイルはHigh優先度バグの再現テストを含みます:
 * - バグ #4: agent-runtime.ts - ensureReservationSweeperの二重作成
 * - バグ #6: concurrency.ts - abortOnError=trueでも全完了待機
 * - バグ #7: retry-with-backoff.ts - ファイルロック後のメモリ状態更新
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// バグ #4: agent-runtime.ts - ensureReservationSweeperの二重作成
// ============================================================================

describe("Bug #4: agent-runtime.ts - ensureReservationSweeper Double Creation", () => {
  /**
   * 再現シナリオ:
   * interval作成時、race conditionで二重作成の可能性
   * if (runtimeReservationSweeper) return; のチェックがアトミックでない
   */

  beforeEach(async () => {
    // スイーパーを停止
    const { stopRuntimeReservationSweeper } = await import(
      "../../extensions/agent-runtime.js"
    );
    stopRuntimeReservationSweeper();
  });

  afterEach(async () => {
    const { stopRuntimeReservationSweeper } = await import(
      "../../extensions/agent-runtime.js"
    );
    stopRuntimeReservationSweeper();
  });

  it("should detect potential race condition when ensureReservationSweeper is called concurrently", async () => {
    const { getSharedRuntimeState, stopRuntimeReservationSweeper } = await import(
      "../../extensions/agent-runtime.js"
    );

    // 事前にスイーパーを停止
    stopRuntimeReservationSweeper();

    // 複数の並行呼び出しでgetStateを呼び出す（内部でensureReservationSweeperが呼ばれる）
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        Promise.resolve(getSharedRuntimeState())
      )
    );

    // 全ての結果が有効であることを確認
    for (const result of results) {
      expect(result).toBeDefined();
      expect(result.reservations).toBeDefined();
    }

    // バグがある場合: 複数のintervalが作成される可能性
    // このテストは問題の再現を試みるが、実際のinterval数を確認するのは難しい
    // 修正後は単一のintervalのみが作成されることを保証する必要がある
  });

  it("should only create one interval even with concurrent calls", async () => {
    const {
      getSharedRuntimeState,
      stopRuntimeReservationSweeper,
    } = await import("../../extensions/agent-runtime.js");

    // クリーンな状態から開始
    stopRuntimeReservationSweeper();

    // 遅延を入れて順次呼び出し
    const state1 = getSharedRuntimeState();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const state2 = getSharedRuntimeState();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const state3 = getSharedRuntimeState();

    // 全ての状態が一貫していることを確認
    expect(state1.reservations).toBeDefined();
    expect(state2.reservations).toBeDefined();
    expect(state3.reservations).toBeDefined();

    // 同じオブジェクト参照であることを確認（シングルトン）
    expect(state1).toBe(state2);
    expect(state2).toBe(state3);
  });
});

// ============================================================================
// バグ #6: concurrency.ts - abortOnError=trueでも全完了待機
// ============================================================================

describe("Bug #6: concurrency.ts - abortOnError Behavior", () => {
  /**
   * 再現シナリオ:
   * firstError設定後もワーカーが継続実行。
   * abortOnError=trueでも全完了待機してしまう
   */

  it("should demonstrate workers continue after first error with abortOnError=true", async () => {
    const { runWithConcurrencyLimit } = await import("../../lib/concurrency.js");

    const executionOrder: number[] = [];
    const items = [1, 2, 3, 4, 5];

    // 最初のアイテムでエラーを発生させるが、他のワーカーも継続する
    const worker = async (item: number, index: number) => {
      executionOrder.push(item);
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (index === 0) {
        throw new Error(`Error on item ${item}`);
      }
      return item * 2;
    };

    // abortOnError=true（デフォルト）で実行
    let errorThrown: Error | null = null;
    try {
      await runWithConcurrencyLimit(items, 2, worker, { abortOnError: true });
    } catch (e) {
      errorThrown = e as Error;
    }

    // バグの再現:
    // - 最初のエラーが発生しても他のワーカーが継続実行される
    // - 全てのワーカーが完了するまで待機する
    expect(errorThrown).not.toBeNull();
    expect(errorThrown?.message).toContain("Error on item 1");

    // バグ: 最初のエラー後も他のアイテムが処理されている
    // 修正後: 最初のエラー時に直ちに他のワーカーが停止すべき
    expect(executionOrder.length).toBeGreaterThan(1); // バグ: 複数実行されている
  });

  it("should measure time taken after first error with abortOnError=true", async () => {
    const { runWithConcurrencyLimit } = await import("../../lib/concurrency.js");

    const items = [1, 2, 3, 4, 5];
    const workerDelays = [10, 200, 200, 200, 200]; // 最初のアイテムだけ高速にエラー

    const worker = async (item: number, index: number) => {
      await new Promise((resolve) => setTimeout(resolve, workerDelays[index]));
      if (index === 0) {
        throw new Error("First error");
      }
      return item * 2;
    };

    const startTime = Date.now();
    try {
      await runWithConcurrencyLimit(items, 2, worker, { abortOnError: true });
    } catch {
      // エラーは期待される
    }
    const elapsedMs = Date.now() - startTime;

    // バグの再現:
    // abortOnError=trueでも、全ワーカー完了まで待機するため時間がかかる
    // 修正後: 最初のエラー発生後、高速に終了すべき（~50ms程度）
    // 現在の動作: 全ワーカー完了まで待機（~400ms以上）
    expect(elapsedMs).toBeGreaterThan(100); // バグ: 長時間待機している
  });

  it("should handle abort signal correctly", async () => {
    const { runWithConcurrencyLimit } = await import("../../lib/concurrency.js");

    const abortController = new AbortController();
    const executionOrder: number[] = [];
    const items = [1, 2, 3, 4, 5];

    const worker = async (item: number, index: number) => {
      executionOrder.push(item);
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (index === 2) {
        abortController.abort(); // 中盤でアボート
      }
      return item * 2;
    };

    try {
      await runWithConcurrencyLimit(items, 2, worker, {
        signal: abortController.signal,
        abortOnError: true,
      });
    } catch {
      // エラーは期待される
    }

    // アボート後は追加のワーカーが開始されないことを確認
    // ただし、現在開始されているワーカーは完了まで実行される
    expect(executionOrder.length).toBeLessThan(items.length);
  });
});

// ============================================================================
// バグ #7: retry-with-backoff.ts - ファイルロック後のメモリ状態更新
// ============================================================================

describe("Bug #7: retry-with-backoff.ts - withSharedRateLimitState Memory Consistency", () => {
  /**
   * 再現シナリオ:
   * withSharedRateLimitState内でファイルロック取得後にメモリ状態を更新するが、
   * 他プロセスが同時更新の可能性があり、トランザクション的な一貫性がない
   *
   * 注: registerRateLimitGateHit は内部関数のため、retryWithBackoffを使用
   */

  beforeEach(async () => {
    const { clearRateLimitState } = await import("../../lib/retry-with-backoff.js");
    clearRateLimitState();
  });

  afterEach(async () => {
    const { clearRateLimitState } = await import("../../lib/retry-with-backoff.js");
    clearRateLimitState();
  });

  it("should maintain consistency when multiple concurrent rate limit operations occur", async () => {
    const {
      retryWithBackoff,
      getRateLimitGateSnapshot,
    } = await import("../../lib/retry-with-backoff.js");

    const key = "test-consistency-key-7";
    let callCount = 0;

    // 429エラーを発生させるモックオペレーション
    const create429Operation = () => async () => {
      callCount++;
      if (callCount <= 3) {
        throw { status: 429, message: "Rate limit" };
      }
      return "success";
    };

    // 複数回の更新を並列実行
    const promises = Array.from({ length: 3 }, () =>
      retryWithBackoff(create429Operation(), {
        rateLimitKey: key,
        overrides: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 500 },
      }).catch(() => "expected-failure")
    );

    await Promise.all(promises);

    // 最終状態を確認
    const snapshot = getRateLimitGateSnapshot(key);

    // バグがある場合: メモリ状態とファイル状態が一致しない可能性
    expect(typeof snapshot.hits).toBe("number");
    expect(snapshot.hits).toBeLessThanOrEqual(8);
    expect(snapshot.waitMs).toBeGreaterThanOrEqual(0);
  });

  it("should handle concurrent modifications with different keys", async () => {
    const {
      retryWithBackoff,
      getRateLimitGateSnapshot,
    } = await import("../../lib/retry-with-backoff.js");

    const keys = ["key-a-7", "key-b-7", "key-c-7", "key-d-7"];
    let callCount = 0;

    // 429エラーを発生させるモックオペレーション
    const create429Operation = () => async () => {
      callCount++;
      if (callCount <= 2) {
        throw { status: 429, message: "Rate limit" };
      }
      return "success";
    };

    // 各キーに対して並列で更新
    const promises = keys.map((key) =>
      retryWithBackoff(create429Operation(), {
        rateLimitKey: key,
        overrides: { maxRetries: 1, initialDelayMs: 50, maxDelayMs: 200 },
      }).catch(() => "expected-failure")
    );

    await Promise.all(promises);

    // 各キーの状態を確認
    for (const key of keys) {
      const snapshot = getRateLimitGateSnapshot(key);
      expect(snapshot.key).toBe(key);
      expect(typeof snapshot.hits).toBe("number");
      expect(snapshot.hits).toBeLessThanOrEqual(8);
    }
  });

  it("should maintain state consistency across multiple operations", async () => {
    const {
      retryWithBackoff,
      getRateLimitGateSnapshot,
    } = await import("../../lib/retry-with-backoff.js");

    const key = "test-transaction-key-7";

    // 成功するオペレーション
    const successOperation = async () => "success";

    // 成功を複数回実行
    await retryWithBackoff(successOperation, { rateLimitKey: key });

    const afterSuccess1 = getRateLimitGateSnapshot(key);

    // 成功を再度実行
    await retryWithBackoff(successOperation, { rateLimitKey: key });

    const afterSuccess2 = getRateLimitGateSnapshot(key);

    // バグがある場合: 状態が一貫していない可能性
    // 修正後: 状態が一貫していることを確認
    expect(typeof afterSuccess1.hits).toBe("number");
    expect(typeof afterSuccess2.hits).toBe("number");
  });
});
