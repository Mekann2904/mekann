/**
 * embeddings/providers/local.tsの単体テスト
 * TF-IDFベースのローカル埋め込みプロバイダーを検証する
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  LocalEmbeddingProvider,
  createLocalEmbeddingProvider,
} from "../../../../lib/embeddings/providers/local.js";

// ============================================================================
// Tests: LocalEmbeddingProvider
// ============================================================================

describe("LocalEmbeddingProvider", () => {
  let provider: LocalEmbeddingProvider;

  beforeEach(() => {
    provider = new LocalEmbeddingProvider();
  });

  describe("基本プロパティ", () => {
    it("正しいIDを持つ", () => {
      expect(provider.id).toBe("local");
    });

    it("正しい名前を持つ", () => {
      expect(provider.name).toBe("Local TF-IDF Embeddings");
    });

    it("正しいモデル名を持つ", () => {
      expect(provider.model).toBe("tfidf-local-v1");
    });

    it("正しいケイパビリティを持つ", () => {
      expect(provider.capabilities.dimensions).toBe(1000);
      expect(provider.capabilities.offlineCapable).toBe(true);
      expect(provider.capabilities.supportsBatch).toBe(true);
    });
  });

  describe("isAvailable", () => {
    it("常にtrueを返す", async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe("generateEmbedding", () => {
    it("空文字列に対してゼロベクトルを返す", async () => {
      const embedding = await provider.generateEmbedding("");
      expect(embedding.length).toBe(1000);
      expect(embedding.every((v) => v === 0)).toBe(true);
    });

    it("空白のみの文字列に対してゼロベクトルを返す", async () => {
      const embedding = await provider.generateEmbedding("   ");
      expect(embedding.length).toBe(1000);
      expect(embedding.every((v) => v === 0)).toBe(true);
    });

    it("テキストに対して埋め込みベクトルを生成する", async () => {
      const embedding = await provider.generateEmbedding("Hello world");
      expect(embedding.length).toBe(1000);
      // ゼロベクトルではない
      expect(embedding.some((v) => v !== 0)).toBe(true);
    });

    it("日本語テキストに対して埋め込みベクトルを生成する", async () => {
      const embedding = await provider.generateEmbedding("こんにちは世界");
      expect(embedding.length).toBe(1000);
      expect(embedding.some((v) => v !== 0)).toBe(true);
    });

    it("ベクトルはL2正規化されている", async () => {
      const embedding = await provider.generateEmbedding("Test normalization");
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      // 正規化されている場合、ノルムは1に近い
      expect(norm).toBeCloseTo(1, 5);
    });

    it("類似テキストは類似ベクトルを生成する", async () => {
      const embedding1 = await provider.generateEmbedding("machine learning algorithm");
      const embedding2 = await provider.generateEmbedding("machine learning model");
      const embedding3 = await provider.generateEmbedding("cooking recipe");

      // コサイン類似度を計算
      const similarity12 = cosineSimilarity(embedding1, embedding2);
      const similarity13 = cosineSimilarity(embedding1, embedding3);

      // 類似テキストはより高い類似度を持つ
      expect(similarity12).toBeGreaterThan(similarity13);
    });
  });

  describe("generateEmbeddingsBatch", () => {
    it("複数のテキストに対して埋め込みを生成する", async () => {
      const texts = ["Hello", "World", "Test"];
      const embeddings = await provider.generateEmbeddingsBatch(texts);

      expect(embeddings.length).toBe(3);
      embeddings.forEach((e) => {
        expect(e.length).toBe(1000);
      });
    });

    it("空の配列に対して空の配列を返す", async () => {
      const embeddings = await provider.generateEmbeddingsBatch([]);
      expect(embeddings).toEqual([]);
    });

    it("各埋め込みは正規化されている", async () => {
      const texts = ["First text", "Second text", "Third text"];
      const embeddings = await provider.generateEmbeddingsBatch(texts);

      embeddings.forEach((embedding) => {
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        expect(norm).toBeCloseTo(1, 5);
      });
    });
  });

  describe("resetStats", () => {
    it("統計をリセットする", async () => {
      // いくつかのテキストを処理
      await provider.generateEmbedding("Test text");
      await provider.generateEmbeddingsBatch(["A", "B", "C"]);

      // リセット
      provider.resetStats();

      // 新しいプロバイダーと同じ状態
      const newProvider = new LocalEmbeddingProvider();
      const embedding1 = await provider.generateEmbedding("Test");
      const embedding2 = await newProvider.generateEmbedding("Test");

      // リセット後は新しいプロバイダーと同じ結果
      expect(embedding1).toEqual(embedding2);
    });
  });
});

// ============================================================================
// Tests: createLocalEmbeddingProvider
// ============================================================================

describe("createLocalEmbeddingProvider", () => {
  it("LocalEmbeddingProviderインスタンスを返す", () => {
    const provider = createLocalEmbeddingProvider();
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it("正しいIDを持つプロバイダーを作成する", () => {
    const provider = createLocalEmbeddingProvider();
    expect(provider.id).toBe("local");
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * コサイン類似度を計算
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
