/**
 * Dynamic Parallelism Adjuster
 *
 * Manages per-provider/model parallelism based on error rates and recovery.
 * Integrates with cross-instance-coordinator and adaptive-rate-controller.
 *
 * Key features:
 * - Per provider/model parallelism tracking
 * - 30% reduction on 429 errors
 * - 10% reduction on timeouts
 * - 10% gradual recovery per interval
 * - Cross-instance coordination integration
 *
 * @module dynamic-parallelism
 */

import type { QueueStats } from "./task-scheduler";

// ============================================================================
// Types
// ============================================================================

 /**
  * 動的並列度の設定を表すインターフェース。
  * @param baseParallelism 基本並列度（開始点）
  * @param currentParallelism 現在の並列度（調整値）
  * @param minParallelism 最小並列度（下限）
  * @param maxParallelism 最大並列度（上限）
  * @param adjustmentReason 最後の調整理由
  * @param lastAdjustedAt 最後の調整時刻（ミリ秒）
  */
export interface ParallelismConfig {
  /** Base parallelism level (starting point) */
  baseParallelism: number;
  /** Current parallelism level (adjusted value) */
  currentParallelism: number;
  /** Minimum parallelism (floor) */
  minParallelism: number;
  /** Maximum parallelism (ceiling) */
  maxParallelism: number;
  /** Reason for last adjustment */
  adjustmentReason: string;
  /** Timestamp of last adjustment (ms) */
  lastAdjustedAt: number;
}

 /**
  * プロバイダ/モデルの正常性ステータス
  * @param healthy プロバイダが正常かどうか
  * @param activeRequests アクティブなリクエスト数
  * @param recent429Count 最近の429エラー数
  * @param avgResponseMs 平均応答時間（ミリ秒）
  * @param recommendedBackoffMs 推奨バックオフ時間（ミリ秒）
  */
export interface ProviderHealth {
  /** Whether the provider is currently healthy */
  healthy: boolean;
  /** Number of active requests */
  activeRequests: number;
  /** Recent 429 error count */
  recent429Count: number;
  /** Average response time in milliseconds */
  avgResponseMs: number;
  /** Recommended backoff time in milliseconds */
  recommendedBackoffMs: number;
}

/**
 * Internal state for a provider/model combination.
 */
interface ProviderModelState {
  config: ParallelismConfig;
  health: ProviderHealth;
  activeRequests: number;
  recentErrors: Array<{ type: "429" | "timeout" | "error"; timestamp: number }>;
  responseTimes: number[];
  crossInstanceMultiplier: number;
}

 /**
  * 動的並列度調整の設定オプション
  * @param minParallelism 最小並列度（デフォルト: 1）
  * @param baseParallelism 基本並列度（デフォルト: 4）
  * @param maxParallelism 最大並列度（デフォルト: 16）
  * @param reductionOn429 429エラー時の低減率（デフォルト: 0.3 = 30%）
  * @param reductionOnTimeout タイムアウト時の低減率（デフォルト: 0.1 = 10%）
  * @param increaseOnRecovery 回復時の増加率（デフォルト: 0.1 = 10%）
  * @param recoveryIntervalMs 回復間隔（ミリ秒）（デフォルト: 60000 = 1分）
  * @param errorWindowMs エラー追跡のウィンドウサイズ（ミリ秒）（デフォルト: 300000 = 5分）
  */
