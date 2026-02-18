/**
 * Adaptive penalty controller for dynamic parallelism adjustment.
 * Shared between subagents and agent-teams to reduce code duplication.
 *
 * Enhanced with exponential decay and reason-based weights (P1-4 improvement).
 * Feature Flag: PI_ADAPTIVE_PENALTY_MODE
 * - "legacy" (default): Use linear decay (+1/-1 steps)
 * - "enhanced": Use exponential decay and reason-based weights
 */

// ============================================================================
// Enhanced Types (P1-4)
// ============================================================================

 /**
  * ペナルティ調整の理由種別
  * @typedef {"rate_limit" | "timeout" | "capacity" | "schema_violation"} PenaltyReason
  */
export type PenaltyReason = "rate_limit" | "timeout" | "capacity" | "schema_violation";

/**
 * Default reason weights for enhanced mode.
 * Heavier weights cause faster penalty increase.
 */
const DEFAULT_REASON_WEIGHTS: Record<PenaltyReason, number> = {
  rate_limit: 2.0,        // API rate limits should reduce parallelism quickly
  capacity: 1.5,          // Capacity issues are moderately serious
  timeout: 1.0,           // Timeouts are standard
  schema_violation: 0.5,  // Schema issues are usually transient
};

 /**
  * 減衰戦略の種類 ("linear" | "exponential" | "hybrid")
  */
export type DecayStrategy = "linear" | "exponential" | "hybrid";

// ============================================================================
// Core Types
// ============================================================================

 /**
  * 適応的ペナルティの状態を表すインターフェース
  * @property penalty - 現在のペナルティ値
  * @property updatedAtMs - 最終更新時刻（ミリ秒単位）
  * @property lastReason - 最後にペナルティが適用された理由
  * @property reasonHistory - 適用理由とタイムスタンプの履歴配列
  */
export interface AdaptivePenaltyState {
  penalty: number;
  updatedAtMs: number;
  lastReason?: PenaltyReason;
  reasonHistory: Array<{ reason: PenaltyReason; timestamp: number }>;
}

/**
 * 適応的ペナルティの設定オプション
 * @param isStable 安定状態かどうか
 * @param maxPenalty 最大ペナルティ値
 * @param decayMs 減衰までの時間（ミリ秒）
 */
export interface AdaptivePenaltyOptions {
  isStable: boolean;
  maxPenalty: number;
  decayMs: number;
}

 /**
  * 拡張ペナルティオプション。
  * @param decayStrategy 減衰戦略。
  * @param exponentialBase 指数関数的減衰の基数（デフォルト: 0.5）。
  * @param reasonWeights 理由ごとの重み付け。
  * @param historySize 保持する履歴の最大エントリ数（デフォルト: 100）。
  */
export interface EnhancedPenaltyOptions extends AdaptivePenaltyOptions {
  decayStrategy?: DecayStrategy;
  exponentialBase?: number;        // Base for exponential decay (default: 0.5)
  reasonWeights?: Partial<Record<PenaltyReason, number>>;
  historySize?: number;            // Max history entries to keep (default: 100)
}

export interface AdaptivePenaltyController {
  readonly state: AdaptivePenaltyState;
  decay: (nowMs?: number) => void;
  raise: (reason: "rate_limit" | "timeout" | "capacity") => void;
  lower: () => void;
  get: () => number;
  applyLimit: (baseLimit: number) => number;
}

 /**
  * 拡張ペナルティコントローラ
  * @extends AdaptivePenaltyController
  * @param raiseWithReason 理由を指定してペナルティを発生させる
  * @param getReasonStats 理由ごとの統計情報を取得する
  * @param getDecayStrategy 減衰戦略を取得する
  */
export interface EnhancedPenaltyController extends AdaptivePenaltyController {
  raiseWithReason: (reason: PenaltyReason) => void;
  getReasonStats: () => Record<PenaltyReason, number>;
  getDecayStrategy: () => DecayStrategy;
}

// ============================================================================
// Feature Flag Management
// ============================================================================

let cachedMode: "legacy" | "enhanced" | undefined;

 /**
  * 現在のアダプティブペナルティモードを取得
  * @returns "legacy" または "enhanced"
  */
export function getAdaptivePenaltyMode(): "legacy" | "enhanced" {
  if (cachedMode !== undefined) {
    return cachedMode;
  }

  const envMode = process.env.PI_ADAPTIVE_PENALTY_MODE?.toLowerCase();
  // Default: enhanced mode (migration complete)
  cachedMode = envMode === "legacy" ? "legacy" : "enhanced";
  return cachedMode;
}

 /**
  * キャッシュモードをリセットする
  * @returns void
  */
export function resetAdaptivePenaltyModeCache(): void {
  cachedMode = undefined;
}

// ============================================================================
// Legacy Controller (unchanged for backward compatibility)
// ============================================================================

 /**
  * アダプティブペナルティコントローラを作成する
  * @param options - コントローラの設定オプション
  * @returns 作成されたアダプティブペナルティコントローラ
  */
