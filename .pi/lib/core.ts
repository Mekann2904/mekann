/**
 * @abdd.meta
 * path: .pi/lib/core.ts
 * role: Layer 0基盤ユーティリティの統合エクスポートポイント
 * why: 下位レイヤーへの依存を持たない純粋なユーティリティを一箇所から提供し、他モジュールの依存関係を単純化するため
 * related: error-utils.js, errors.js, validation-utils.js, format-utils.js
 * public_api: toErrorMessage, extractStatusCodeFromMessage, classifyPressureError, isCancelledErrorMessage, isTimeoutErrorMessage, PiError, RuntimeLimitError, RuntimeQueueWaitError, SchemaValidationError, ValidationError, TimeoutError, CancelledError, RateLimitError, CapacityError, ParsingError, ExecutionError, ConfigurationError, StorageError, isPiError, hasErrorCode, isRetryableError, toPiError, getErrorCode, isRetryableErrorCode, appendTail, toTailLines, countOccurrences, estimateLineCount, looksLikeMarkdown, renderPreviewWithMarkdown, toFiniteNumber, toFiniteNumberWithDefault, toBoundedInteger, clampInteger, clampFloat, ensureDir, formatDuration, formatDurationMs, formatBytes, formatClockTime, normalizeForSingleLine
 * invariants: 再エクスポートするすべての関数・クラスは他レイヤーに依存しない(Layer 0)
 * side_effects: ensureDir呼び出し時にディレクトリ作成のファイルシステム副作用が発生する
 * failure_modes: なし(エクスポートのみのモジュールのため実行時エラーは発生しない)
 * @abdd.explain
 * overview: 依存関係を持たないLayer 0ユーティリティ群をカテゴリ別に集約したエクスポート専用モジュール
 * what_it_does:
 *   - エラーハンドリングユーティリティ(toErrorMessage等)の再エクスポート
 *   - 統一エラークラス(PiError等13種)と型定義の再エクスポート
 *   - TUIユーティリティ(appendTail等)の再エクスポート
 *   - 数値検証ユーティリティ(toFiniteNumber等)の再エクスポート
 *   - ファイルシステム・フォーマットユーティリティの再エクスポート
 * why_it_exists:
 *   - Layer 0ユーティリティへの単一のインポートパスを提供する
 *   - モジュール間の依存関係を明確化し循環依存を防止する
 * scope:
 *   in: ./lib/error-utils.js, ./lib/errors.js, ./lib/tui/tui-utils.js, ./lib/validation-utils.js, ./lib/fs-utils.js, ./lib/format-utils.js
 *   out: なし(他モジュールへの依存なし)
 */

/**
 * Core utilities.
 *
 * Layer 0 utilities that have no dependencies on other layers.
 * These are the foundation of the library and can be used independently.
 *
 * Usage:
 *   import { ... } from "./lib/core.js";
 */

// Error handling utilities (Layer 0)
export {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  type PressureErrorType,
} from "./error-utils.js";

// Unified error classes (Layer 0)
export {
  PiError,
  RuntimeLimitError,
  RuntimeQueueWaitError,
  SchemaValidationError,
  ValidationError,
  TimeoutError,
  CancelledError,
  RateLimitError,
  CapacityError,
  ParsingError,
  ExecutionError,
  ConfigurationError,
  StorageError,
  isPiError,
  hasErrorCode,
  isRetryableError,
  toPiError,
  getErrorCode,
  isRetryableErrorCode,
  type PiErrorCode,
  type ErrorSeverity,
  type ErrorContext,
} from "./errors.js";

// TUI utilities (Layer 0)
export {
  appendTail,
  toTailLines,
  countOccurrences,
  estimateLineCount,
  looksLikeMarkdown,
  renderPreviewWithMarkdown,
  LIVE_TAIL_LIMIT,
  LIVE_MARKDOWN_PREVIEW_MIN_WIDTH,
  type MarkdownPreviewResult,
} from "./tui/tui-utils.js";

// Validation utilities (Layer 0)
export {
  toFiniteNumber,
  toFiniteNumberWithDefault,
  toBoundedInteger,
  clampInteger,
  clampFloat,
  type BoundedIntegerResult,
} from "./validation-utils.js";

// File system utilities (Layer 0)
export { ensureDir } from "./fs-utils.js";

// Formatting utilities (Layer 0)
export {
  formatDuration,
  formatDurationMs,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "./format-utils.js";