export interface DynamicAdjusterConfig {
  /** Minimum parallelism (default: 1) */
  minParallelism: number;
  /** Base parallelism (default: 4) */
  baseParallelism: number;
  /** Maximum parallelism (default: 16) */
  maxParallelism: number;
  /** Reduction factor on 429 (default: 0.3 = 30%) */
  reductionOn429: number;
  /** Reduction factor on timeout (default: 0.1 = 10%) */
  reductionOnTimeout: number;
  /** Increase factor on recovery (default: 0.1 = 10%) */
  increaseOnRecovery: number;
  /** Recovery interval in ms (default: 60000 = 1 min) */
  recoveryIntervalMs: number;
  /** Window for error tracking in ms (default: 300000 = 5 min) */
  errorWindowMs: number;
  /** Maximum errors to track */
  maxErrorHistory: number;
  /** Response time samples to keep */
  maxResponseSamples: number;
}

 /**
  * エラー追跡用イベント
  * @param provider プロバイダ名
  * @param model モデル名
  * @param type エラー種別 ("429" | "timeout" | "error")
  * @param timestamp タイムスタンプ
  * @param details エラー詳細（任意）
  */
export interface ErrorEvent {
  provider: string;
  model: string;
  type: "429" | "timeout" | "error";
  timestamp: number;
  details?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: DynamicAdjusterConfig = {
  minParallelism: 1,
  baseParallelism: 4,
  maxParallelism: 16,
  reductionOn429: 0.3,
  reductionOnTimeout: 0.1,
  increaseOnRecovery: 0.1,
  recoveryIntervalMs: 60_000,
  errorWindowMs: 300_000,
  maxErrorHistory: 100,
  maxResponseSamples: 50,
};

// ============================================================================
// DynamicParallelismAdjuster Class
// ============================================================================

 /**
  * LLMプロバイダの並列度を動的に調整するクラス
  */
export class DynamicParallelismAdjuster {
  private readonly states: Map<string, ProviderModelState> = new Map();
  private readonly config: DynamicAdjusterConfig;
  private recoveryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly eventTarget: EventTarget = new EventTarget();

  constructor(config: Partial<DynamicAdjusterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startRecoveryTimer();
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

   /**
    * 指定されたプロバイダとモデルの現在の並列数を取得します
    * @param provider プロバイダ名
    * @param model モデル名
    * @returns 現在の並列数
    */
  getParallelism(provider: string, model: string): number {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    return Math.floor(state.config.currentParallelism * state.crossInstanceMultiplier);
  }

   /**
    * 指定したプロバイダとモデルの並列処理設定を取得
    * @param provider プロバイダ名
    * @param model モデル名
    * @returns 並列処理設定
    */
  getConfig(provider: string, model: string): ParallelismConfig {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    return { ...state.config };
  }

   /**
    * エラーに基づいて並列度を調整します。
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @param errorType - エラーの種類
    * @returns 戻り値なし
    */
  adjustForError(
    provider: string,
    model: string,
    errorType: "429" | "timeout" | "error"
  ): void {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    const now = Date.now();

    // Record the error
    state.recentErrors.push({ type: errorType, timestamp: now });
    this.pruneErrors(state);

    // Calculate reduction
    let reductionFactor: number;
    let reason: string;

    switch (errorType) {
      case "429":
        reductionFactor = this.config.reductionOn429;
        reason = "429 rate limit error";
        state.health.recent429Count++;
        break;
      case "timeout":
        reductionFactor = this.config.reductionOnTimeout;
        reason = "timeout error";
        break;
      case "error":
      default:
        // General errors don't reduce parallelism significantly
        reductionFactor = 0.05;
        reason = "general error";
        break;
    }

    // Apply reduction
    const oldParallelism = state.config.currentParallelism;
    const newParallelism = Math.max(
      this.config.minParallelism,
      Math.floor(state.config.currentParallelism * (1 - reductionFactor))
    );

    if (newParallelism !== oldParallelism) {
      state.config.currentParallelism = newParallelism;
      state.config.adjustmentReason = reason;
      state.config.lastAdjustedAt = now;

      this.log("info", `${key}: parallelism ${oldParallelism} -> ${newParallelism} (${reason})`);
      this.dispatchEvent("parallelism-changed", { key, oldParallelism, newParallelism, reason });
    }

    // Update health status
    this.updateHealth(state);
  }

   /**
    * 安定期間後の並列性を回復
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @returns 戻り値なし
    */
  attemptRecovery(provider: string, model: string): void {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    const now = Date.now();

    // Check if recovery is appropriate
    if (state.config.currentParallelism >= state.config.baseParallelism) {
      // Already at or above base, no recovery needed
      return;
    }

    // Check if enough time has passed since last adjustment
    const timeSinceAdjustment = now - state.config.lastAdjustedAt;
    if (timeSinceAdjustment < this.config.recoveryIntervalMs) {
      return;
    }

    // Check for recent errors
    this.pruneErrors(state);
    if (state.recentErrors.length > 0) {
      // Still have recent errors, wait more
      return;
    }

    // Apply recovery
    const oldParallelism = state.config.currentParallelism;
    const newParallelism = Math.min(
      state.config.baseParallelism,
      Math.ceil(state.config.currentParallelism * (1 + this.config.increaseOnRecovery))
    );

    if (newParallelism !== oldParallelism) {
      state.config.currentParallelism = newParallelism;
      state.config.adjustmentReason = "gradual recovery";
      state.config.lastAdjustedAt = now;

      this.log("info", `${key}: parallelism ${oldParallelism} -> ${newParallelism} (recovery)`);
      this.dispatchEvent("parallelism-changed", {
        key,
        oldParallelism,
        newParallelism,
        reason: "recovery",
      });
    }

    // Update health status
    this.updateHealth(state);
  }

   /**
    * クロスインスタンス制限を適用します。
    * @param provider - プロバイダー名
    * @param model - モデル名
    * @param instanceCount - アクティブなインスタンス数
    * @returns 戻り値なし
    */
  applyCrossInstanceLimits(
    provider: string,
    model: string,
    instanceCount: number
  ): void {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);

    // Calculate multiplier: divide parallelism across instances
    const newMultiplier = instanceCount > 0 ? 1 / instanceCount : 1;

    if (Math.abs(state.crossInstanceMultiplier - newMultiplier) > 0.01) {
      const oldMultiplier = state.crossInstanceMultiplier;
      state.crossInstanceMultiplier = newMultiplier;

      this.log(
        "debug",
        `${key}: cross-instance multiplier ${oldMultiplier.toFixed(2)} -> ${newMultiplier.toFixed(2)} (${instanceCount} instances)`
      );
    }
  }

