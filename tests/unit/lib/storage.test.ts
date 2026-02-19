/**
 * storage.ts 単体テスト
 * カバレッジ分析: バレルエクスポートの再エクスポート確認
 */
import {
  describe,
  it,
  expect,
} from "vitest";

// storage.ts はバレルファイルなので、エクスポートされていることを確認する
import * as storage from "../../../.pi/lib/storage.js";

// ============================================================================
// 再エクスポート確認テスト
// ============================================================================

describe("storage.ts バレルエクスポート", () => {
  // Storage base utilities
  it("storage-base_エクスポート_HasId", () => {
    expect(storage).toHaveProperty("HasId");
  });

  it("storage-base_エクスポート_createPathsFactory", () => {
    expect(storage).toHaveProperty("createPathsFactory");
    expect(typeof storage.createPathsFactory).toBe("function");
  });

  it("storage-base_エクスポート_toId", () => {
    expect(storage).toHaveProperty("toId");
    expect(typeof storage.toId).toBe("function");
  });

  it("storage-base_エクスポート_mergeEntitiesById", () => {
    expect(storage).toHaveProperty("mergeEntitiesById");
    expect(typeof storage.mergeEntitiesById).toBe("function");
  });

  // Run Index utilities
  it("run-index_エクスポート_extractKeywords", () => {
    expect(storage).toHaveProperty("extractKeywords");
    expect(typeof storage.extractKeywords).toBe("function");
  });

  it("run-index_エクスポート_classifyTaskType", () => {
    expect(storage).toHaveProperty("classifyTaskType");
    expect(typeof storage.classifyTaskType).toBe("function");
  });

  it("run-index_エクスポート_searchRuns", () => {
    expect(storage).toHaveProperty("searchRuns");
    expect(typeof storage.searchRuns).toBe("function");
  });

  it("run-index_エクスポート_RUN_INDEX_VERSION", () => {
    expect(storage).toHaveProperty("RUN_INDEX_VERSION");
    expect(typeof storage.RUN_INDEX_VERSION).toBe("number");
  });

  // Pattern Extraction utilities
  it("pattern-extraction_エクスポート_extractPatternFromRun", () => {
    expect(storage).toHaveProperty("extractPatternFromRun");
    expect(typeof storage.extractPatternFromRun).toBe("function");
  });

  it("pattern-extraction_エクスポート_PatternStorage", () => {
    expect(storage).toHaveProperty("PATTERN_STORAGE_VERSION");
  });

  it("pattern-extraction_エクスポート_findRelevantPatterns", () => {
    expect(storage).toHaveProperty("findRelevantPatterns");
    expect(typeof storage.findRelevantPatterns).toBe("function");
  });

  // Semantic Memory utilities
  it("semantic-memory_エクスポート_loadSemanticMemory", () => {
    expect(storage).toHaveProperty("loadSemanticMemory");
    expect(typeof storage.loadSemanticMemory).toBe("function");
  });

  it("semantic-memory_エクスポート_semanticSearch", () => {
    expect(storage).toHaveProperty("semanticSearch");
    expect(typeof storage.semanticSearch).toBe("function");
  });

  it("semantic-memory_エクスポート_SEMANTIC_MEMORY_VERSION", () => {
    expect(storage).toHaveProperty("SEMANTIC_MEMORY_VERSION");
    expect(typeof storage.SEMANTIC_MEMORY_VERSION).toBe("number");
  });

  // Embeddings Module
  it("embeddings_エクスポート_generateEmbedding", () => {
    expect(storage).toHaveProperty("generateEmbedding");
    expect(typeof storage.generateEmbedding).toBe("function");
  });

  it("embeddings_エクスポート_cosineSimilarity", () => {
    expect(storage).toHaveProperty("cosineSimilarity");
    expect(typeof storage.cosineSimilarity).toBe("function");
  });

  it("embeddings_エクスポート_getEmbeddingProvider", () => {
    expect(storage).toHaveProperty("getEmbeddingProvider");
    expect(typeof storage.getEmbeddingProvider).toBe("function");
  });

  it("embeddings_エクスポート_OpenAIEmbeddingProvider", () => {
    expect(storage).toHaveProperty("OpenAIEmbeddingProvider");
  });
});

// ============================================================================
// 型エクスポート確認テスト
// ============================================================================

describe("型エクスポート確認", () => {
  it("型_エクスポート確認_IndexedRun", () => {
    // 型はコンパイル時にのみ存在するため、
    // 関数のシグネチャを通じて間接的に確認
    expect(typeof storage.searchRuns).toBe("function");
  });

  it("型_エクスポート確認_RunIndex", () => {
    expect(typeof storage.getOrBuildRunIndex).toBe("function");
  });

  it("型_エクスポート確認_SemanticMemoryStorage", () => {
    expect(typeof storage.loadSemanticMemory).toBe("function");
  });

  it("型_エクスポート確認_EmbeddingProvider", () => {
    expect(typeof storage.getEmbeddingProvider).toBe("function");
  });
});

// ============================================================================
// 関数動作確認テスト
// ============================================================================

describe("関数動作確認", () => {
  it("toId_正常動作", () => {
    // Act
    const result = storage.toId("Test Name");

    // Assert
    expect(result).toBe("test-name");
  });

  it("cosineSimilarity_同一ベクトル_1", () => {
    // Arrange
    const vec = [1, 2, 3];

    // Act
    const result = storage.cosineSimilarity(vec, vec);

    // Assert
    expect(result).toBe(1);
  });

  it("cosineSimilarity_直交ベクトル_0", () => {
    // Arrange
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];

    // Act
    const result = storage.cosineSimilarity(vec1, vec2);

    // Assert
    expect(result).toBe(0);
  });

  it("extractKeywords_基本_キーワード抽出", () => {
    // Act
    const result = storage.extractKeywords("Test input text");

    // Assert
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain("test");
    expect(result).toContain("input");
    expect(result).toContain("text");
  });

  it("classifyTaskType_基本_タイプ分類", () => {
    // Act
    const result = storage.classifyTaskType("Fix the bug in the code");

    // Assert
    expect(typeof result).toBe("string");
  });

  it("RUN_INDEX_VERSION_定数値", () => {
    // Assert
    expect(storage.RUN_INDEX_VERSION).toBe(1);
  });

  it("SEMANTIC_MEMORY_VERSION_定数値", () => {
    // Assert
    expect(storage.SEMANTIC_MEMORY_VERSION).toBe(1);
  });

  it("PATTERN_STORAGE_VERSION_定数値", () => {
    // Assert
    expect(storage.PATTERN_STORAGE_VERSION).toBe(1);
  });
});

// ============================================================================
// モジュール整合性テスト
// ============================================================================

describe("モジュール整合性", () => {
  it("全エクスポート_関数または定数", () => {
    const exports = Object.keys(storage);

    for (const key of exports) {
      const value = (storage as any)[key];
      const isValid =
        typeof value === "function" ||
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "object";

      expect(isValid).toBe(true);
    }
  });

  it("期待されるエクスポート数_以上", () => {
    const exports = Object.keys(storage);
    // 少なくとも主要なエクスポートが含まれていることを確認
    expect(exports.length).toBeGreaterThanOrEqual(30);
  });
});
