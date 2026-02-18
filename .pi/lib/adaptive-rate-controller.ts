/**
 * @abdd.meta
 * path: .pi/lib/adaptive-rate-controller.ts
 * role: 429エラーから学習し、プロバイダー/モデル別の同時実行制限を動的に調整する適応的レート制御マネージャー
 * why: 静的なレート制限プリセットだけでは対応できない動的なAPI利用制限に対処し、429エラーの発生を最小限に抑えつつスループットを最適化するため
 * related: provider-limits.ts, cross-instance-coordinator.ts, runtime-config.ts
 * public_api: LearnedLimit, AdaptiveControllerState, RateLimitEvent
 * invariants:
 *   - concurrency は元の制限値(originalConcurrency)を超えない
 *   - reductionFactor は0.7で固定（429発生時に30%削減）
 *   - recoveryFactor は1.1で固定（回復ごとに10%増加）
 *   - recoveryIntervalMs は5分間で回復処理を実行
 * side_effects:
 *   - ファイルシステムへの状態読み書き（学習データの永続化）
 *   - 内部タイマーによる回復スケジューリング
 * failure_modes:
 *   - 状態ファイルの読み書き失敗時はデフォルト値で動作
 *   - 連続429エラー発生時は制限を段階的に削減
 * @abdd.explain
 * overview: APIプロバイダーからの429エラーを学習し、プロバイダー/モデル単位で同時実行制限を動的に調整する。予測的スロットリング機能により、履歴パターンに基づく先制制御も行う。
 * what_it_does:
 *   - 429エラー検知時に該当プロバイダー/モデルの同時実行制限を30%削減
 *   - 5分間の回復期間後に制限を段階的に元の値へ復元
 *   - プロバイダー:モデル単位で学習状態を管理
 *   - 過去の429エラー履歴から将来のリスクを予測し、先制的にスロットリング
 *   - 学習状態をファイルへ永続化し、プロセス再起動後も維持
 * why_it_exists:
 *   - 静的なプリセット制限では実際のAPIレート制限に追従できない
 *   - 手動調整では複数プロバイダー/モデルの個別最適化が困難
 *   - クロスインスタンス間での制限調整が必要
 * scope:
 *   in: プロバイダー名、モデル名、イベントタイプ（429/success/timeout/error）
 *   out: 調整後の同時実行制限値、予測的スロットリング推奨値
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

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getRuntimeConfig,
  type RuntimeConfig,
} from "./runtime-config.js";

// ============================================================================
// Types
// ============================================================================

 /**
  * 学習された同時実行制限と状態
  * @param concurrency 現在の学習された同時実行制限
  * @param originalConcurrency 回復用の元の制限値
  * @param last429At 直近の429エラーのタイムスタンプ
  * @param consecutive429Count 連続した429エラーの数
  * @param total429Count このモデルの総429エラー数
  * @param lastSuccessAt 直近の成功リクエストのタイムスタンプ
  * @param recoveryScheduled 回復スケジュール済みフラグ
  * @param modelNotes モデル固有のメモ
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
  * レート制限イベントを表す
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
  * 予測分析の結果を表すインターフェース
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
    predictiveThreshold: 0.3, // Proactively throttle if >30% 429 probability
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
  recoveryIntervalMs: 5 * 60 * 1000, // 5 minutes
  reductionFactor: 0.7, // 30% reduction on 429
  recoveryFactor: 1.1, // 10% increase per recovery
  predictiveEnabled: true,
  predictiveThreshold: 0.3, // Proactively throttle if >30% 429 probability
};

const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 16;

const RECOVERY_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

// ============================================================================
// State
// ============================================================================

let state: AdaptiveControllerState | null = null;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Utilities
// ============================================================================

function buildKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}:${model.toLowerCase()}`;
}

function loadState(): AdaptiveControllerState {
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

  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }

  state.lastUpdated = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureState(): AdaptiveControllerState {
  if (!state) {
    state = loadState();
  }
  return state;
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
  saveState();
}

function processRecovery(): void {
  const currentState = ensureState();
  let changed = false;

  const now = Date.now();
  const recoveryIntervalMs = currentState.recoveryIntervalMs;

  for (const [key, limit] of Object.entries(currentState.limits)) {
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

  if (changed) {
    saveState();
  }
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
  * アダプティブコントローラーをシャットダウンする。
  * @returns なし
  */
