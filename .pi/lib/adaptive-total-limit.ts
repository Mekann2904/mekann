/**
 * @abdd.meta
 * path: .pi/lib/adaptive-total-limit.ts
 * role: クラスタ全体のTotal max LLMを観測ベースで自動調整する学習コントローラー
 * why: 固定上限では負荷変動に追従できないため、429率と遅延を使って安全に上限を最適化する
 * related: .pi/lib/retry-with-backoff.ts, .pi/lib/runtime-config.ts, .pi/lib/cross-instance-coordinator.ts, .pi/extensions/agent-runtime.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getRuntimeConfig } from "./runtime-config.js";
import { withFileLock } from "./storage-lock.js";

type ObservationKind = "success" | "rate_limit" | "timeout" | "error";

export interface TotalLimitObservation {
  kind: ObservationKind;
  latencyMs?: number;
  waitMs?: number;
  timestampMs?: number;
}

interface ObservationSample {
  kind: ObservationKind;
  latencyMs: number;
  waitMs: number;
  timestampMs: number;
}

interface AdaptiveTotalLimitState {
  version: number;
  lastUpdated: string;
  baseLimit: number;
  learnedLimit: number;
  hardMax: number;
  minLimit: number;
  lastDecisionAtMs: number;
  cooldownUntilMs: number;
  lastReason: string;
  samples: ObservationSample[];
}

const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const STATE_FILE = join(RUNTIME_DIR, "adaptive-total-limit.json");
const STATE_VERSION = 1;

const WINDOW_MS = 5 * 60 * 1000;
const DECISION_INTERVAL_MS = 30_000;
const DECISION_COOLDOWN_MS = 90_000;
const EMERGENCY_COOLDOWN_MS = 180_000;
const MAX_SAMPLE_COUNT = 2048;
const MIN_SAMPLE_COUNT = 20;

const HIGH_RATE_LIMIT_RATIO = 0.03;
const LOW_RATE_LIMIT_RATIO = 0.005;
const HIGH_TIMEOUT_RATIO = 0.02;
const LOW_LATENCY_P95_MS = 45_000;
const HIGH_WAIT_P95_MS = 2_000;
const STATE_LOCK_OPTIONS = {
  maxWaitMs: 2_000,
  pollMs: 25,
  staleMs: 15_000,
};

let stateCache: AdaptiveTotalLimitState | null = null;
let persistenceFailed = false;
let adaptiveNowProvider: () => number = () => Date.now();

function nowMs(): number {
  return adaptiveNowProvider();
}

function toFiniteInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function parseEnvLimit(name: string, min: number, max: number): number | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const parsed = toFiniteInteger(raw);
  if (parsed === undefined) return undefined;
  if (parsed < min || parsed > max) return undefined;
  return parsed;
}

function resolveHardMax(baseLimit: number): number {
  const fromEnv = parseEnvLimit("PI_ADAPTIVE_TOTAL_MAX_LLM_HARD", 1, 64);
  if (fromEnv !== undefined) return fromEnv;
  return clamp(Math.max(baseLimit, baseLimit * 3), 1, 64);
}

function resolveMinLimit(baseLimit: number): number {
  const fromEnv = parseEnvLimit("PI_ADAPTIVE_TOTAL_MAX_LLM_MIN", 1, 64);
  if (fromEnv !== undefined) return fromEnv;
  return clamp(Math.min(2, baseLimit), 1, 64);
}

function getDefaultBaseLimit(): number {
  const config = getRuntimeConfig();
  return clamp(config.totalMaxLlm, 1, 64);
}

function createDefaultState(baseLimit: number): AdaptiveTotalLimitState {
  const hardMax = resolveHardMax(baseLimit);
  const minLimit = Math.min(resolveMinLimit(baseLimit), hardMax);
  const initialLimit = clamp(baseLimit, minLimit, hardMax);
  return {
    version: STATE_VERSION,
    lastUpdated: new Date().toISOString(),
    baseLimit,
    learnedLimit: initialLimit,
    hardMax,
    minLimit,
    lastDecisionAtMs: 0,
    cooldownUntilMs: 0,
    lastReason: "init",
    samples: [],
  };
}

function isAdaptiveEnabled(): boolean {
  const raw = String(process.env.PI_ADAPTIVE_TOTAL_MAX_LLM ?? "1").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off";
}

function ensureRuntimeDir(): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function safeParseState(raw: string): AdaptiveTotalLimitState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AdaptiveTotalLimitState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== STATE_VERSION) return null;
    const baseLimit = clamp(toFiniteInteger(parsed.baseLimit) ?? getDefaultBaseLimit(), 1, 64);
    const hardMax = clamp(toFiniteInteger(parsed.hardMax) ?? resolveHardMax(baseLimit), 1, 64);
    const minLimit = clamp(toFiniteInteger(parsed.minLimit) ?? resolveMinLimit(baseLimit), 1, hardMax);
    const learnedLimit = clamp(toFiniteInteger(parsed.learnedLimit) ?? baseLimit, minLimit, hardMax);
    const samples = Array.isArray(parsed.samples)
      ? parsed.samples
          .map((sample) => {
            if (!sample || typeof sample !== "object") return null;
            const kind = String((sample as ObservationSample).kind) as ObservationKind;
            if (kind !== "success" && kind !== "rate_limit" && kind !== "timeout" && kind !== "error") {
              return null;
            }
            const timestampMs = toFiniteInteger((sample as ObservationSample).timestampMs);
            if (timestampMs === undefined || timestampMs <= 0) return null;
            const latencyMs = clamp(Math.max(0, toFiniteInteger((sample as ObservationSample).latencyMs) ?? 0), 0, 3_600_000);
            const waitMs = clamp(Math.max(0, toFiniteInteger((sample as ObservationSample).waitMs) ?? 0), 0, 3_600_000);
            return { kind, latencyMs, waitMs, timestampMs };
          })
          .filter((sample): sample is ObservationSample => sample !== null)
          .slice(-MAX_SAMPLE_COUNT)
      : [];
    return {
      version: STATE_VERSION,
      lastUpdated: String(parsed.lastUpdated || new Date().toISOString()),
      baseLimit,
      learnedLimit,
      hardMax,
      minLimit,
      lastDecisionAtMs: toFiniteInteger(parsed.lastDecisionAtMs) ?? 0,
      cooldownUntilMs: toFiniteInteger(parsed.cooldownUntilMs) ?? 0,
      lastReason: String(parsed.lastReason || "loaded"),
      samples,
    };
  } catch {
    return null;
  }
}

function loadState(): AdaptiveTotalLimitState {
  if (stateCache && persistenceFailed) {
    return stateCache;
  }

  if (stateCache && !existsSync(STATE_FILE)) {
    return stateCache;
  }

  let loaded: AdaptiveTotalLimitState | null = null;
  try {
    if (existsSync(STATE_FILE)) {
      loaded = safeParseState(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {
    loaded = null;
  }
  const resolved = loaded ?? createDefaultState(getDefaultBaseLimit());
  stateCache = resolved;
  return resolved;
}

function saveState(state: AdaptiveTotalLimitState): void {
  try {
    ensureRuntimeDir();
    state.lastUpdated = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    persistenceFailed = false;
  } catch {
    persistenceFailed = true;
    // Keep runtime resilient: learning is best-effort only.
  }
}

function withStateWriteLock<T>(mutator: (draft: AdaptiveTotalLimitState) => T): T {
  try {
    return withFileLock(STATE_FILE, () => {
      const draft = loadState();
      stateCache = draft;
      const result = mutator(draft);
      saveState(draft);
      return result;
    }, STATE_LOCK_OPTIONS);
  } catch {
    // Keep learning best-effort in restricted environments.
    const draft = loadState();
    stateCache = draft;
    const result = mutator(draft);
    saveState(draft);
    return result;
  }
}

function trimWindow(samples: ObservationSample[], now: number): ObservationSample[] {
  const minTs = now - WINDOW_MS;
  return samples.filter((sample) => sample.timestampMs >= minTs).slice(-MAX_SAMPLE_COUNT);
}

function toPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index];
}

function updateBaseConstraints(state: AdaptiveTotalLimitState, baseLimit: number): void {
  state.baseLimit = clamp(baseLimit, 1, 64);
  state.hardMax = resolveHardMax(state.baseLimit);
  state.minLimit = Math.min(resolveMinLimit(state.baseLimit), state.hardMax);
  state.learnedLimit = clamp(state.learnedLimit, state.minLimit, state.hardMax);
}

function decideNextLimit(state: AdaptiveTotalLimitState, now: number): { next: number; reason: string; cooldownMs: number } {
  const samples = state.samples;
  if (samples.length < MIN_SAMPLE_COUNT) {
    return { next: state.learnedLimit, reason: "insufficient_samples", cooldownMs: DECISION_COOLDOWN_MS };
  }

  const rateLimitCount = samples.filter((sample) => sample.kind === "rate_limit").length;
  const timeoutCount = samples.filter((sample) => sample.kind === "timeout").length;
  const successCount = samples.filter((sample) => sample.kind === "success").length;
  const totalCount = samples.length;
  const rateLimitRatio = rateLimitCount / totalCount;
  const timeoutRatio = timeoutCount / totalCount;
  const successRatio = successCount / totalCount;
  const waitP95 = toPercentile(samples.map((sample) => sample.waitMs), 0.95);
  const latencyP95 = toPercentile(
    samples.filter((sample) => sample.kind === "success" && sample.latencyMs > 0).map((sample) => sample.latencyMs),
    0.95,
  );
  const recent429 = samples
    .slice(-5)
    .reduce((count, sample) => (sample.kind === "rate_limit" ? count + 1 : 0), 0);

  if (recent429 >= 3) {
    return {
      next: clamp(state.learnedLimit - 2, state.minLimit, state.hardMax),
      reason: "emergency_rate_limit_streak",
      cooldownMs: EMERGENCY_COOLDOWN_MS,
    };
  }

  if (rateLimitRatio >= HIGH_RATE_LIMIT_RATIO || timeoutRatio >= HIGH_TIMEOUT_RATIO || waitP95 >= HIGH_WAIT_P95_MS) {
    return {
      next: clamp(state.learnedLimit - 1, state.minLimit, state.hardMax),
      reason: "pressure_detected",
      cooldownMs: DECISION_COOLDOWN_MS,
    };
  }

  if (
    rateLimitRatio <= LOW_RATE_LIMIT_RATIO &&
    timeoutRatio === 0 &&
    successRatio >= 0.98 &&
    (latencyP95 === 0 || latencyP95 <= LOW_LATENCY_P95_MS)
  ) {
    return {
      next: clamp(state.learnedLimit + 1, state.minLimit, state.hardMax),
      reason: "stable_recovery",
      cooldownMs: DECISION_COOLDOWN_MS,
    };
  }

  return {
    next: state.learnedLimit,
    reason: "hold",
    cooldownMs: DECISION_COOLDOWN_MS,
  };
}

function maybeRunDecision(state: AdaptiveTotalLimitState, now: number): void {
  if (now < state.cooldownUntilMs) return;
  if (now - state.lastDecisionAtMs < DECISION_INTERVAL_MS) return;

  const decision = decideNextLimit(state, now);
  state.learnedLimit = decision.next;
  state.lastReason = decision.reason;
  state.lastDecisionAtMs = now;
  state.cooldownUntilMs = now + decision.cooldownMs;
}

function toSafeObservation(observation: TotalLimitObservation, now: number): ObservationSample {
  const kind = observation.kind;
  const latencyMs = clamp(Math.max(0, toFiniteInteger(observation.latencyMs) ?? 0), 0, 3_600_000);
  const waitMs = clamp(Math.max(0, toFiniteInteger(observation.waitMs) ?? 0), 0, 3_600_000);
  const timestampMs = clamp(Math.max(1, toFiniteInteger(observation.timestampMs) ?? now), 1, Number.MAX_SAFE_INTEGER);
  return { kind, latencyMs, waitMs, timestampMs };
}

export function recordTotalLimitObservation(observation: TotalLimitObservation, baseLimit?: number): void {
  if (!isAdaptiveEnabled()) return;
  withStateWriteLock((state) => {
    const now = nowMs();
    updateBaseConstraints(state, baseLimit ?? state.baseLimit ?? getDefaultBaseLimit());
    state.samples.push(toSafeObservation(observation, now));
    state.samples = trimWindow(state.samples, now);
    maybeRunDecision(state, now);
  });
}

export function getAdaptiveTotalMaxLlm(baseLimit: number): number {
  if (!isAdaptiveEnabled()) return clamp(baseLimit, 1, 64);
  return withStateWriteLock((state) => {
    const now = nowMs();
    updateBaseConstraints(state, baseLimit);
    state.samples = trimWindow(state.samples, now);
    maybeRunDecision(state, now);
    return clamp(state.learnedLimit, state.minLimit, state.hardMax);
  });
}

export function getAdaptiveTotalLimitSnapshot(): {
  enabled: boolean;
  baseLimit: number;
  learnedLimit: number;
  hardMax: number;
  minLimit: number;
  sampleCount: number;
  lastReason: string;
} {
  const enabled = isAdaptiveEnabled();
  const state = loadState();
  return {
    enabled,
    baseLimit: state.baseLimit,
    learnedLimit: state.learnedLimit,
    hardMax: state.hardMax,
    minLimit: state.minLimit,
    sampleCount: state.samples.length,
    lastReason: state.lastReason,
  };
}

// test helper
export function __resetAdaptiveTotalLimitStateForTests(): void {
  stateCache = null;
  persistenceFailed = false;
}

// test helper
export function __setAdaptiveTotalLimitNowProviderForTests(provider?: () => number): void {
  adaptiveNowProvider = provider ?? (() => Date.now());
}
