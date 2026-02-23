/**
 * @abdd.meta
 * path: .pi/lib/adaptive-penalty.ts
 * role: 動的な並列性調整を行う適応型ペナルティ制御ロジック
 * why: エラー発生時の負荷抑制と回復時の性能向上を両立するため
 * related: subagent-controller, agent-team-coordinator, rate-limiter, config-manager
 * public_api: AdaptivePenaltyState, AdaptivePenaltyOptions, EnhancedPenaltyOptions, AdaptivePenaltyController, EnhancedPenaltyController
 * invariants: penalty値は常に0以上maxPenalty以下, updatedAtMsは単調増加
 * side_effects: 外部へのI/Oは発生しない（状態更新と計算のみ）
 * failure_modes: 負のペナルティ値の混入、最大値超過、タイムスタンプの巻き戻り
 * @abdd.explain
 * overview: 動的並列度制御のためのペナルティ計算および状態管理モジュール。従来の線形減衰に加え、指数関数的減衰と理由別加重をサポートする拡張モード（P1-4）を実装する。
 * what_it_does:
 *   - ペナルティ値の加算（raise）、減算（lower）、時間経過による減衰（decay）を計算する
 *   - 理由（rate_limit, timeout等）に応じた加重ペナルティを適用する
 *   - 現在のペナルティ値に基づき、ベースLimitに制限を適用した値を算出する（applyLimit）
 *   - Feature Flag（PI_ADAPTIVE_PENALTY_MODE）により、legacyモードとenhancedモードを切り替える
 * why_it_exists:
 *   - サブエージェントとエージェントチーム間で並列性制御ロジックを共通化し重複を排除するため
 *   - エラーの種類に応じたきめ細やかな並列度調整（理由別加重）を実現するため
 *   - 状態復帰の速度を戦略（減衰アルゴリズム）によって制御可能にするため
 * scope:
 *   in: 現在時刻, 並列度のベースLimit, 増減指示と理由
 *   out: 制限適用後の並列度Limit, 現在のペナルティ値, 理由ごとの統計情報
 */

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
 * ペナルティ理由の型定義
 * @summary ペナルティ理由
 * @typedef {"rate_limit"|"timeout"|"capacity"|"schema_violation"} PenaltyReason
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
 * 減衰戦略の種類。
 * @summary 戦略を定義
 * @returns 減衰戦略名。
 */
export type DecayStrategy = "linear" | "exponential" | "hybrid";

// ============================================================================
// Core Types
// ============================================================================

/**
 * 適応型ペナルティの状態。
 * @summary 状態を保持
 * @property penalty 現在のペナルティ値。
 * @property updatedAtMs 最終更新時刻。
 * @property lastReason 最後の適用理由。
 * @property reasonHistory 適用理由とタイムスタンプの履歴配列。
 */
export interface AdaptivePenaltyState {
  penalty: number;
  updatedAtMs: number;
  lastReason?: PenaltyReason;
  reasonHistory: Array<{ reason: PenaltyReason; timestamp: number }>;
}

/**
 * 適応型ペナルティオプション。
 * @summary 設定を保持
 * @param isStable 安定フラグ。
 * @param maxPenalty 最大ペナルティ値。
 * @param decayMs 減衰までの時間（ミリ秒）。
 */
export interface AdaptivePenaltyOptions {
  isStable: boolean;
  maxPenalty: number;
  decayMs: number;
}

/**
 * 拡張ペナルティオプション。
 * @summary オプションを定義
 * @param decayStrategy 減衰戦略。
 * @param exponentialBase 指数関数的減衰の基数（デフォルト: 0.5）。
 * @param reasonWeights 理由ごとの重み。
 * @param historySize 履歴サイズ。
 */
export interface EnhancedPenaltyOptions extends AdaptivePenaltyOptions {
  decayStrategy?: DecayStrategy;
  exponentialBase?: number;        // Base for exponential decay (default: 0.5)
  reasonWeights?: Partial<Record<PenaltyReason, number>>;
  historySize?: number;            // Max history entries to keep (default: 100)
}

/**
 * ペナルティ制御インターフェース。
 * @summary ペナルティを制御
 */
export interface AdaptivePenaltyController {
  readonly state: AdaptivePenaltyState;
  decay: (nowMs?: number) => void;
  raise: (reason: "rate_limit" | "timeout" | "capacity") => void;
  lower: () => void;
  get: () => number;
  applyLimit: (baseLimit: number) => number;
}

/**
 * 拡張ペナルティ制御
 * @summary ペナルティ制御
 * @param raiseWithReason 理由を指定してペナルティを発生させる
 * @param getReasonStats 理由ごとの統計情報を取得する
 * @param getDecayStrategy 減衰戦略を取得する
 * @returns void
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
 * アダプティブペナルティモード取得
 * @summary モードを取得
 * @param なし
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
 * @summary キャッシュをリセット
 * アダプティブペナルティモードのキャッシュをリセットする
 * @returns {void}
 */
export function resetAdaptivePenaltyModeCache(): void {
  cachedMode = undefined;
}

// ============================================================================
// Legacy Controller (unchanged for backward compatibility)
// ============================================================================

/**
 * アダプティブペナルティコントローラ作成
 * @summary コントローラを作成
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
 * ペナルティコントローラ生成
 * @summary コントローラを生成
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
