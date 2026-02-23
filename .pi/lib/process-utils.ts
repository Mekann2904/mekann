/**
 * @abdd.meta
 * path: .pi/lib/process-utils.ts
 * role: プロセス終了の猶予時間定数の提供元
 * why: プロセスの強制終了（SIGKILL）を送信するまでの待ち時間を一元管理するため
 * related: .pi/lib/process.ts, .pi/lib/server.ts
 * public_api: GRACEFUL_SHUTDOWN_DELAY_MS
 * invariants: GRACEFUL_SHUTDOWN_DELAY_MSは正の整数である
 * side_effects: なし
 * failure_modes: 定数の値が変更されると、シャットダウン挙動が変化する
 * @abdd.explain
 * overview: グレースフルシャットダウン処理向けのユーティリティ定数
 * what_it_does:
 *   - SIGKILL送信前の待ち時間をミリ秒単位で定義する
 *   - タイムアウト値を定数としてエクスポートする
 * why_it_exists:
 *   - マジックナンバーを排除し、設定を一箇所に集約するため
 *   - シャットダウン挙動の調整を容易にするため
 * scope:
 *   in: なし
 *   out: number (GRACEFUL_SHUTDOWN_DELAY_MS)
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
