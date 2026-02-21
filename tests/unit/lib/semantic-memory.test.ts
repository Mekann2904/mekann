/**
 * semantic-memory.ts 単体テスト
 * カバレッジ分析: findNearestNeighbors, loadSemanticMemory, saveSemanticMemory, getSemanticMemoryStats, clearSemanticMemory
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));

vi.mock("../../../.pi/lib/embeddings/index.js", () => ({
  generateEmbedding: vi.fn(),
  generateEmbeddingsBatch: vi.fn(),
  cosineSimilarity: vi.fn((a, b) => {
    // Simple cosine similarity implementation for testing
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
  }),
  getEmbeddingProvider: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../.pi/lib/fs-utils.js", () => ({
  ensureDir: vi.fn(),
}));

vi.mock("../../../.pi/lib/run-index.js", () => ({
  getOrBuildRunIndex: vi.fn().mockReturnValue({ runs: [] }),
}));

vi.mock("../../../.pi/lib/storage-lock.js", () => ({
  atomicWriteTextFile: vi.fn(),
}));

import { existsSync, readFileSync } from "node:fs";
import {
  findNearestNeighbors,
  loadSemanticMemory,
  saveSemanticMemory,
  getSemanticMemoryStats,
  clearSemanticMemory,
  getSemanticMemoryPath,
  SEMANTIC_MEMORY_VERSION,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  type RunEmbedding,
  type SemanticMemoryStorage,
} from "../../../.pi/lib/semantic-memory.js";
import { atomicWriteTextFile } from "../../../.pi/lib/storage-lock.js";

// ============================================================================
// テストデータ
// ============================================================================

const createMockEmbedding = (values: number[] = []): number[] => {
  const embedding = new Array(1536).fill(0);
  values.forEach((v, i) => (embedding[i] = v));
  return embedding;
};

const createMockRunEmbedding = (
  runId: string,
  embedding: number[],
  text: string = "test"
): RunEmbedding => ({
  runId,
  embedding,
  text,
  timestamp: new Date().toISOString(),
});

// ============================================================================
// findNearestNeighbors テスト
// ============================================================================

describe("findNearestNeighbors", () => {
  it("findNearestNeighbors_基本_類似順で返却", () => {
    // Arrange - モックのcosineSimilarityは実際に計算される
    const queryVector = createMockEmbedding([1, 0, 0]);
    const embeddings: RunEmbedding[] = [
      createMockRunEmbedding("run1", createMockEmbedding([1, 0, 0])), // 類似度1
      createMockRunEmbedding("run2", createMockEmbedding([0.5, 0, 0])), // 類似度1 (方向が同じ)
      createMockRunEmbedding("run3", createMockEmbedding([0, 1, 0])), // 類似度0
    ];

    // Act
    const result = findNearestNeighbors(queryVector, embeddings, 3);

    // Assert - 結果が返却されることを確認
    expect(result).toHaveLength(3);
    // 類似度でソートされていること（最初の2つは方向が同じなので類似度1、3つ目は直交）
    expect(result[2].similarity).toBe(0);
  });

  it("findNearestNeighbors_k制限_正しい件数", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 0, 0]);
    const embeddings: RunEmbedding[] = [
      createMockRunEmbedding("run1", createMockEmbedding([1, 0, 0])),
      createMockRunEmbedding("run2", createMockEmbedding([0.8, 0, 0])),
      createMockRunEmbedding("run3", createMockEmbedding([0.6, 0, 0])),
      createMockRunEmbedding("run4", createMockEmbedding([0.4, 0, 0])),
      createMockRunEmbedding("run5", createMockEmbedding([0.2, 0, 0])),
    ];

    // Act
    const result = findNearestNeighbors(queryVector, embeddings, 2);

    // Assert
    expect(result).toHaveLength(2);
  });

  it("findNearestNeighbors_空配列_空配列返却", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 0, 0]);

    // Act
    const result = findNearestNeighbors(queryVector, [], 5);

    // Assert
    expect(result).toEqual([]);
  });

  it("findNearestNeighbors_デフォルトk_5件返却", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 0, 0]);
    const embeddings: RunEmbedding[] = Array.from({ length: 10 }, (_, i) =>
      createMockRunEmbedding(`run${i}`, createMockEmbedding([0.1 * (10 - i), 0, 0]))
    );

    // Act
    const result = findNearestNeighbors(queryVector, embeddings);

    // Assert
    expect(result).toHaveLength(5);
  });

  it("findNearestNeighbors_直交ベクトル_類似度0", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 0, 0]);
    const embeddings: RunEmbedding[] = [
      createMockRunEmbedding("orthogonal", createMockEmbedding([0, 1, 0])),
    ];

    // Act
    const result = findNearestNeighbors(queryVector, embeddings, 1);

    // Assert
    expect(result[0].similarity).toBe(0);
  });

  it("findNearestNeighbors_同一ベクトル_類似度1", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 2, 3]);
    const embeddings: RunEmbedding[] = [
      createMockRunEmbedding("same", createMockEmbedding([1, 2, 3])),
    ];

    // Act
    const result = findNearestNeighbors(queryVector, embeddings, 1);

    // Assert - 同一ベクトルとの類似度は1
    expect(result[0].similarity).toBeCloseTo(1, 5);
  });
});

// ============================================================================
// getSemanticMemoryPath テスト
// ============================================================================

describe("getSemanticMemoryPath", () => {
  it("getSemanticMemoryPath_パス生成_正しい形式", () => {
    // Arrange
    const cwd = "/test/project";

    // Act
    const result = getSemanticMemoryPath(cwd);

    // Assert
    expect(result).toContain(".pi");
    expect(result).toContain("memory");
    expect(result).toContain("semantic-memory.json");
  });
});

// ============================================================================
// loadSemanticMemory テスト
// ============================================================================

describe("loadSemanticMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadSemanticMemory_ファイルなし_デフォルト値", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    const result = loadSemanticMemory("/test");

    // Assert
    expect(result.version).toBe(SEMANTIC_MEMORY_VERSION);
    expect(result.embeddings).toEqual([]);
    expect(result.model).toBe(EMBEDDING_MODEL);
    expect(result.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("loadSemanticMemory_ファイルあり_正常読み込み", () => {
    // Arrange
    const mockStorage: SemanticMemoryStorage = {
      version: 1,
      lastUpdated: "2024-01-01T00:00:00Z",
      embeddings: [
        createMockRunEmbedding("run1", [1, 2, 3], "test text"),
      ],
      model: "test-model",
      dimensions: 1536,
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockStorage));

    // Act
    const result = loadSemanticMemory("/test");

    // Assert
    expect(result.version).toBe(1);
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0].runId).toBe("run1");
  });

  it("loadSemanticMemory_パースエラー_デフォルト値", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("invalid json");

    // Act
    const result = loadSemanticMemory("/test");

    // Assert
    expect(result.version).toBe(SEMANTIC_MEMORY_VERSION);
    expect(result.embeddings).toEqual([]);
  });
});

// ============================================================================
// saveSemanticMemory テスト
// ============================================================================

describe("saveSemanticMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveSemanticMemory_正常保存_原子書込呼び出し", () => {
    // Arrange
    const storage: SemanticMemoryStorage = {
      version: 1,
      lastUpdated: "2024-01-01T00:00:00Z",
      embeddings: [],
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    };

    // Act
    saveSemanticMemory("/test", storage);

    // Assert
    expect(atomicWriteTextFile).toHaveBeenCalled();
    const savedContent = vi.mocked(atomicWriteTextFile).mock.calls[0][1];
    const parsed = JSON.parse(savedContent);
    expect(parsed.version).toBe(1);
  });

  it("saveSemanticMemory_タイムスタンプ更新_現在時刻設定", () => {
    // Arrange
    const storage: SemanticMemoryStorage = {
      version: 1,
      lastUpdated: "2024-01-01T00:00:00Z",
      embeddings: [],
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    };
    const beforeSave = new Date();

    // Act
    saveSemanticMemory("/test", storage);

    // Assert
    const savedContent = vi.mocked(atomicWriteTextFile).mock.calls[0][1];
    const parsed = JSON.parse(savedContent);
    const savedTime = new Date(parsed.lastUpdated);
    expect(savedTime.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
  });
});

// ============================================================================
// getSemanticMemoryStats テスト
// ============================================================================

describe("getSemanticMemoryStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSemanticMemoryStats_空ストレージ_正しい統計", () => {
    // Arrange
    vi.mocked(existsSync).mockReturnValue(false);

    // Act
    const result = getSemanticMemoryStats("/test");

    // Assert
    expect(result.totalEmbeddings).toBe(0);
    expect(result.isAvailable).toBe(false);
    expect(result.model).toBe(EMBEDDING_MODEL);
  });

  it("getSemanticMemoryStats_埋め込みあり_正しい統計", () => {
    // Arrange
    const mockStorage: SemanticMemoryStorage = {
      version: 1,
      lastUpdated: "2024-01-01T00:00:00Z",
      embeddings: [
        createMockRunEmbedding("run1", [1, 2, 3]),
        createMockRunEmbedding("run2", [4, 5, 6]),
      ],
      model: "test-model",
      dimensions: 1536,
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockStorage));

    // Act
    const result = getSemanticMemoryStats("/test");

    // Assert
    expect(result.totalEmbeddings).toBe(2);
    expect(result.isAvailable).toBe(true);
    expect(result.model).toBe("test-model");
  });
});

// ============================================================================
// clearSemanticMemory テスト
// ============================================================================

describe("clearSemanticMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clearSemanticMemory_実行_空ストレージ保存", () => {
    // Arrange & Act
    clearSemanticMemory("/test");

    // Assert
    expect(atomicWriteTextFile).toHaveBeenCalled();
    const savedContent = vi.mocked(atomicWriteTextFile).mock.calls[0][1];
    const parsed = JSON.parse(savedContent);
    expect(parsed.embeddings).toEqual([]);
    expect(parsed.version).toBe(SEMANTIC_MEMORY_VERSION);
  });
});

// ============================================================================
// 定数テスト
// ============================================================================

describe("定数", () => {
  it("定数_SEMANTIC_MEMORY_VERSION_値確認", () => {
    expect(SEMANTIC_MEMORY_VERSION).toBe(1);
  });

  it("定数_EMBEDDING_MODEL_値確認", () => {
    expect(EMBEDDING_MODEL).toBe("text-embedding-3-small");
  });

  it("定数_EMBEDDING_DIMENSIONS_値確認", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("findNearestNeighbors_任意ベクトル_類似度範囲", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 3, maxLength: 3 }),
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 3, maxLength: 3 }),
        (queryArr, embArr) => {
          const queryVector = createMockEmbedding(queryArr);
          const embeddings: RunEmbedding[] = [
            createMockRunEmbedding("run1", createMockEmbedding(embArr)),
          ];
          const result = findNearestNeighbors(queryVector, embeddings, 1);
          if (result.length > 0) {
            return result[0].similarity >= -1 && result[0].similarity <= 1;
          }
          return true;
        }
      )
    );
  });

  it("findNearestNeighbors_同一ベクトル_常に最高類似度", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 3, maxLength: 10 }),
        (vec) => {
          const vector = createMockEmbedding(vec);
          const embeddings: RunEmbedding[] = [
            createMockRunEmbedding("same", [...vector]),
          ];
          const result = findNearestNeighbors(vector, embeddings, 1);
          // 同一ベクトルとの類似度は1（またはベクトルがゼロの場合はNaN）
          return result.length === 0 || Math.abs(result[0].similarity - 1) < 0.0001;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("findNearestNeighbors_多数埋め込み_パフォーマンス", () => {
    // Arrange
    const queryVector = createMockEmbedding([1, 0, 0]);
    const embeddings: RunEmbedding[] = Array.from({ length: 1000 }, (_, i) =>
      createMockRunEmbedding(`run${i}`, createMockEmbedding([Math.random(), 0, 0]))
    );

    // Act
    const startTime = Date.now();
    const result = findNearestNeighbors(queryVector, embeddings, 10);
    const duration = Date.now() - startTime;

    // Assert
    expect(result).toHaveLength(10);
    expect(duration).toBeLessThan(1000); // 1秒以内
  });

  it("findNearestNeighbors_ゼロベクトル_NaN処理", () => {
    // Arrange
    const zeroVector = createMockEmbedding([0, 0, 0]);
    const embeddings: RunEmbedding[] = [
      createMockRunEmbedding("zero", createMockEmbedding([0, 0, 0])),
    ];

    // Act
    const result = findNearestNeighbors(zeroVector, embeddings, 1);

    // Assert - ゼロベクトル同士はNaNになるが処理が継続すること
    expect(result).toHaveLength(1);
  });
});
