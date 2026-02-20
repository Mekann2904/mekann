/**
 * @abdd.meta
 * path: .pi/lib/adaptive-rate-controller.ts
 * role: APIレートリミット動的制御と学習エンジン
 * why: 429エラー発生時の自動的な同時実行数調整と、過去のエラー履歴に基づく予測的スケジューリングを行うため
 * related: runtime-config.ts, provider-limits.ts, cross-instance-coordinator.ts
 * public_api: LearnedLimit, AdaptiveControllerState, RateLimitEvent
 * invariants: concurrencyはoriginalConcurrency以下、recoveryFactorは1以上、reductionFactorは1未満、versionは正の整数
 * side_effects: ファイルシステムへの状態保存、RuntimeConfigの参照、同時実行制限値の動的書き換え
 * failure_modes: ディスクI/O失敗時の状態不整合、クロック精度による予測ズレ、急激な負荷変動への遅延追従
 * @abdd.explain
 * overview: 429エラーを検知して即座に同時実行数を削減し、その後時間をかけて制限値を段階的に回復させる。さらに履歴データを蓄積し、将来のエラー発生確率を予測して能動的なスロットリングを行う。
 * what_it_does:
 *   - プロバイダ/モデルごとの学習済み制限値を管理する
 *   - 429エラー発生時に制限値を30%（reductionFactor）削減する
 *   - 成功リクエストに基づき、設定した間隔で制限値を回復させる
 *   - 過去の429タイムスタンプを解析し、エラー確率と推奨並列数を算出する
 * why_it_exists:
 *   - プリセット固定値だけでは追従できない動的なAPI制限に対応するため
 *   - 429エラーによるサービス停止リスクを最小限に抑えるため
 *   - ヒューリスティックな予測によりリソース利用効率を最大化するため
 * scope:
 *   in: 429またはSuccessイベント、RuntimeConfig
 *   out: 更新されたLearnedLimit、プロアクティブな制御指示
 */

/**
 * Adaptive Rate Controller
 *
 * Learns from rate limit errors (429) and adjusts concurrency limits dynamically.
 * Works in conjunction with provider-limits.ts (presets) and cross-instance-coordinator.ts.
 *
 * Algorithm:
 * 1. Start with preset limits from provider-limits
 * 2. On 429 error, reduce limit by 30%
 * 3. After recovery period (5 min), gradually restore limit
 * 4. Track per provider/model for granular control
 * 5. NEW: Predictive scheduling based on historical patterns
 *
 * Configuration:
 * Uses centralized RuntimeConfig from runtime-config.ts for consistency.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";
import { withFileLock } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 学習された同時実行制限と状態を保持
 * @summary 同時実行制限状態取得
 * @param concurrency 現在の学習された同時実行制限
 * @param originalConcurrency 回復用の元の制限値
 * @param last429At 直近の429エラーのタイムスタンプ
 * @param consecutive429Count 連続した429エラーの数
 * @param total429Count このモデルの総429エラー数
 * @param lastSuccessAt 直近の成功リクエストのタイムスタンプ
 * @param recoveryScheduled 回復スケジュール済みフラグ
 * @param modelNotes モデル固有のメモ
 * @returns LearnedLimit オブジェクト
 */
export interface LearnedLimit {
  /** Current learned concurrency limit */
  concurrency: number;
  /** Original preset limit (for recovery) */
  originalConcurrency: number;
  /** Last 429 error timestamp */
  last429At: string | null;
  /** Number of consecutive 429 errors */
  consecutive429Count: number;
  /** Total 429 errors for this model */
  total429Count: number;
  /** Last successful request timestamp */
  lastSuccessAt: string | null;
  /** Recovery scheduled flag */
  recoveryScheduled: boolean;
  /** Model-specific notes */
  notes?: string;
  /** Predictive: historical 429 timestamps for pattern analysis */
  historical429s?: string[];
  /** Predictive: estimated 429 probability (0-1) */
  predicted429Probability?: number;
  /** Predictive: suggested ramp-up schedule */
  rampUpSchedule?: number[];
}