export function shutdownAdaptiveController(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
  state = null;
}

 /**
  * プロバイダーとモデルの有効な同時実行制限を取得
  * @param provider - プロバイダー名（例: "anthropic"）
  * @param model - モデル名（例: "claude-sonnet-4"）
  * @param presetLimit - プロバイダー制限からのプリセット制限値
  * @returns 有効な同時実行制限
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

  // Create initial entry with preset
  currentState.limits[key] = {
    concurrency: presetLimit,
    originalConcurrency: presetLimit,
    last429At: null,
    consecutive429Count: 0,
    total429Count: 0,
    lastSuccessAt: null,
    recoveryScheduled: false,
  };
  saveState();

  return clampConcurrency(Math.floor(presetLimit * currentState.globalMultiplier));
}

 /**
  * レートリミットイベントを記録する
  * @param event 記録するイベント情報
  * @returns なし
  */
export function recordEvent(event: RateLimitEvent): void {
  const currentState = ensureState();
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
      // Reduce concurrency
      const newConcurrency = clampConcurrency(
        Math.floor(limit.concurrency * currentState.reductionFactor)
      );
      limit.concurrency = newConcurrency;
      limit.last429At = event.timestamp;
      limit.consecutive429Count += 1;
      limit.total429Count += 1;
      limit.recoveryScheduled = false; // Reset recovery on new 429

      // Update historical data for predictive analysis
      updateHistorical429s(limit);

      // If multiple consecutive 429s, be more aggressive
      if (limit.consecutive429Count >= 3) {
        limit.concurrency = clampConcurrency(Math.floor(limit.concurrency * 0.5));
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

  saveState();
}

 /**
  * 429エラーを記録する
  * @param provider プロバイダ名
  * @param model モデル名
  * @param details エラー詳細
  * @returns なし
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
  * 成功したリクエストを記録する。
  * @param provider プロバイダ名
  * @param model モデル名
  * @returns なし
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
  * 現在の状態を取得する（デバッグ用）。
  * @returns 現在の状態
  */
export function getAdaptiveState(): AdaptiveControllerState {
  return { ...ensureState() };
}

 /**
  * 指定プロバイダー/モデルの学習済み制限を取得
  * @param provider プロバイダー名
  * @param model モデル名
  * @returns 学習済み制限オブジェクト（存在しない場合は undefined）
  */
export function getLearnedLimit(provider: string, model: string): LearnedLimit | undefined {
  const currentState = ensureState();
  const key = buildKey(provider, model);
  return currentState.limits[key] ? { ...currentState.limits[key] } : undefined;
}

 /**
  * 学習した制限をリセットする
  * @param provider プロバイダ名
  * @param model モデル名
  * @param newLimit 新しい制限値（省略時は初期値に戻す）
  * @returns なし
  */
export function resetLearnedLimit(provider: string, model: string, newLimit?: number): void {
  const currentState = ensureState();
  const key = buildKey(provider, model);

  if (currentState.limits[key]) {
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
    saveState();
  }
}

 /**
  * 学習した制限値をすべてリセットする
  * @returns なし
  */
export function resetAllLearnedLimits(): void {
  const currentState = ensureState();
  currentState.limits = {};
  currentState.globalMultiplier = 1.0;
  saveState();
}

 /**
  * グローバル乗数を設定
  * @param multiplier 乗数
  * @returns なし
  */
export function setGlobalMultiplier(multiplier: number): void {
  const currentState = ensureState();
  currentState.globalMultiplier = Math.max(0.1, Math.min(2.0, multiplier));
  saveState();
}

 /**
  * 復元パラメータを設定する。
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
  const currentState = ensureState();

  if (options.recoveryIntervalMs !== undefined) {
    currentState.recoveryIntervalMs = Math.max(60_000, options.recoveryIntervalMs);
  }
  if (options.reductionFactor !== undefined) {
    currentState.reductionFactor = Math.max(0.3, Math.min(0.9, options.reductionFactor));
  }
  if (options.recoveryFactor !== undefined) {
    currentState.recoveryFactor = Math.max(1.0, Math.min(1.5, options.recoveryFactor));
  }

  saveState();
}

 /**
  * エラーがレートリミットか判定する
  * @param error 判定対象のエラー
  * @returns レートリミットの場合true
  */
export function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  const message = String(error).toLowerCase();
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
  * 適応制御状態の概要を作成する。
  * @returns 状態概要を含む文字列
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
  * 429エラーの発生確率を予測します。
  * @param provider プロバイダ名
  * @param model モデル名
  * @returns 429エラーが発生する予測確率（0〜1）
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
  * プロバイダー/モデルの予測分析を取得する
  * @param provider プロバイダー名
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
  * 予測に基づいて事前にスロットルするか判定
  * @param provider プロバイダ名
  * @param model モデル名
  * @returns スロットルする場合はtrue
  */
export function shouldProactivelyThrottle(provider: string, model: string): boolean {
  const analysis = getPredictiveAnalysis(provider, model);
  return analysis.shouldProactivelyThrottle;
}

 /**
  * 予測に基づいた推奨並列数を取得
  * @param provider プロバイダ名
  * @param model モデル名
  * @param currentConcurrency 現在の並列数
  * @returns 推奨される並列数
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
 */
function updateHistorical429s(limit: LearnedLimit): void {
  if (!limit.historical429s) {
    limit.historical429s = [];
  }

  limit.historical429s.push(new Date().toISOString());

  // Keep only last 50 entries to prevent unbounded growth
  if (limit.historical429s.length > 50) {
    limit.historical429s = limit.historical429s.slice(-50);
  }

  // Update predicted probability
  limit.predicted429Probability = analyze429Probability(
    limit.originalConcurrency.toString(), // Dummy provider extraction
    limit.originalConcurrency.toString()  // Dummy model extraction
  );
}

 /**
  * 予測スケジューリングの有効/無効を設定する
  * @param enabled 有効にする場合はtrue
  * @returns なし
  */
export function setPredictiveEnabled(enabled: boolean): void {
  const currentState = ensureState();
  currentState.predictiveEnabled = enabled;
  saveState();
}

 /**
  * 予測閾値を設定する（0-1）
  * @param threshold 設定する閾値（0から1の範囲に丸められる）
  * @returns なし
  */
export function setPredictiveThreshold(threshold: number): void {
  const currentState = ensureState();
  currentState.predictiveThreshold = Math.max(0, Math.min(1, threshold));
  saveState();
}

// ============================================================================
// Dynamic Parallelism Integration
// ============================================================================

 /**
  * スケジューラ対応の同時実行制限を取得する
  * @param provider - プロバイダ名
  * @param model - モデル名
  * @param baseLimit - プロバイダ制限からの基本同時実行数
  * @returns スケジューラ対応の同時実行制限数
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
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @param details - オプションのエラー詳細
 * @returns 戻り値なし
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
  * @param provider - プロバイダ名
  * @param model - モデル名
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
  * @param provider - プロバイダ名
  * @param model - モデル名
  * @param responseMs - レスポンス時間（ミリ秒）
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
  * レート制御の統合サマリーを取得
  * @param provider プロバイダー名
  * @param model モデル名
  * @returns 統合されたサマリーオブジェクト
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
