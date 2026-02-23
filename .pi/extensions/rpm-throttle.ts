/**
 * @abdd.meta
 * path: .pi/extensions/rpm-throttle.ts
 * role: リクエスト頻度制御エクステンション
 * why: 通常ターンのLLM呼び出しに対し、RPM（Requests Per Minute）超過によるHTTP 429エラーを抑制するため
 * related: .pi/lib/provider-limits.ts, .pi/extensions/pi-coding-agent-rate-limit-fix.ts
 * public_api: before_agent_startフックを介したリクエスト実行許可の制御
 * invariants: requestStartsMsは昇順、cooldownUntilMsは現在時刻以降または過去、状態はプロセス間でファイル共有される
 * side_effects: ~/.pi/runtime/rpm-throttle-state.json の読み書き、プロセスの待機（sleep）
 * failure_modes: ファイルロック取得時のタイムアウト、状態ファイルの破損（無視して動作続行）
 * @abdd.explain
 * overview: プロバイダごとのRPM制限に基づき、移動平均スロットルと動的クールダウンを適用する拡張機能
 * what_it_does:
 *   - before_agent_startフックでリクエスト許可判定を実行し、必要に応じて待機または429エラーを返す
 *   - 直近1分間のリクエスト時刻（requestStartsMs）を追跴し、制限を超過した場合に待機時間を計算する
 *   - 429エラー発生時に指数関数的なバックオフでクールダウン期間を設定し、リクエストを一時停止する
 *   - ファイルロックを用いて複数プロセス間でスロットル状態を共有する
 * why_it_exists:
 *   - APIプロバイダのRPM制限を遵守し、エージェントの実行安定性を向上させるため
 *   - 429エラーの連鎖を防ぎ、効率的なリクエストスケジューリングを実現するため
 * scope:
 *   in: ExtensionAPI（コンテキスト）, 環境変数（設定値）, 外部ファイル（状態）
 *   out: リクエストの一時停止, 共有状態ファイルの更新, 429エラーのシミュレーション
 */

/**
 * .pi/extensions/rpm-throttle.ts
 * 通常ターンのLLM呼び出しに対して、RPM主因の429を減らすためのスロットリングを提供する。
 * before_agent_startで1分窓のリクエスト数を制御し、429検知時は追加クールダウンを適用する。
 * 関連: .pi/lib/provider-limits.ts, .pi/extensions/pi-coding-agent-rate-limit-fix.ts, package.json
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { detectTier, getRpmLimit } from "../lib/provider-limits.js";
import { sleep } from "../lib/sleep-utils.js";
import { withFileLock } from "../lib/storage-lock.js";

type BucketState = {
  requestStartsMs: number[];
  cooldownUntilMs: number;
  lastAccessedMs: number;
};

const WINDOW_MS_DEFAULT = 60_000;
const HEADROOM_FACTOR_DEFAULT = 0.7;
const FALLBACK_429_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const MAX_STATE_AGE_MS = 15 * 60_000; // 15 minutes
const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const SHARED_STATE_FILE = join(RUNTIME_DIR, "rpm-throttle-state.json");
const FILE_LOCK_OPTIONS = {
  maxWaitMs: 2_000,
  pollMs: 25,
  staleMs: 15_000,
};

const states = new Map<string, BucketState>();

type SharedStateRecord = {
  version: number;
  updatedAt: string;
  states: Record<string, BucketState>;
};

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

function keyFor(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

function getOrCreateState(key: string, nowMs: number): BucketState {
  const current = states.get(key);
  if (current) {
    current.lastAccessedMs = nowMs;
    return current;
  }
  const created: BucketState = { requestStartsMs: [], cooldownUntilMs: 0, lastAccessedMs: nowMs };
  states.set(key, created);
  return created;
}

function ensureRuntimeDir(): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function loadSharedStatesIntoMemory(nowMs: number): void {
  try {
    if (!existsSync(SHARED_STATE_FILE)) return;
    const raw = readFileSync(SHARED_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SharedStateRecord>;
    if (!parsed || typeof parsed !== "object" || !parsed.states || typeof parsed.states !== "object") {
      return;
    }
    states.clear();
    for (const [key, value] of Object.entries(parsed.states)) {
      if (!value || typeof value !== "object") continue;
      const requestStartsMs = Array.isArray(value.requestStartsMs)
        ? value.requestStartsMs.filter((v): v is number => Number.isFinite(v) && v > 0)
        : [];
      const cooldownUntilMs = Number.isFinite(value.cooldownUntilMs) ? value.cooldownUntilMs : 0;
      const lastAccessedMs = Number.isFinite(value.lastAccessedMs) ? value.lastAccessedMs : nowMs;
      states.set(key, {
        requestStartsMs,
        cooldownUntilMs,
        lastAccessedMs,
      });
    }
  } catch {
    // Ignore broken state file.
  }
}

function saveSharedStates(nowMs: number): void {
  try {
    ensureRuntimeDir();
    const serialized: SharedStateRecord = {
      version: 1,
      updatedAt: new Date(nowMs).toISOString(),
      states: Object.fromEntries(states.entries()),
    };
    writeFileSync(SHARED_STATE_FILE, JSON.stringify(serialized, null, 2), "utf-8");
  } catch {
    // Best effort only.
  }
}

function withSharedStateMutation<T>(nowMs: number, mutator: () => T): T {
  const localFallback = () => {
    const result = mutator();
    saveSharedStates(nowMs);
    return result;
  };

  try {
    ensureRuntimeDir();
    return withFileLock(
      SHARED_STATE_FILE,
      () => {
        loadSharedStatesIntoMemory(nowMs);
        const result = mutator();
        saveSharedStates(nowMs);
        return result;
      },
      FILE_LOCK_OPTIONS,
    );
  } catch {
    return localFallback();
  }
}

function pruneStates(nowMs: number): void {
  states.forEach((state, key) => {
    if (nowMs - state.lastAccessedMs > MAX_STATE_AGE_MS) {
      states.delete(key);
    }
  });
}

function pruneWindow(state: BucketState, nowMs: number, windowMs: number): void {
  while (state.requestStartsMs.length > 0 && nowMs - state.requestStartsMs[0] >= windowMs) {
    state.requestStartsMs.shift();
  }
}

function isRateLimitMessage(text: string): boolean {
  return /429|rate.?limit|too many requests|quota exceeded/i.test(text);
}

function extractRetryAfterMs(text: string): number | undefined {
  const sec = text.match(/retry[-\s]?after[^0-9]*(\d+)(?:\.\d+)?\s*(s|sec|secs|second|seconds)\b/i);
  if (sec) return Math.max(0, Number(sec[1]) * 1000);

  const ms = text.match(/retry[-\s]?after[^0-9]*(\d+)\s*(ms|msec|millisecond|milliseconds)\b/i);
  if (ms) return Math.max(0, Number(ms[1]));

  return undefined;
}

function resolveEffectiveRpm(provider: string, model: string): number {
  // 明示overrideがあれば最優先
  const override = parseNumberEnv("PI_RPM_THROTTLE_OVERRIDE", 0);
  if (override > 0) return Math.max(1, Math.floor(override));

  // プロバイダ定義からRPMを解決
  const tier = detectTier(provider, model);
  const baseRpm = getRpmLimit(provider, model, tier);

  // ヘッドルームを確保してバーストを抑える
  const headroom = parseNumberEnv("PI_RPM_THROTTLE_HEADROOM", HEADROOM_FACTOR_DEFAULT);
  return Math.max(1, Math.floor(baseRpm * Math.max(0.1, Math.min(1, headroom))));
}

function findLastAssistantError(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (!msg || msg.role !== "assistant") continue;
    if (msg.stopReason !== "error") return undefined;
    const err = msg.errorMessage;
    if (typeof err === "string" && err.length > 0) return err;
    return undefined;
  }
  return undefined;
}

/**
 * RPMスロットル拡張登録
 * @summary スロットル拡張登録
 * @param pi 拡張API
 * @returns なし
 */