/**
 * @summary レート制御状態
 * 適応的レート制御の状態
 * @param version バージョン
 * @param lastUpdated 最終更新日時
 * @param limits 学習された制限値（プロバイダ:モデル別）
 * @param globalMultiplier 全体倍率（すべての制限に適用）
 * @param recoveryIntervalMs 回復間隔（ミリ秒）
 * @param reductionFactor 429発生時の低減係数（0.7 = 30%減）
 * @param recoveryFactor 回復係数（1.1 = 回復ごとに10%増）
 * @param predictiveEnabled 予測的スロットリングの有効化
 */
export interface AdaptiveControllerState {
  version: number;
  lastUpdated: string;
  limits: {
    [key: string]: LearnedLimit; // "provider:model"
  };
  /** Global multiplier (applied to all limits) */
  globalMultiplier: number;
  /** Recovery interval in ms */
  recoveryIntervalMs: number;
  /** Reduction factor on 429 (0.7 = 30% reduction) */
  reductionFactor: number;
  /** Recovery factor (1.1 = 10% increase per recovery) */
  recoveryFactor: number;
  /** Predictive: enable proactive throttling */
  predictiveEnabled: boolean;
  /** Predictive: threshold for proactive action */
  predictiveThreshold: number;
}

/**
 * レート制限イベント
 * @summary レート制限イベント
 * @param provider - APIプロバイダー名
 * @param model - 使用されたモデル名
 * @param type - イベントタイプ（"429" | "success" | "timeout" | "error"）
 * @param timestamp - イベント発生時のタイムスタンプ
 * @param details - イベントの追加詳細情報
 */
export interface RateLimitEvent {
  provider: string;
  model: string;
  type: "429" | "success" | "timeout" | "error";
  timestamp: string;
  details?: string;
}

/**
 * 予測分析結果を保持
 * @summary 分析結果を保持
 * @param provider - APIプロバイダー名
 * @param model - 使用されたモデル名
 * @param predicted429Probability - 429エラーの予測確率
 * @param shouldProactivelyThrottle - 能動的なスロットリングが必要かどうか
 * @param recommendedConcurrency - 推奨される並列数
 * @param nextRiskWindow - 次のリスクが予測される時間枠（オプション）
 * @param confidence - 予測の信頼度
 */
export interface PredictiveAnalysis {
  provider: string;
  model: string;
  predicted429Probability: number;
  shouldProactivelyThrottle: boolean;
  recommendedConcurrency: number;
  nextRiskWindow?: { start: Date; end: Date };
  confidence: number;
}

// ============================================================================
// Constants
// ============================================================================

const RUNTIME_DIR = join(homedir(), ".pi", "runtime");
const STATE_FILE = join(RUNTIME_DIR, "adaptive-limits.json");

/**
 * Get default state from centralized RuntimeConfig.
 */
function getDefaultState(): AdaptiveControllerState {
  const config = getRuntimeConfig();
  return {
    version: 2,
    lastUpdated: new Date().toISOString(),
    limits: {},
    globalMultiplier: 1.0,
    recoveryIntervalMs: config.recoveryIntervalMs,
    reductionFactor: config.reductionFactor,
    recoveryFactor: config.recoveryFactor,
    predictiveEnabled: config.predictiveEnabled,
    predictiveThreshold: 0.15, // Proactively throttle if >15% 429 probability (reduced from 0.3)
  };
}

/**
 * Legacy constant for migration purposes.
 * @deprecated Use getDefaultState() instead.
 */
