/**
 * @abdd.meta
 * path: .pi/lib/process-utils.ts
 * role: プロセス終了待機時間の定数定義
 * why: SIGTERM送信後のSIGKILL送信タイミングを統一するため
 * related: process-manager.ts, shutdown-handler.ts
 * public_api: GRACEFUL_SHUTDOWN_DELAY_MS
 * invariants: GRACEFUL_SHUTDOWN_DELAY_MSは正の整数である
 * side_effects: なし
 * failure_modes: 設定値がシステム制限を超える場合、タイムアウト処理が期待通り動作しない可能性がある
 * @abdd.explain
 * overview: グレースフルシャットダウン処理における強制終了までの待機時間を定義するモジュール
 * what_it_does:
 *   - GRACEFUL_SHUTDOWN_DELAY_MS 定数をエクスポートする
 *   - SIGTERM送信からSIGKILL送信までの遅延時間（2000ms）を提供する
 * why_it_exists:
 *   - プロセス終了待機時間をハードコーディングから分離し、一元管理するため
 *   - シャットダウン挙動の一貫性を保証するため
 * scope:
 *   in: なし
 *   out: 数値型の定数（ミリ秒単位）
 */

/**
 * Process utilities for graceful shutdown handling.
 * Provides shared constants for process termination timeouts.
 */

/**
 * Graceful shutdown delay before force-killing a process.
 * After SIGTERM, wait this many ms before sending SIGKILL.
 */
export const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;
