/**
 * @abdd.meta
 * path: .pi/lib/agent-utils.ts
 * role: エージェント実行に関する共通ユーティリティモジュール
 * why: 実装が重複していたID生成およびウィンドウ計算ロジックを集約し、保守性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createRunId, computeLiveWindow
 * invariants: createRunIdは常に一意な文字列を返す, computeLiveWindowのstartは0以上end以下である
 * side_effects: なし（参照透過性がある）
 * failure_modes: computeLiveWindowに負数やNaNが渡された場合の挙動は未定義
 * @abdd.explain
 * overview: エージェントのセッション識別とUI表示範囲計算のためのヘルパー関数群
 * what_it_does:
 *   - 日時と乱数による一意な実行ID文字列を生成する
 *   - 総アイテム数とカーソル位置に基づき、スライディングウィンドウの開始・終了インデックスを計算する
 * why_it_exists:
 *   - 複数の拡張機能（loop, subagents, agent-teams）で重複していたコードを削除するため
 *   - ID生成ロジックやスクロール表示ロジックの変更を一箇所で行うため
 * scope:
 *   in: 日時データ、乱数生成器、カーソル位置、総アイテム数、最大行数
 *   out: 実行ID文字列、インデックス範囲オブジェクト
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
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
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
