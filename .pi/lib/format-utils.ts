/**
 * @abdd.meta
 * path: .pi/lib/format-utils.ts
 * role: フォーマット変換ユーティリティライブラリ
 * why: loop.ts, rsa.ts, agent-teams.ts, subagents.tsで重複していた実装を統合するため
 * related: loop.ts, rsa.ts, agent-teams.ts, subagents.ts
 * public_api: formatDuration, formatDurationMs, formatBytes, formatClockTime, normalizeForSingleLine
 * invariants:
 *   - 非有限数・負数の入力に対しては安全なデフォルト値を返す
 *   - normalizeForSingleLineのキャッシュは最大256エントリ
 * side_effects: normalizeForSingleLine呼び出し時にモジュールレベルのLRUキャッシュ(Map)を更新・読み込み
 * failure_modes:
 *   - 非有限数(infinity, NaN)や負数を渡した場合、"0ms"や"0B"等のデフォルト値を返す
 *   - 未定義値やnullを渡した場合、"-"を返す
 * @abdd.explain
 * overview: 時間・バイト・テキストの表示用フォーマット変換関数を提供するレイヤー0のユーティリティモジュール
 * what_it_does:
 *   - ミリ秒を"500ms", "1.50s"等の可読文字列に変換
 *   - バイト数を"B", "KB", "MB"単位の人間可読形式に変換
 *   - タイムスタンプを"HH:MM:SS"形式の時刻文字列に変換
 *   - テキストを単一行表示用に正規化(空白圧縮・切り詰め)、LRUキャッシュで高速化
 * why_it_exists:
 *   - 複数の拡張機能で重複していたフォーマット処理を一箇所に集約
 *   - 一貫した表示フォーマットを提供
 * scope:
 *   in: 数値(ミリ秒・バイト・タイムスタンプ)、文字列、DurationItemオブジェクト
 *   out: フォーマット済み文字列
 */

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
  * ミリ秒を読みやすい文字列に変換
  * @param ms - ミリ秒単位の時間
  * @returns フォーマットされた時間文字列（例: "500ms", "1.50s"）
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
  * ミリ秒単位の持続時間を文字列化
  * @param item - startedAtMsとオプションのfinishedAtMsを持つオブジェクト
  * @returns フォーマットされた持続時間文字列（例: "1.5s"、未開始なら"-"）
  */
export function formatDurationMs(item: DurationItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}

 /**
  * バイト数を人間が読める形式に変換
  * @param value - バイト数
  * @returns フォーマットされた文字列（例: "512B", "1.5KB", "2.3MB"）
  */
export function formatBytes(value: number): string {
  const bytes = Math.max(0, Math.trunc(value));
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

 /**
  * タイムスタンプを時刻に変換
  * @param value - ミリ秒単位のタイムスタンプ、未指定可
  * @returns フォーマットされた時刻、値がない場合は"-"
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
  * テキストを単一行用に正規化する
  * @param input - 正規化する入力テキスト
  * @param maxLength - 最大文字数（デフォルト: 160）
  * @returns 正規化された単一行テキスト
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
