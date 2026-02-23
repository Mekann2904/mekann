/**
 * @abdd.meta
 * path: .pi/lib/tui/tui-utils.ts
 * role: TUI共通ユーティリティ実装モジュール
 * why: 拡張機能間で重複していたTUI処理（agent-teams.ts, subagents.ts）を統一し、コード重複を排除するため
 * related: agent-teams.ts, subagents.ts
 * public_api: appendTail, toTailLines, countOccurrences, estimateLineCount, looksLikeMarkdown, LIVE_TAIL_LIMIT, LIVE_MARKDOWN_PREVIEW_MIN_WIDTH
 * invariants: 出力文字列はANSIエスケープや制御文字によって描画が崩れない形式であること
 * side_effects: なし（純粋関数と定数定義のみ）
 * failure_modes: 不正なサロゲートペアを含む文字列を処理した場合、length計算やスライスが不正になる可能性がある
 * @abdd.explain
 * overview: TUI（Terminal User Interface）で共通利用される文字列整形、Markdown判定、長さ制御などのユーティリティ関数集
 * what_it_does:
 *   - ログやテキストの末尾への追加と最大長による切り捨て（appendTail）
 *   - 文字列の末尾N行の抽出（toTailLines）
 *   - 特定文字列の出現回数カウント（countOccurrences）
 *   - バイト数と改行コードからの概算行数計算（estimateLineCount）
 *   - 文字列のMarkdownフォーマット判定（looksLikeMarkdown）
 *   - Markdownレンダリング向けの制御文字除去（sanitizePreviewText）
 * why_it_exists:
 *   - 複数の拡張機能で散らばっていた同一ロジックを一箇所に集約し、保守性を向上させるため
 *   - ターミナル描画に特化したテキスト処理（制御文字除去等）を安全に行うため
 *   - 他のlibモジュールへの依存を含めないLayer 0レイヤーとして設計されているため
 * scope:
 *   in: 生の文字列データ（ログ、Markdownテキスト）、最大長、行数制限、バイト数
 *   out: 整形済み文字列、行配列、数値（カウント、行数）、真偽値（Markdown判定）
 */

/**
 * TUI (Terminal User Interface) utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 *
 * Layer 0: No dependencies on other lib modules.
 */

import { Markdown, truncateToWidth, type MarkdownTheme, wrapTextWithAnsi } from "@mariozechner/pi-tui";

/** Default maximum length for tail content */
export const LIVE_TAIL_LIMIT = 40_000;

/** Minimum width for markdown preview rendering */
export const LIVE_MARKDOWN_PREVIEW_MIN_WIDTH = 24;

/**
 * ANSIエスケープや制御文字を除去してプレビュー描画を安定化させる。
 * Markdownレンダラが制御シーケンスで失敗するケースを防ぐ。
 */
function sanitizePreviewText(input: string): string {
  if (!input) return "";
  // ANSI escape sequence
  const withoutAnsi = input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
  // 画面描画を崩す制御文字のみ除去（改行・タブとUnicode文字は保持）
  // C0/C1 制御文字を除去し、非ASCII（例: 日本語）を消さないようにする。
  return withoutAnsi.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

/**
 * チャンクを追加し長さ制御
 * @summary 末尾にチャンク追加
 * @param current - 現在の文字列
 * @param chunk - 追加するチャンク
 * @param maxLength - 最大長
 * @returns 結合された文字列
 */
export function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
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
  // Remove empty lines from the end
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length <= limit) return lines;
  return lines.slice(lines.length - limit);
}

/**
 * 出現回数を数える
 * @summary 出現回数を数える
 * @param input - 検索対象の文字列
 * @param target - 数える対象の文字列
 * @returns 出現回数
 */
export function countOccurrences(input: string, target: string): number {
  if (!input || !target) return 0;
  let count = 0;
  let index = 0;
  while (index < input.length) {
    const found = input.indexOf(target, index);
    if (found < 0) break;
    count += 1;
    index = found + target.length;
  }
  return count;
}

