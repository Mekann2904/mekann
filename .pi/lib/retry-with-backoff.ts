/**
 * @abdd.meta
 * path: .pi/lib/retry-with-backoff.ts
 * role: 一時的なLLMエラーに対処するための、指数バックオフとジッターを含むリトライロジックの共通実装
 * why: 429/5xxエラーからの回復ポリシーを単一の場所に集約し、サブエージェントとエージェントチームで再利用するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/config.json
 * public_api: RetryJitterMode, RetryWithBackoffConfig, RetryWithBackoffOverrides, RetryAttemptContext, RateLimitGateSnapshot, RateLimitWaitContext
 * invariants: リトライ遅延はinitialDelayMs以上maxDelayMs以下である。待機時間の計算にはnow()関数の結果を使用する。
 * side_effects: ファイルシステム（readFileSync, writeFileSync, mkdirSync）へのアクセスとファイルロックを行う。レートリimit状態を永続化する。
 * failure_modes: 設定値が不正な場合の挙動未定義、ファイルシステムへのアクセス権限がない場合のエラー、AbortSignalによる操作の中断。
 * @abdd.explain
 * overview: LLM API等における一時的な障害やレート制限（429/5xx）に対し、指数バックオフおよびジッター機能を提供し、安定的な通信を実現するモジュール。リトライ設定のオーバーライドや、共有状態に基づくレートリimit制御も行う。
 * what_it_does:
 *   - 指数バックオフアルゴリズムによる待機時間の計算とジッター（full/partial/none）の適用
 *   - ファイルロックを用いたレートリimit状態の永続化と共有
 *   - AbortSignalによるリトライ処理のキャンセル対応
 *   - リトライ判定ロジック（shouldRetry）とコールバック（onRetry, onRateLimitWait）の実行
 * why_it_exists:
 *   - 外部API呼び出しにおいて、ネットワークの一時的な障害や制限を透過的にハンドリングするため
 *   - サブエージェントやエージェントチーム間でリトライ戦略の一貫性を保つため
 *   - 分散環境でのレートリimit回避のためにプロセス間で状態を共有するため
 * scope:
 *   in: RetryWithBackoffOptions, RetryWithBackoffConfig, レートリimit状態ファイル, AbortSignal
 *   out: リトライ回数, 待機時間, エラー内容, 更新されたレートリimit状態
 */

// File: .pi/lib/retry-with-backoff.ts
// Description: Shared retry helpers with exponential backoff and jitter for transient LLM failures.
// Why: Keeps 429/5xx recovery policy in one place for subagents and agent teams.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/config.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { recordTotalLimitObservation } from "./adaptive-total-limit.js";
import { withFileLock } from "./storage-lock.js";

/**
 * リトライ時のジッターモード
 * @summary ジッターモード
 * @typedef {"full" | "partial" | "none"} RetryJitterMode
 */
export type RetryJitterMode = "full" | "partial" | "none";

/**
 * リトライ設定を定義
 * @summary リトライ設定
 * @interface RetryWithBackoffConfig
 */
export interface RetryWithBackoffConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: RetryJitterMode;
}

/**
 * @summary 設定オーバーライド
 * @param maxRetries 最大リトライ数
 * @param initialDelayMs 初期遅延時間
 * @param maxDelayMs 最大遅延時間
 * @param multiplier 乗数
 * @param jitter ジッターモード
 */
export type RetryWithBackoffOverrides = Partial<RetryWithBackoffConfig>;

/**
 * @summary リトライコンテキスト
 * @param attempt 試行回数
 * @param maxRetries 最大リトライ数
 * @param delayMs 遅延時間
 * @param statusCode ステータスコード
 * @param error エラー内容
 */
export interface RetryAttemptContext {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  statusCode?: number;
  error: unknown;
}

interface RetryWithBackoffOptions {
  cwd?: string;
  overrides?: RetryWithBackoffOverrides;
  signal?: AbortSignal;
  now?: () => number;
  rateLimitKey?: string;
  maxRateLimitRetries?: number;
  maxRateLimitWaitMs?: number;
  onRateLimitWait?: (context: RateLimitWaitContext) => void;
  onRetry?: (context: RetryAttemptContext) => void;
  shouldRetry?: (error: unknown, statusCode?: number) => boolean;
}