const DEFAULT_STATE: AdaptiveControllerState = {
  version: 2,
  lastUpdated: new Date().toISOString(),
  limits: {},
  globalMultiplier: 1.0,
  recoveryIntervalMs: 2 * 60 * 1000, // 2 minutes
  reductionFactor: 0.5, // 50% reduction on 429
  recoveryFactor: 1.05, // 5% increase per recovery
  predictiveEnabled: true,
  predictiveThreshold: 0.15, // Proactively throttle if >15% 429 probability
};

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const RECOVERY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const STATE_LOCK_OPTIONS = {
  maxWaitMs: 2_000,
  pollMs: 25,
  staleMs: 15_000,
};

// ============================================================================
// State
// ============================================================================

let state: AdaptiveControllerState | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let persistenceFailed = false;

// ============================================================================
// Utilities
// ============================================================================

function buildKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

function loadState(): AdaptiveControllerState {
  if (state && persistenceFailed) {
    return state;
  }

  const defaults = getDefaultState();

  try {
    if (existsSync(STATE_FILE)) {
      const content = readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object" && parsed.version) {
        return {
          ...defaults,
          ...parsed,
          // Ensure new config values are used if not in file
          recoveryIntervalMs: defaults.recoveryIntervalMs,
          reductionFactor: defaults.reductionFactor,
          recoveryFactor: defaults.recoveryFactor,
          predictiveEnabled: parsed.predictiveEnabled ?? defaults.predictiveEnabled,
        } as AdaptiveControllerState;
      }
    }
  } catch (error) {
    // ignore
  }
  return { ...defaults };
}

function saveState(): void {
  if (!state) return;

  try {
    if (!existsSync(RUNTIME_DIR)) {
      mkdirSync(RUNTIME_DIR, { recursive: true });
    }

    state.lastUpdated = new Date().toISOString();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    persistenceFailed = false;
  } catch {
    // Keep adaptive throttling alive even if persistence is unavailable.
    persistenceFailed = true;
  }
}

function ensureState(): AdaptiveControllerState {
  if (!state) {
    state = loadState();
  }
  return state;
}

function withStateWriteLock<T>(mutator: (draft: AdaptiveControllerState) => T): T {
  try {
    return withFileLock(STATE_FILE, () => {
      const draft = loadState();
      state = draft;
      const result = mutator(draft);
      saveState();
      return result;
    }, STATE_LOCK_OPTIONS);
  } catch {
    // Locking is best-effort. Fall back to local mutation so restricted
    // environments (tests/sandbox) keep working.
    const draft = loadState();
    state = draft;
    const result = mutator(draft);
    saveState();
    return result;
  }
}

function clampConcurrency(value: number): number {
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.floor(value)));
}

function scheduleRecovery(provider: string, model: string): void {
  if (!state) return;

  const key = buildKey(provider, model);
  const limit = state.limits[key];
  if (!limit) return;

  // Already at or above original, no recovery needed
  if (limit.concurrency >= limit.originalConcurrency) {
    limit.recoveryScheduled = false;
    return;
  }

  limit.recoveryScheduled = true;
}

function processRecovery(): void {
  withStateWriteLock((currentState) => {
    let changed = false;

    const now = Date.now();
    const recoveryIntervalMs = currentState.recoveryIntervalMs;

    for (const [, limit] of Object.entries(currentState.limits)) {
      // Skip if not scheduled for recovery
      if (!limit.recoveryScheduled) continue;

      // Skip if below original
      if (limit.concurrency >= limit.originalConcurrency) {
        limit.recoveryScheduled = false;
        continue;
      }

      // Check if enough time has passed since last 429
      const last429 = limit.last429At ? new Date(limit.last429At).getTime() : 0;
      if (now - last429 < recoveryIntervalMs) {
        continue;
      }

      // Check if we've had recent successes
      const lastSuccess = limit.lastSuccessAt ? new Date(limit.lastSuccessAt).getTime() : 0;
      if (now - lastSuccess > recoveryIntervalMs) {
        // No recent success, wait more
        continue;
      }

      // Apply recovery
      const newConcurrency = clampConcurrency(
        Math.ceil(limit.concurrency * currentState.recoveryFactor)
      );

      if (newConcurrency > limit.concurrency) {
        limit.concurrency = newConcurrency;
        changed = true;

        // Check if fully recovered
        if (limit.concurrency >= limit.originalConcurrency) {
          limit.concurrency = limit.originalConcurrency;
          limit.recoveryScheduled = false;
          limit.consecutive429Count = 0;
        }
      }
    }

    if (!changed) {
      // Keep the fast path cheap when no update was needed.
      return;
    }
  });
}

