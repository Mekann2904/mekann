/**
 * @abdd.meta
 * path: tests/integration/embeddings-integration.test.ts
 * role: エンベディングモジュールの統合テスト
 * why: レジストリ、プロバイダー、ユーティリティ間の連携が正しく動作することを保証するため
 * related: .pi/lib/embeddings/registry.ts, .pi/lib/embeddings/utils.ts, .pi/lib/embeddings/types.ts
 * public_api: EmbeddingProviderRegistry, generateEmbedding, findNearestNeighbors
 * invariants: レジストリとプロバイダーの連携、ベクトル演算とレジストリ出力の整合性
 * side_effects: ファイルシステムへの設定ファイル読み書き
 * failure_modes: 設定ファイル権限エラー、プロバイダー登録重複
 * @abdd.explain
 * overview: エンベディングレジストリとプロバイダー、ユーティリティの統合動作をテストする
 * what_it_does:
 *   - モックプロバイダーを使用してレジストリ機能をテスト
 *   - ベクトル生成と類似度検索の連携をテスト
 *   - 設定の永続化と読み込みをテスト
 * why_it_exists:
 *   - モジュール間の連携が正しく動作することを保証するため
 * scope:
 *   in: EmbeddingProviderRegistry、モックプロバイダー、ベクトル演算関数
 *   out: テストの実行結果
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmbeddingProviderRegistry } from '@lib/embeddings/registry';
import {
	cosineSimilarity,
	findNearestNeighbors,
	findBySimilarityThreshold,
	normalizeVector,
} from '@lib/embeddings/utils';
import type { EmbeddingProvider, ProviderCapabilities } from '@lib/embeddings/types';
import { createTempDir, cleanupTempDir } from '../helpers/bdd-helpers';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';

// モックプロバイダー作成ヘルパー
function createMockProvider(
	id: string,
	name: string,
	dimensions: number = 3,
	available: boolean = true
): EmbeddingProvider {
	const capabilities: ProviderCapabilities = {
		maxTokens: 8192,
		dimensions,
		supportsBatch: true,
		maxBatchSize: 100,
		offlineCapable: true,
	};

	return {
		id,
		name,
		model: `mock-${id}-model`,
		capabilities,
		isAvailable: async () => available,
		generateEmbedding: async (text: string) => {
			if (!available) return null;
			// テキストを数値に変換してベクトルを生成（決定的）
			const hash = text.split('').reduce((sum, char, i) => sum + char.charCodeAt(0) * (i + 1), 0);
			return Array(dimensions).fill(0).map((_, i) => ((hash + i * 100) % 1000) / 1000);
		},
		generateEmbeddingsBatch: async (texts: string[]) => {
			if (!available) return texts.map(() => null);
			return Promise.all(texts.map((t) =>
				(Array(dimensions).fill(0).map((_, i) => {
					const hash = t.split('').reduce((sum, char, j) => sum + char.charCodeAt(0) * (j + 1), 0);
					return ((hash + i * 100) % 1000) / 1000;
				}))
			));
		},
	};
}

describe('Embeddings Integration', () => {
	describe('EmbeddingProviderRegistry', () => {
		let registry: EmbeddingProviderRegistry;

		beforeEach(() => {
			registry = new EmbeddingProviderRegistry();
		});

		describe('プロバイダー登録と取得', () => {
			it('正常系: プロバイダーを登録して取得できる', async () => {
				const provider = createMockProvider('test-provider', 'Test Provider');
				registry.register(provider);

				const retrieved = registry.get('test-provider');

				expect(retrieved).toBeDefined();
				expect(retrieved?.id).toBe('test-provider');
				expect(retrieved?.name).toBe('Test Provider');
			});

			it('正常系: 複数のプロバイダーを登録できる', async () => {
				registry.register(createMockProvider('provider-1', 'Provider 1'));
				registry.register(createMockProvider('provider-2', 'Provider 2'));

				const all = registry.getAll();

				expect(all).toHaveLength(2);
				expect(all.map((p) => p.id)).toContain('provider-1');
				expect(all.map((p) => p.id)).toContain('provider-2');
			});

			it('正常系: プロバイダーを削除できる', async () => {
				registry.register(createMockProvider('provider-1', 'Provider 1'));
				registry.unregister('provider-1');

				expect(registry.get('provider-1')).toBeUndefined();
			});

			it('正常系: 存在しないプロバイダーはundefinedを返す', async () => {
				expect(registry.get('nonexistent')).toBeUndefined();
			});
		});

		describe('利用可能プロバイダー判定', () => {
			it('正常系: 利用可能なプロバイダーのみ取得できる', async () => {
				registry.register(createMockProvider('available', 'Available', 3, true));
				registry.register(createMockProvider('unavailable', 'Unavailable', 3, false));

				const available = await registry.getAvailable();

				expect(available).toHaveLength(1);
				expect(available[0].id).toBe('available');
			});

			it('正常系: 全プロバイダーの状態を取得できる', async () => {
				registry.register(createMockProvider('available', 'Available', 3, true));
				registry.register(createMockProvider('unavailable', 'Unavailable', 3, false));

				const statuses = await registry.getAllStatus();

				expect(statuses).toHaveLength(2);
				expect(statuses.find((s) => s.id === 'available')?.available).toBe(true);
				expect(statuses.find((s) => s.id === 'unavailable')?.available).toBe(false);
			});
		});

		describe('デフォルトプロバイダー管理', () => {
			it('正常系: デフォルトプロバイダーを設定できる', async () => {
				registry.register(createMockProvider('default', 'Default Provider'));
				registry.setDefault('default');

				expect(registry.getDefaultProviderId()).toBe('default');
			});

			it('正常系: デフォルトプロバイダーを取得できる', async () => {
				registry.register(createMockProvider('default', 'Default Provider'));
				registry.setDefault('default');

				const provider = await registry.getDefault();

				expect(provider).toBeDefined();
				expect(provider?.id).toBe('default');
			});

			it('正常系: デフォルトが未設定の場合は利用可能な最初のプロバイダーを返す', async () => {
				registry.register(createMockProvider('first', 'First Provider'));
				registry.register(createMockProvider('second', 'Second Provider'));

				const provider = await registry.getDefault();

				expect(provider).toBeDefined();
				expect(['first', 'second']).toContain(provider?.id);
			});

			it('異常系: 存在しないプロバイダーをデフォルトに設定するとエラー', async () => {
				expect(() => registry.setDefault('nonexistent')).toThrow();
			});

			it('正常系: デフォルトをnullに設定できる', async () => {
				registry.register(createMockProvider('provider', 'Provider'));
				registry.setDefault('provider');
				registry.setDefault(null);

				expect(registry.getDefaultProviderId()).toBeNull();
			});
		});

		describe('プロバイダー解決', () => {
			it('正常系: 明示的に指定したプロバイダーを解決する', async () => {
				registry.register(createMockProvider('explicit', 'Explicit Provider'));

				const provider = await registry.resolve({ provider: 'explicit' });

				expect(provider).toBeDefined();
				expect(provider?.id).toBe('explicit');
			});

			it('正常系: 指定がない場合はデフォルトを解決する', async () => {
				registry.register(createMockProvider('default', 'Default Provider'));
				registry.setDefault('default');

				const provider = await registry.resolve();

				expect(provider?.id).toBe('default');
			});
		});

		describe('設定管理', () => {
			it('正常系: 設定を取得できる', async () => {
				const config = registry.getConfig();

				expect(config).toHaveProperty('version');
				expect(config).toHaveProperty('defaultProvider');
				expect(config).toHaveProperty('fallbackOrder');
			});

			it('正常系: 設定を更新できる', async () => {
				registry.updateConfig({ fallbackOrder: ['new-order'] });

				const config = registry.getConfig();
				expect(config.fallbackOrder).toContain('new-order');
			});
		});
	});

	describe('プロバイダーとベクトル演算の統合', () => {
		let registry: EmbeddingProviderRegistry;

		beforeEach(() => {
			registry = new EmbeddingProviderRegistry();
		});

		it('統合: プロバイダーから生成したベクトルで類似度検索ができる', async () => {
			const provider = createMockProvider('search', 'Search Provider', 3);
			registry.register(provider);

			// クエリベクトル生成
			const queryEmbedding = await provider.generateEmbedding('search query');
			expect(queryEmbedding).not.toBeNull();

			// 検索対象アイテム
			const items = [
				{ embedding: await provider.generateEmbedding('document one') as number[], id: 'doc1' },
				{ embedding: await provider.generateEmbedding('document two') as number[], id: 'doc2' },
				{ embedding: await provider.generateEmbedding('search query similar') as number[], id: 'doc3' },
			];

			// 近傍検索
			const results = findNearestNeighbors(queryEmbedding!, items, 3);

			expect(results).toHaveLength(3);
			expect(results[0].similarity).toBeGreaterThanOrEqual(0);
		});

		it('統合: バッチ生成と類似度検索の連携', async () => {
			const provider = createMockProvider('batch', 'Batch Provider', 3);
			registry.register(provider);

			const texts = ['first text', 'second text', 'third text'];
			const embeddings = await provider.generateEmbeddingsBatch(texts);

			expect(embeddings).toHaveLength(3);
			expect(embeddings.every((e) => e !== null)).toBe(true);

			// 最初のテキストとの類似度を計算
			const similarities = embeddings.map((e, i) => ({
				index: i,
				similarity: e ? cosineSimilarity(embeddings[0]!, e) : 0,
			}));

			// 自分自身との類似度は1
			expect(similarities[0].similarity).toBeCloseTo(1, 5);
		});

		it('統合: 正規化済みベクトルでの検索', async () => {
			const provider = createMockProvider('norm', 'Norm Provider', 3);
			registry.register(provider);

			const rawEmbedding = await provider.generateEmbedding('test text');
			expect(rawEmbedding).not.toBeNull();

			const normalized = normalizeVector(rawEmbedding!);

			// 正規化済みベクトルで検索
			const items = [
				{ embedding: normalizeVector([0.5, 0.5, 0.5]), id: 'a' },
				{ embedding: normalizeVector([1, 0, 0]), id: 'b' },
			];

			const results = findNearestNeighbors(normalized, items, 2);

			expect(results).toHaveLength(2);
			results.forEach((r) => {
				expect(r.similarity).toBeGreaterThanOrEqual(-1);
				expect(r.similarity).toBeLessThanOrEqual(1);
			});
		});

		it('統合: 閾値フィルタリングとプロバイダー連携', async () => {
			const provider = createMockProvider('threshold', 'Threshold Provider', 3);
			registry.register(provider);

			const query = await provider.generateEmbedding('query');
			expect(query).not.toBeNull();

			const items = [
				{ embedding: query!, id: 'exact-match' }, // 完全一致
				{ embedding: [0, 0, 0], id: 'zero' }, // ゼロベクトル
			];

			// 高い閾値で検索
			const highThresholdResults = findBySimilarityThreshold(query!, items, 0.99);
			expect(highThresholdResults.length).toBe(1);
			expect(highThresholdResults[0].item.id).toBe('exact-match');

			// 低い閾値で検索
			const lowThresholdResults = findBySimilarityThreshold(query!, items, 0);
			expect(lowThresholdResults.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe('エラーハンドリング', () => {
		let registry: EmbeddingProviderRegistry;

		beforeEach(() => {
			registry = new EmbeddingProviderRegistry();
		});

		it('異常系: 利用可能なプロバイダーがない場合はnullを返す', async () => {
			registry.register(createMockProvider('unavailable', 'Unavailable', 3, false));

			const provider = await registry.getDefault();

			expect(provider).toBeNull();
		});

		it('異常系: 利用不可のプロバイダーからの生成はnullを返す', async () => {
			const provider = createMockProvider('unavailable', 'Unavailable', 3, false);
			registry.register(provider);

			const resolved = await registry.resolve({ provider: 'unavailable' });

			// 利用不可のため解決できない
			expect(resolved).toBeNull();
		});

		it('異常系: 次元数が異なるベクトルでの演算', async () => {
			const vec1 = [1, 2, 3];
			const vec2 = [1, 2];

			// 次元数が異なる場合は0を返す
			expect(cosineSimilarity(vec1, vec2)).toBe(0);
		});
	});
});
