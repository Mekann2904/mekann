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
  * メタデータを持つ単一のキャッシュエントリ
  * @param timestamp エントリが作成されたタイムスタンプ
  * @param ttl 有効期限（ミリ秒）
  * @param params 結果生成に使用されたパラメータ
  * @param result キャッシュされた結果データ
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
  * キャッシュ設定
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
  * キャッシュの統計情報。
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
  * 検索結果をキャッシュするクラス
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
	  * 結果をキャッシュに保存する
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
	  * キーの存在と有効性を確認
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
	  * 特定のツールのエントリを無効化する
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
	  * すべてのキャッシュエントリをクリアする。
	  * @returns なし
	  */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	 /**
	  * キャッシュの統計情報を取得します。
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
	  * キャッシュの全キーを取得する。
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
  * @param tool ツール名
  * @param params パラメータ
  * @param factory 値を生成する非同期関数
  * @param ttl キャッシュの有効期限（秒）
  * @returns キャッシュされた値、または生成された値
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
  * getOrComputeの同期バージョン
  * @param tool ツール名
  * @param params パラメータ
  * @param factory 値を生成する関数
  * @param ttl キャッシュの存続期間
  * @returns キャッシュされた値、または生成された値
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
