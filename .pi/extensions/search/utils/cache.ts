/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/cache.ts
 * role: 検索ツールの結果を保持するTTLベースのキャッシュ機構
 * why: 検索処理の重複実行を防ぎ、パフォーマンスと応答速度を向上させるため
 * related: .pi/extensions/search/index.ts, .pi/extensions/search/types.ts
 * public_api: CacheEntry, CacheConfig, CacheStats, DEFAULT_CACHE_CONFIG, getCacheKey
 * invariants: エントリはtimestamp+ttlに基づき有効期限切れ判定される, キーはツール名とパラメータから決定的に生成される
 * side_effects: なし（純粋なデータ構造とユーティリティ）
 * failure_modes: 有効期限切れのデータが読み出される, maxEntries超過による古いデータの排除, params順序差によるキー不一致
 * @abdd.explain
 * overview: 検索結果のキャッシュエントリ、設定、統計情報の型定義およびキャッシュキー生成機能を提供するモジュール
 * what_it_does:
 *   - キャッシュエントリの構造をタイムスタンプ、TTL、パラメータ、結果で定義する
 *   - キャッシュの動作設定（TTL、最大数、有効無効）と統計情報（ヒット率等）の型を定義する
 *   - デフォルト設定（TTL5分、最大200エントリ）を提供する
 *   - ツール名とパラメータオブジェクトから一意なキャッシュキー文字列を生成する
 * why_it_exists:
 *   - 検索結果の構造と有効期限管理を型安全に扱うため
 *   - キャッシュの振る舞いを設定可能にし、異なる環境や要件に対応するため
 *   - パラメータの順序に依存しない安定したキー生成を共通化するため
 * scope:
 *   in: なし
 *   out: TypeScript型定義, 設定定数, キー生成文字列
 */

/**
 * Search Result Cache
 *
 * Provides caching for search tool results:
 * - TTL-based expiration
 * - Pattern-based invalidation
 * - Type-safe cache entries
 */

// ============================================
// Types
// ============================================

/**
 * キャッシュエントリ定義
 * @summary キャッシュエントリ
 * @param timestamp エントリが作成されたタイムスタンプ
 * @param ttl 有効期限（ミリ秒）
 * @param params 結果生成に使用されたパラメータ
 * @returns キャッシュされた結果データ
 */
export interface CacheEntry<T> {
	/**
	 * Timestamp when the entry was created.
	 */
	timestamp: number;

	/**
	 * Time-to-live in milliseconds.
	 */
	ttl: number;

	/**
	 * Original parameters used to generate this result.
	 */
	params: Record<string, unknown>;

	/**
	 * Cached result.
	 */
	result: T;
}

/**
 * キャッシュ設定を保持する
 * @summary キャッシュ設定
 * @param defaultTtl デフォルトのTTL（ミリ秒）
 * @param maxEntries 最大エントリ数
 * @param enabled キャッシュを有効にするかどうか
 */
export interface CacheConfig {
	/**
	 * Default TTL in milliseconds.
	 */
	defaultTtl: number;

	/**
	 * Maximum number of entries.
	 */
	maxEntries: number;

	/**
	 * Whether to enable cache.
	 */
	enabled: boolean;
}

/**
 * キャッシュ統計情報を定義
 * @summary 統計情報を取得
 * @param entries エントリの総数
 * @param hits キャッシュヒット数
 * @param misses キャッシュミス数
 * @param hitRate ヒット率
 */
export interface CacheStats {
	/**
	 * Total number of entries.
	 */
	entries: number;

	/**
	 * Number of cache hits.
	 */
	hits: number;

	/**
	 * Number of cache misses.
	 */
	misses: number;

	/**
	 * Hit rate (0.0-1.0).
	 */
	hitRate: number;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default cache configuration.
 * TTL is 5 minutes, max 200 entries.
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
	defaultTtl: 5 * 60 * 1000, // 5 minutes
	maxEntries: 200,
	enabled: true,
};

