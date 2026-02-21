/**
 * @abdd.meta
 * path: .pi/lib/sleep-utils.ts
 * role: 非同期スリープユーティリティの共通実装
 * why: 複数のモジュールで重複定義されているsleep関数を一元管理し、保守性を向上させるため
 * related: .pi/extensions/rpm-throttle.ts, .pi/extensions/shared/pi-print-executor.ts, .pi/extensions/agent-teams/member-execution.ts
 * public_api: sleep
 * invariants: 0以下の引数は即座に解決される
 * side_effects: なし（Promiseベースの非同期待機のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: 指定ミリ秒だけ非同期で待機するユーティリティ関数
 * what_it_does:
 *   - 指定されたミリ秒数だけ実行を一時停止する
 *   - 0以下の値が渡された場合は即座に解決する
 * why_it_exists:
 *   - rpm-throttle, pi-print-executor, member-executionで重複定義されていたsleep関数を共通化する
 * scope:
 *   in: 待機時間（ミリ秒）
 *   out: 待機完了後に解決されるPromise
 */

/**
 * Sleep utilities.
 * Shared sleep function used across multiple modules.
 */

/**
 * 指定ミリ秒だけ非同期で待機する
 * @summary 非同期待機
 * @param ms 待機時間（ミリ秒）
 * @returns 待機完了後に解決されるPromise
 */
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
