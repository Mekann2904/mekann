/**
 * @abdd.meta
 * path: tests/unit/extensions/search/utils/cache.test.ts
 * role: キャッシュ機能の単体テスト
 * why: 検索結果キャッシュのTTL期限、maxSize制限、LRU退避が正しく動作することを保証するため
 * related: .pi/extensions/search/utils/cache.ts
 * public_api: SearchResultCache, getCacheKey, getOrCompute
 * invariants: TTL期限切れエントリは取得不可、maxEntries超過時はLRUで退避
 * side_effects: Date.now()、Map操作
 * failure_modes: メモリリーク、TTL設定ミス、キー衝突
 * @abdd.explain
 * overview: 検索結果キャッシュの基本機能、TTL期限、maxSize制限、パターン無効化をテストする
 * what_it_does:
 *   - getCacheKey関数のキー生成をテスト
 *   - SearchResultCacheクラスのCRUD操作をテスト
 *   - TTL期限切れの動作をテスト
 *   - maxSize超過時のLRU退避をテスト
 * why_it_exists:
 *   - キャッシュ機能の正確性を保証し、データ整合性を維持するため
 * scope:
 *   in: SearchResultCacheクラス、getCacheKey関数
 *   out: テストの実行結果
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	SearchResultCache,
	getCacheKey,
	getOrCompute,
	getOrComputeSync,
	getSearchCache,
	resetSearchCache,
	DEFAULT_CACHE_CONFIG,
	CacheEntry,
	CacheConfig,
	CacheStats,
} from '@ext/search/utils/cache';

describe('getCacheKey', () => {
	describe('基本的なキー生成', () => {
		it('正常系: ツール名とパラメータからキーを生成する', () => {
			const key = getCacheKey('test-tool', { query: 'hello' });
			expect(key).toBe('test-tool|query:hello');
		});

		it('正常系: 複数パラメータの場合、キー順序でソートされる', () => {
			const key1 = getCacheKey('tool', { b: 2, a: 1 });
			const key2 = getCacheKey('tool', { a: 1, b: 2 });
			expect(key1).toBe(key2);
			expect(key1).toBe('tool|a:1|b:2');
		});

		it('正常系: undefined値は除外される', () => {
			const key = getCacheKey('tool', { a: 1, b: undefined });
			expect(key).toBe('tool|a:1');
		});

		it('正常系: null値はnullとして含まれる', () => {
			const key = getCacheKey('tool', { a: null });
			expect(key).toBe('tool|a:null');
		});
	});

	describe('配列値', () => {
		it('正常系: 配列値はソートされて含まれる', () => {
			const key = getCacheKey('tool', { tags: ['b', 'a', 'c'] });
			expect(key).toBe('tool|tags:[a,b,c]');
		});

		it('正常系: 空配列を処理できる', () => {
			const key = getCacheKey('tool', { items: [] });
			expect(key).toBe('tool|items:[]');
		});
	});

	describe('オブジェクト値', () => {
		it('正常系: ネストしたオブジェクトはJSON文字列化される', () => {
			const key = getCacheKey('tool', { filter: { name: 'test', value: 1 } });
			expect(key).toContain('tool|filter:');
			expect(key).toContain('"name":"test"');
		});

		it('正常系: キー順序が異なるオブジェクトは同じキーになる', () => {
			const key1 = getCacheKey('tool', { obj: { b: 2, a: 1 } });
			const key2 = getCacheKey('tool', { obj: { a: 1, b: 2 } });
			expect(key1).toBe(key2);
		});
	});

	describe('空パラメータ', () => {
		it('正常系: 空オブジェクトの場合はツール名のみ', () => {
			const key = getCacheKey('tool', {});
			expect(key).toBe('tool');
		});
	});
});

describe('SearchResultCache', () => {
	let cache: SearchResultCache;

	beforeEach(() => {
		cache = new SearchResultCache();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		cache.clear();
	});

	describe('constructor', () => {
		it('正常系: デフォルト設定でインスタンスを生成できる', () => {
			const defaultCache = new SearchResultCache();
			expect(defaultCache).toBeInstanceOf(SearchResultCache);
		});

		it('正常系: カスタム設定でインスタンスを生成できる', () => {
			const customCache = new SearchResultCache({
				defaultTtl: 10000,
				maxEntries: 50,
				enabled: false,
			});
			expect(customCache).toBeInstanceOf(SearchResultCache);
		});
	});

	describe('getCached / setCache', () => {
		it('正常系: 値を設定して取得できる', () => {
			cache.setCache('key1', 'value1');
			const result = cache.getCached<string>('key1');
			expect(result).toBe('value1');
		});

		it('正常系: 存在しないキーはundefinedを返す', () => {
			const result = cache.getCached<string>('nonexistent');
			expect(result).toBeUndefined();
		});

		it('正常系: 複数の値を設定・取得できる', () => {
			cache.setCache('key1', 'value1');
			cache.setCache('key2', 'value2');
			cache.setCache('key3', { nested: 'object' });

			expect(cache.getCached<string>('key1')).toBe('value1');
			expect(cache.getCached<string>('key2')).toBe('value2');
			expect(cache.getCached<{ nested: string }>('key3')).toEqual({ nested: 'object' });
		});

		it('正常系: 同じキーで上書きできる', () => {
			cache.setCache('key1', 'value1');
			cache.setCache('key1', 'value2');

			expect(cache.getCached<string>('key1')).toBe('value2');
		});

		it('正常系: カスタムTTLを設定できる', () => {
			cache.setCache('key1', 'value1', 5000); // 5秒

			vi.advanceTimersByTime(4999);
			expect(cache.getCached<string>('key1')).toBe('value1');

			vi.advanceTimersByTime(2);
			expect(cache.getCached<string>('key1')).toBeUndefined();
		});

		it('正常系: パラメータを含めて設定できる', () => {
			cache.setCache('key1', 'value1', undefined, { query: 'test' });

			expect(cache.getCached<string>('key1')).toBe('value1');
		});
	});

	describe('TTL期限切れ', () => {
		it('正常系: TTL期限切れのエントリはundefinedを返す', () => {
			const shortCache = new SearchResultCache({ defaultTtl: 100 });
			shortCache.setCache('key1', 'value1');

			vi.advanceTimersByTime(101);

			expect(shortCache.getCached<string>('key1')).toBeUndefined();
		});

		it('正常系: TTL期限切れのエントリは削除される', () => {
			const shortCache = new SearchResultCache({ defaultTtl: 100 });
			shortCache.setCache('key1', 'value1');

			vi.advanceTimersByTime(101);
			shortCache.getCached<string>('key1');

			expect(shortCache.getStats().entries).toBe(0);
		});

		it('正常系: 期限切れ直前のエントリは取得できる', () => {
			const shortCache = new SearchResultCache({ defaultTtl: 100 });
			shortCache.setCache('key1', 'value1');

			vi.advanceTimersByTime(99);

			expect(shortCache.getCached<string>('key1')).toBe('value1');
		});
	});

	describe('maxEntries制限 (LRU退避)', () => {
		it('正常系: maxEntriesを超えると最も古いエントリが削除される', () => {
			const smallCache = new SearchResultCache({ maxEntries: 2 });

			smallCache.setCache('key1', 'value1');
			smallCache.setCache('key2', 'value2');
			smallCache.setCache('key3', 'value3');

			expect(smallCache.getCached<string>('key1')).toBeUndefined();
			expect(smallCache.getCached<string>('key2')).toBe('value2');
			expect(smallCache.getCached<string>('key3')).toBe('value3');
		});

		it('正常系: アクセスされるとLRU順序が更新される', () => {
			const smallCache = new SearchResultCache({ maxEntries: 2 });

			smallCache.setCache('key1', 'value1');
			smallCache.setCache('key2', 'value2');
			smallCache.getCached<string>('key1'); // key1にアクセス
			smallCache.setCache('key3', 'value3'); // key2が退避される

			expect(smallCache.getCached<string>('key1')).toBe('value1');
			expect(smallCache.getCached<string>('key2')).toBeUndefined();
			expect(smallCache.getCached<string>('key3')).toBe('value3');
		});
	});

	describe('has', () => {
		it('正常系: 存在するキーはtrueを返す', () => {
			cache.setCache('key1', 'value1');
			expect(cache.has('key1')).toBe(true);
		});

		it('正常系: 存在しないキーはfalseを返す', () => {
			expect(cache.has('nonexistent')).toBe(false);
		});

		it('正常系: TTL期限切れのキーはfalseを返す', () => {
			const shortCache = new SearchResultCache({ defaultTtl: 100 });
			shortCache.setCache('key1', 'value1');

			vi.advanceTimersByTime(101);

			expect(shortCache.has('key1')).toBe(false);
		});

		it('正常系: キャッシュ無効時はfalseを返す', () => {
			const disabledCache = new SearchResultCache({ enabled: false });
			disabledCache.setCache('key1', 'value1');

			expect(disabledCache.has('key1')).toBe(false);
		});
	});

	describe('invalidateCache', () => {
		beforeEach(() => {
			cache.setCache('tool1|query:a', 'result1');
			cache.setCache('tool1|query:b', 'result2');
			cache.setCache('tool2|query:a', 'result3');
		});

		it('正常系: 完全一致でエントリを削除できる', () => {
			const count = cache.invalidateCache('tool1|query:a');

			expect(count).toBe(1);
			expect(cache.getCached('tool1|query:a')).toBeUndefined();
			expect(cache.getCached('tool1|query:b')).toBe('result2');
		});

		it('正常系: ワイルドカードパターンで複数エントリを削除できる', () => {
			const count = cache.invalidateCache('tool1|*');

			expect(count).toBe(2);
			expect(cache.getCached('tool1|query:a')).toBeUndefined();
			expect(cache.getCached('tool1|query:b')).toBeUndefined();
			expect(cache.getCached('tool2|query:a')).toBe('result3');
		});

		it('正常系: マッチしないパターンは0を返す', () => {
			const count = cache.invalidateCache('nonexistent|*');
			expect(count).toBe(0);
		});
	});

	describe('invalidateTool', () => {
		beforeEach(() => {
			cache.setCache('tool1|query:a', 'result1');
			cache.setCache('tool1|query:b', 'result2');
			cache.setCache('tool2|query:a', 'result3');
		});

		it('正常系: ツール名で全エントリを削除できる', () => {
			const count = cache.invalidateTool('tool1');

			expect(count).toBe(2);
			expect(cache.getCached('tool1|query:a')).toBeUndefined();
			expect(cache.getCached('tool1|query:b')).toBeUndefined();
			expect(cache.getCached('tool2|query:a')).toBe('result3');
		});

		it('正常系: 存在しないツールは0を返す', () => {
			const count = cache.invalidateTool('nonexistent');
			expect(count).toBe(0);
		});
	});

	describe('clear', () => {
		it('正常系: 全エントリを削除できる', () => {
			cache.setCache('key1', 'value1');
			cache.setCache('key2', 'value2');

			cache.clear();

			expect(cache.getStats().entries).toBe(0);
			expect(cache.getStats().hits).toBe(0);
			expect(cache.getStats().misses).toBe(0);
		});
	});

	describe('getStats', () => {
		it('正常系: 初期状態の統計を取得できる', () => {
			const stats = cache.getStats();

			expect(stats.entries).toBe(0);
			expect(stats.hits).toBe(0);
			expect(stats.misses).toBe(0);
			expect(stats.hitRate).toBe(0);
		});

		it('正常系: ヒット・ミスを正しくカウントする', () => {
			cache.setCache('key1', 'value1');

			cache.getCached('key1'); // hit
			cache.getCached('key1'); // hit
			cache.getCached('nonexistent'); // miss

			const stats = cache.getStats();
			expect(stats.hits).toBe(2);
			expect(stats.misses).toBe(1);
			expect(stats.hitRate).toBeCloseTo(0.666, 2);
		});

		it('正常系: エントリ数を正しくカウントする', () => {
			cache.setCache('key1', 'value1');
			cache.setCache('key2', 'value2');

			expect(cache.getStats().entries).toBe(2);
		});
	});

	describe('getKeys', () => {
		it('正常系: 全キーを取得できる', () => {
			cache.setCache('key1', 'value1');
			cache.setCache('key2', 'value2');

			const keys = cache.getKeys();

			expect(keys).toHaveLength(2);
			expect(keys).toContain('key1');
			expect(keys).toContain('key2');
		});

		it('正常系: 空の場合は空配列を返す', () => {
			const keys = cache.getKeys();
			expect(keys).toEqual([]);
		});
	});

	describe('キャッシュ無効モード', () => {
		it('正常系: enabled=falseの場合、setCacheは無視される', () => {
			const disabledCache = new SearchResultCache({ enabled: false });
			disabledCache.setCache('key1', 'value1');

			expect(disabledCache.getCached('key1')).toBeUndefined();
		});

		it('正常系: enabled=falseの場合、getCachedは常にundefinedを返す', () => {
			const disabledCache = new SearchResultCache({ enabled: false });
			disabledCache.setCache('key1', 'value1');

			expect(disabledCache.getCached('key1')).toBeUndefined();
			expect(disabledCache.getStats().misses).toBe(1);
		});
	});
});

describe('getOrCompute', () => {
	let cache: SearchResultCache;

	beforeEach(() => {
		resetSearchCache();
		cache = getSearchCache();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		resetSearchCache();
	});

	it('正常系: キャッシュにある場合はキャッシュ値を返す', async () => {
		cache.setCache(getCacheKey('tool', { id: 1 }), 'cached');

		const result = await getOrCompute('tool', { id: 1 }, async () => 'computed');

		expect(result).toBe('cached');
	});

	it('正常系: キャッシュにない場合は計算して返す', async () => {
		let callCount = 0;
		const factory = async () => {
			callCount++;
			return 'computed';
		};

		const result = await getOrCompute('tool', { id: 1 }, factory);

		expect(result).toBe('computed');
		expect(callCount).toBe(1);
	});

	it('正常系: 2回目の呼び出しはキャッシュから返す', async () => {
		let callCount = 0;
		const factory = async () => {
			callCount++;
			return 'computed';
		};

		await getOrCompute('tool', { id: 1 }, factory);
		await getOrCompute('tool', { id: 1 }, factory);

		expect(callCount).toBe(1);
	});
});

describe('getOrComputeSync', () => {
	beforeEach(() => {
		resetSearchCache();
	});

	afterEach(() => {
		resetSearchCache();
	});

	it('正常系: キャッシュにある場合はキャッシュ値を返す', () => {
		const cache = getSearchCache();
		cache.setCache(getCacheKey('tool', { id: 1 }), 'cached');

		const result = getOrComputeSync('tool', { id: 1 }, () => 'computed');

		expect(result).toBe('cached');
	});

	it('正常系: キャッシュにない場合は計算して返す', () => {
		let callCount = 0;
		const factory = () => {
			callCount++;
			return 'computed';
		};

		const result = getOrComputeSync('tool', { id: 1 }, factory);

		expect(result).toBe('computed');
		expect(callCount).toBe(1);
	});
});

describe('getSearchCache / resetSearchCache', () => {
	afterEach(() => {
		resetSearchCache();
	});

	it('正常系: シングルトンインスタンスを返す', () => {
		const cache1 = getSearchCache();
		const cache2 = getSearchCache();

		expect(cache1).toBe(cache2);
	});

	it('正常系: リセット後は新しいインスタンスを返す', () => {
		const cache1 = getSearchCache();
		resetSearchCache();
		const cache2 = getSearchCache();

		expect(cache1).not.toBe(cache2);
	});
});

describe('DEFAULT_CACHE_CONFIG', () => {
	it('正常系: デフォルト値が正しい', () => {
		expect(DEFAULT_CACHE_CONFIG.defaultTtl).toBe(5 * 60 * 1000);
		expect(DEFAULT_CACHE_CONFIG.maxEntries).toBe(200);
		expect(DEFAULT_CACHE_CONFIG.enabled).toBe(true);
	});
});