/**
 * 行数を推定する
 * @summary 行数を推定
 * @param bytes - 総バイト数
 * @param newlineCount - 改行文字の数
 * @param endsWithNewline - 末尾が改行で終わるか
 * @returns 推定された行数
 */
export function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}

/**
 * 行数を推定する
 * @summary 行数を推定
 * @param bytes - 総バイト数
 * @param newlineCount - 改行文字の数
 * @param endsWithNewline - 末尾が改行で終わるか
 * @returns 推定された行数
 */
export function looksLikeMarkdown(input: string): boolean {
  const text = sanitizePreviewText(input).trim();
  if (!text) return false;
  // Headers
  if (/^\s{0,3}#{1,6}\s+/m.test(text)) return true;
  // Unordered lists
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  // Ordered lists
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  // Code blocks
  if (/```/.test(text)) return true;
  // Links
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  // Blockquotes
  if (/^\s*>\s+/m.test(text)) return true;
  // Tables
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  // Bold
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  // Inline code
  if (/`[^`]+`/.test(text)) return true;
  return false;
}

/**
 * Markdown描画結果
 * @summary 結果を格納
 */
export interface MarkdownPreviewResult {
  lines: string[];
  renderedAsMarkdown: boolean;
}

function createMarkdownTheme(): MarkdownTheme {
  const passthrough = (text: string): string => text;
  return {
    heading: passthrough,
    link: passthrough,
    linkUrl: passthrough,
    code: passthrough,
    codeBlock: passthrough,
    codeBlockBorder: passthrough,
    quote: passthrough,
    quoteBorder: passthrough,
    hr: passthrough,
    listBullet: passthrough,
    bold: passthrough,
    italic: passthrough,
    strikethrough: passthrough,
    underline: passthrough,
  };
}

/**
 * 1行テキストを幅に合わせて折り返し、出力配列へ追加する。
 * ANSIカラーコードを保持したまま折り返す。
 */
export function pushWrappedLine(output: string[], line: string, width: number): void {
  const safeWidth = Math.max(1, Number.isFinite(width) ? Math.trunc(width) : 1);
  const logicalLines = String(line ?? "").split(/\r?\n/);
  for (const logicalLine of logicalLines) {
    if (!logicalLine) {
      output.push("");
      continue;
    }
    const wrapped = wrapTextWithAnsi(logicalLine, safeWidth);
    if (wrapped.length === 0) {
      output.push("");
      continue;
    }
    for (const wrappedLine of wrapped) {
      // wrapTextWithAnsi だけでは OSC8 等を含む行で幅超過が残る場合がある。
      // 最終段で必ず幅内に収めることで TUI クラッシュを防ぐ。
      output.push(truncateToWidth(wrappedLine, safeWidth));
    }
  }
}

/**
 * Markdown形式で描画
 * @summary 描画を行う
 * @param {string} text 入力テキスト
 * @param {number} width 表示幅
 * @param {number} maxLines 最大行数
 * @returns {MarkdownPreviewResult} 描画結果
 */
export function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): MarkdownPreviewResult {
  const normalizedText = sanitizePreviewText(text);
  if (!normalizedText.trim()) {
    return { lines: [], renderedAsMarkdown: false };
  }

  if (!looksLikeMarkdown(normalizedText)) {
    return { lines: toTailLines(normalizedText, maxLines), renderedAsMarkdown: false };
  }

  try {
    const markdown = new Markdown(normalizedText, 0, 0, createMarkdownTheme());
    const rendered = markdown.render(Math.max(LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, width));
    if (rendered.length === 0) {
      return { lines: toTailLines(normalizedText, maxLines), renderedAsMarkdown: false };
    }
    if (rendered.length <= maxLines) {
      return { lines: rendered, renderedAsMarkdown: true };
    }
    return { lines: rendered.slice(rendered.length - maxLines), renderedAsMarkdown: true };
  } catch {
    return { lines: toTailLines(normalizedText, maxLines), renderedAsMarkdown: false };
  }
}
