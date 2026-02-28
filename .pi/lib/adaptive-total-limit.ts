/**
 * @abdd.meta
 * path: .pi/lib/adaptive-total-limit.ts
 * role: LLM並列数の動的制御と状態永続化
 * why: APIレート制限やタイムアウト等の過去の観測結果に基づき、システム負荷と安定性を最適化するため
 * related: .pi/lib/runtime-config.js, .pi/lib/storage-lock.js
 * public_api: recordObservation, getCurrentLimit, getHardLimit
 * invariants: learnedLimitはminLimit以上hardMax以下、samplesは最新の順に保持、状態更新はファイルロック内で実行
 * side_effects: ファイルシステム(.pi/runtime/adaptive-total-limit.json)への書き込み
 * failure_modes: ファイル書き込み失敗時は状態更新をスキップし永続化フラグを無効化
 * @abdd.explain
 * overview: 観測データ（成功、レート制限、エラー等）を収集・分析し、LLMの同時実行数を動的に調整するモジュール。
 * what_it_does:
 *   - 観測サンプルを蓄積し、一定間隔またはサンプル数に基づいて制限値を再計算する
 *   - 再計算結果をJSONファイルに永続化し、プロセス再起動後に状態を復元する
 *   - 環境変数または設定に基づき、制限値の下限・上限を動的に解決する
 * why_it_exists:
 *   - 固定の制限値では過負荷によるエラー増加や、過小設定によるスループット低下を防げないため
 *   - 履歴に基づいた適応的な制御により、安定性と効率のバランスを維持するため
 * scope:
 *   in: 環境変数、実行設定、観測結果
 *   out: 現在の制限値、状態ファイル
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getRuntimeConfig } from "./runtime-config.js";
import { withFileLock } from "./storage/storage-lock.js";

type ObservationKind = "success" | "rate_limit" | "timeout" | "error";

/**
 * 制限値の観測データインターフェース
 * @summary 観測データ定義
 */
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
    // Recover slowly toward base limit when there is no recent pressure signal.
    const hasRecentPressure = samples.some((sample) => sample.kind === "rate_limit" || sample.kind === "timeout");
    if (!hasRecentPressure && state.learnedLimit < state.baseLimit) {
      return {
        next: clamp(state.learnedLimit + 1, state.minLimit, state.hardMax),
        reason: "insufficient_samples_recover",
        cooldownMs: DECISION_COOLDOWN_MS,
      };
    }
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

/**
 * 制限値の観測データを記録
 * @summary 観測データを記録
 * @param {TotalLimitObservation} observation - 観測データ（種別、レイテンシ等）
 * @param {number} [baseLimit] - 基準となる制限値（省略可）
 * @returns {void}
 */
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

/**
 * 適応制限の最大値を取得
 * @summary 適応制限最大値取得
 * @param {number} baseLimit - 基準となる制限値
 * @returns {number} 適応制御された最大LLM数
 */
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

/**
 * 現在の適応制限スナップショットを取得
 * @summary 適応制限スナップショット取得
 * @returns {enabled: boolean, baseLimit: number, learnedLimit: number, hardMax: number, minLimit: number, sampleCount: number, lastReason: string} 現在の適応制限設定と状態
 */
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

/**
 * Adaptive total limit state をリセットする。
 * @summary 学習状態リセット
 * @returns リセット後のスナップショット
 */
export function resetAdaptiveTotalLimitState(): {
  enabled: boolean;
  baseLimit: number;
  learnedLimit: number;
  hardMax: number;
  minLimit: number;
  sampleCount: number;
  lastReason: string;
} {
  const enabled = isAdaptiveEnabled();
  const baseLimit = getDefaultBaseLimit();
  const fresh = createDefaultState(baseLimit);
  withStateWriteLock((state) => {
    state.version = fresh.version;
    state.lastUpdated = fresh.lastUpdated;
    state.baseLimit = fresh.baseLimit;
    state.learnedLimit = fresh.learnedLimit;
    state.hardMax = fresh.hardMax;
    state.minLimit = fresh.minLimit;
    state.lastDecisionAtMs = fresh.lastDecisionAtMs;
    state.cooldownUntilMs = fresh.cooldownUntilMs;
    state.lastReason = "manual_reset";
    state.samples = [];
  });
  const next = loadState();
  return {
    enabled,
    baseLimit: next.baseLimit,
    learnedLimit: next.learnedLimit,
    hardMax: next.hardMax,
    minLimit: next.minLimit,
    sampleCount: next.samples.length,
    lastReason: next.lastReason,
  };
}

// test helper
/**
 * 適応制限状態リセット
 * @summary 状態をリセット
 * @returns なし
 */
export function __resetAdaptiveTotalLimitStateForTests(): void {
  stateCache = null;
  persistenceFailed = false;
}

// test helper
/**
 * テスト用現在時刻設定
 * @summary 現在時刻を設定
 * @param provider 時間提供関数
 * @returns なし
 */
export function __setAdaptiveTotalLimitNowProviderForTests(provider?: () => number): void {
  adaptiveNowProvider = provider ?? (() => Date.now());
}
