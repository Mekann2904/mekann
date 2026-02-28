/**
 * @file .pi/lib/embeddings/index.ts の単体テスト
 * @description 埋め込みモジュールのパブリックエントリポイントのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as embeddings from "../../lib/embeddings/index.js";

describe("embeddings module exports", () => {
	describe("正常系", () => {
		// Registry
		it("should export EmbeddingProviderRegistry", () => {
			expect(embeddings.EmbeddingProviderRegistry).toBeDefined();
		});

		it("should export embeddingRegistry", () => {
			expect(embeddings.embeddingRegistry).toBeDefined();
		});

		it("should export generateEmbedding function", () => {
			expect(typeof embeddings.generateEmbedding).toBe("function");
		});

		it("should export generateEmbeddingsBatch function", () => {
			expect(typeof embeddings.generateEmbeddingsBatch).toBe("function");
		});

		// Utilities
		it("should export cosineSimilarity function", () => {
			expect(typeof embeddings.cosineSimilarity).toBe("function");
		});

		it("should export euclideanDistance function", () => {
			expect(typeof embeddings.euclideanDistance).toBe("function");
		});

		it("should export normalizeVector function", () => {
			expect(typeof embeddings.normalizeVector).toBe("function");
		});

		it("should export findNearestNeighbors function", () => {
			expect(typeof embeddings.findNearestNeighbors).toBe("function");
		});

		it("should export isValidEmbedding function", () => {
			expect(typeof embeddings.isValidEmbedding).toBe("function");
		});

		// Providers
		it("should export OpenAIEmbeddingProvider", () => {
			expect(embeddings.OpenAIEmbeddingProvider).toBeDefined();
		});

		it("should export LocalEmbeddingProvider", () => {
			expect(embeddings.LocalEmbeddingProvider).toBeDefined();
		});

		it("should export getOpenAIKey function", () => {
			expect(typeof embeddings.getOpenAIKey).toBe("function");
		});
	});

	describe("cosineSimilarity", () => {
		it("should calculate similarity correctly", () => {
			const a = [1, 0, 0];
			const b = [1, 0, 0];
			const similarity = embeddings.cosineSimilarity(a, b);

			expect(similarity).toBeCloseTo(1.0, 5);
		});

		it("should return 0 for orthogonal vectors", () => {
			const a = [1, 0, 0];
			const b = [0, 1, 0];
			const similarity = embeddings.cosineSimilarity(a, b);

			expect(similarity).toBeCloseTo(0.0, 5);
		});

		it("should return -1 for opposite vectors", () => {
			const a = [1, 0, 0];
			const b = [-1, 0, 0];
			const similarity = embeddings.cosineSimilarity(a, b);

			expect(similarity).toBeCloseTo(-1.0, 5);
		});
	});

	describe("normalizeVector", () => {
		it("should normalize vector to unit length", () => {
			const v = [3, 4];
			const normalized = embeddings.normalizeVector(v);

			expect(normalized[0]).toBeCloseTo(0.6, 5);
			expect(normalized[1]).toBeCloseTo(0.8, 5);
		});

		it("should handle zero vector", () => {
			const v = [0, 0, 0];
			const normalized = embeddings.normalizeVector(v);

			expect(normalized.every((x) => Number.isFinite(x))).toBe(true);
		});
	});

	describe("isValidEmbedding", () => {
		it("should return true for valid embedding", () => {
			const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
			const result = embeddings.isValidEmbedding(embedding);

			expect(result).toBe(true);
		});

		it("should return false for empty array", () => {
			const embedding: number[] = [];
			const result = embeddings.isValidEmbedding(embedding);

			expect(result).toBe(false);
		});

		it("should return false for NaN values", () => {
			const embedding = [0.1, NaN, 0.3];
			const result = embeddings.isValidEmbedding(embedding);

			expect(result).toBe(false);
		});
	});
});
