/**
 * @abdd.meta
 * path: lib/circuit-breaker.ts
 * role: サーキットブレーカーパターンによる障害許容性実装
 * why: 連続失敗時のカスケード障害を防ぎ、システムの回復力を向上させる
 * related: retry-with-backoff.ts, agent-runtime.ts, cross-instance-coordinator.ts
 * public_api: checkCircuitBreaker, recordCircuitBreakerSuccess, recordCircuitBreakerFailure, getCircuitBreakerState, resetAllCircuitBreakers, resetCircuitBreaker, getCircuitBreakerStats
 * invariants:
 *   - failureCount >= 0
 *   - successCount >= 0
 *   - state in ['closed', 'open', 'half-open']
 * side_effects: なし（ステートレス操作）
 * failure_modes:
 *   - 状態不整合: リセットでclosedに復帰
 *   - メモリリーク: レジストリの定期クリーンアップで対応
 * @abdd.explain
 * overview: LLM呼び出しの障害保護のためのサーキットブレーカーパターン実装
 * what_it_does: 失敗を追跡し、閾値で回路を開き、回復を許可する
 * why_it_exists: 障害エンドポイントへのリソース浪費を防止
 * scope:
 *   in: 失敗追跡、状態遷移、回復タイムアウト
 *   out: リトライロジック（retry-with-backoff.tsで処理）
 */

/**
 * サーキットブレーカーの状態
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * サーキットブレーカー設定
 */
export interface CircuitBreakerConfig {
	/** 回路を開く前の失敗回数閾値 */
	failureThreshold?: number;
	/** half-openへの回復タイムアウト（ミリ秒） */
	cooldownMs?: number;
	/** half-openからclosedに戻るための成功回数閾値 */
	successThreshold?: number;
}

/**
 * サーキットブレーカーの内部状態
 */
interface CircuitBreakerInternalState {
	state: CircuitState;
	failureCount: number;
	successCount: number;
	lastFailureTime: number;
	lastStateChange: number;
	config: Required<CircuitBreakerConfig>;
}

/**
 * checkCircuitBreakerの戻り値
 */
export interface CircuitBreakerCheckResult {
	/** リクエストが許可されるか */
	allowed: boolean;
	/** 現在の状態 */
	state: CircuitState;
	/** 許可されない場合の再試行までの待機時間（ミリ秒） */
	retryAfterMs: number;
}

/**
 * 統計情報
 */
export interface CircuitBreakerStats {
	/** キーごとの状態 */
	states: Record<string, {
		state: CircuitState;
		failureCount: number;
		successCount: number;
		lastFailureTime: number;
	}>;
	/** 合計サーキットブレーカー数 */
	totalCount: number;
	/** open状態の数 */
	openCount: number;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
	failureThreshold: 5,
	cooldownMs: 30_000,
	successThreshold: 2,
};

// グローバルレジストリ
// 注: このMapはプロセス固有のメモリ内状態であり、複数プロセス間で共有されない。
// Node.jsのシングルスレッドイベントループ内では競合状態は発生しないため、
// 同期機構は不要。もし将来的にWorker Threadsで共有する必要が生じた場合は
// async-mutexの導入を検討すること。
const breakers = new Map<string, CircuitBreakerInternalState>();

/**
 * 設定を正規化
 */
function normalizeConfig(config?: CircuitBreakerConfig): Required<CircuitBreakerConfig> {
	return {
		failureThreshold: config?.failureThreshold ?? DEFAULT_CONFIG.failureThreshold,
		cooldownMs: config?.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
		successThreshold: config?.successThreshold ?? DEFAULT_CONFIG.successThreshold,
	};
}

/**
 * @summary サーキットブレーカーをチェック
 * @param key プロバイダー/モデル等の識別キー
 * @param config オプション設定（初回作成時のみ使用）
 * @returns チェック結果
 */
