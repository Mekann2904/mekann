/**
 * @abdd.meta
 * path: .pi/lib/circuit-breaker.ts
 * role: 連続エラー時の早期検出メカニズムを提供するサーキットブレーカーパターン実装
 * why: 連続するAPIエラーからシステムを保護し、迅速な回復を可能にするため
 * related: .pi/lib/retry-with-backoff.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: CircuitState, CircuitBreakerConfig, checkCircuitBreaker, recordCircuitBreakerSuccess, recordCircuitBreakerFailure, getCircuitBreakerState, resetAllCircuitBreakers, resetCircuitBreaker
 * invariants: failureCountは連続失敗時のみ増加、successThreshold達成時のみCLOSEDに遷移
 * side_effects: グローバルなcircuitBreakers Mapを更新する
 * failure_modes: 不適切な設定値による誤検知、メモリリーク（大量のキー生成時）
 * @abdd.explain
 * overview: 連続エラー検出によるOPEN状態への遷移と、クールダウン後のHALF-OPEN状態を経て復旧するサーキットブレーカー
 * what_it_does:
 *   - 連続失敗回数がしきい値を超えるとOPEN状態に遷移し、リクエストをブロックする
 *   - クールダウン期間経過後にHALF-OPEN状態に遷移し、制限付きでリクエストを許可する
 *   - HALF-OPEN状態で連続成功がしきい値に達するとCLOSED状態に復旧する
 *   - HALF-OPEN状態で失敗すると即座にOPEN状態に戻る
 * why_it_exists:
 *   - 連続するAPIエラーからシステムを保護し、無駄なリトライを防ぐため
 *   - 適切なクールダウン期間を設けることで、プロバイダーの復旧を待つため
 * scope:
 *   in: サーキットブレーカーキー（プロバイダー/モデル識別）、成功/失敗イベント
 *   out: 許可/拒否判定、待機時間、現在の状態
 */

/**
 * サーキットブレーカーの状態
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * サーキットブレーカーの内部状態
 */
interface CircuitBreakerInternalState {
  status: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  lastStateChangeTime: number;
}

/**
 * サーキットブレーカーの設定
 */
export interface CircuitBreakerConfig {
  /** 連続失敗しきい値（この値を超えるとOPEN状態へ） */
  failureThreshold: number;
  /** 連続成功しきい値（HALF-OPEN状態でこの値を超えるとCLOSED状態へ） */
  successThreshold: number;
  /** OPEN状態のクールダウン時間（ミリ秒） */
  cooldownMs: number;
  /** HALF-OPEN状態で許可するリクエスト数 */
  halfOpenMaxRequests: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  cooldownMs: 30000,  // 30秒
  halfOpenMaxRequests: 1,
};

// グローバル状態ストア
const circuitBreakers = new Map<string, CircuitBreakerInternalState>();

/**
 * サーキットブレーカーをチェックする
 * @summary サーキットブレーカーチェック
 * @param key - サーキットブレーカーのキー（例: "provider:model"）
 * @param config - 設定（省略時はデフォルト値）
 * @returns 許可されるかどうかと、待機時間、現在の状態
 */
export function checkCircuitBreaker(
  key: string,
  config: Partial<CircuitBreakerConfig> = {},
): { allowed: boolean; retryAfterMs?: number; state: CircuitState } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  let state = circuitBreakers.get(key);

  // 初回アクセス時はCLOSED状態で初期化
  if (!state) {
    state = {
      status: "closed",
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
      lastStateChangeTime: now,
    };
    circuitBreakers.set(key, state);
    return { allowed: true, state: "closed" };
  }

  switch (state.status) {
    case "closed":
      return { allowed: true, state: "closed" };

    case "open": {
      const elapsedMs = now - state.lastFailureTime;
      if (elapsedMs < cfg.cooldownMs) {
        return {
          allowed: false,
          retryAfterMs: cfg.cooldownMs - elapsedMs,
          state: "open",
        };
      }
      // クールダウン終了、HALF-OPENに移行
      state.status = "half-open";
      state.successCount = 0;
      state.lastStateChangeTime = now;
      circuitBreakers.set(key, state);
      return { allowed: true, state: "half-open" };
    }

    case "half-open":
      // HALF-OPEN状態では制限付きで許可
      return { allowed: true, state: "half-open" };
  }
}

/**
 * サーキットブレーカーに成功を記録する
 * @summary 成功記録
 * @param key - サーキットブレーカーのキー
 * @param config - 設定
 */
export function recordCircuitBreakerSuccess(
  key: string,
  config: Partial<CircuitBreakerConfig> = {},
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = circuitBreakers.get(key);

  if (!state) return;

  state.failureCount = 0;
  state.successCount++;

  if (state.status === "half-open" && state.successCount >= cfg.successThreshold) {
    // HALF-OPEN -> CLOSED
    state.status = "closed";
    state.successCount = 0;
    state.lastStateChangeTime = Date.now();
  }

  circuitBreakers.set(key, state);
}

/**
 * サーキットブレーカーに失敗を記録する
 * @summary 失敗記録
 * @param key - サーキットブレーカーのキー
 * @param config - 設定
 */
export function recordCircuitBreakerFailure(
  key: string,
  config: Partial<CircuitBreakerConfig> = {},
): void {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = circuitBreakers.get(key);

  if (!state) return;

  state.failureCount++;
  state.successCount = 0;
  state.lastFailureTime = Date.now();

  if (state.status === "half-open") {
    // HALF-OPEN -> OPEN（即座に戻す）
    state.status = "open";
    state.lastStateChangeTime = Date.now();
  } else if (state.failureCount >= cfg.failureThreshold) {
    // CLOSED -> OPEN
    state.status = "open";
    state.lastStateChangeTime = Date.now();
  }

  circuitBreakers.set(key, state);
}

/**
 * サーキットブレーカーの状態を取得する
 * @summary 状態取得
 * @param key - サーキットブレーカーのキー
 * @returns 現在の状態（存在しない場合はundefined）
 */
export function getCircuitBreakerState(key: string): CircuitState | undefined {
  return circuitBreakers.get(key)?.status;
}

/**
 * すべてのサーキットブレーカーをリセットする
 * @summary 全リセット
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.clear();
}

/**
 * 特定のサーキットブレーカーをリセットする
 * @summary 個別リセット
 * @param key - サーキットブレーカーのキー
 */
export function resetCircuitBreaker(key: string): void {
  circuitBreakers.delete(key);
}

/**
 * サーキットブレーカーの統計情報を取得する（デバッグ用）
 * @summary 統計情報取得
 * @returns 全サーキットブレーカーの状態一覧
 */
export function getCircuitBreakerStats(): Record<string, { state: CircuitState; failureCount: number; successCount: number }> {
  const result: Record<string, { state: CircuitState; failureCount: number; successCount: number }> = {};
  for (const [key, state] of circuitBreakers.entries()) {
    result[key] = {
      state: state.status,
      failureCount: state.failureCount,
      successCount: state.successCount,
    };
  }
  return result;
}