// ============================================
// Cache Key Generation
// ============================================

 /**
  * キャッシュキーを生成する
  * @param tool ツール名
  * @param params パラメータオブジェクト
  * @returns 生成されたキャッシュキー
  */
export function getCacheKey(tool: string, params: Record<string, unknown>): string {
	// Sort keys for deterministic ordering
	const sortedKeys = Object.keys(params).sort();
	const keyParts = [tool];

	for (const key of sortedKeys) {
		const value = params[key];
		// Skip undefined values
		if (value === undefined) continue;

		// Handle different value types
		if (value === null) {
			keyParts.push(`${key}:null`);
		} else if (Array.isArray(value)) {
			keyParts.push(`${key}:[${value.sort().join(",")}]`);
		} else if (typeof value === "object") {
			// Recursively sort nested objects
			keyParts.push(`${key}:${JSON.stringify(sortObjectKeys(value as Record<string, unknown>))}`);
		} else {
			keyParts.push(`${key}:${String(value)}`);
		}
	}

	return keyParts.join("|");
}

/**
 * Sort object keys recursively for consistent serialization.
 */
function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) {
		const value = obj[key];
		if (value !== undefined) {
			sorted[key] = value;
		}
	}
	return sorted;
}

// ============================================
// Cache Store
// ============================================

/**
 * 検索結果をキャッシュする
 * @summary キャッシュを生成
 * @param config - キャッシュ設定（オプション）
 */
export class SearchResultCache {
	private cache = new Map<string, CacheEntry<unknown>>();
	private config: CacheConfig;
	private hits = 0;
	private misses = 0;

	constructor(config: Partial<CacheConfig> = {}) {
		this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
	}

	 /**
	  * キャッシュされた結果を取得する
	  * @param key キャッシュキー
	  * @returns キャッシュされた結果、存在しない場合は undefined
	  */
	getCached<T>(key: string): T | undefined {
		if (!this.config.enabled) {
			this.misses++;
			return undefined;
		}

		const entry = this.cache.get(key) as CacheEntry<T> | undefined;

		if (!entry) {
			this.misses++;
			return undefined;
		}

		// Check TTL
		if (this.isExpired(entry)) {
			this.cache.delete(key);
			this.misses++;
			return undefined;
		}

		this.hits++;
		return entry.result;
	}

	/**
	 * 結果をキャッシュに保存
	 * @summary キャッシュ保存
	 * @param key キャッシュのキー
	 * @param result 保存する結果
	 * @param ttl 生存時間（ミリ秒）
	 * @param params 追加のパラメータ
	 * @returns なし
	 */
	setCache<T>(key: string, result: T, ttl?: number, params?: Record<string, unknown>): void {
		if (!this.config.enabled) return;

		// Enforce max entries
		if (this.cache.size >= this.config.maxEntries) {
			this.evictOldest();
		}

		const entry: CacheEntry<T> = {
			timestamp: Date.now(),
			ttl: ttl ?? this.config.defaultTtl,
			params: params ?? {},
			result,
		};

		this.cache.set(key, entry as CacheEntry<unknown>);
	}

	/**
	 * @summary キー有効性確認
	 * キーの存在と有効期限を確認する
	 * @param key 確認するキャッシュのキー
	 * @returns キーが存在し有効な場合はtrue
	 */
	has(key: string): boolean {
		if (!this.config.enabled) return false;

		const entry = this.cache.get(key);
		if (!entry) return false;

		if (this.isExpired(entry)) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	 /**
	  * パターン一致するキャッシュエントリを無効化
	  * @param pattern ワイルドカード（*）を含むことができるパターン
	  * @returns 削除されたエントリの数
	  */
	invalidateCache(pattern: string): number {
		let count = 0;

		// Exact match
		if (!pattern.includes("*")) {
			if (this.cache.delete(pattern)) {
				count = 1;
			}
			return count;
		}

		// Pattern matching
		const regex = this.patternToRegex(pattern);
		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
				count++;
			}
		}

