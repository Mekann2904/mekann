/**
 * Shared library index.
 * Re-exports all common utilities for convenient importing.
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
} from "./tui-utils.js";

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

// Agent types (Layer 1)
export {
  type ThinkingLevel,
  type RunOutcomeCode,
  type RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "./agent-types.js";

// Agent utilities (Layer 1)
export { createRunId, computeLiveWindow } from "./agent-utils.js";
