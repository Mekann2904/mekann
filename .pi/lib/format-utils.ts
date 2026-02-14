/**
 * Formatting utilities shared across extensions.
 * Consolidates duplicate implementations from:
 * - loop.ts
 * - rsa.ts
 * - agent-teams.ts
 * - subagents.ts
 *
 * Layer 0: No dependencies on other lib modules.
 */

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "500ms", "1.50s")
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Item with start and finish timestamps for duration calculation.
 */
interface DurationItem {
  startedAtMs?: number;
  finishedAtMs?: number;
}

/**
 * Formats duration from an item with start and optional finish timestamps.
 * If not finished, uses current time.
 * @param item - Object with startedAtMs and optional finishedAtMs
 * @returns Formatted duration string (e.g., "1.5s", "-" if not started)
 */
export function formatDurationMs(item: DurationItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * Formats a byte count to a human-readable string.
 * @param value - Byte count
 * @returns Formatted string (e.g., "512B", "1.5KB", "2.3MB")
 */
export function formatBytes(value: number): string {
  const bytes = Math.max(0, Math.trunc(value));
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Formats a timestamp to clock time (HH:MM:SS).
 * @param value - Timestamp in milliseconds, or undefined
 * @returns Formatted clock time or "-" if no value
 */
export function formatClockTime(value?: number): string {
  if (!value) return "-";
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Normalizes text for single-line display.
 * Collapses whitespace and truncates if necessary.
 * @param input - Input text
 * @param maxLength - Maximum length (default: 160)
 * @returns Normalized single-line text
 */
export function normalizeForSingleLine(input: string, maxLength = 160): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}
