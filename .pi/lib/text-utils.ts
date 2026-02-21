/**
 * @abdd.meta
 * path: .pi/lib/text-utils.ts
 * role: 文字列処理ユーティリティ関数を集約する共通モジュール
 * why: 複数モジュールで重複していた文字列処理関数を一元管理し、保守性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/loop/iteration-builder.ts, .pi/extensions/loop/verification.ts, .pi/extensions/loop/reference-loader.ts, .pi/extensions/search/utils/output.ts
 * public_api: truncateText, truncateTextWithMarker, toPreview, normalizeOptionalText, throwIfAborted
 * invariants: すべての関数は純粋関数（throwIfAbortedを除く）
 * side_effects: throwIfAbortedのみ例外を投げる可能性あり
 * failure_modes: maxCharsが負の値の場合の挙動は未定義
 * @abdd.explain
 * overview: テキストの切り詰め、プレビュー生成、正規化、中断チェックを行うユーティリティ関数群
 * what_it_does: 各関数は単一責任で、副作用を持たない（throwIfAbortedを除く）
 * why_it_exists: 複数モジュールでの重複解消と、一貫したテキスト処理の提供
 * scope:
 *   in: 文字列、文字数制限、AbortSignal
 *   out: 加工された文字列、または例外
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
