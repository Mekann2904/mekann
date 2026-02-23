/**
 * @abdd.meta
 * path: .pi/lib/text-utils.ts
 * role: 拡張機能間で共通利用されるテキスト処理ユーティリティ
 * why: 重複する実装を一箇所に集約し、コードの重複を排除するため
 * related: .pi/lib/loop.ts, .pi/lib/search/utils/output.ts, .pi/lib/code-structure-analyzer/tools/generate-diagrams.ts
 * public_api: truncateText, truncateTextWithMarker, toPreview, normalizeOptionalText, throwIfAborted
 * invariants: truncateTextはmaxLengthが3以下の場合、"..."を付けずに指定長で切り詰める
 * side_effects: なし（純粋関数）
 * failure_modes: maxLengthに負数が渡された場合の挙動は型定義上制約されない
 * @abdd.explain
 * overview: 文字列の切り詰め、正規化、AbortSignalのチェックを行う純粋関数群。
 * what_it_does:
 *   - 文字列を指定長に切り詰める（truncateText, truncateTextWithMarker, toPreview）
 *   - optionalな文字列をトリムしてundefinedに変換する（normalizeOptionalText）
 *   - AbortSignalの中断状態を確認し例外を投げる（throwIfAborted）
 * why_it_exists:
 *   - loop.tsやsearch/utils/output.tsなどに散在していた重複コードを削除するため
 * scope:
 *   in: string, number, AbortSignal
 *   out: string, string | undefined, void
 */

/**
 * Text utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - loop.ts
 * - loop/iteration-builder.ts
 * - loop/verification.ts
 * - loop/reference-loader.ts
 * - search/utils/output.ts
 * - code-structure-analyzer/tools/generate-diagrams.ts
 */

// ============================================================================
// Truncation Functions
// ============================================================================

/**
 * テキストを指定文字数に正確に収める
 * @summary テキストを切り詰める
 * @param text 対象のテキスト
 * @param maxLength 最大長（"..."を含む）
 * @returns 切り詰められたテキスト
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * テキストを切り捨てマーカー付きで切り詰める
 * @summary 切り捨てマーカー付きで切り詰める
 * @param value 対象のテキスト
 * @param maxChars 最大文字数（マーカーは含まない）
 * @returns 切り詰められたテキスト（切り捨て時は "\n...[truncated]" 付き）
 */
export function truncateTextWithMarker(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

/**
 * テキストをプレビュー形式に変換する
 * @summary プレビュー形式に変換
 * @param value 対象のテキスト
 * @param maxChars 最大文字数
 * @returns プレビュー用テキスト
 */
export function toPreview(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * optionalなテキストを正規化する
 * @summary optionalテキストを正規化
 * @param value 正規化対象の値
 * @returns トリム済みの文字列、または空の場合は undefined
 */
export function normalizeOptionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

// ============================================================================
// Abort Utilities
// ============================================================================

/**
 * AbortSignalの中断状態をチェックする
 * @summary 中断状態をチェック
 * @param signal チェック対象のAbortSignal
 * @param message 例外メッセージ（省略時は "aborted"）
 * @throws {Error} signalがabortedの場合
 */
export function throwIfAborted(signal: AbortSignal | undefined, message = "aborted"): void {
  if (signal?.aborted) {
    throw new Error(message);
  }
}
