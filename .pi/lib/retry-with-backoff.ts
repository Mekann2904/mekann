// File: .pi/lib/retry-with-backoff.ts
// Description: Shared retry helpers with exponential backoff and jitter for transient LLM failures.
// Why: Keeps 429/5xx recovery policy in one place for subagents and agent teams.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/config.json

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

 /**
  * リトライ時のジッターモード
  * @type {"full" | "partial" | "none"}
  */
export type RetryJitterMode = "full" | "partial" | "none";

 /**
  * 指数バックオフとジッターを伴うリトライ設定
  * @param maxRetries 最大リトライ回数
  * @param initialDelayMs 初回遅延時間（ミリ秒）
  * @param maxDelayMs 最大遅延時間（ミリ秒）
  * @param multiplier 遅延時間の乗数
  * @param jitter ジッターモード
  */
export interface RetryWithBackoffConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: RetryJitterMode;
}

 /**
  * RetryWithBackoffConfigの部分的オーバーライド設定
  */
export type RetryWithBackoffOverrides = Partial<RetryWithBackoffConfig>;

 /**
  * リトライ時のコンテキスト情報
  * @param attempt 現在のリトライ回数
  * @param maxRetries 最大リトライ回数
  * @param delayMs 次回のリトライ遅延時間（ミリ秒）
  * @param statusCode ステータスコード（任意）
  * @param error 発生したエラー
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
  * レート制限のスナップショット
  * @param key キー
  * @param waitMs 待機時間（ミリ秒）
  * @param hits ヒット数
  * @param untilMs 有効期限（ミリ秒）
  */
export interface RateLimitGateSnapshot {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
}

 /**
  * レート制限待機コンテキスト
  * @param key キー
  * @param waitMs 待機時間（ミリ秒）
  * @param hits ヒット数
  * @param untilMs 有効期限（ミリ秒）
  */
export interface RateLimitWaitContext {
  key: string;
  waitMs: number;
  hits: number;
  untilMs: number;
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
const sharedRateLimitState: SharedRateLimitState = {
  entries: new Map<string, SharedRateLimitStateEntry>(),
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
  } catch {
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

function selectLongestRateLimitGate(gates: RateLimitGateSnapshot[]): RateLimitGateSnapshot {
  if (gates.length === 0) {
    return {
      key: GLOBAL_RATE_LIMIT_GATE_KEY,
      waitMs: 0,
      hits: 0,
      untilMs: Date.now(),
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

function pruneRateLimitState(nowMs = Date.now()): void {
  const state = getSharedRateLimitState();

  // First pass: remove expired entries based on TTL
  for (const [key, entry] of state.entries.entries()) {
    if (nowMs - entry.updatedAtMs > RATE_LIMIT_GATE_TTL_MS && entry.untilMs <= nowMs) {
      state.entries.delete(key);
    }
  }

  // Second pass: enforce max entries limit to prevent unbounded memory growth
  // Remove oldest entries (by updatedAtMs) when over limit
  if (state.entries.size > MAX_RATE_LIMIT_ENTRIES) {
    const entries = Array.from(state.entries.entries())
      .sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
    const toRemove = entries.slice(0, state.entries.size - MAX_RATE_LIMIT_ENTRIES);
    for (const [key] of toRemove) {
      state.entries.delete(key);
    }
  }
}

 /**
  * 指定キーのレートリミット情報を取得する
  * @param key レート制限キー
  * @returns スナップショット情報
  */
export function getRateLimitGateSnapshot(key: string | undefined): RateLimitGateSnapshot {
  const normalizedKey = normalizeRateLimitKey(key);
  const nowMs = Date.now();
  pruneRateLimitState(nowMs);
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
}

function registerRateLimitGateHit(key: string | undefined, retryDelayMs: number): RateLimitGateSnapshot {
  const normalizedKey = normalizeRateLimitKey(key);
  const nowMs = Date.now();
  pruneRateLimitState(nowMs);
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

  return {
    key: normalizedKey,
    waitMs: Math.max(0, nextUntilMs - nowMs),
    hits: nextHits,
    untilMs: nextUntilMs,
  };
}

function registerRateLimitGateSuccess(key: string | undefined): void {
  const normalizedKey = normalizeRateLimitKey(key);
  const nowMs = Date.now();
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
}

/**
 * バックオフ設定を解決する
 * @param cwd カレントディレクトリ
 * @param overrides 上書き設定
 * @returns 解決された設定
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
  * エラーからステータスコードを抽出
  * @param error エラーオブジェクト
  * @returns ステータスコード（0〜999）、またはundefined
  */
export function extractRetryStatusCode(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const status = toFiniteNumber((error as { status?: unknown }).status);
    if (status !== undefined) {
      return clampInteger(status, 0, 999);
    }

    const statusCode = toFiniteNumber((error as { statusCode?: unknown }).statusCode);
    if (statusCode !== undefined) {
      return clampInteger(statusCode, 0, 999);
    }
  }

  const message = error instanceof Error ? error.message : String(error || "");
  const codeMatch = message.match(/\b(429|401|403|5\d{2})\b/);
  if (codeMatch) {
    return Number(codeMatch[1]);
  }

  if (/too many requests|rate[\s-]?limit|quota exceeded/i.test(message)) {
    return 429;
  }

  return undefined;
}

 /**
  * エラーがリトライ可能か判定する
  * @param error - 判定対象のエラー
  * @param statusCode - HTTPステータスコード（省略時はerrorから抽出）
  * @returns リトライ可能な場合はtrue
  */
export function isRetryableError(error: unknown, statusCode?: number): boolean {
  const code = statusCode ?? extractRetryStatusCode(error);
  if (code === 429) return true;
  return code !== undefined && code >= 500 && code <= 599;
}

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
  * 指数バックオフでオペレーションをリトライする
  * @param operation 実行する非同期処理
  * @param options リトライ設定オプション
  * @returns オペレーションの結果
  */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryWithBackoffOptions = {},
): Promise<T> {
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
      const gate = selectLongestRateLimitGate(
        rateLimitKeys.map((scopeKey) => getRateLimitGateSnapshot(scopeKey)),
      );
      if (gate.waitMs > 0) {
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
      const result = await operation();
      if (rateLimitKeys.length > 0) {
        for (const scopeKey of rateLimitKeys) {
          registerRateLimitGateSuccess(scopeKey);
        }
      }
      return result;
    } catch (error) {
      const statusCode = extractRetryStatusCode(error);
      const retryable = options.shouldRetry
        ? options.shouldRetry(error, statusCode)
        : isRetryableError(error, statusCode);

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
        const sharedGate = selectLongestRateLimitGate(
          rateLimitKeys.map((scopeKey) => registerRateLimitGateHit(scopeKey, delayMs)),
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