export function createAdaptivePenaltyController(
  options: AdaptivePenaltyOptions
): AdaptivePenaltyController {
  const { isStable, maxPenalty, decayMs } = options;

  const state: AdaptivePenaltyState = {
    penalty: 0,
    updatedAtMs: Date.now(),
    reasonHistory: [],
  };

  const decay = (nowMs = Date.now()): void => {
    if (isStable) return;
    const elapsed = Math.max(0, nowMs - state.updatedAtMs);
    if (state.penalty <= 0 || elapsed < decayMs) return;
    const steps = Math.floor(elapsed / decayMs);
    if (steps <= 0) return;
    state.penalty = Math.max(0, state.penalty - steps);
    state.updatedAtMs = nowMs;
  };

  const raise = (reason: "rate_limit" | "timeout" | "capacity"): void => {
    if (isStable) {
      void reason;
      return;
    }
    decay();
    state.penalty = Math.min(maxPenalty, state.penalty + 1);
    state.updatedAtMs = Date.now();
  };

  const lower = (): void => {
    if (isStable) return;
    decay();
    if (state.penalty <= 0) return;
    state.penalty = Math.max(0, state.penalty - 1);
    state.updatedAtMs = Date.now();
  };

  const get = (): number => {
    if (isStable) return 0;
    decay();
    return state.penalty;
  };

  const applyLimit = (baseLimit: number): number => {
    if (isStable) return Math.max(1, Math.trunc(baseLimit));
    const penalty = get();
    if (penalty <= 0) return baseLimit;
    const divisor = penalty + 1;
    return Math.max(1, Math.floor(baseLimit / divisor));
  };

  return {
    state,
    decay,
    raise,
    lower,
    get,
    applyLimit,
  };
}

// ============================================================================
// Enhanced Controller (P1-4)
// ============================================================================

 /**
  * 拡張アダプティブペナルティコントローラーを作成
  * @param options - 拡張ペナルティのオプション
  * @returns 拡張ペナルティコントローラー
  */
export function createEnhancedPenaltyController(
  options: EnhancedPenaltyOptions
): EnhancedPenaltyController {
  const {
    isStable,
    maxPenalty,
    decayMs,
    decayStrategy = "linear",
    exponentialBase = 0.5,
    reasonWeights = {},
    historySize = 100,
  } = options;

  // Merge with default weights
  const weights: Record<PenaltyReason, number> = {
    ...DEFAULT_REASON_WEIGHTS,
    ...reasonWeights,
  };

  const state: AdaptivePenaltyState = {
    penalty: 0,
    updatedAtMs: Date.now(),
    reasonHistory: [],
  };

  const decay = (nowMs = Date.now()): void => {
    if (isStable) return;
    const elapsed = Math.max(0, nowMs - state.updatedAtMs);
    if (state.penalty <= 0 || elapsed < decayMs) return;

    const steps = Math.floor(elapsed / decayMs);
    if (steps <= 0) return;

    if (decayStrategy === "exponential") {
      // Exponential decay: penalty = penalty * base^steps
      state.penalty = state.penalty * Math.pow(exponentialBase, steps);
    } else if (decayStrategy === "hybrid") {
      // Hybrid: exponential for high penalty, linear for low
      if (state.penalty > 5) {
        state.penalty = state.penalty * Math.pow(0.7, steps);
      } else {
        state.penalty = Math.max(0, state.penalty - steps);
      }
    } else {
      // Linear (legacy)
      state.penalty = Math.max(0, state.penalty - steps);
    }

    state.updatedAtMs = nowMs;
  };

  const recordReason = (reason: PenaltyReason): void => {
    state.lastReason = reason;
    state.reasonHistory.push({ reason, timestamp: Date.now() });
    if (state.reasonHistory.length > historySize) {
      state.reasonHistory.shift();
    }
  };

  const raiseWithReason = (reason: PenaltyReason): void => {
    if (isStable) return;
    decay();
    const weight = weights[reason] ?? 1.0;
    state.penalty = Math.min(maxPenalty, state.penalty + weight);
    state.updatedAtMs = Date.now();
    recordReason(reason);
  };

  const raise = (reason: "rate_limit" | "timeout" | "capacity"): void => {
    raiseWithReason(reason);
  };

  const lower = (): void => {
    if (isStable) return;
    decay();
    if (state.penalty <= 0) return;
    state.penalty = Math.max(0, state.penalty - 1);
    state.updatedAtMs = Date.now();
  };

  const get = (): number => {
    if (isStable) return 0;
    decay();
    return state.penalty;
  };

  const applyLimit = (baseLimit: number): number => {
    if (isStable) return Math.max(1, Math.trunc(baseLimit));
    const penalty = get();
    if (penalty <= 0) return baseLimit;
    const divisor = penalty + 1;
    return Math.max(1, Math.floor(baseLimit / divisor));
  };

  const getReasonStats = (): Record<PenaltyReason, number> => {
    const stats: Record<PenaltyReason, number> = {
      rate_limit: 0,
      timeout: 0,
      capacity: 0,
      schema_violation: 0,
    };
    for (const entry of state.reasonHistory) {
      stats[entry.reason] = (stats[entry.reason] || 0) + 1;
    }
    return stats;
  };

  const getDecayStrategy = (): DecayStrategy => decayStrategy;

  return {
    state,
    decay,
    raise,
    raiseWithReason,
    lower,
    get,
    applyLimit,
    getReasonStats,
    getDecayStrategy,
  };
}

 /**
  * フラグに基づいて適切なペナルティコントローラを作成する
  * @param options - ペナルティオプション
  * @returns フラグに基づいたペナルティコントローラ
  */
export function createAutoPenaltyController(
  options: AdaptivePenaltyOptions | EnhancedPenaltyOptions
): AdaptivePenaltyController | EnhancedPenaltyController {
  const mode = getAdaptivePenaltyMode();

  if (mode === "enhanced") {
    return createEnhancedPenaltyController(options as EnhancedPenaltyOptions);
  }

  return createAdaptivePenaltyController(options);
}