export function checkCircuitBreaker(
	key: string,
	config?: CircuitBreakerConfig
): CircuitBreakerCheckResult {
	const normalizedConfig = normalizeConfig(config);
	let breaker = breakers.get(key);

	if (!breaker) {
		breaker = {
			state: 'closed',
			failureCount: 0,
			successCount: 0,
			lastFailureTime: 0,
			lastStateChange: Date.now(),
			config: normalizedConfig,
		};
		breakers.set(key, breaker);
		return { allowed: true, state: 'closed', retryAfterMs: 0 };
	}

	const now = Date.now();

	if (breaker.state === 'closed') {
		return { allowed: true, state: 'closed', retryAfterMs: 0 };
	}

	if (breaker.state === 'open') {
		const elapsed = now - breaker.lastFailureTime;
		if (elapsed >= breaker.config.cooldownMs) {
			transitionTo(breaker, 'half-open');
			return { allowed: true, state: 'half-open', retryAfterMs: 0 };
		}
		const retryAfterMs = breaker.config.cooldownMs - elapsed;
		return { allowed: false, state: 'open', retryAfterMs };
	}

	// half-open: プローブリクエストを許可
	return { allowed: true, state: 'half-open', retryAfterMs: 0 };
}

/**
 * @summary 成功を記録
 * @param key プロバイダー/モデル等の識別キー
 * @param _config オプション設定（互換性のため受け取るが使用しない）
 */
export function recordCircuitBreakerSuccess(
	key: string,
	_config?: CircuitBreakerConfig
): void {
	const breaker = breakers.get(key);
	if (!breaker) return;

	if (breaker.state === 'half-open') {
		breaker.successCount++;
		if (breaker.successCount >= breaker.config.successThreshold) {
			transitionTo(breaker, 'closed');
		}
	} else if (breaker.state === 'closed') {
		breaker.failureCount = 0;
	}
}

/**
 * @summary 失敗を記録
 */
export function recordCircuitBreakerFailure(
	key: string,
	config?: CircuitBreakerConfig
): void {
	const normalizedConfig = normalizeConfig(config);
	let breaker = breakers.get(key);

	if (!breaker) {
		breaker = {
			state: 'closed',
			failureCount: 0,
			successCount: 0,
			lastFailureTime: 0,
			lastStateChange: Date.now(),
			config: normalizedConfig,
		};
		breakers.set(key, breaker);
	}

	breaker.failureCount++;
	breaker.lastFailureTime = Date.now();
	breaker.successCount = 0;

	if (breaker.state === 'half-open') {
		transitionTo(breaker, 'open');
	} else if (breaker.failureCount >= breaker.config.failureThreshold) {
		transitionTo(breaker, 'open');
	}
}

/**
 * @summary 指定キーの状態を取得
 */
export function getCircuitBreakerState(key: string): CircuitState | undefined {
	const breaker = breakers.get(key);
	return breaker?.state;
}

/**
 * @summary 指定キーのサーキットブレーカーをリセット（削除）
 */
export function resetCircuitBreaker(key: string): boolean {
	return breakers.delete(key);
}

/**
 * @summary すべてのサーキットブレーカーをリセット（削除）
 */
export function resetAllCircuitBreakers(): void {
	breakers.clear();
}

/**
 * @summary 統計情報を取得
 */
export function getCircuitBreakerStats(): Record<string, {
	state: CircuitState;
	failureCount: number;
	successCount: number;
	lastFailureTime: number;
}> {
	const stats: Record<string, {
		state: CircuitState;
		failureCount: number;
		successCount: number;
		lastFailureTime: number;
	}> = {};

	for (const [key, breaker] of breakers) {
		stats[key] = {
			state: breaker.state,
			failureCount: breaker.failureCount,
			successCount: breaker.successCount,
			lastFailureTime: breaker.lastFailureTime,
		};
	}

	return stats;
}

/**
 * 状態遷移ヘルパー
 */
function transitionTo(breaker: CircuitBreakerInternalState, newState: CircuitState): void {
	const previousState = breaker.state;
	breaker.state = newState;
	breaker.lastStateChange = Date.now();

	if (newState === 'closed') {
		breaker.failureCount = 0;
		breaker.successCount = 0;
	} else if (newState === 'half-open') {
		breaker.successCount = 0;
	}

	// デバッグログ（PI_DEBUG_CIRCUIT_BREAKER環境変数で有効化）
	if (process.env.PI_DEBUG_CIRCUIT_BREAKER) {
		console.error(`[CircuitBreaker] ${previousState} -> ${newState}`);
	}
}

// レガシーAPI（エクスポート）
export { breakers as _internalBreakers };
