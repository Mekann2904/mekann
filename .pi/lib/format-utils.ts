/**
 * @abdd.meta
 * path: .pi/lib/format-utils.ts
 * role: 数値・日時・文字列のフォーマット処理を行うユーティリティモジュール
 * why: 拡張機能間で重複していたフォーマット実装を統一し、コードの重複を排除するため
 * related: loop.ts, rsa.ts, agent-teams.ts, subagents.ts
 * public_api: formatDuration, formatDurationMs, formatElapsedClock, formatBytes, formatClockTime, normalizeForSingleLine
 * invariants: 依存関係レイヤー0（他のlibモジュールへの依存なし）、バイト数や時間は負の値を0として扱う
 * side_effects: normalizeForSingleLineの呼び出し時に内部Mapキャッシュ（LRU）の状態が変更される
 * failure_modes: 無限大や非数を渡した場合のフォーマット結果、normalizeForSingleLineで巨大な文字列を扱った場合のメモリ消費
 * @abdd.explain
 * overview: 時間、容量、時刻、文字列のデータ表示用文字列への変換を行う静的関数群を提供する
 * what_it_does:
 *   - ミリ秒を "500ms" や "1.50s" 形式に変換する
 *   - 開始・終了時刻から経過時間を "1.5s" 形式で算出する
 *   - バイト数を "512B", "1.5KB" などの人間が読みやすい単位に変換する
 *   - タイムスタンプを "HH:mm:ss" 形式の時刻文字列に変換する
 *   - 文字列の空白を圧縮し、指定長で切り詰めて単一行化する（LRUキャッシュを使用）
 * why_it_exists:
 *   - loop.ts, rsa.ts, agent-teams.ts, subagents.ts に散在していた重複コードを一箇所に集約する
 *   - フォーマットロジックの修正や調整を一箇所で完結させるため
 * scope:
 *   in: 数値（時間/バイト）、タイムスタンプ、任意の文字列、オプションの最大長
 *   out: 画面表示用に整形された文字列
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
 * ミリ秒を時間文字列へ
 * @summary ミリ秒変換
 * @param ms ミリ秒
 * @returns フォーマット済み文字列
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
 * 継続時間をフォーマット
 * @summary 継続時間計算
 * @param item 期間アイテム
 * @returns フォーマット済み文字列（秒数に応じて自動切り替え）
 */
export function formatDurationMs(item: DurationItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * 継続時間を HH:mm:ss 形式でフォーマット
 * @summary 継続時間を時分秒へ変換
 * @param item 期間アイテム
 * @returns HH:mm:ss 形式の文字列
 */
export function formatElapsedClock(item: DurationItem): string {
  if (!item.startedAtMs) return "-";
  const endMs = item.finishedAtMs ?? Date.now();
  const durationMs = Math.max(0, endMs - item.startedAtMs);
  const totalSeconds = Math.floor(durationMs / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * バイト数をフォーマット
 * @summary バイト数変換
 * @param value バイト数
 * @returns フォーマット済み文字列
 */
export function formatBytes(value: number): string {
  const bytes = Math.max(0, Math.trunc(value));
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * 時刻をフォーマット
 * @summary 時刻フォーマット
 * @param value 数値（省略可）
 * @returns フォーマット済み文字列
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
 * 単一行文字列を正規化
 * @summary 文字列正規化
 * @param input 入力文字列
 * @param maxLength 最大長
 * @returns 正規化された文字列
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
    result = `${normalized.slice(0, maxLength - 3)}...`;
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
