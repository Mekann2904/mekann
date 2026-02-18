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
 * Uses LRU cache for repeated calls with same input.
 * @param input - Input text
 * @param maxLength - Maximum length (default: 160)
 * @returns Normalized single-line text
 */

// LRUキャッシュ（最大256エントリ）
const normalizeCache = new Map<string, string>();
const NORMALIZE_CACHE_MAX_SIZE = 256;

/**
 * /**
 * * テキストを単一行用に正規化する
 * *
 * * 連続する空白を1つのスペースに置換し、前後の空白を削除します。
 * * 同じ入力に対する繰り返し呼び出しはLRUキャッシュで最適化されます。
 * *
 * * @param input - 正規化する入力テキスト
 * * @param maxLength - 最大文字数（デフォルト: 160）
 * * @returns 正規化された単一行テキスト
 * * @example
 */
export function normalizeForSingleLine(input: string, maxLength = 160): string {
  // キャッシュキーを生成
  const cacheKey = `${maxLength}:${input}`;
  const cached = normalizeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // 正規化処理
  const normalized = input.replace(/\s+/g, " ").trim();
  let result: string;
  if (!normalized) {
    result = "-";
  } else if (normalized.length <= maxLength) {
    result = normalized;
  } else {
    result = `${normalized.slice(0, maxLength)}...`;
  }

  // LRUエビクション
  if (normalizeCache.size >= NORMALIZE_CACHE_MAX_SIZE) {
    // 最初のエントリを削除（Mapは挿入順序を保持）
    const firstKey = normalizeCache.keys().next().value;
    if (firstKey !== undefined) {
      normalizeCache.delete(firstKey);
    }
  }
  normalizeCache.set(cacheKey, result);
  return result;
}