// ============================================================================
// Public API
// ============================================================================

 /**
  * アダプティブコントローラーを初期化する。
  * @returns {void} 戻り値なし
  */
export function initAdaptiveController(): void {
  if (state) return;

  state = loadState();

  // Start recovery timer
  if (!recoveryTimer) {
    recoveryTimer = setInterval(() => {
      processRecovery();
    }, RECOVERY_CHECK_INTERVAL_MS);
    recoveryTimer.unref();
  }
}

/**
 * コントローラーをシャットダウン
 * @summary シャットダウン
 */
export function shutdownAdaptiveController(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  state = null;
  persistenceFailed = false;
}

/**
 * プロバイダーとモデルの有効な同時実行制限を取得
 * @summary 制限値取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @param presetLimit 事前設定された制限値
 * @returns 有効な制限値
 */
export function getEffectiveLimit(
  provider: string,
  model: string,
  presetLimit: number
): number {
  const currentState = ensureState();
  const key = buildKey(provider, model);

  // Check if we have a learned limit
  const learned = currentState.limits[key];
  if (learned) {
    // Apply global multiplier
    const adjusted = Math.floor(learned.concurrency * currentState.globalMultiplier);
    return clampConcurrency(adjusted);
  }

  // Create initial entry with preset atomically to avoid lost updates across instances.
  return withStateWriteLock((draft) => {
    if (!draft.limits[key]) {
      draft.limits[key] = {
        concurrency: presetLimit,
        originalConcurrency: presetLimit,
        last429At: null,
        consecutive429Count: 0,
        total429Count: 0,
        lastSuccessAt: null,
        recoveryScheduled: false,
      };
    }
    return clampConcurrency(Math.floor(draft.limits[key].concurrency * draft.globalMultiplier));
  });
}

/**
 * レート制限イベントを記録
 * @summary イベント記録
 * @param event レート制限イベント
 */
export function recordEvent(event: RateLimitEvent): void {
  withStateWriteLock((currentState) => {
    const key = buildKey(event.provider, event.model);

    // Ensure entry exists
    if (!currentState.limits[key]) {
      currentState.limits[key] = {
        concurrency: 4, // Default, will be updated
        originalConcurrency: 4,
        last429At: null,
        consecutive429Count: 0,
        total429Count: 0,
        lastSuccessAt: null,
        recoveryScheduled: false,
      };
    }

    const limit = currentState.limits[key];

    switch (event.type) {
      case "429": {
        // Reduce concurrency aggressively
        const newConcurrency = clampConcurrency(
          Math.floor(limit.concurrency * currentState.reductionFactor)
        );
        limit.concurrency = newConcurrency;
        limit.last429At = event.timestamp;
        limit.consecutive429Count += 1;
        limit.total429Count += 1;
        limit.recoveryScheduled = false; // Reset recovery on new 429

        // Update historical data for predictive analysis
        updateHistorical429s(limit, event.provider, event.model);

        // If multiple consecutive 429s, be more aggressive
        if (limit.consecutive429Count >= 3) {
          // 3回以上連続429の場合、さらに50%削減
          limit.concurrency = clampConcurrency(Math.floor(limit.concurrency * 0.5));
        }
        if (limit.consecutive429Count >= 5) {
          // 5回以上連続429の場合、最小値に
          limit.concurrency = MIN_CONCURRENCY;
        }

        break;
      }

      case "success": {
        limit.lastSuccessAt = event.timestamp;
        // Reset consecutive count on success
        limit.consecutive429Count = 0;

        // Schedule recovery if below original
        if (limit.concurrency < limit.originalConcurrency) {
          scheduleRecovery(event.provider, event.model);
        }
        break;
      }

      case "timeout": {
        // Timeout might indicate rate limiting without explicit 429
        // Be conservative
        if (limit.consecutive429Count > 0) {
          limit.concurrency = clampConcurrency(
            Math.floor(limit.concurrency * 0.9)
          );
        }
        break;
      }

      case "error": {
        // Non-rate-limit errors don't affect limits
        break;
      }
    }
  });
}