		return count;
	}

	/**
	 * ツールエントリを無効化
	 * @summary エントリを無効化
	 * @param tool ツール名
	 * @returns 削除されたエントリ数
	 */
	invalidateTool(tool: string): number {
		let count = 0;
		const prefix = `${tool}|`;

		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
				count++;
			}
		}

		return count;
	}

	/**
	 * キャッシュをクリア
	 * @summary キャッシュをクリア
	 * @returns なし
	 */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	/**
	 * 統計情報を取得
	 * @summary 統計情報取得
	 * @returns キャッシュのエントリ数、ヒット数、ミス数、ヒット率を含む統計情報
	 */
	getStats(): CacheStats {
		const total = this.hits + this.misses;
		return {
			entries: this.cache.size,
			hits: this.hits,
			misses: this.misses,
			hitRate: total > 0 ? this.hits / total : 0,
		};
	}

	/**
	 * 全キーを取得する
	 * @summary 全キー取得
	 * @returns キャッシュに保存されている全てのキーの配列。
	 */
	getKeys(): string[] {
		return Array.from(this.cache.keys());
	}

	/**
	 * Check if entry is expired.
	 */
	private isExpired<T>(entry: CacheEntry<T>): boolean {
		return Date.now() > entry.timestamp + entry.ttl;
	}

	/**
	 * Evict the oldest entry.
	 */
	private evictOldest(): void {
		let oldestKey: string | undefined;
		let oldestTime = Infinity;

		for (const [key, entry] of this.cache) {
			if (entry.timestamp < oldestTime) {
				oldestTime = entry.timestamp;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
		}
	}

	/**
	 * Convert wildcard pattern to RegExp.
	 */
	private patternToRegex(pattern: string): RegExp {
		const escaped = pattern
			.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
			.replace(/\*/g, ".*");
		return new RegExp(`^${escaped}$`);
	}
}

// ============================================
// Global Instance (Singleton)
// ============================================

/**
 * Global cache instance.
 * Shared across all search tools in a session.
 */
let globalCache: SearchResultCache | undefined;

 /**
  * グローバルキャッシュインスタンスを取得する。
  * @returns 検索結果キャッシュのインスタンス
  */
export function getSearchCache(): SearchResultCache {
	if (!globalCache) {
		globalCache = new SearchResultCache();
	}
	return globalCache;
}

/**
 * グローバルキャッシュをリセットする
 * @summary キャッシュをリセット
 * @returns {void}
 */
export function resetSearchCache(): void {
	globalCache = undefined;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * キャッシュを取得または計算して返す
 * @summary キャッシュ取得または計算
 * @param tool ツール名
 * @param params パラメータ
 * @param factory 値を生成する非同期関数
 * @param ttl キャッシュ有効期間（秒）
 * @returns キャッシュされた値または計算結果
 */
export async function getOrCompute<T>(
	tool: string,
	params: Record<string, unknown>,
	factory: () => Promise<T>,
	ttl?: number
): Promise<T> {
	const cache = getSearchCache();
	const key = getCacheKey(tool, params);

	const cached = cache.getCached<T>(key);
	if (cached !== undefined) {
		return cached;
	}

	const result = await factory();
	cache.setCache(key, result, ttl, params);
	return result;
}

/**
 * キャッシュを取得または計算して返す（同期版）
 * @summary キャッシュ取得または計算
 * @param tool ツール名
 * @param params パラメータ
 * @param factory 値を生成する関数
 * @param ttl キャッシュ有効期間（秒）
 * @returns キャッシュされた値または計算結果
 */
export function getOrComputeSync<T>(
	tool: string,
	params: Record<string, unknown>,
	factory: () => T,
	ttl?: number
): T {
	const cache = getSearchCache();
	const key = getCacheKey(tool, params);

	const cached = cache.getCached<T>(key);
	if (cached !== undefined) {
		return cached;
	}

	const result = factory();
	cache.setCache(key, result, ttl, params);
	return result;
}