interface SharedRateLimitStateEntry {
  untilMs: number;
  hits: number;
  updatedAtMs: number;
}

interface SharedRateLimitState {
  entries: Map<string, SharedRateLimitStateEntry>;
}

/**
 * @summary ゲートスナップショット
 * @param key 対象のキー
 * @param waitMs 待機時間
 * @param hits ヒット数
 * @param untilMs 有効期限
 */
export interface RateLimitGateSnapshot {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
}

/**
 * @summary 待機コンテキスト
 * @param key 対象のキー
 * @param waitMs 待機時間
 * @param hits ヒット数
 * @param untilMs 有効期限
 */
export interface RateLimitWaitContext {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
}

interface RetryTimeOptions {
  now?: () => number;
}

const DEFAULT_RETRY_WITH_BACKOFF_CONFIG: RetryWithBackoffConfig = {
  maxRetries: 0,
  initialDelayMs: 800,
  maxDelayMs: 4_000,
  multiplier: 2,
  jitter: "none",
};
const STABLE_RETRY_PROFILE = true;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 0;
const DEFAULT_RATE_LIMIT_GATE_BASE_DELAY_MS = 800;  // 2秒→800msに短縮（ULモード高速化）
const MAX_RATE_LIMIT_GATE_DELAY_MS = 120_000;
const RATE_LIMIT_GATE_TTL_MS = 10 * 60 * 1000;
const MAX_RATE_LIMIT_ENTRIES = 64; // Prevent unbounded memory growth
const GLOBAL_RATE_LIMIT_GATE_KEY = "__global_rate_limit__";
const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const RATE_LIMIT_STATE_FILE = join(RUNTIME_DIR, "retry-rate-limit-state.json");
const RATE_LIMIT_STATE_LOCK_OPTIONS = {
  maxWaitMs: 2_000,
  pollMs: 25,
  staleMs: 15_000,
};
const sharedRateLimitState: SharedRateLimitState = {
  entries: new Map<string, SharedRateLimitStateEntry>(),
};

// 操作中フラグ: 同一プロセス内での並列アクセスを防止
let inMemoryRateLimitOperationInProgress = false;

/**
 * 状態をクリアする
 * @summary 状態を初期化
 * @returns {void}
 */
export function clearRateLimitState(): void {
  sharedRateLimitState.entries.clear();
  persistedStateLoaded = false;
  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
    writeDebounceTimer = null;
  }
}

// 最適化: ファイルからの読み込みを一度だけ行う（遅延初期化）
let persistedStateLoaded = false;

// 最適化: 書き込みをdebounce（最後の書き込みから500ms後に実行）
let writeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const WRITE_DEBOUNCE_MS = 500;

function scheduleWritePersistedState(): void {
  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
  }
  writeDebounceTimer = setTimeout(() => {
    writeDebounceTimer = null;
    writePersistedRateLimitState(sharedRateLimitState);
  }, WRITE_DEBOUNCE_MS);
  // プロセス終了時にブロックしないようにunref
  writeDebounceTimer.unref();
}

// プロセス終了時に確実に書き込む（重複登録を防ぐ）
let beforeExitHandlerRegistered = false;
if (!beforeExitHandlerRegistered) {
  beforeExitHandlerRegistered = true;
  process.on("beforeExit", () => {
    if (writeDebounceTimer) {
      clearTimeout(writeDebounceTimer);
      writeDebounceTimer = null;
      writePersistedRateLimitState(sharedRateLimitState);
    }
  });
}

type PersistedRateLimitState = {
  version: number;
  updatedAt: string;
  entries: Record<string, SharedRateLimitStateEntry>;
};

function toFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeJitter(value: unknown): RetryJitterMode | undefined {
  const jitter = String(value || "").trim().toLowerCase();
  if (jitter === "full" || jitter === "partial" || jitter === "none") {
    return jitter;
  }
  return undefined;
}

