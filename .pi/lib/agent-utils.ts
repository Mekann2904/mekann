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
  * ライブリスト表示のスライディングウィンドウを計算
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
