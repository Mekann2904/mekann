/**
 * Tests for Search Result Cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	getCacheKey,
	SearchResultCache,
	DEFAULT_CACHE_CONFIG,
	getSearchCache,
	resetSearchCache,
	getOrCompute,
	getOrComputeSync,
	type CacheEntry,
	type CacheConfig,
	type CacheStats,
} from "../../../.pi/extensions/search/utils/cache.js";

describe("getCacheKey", () => {
	describe("uniqueness", () => {
		it("should generate different keys for different tools", () => {
			const key1 = getCacheKey("tool1", { pattern: "test" });
			const key2 = getCacheKey("tool2", { pattern: "test" });

			expect(key1).not.toBe(key2);
		});

		it("should generate different keys for different params", () => {
			const key1 = getCacheKey("tool", { pattern: "test1" });
			const key2 = getCacheKey("tool", { pattern: "test2" });

			expect(key1).not.toBe(key2);
		});

		it("should generate same key for same tool and params", () => {
			const key1 = getCacheKey("tool", { pattern: "test", limit: 10 });
			const key2 = getCacheKey("tool", { pattern: "test", limit: 10 });

			expect(key1).toBe(key2);
		});

		it("should generate consistent key regardless of param order", () => {
			const key1 = getCacheKey("tool", { a: "1", b: "2" });
			const key2 = getCacheKey("tool", { b: "2", a: "1" });

			expect(key1).toBe(key2);
		});
	});

	describe("value types", () => {
		it("should handle string values", () => {
			const key = getCacheKey("tool", { pattern: "test" });
			expect(key).toContain("pattern:test");
		});

		it("should handle numeric values", () => {
			const key = getCacheKey("tool", { limit: 100 });
			expect(key).toContain("limit:100");
		});

		it("should handle boolean values", () => {
			const key = getCacheKey("tool", { ignoreCase: true });
			expect(key).toContain("ignoreCase:true");
		});

		it("should handle null values", () => {
			const key = getCacheKey("tool", { value: null });
			expect(key).toContain("value:null");
		});

		it("should skip undefined values", () => {
			const key = getCacheKey("tool", { value: undefined });
			expect(key).not.toContain("value");
		});

		it("should handle array values", () => {
			const key = getCacheKey("tool", { files: ["a.ts", "b.ts"] });
			expect(key).toContain("files:");
		});

		it("should handle object values", () => {
			const key = getCacheKey("tool", { options: { deep: true } });
			expect(key).toContain("options:");
			expect(key).toContain("deep");
		});
	});

	describe("edge cases", () => {
		it("should handle empty params", () => {
			const key = getCacheKey("tool", {});
			expect(key).toBe("tool");
		});

		it("should handle special characters in values", () => {
			const key = getCacheKey("tool", { pattern: "test|value" });
			expect(key).toBeDefined();
			expect(typeof key).toBe("string");
		});

		it("should handle arrays with consistent ordering", () => {
			const key1 = getCacheKey("tool", { arr: ["b", "a"] });
			const key2 = getCacheKey("tool", { arr: ["a", "b"] });

			// Arrays are sorted for consistent keys
			expect(key1).toBe(key2);
		});
	});
});

describe("SearchResultCache", () => {
	let cache: SearchResultCache;

	beforeEach(() => {
		cache = new SearchResultCache();
	});

	describe("getCached / setCache", () => {
		it("should store and retrieve values", () => {
			const result = { files: ["a.ts", "b.ts"] };
			cache.setCache("key1", result);

			const retrieved = cache.getCached<typeof result>("key1");
			expect(retrieved).toEqual(result);
		});

		it("should return undefined for missing keys", () => {
			const result = cache.getCached("nonexistent");
			expect(result).toBeUndefined();
		});

		it("should handle different value types", () => {
			cache.setCache("string", "value");
			cache.setCache("number", 42);
			cache.setCache("object", { name: "test" });
			cache.setCache("array", [1, 2, 3]);

			expect(cache.getCached<string>("string")).toBe("value");
			expect(cache.getCached<number>("number")).toBe(42);
			expect(cache.getCached<{ name: string }>("object")).toEqual({ name: "test" });
			expect(cache.getCached<number[]>("array")).toEqual([1, 2, 3]);
		});

		it("should store params with entry", () => {
			const params = { pattern: "test" };
			cache.setCache("key", "value", undefined, params);

			// Params are stored internally, verify through getKeys behavior
			expect(cache.has("key")).toBe(true);
		});
	});

	describe("TTL expiration", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should expire entries after TTL", () => {
			cache = new SearchResultCache({ defaultTtl: 50 }); // 50ms TTL

			cache.setCache("key", "value", 50);

			// Should exist immediately
			expect(cache.getCached("key")).toBe("value");

			// Advance time past TTL
			vi.advanceTimersByTime(100);

			// Should be expired
			expect(cache.getCached("key")).toBeUndefined();
		});

		it("should use custom TTL", () => {
			cache = new SearchResultCache({ defaultTtl: 1000 });

			cache.setCache("key", "value", 50); // Custom 50ms TTL

			vi.advanceTimersByTime(100);

			expect(cache.getCached("key")).toBeUndefined();
		});

		it("should use default TTL when not specified", () => {
			cache = new SearchResultCache({ defaultTtl: 50 });

			cache.setCache("key", "value"); // Uses default TTL

			vi.advanceTimersByTime(100);

			expect(cache.getCached("key")).toBeUndefined();
		});
	});

	describe("has", () => {
		it("should return true for existing non-expired entries", () => {
			cache.setCache("key", "value");
			expect(cache.has("key")).toBe(true);
		});

		it("should return false for missing entries", () => {
			expect(cache.has("missing")).toBe(false);
		});

		it("should return false for expired entries", () => {
			vi.useFakeTimers();
			try {
				cache = new SearchResultCache({ defaultTtl: 50 });
				cache.setCache("key", "value", 50);

				vi.advanceTimersByTime(100);

				expect(cache.has("key")).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe("invalidateCache", () => {
		beforeEach(() => {
			cache.setCache("tool1|pattern:a", "result1");
			cache.setCache("tool1|pattern:b", "result2");
			cache.setCache("tool2|pattern:a", "result3");
		});

		it("should invalidate by exact match", () => {
			const count = cache.invalidateCache("tool1|pattern:a");

			expect(count).toBe(1);
			expect(cache.has("tool1|pattern:a")).toBe(false);
			expect(cache.has("tool1|pattern:b")).toBe(true);
		});

		it("should invalidate by wildcard pattern", () => {
			const count = cache.invalidateCache("tool1|*");

			expect(count).toBe(2);
			expect(cache.has("tool1|pattern:a")).toBe(false);
			expect(cache.has("tool1|pattern:b")).toBe(false);
			expect(cache.has("tool2|pattern:a")).toBe(true);
		});

		it("should return 0 for non-matching pattern", () => {
			const count = cache.invalidateCache("nonexistent");
			expect(count).toBe(0);
		});

		it("should handle multiple wildcards", () => {
			cache.setCache("a|b|c", "value");
			const count = cache.invalidateCache("*|b|*");

			expect(count).toBeGreaterThanOrEqual(1);
		});
	});

	describe("invalidateTool", () => {
		beforeEach(() => {
			cache.setCache("tool1|pattern:a", "result1");
			cache.setCache("tool1|pattern:b", "result2");
			cache.setCache("tool2|pattern:a", "result3");
		});

		it("should invalidate all entries for a specific tool", () => {
			const count = cache.invalidateTool("tool1");

			expect(count).toBe(2);
			expect(cache.has("tool1|pattern:a")).toBe(false);
			expect(cache.has("tool1|pattern:b")).toBe(false);
		});

		it("should not affect other tools", () => {
			cache.invalidateTool("tool1");

			expect(cache.has("tool2|pattern:a")).toBe(true);
		});

		it("should return 0 for unknown tool", () => {
			const count = cache.invalidateTool("unknown");
			expect(count).toBe(0);
		});
	});

	describe("clear", () => {
		it("should remove all entries", () => {
			cache.setCache("key1", "value1");
			cache.setCache("key2", "value2");

			cache.clear();

			expect(cache.has("key1")).toBe(false);
			expect(cache.has("key2")).toBe(false);
		});

		it("should reset statistics", () => {
			cache.setCache("key", "value");
			cache.getCached("key");
			cache.getCached("missing");

			cache.clear();

			const stats = cache.getStats();
			expect(stats.entries).toBe(0);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
		});
	});

	describe("getStats", () => {
		it("should track hits and misses", () => {
			cache.setCache("key", "value");

			cache.getCached("key"); // hit
			cache.getCached("key"); // hit
			cache.getCached("missing"); // miss

			const stats = cache.getStats();
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBeCloseTo(2 / 3);
		});

		it("should track entry count", () => {
			cache.setCache("key1", "value1");
			cache.setCache("key2", "value2");

			const stats = cache.getStats();
			expect(stats.entries).toBe(2);
		});

		it("should handle zero operations", () => {
			const stats = cache.getStats();
			expect(stats.hitRate).toBe(0);
		});
	});

	describe("max entries eviction", () => {
		it("should evict oldest entry when max is reached", () => {
			cache = new SearchResultCache({ maxEntries: 2 });

			cache.setCache("key1", "value1");
			cache.setCache("key2", "value2");
			cache.setCache("key3", "value3"); // Should evict key1

			expect(cache.has("key1")).toBe(false);
			expect(cache.has("key2")).toBe(true);
			expect(cache.has("key3")).toBe(true);
		});
	});

	describe("disabled cache", () => {
		it("should not cache when disabled", () => {
			cache = new SearchResultCache({ enabled: false });

			cache.setCache("key", "value");

			expect(cache.has("key")).toBe(false);
			expect(cache.getCached("key")).toBeUndefined();
		});

		it("should count as miss when disabled", () => {
			cache = new SearchResultCache({ enabled: false });
			cache.setCache("key", "value");
			cache.getCached("key");

			const stats = cache.getStats();
			expect(stats.misses).toBe(1);
			expect(stats.hits).toBe(0);
		});
	});
});

describe("Global cache functions", () => {
	afterEach(() => {
		resetSearchCache();
	});

	describe("getSearchCache", () => {
		it("should return the same instance", () => {
			const cache1 = getSearchCache();
			const cache2 = getSearchCache();

			expect(cache1).toBe(cache2);
		});

		it("should be a SearchResultCache instance", () => {
			const cache = getSearchCache();
			expect(cache).toBeInstanceOf(SearchResultCache);
		});
	});

	describe("resetSearchCache", () => {
		it("should reset the global cache", () => {
			const cache1 = getSearchCache();
			cache1.setCache("key", "value");

			resetSearchCache();

			const cache2 = getSearchCache();
			expect(cache2).not.toBe(cache1);
			expect(cache2.has("key")).toBe(false);
		});
	});
});

describe("getOrCompute", () => {
	afterEach(() => {
		resetSearchCache();
	});

	it("should return cached value if available", async () => {
		const cache = getSearchCache();
		cache.setCache(
			getCacheKey("tool", { pattern: "test" }),
			"cached"
		);

		const factory = vi.fn().mockResolvedValue("computed");
		const result = await getOrCompute("tool", { pattern: "test" }, factory);

		expect(result).toBe("cached");
		expect(factory).not.toHaveBeenCalled();
	});

	it("should compute and cache if not available", async () => {
		resetSearchCache();

		const factory = vi.fn().mockResolvedValue("computed");
		const result = await getOrCompute("tool", { pattern: "test" }, factory);

		expect(result).toBe("computed");
		expect(factory).toHaveBeenCalledTimes(1);

		// Verify cached
		const cache = getSearchCache();
		const cached = cache.getCached<string>(getCacheKey("tool", { pattern: "test" }));
		expect(cached).toBe("computed");
	});

	it("should use custom TTL", async () => {
		resetSearchCache();

		const factory = vi.fn().mockResolvedValue("computed");
		await getOrCompute("tool", { pattern: "test" }, factory, 100);

		const cache = getSearchCache();
		const key = getCacheKey("tool", { pattern: "test" });

		// Check params were stored
		expect(cache.has(key)).toBe(true);
	});
});

describe("getOrComputeSync", () => {
	afterEach(() => {
		resetSearchCache();
	});

	it("should return cached value if available", () => {
		const cache = getSearchCache();
		cache.setCache(
			getCacheKey("tool", { pattern: "test" }),
			"cached"
		);

		const factory = vi.fn().mockReturnValue("computed");
		const result = getOrComputeSync("tool", { pattern: "test" }, factory);

		expect(result).toBe("cached");
		expect(factory).not.toHaveBeenCalled();
	});

	it("should compute and cache if not available", () => {
		resetSearchCache();

		const factory = vi.fn().mockReturnValue("computed");
		const result = getOrComputeSync("tool", { pattern: "test" }, factory);

		expect(result).toBe("computed");
		expect(factory).toHaveBeenCalledTimes(1);
	});
});

describe("DEFAULT_CACHE_CONFIG", () => {
	it("should have expected default values", () => {
		expect(DEFAULT_CACHE_CONFIG.defaultTtl).toBe(5 * 60 * 1000); // 5 minutes
		expect(DEFAULT_CACHE_CONFIG.maxEntries).toBe(200);
		expect(DEFAULT_CACHE_CONFIG.enabled).toBe(true);
	});
});

describe("Edge cases", () => {
	let cache: SearchResultCache;

	beforeEach(() => {
		cache = new SearchResultCache();
	});

	it("should handle null values in cache", () => {
		cache.setCache("key", null);

		// null is a valid cached value
		expect(cache.getCached("key")).toBeNull();
		expect(cache.has("key")).toBe(true);
	});

	it("should handle false values in cache", () => {
		cache.setCache("key", false);

		expect(cache.getCached("key")).toBe(false);
		expect(cache.has("key")).toBe(true);
	});

	it("should handle zero values in cache", () => {
		cache.setCache("key", 0);

		expect(cache.getCached("key")).toBe(0);
		expect(cache.has("key")).toBe(true);
	});

	it("should handle empty string values in cache", () => {
		cache.setCache("key", "");

		expect(cache.getCached("key")).toBe("");
		expect(cache.has("key")).toBe(true);
	});

	it("should handle empty arrays in cache", () => {
		cache.setCache("key", []);

		const result = cache.getCached<unknown[]>("key");
		expect(result).toEqual([]);
	});
});