   /**
    * プロバイダー/モデルのヘルス状態を取得
    * @param provider - プロバイダー名
    * @param model - モデル名
    * @returns ヘルス状態
    */
  getHealth(provider: string, model: string): ProviderHealth {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    this.updateHealth(state);
    return { ...state.health };
  }

   /**
    * 成功時のリクエストを記録する
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @param responseMs - レスポンス時間（ミリ秒）
    * @returns なし
    */
  recordSuccess(provider: string, model: string, responseMs: number): void {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);

    // Record response time
    state.responseTimes.push(responseMs);
    if (state.responseTimes.length > this.config.maxResponseSamples) {
      state.responseTimes.shift();
    }

    // Update health
    this.updateHealth(state);
  }

   /**
    * アクティブなリクエストの開始を追跡する
    * @param provider - プロバイダー名
    * @param model - モデル名
    * @returns 戻り値なし
    */
  requestStarted(provider: string, model: string): void {
    const key = this.buildKey(provider, model);
    const state = this.getOrCreateState(key);
    state.activeRequests++;
    state.health.activeRequests = state.activeRequests;
  }

   /**
    * アクティブなリクエストの終了を追跡する。
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @returns 戻り値なし
    */
  requestCompleted(provider: string, model: string): void {
    const key = this.buildKey(provider, model);
    const state = this.states.get(key);
    if (state) {
      state.activeRequests = Math.max(0, state.activeRequests - 1);
      state.health.activeRequests = state.activeRequests;
    }
  }

