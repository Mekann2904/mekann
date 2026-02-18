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
