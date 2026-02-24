/**
 * @abdd.meta
 * path: tests/e2e/search-workflow.e2e.test.ts
 * role: 検索機能のE2Eテスト
 * why: ユーザーが検索を実行し、結果をキャッシュし、メトリクスを収集する完全なワークフローを保証するため
 * related: .pi/extensions/search/utils/cache.ts, .pi/extensions/search/utils/metrics.ts, .pi/lib/embeddings/utils.ts
 * public_api: SearchResultCache, MetricsCollector, cosineSimilarity
 * invariants: キャッシュのTTL、maxSizeが正しく動作し、メトリクスが正確に収集される
 * side_effects: ファイルシステムへのキャッシュ保存、メトリクス記録
 * failure_modes: キャッシュ期限切れ、メトリクス計測エラー
 * @abdd.explain
 * overview: 検索機能のエンドツーエンドワークフローをテストする
 * what_it_does:
 *   - 検索実行、キャッシュ利用、メトリクス収集の統合フローをテスト
 *   - ベクトル検索と類似度計算の連携をテスト
 *   - エラーハンドリングとエッジケースをテスト
 * why_it_exists:
 *   - ユーザーが実際に使用する検索ワークフローが正しく動作することを保証するため
 * scope:
 *   in: 検索クエリ、キャッシュ設定
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
	type CacheStats,
} from '@ext/search/utils/cache';
import {
	MetricsCollector,
	aggregateMetrics,
	formatMetrics,
	classifySpeed,
	DEFAULT_THRESHOLDS,
	type SearchMetrics,
} from '@ext/search/utils/metrics';
import {
	cosineSimilarity,
	findNearestNeighbors,
	findBySimilarityThreshold,
	normalizeVector,
} from '@lib/embeddings/utils';
import { createTempDir, cleanupTempDir } from '../helpers/bdd-helpers';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

/**
 * E2Eテスト: 検索ワークフロー
 *
 * テストシナリオ:
 * 1. 検索実行とキャッシュ
 * 2. メトリクス収集
 * 3. ベクトル検索
 */
