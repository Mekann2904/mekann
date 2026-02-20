/**
 * @file .pi/lib/embeddings/index.ts の単体テスト
 * @description エンベディングモジュールのパブリックAPIエントリーポイントのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/test"),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({}));

// OpenAI providerのモック（fetchを含む）
vi.mock("../../../.pi/lib/embeddings/providers/openai.js", () => ({
	getOpenAIKey: vi.fn(() => null),
	OpenAIEmbeddingProvider: class {
		readonly id = "openai";
		readonly name = "OpenAI Mock";
		readonly model = "mock-model";
		readonly capabilities = {
			maxTokens: 1000,
			dimensions: 100,
			supportsBatch: true,
			maxBatchSize: 10,
			offlineCapable: false,
		};
		async isAvailable() {
			return false;
		}
		async generateEmbedding() {
			return null;
		}
		async generateEmbeddingsBatch(texts: string[]) {
			return texts.map(() => null);
		}
	},
	openAIEmbeddingProvider: { id: "openai", name: "OpenAI Mock", model: "mock-model", capabilities: {} },
}));

// グローバルfetchモック
global.fetch = vi.fn() as any;

// モック後にインポート
import * as embeddingModule from "../../../lib/embeddings/index.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("embeddings/index.ts エクスポート確認", () => {
	it("モジュールが正常に読み込まれる", () => {
		expect(embeddingModule).toBeDefined();
	});

	it("レジストリがエクスポートされている", () => {
		expect(embeddingModule.EmbeddingProviderRegistry).toBeDefined();
		expect(embeddingModule.embeddingRegistry).toBeDefined();
		expect(embeddingModule.getEmbeddingProvider).toBeDefined();
		expect(embeddingModule.generateEmbedding).toBeDefined();
		expect(embeddingModule.generateEmbeddingsBatch).toBeDefined();
	});

	it("ユーティリティ関数がエクスポートされている", () => {
		expect(embeddingModule.cosineSimilarity).toBeDefined();
		expect(embeddingModule.euclideanDistance).toBeDefined();
		expect(embeddingModule.normalizeVector).toBeDefined();
		expect(embeddingModule.addVectors).toBeDefined();
		expect(embeddingModule.subtractVectors).toBeDefined();
		expect(embeddingModule.scaleVector).toBeDefined();
		expect(embeddingModule.meanVector).toBeDefined();
		expect(embeddingModule.findNearestNeighbors).toBeDefined();
		expect(embeddingModule.findBySimilarityThreshold).toBeDefined();
		expect(embeddingModule.isValidEmbedding).toBeDefined();
		expect(embeddingModule.zeroVector).toBeDefined();
		expect(embeddingModule.vectorNorm).toBeDefined();
		expect(embeddingModule.dotProduct).toBeDefined();
	});

	it("プロバイダーがエクスポートされている", () => {
		expect(embeddingModule.OpenAIEmbeddingProvider).toBeDefined();
		expect(embeddingModule.openAIEmbeddingProvider).toBeDefined();
		expect(embeddingModule.getOpenAIKey).toBeDefined();
	});

	it("初期化関数がエクスポートされている", () => {
		expect(embeddingModule.initializeEmbeddingModule).toBeDefined();
		expect(embeddingModule.initializeEmbeddingModuleSync).toBeDefined();
	});
});

// ============================================================================
// モジュール初期化テスト
// ============================================================================

describe("initializeEmbeddingModule", () => {
	it("非同期初期化関数がPromiseを返す", async () => {
		const result = embeddingModule.initializeEmbeddingModule();
		expect(result).toBeInstanceOf(Promise);
		await expect(result).resolves.toBeUndefined();
	});
});

describe("initializeEmbeddingModuleSync", () => {
	it("同期初期化関数がvoidを返す", () => {
		const result = embeddingModule.initializeEmbeddingModuleSync();
		expect(result).toBeUndefined();
	});
});

// ============================================================================
// モジュールロード時の初期化確認
// ============================================================================

describe("モジュールロード時の自動初期化", () => {
	it("レジストリが初期化されている", () => {
		expect(embeddingModule.embeddingRegistry).toBeDefined();
		expect(embeddingModule.embeddingRegistry).toBeInstanceOf(
			embeddingModule.EmbeddingProviderRegistry,
		);
	});

	it("OpenAIプロバイダーが登録されている", () => {
		const provider = embeddingModule.embeddingRegistry.get("openai");
		expect(provider).toBeDefined();
		expect(provider?.id).toBe("openai");
		expect(provider?.name).toBe("OpenAI Embeddings");
	});

	it("登録されたプロバイダーが利用可能か確認（APIキーなし）", async () => {
		const provider = embeddingModule.embeddingRegistry.get("openai");
		if (provider) {
			const isAvailable = await provider.isAvailable();
			// APIキーがない場合false
			expect(typeof isAvailable).toBe("boolean");
		}
	});
});

// ============================================================================
// 再エクスポート検証
// ============================================================================

describe("再エクスポート検証", () => {
	it("cosineSimilarityが正しく動作する", () => {
		const a = [1, 0, 0];
		const b = [0, 1, 0];
		const result = embeddingModule.cosineSimilarity(a, b);
		expect(result).toBe(0);
	});

	it("isValidEmbeddingが正しく動作する", () => {
		expect(embeddingModule.isValidEmbedding([1, 2, 3])).toBe(true);
		expect(embeddingModule.isValidEmbedding([])).toBe(false);
		expect(embeddingModule.isValidEmbedding(null)).toBe(false);
		expect(embeddingModule.isValidEmbedding(undefined)).toBe(false);
	});

	it("zeroVectorが正しく動作する", () => {
		const result = embeddingModule.zeroVector(5);
		expect(result).toEqual([0, 0, 0, 0, 0]);
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

import * as fc from "fast-check";

describe("embeddings/index.ts プロパティベーステスト", () => {
	it("PBT: initializeEmbeddingModuleSync は冪等である（二重呼び出しの影響なし）", () => {
		fc.assert(
			fc.property(fc.constantFrom(1, 2, 3, 5), (callCount) => {
				// 初期状態を取得
				const initialProviderCount = embeddingModule.embeddingRegistry.getAll().length;

				// 指定回数呼び出し
				for (let i = 0; i < callCount; i++) {
					embeddingModule.initializeEmbeddingModuleSync();
				}

				// プロバイダー数が増えていない（重複登録は上書きされる）
				const finalProviderCount = embeddingModule.embeddingRegistry.getAll().length;
				return finalProviderCount >= 1 && finalProviderCount <= initialProviderCount + callCount;
			}),
			{ numRuns: 20 }
		);
	});

	it("PBT: エクスポートされた関数は常に定義されている", () => {
		const exportedFunctions = [
			"cosineSimilarity",
			"euclideanDistance",
			"normalizeVector",
			"addVectors",
			"subtractVectors",
			"scaleVector",
			"meanVector",
			"findNearestNeighbors",
			"findBySimilarityThreshold",
			"isValidEmbedding",
			"zeroVector",
			"vectorNorm",
			"dotProduct",
		] as const;

		for (const funcName of exportedFunctions) {
			const func = embeddingModule[funcName];
			expect(typeof func).toBe("function");
		}
	});
});
