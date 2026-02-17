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
 * A single cache entry with metadata.
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
 * Cache configuration.
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
 * Cache statistics.
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
 * Generate a cache key from tool name and parameters.
 * Creates a deterministic string representation.
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
 * Type-safe cache store with TTL support.
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
	 * Get a cached result if available and not expired.
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
	 * Store a result in the cache.
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
	 * Check if a key exists and is not expired.
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
	 * Invalidate cache entries matching a pattern.
	 * Pattern can include wildcards (*).
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
	 * Invalidate all entries for a specific tool.
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
	 * Clear all cache entries.
	 */
	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	/**
	 * Get cache statistics.
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
	 * Get all cache keys (for debugging).
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
 * Get the global cache instance.
 */
export function getSearchCache(): SearchResultCache {
	if (!globalCache) {
		globalCache = new SearchResultCache();
	}
	return globalCache;
}

/**
 * Reset the global cache instance (for testing).
 */
export function resetSearchCache(): void {
	globalCache = undefined;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Get or compute a cached result.
 * If the result is not cached, calls the factory function and caches the result.
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
 * Sync version of getOrCompute.
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