describe('Search E2E Workflow', () => {
	describe('Feature: 検索キャッシュワークフロー', () => {
		let cache: SearchResultCache;

		beforeEach(() => {
			cache = new SearchResultCache();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
			cache.clear();
		});

		describe('Scenario: 基本的な検索とキャッシュ', () => {
			it('Given: 検索キャッシュが初期化され、When: 検索を実行すると、Then: 結果がキャッシュされる', async () => {
				// Given: キャッシュが初期化されている
				const tool = 'code-search';
				const params = { query: 'function', limit: 10 };
				const key = getCacheKey(tool, params);

				// When: 検索を実行
				const searchResult = {
					files: ['file1.ts', 'file2.ts'],
					totalMatches: 15,
				};
				cache.setCache(key, searchResult);

				// Then: 結果がキャッシュされる
				const cached = cache.getCached<typeof searchResult>(key);
				expect(cached).toEqual(searchResult);

				// And: 統計が更新される
				const stats = cache.getStats();
				expect(stats.entries).toBe(1);
			});
		});

		describe('Scenario: キャッシュヒット', () => {
			it('Given: 検索結果がキャッシュされ、When: 同じ検索を実行すると、Then: キャッシュから結果が返される', async () => {
				// Given: 結果がキャッシュされている
				const tool = 'file-search';
				const params = { pattern: '*.ts' };
				const key = getCacheKey(tool, params);
				const cachedResult = ['file1.ts', 'file2.ts'];
				cache.setCache(key, cachedResult);

				// When: 同じ検索を実行
				const result = cache.getCached<string[]>(key);

				// Then: キャッシュから結果が返される
				expect(result).toEqual(cachedResult);

				// And: ヒットが記録される
				const stats = cache.getStats();
				expect(stats.hits).toBe(1);
				expect(stats.hitRate).toBe(1);
			});
		});

		describe('Scenario: TTL期限切れ', () => {
			it('Given: キャッシュエントリのTTLが設定され、When: TTLが経過すると、Then: エントリが無効化される', async () => {
				// Given: 短いTTLでエントリを設定
				const shortCache = new SearchResultCache({ defaultTtl: 100 });
				const key = getCacheKey('tool', { q: 'test' });
				shortCache.setCache(key, 'result');

				// When: TTLが経過
				vi.advanceTimersByTime(101);

				// Then: エントリが無効化される
				const result = shortCache.getCached<string>(key);
				expect(result).toBeUndefined();

				// And: ミスが記録される
				const stats = shortCache.getStats();
				expect(stats.misses).toBe(1);
			});
		});

		describe('Scenario: maxSize制限', () => {
			it('Given: キャッシュサイズ制限があり、When: 制限を超えると、Then: 古いエントリが削除される', async () => {
				// Given: 小さなキャッシュサイズ制限
				const smallCache = new SearchResultCache({ maxEntries: 2 });

				// When: 制限を超えるエントリを追加
				smallCache.setCache('key1', 'result1');
				smallCache.setCache('key2', 'result2');
				smallCache.setCache('key3', 'result3');

				// Then: 最も古いエントリが削除される
				expect(smallCache.getCached('key1')).toBeUndefined();
				expect(smallCache.getCached('key2')).toBe('result2');
				expect(smallCache.getCached('key3')).toBe('result3');
			});
		});

		describe('Scenario: パターン無効化', () => {
			it('Given: 複数のキャッシュエントリがあり、When: パターンで無効化すると、Then: 一致するエントリが削除される', async () => {
				// Given: 複数のエントリ
				cache.setCache('tool1|query:a', 'result1');
				cache.setCache('tool1|query:b', 'result2');
				cache.setCache('tool2|query:a', 'result3');

				// When: パターンで無効化
				const count = cache.invalidateCache('tool1|*');

				// Then: 一致するエントリが削除される
				expect(count).toBe(2);
				expect(cache.getCached('tool1|query:a')).toBeUndefined();
				expect(cache.getCached('tool2|query:a')).toBe('result3');
			});
		});
	});

	describe('Feature: メトリクス収集ワークフロー', () => {
		describe('Scenario: 単一の検索メトリクス', () => {
			it('Given: 検索を実行し、When: メトリクスを収集すると、Then: 正確なメトリクスが記録される', async () => {
				// Given: メトリクスコレクター
				const collector = new MetricsCollector('code-search');

				// When: 検索を実行（シミュレート）
				collector.setFilesSearched(100);
				collector.setIndexHitRate(0.85);

				// 少し待機
				await new Promise((resolve) => setTimeout(resolve, 10));

				const metrics = collector.finish();

				// Then: 正確なメトリクスが記録される
				expect(metrics.toolName).toBe('code-search');
				expect(metrics.filesSearched).toBe(100);
				expect(metrics.indexHitRate).toBe(0.85);
				expect(metrics.durationMs).toBeGreaterThan(0);
			});
		});

		describe('Scenario: 複数検索の集計', () => {
			it('Given: 複数の検索が実行され、When: メトリクスを集計すると、Then: 正確な統計が生成される', async () => {
				// Given: 複数の検索メトリクス
				const metrics: SearchMetrics[] = [
					{
						durationMs: 100,
						filesSearched: 50,
						indexHitRate: 0.8,
						toolName: 'search1',
					},
					{
						durationMs: 200,
						filesSearched: 100,
						indexHitRate: 0.9,
						toolName: 'search1',
					},
					{
						durationMs: 150,
						filesSearched: 75,
						indexHitRate: 0.85,
						toolName: 'search2',
					},
				];

				// When: メトリクスを集計
				const aggregated = aggregateMetrics(metrics);

				// Then: 正確な統計が生成される
				expect(aggregated.operationCount).toBe(3);
				expect(aggregated.totalDurationMs).toBe(450);
				expect(aggregated.averageDurationMs).toBe(150);
				expect(aggregated.minDurationMs).toBe(100);
				expect(aggregated.maxDurationMs).toBe(200);
				expect(aggregated.totalFilesSearched).toBe(225);
			});
		});

		describe('Scenario: パフォーマンス分類', () => {
			it('Given: 検索時間があり、When: 分類すると、Then: 正しい速度カテゴリが返される', async () => {
				// Given: 検索時間

				// When/Then: 分類結果を確認
				expect(classifySpeed(50)).toBe('fast');
				expect(classifySpeed(500)).toBe('normal');
				expect(classifySpeed(2000)).toBe('slow');
				expect(classifySpeed(10000)).toBe('very-slow');
			});
		});
	});

	describe('Feature: ベクトル検索ワークフロー', () => {
		describe('Scenario: 類似度検索', () => {
			it('Given: ベクトルデータベースがあり、When: クエリで検索すると、Then: 類似したアイテムが返される', async () => {
				// Given: ベクトルデータベース
				const queryVector = [1, 0, 0];
				const items = [
					{ embedding: [0.9, 0.1, 0], id: 'item1', title: 'First' },
					{ embedding: [0.1, 0.9, 0], id: 'item2', title: 'Second' },
					{ embedding: [0.8, 0.2, 0], id: 'item3', title: 'Third' },
				];

				// When: 類似度検索
				const results = findNearestNeighbors(queryVector, items, 2);

				// Then: 類似したアイテムが返される
				expect(results).toHaveLength(2);
				expect(results[0].item.id).toBe('item1');
				expect(results[0].similarity).toBeGreaterThan(0.8);
			});
		});

		describe('Scenario: 閾値フィルタリング', () => {
			it('Given: ベクトルデータベースがあり、When: 閾値を指定して検索すると、Then: 閾値を超えるアイテムのみ返される', async () => {
				// Given: ベクトルデータベース
				const queryVector = [1, 0];
				const items = [
					{ embedding: [0.95, 0.05], id: 'high' },
					{ embedding: [0.6, 0.4], id: 'medium' },
					{ embedding: [0.1, 0.9], id: 'low' },
				];

				// When: 高い閾値で検索
				const results = findBySimilarityThreshold(queryVector, items, 0.9);

				// Then: 閾値を超えるアイテムのみ返される
				expect(results).toHaveLength(1);
				expect(results[0].item.id).toBe('high');
			});
		});

		describe('Scenario: 正規化と検索', () => {
			it('Given: 非正規化ベクトルがあり、When: 正規化して検索すると、Then: 正確な類似度が計算される', async () => {
				// Given: 非正規化ベクトル
				const rawQuery = [5, 5, 5];
				const rawItem = { embedding: [2, 2, 2], id: 'item' };

				// When: 正規化して検索
				const normalizedQuery = normalizeVector(rawQuery);
				const normalizedItem = {
					...rawItem,
					embedding: normalizeVector(rawItem.embedding),
				};

				const similarity = cosineSimilarity(normalizedQuery, normalizedItem.embedding);

				// Then: 類似度が1（同じ方向）になる
				expect(similarity).toBeCloseTo(1, 5);
			});
		});
	});

	describe('Feature: 統合ワークフロー', () => {
		let cache: SearchResultCache;

		beforeEach(() => {
			cache = new SearchResultCache();
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
			cache.clear();
		});

		describe('Scenario: 検索→キャッシュ→メトリクス', () => {
			it('Given: 検索システムが初期化され、When: 完全な検索フローを実行すると、Then: すべてのコンポーネントが連携する', async () => {
				// Given: システムが初期化されている
				const collector = new MetricsCollector('vector-search');
				const queryVector = [1, 0, 0];
				const items = [
					{ embedding: [0.9, 0.1, 0], id: 'item1' },
					{ embedding: [0.1, 0.9, 0], id: 'item2' },
				];

				// When: 検索を実行
				collector.setFilesSearched(items.length);

				const results = findNearestNeighbors(queryVector, items, 5);
				const metrics = collector.finish();

				// 結果をキャッシュ
				const cacheKey = getCacheKey('vector-search', { query: 'test' });
				cache.setCache(cacheKey, results);

				// Then: すべてのコンポーネントが連携する
				expect(results).toHaveLength(2);
				expect(metrics.filesSearched).toBe(2);
				expect(cache.getCached(cacheKey)).toEqual(results);

				// And: 統計が更新される
				const cacheStats = cache.getStats();
				expect(cacheStats.entries).toBe(1);
			});
		});

		describe('Scenario: キャッシュ活用による高速化', () => {
			it('Given: 検索結果がキャッシュされ、When: 同じ検索を再実行すると、Then: キャッシュから結果が返され高速化される', async () => {
				// Given: 検索結果がキャッシュされている
				const tool = 'search';
				const params = { q: 'test' };
				const cachedResult = [{ id: 'item1', similarity: 0.95 }];
				const key = getCacheKey(tool, params);
				cache.setCache(key, cachedResult);

				// When: 同じ検索を再実行
				const start = Date.now();
				const result = cache.getCached<typeof cachedResult>(key);
				const duration = Date.now() - start;

				// Then: キャッシュから結果が返される
				expect(result).toEqual(cachedResult);

				// And: 高速（ほぼ0ms）
				expect(duration).toBe(0);
			});
		});
	});
});
