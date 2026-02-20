/**
 * .pi/extensions/rpm-throttle.ts
 * 通常ターンのLLM呼び出しに対して、RPM主因の429を減らすためのスロットリングを提供する。
 * before_agent_startで1分窓のリクエスト数を制御し、429検知時は追加クールダウンを適用する。
 * 関連: .pi/lib/provider-limits.ts, .pi/extensions/pi-coding-agent-rate-limit-fix.ts, package.json
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { detectTier, getRpmLimit } from "../lib/provider-limits.js";

type BucketState = {
  requestStartsMs: number[];
  cooldownUntilMs: number;
  lastAccessedMs: number;
};

const WINDOW_MS_DEFAULT = 60_000;
const HEADROOM_FACTOR_DEFAULT = 0.7;
const FALLBACK_429_COOLDOWN_MS = 15_000;
const MAX_COOLDOWN_MS = 5 * 60_000;
const MAX_STATE_AGE_MS = 15 * 60_1000; // 15 minutes

const states = new Map<string, BucketState>();

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export default function registerRpmThrottleExtension(pi: ExtensionAPI): void {
  const enabled = parseBooleanEnv("PI_RPM_THROTTLE_ENABLED", true);
  if (!enabled) return;

  const windowMs = Math.max(1000, parseNumberEnv("PI_RPM_THROTTLE_WINDOW_MS", WINDOW_MS_DEFAULT));

  pi.on("before_agent_start", async (_event, ctx) => {
    const provider = ctx.model?.provider;
    const model = ctx.model?.id;
    if (!provider || !model) return;

    const key = keyFor(provider, model);
    const now = Date.now();
    pruneStates(now);
    const state = getOrCreateState(key, now);
    const effectiveRpm = resolveEffectiveRpm(provider, model);
    const maxRequestsInWindow = Math.max(1, Math.floor((effectiveRpm * windowMs) / 60_000));

    pruneWindow(state, now, windowMs);

    // 429直後の強制クールダウン
    let waitMs = Math.max(0, state.cooldownUntilMs - now);

    // RPM窓上限を超える場合は、最古エントリの窓明けまで待つ
    if (state.requestStartsMs.length >= maxRequestsInWindow) {
      const oldest = state.requestStartsMs[0];
      const rpmWait = Math.max(0, oldest + windowMs - now);
      waitMs = Math.max(waitMs, rpmWait);
    }

    if (waitMs > 0) {
      console.error(
        `[rpm-throttle] wait=${waitMs}ms model=${provider}/${model} window_count=${state.requestStartsMs.length}/${maxRequestsInWindow}`,
      );
      await sleep(waitMs);
    }

    const startedAt = Date.now();
    pruneWindow(state, startedAt, windowMs);
    state.requestStartsMs.push(startedAt);
  });

  pi.on("agent_end", async (event, ctx) => {
    const provider = ctx.model?.provider;
    const model = ctx.model?.id;
    if (!provider || !model) return;

    const errorMessage = findLastAssistantError((event as { messages?: unknown }).messages);
    if (!errorMessage || !isRateLimitMessage(errorMessage)) return;

    const key = keyFor(provider, model);
    const now = Date.now();
    pruneStates(now);
    const state = getOrCreateState(key, now);
    const retryAfterMs = extractRetryAfterMs(errorMessage) ?? FALLBACK_429_COOLDOWN_MS;
    const cooldownMs = Math.min(Math.max(retryAfterMs, FALLBACK_429_COOLDOWN_MS), MAX_COOLDOWN_MS);
    state.cooldownUntilMs = Math.max(state.cooldownUntilMs, now + cooldownMs);

    console.error(`[rpm-throttle] 429 cooldown=${cooldownMs}ms model=${provider}/${model}`);
  });
}