/**
 * 429エラーを記録
 * @summary 429エラー記録
 * @param provider プロバイダ名
 * @param model モデル名
 * @param details 詳細情報
 */
export function record429(provider: string, model: string, details?: string): void {
  recordEvent({
    provider,
    model,
    type: "429",
    timestamp: new Date().toISOString(),
    details,
  });
}

/**
 * 成功を記録
 * @summary 成功を記録
 * @param provider プロバイダ名
 * @param model モデル名
 */
export function recordSuccess(provider: string, model: string): void {
  recordEvent({
    provider,
    model,
    type: "success",
    timestamp: new Date().toISOString(),
  });
}

/**
 * 適応制御の状態を取得する
 * @summary 状態取得
 * @returns {AdaptiveControllerState} 現在の状態オブジェクト
 */
export function getAdaptiveState(): AdaptiveControllerState {
  return { ...ensureState() };
}

/**
 * 学習した制限を取得する
 * @summary 制限取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns {LearnedLimit | undefined} 学習した制限オブジェクト
 */
export function getLearnedLimit(provider: string, model: string): LearnedLimit | undefined {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  return currentState.limits[key] ? { ...currentState.limits[key] } : undefined;
}

/**
 * 学習した制限をリセットする
 * @summary 制限リセット
 * @param provider プロバイダ名
 * @param model モデル名
 * @param {number} [newLimit] 新しい制限値（任意）
 * @returns {void}
 */
export function resetLearnedLimit(provider: string, model: string, newLimit?: number): void {
  withStateWriteLock((currentState) => {
    const key = buildKey(provider, model);
    if (!currentState.limits[key]) return;
    const limit = newLimit ?? currentState.limits[key].originalConcurrency;
    currentState.limits[key] = {
      concurrency: limit,
      originalConcurrency: limit,
      last429At: null,
      consecutive429Count: 0,
      total429Count: 0,
      lastSuccessAt: null,
      recoveryScheduled: false,
    };
  });
}

/**
 * 全ての学習制限をリセットする
 * @summary 全制限リセット
 * @returns {void}
 */
export function resetAllLearnedLimits(): void {
  withStateWriteLock((currentState) => {
    currentState.limits = {};
    currentState.globalMultiplier = 1.0;
  });
}

/**
 * グローバル乗数を設定する
 * @summary グローバル乗数設定
 * @param multiplier 設定する乗数
 * @returns {void}
 */
export function setGlobalMultiplier(multiplier: number): void {
  withStateWriteLock((currentState) => {
    // NaN ガード: NaNの場合は1.0（デフォルト）に設定
    const safeMultiplier = Number.isFinite(multiplier) ? multiplier : 1.0;
    currentState.globalMultiplier = Math.max(0.1, Math.min(2.0, safeMultiplier));
  });
}

/**
 * 復元パラメータを設定
 * @summary 復元パラメータを設定
 * @param options 設定オプション
 * @param options.recoveryIntervalMs 復元間隔（ミリ秒）
 * @param options.reductionFactor 低減係数
 * @param options.recoveryFactor 復元係数
 * @returns なし
 */