function sanitizeOverrides(overrides: RetryWithBackoffOverrides | undefined): RetryWithBackoffOverrides {
  const safe: RetryWithBackoffOverrides = {};
  if (!overrides || typeof overrides !== "object") {
    return safe;
  }

  const maxRetries = toFiniteNumber(overrides.maxRetries);
  if (maxRetries !== undefined) {
    safe.maxRetries = clampInteger(maxRetries, 0, 20);
  }

  const initialDelayMs = toFiniteNumber(overrides.initialDelayMs);
  if (initialDelayMs !== undefined) {
    safe.initialDelayMs = clampInteger(initialDelayMs, 1, 600_000);
  }

  const maxDelayMs = toFiniteNumber(overrides.maxDelayMs);
  if (maxDelayMs !== undefined) {
    safe.maxDelayMs = clampInteger(maxDelayMs, 1, 600_000);
  }

  const multiplier = toFiniteNumber(overrides.multiplier);
  if (multiplier !== undefined) {
    safe.multiplier = clampFloat(multiplier, 1, 10);
  }

  const jitter = normalizeJitter(overrides.jitter);
  if (jitter) {
    safe.jitter = jitter;
  }

  return safe;
}

function readConfigOverrides(cwd: string | undefined): RetryWithBackoffOverrides {
  if (!cwd) return {};

  const configFile = join(cwd, ".pi", "config.json");
  if (!existsSync(configFile)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configFile, "utf-8")) as Record<string, unknown>;
    const retryNode = parsed?.retryWithBackoff ?? parsed?.retry;
    if (!retryNode || typeof retryNode !== "object") {
      return {};
    }
    return sanitizeOverrides(retryNode as RetryWithBackoffOverrides);
  } catch (error) {
    // Bug #8 fix: 設定ファイル読み込みエラーをログに記録
    // 非クリティカルなエラーのためdebugレベル
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.debug(`[retry-with-backoff] Config file read failed (non-critical): ${configFile} - ${errorMessage}`);
    return {};
  }
}

function normalizeRateLimitKey(input: string | undefined): string {
  const key = String(input || "global")
    .trim()
    .toLowerCase();
  return key.length > 0 ? key : "global";
}

function createRateLimitKeyScope(rateLimitKey: string | undefined): string[] {
  if (!rateLimitKey) return [];
  const keys = new Set<string>();
  keys.add(GLOBAL_RATE_LIMIT_GATE_KEY);
  keys.add(normalizeRateLimitKey(rateLimitKey));
  return Array.from(keys);
}

function selectLongestRateLimitGate(gates: RateLimitGateSnapshot[], nowMs: number): RateLimitGateSnapshot {
  if (gates.length === 0) {
    return {
      key: GLOBAL_RATE_LIMIT_GATE_KEY,
      waitMs: 0,
      hits: 0,
      untilMs: nowMs,
    };
  }

  let selected = gates[0];
  for (const gate of gates) {
    if (gate.waitMs > selected.waitMs) {
      selected = gate;
      continue;
    }
    if (gate.waitMs === selected.waitMs && gate.hits > selected.hits) {
      selected = gate;
    }
  }
  return selected;
}

function getSharedRateLimitState(): SharedRateLimitState {
  return sharedRateLimitState;
}

function ensureRuntimeDir(): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function readPersistedRateLimitState(nowMs: number): Map<string, SharedRateLimitStateEntry> {
  try {
    if (!existsSync(RATE_LIMIT_STATE_FILE)) {
      return new Map();
    }
    const parsed = JSON.parse(readFileSync(RATE_LIMIT_STATE_FILE, "utf-8")) as Partial<PersistedRateLimitState>;
    if (!parsed || typeof parsed !== "object" || !parsed.entries || typeof parsed.entries !== "object") {
      return new Map();
    }
    const entries = new Map<string, SharedRateLimitStateEntry>();
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (!value || typeof value !== "object") continue;
      const untilMs = Math.trunc(Number(value.untilMs));
      const hits = Math.trunc(Number(value.hits));
      const updatedAtMs = Math.trunc(Number(value.updatedAtMs));
      if (!Number.isFinite(untilMs) || !Number.isFinite(hits) || !Number.isFinite(updatedAtMs)) continue;
      entries.set(key, {
        untilMs: Math.max(0, untilMs),
        hits: clampInteger(hits, 0, 8),
        updatedAtMs: Math.max(0, updatedAtMs),
      });
    }
    const persistedState: SharedRateLimitState = { entries };
    pruneRateLimitState(nowMs, persistedState);
    return persistedState.entries;
  } catch (error) {
    // Bug #8 fix: 永続化状態読み込みエラーをログに記録
    // ファイルが存在しない、または破損している場合は空のMapを返す
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.debug(`[retry-with-backoff] Rate limit state read failed (will reinitialize): ${errorMessage}`);
    return new Map();
  }
}

