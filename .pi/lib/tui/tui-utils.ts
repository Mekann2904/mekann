/**
 * @abdd.meta
 * path: .pi/lib/tui/tui-utils.ts
 * role: TUI共通ユーティリティ関数群
 * why: agent-teams.tsとsubagents.ts間の重複実装を統合するため
 * related: agent-teams.ts, subagents.ts, @mariozechner/pi-tui
 * public_api: LIVE_TAIL_LIMIT, LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, appendTail, toTailLines, countOccurrences, estimateLineCount, looksLikeMarkdown, MarkdownPreviewResult
 * invariants: appendTailはmaxLength超過時のみ先頭を切り捨てる、toTailLinesは末尾の空行を常に削除する
 * side_effects: なし（純粋関数のみ）
 * failure_modes: 引数にnull/undefined渡過時の TypeError（TypeScript型チェックで防止）
 * @abdd.explain
 * overview: Terminal User Interface用の文字列処理・マークダウン判定ユーティリティ。Layer 0として他libモジュールへの依存を持たない。
 * what_it_does:
 *   - 末尾文字列の追記と最大長制御（appendTail）
 *   - 行配列変換と末尾空行削除・行数制限
 *   - 文字列出現回数カウント（countOccurrences）
 *   - バイト数・改行数に基づく行数推定
 *   - マークダウン構文判定（looksLikeMarkdown）
 * why_it_exists:
 *   - 複数拡張機能での同一処理の重複実装を解消
 *   - TUI表示用の文字列操作ロジックを一元管理
 * scope:
 *   in: 文字列処理、マークダウン判定、行数計算
 *   out: 非同期処理、ファイルI/O、外部API呼び出し
 */

/**
 * TUI (Terminal User Interface) utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - agent-teams.ts
 * - subagents.ts
 *
 * Layer 0: No dependencies on other lib modules.
 */

import { Markdown, getMarkdownTheme } from "@mariozechner/pi-tui";

/** Default maximum length for tail content */
export const LIVE_TAIL_LIMIT = 40_000;

/** Minimum width for markdown preview rendering */
export const LIVE_MARKDOWN_PREVIEW_MIN_WIDTH = 24;

 /**
  * 現在の末尾文字列にチャンクを追加し、最大長を制御する
  * @param current - 現在の末尾文字列
  * @param chunk - 追加するチャンク
  * @param maxLength - 結果の最大長（デフォルト: LIVE_TAIL_LIMIT）
  * @returns 新しい末尾文字列
  */
export function appendTail(current: string, chunk: string, maxLength = LIVE_TAIL_LIMIT): string {
  if (!chunk) return current;
  const next = `${current}${chunk}`;
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
}

 /**
  * 末尾の空白除去と行数制限を行う
  * @param tail 処理対象の文字列
  * @param limit 返す最大行数
  * @returns 処理後の行配列
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
  * 文字列内の特定の文字列の出現回数を数える
  * @param input - 検索対象の文字列
  * @param target - 検索する文字列
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
  * バイト数と改行数に基づき行数を推定
  * @param bytes - バイト数
  * @param newlineCount - 改行文字の数
  * @param endsWithNewline - 末尾が改行で終わるか
  * @returns 推定された行数
  */
export function estimateLineCount(bytes: number, newlineCount: number, endsWithNewline: boolean): number {
  if (bytes <= 0) return 0;
  return newlineCount + (endsWithNewline ? 0 : 1);
}

 /**
  * Markdown形式の文字列か判定する
  * @param input - 判定対象の文字列
  * @returns Markdown形式の場合はtrue
  */
export function looksLikeMarkdown(input: string): boolean {
  const text = input.trim();
  if (!text) return false;
  // Headers
  if (/^#{1,6}\s+/m.test(text)) return true;
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
  * マークダウンプレビューの結果を表します
  * @param lines - レンダリング後の行配列
  * @param renderedAsMarkdown - マークダウンとしてレンダリングされたか
  */
export interface MarkdownPreviewResult {
  lines: string[];
  renderedAsMarkdown: boolean;
}

 /**
  * Markdown形式でプレビューを描画する
  * @param text - 描画対象のテキスト
  * @param width - 描画幅
  * @param maxLines - 最大行数
  * @returns 描画結果の行とMarkdown形式かどうか
  */
export function renderPreviewWithMarkdown(
  text: string,
  width: number,
  maxLines: number,
): MarkdownPreviewResult {
  if (!text.trim()) {
    return { lines: [], renderedAsMarkdown: false };
  }

  if (!looksLikeMarkdown(text)) {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }

  try {
    const markdown = new Markdown(text, 0, 0, getMarkdownTheme());
    const rendered = markdown.render(Math.max(LIVE_MARKDOWN_PREVIEW_MIN_WIDTH, width));
    if (rendered.length === 0) {
      return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
    }
    if (rendered.length <= maxLines) {
      return { lines: rendered, renderedAsMarkdown: true };
    }
    return { lines: rendered.slice(rendered.length - maxLines), renderedAsMarkdown: true };
  } catch {
    return { lines: toTailLines(text, maxLines), renderedAsMarkdown: false };
  }
}