export function configureRecovery(options: {
  recoveryIntervalMs?: number;
  reductionFactor?: number;
  recoveryFactor?: number;
}): void {
  withStateWriteLock((currentState) => {
    if (options.recoveryIntervalMs !== undefined) {
      currentState.recoveryIntervalMs = Math.max(60_000, options.recoveryIntervalMs);
    }
    if (options.reductionFactor !== undefined) {
      currentState.reductionFactor = Math.max(0.3, Math.min(0.9, options.reductionFactor));
    }
    if (options.recoveryFactor !== undefined) {
      currentState.recoveryFactor = Math.max(1.0, Math.min(1.5, options.recoveryFactor));
    }
  });
}

/**
 * レート制限エラー判定
 * @summary レート制限エラー判定
 * @param error エラーオブジェクト
 * @returns レート制限エラーの場合true
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  let message: string;
  try {
    message = String(error).toLowerCase();
  } catch {
    return false;
  }
  const indicators = [
    "429",
    "rate limit",
    "too many requests",
    "quota exceeded",
    "rate_limit",
    "ratelimit",
    "requests per",
    "tokens per",
    "capacity exceeded",
    "throttl",
  ];

  return indicators.some((indicator) => message.includes(indicator));
}

/**
 * 適応サマリーを整形
 * @summary 適応サマリーを整形
 * @returns 整形されたサマリー文字列
 */
