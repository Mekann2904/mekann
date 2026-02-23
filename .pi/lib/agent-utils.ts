/**
 * @abdd.meta
 * path: .pi/lib/agent-utils.ts
 * role: エージェント機能で利用される共通ユーティリティの集約モジュール
 * why: 実装の重複を排除し、メンテナンス性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createRunId, computeLiveWindow
 * invariants: createRunIdは常に一意な文字列を返す、computeLiveWindowの戻り値範囲は0以上total以下
 * side_effects: なし（純粋関数）
 * failure_modes: randomBytesの失敗（システムエラー）、引数が数値以外の場合の型エラー
 * @abdd.explain
 * overview: 実行ID生成とUI表示範囲計算機能を提供する共有ライブラリ
 * what_it_does:
 *   - 日時と乱数を組み合わせた一意な実行IDを生成する
 *   - カーソル位置に基づき、リスト表示の開始位置と終了位置をスライディングウィンドウ形式で算出する
 * why_it_exists:
 *   - 複数の拡張機能（loop, subagents, agent-teams）に存在していた重複コードを削減するため
 *   - ID生成ロジックや表示計算ロジックの修正を一箇所で完結させるため
 * scope:
 *   in: 日時情報（createRunId）、カーソル位置・総数・最大行数（computeLiveWindow）
 *   out: 一意ID文字列、または計算された表示範囲オブジェクト（start/end）
 */

/**
 * Shared agent utility functions.
 * Consolidates duplicate implementations from:
 * - .pi/extensions/loop.ts (createRunId)
 * - .pi/extensions/subagents.ts (createRunId, computeLiveWindow)
 * - .pi/extensions/agent-teams.ts (createRunId, computeLiveWindow)
 */

import { randomBytes } from "node:crypto";

 /**
  * 一意な実行IDを生成します。
  * @returns 一意な実行ID文字列
  */
export function createRunId(): string {
  const now = new Date();
  const stamp = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

/**
 * @summary 表示範囲を算出
 * @param cursor - 現在のカーソル位置（0開始）
 * @param total - 全アイテム数
 * @param maxRows - 表示可能な最大行数
 * @returns 開始位置（含む）と終了位置（不含）を持つオブジェクト
 */
export function computeLiveWindow(
  cursor: number,
  total: number,
  maxRows: number,
): { start: number; end: number } {
  if (total <= maxRows) return { start: 0, end: total };
  const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
  const start = Math.max(0, Math.min(total - maxRows, clampedCursor - (maxRows - 1)));
  return { start, end: Math.min(total, start + maxRows) };
}