   /**
    * 現在の全状態を取得（デバッグ/監視用）
    * @returns キーから状態へのマップ
    */
  getAllStates(): Map<string, { config: ParallelismConfig; health: ProviderHealth }> {
    const result = new Map<string, { config: ParallelismConfig; health: ProviderHealth }>();
    for (const [key, state] of this.states) {
      result.set(key, {
        config: { ...state.config },
        health: { ...state.health },
      });
    }
    return result;
  }

   /**
    * 指定プロバイダとモデルの設定をリセット
    * @param provider - プロバイダ名
    * @param model - モデル名
    * @returns 戻り値なし
    */
  reset(provider: string, model: string): void {
    const key = this.buildKey(provider, model);
    this.states.delete(key);
    this.log("info", `${key}: reset to base configuration`);
  }

   /**
    * 全ての状態をリセットする
    */
  resetAll(): void {
    this.states.clear();
    this.log("info", "all states reset");
  }

   /**
    * 並列度の変更イベントを購読する
    * @param callback コールバック関数
    * @returns 購読を解除する関数
    */
  onParallelismChange(
    callback: (event: {
      key: string;
      oldParallelism: number;
      newParallelism: number;
      reason: string;
    }) => void
  ): () => void {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      callback(customEvent.detail);
    };
    this.eventTarget.addEventListener("parallelism-changed", handler);
    return () => {
      this.eventTarget.removeEventListener("parallelism-changed", handler);
    };
  }

   /**
    * 調整機能をシャットダウンする。
    * @returns 戻り値なし。
    */
  shutdown(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private buildKey(provider: string, model: string): string {
    return `${provider.toLowerCase()}:${model.toLowerCase()}`;
  }

  private getOrCreateState(key: string): ProviderModelState {
    let state = this.states.get(key);
    if (!state) {
      const now = Date.now();
      state = {
        config: {
          baseParallelism: this.config.baseParallelism,
          currentParallelism: this.config.baseParallelism,
          minParallelism: this.config.minParallelism,
          maxParallelism: this.config.maxParallelism,
          adjustmentReason: "initial",
          lastAdjustedAt: now,
        },
        health: {
          healthy: true,
          activeRequests: 0,
          recent429Count: 0,
          avgResponseMs: 0,
          recommendedBackoffMs: 0,
        },
        activeRequests: 0,
        recentErrors: [],
        responseTimes: [],
        crossInstanceMultiplier: 1,
      };
      this.states.set(key, state);
    }
    return state;
  }

  private pruneErrors(state: ProviderModelState): void {
    const cutoff = Date.now() - this.config.errorWindowMs;
    state.recentErrors = state.recentErrors.filter((e) => e.timestamp > cutoff);
    if (state.recentErrors.length > this.config.maxErrorHistory) {
      state.recentErrors = state.recentErrors.slice(-this.config.maxErrorHistory);
    }
  }

  private updateHealth(state: ProviderModelState): void {
    const now = Date.now();

    // Calculate average response time
    if (state.responseTimes.length > 0) {
      const sum = state.responseTimes.reduce((a, b) => a + b, 0);
      state.health.avgResponseMs = Math.round(sum / state.responseTimes.length);
    }

    // Count recent 429s
    const recent429s = state.recentErrors.filter(
      (e) => e.type === "429" && e.timestamp > now - this.config.errorWindowMs
    );
    state.health.recent429Count = recent429s.length;

    // Determine health status
    state.health.healthy =
      state.recentErrors.length === 0 &&
      state.config.currentParallelism >= state.config.baseParallelism * 0.8;

    // Calculate recommended backoff
    if (recent429s.length > 0) {
      const last429 = recent429s[recent429s.length - 1];
      const timeSince429 = now - last429.timestamp;
      const baseBackoff = Math.min(60_000, 1000 * Math.pow(2, recent429s.length));
      state.health.recommendedBackoffMs = Math.max(0, baseBackoff - timeSince429);
    } else {
      state.health.recommendedBackoffMs = 0;
    }
  }

  private startRecoveryTimer(): void {
    this.recoveryTimer = setInterval(() => {
      this.processAutomaticRecovery();
    }, this.config.recoveryIntervalMs);

    // Don't prevent process exit
    if (this.recoveryTimer.unref) {
      this.recoveryTimer.unref();
    }
  }

  private processAutomaticRecovery(): void {
    for (const [key, state] of this.states) {
      const [provider, model] = key.split(":", 2);
      if (provider && model) {
        this.attemptRecovery(provider, model);
      }
    }
  }

  private dispatchEvent(type: string, detail: unknown): void {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private log(level: "debug" | "info" | "warn", message: string): void {
    // Only log if debug mode is enabled
    if (process.env.PI_DEBUG_DYNAMIC_PARALLELISM === "1" || level !== "debug") {
      const prefix = `[DynamicParallelism]`;
      if (level === "warn") {
        console.warn(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let adjusterInstance: DynamicParallelismAdjuster | null = null;

 /**
  * 並列度調整器のインスタンスを取得
  * @returns DynamicParallelismAdjusterのインスタンス
  */
export function getParallelismAdjuster(): DynamicParallelismAdjuster {
  if (!adjusterInstance) {
    adjusterInstance = new DynamicParallelismAdjuster();
  }
  return adjusterInstance;
}

 /**
  * カスタム設定で調整器を作成する
  * @param config - カスタム設定
  * @returns 新しいDynamicParallelismAdjusterインスタンス
  */
export function createParallelismAdjuster(
  config: Partial<DynamicAdjusterConfig>
): DynamicParallelismAdjuster {
  return new DynamicParallelismAdjuster(config);
}

 /**
  * シングルトンの調整器をリセット（テスト用）
  * @returns なし
  */
export function resetParallelismAdjuster(): void {
  if (adjusterInstance) {
    adjusterInstance.shutdown();
    adjusterInstance = null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

 /**
  * プロバイダーとモデルに基づいて並列度を取得
  * @param provider プロバイダー名
  * @param model モデル名
  * @returns 現在の並列度レベル
  */
export function getParallelism(provider: string, model: string): number {
  return getParallelismAdjuster().getParallelism(provider, model);
}

 /**
  * エラー発生時に並列度を調整する
  * @param provider プロバイダ名
  * @param model モデル名
  * @param errorType エラーの種類（"429" | "timeout" | "error"）
  * @returns なし
  */
export function adjustForError(
  provider: string,
  model: string,
  errorType: "429" | "timeout" | "error"
): void {
  getParallelismAdjuster().adjustForError(provider, model, errorType);
}

 /**
  * 復旧を試行する
  * @param provider - プロバイダ名
  * @param model - モデル名
  * @returns なし
  */
export function attemptRecovery(provider: string, model: string): void {
  getParallelismAdjuster().attemptRecovery(provider, model);
}

 /**
  * 動的並列度の状態サマリーを整形する
  * @returns 整形されたサマリー文字列
  */
export function formatDynamicParallelismSummary(): string {
  const adjuster = getParallelismAdjuster();
  const states = adjuster.getAllStates();
  const lines: string[] = ["Dynamic Parallelism Adjuster", "===========================", ""];

  if (states.size === 0) {
    lines.push("(no active states)");
  } else {
    for (const [key, state] of states) {
      const { config, health } = state;
      const status = health.healthy ? "healthy" : "degraded";
      const parallelismStatus =
        config.currentParallelism < config.baseParallelism
          ? `REDUCED (${config.currentParallelism}/${config.baseParallelism})`
          : `OK (${config.currentParallelism})`;

      lines.push(`${key}:`);
      lines.push(`  parallelism: ${parallelismStatus}`);
      lines.push(`  reason: ${config.adjustmentReason}`);
      lines.push(`  health: ${status}`);
      lines.push(`  recent_429s: ${health.recent429Count}`);
      lines.push(`  avg_response: ${health.avgResponseMs}ms`);
      lines.push(`  backoff: ${health.recommendedBackoffMs}ms`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
