/**
 * @abdd.meta
 * path: .pi/lib/agent-utils.ts
 * role: エージェント関連の共通ユーティリティ関数を提供するモジュール
 * why: loop.ts, subagents.ts, agent-teams.tsで重複していたcreateRunIdとcomputeLiveWindowの実装を一元管理し、保守性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createRunId, computeLiveWindow
 * invariants:
 *   - createRunIdは呼び出しごとに一意のIDを返す（タイムスタンプ+乱数の組み合わせ）
 *   - computeLiveWindowは返却されるendは常にstart以上でtotal以下
 *   - computeLiveWindowの戻り値の範囲サイズはmaxRowsとtotalの小さい方以下
 * side_effects:
 *   - createRunId: 乱数生成のためにnode:cryptoを使用
 * failure_modes:
 *   - createRunId: システム時刻が不正な場合、IDの順序性が保証されない
 *   - computeLiveWindow: totalが負数の場合、start=0, end=totalとなり意図しない動作となる
 * @abdd.explain
 * overview: エージェント機能で使用する実行ID生成とUI表示用ウィンドウ計算のユーティリティ関数を集約したモジュール
 * what_it_does:
 *   - タイムスタンプベースの一意な実行IDを生成する（YYYYMMDD-HHmmss-xxxxxx形式）
 *   - リスト表示用のスライディングウィンドウの開始・終了位置を計算する
 * why_it_exists:
 *   - 複数のエクステンション間で重複していたID生成ロジックを統一するため
 *   - ライブリスト表示でのカーソル位置に基づく表示範囲計算を共通化するため
 * scope:
 *   in: カーソル位置、アイテム総数、最大表示行数、現在時刻
 *   out: 実行ID文字列、表示範囲（start, end）を示すオブジェクト
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
