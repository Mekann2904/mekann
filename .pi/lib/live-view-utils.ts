/**
 * @abdd.meta
 * path: .pi/lib/live-view-utils.ts
 * role: TUI用ライブビュー描画の共通ユーティリティ関数群
 * why: サブエージェントやエージェントチームのステータス表示において、一貫したグリフ表現・入力判定・行整形を提供するため
 * related: live-view.ts, subagent-live-view.ts, team-live-view.ts, types.ts
 * public_api: LiveStatus, getLiveStatusGlyph, isEnterInput, finalizeLiveLines
 * invariants:
 *   - getLiveStatusGlyphは常に2文字の文字列を返す
 *   - LiveStatusは4つの固定値のみを受け入れる
 *   - finalizeLiveLinesはheightが正の場合、返却配列長はheightと等しい
 * side_effects: なし（純粋関数のみ）
 * failure_modes:
 *   - heightに負数を渡すとパディングされずそのまま返る
 *   - rawInputにnull/undefinedを渡すと例外が発生する
 * @abdd.explain
 * overview: ライブビューTUI描画用の型定義と3つの純粋関数を提供するユーティリティモジュール
 * what_it_does:
 *   - LiveStatus型（pending/running/completed/failed）を定義
 *   - ステータスを2文字のグリフ（OK/!!/>>/..）に変換
 *   - Enterキー入力を検出（\r, \n, \r\n, enterを判定）
 *   - 行配列を指定高さで整形（切り詰めまたは空行パディング）
 * why_it_exists:
 *   - 複数のライブビューコンポーネントでステータス表現を統一するため
 *   - キー入力判定ロジックの重複を回避するため
 *   - 固定高さUIでの行整形処理を共通化するため
 * scope:
 *   in: ライブビュー描画に必要なステータス変換・入力判定・行整形機能
 *   out: 画面描画ロジック、イベントループ、状態管理
 */

/**
 * Live view utilities for subagents and agent teams.
 * Shared functions for rendering live status views in TUI.
 */

 /**
  * ライブビューのステータスを表す型
  */
export type LiveStatus = "pending" | "running" | "completed" | "failed";

 /**
  * ステータスに対応するグリフを返す
  * @param status - 変換対象のステータス
  * @returns ステータスを表す2文字の文字列
  */
export function getLiveStatusGlyph(status: LiveStatus): string {
  if (status === "completed") return "OK";
  if (status === "failed") return "!!";
  if (status === "running") return ">>";
  return "..";
}

 /**
  * 入力がEnterキーか判定する
  * @param rawInput - 判定する生の入力文字列
  * @returns Enterキーの場合はtrue
  */
export function isEnterInput(rawInput: string): boolean {
  return (
    rawInput === "\r" ||
    rawInput === "\n" ||
    rawInput === "\r\n" ||
    rawInput === "enter"
  );
}

 /**
  * 固定高さの表示用に行を整形する
  * @param lines - 対象の行配列
  * @param height - オプションの高さ
  * @returns 整形された行配列
  */
export function finalizeLiveLines(lines: string[], height?: number): string[] {
  if (!height || height <= 0) {
    return lines;
  }
  if (lines.length > height) {
    return lines.slice(0, height);
  }
  const padded = [...lines];
  while (padded.length < height) {
    padded.push("");
  }
  return padded;
}