function writePersistedRateLimitState(state: SharedRateLimitState): void {
  try {
    ensureRuntimeDir();
    const payload: PersistedRateLimitState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(state.entries.entries()),
    };
    writeFileSync(RATE_LIMIT_STATE_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    // Bug #8 fix: 永続化書き込みエラーをログに記録
    // Best effort only - 書き込み失敗してもメモリ状態は保持される
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[retry-with-backoff] Rate limit state write failed (non-critical): ${errorMessage}`);
  }
}

function mergeEntriesInPlace(
  target: Map<string, SharedRateLimitStateEntry>,
  incoming: Map<string, SharedRateLimitStateEntry>,
): void {
  for (const [key, entry] of incoming.entries()) {
    const current = target.get(key);
    if (!current) {
      target.set(key, { ...entry });
      continue;
    }
    target.set(key, {
      untilMs: Math.max(current.untilMs, entry.untilMs),
      hits: Math.max(current.hits, entry.hits),
      updatedAtMs: Math.max(current.updatedAtMs, entry.updatedAtMs),
    });
  }
}

function withSharedRateLimitState<T>(nowMs: number, mutator: () => T): T {
  // 同一プロセス内での並列アクセスを防止するフォールバック
  const fallback = () => {
    const localState = getSharedRateLimitState();
    pruneRateLimitState(nowMs, localState);
    const result = mutator();
    // 最適化: debounce書き込み
    scheduleWritePersistedState();
    return result;
  };

  // 既に操作中の場合は、フォールバックを実行して競合を回避
  if (inMemoryRateLimitOperationInProgress) {
    return fallback();
  }

  inMemoryRateLimitOperationInProgress = true;
  try {
    ensureRuntimeDir();
    
    // 最適化: ファイルからの読み込みは一度だけ
    if (!persistedStateLoaded) {
      const state = getSharedRateLimitState();
      const persisted = readPersistedRateLimitState(nowMs);
      mergeEntriesInPlace(state.entries, persisted);
      pruneRateLimitState(nowMs, state);
      persistedStateLoaded = true;
    }
    
    // メモリ上の状態で操作
    const state = getSharedRateLimitState();
    pruneRateLimitState(nowMs, state);
    const result = mutator();
    // 最適化: debounce書き込み
    scheduleWritePersistedState();
    return result;
  } catch {
    return fallback();
  } finally {
    inMemoryRateLimitOperationInProgress = false;
  }
}

function pruneRateLimitState(nowMs: number, state: SharedRateLimitState = getSharedRateLimitState()): void {

  // First pass: remove expired entries based on TTL
  for (const [key, entry] of state.entries.entries()) {
    if (nowMs - entry.updatedAtMs > RATE_LIMIT_GATE_TTL_MS && entry.untilMs <= nowMs) {
      state.entries.delete(key);
    }
  }

  // Second pass: enforce max entries limit to prevent unbounded memory growth
  // Remove oldest entries (by updatedAtMs) when over limit
  if (state.entries.size > MAX_RATE_LIMIT_ENTRIES) {
    enforceRateLimitEntryCap(state);
  }
}

function enforceRateLimitEntryCap(state: SharedRateLimitState): void {
  if (state.entries.size <= MAX_RATE_LIMIT_ENTRIES) {
    return;
  }
  const entries = Array.from(state.entries.entries())
    .sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
  const overflow = state.entries.size - MAX_RATE_LIMIT_ENTRIES;
  const deletedKeys: string[] = [];
  for (let index = 0; index < overflow; index += 1) {
    const candidate = entries[index];
    if (!candidate) break;
    state.entries.delete(candidate[0]);
    deletedKeys.push(candidate[0]);
  }
  if (deletedKeys.length > 0) {
    console.warn(
      `[retry-with-backoff] Rate limit entry cap (${MAX_RATE_LIMIT_ENTRIES}) exceeded. ` +
        `Removed ${deletedKeys.length} oldest entries: ${deletedKeys.join(", ")}`
    );
  }
}

/**
 * @summary スナップショット取得
 * @param key 対象のキー
 * @returns 現在のレートリミット状態
 */
export function getRateLimitGateSnapshot(
  key: string | undefined,
  timeOptions: RetryTimeOptions = {},
): RateLimitGateSnapshot {
  const normalizedKey = normalizeRateLimitKey(key);
  const now = timeOptions.now ?? Date.now;
  const nowMs = now();
  return withSharedRateLimitState(nowMs, () => {
    const entry = getSharedRateLimitState().entries.get(normalizedKey);
    if (!entry) {
      return {
        key: normalizedKey,
        waitMs: 0,
        hits: 0,
        untilMs: nowMs,
      };
    }
    return {
      key: normalizedKey,
      waitMs: Math.max(0, entry.untilMs - nowMs),
      hits: entry.hits,
      untilMs: entry.untilMs,
    };
  });
}

function registerRateLimitGateHit(
  key: string | undefined,
  retryDelayMs: number,
  now: () => number,
): RateLimitGateSnapshot {
  const normalizedKey = normalizeRateLimitKey(key);
  const nowMs = now();

  // Bug #1 Warning: High rate limit entry count indicates potential race condition risk
  const entries = sharedRateLimitState.entries;
  if (entries.size > 10) {
    console.warn(
      "[retry-with-backoff] High rate limit entry count detected:",
      entries.size,
      "- Risk of Bug #1 (race condition) increased"
    );
  }

  return withSharedRateLimitState(nowMs, () => {
    const state = getSharedRateLimitState();
    const previous = state.entries.get(normalizedKey);
    const nextHits = Math.min(8, (previous?.hits ?? 0) + 1);
    const baseDelayMs = Math.max(
      DEFAULT_RATE_LIMIT_GATE_BASE_DELAY_MS,
      Math.trunc(retryDelayMs || DEFAULT_RATE_LIMIT_GATE_BASE_DELAY_MS),
    );
    const adaptiveDelayMs = Math.min(
      MAX_RATE_LIMIT_GATE_DELAY_MS,
      baseDelayMs * 2 ** Math.max(0, nextHits - 1),
    );
    const nextUntilMs = Math.max(previous?.untilMs ?? nowMs, nowMs + adaptiveDelayMs);

    state.entries.set(normalizedKey, {
      untilMs: nextUntilMs,
      hits: nextHits,
      updatedAtMs: nowMs,
    });
    enforceRateLimitEntryCap(state);

    return {
      key: normalizedKey,
      waitMs: Math.max(0, nextUntilMs - nowMs),
      hits: nextHits,
      untilMs: nextUntilMs,
    };
  });
}

function registerRateLimitGateSuccess(key: string | undefined, now: () => number): void {
  const normalizedKey = normalizeRateLimitKey(key);
  const nowMs = now();
  withSharedRateLimitState(nowMs, () => {
    const state = getSharedRateLimitState();
    const current = state.entries.get(normalizedKey);
    if (!current) return;

    const nextHits = Math.max(0, current.hits - 1);
    if (nextHits === 0) {
      state.entries.delete(normalizedKey);
      return;
    }

    const nextUntilMs = Math.max(
      nowMs,
      Math.min(current.untilMs, nowMs + DEFAULT_RATE_LIMIT_GATE_BASE_DELAY_MS),
    );
    state.entries.set(normalizedKey, {
      untilMs: nextUntilMs,
      hits: nextHits,
      updatedAtMs: nowMs,
    });
  });
}

/**
 * 再試行設定の解決とマージ
 * @summary 設定解決
 * @param cwd - カレントディレクトリ
 * @param overrides - 上書き設定
 * @returns マージされた設定
 */
export function resolveRetryWithBackoffConfig(
  cwd?: string,
  overrides?: RetryWithBackoffOverrides,
): RetryWithBackoffConfig {
  // Stable profile: keep retry behavior deterministic across the system.
  // Allow overrides even with STABLE_RETRY_PROFILE for explicit caller control.
  if (STABLE_RETRY_PROFILE && !overrides) {
    return { ...DEFAULT_RETRY_WITH_BACKOFF_CONFIG };
  }

  const fileOverrides = readConfigOverrides(cwd);
  const safeOverrides = sanitizeOverrides(overrides);
  const merged: RetryWithBackoffConfig = {
    ...DEFAULT_RETRY_WITH_BACKOFF_CONFIG,
    ...fileOverrides,
    ...safeOverrides,
  };

  if (merged.maxDelayMs < merged.initialDelayMs) {
    merged.maxDelayMs = merged.initialDelayMs;
  }

  return merged;
}

/**
 * エラーからステータスコード抽出
 * @summary ステータスコード抽出
 * @param error - 発生したエラー
 * @returns ステータスコード
 */
export function extractRetryStatusCode(error: unknown): number | undefined {
  // null/undefinedの場合は早期リターン
  if (error === null || error === undefined) {
    return undefined;
  }

  // オブジェクト型の場合のみstatus/statusCodeをチェック
  if (typeof error === "object" && !Array.isArray(error)) {
    const errorObj = error as Record<string, unknown>;

    // status プロパティの厳密な型チェック
    if ("status" in errorObj) {
      const status = errorObj.status;
      // number型かつ有限値かつ正の整数のみ受け入れる
      if (typeof status === "number" && Number.isFinite(status) && status >= 0 && Number.isInteger(status)) {
        return clampInteger(status, 0, 999);
      }
    }

    // statusCode プロパティの厳密な型チェック
    if ("statusCode" in errorObj) {
      const statusCode = errorObj.statusCode;
      // number型かつ有限値かつ正の整数のみ受け入れる
      if (typeof statusCode === "number" && Number.isFinite(statusCode) && statusCode >= 0 && Number.isInteger(statusCode)) {
        return clampInteger(statusCode, 0, 999);
      }
    }
  }

  // 安全な文字列変換: {toString: ...}のようなオブジェクトはString()でエラーになる
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "object" && error !== null) {
    try {
      message = JSON.stringify(error);
    } catch {
      message = "[object Object]";
    }
  } else {
    message = String(error || "");
  }

  const codeMatch = message.match(/\b(429|401|403|5\d{2})\b/);
  if (codeMatch) {
    return Number(codeMatch[1]);
  }

  if (/too many requests|rate[\s-]?limit|quota exceeded/i.test(message)) {
    return 429;
  }

  if (/econnreset|etimedout|ehostunreach|enetunreach|enotfound|socket hang up|network error|temporar(y|ily) unavailable/i.test(message)) {
    return 503;
  }

  return undefined;
}

/**
 * ネットワークエラーが再試行可能か判定
 * @summary ネットワークエラー再試行可否判定
 * @param error - 発生したエラー
 * @param statusCode - ステータスコード
 * @returns 再試行可能かどうか
 */
export function isNetworkErrorRetryable(error: unknown, statusCode?: number): boolean {
  const code = statusCode ?? extractRetryStatusCode(error);
  if (code === 429) return true;
  if (code !== undefined && code >= 500 && code <= 599) return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /econnreset|etimedout|ehostunreach|enetunreach|enotfound|socket hang up|network error/i.test(message);
}

export const isRetryableError = isNetworkErrorRetryable;

function applyJitter(delayMs: number, jitter: RetryJitterMode): number {
  if (delayMs <= 0) return 0;

  if (jitter === "full") {
    return Math.max(1, Math.floor(Math.random() * (delayMs + 1)));
  }

  if (jitter === "partial") {
    const floor = Math.floor(delayMs / 2);
    return Math.max(1, floor + Math.floor(Math.random() * (delayMs - floor + 1)));
  }

  return delayMs;
}

/**
 * バックオフ遅延時間計算
 * @summary 遅延時間計算
 * @param attempt - 現在の試行回数
 * @param config - 再試行設定
 * @returns 遅延時間
 */
export function computeBackoffDelayMs(
  attempt: number,
  config: RetryWithBackoffConfig,
): number {
  const retryAttempt = Math.max(1, Math.trunc(attempt));
  const exponential = config.initialDelayMs * config.multiplier ** (retryAttempt - 1);
  const bounded = Math.min(config.maxDelayMs, Math.max(1, Math.trunc(exponential)));
  return applyJitter(bounded, config.jitter);
}

function createAbortError(): Error {
  return new Error("retry aborted");
}

function createRateLimitFastFailError(message: string): Error {
  return new Error(`rate limit fast-fail: ${message}`);
}

function toOptionalNonNegativeInt(value: unknown, fallback: number, max = 20): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) return fallback;
  if (parsed < 0) return fallback;
  return clampInteger(parsed, 0, max);
}

function toOptionalPositiveInt(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined) return fallback;
  if (parsed <= 0) return fallback;
  return clampInteger(parsed, 1, 600_000);
}

function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      cleanup();
      resolvePromise();
    }, delayMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      rejectPromise(createAbortError());
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 指数関数的バックオフで再試行
 * @summary バックオフ再試行実行
 * @param operation - 非同期処理
 * @param options - 再試行オプション
 * @returns 処理結果
 * @throws 中断または最大試行回数超過時
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryWithBackoffOptions = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const config = resolveRetryWithBackoffConfig(options.cwd, options.overrides);
  const maxRateLimitRetries = toOptionalNonNegativeInt(
    options.maxRateLimitRetries,
    DEFAULT_MAX_RATE_LIMIT_RETRIES,
  );
  const maxRateLimitWaitMs =
    options.maxRateLimitWaitMs === undefined
      ? undefined
      : toOptionalPositiveInt(options.maxRateLimitWaitMs, 1);
  let attempt = 0;
  let rateLimitRetryCount = 0;
  const rateLimitKey =
    typeof options.rateLimitKey === "string" && options.rateLimitKey.trim().length > 0
      ? normalizeRateLimitKey(options.rateLimitKey)
      : undefined;
  const rateLimitKeys = createRateLimitKeyScope(rateLimitKey);

  while (true) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    if (rateLimitKeys.length > 0) {
      const nowMs = now();
      const gate = selectLongestRateLimitGate(
        rateLimitKeys.map((scopeKey) => getRateLimitGateSnapshot(scopeKey, { now })),
        nowMs,
      );
      if (gate.waitMs > 0) {
        recordTotalLimitObservation({
          kind: "rate_limit",
          waitMs: gate.waitMs,
        });
        if (maxRateLimitWaitMs !== undefined && gate.waitMs > maxRateLimitWaitMs) {
          throw createRateLimitFastFailError(
            `gate_wait=${gate.waitMs}ms exceeds limit=${maxRateLimitWaitMs}ms key=${gate.key}`,
          );
        }
        options.onRateLimitWait?.({
          key: gate.key,
          waitMs: gate.waitMs,
          hits: gate.hits,
          untilMs: gate.untilMs,
        });
        await sleepWithAbort(gate.waitMs, options.signal);
      }
    }

    try {
      const operationStartedAt = now();
      const result = await operation();
      const operationLatencyMs = Math.max(0, now() - operationStartedAt);
      recordTotalLimitObservation({
        kind: "success",
        latencyMs: operationLatencyMs,
      });
      if (rateLimitKeys.length > 0) {
        for (const scopeKey of rateLimitKeys) {
          registerRateLimitGateSuccess(scopeKey, now);
        }
      }
      return result;
    } catch (error) {
      const statusCode = extractRetryStatusCode(error);
      if (statusCode === 429) {
        recordTotalLimitObservation({ kind: "rate_limit" });
      } else {
        recordTotalLimitObservation({
          kind: statusCode === 408 ? "timeout" : "error",
        });
      }
      const retryable = options.shouldRetry
        ? options.shouldRetry(error, statusCode)
        : isNetworkErrorRetryable(error, statusCode);

      if (!retryable || attempt >= config.maxRetries) {
        throw error;
      }

      if (statusCode === 429) {
        rateLimitRetryCount += 1;
        if (rateLimitRetryCount > maxRateLimitRetries) {
          throw createRateLimitFastFailError(
            `status=429 retry_count=${rateLimitRetryCount} limit=${maxRateLimitRetries}`,
          );
        }
      }

      attempt += 1;
      let delayMs = computeBackoffDelayMs(attempt, config);
      if (statusCode === 429 && rateLimitKeys.length > 0) {
        const nowMs = now();
        const sharedGate = selectLongestRateLimitGate(
          rateLimitKeys.map((scopeKey) => registerRateLimitGateHit(scopeKey, delayMs, now)),
          nowMs,
        );
        delayMs = Math.max(delayMs, sharedGate.waitMs);
        if (maxRateLimitWaitMs !== undefined && delayMs > maxRateLimitWaitMs) {
          throw createRateLimitFastFailError(
            `retry_wait=${delayMs}ms exceeds limit=${maxRateLimitWaitMs}ms key=${sharedGate.key}`,
          );
        }
      }
      options.onRetry?.({
        attempt,
        maxRetries: config.maxRetries,
        delayMs,
        statusCode,
        error,
      });
      await sleepWithAbort(delayMs, options.signal);
    }
  }
}
