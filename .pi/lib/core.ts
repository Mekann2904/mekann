/**
 * @abdd.meta
 * path: .pi/lib/core.ts
 * role: 依存関係のないレイヤー0ユーティリティのエントリーポイント
 * why: ライブラリの基盤機能を独立して提供し、他モジュールからの再利用を可能にするため
 * related: .pi/lib/error-utils.js, .pi/lib/errors.js, .pi/lib/tui/tui-utils.js, .pi/lib/validation-utils.js
 * public_api: エラー処理関数(toErrorMessage等), 統一エラークラス(PiError等), TUIユーティリティ(appendTail等), 検証・フォーマット・ファイルシステム関連関数
 * invariants: エクスポートされるモジュールは相互または上位レイヤーに依存しない
 * side_effects: なし(純粋な再エクスポート)
 * failure_modes: 子モジュールの読み込み失敗時、または循環依存発生時に初期化エラー
 * @abdd.explain
 * overview: .piライブラリの基盤となる汎用ツール集を集約したファイル
 * what_it_does:
 *   - エラー判定、分類、統一エラークラス定義のエクスポート
 *   - TUI表示、文字数カウント、Markdown判定などの表示関連機能のエクスポート
 *   - 数値の丸め、範囲チェック、型保証などの検証機能のエクスポート
 *   - ディレクトリ作成、時間・バイト単位のフォーマット機能のエクスポート
 * why_it_exists:
 *   - アプリケーション全体で共通して使用する低レベルな操作を一箇所にまとめるため
 *   - 外部ライブラリへの依存なしに利用可能な機能セットを提供するため
 * scope:
 *   in: なし(定義済みモジュールの参照のみ)
 *   out: エラー処理、TUI、バリデーション、ファイルシステム、フォーマット処理を行う関数と型
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
  formatElapsedClock,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "./format-utils.js";