export default function registerRpmThrottleExtension(pi: ExtensionAPI): void {
  const enabled = parseBooleanEnv("PI_RPM_THROTTLE_ENABLED", true);
  if (!enabled) return;

  const windowMs = Math.max(1000, parseNumberEnv("PI_RPM_THROTTLE_WINDOW_MS", WINDOW_MS_DEFAULT));

  pi.on("before_agent_start", async (_event, ctx) => {
    const provider = ctx.model?.provider;
    const model = ctx.model?.id;
    if (!provider || !model) return;

    const effectiveRpm = resolveEffectiveRpm(provider, model);
    const maxRequestsInWindow = Math.max(1, Math.floor((effectiveRpm * windowMs) / 60_000));
    const key = keyFor(provider, model);

    while (true) {
      const now = Date.now();
      const waitMs = withSharedStateMutation(now, () => {
        pruneStates(now);
        const state = getOrCreateState(key, now);
        pruneWindow(state, now, windowMs);

        let requiredWaitMs = Math.max(0, state.cooldownUntilMs - now);
        if (state.requestStartsMs.length >= maxRequestsInWindow) {
          const oldest = state.requestStartsMs[0];
          const rpmWait = Math.max(0, oldest + windowMs - now);
          requiredWaitMs = Math.max(requiredWaitMs, rpmWait);
        }

        if (requiredWaitMs === 0) {
          state.requestStartsMs.push(now);
          state.lastAccessedMs = now;
        }
        return requiredWaitMs;
      });

      if (waitMs <= 0) {
        break;
      }

      console.error(
        `[rpm-throttle] wait=${waitMs}ms model=${provider}/${model} window_limit=${maxRequestsInWindow}`,
      );
      await sleep(waitMs);
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const provider = ctx.model?.provider;
    const model = ctx.model?.id;
    if (!provider || !model) return;

    const errorMessage = findLastAssistantError((event as { messages?: unknown }).messages);
    if (!errorMessage || !isRateLimitMessage(errorMessage)) return;

    const key = keyFor(provider, model);
    const now = Date.now();
    const retryAfterMs = extractRetryAfterMs(errorMessage) ?? FALLBACK_429_COOLDOWN_MS;
    const cooldownMs = Math.min(Math.max(retryAfterMs, FALLBACK_429_COOLDOWN_MS), MAX_COOLDOWN_MS);
    withSharedStateMutation(now, () => {
      pruneStates(now);
      const state = getOrCreateState(key, now);
      state.cooldownUntilMs = Math.max(state.cooldownUntilMs, now + cooldownMs);
      state.lastAccessedMs = now;
    });

    console.error(`[rpm-throttle] 429 cooldown=${cooldownMs}ms model=${provider}/${model}`);
  });
}
