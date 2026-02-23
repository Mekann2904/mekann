/**
 * @abdd.meta
 * path: .pi/lib/sleep-utils.ts
 * role: 汎用非同期待機機能の提供
 * why: 複数モジュールで共通利用する待機処理を一箇所に集約するため
 * related: .pi/lib/async-utils.ts, .pi/lib/time-helper.ts, .pi/lib/test-utils.ts
 * public_api: sleep(ms: number): Promise<void>
 * invariants: msが0以下の場合、即座に解決されるPromiseを返す
 * side_effects: なし（タイマー設定のみ）
 * failure_modes: なし（引数が数値であれば実行時エラーは発生しない）
 * @abdd.explain
 * overview: 指定したミリ秒間処理を停止する非同期関数を提供するモジュール
 * what_it_does:
 *   - 指定ミリ秒待機後に解決されるPromiseを返す
 *   - 0以下の値が指定された場合は即座に解決する
 * why_it_exists:
 *   - setTimeoutをPromiseでラップし、async/await構文で簡潔に記述するため
 *   - 待機ロジックを共通化し、コードの重複を防ぐため
 * scope:
 *   in: number型の待機時間（ミリ秒）
 *   out: void型で解決されるPromise
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
