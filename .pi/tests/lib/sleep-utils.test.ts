/**
 * @abdd.meta
 * path: .pi/tests/lib/sleep-utils.test.ts
 * role: sleep-utils.tsのユニットテスト
 * why: 非同期スリープ関数の正確性を保証するため
 * related: .pi/lib/sleep-utils.ts
 * public_api: テストケースの実行
 * invariants: テストは冪等性を持つ
 * side_effects: なし（タイマーを使用するがクリーンアップされる）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: sleep関数の正常動作、境界値、非同期動作を検証
 * what_it_does: 待機時間の正確性、0以下の値の処理、Promise解決の確認
 * why_it_exists: 非同期処理の品質保証とリグレッション防止
 * scope:
 *   in: 待機時間（ミリ秒）
 *   out: テスト結果
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep } from "../../lib/sleep-utils.js";

// ============================================================================
// sleep Tests
// ============================================================================

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("指定ミリ秒後に解決される", async () => {
    // Arrange
    const ms = 1000;
    const promise = sleep(ms);

    // Act - タイマーを進める前
    // Promiseがまだ解決されていないことを確認
    let resolved = false;
    promise.then(() => { resolved = true; });

    // Assert - 進める前
    expect(resolved).toBe(false);

    // Act - タイマーを進める
    await vi.advanceTimersByTimeAsync(1000);

    // Assert - 進めた後
    expect(resolved).toBe(true);
  });

  it("0ミリ秒は即座に解決される", async () => {
    // Arrange & Act
    const result = sleep(0);

    // Assert - 同期的に解決される
    await expect(result).resolves.toBeUndefined();
  });

  it("負の値は即座に解決される", async () => {
    // Arrange & Act
    const result = sleep(-100);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  it("正の値はPromiseを返す", () => {
    // Arrange & Act
    const result = sleep(100);

    // Assert
    expect(result).toBeInstanceOf(Promise);
  });

  it("複数のsleepが正しく動作する", async () => {
    // Arrange
    const order: number[] = [];

    // Act
    const promise1 = sleep(100).then(() => { order.push(1); });
    const promise2 = sleep(200).then(() => { order.push(2); });
    const promise3 = sleep(50).then(() => { order.push(3); });

    await vi.advanceTimersByTimeAsync(250);
    await Promise.all([promise1, promise2, promise3]);

    // Assert - 時間順に実行される
    expect(order).toEqual([3, 1, 2]);
  });

  it("非常に長い待機時間も正しく処理される", async () => {
    // Arrange
    const longMs = 24 * 60 * 60 * 1000; // 1日
    const promise = sleep(longMs);
    let resolved = false;
    promise.then(() => { resolved = true; });

    // Act
    await vi.advanceTimersByTimeAsync(longMs);

    // Assert
    expect(resolved).toBe(true);
  });
});

describe("sleep - 統合テスト（リアルタイマー）", () => {
  it("実際の時間待機が動作する", async () => {
    // Arrange
    const start = Date.now();

    // Act
    await sleep(10); // 10ms（テスト高速化のため短く）

    // Assert
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(5); // 若干の誤差を許容
  });
});
