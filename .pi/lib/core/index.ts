/**
 * @abdd.meta
 * path: .pi/lib/core/index.ts
 * role: レイヤー0ユーティリティの集約モジュール
 * why: 外部依存を持たない基盤機能を単一のエントリーポイントで提供するため
 * related: ./errors.ts, ./error-utils.ts, ./retry-with-backoff.ts
 * public_api: toErrorMessage, PiError, isRetryableError, appendTail, toFiniteNumber, ensureDir, formatDuration
 * invariants: エクスポートされる関数・クラスは外部依存を持たない
 * side_effects: なし（純粋な関数エクスポート）
 * failure_modes: モジュールインポート時の依存ファイル不存在エラー
 * @abdd.explain
 * overview: 外部レイヤーへの依存がゼロの基盤ユーティリティを再エクスポートするモジュール。
 * what_it_does:
 *   - エラー処理、分類、検証ユーティリティを提供する
 *   - リトライ判断ロジックを提供する
 *   - 統一エラークラス群を提供する
 *   - TUI表示、ファイルシステム操作、数値検証、フォーマット処理を提供する
 * why_it_exists:
 *   - ライブラリの基盤機能を依存関係なく独立して利用可能にするため
 *   - 利用者に対して簡潔なインポートパスを提供するため
 * scope:
 *   in: なし（各ユーティリティモジュールからのエクスポート定義）
 *   out: エラー処理、リトライ、バリデーション、TUI、FS、フォーマット機能
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
  isPiErrorRetryable,
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
} from "../tui/tui-utils.js";

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
  formatElapsedClock,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "./format-utils.js";

// Re-export from Layer 1 for backward compatibility
export { isRetryableError } from "../retry-with-backoff.js";
