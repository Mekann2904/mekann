/**
 * @abdd.meta
 * path: .pi/lib/live-view-utils.ts
 * role: ライブビュー（TUI）の表示補助と入力判定を行うユーティリティモジュール
 * why: サブエージェントやチームの状態表示、およびユーザー入力処理の共通ロジックを集約するため
 * related: .pi/lib/live-view-renderer.ts, .pi/lib/subagent.ts
 * public_api: LiveStatus, getLiveStatusGlyph, isEnterInput, finalizeLiveLines
 * invariants: getLiveStatusGlyphは必ず2文字の文字列を返す、finalizeLiveLinesは戻り値の長さがheightと一致する（height指定時）
 * side_effects: なし（純粋関数）
 * failure_modes: finalizeLiveLinesでheightが負数の場合は何もしない、isEnterInputで想定外の制御文字が来るとfalseを返す
 * @abdd.explain
 * overview: TUIにおけるステータスグリフ変換、Enterキー判定、表示行の高さ調整を行う
 * what_it_does:
 *   - 実行状態（pending/running/completed/failed）に対応する2文字のグリフ文字列を返す
 *   - 改行文字や"enter"文字列をEnterキー入力として判定する
 *   - 指定された高さに合わせて行数を切り詰め、または空行で埋める
 * why_it_exists:
 *   - ライブビュー描画ロジックからステータス表現や入力処理を分離し、コードの可読性と再利用性を高めるため
 *   - 複数箇所で同様の行整形処理が発生するのを防ぐため
 * scope:
 *   in: ステータス列挙型、生の入力文字列、整形対象の文字列配列、高さ数値
 *   out: グリフ文字列、判定結果の真偽値、高さ固定された文字列配列
 */

/**
 * Live view utilities for subagents and agent teams.
 * Shared functions for rendering live status views in TUI.
 */

/**
 * ライブビューのステータス型
 * @summary ステータスを定義
 * @returns ライブビューのステータス
 */
export type LiveStatus = "pending" | "running" | "completed" | "failed";

/**
 * ステータスグリフの設定
 * @summary グリフと色の設定
 */
export interface StatusGlyphConfig {
  glyph: string;
  color: "dim" | "accent" | "success" | "error";
}

/** ステータスごとのグリフ設定 */
const STATUS_GLYPHS: Record<LiveStatus, StatusGlyphConfig> = {
  pending:   { glyph: "[ ]", color: "dim" },
  running:   { glyph: "[>]", color: "accent" },
  completed: { glyph: "[+]", color: "success" },
  failed:    { glyph: "[x]", color: "error" },
};

/**
 * @summary ステータスグリフ取得
 * @param status - 変換対象のステータス
 * @returns ステータスを表す3文字のグリフ文字列
 */
export function getLiveStatusGlyph(status: LiveStatus): string {
  return STATUS_GLYPHS[status]?.glyph ?? "[?]";
}

/**
 * @summary ステータス色取得
 * @param status - 変換対象のステータス
 * @returns テーマ色キー
 */
export function getLiveStatusColor(status: LiveStatus): "dim" | "accent" | "success" | "error" {
  return STATUS_GLYPHS[status]?.color ?? "dim";
}

/**
 * @summary アクティビティインジケータ取得
 * @param hasOutput - 出力があるか
 * @param hasError - エラーがあるか
 * @param isRecent - 最近のアクティビティか
 * @returns アクティビティ文字列（アクティブ時のみ、それ以外は空文字）
 */
export function getActivityIndicator(
  hasOutput: boolean,
  hasError: boolean,
  isRecent: boolean,
): string {
  if (hasError) return "err!";
  if (hasOutput && isRecent) return "out!";
  if (hasOutput) return "out";
  return "-";
}

/**
 * @summary Enterキー判定
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
 * 行データを最終化する
 * @summary 行データ最終化
 * @param lines 対象の行配列
 * @param height 高さ（任意）
 * @returns 処理後の行配列
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

/**
 * 末尾の行を取得
 * @summary 末尾行を取得
 * @param tail - 処理対象の文字列
 * @param limit - 取得する最大行数
 * @returns 末尾の行の配列
 */
export function toTailLines(tail: string, limit: number): string[] {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}

/**
 * Markdownらしいテキストか判定する
 * @summary Markdown判定
 * @param input - 判定対象テキスト
 * @returns Markdownの可能性が高い場合はtrue
 */
export function looksLikeMarkdown(input: string): boolean {
  const text = String(input || "").trim();
  if (!text) return false;
  if (/^\s{0,3}#{1,6}\s+/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/```/.test(text)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  if (/^\s*>\s+/m.test(text)) return true;
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;
  return false;
}
