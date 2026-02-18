/**
 * @abdd.meta
 * path: .pi/lib/process-utils.ts
 * role: プロセス停止制御用の定数定義モジュール
 * why: プロセス停止時のタイムアウト値を一元管理し、SIGTERM/SIGKILL間の待機時間を統一するため
 * related: process-manager.ts, shutdown-handler.ts, spawn-utils.ts
 * public_api: GRACEFUL_SHUTDOWN_DELAY_MS
 * invariants: GRACEFUL_SHUTDOWN_DELAY_MS は常に2000で不変
 * side_effects: なし（純粋な定数エクスポートのみ）
 * failure_modes: なし（実行時処理を含まない）
 * @abdd.explain
 * overview: プロセスのgraceful shutdown制御用タイムアウト定数を提供する
 * what_it_does:
 *   - SIGTERM送信後からSIGKILL送信までの待機時間を2000msとして定義
 *   - 他モジュールから参照可能な共通定数としてエクスポート
 * why_it_exists:
 *   - プロセス停止処理全体で一貫したタイムアウト値を使用するため
 *   - ハードコードを避け、設定値の変更箇所を一箇所に集約するため
 * scope:
 *   in: なし（外部入力を受け取らない）
 *   out: プロセス停止制御用のタイムアウト定数値
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