export function formatAdaptiveSummary(): string {
  const currentState = ensureState();
  const lines: string[] = [
    `Adaptive Rate Controller`,
    `========================`,
    ``,
    `Global Multiplier: ${currentState.globalMultiplier.toFixed(2)}`,
    `Recovery Interval: ${Math.round(currentState.recoveryIntervalMs / 1000)}s`,
    `Reduction Factor: ${currentState.reductionFactor.toFixed(2)}`,
    `Recovery Factor: ${currentState.recoveryFactor.toFixed(2)}`,
    `Predictive: ${currentState.predictiveEnabled ? "enabled" : "disabled"} (threshold: ${currentState.predictiveThreshold})`,
    ``,
    `Learned Limits:`,
  ];

  if (Object.keys(currentState.limits).length === 0) {
    lines.push(`  (none yet)`);
  } else {
    for (const [key, limit] of Object.entries(currentState.limits)) {
      const status =
        limit.concurrency < limit.originalConcurrency
          ? `REDUCED (${limit.concurrency}/${limit.originalConcurrency})`
          : `OK (${limit.concurrency})`;
      const recent429 = limit.last429At
        ? `last429: ${Math.round((Date.now() - new Date(limit.last429At).getTime()) / 1000)}s ago`
        : "no 429";
      const prediction = limit.predicted429Probability
        ? `, 429_prob: ${(limit.predicted429Probability * 100).toFixed(1)}%`
        : "";
      lines.push(`  ${key}: ${status}, ${recent429}, total: ${limit.total429Count}${prediction}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Predictive Scheduling
// ============================================================================

/**
 * 429確率を分析
 * @summary 429確率を分析
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns 429エラーの確率
 */
export function analyze429Probability(provider: string, model: string): number {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  const limit = currentState.limits[key];

  if (!limit || !limit.historical429s || limit.historical429s.length === 0) {
    return 0;
  }

  const now = Date.now();
  const recentWindowMs = 10 * 60 * 1000; // 10 minutes
  const mediumWindowMs = 30 * 60 * 1000; // 30 minutes
  const hourWindowMs = 60 * 60 * 1000; // 1 hour

  let recentCount = 0;
  let mediumCount = 0;
  let hourCount = 0;

  for (const timestamp of limit.historical429s) {
    const time = new Date(timestamp).getTime();
    const age = now - time;

    if (age < recentWindowMs) recentCount++;
    if (age < mediumWindowMs) mediumCount++;
    if (age < hourWindowMs) hourCount++;
  }

  // Weighted probability calculation
  // Recent 429s have higher weight
  const recentWeight = recentCount * 0.4;
  const mediumWeight = mediumCount * 0.15;
  const hourWeight = hourCount * 0.05;

  // Also consider consecutive 429s
  const consecutiveWeight = limit.consecutive429Count * 0.2;

  // Calculate base probability
  const probability = recentWeight + mediumWeight + hourWeight + consecutiveWeight;

  // Cap at 1.0
  return Math.min(1.0, probability);
}

/**
 * 予測分析を取得
 * @summary 予測分析を取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns 予測分析結果
 */
export function getPredictiveAnalysis(provider: string, model: string): PredictiveAnalysis {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  const limit = currentState.limits[key];

  const probability = analyze429Probability(provider, model);
  const shouldProactivelyThrottle =
    currentState.predictiveEnabled &&
    probability > currentState.predictiveThreshold;

  // Calculate recommended concurrency
  let recommendedConcurrency = limit?.concurrency ?? 4;

  if (shouldProactivelyThrottle) {
    // Reduce concurrency proportionally to probability
    const reductionFactor = 1 - probability * 0.5; // Up to 50% reduction
    recommendedConcurrency = Math.floor(recommendedConcurrency * reductionFactor);
    recommendedConcurrency = Math.max(1, recommendedConcurrency);
  }

  // Determine next risk window based on historical patterns
  let nextRiskWindow: { start: Date; end: Date } | undefined;
  if (limit?.historical429s && limit.historical429s.length >= 3) {
    // Find time intervals between 429s
    const timestamps = limit.historical429s
      .map((t) => new Date(t).getTime())
      .sort((a, b) => a - b);

    if (timestamps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(timestamps[i] - timestamps[i - 1]);
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

      // Predict next risk window
      const last429Time = timestamps[timestamps.length - 1];
      const nextPredicted429 = last429Time + avgInterval;

      nextRiskWindow = {
        start: new Date(nextPredicted429 - avgInterval * 0.2),
        end: new Date(nextPredicted429 + avgInterval * 0.2),
      };
    }
  }

  // Calculate confidence based on data availability
  const dataPoints = limit?.historical429s?.length ?? 0;
  const confidence = Math.min(1.0, dataPoints / 10); // Full confidence at 10+ data points

  return {
    provider,
    model,
    predicted429Probability: probability,
    shouldProactivelyThrottle,
    recommendedConcurrency,
    nextRiskWindow,
    confidence,
  };
}

/**
 * スロットル要否判定
 * @summary 先制的スロットル判定
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns スロットルすべきか
 */
export function shouldProactivelyThrottle(provider: string, model: string): boolean {
  const analysis = getPredictiveAnalysis(provider, model);
  return analysis.shouldProactivelyThrottle;
}

/**
 * 予測並列数を取得
 * @summary 推奨並列数を取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @param currentConcurrency 現在の並列数
 * @returns 推奨並列数
 */
export function getPredictiveConcurrency(
  provider: string,
  model: string,
  currentConcurrency: number
): number {
  const analysis = getPredictiveAnalysis(provider, model);

  if (analysis.shouldProactivelyThrottle) {
    return Math.min(currentConcurrency, analysis.recommendedConcurrency);
  }

  return currentConcurrency;
}

/**
 * Update historical 429 data (called on 429 events).
 * @param limit - Learned limit object to update
 * @param provider - Provider name for probability analysis
 * @param model - Model name for probability analysis
 */
function updateHistorical429s(limit: LearnedLimit, provider: string, model: string): void {
  if (!limit.historical429s) {
    limit.historical429s = [];
  }

  limit.historical429s.push(new Date().toISOString());

  // Keep only last 50 entries to prevent unbounded growth
  if (limit.historical429s.length > 50) {
    limit.historical429s = limit.historical429s.slice(-50);
  }

  // Update predicted probability with correct provider/model
  limit.predicted429Probability = analyze429Probability(provider, model);
}

/**
 * 予測機能の有効化
 * @summary 予測機能を有効化
 * @param enabled 有効化するか
 * @returns なし
 */
export function setPredictiveEnabled(enabled: boolean): void {
  withStateWriteLock((currentState) => {
    currentState.predictiveEnabled = enabled;
  });
}

/**
 * 予測閾値を設定
 * @summary 予測閾値を設定
 * @param threshold 設定する閾値
 * @returns なし
 */
export function setPredictiveThreshold(threshold: number): void {
  withStateWriteLock((currentState) => {
    currentState.predictiveThreshold = Math.max(0, Math.min(1, threshold));
  });
}

// ============================================================================
// Dynamic Parallelism Integration
// ============================================================================

/**
 * スケジューラ対応制限取得
 * @summary 同時実行制限を取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @param baseLimit 基本制限値
 * @returns 計算された制限値
 */
export function getSchedulerAwareLimit(
  provider: string,
  model: string,
  baseLimit?: number
): number {
  // Get the effective limit from adaptive controller
  const effectiveLimit = getEffectiveLimit(provider, model, baseLimit ?? 4);

  // Apply predictive throttling
  const predictiveLimit = getPredictiveConcurrency(provider, model, effectiveLimit);

  return predictiveLimit;
}

/**
 * スケジューラに429エラーを通知する
 * @summary 429エラー通知
 * @param provider プロバイダ名
 * @param model モデル名
 * @param details 詳細情報（任意）
 * @returns なし
 */
export function notifyScheduler429(
  provider: string,
  model: string,
  details?: string
): void {
  record429(provider, model, details);

  // Also update dynamic parallelism adjuster
  try {
    // Lazy import to avoid circular dependency
    const { adjustForError } = require("./dynamic-parallelism");
    adjustForError(provider, model, "429");
  } catch {
    // Ignore if dynamic-parallelism module not available
  }
}

/**
 * スケジューラにタイムアウトを通知する
 * @summary タイムアウト通知
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns なし
 */
export function notifySchedulerTimeout(provider: string, model: string): void {
  recordEvent({
    provider,
    model,
    type: "timeout",
    timestamp: new Date().toISOString(),
  });

  // Also update dynamic parallelism adjuster
  try {
    const { adjustForError } = require("./dynamic-parallelism");
    adjustForError(provider, model, "timeout");
  } catch {
    // Ignore if dynamic-parallelism module not available
  }
}

/**
 * スケジューラに成功を通知する
 * @summary 成功通知
 * @param provider プロバイダ名
 * @param model モデル名
 * @param responseMs レスポンス時間（任意）
 * @returns なし
 */
export function notifySchedulerSuccess(
  provider: string,
  model: string,
  responseMs?: number
): void {
  recordSuccess(provider, model);

  // Also update dynamic parallelism adjuster
  if (responseMs) {
    try {
      const { getParallelismAdjuster } = require("./dynamic-parallelism");
      const adjuster = getParallelismAdjuster();
      adjuster.recordSuccess(provider, model, responseMs);
      adjuster.attemptRecovery(provider, model);
    } catch {
      // Ignore if dynamic-parallelism module not available
    }
  }
}

/**
 * レート制限の統合サマリを取得する
 * @summary 統合制限サマリ取得
 * @param provider プロバイダ名
 * @param model モデル名
 * @returns 適応制限、元制限、予測制限、429確率、スロットルフラグ、429回数
 */
export function getCombinedRateControlSummary(
  provider: string,
  model: string
): {
  adaptiveLimit: number;
  originalLimit: number;
  predictiveLimit: number;
  predicted429Probability: number;
  shouldThrottle: boolean;
  recent429Count: number;
} {
  const learnedLimit = getLearnedLimit(provider, model);
  const analysis = getPredictiveAnalysis(provider, model);

  return {
    adaptiveLimit: learnedLimit?.concurrency ?? 4,
    originalLimit: learnedLimit?.originalConcurrency ?? 4,
    predictiveLimit: analysis.recommendedConcurrency,
    predicted429Probability: analysis.predicted429Probability,
    shouldThrottle: analysis.shouldProactivelyThrottle,
    recent429Count: learnedLimit?.total429Count ?? 0,
  };
}
