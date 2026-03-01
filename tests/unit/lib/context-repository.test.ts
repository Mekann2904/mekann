/**
 * context-repository.ts 単体テスト
 * カバレッジ分析: ContextRepository, ContextNode, getRelevantContext, cosineSimilarity
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import {
  ContextRepository,
  RELEVANCE_THRESHOLD,
  type ContextNode,
  type ContextMetadata,
} from "../../../.pi/lib/context-repository.js";

// ============================================================================
// 定数テスト
// ============================================================================

describe("定数", () => {
  it("RELEVANCE_THRESHOLD_0.65", () => {
    // Assert
    expect(RELEVANCE_THRESHOLD).toBe(0.65);
  });

  it("RELEVANCE_THRESHOLD_範囲内", () => {
    // Assert
    expect(RELEVANCE_THRESHOLD).toBeGreaterThan(0);
    expect(RELEVANCE_THRESHOLD).toBeLessThan(1);
  });
});

// ============================================================================
// ヘルパー関数
// ============================================================================

function createTestEmbedding(dimensions: number = 128): number[] {
  return Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
}

function createNormalizedEmbedding(dimensions: number = 128): number[] {
  const embedding = createTestEmbedding(dimensions);
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map((v) => v / norm);
}

function createSimilarEmbedding(
  base: number[],
  similarity: number = 0.8
): number[] {
  // Create an embedding with specified similarity to base
  const noise = createNormalizedEmbedding(base.length);
  const scale = Math.sqrt(1 - similarity * similarity);
  return base.map((v, i) => v * similarity + noise[i] * scale);
}

// ============================================================================
// ContextRepository テスト
// ============================================================================

describe("ContextRepository", () => {
  let repository: ContextRepository;

  beforeEach(() => {
    repository = new ContextRepository();
  });

  // ==========================================================================
  // コンストラクタ
  // ==========================================================================

  describe("constructor", () => {
    it("constructor_初期状態_空", () => {
      // Assert
      expect(repository.size()).toBe(0);
      expect(repository.getRoot()).toBeNull();
    });
  });

  // ==========================================================================
  // addContext テスト
  // ==========================================================================

  describe("addContext", () => {
    it("addContext_ルート追加_成功", () => {
      // Act
      const node = repository.addContext("task-1", "Test content");

      // Assert
      expect(node.id).toBe("ctx-task-1");
      expect(node.content).toBe("Test content");
      expect(node.metadata.taskId).toBe("task-1");
    });

    it("addContext_ルート設定", () => {
      // Act
      repository.addContext("task-1", "Root content");

      // Assert
      expect(repository.getRoot()).not.toBeNull();
      expect(repository.getRoot()?.id).toBe("ctx-task-1");
    });

    it("addContext_子ノード追加_成功", () => {
      // Arrange
      repository.addContext("task-1", "Parent content");

      // Act
      const child = repository.addContext("task-2", "Child content", "task-1");

      // Assert
      expect(child.id).toBe("ctx-task-2");
      const root = repository.getRoot();
      expect(root?.children.length).toBe(1);
      expect(root?.children[0].id).toBe("ctx-task-2");
    });

    it("addContext_メタデータ生成", () => {
      // Act
      const node = repository.addContext("task-1", "Test content");

      // Assert
      expect(node.metadata.taskId).toBe("task-1");
      expect(node.metadata.timestamp).toBeDefined();
      expect(node.metadata.tokens).toBeGreaterThan(0);
      expect(node.metadata.relevance).toBe(1.0);
    });

    it("addContext_トークン数推定", () => {
      // Arrange
      const longContent = "a".repeat(400); // ~100 tokens

      // Act
      const node = repository.addContext("task-1", longContent);

      // Assert
      expect(node.metadata.tokens).toBe(Math.ceil(400 / 4)); // chars / 4
    });

    it("addContext_size増加", () => {
      // Act
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");

      // Assert
      expect(repository.size()).toBe(2);
    });

    it("addContext_空コンテンツ_正常処理", () => {
      // Act
      const node = repository.addContext("task-1", "");

      // Assert
      expect(node.content).toBe("");
      expect(node.metadata.tokens).toBe(0);
    });

    it("addContext_存在しない親_ルートに追加されない", () => {
      // Act
      const node = repository.addContext("task-2", "Child", "nonexistent");

      // Assert
      expect(repository.size()).toBe(1);
      expect(repository.getRoot()).toBeNull(); // 親が存在しないためルートも設定されない
    });
  });

  // ==========================================================================
  // setEmbedding テスト
  // ==========================================================================

  describe("setEmbedding", () => {
    it("setEmbedding_設定成功", () => {
      // Arrange
      repository.addContext("task-1", "Content");
      const embedding = createTestEmbedding();

      // Act
      repository.setEmbedding("task-1", embedding);

      // Assert
      const node = repository.getContextByTaskId("task-1");
      expect(node?.embedding).toEqual(embedding);
    });

    it("setEmbedding_存在しないタスク_無視", () => {
      // Act
      repository.setEmbedding("nonexistent", createTestEmbedding());

      // Assert - エラーなく完了
      expect(repository.size()).toBe(0);
    });
  });

  // ==========================================================================
  // getRelevantContext テスト
  // ==========================================================================

  describe("getRelevantContext", () => {
    it("getRelevantContext_空リポジトリ_空配列", () => {
      // Act
      const result = repository.getRelevantContext(createTestEmbedding());

      // Assert
      expect(result).toEqual([]);
    });

    it("getRelevantContext_埋め込みなし_空配列", () => {
      // Arrange
      repository.addContext("task-1", "Content without embedding");

      // Act
      const result = repository.getRelevantContext(createTestEmbedding());

      // Assert
      expect(result).toEqual([]);
    });

    it("getRelevantContext_閾値以上_返却", () => {
      // Arrange
      const baseEmbedding = createNormalizedEmbedding();
      const similarEmbedding = createSimilarEmbedding(baseEmbedding, 0.9);

      repository.addContext("task-1", "Content 1");
      repository.setEmbedding("task-1", similarEmbedding);

      // Act
      const result = repository.getRelevantContext(baseEmbedding, 0.8);

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("ctx-task-1");
    });

    it("getRelevantContext_閾値未満_除外", () => {
      // Arrange
      const baseEmbedding = createNormalizedEmbedding();
      const dissimilarEmbedding = createSimilarEmbedding(baseEmbedding, 0.3);

      repository.addContext("task-1", "Content 1");
      repository.setEmbedding("task-1", dissimilarEmbedding);

      // Act
      const result = repository.getRelevantContext(baseEmbedding, 0.8);

      // Assert
      expect(result.length).toBe(0);
    });

    it("getRelevantContext_デフォルト閾値_0.65", () => {
      // Arrange
      const baseEmbedding = createNormalizedEmbedding();
      const similarEmbedding = createSimilarEmbedding(baseEmbedding, 0.7);

      repository.addContext("task-1", "Content 1");
      repository.setEmbedding("task-1", similarEmbedding);

      // Act
      const result = repository.getRelevantContext(baseEmbedding);

      // Assert
      expect(result.length).toBe(1);
    });

    it("getRelevantContext_関連性降順ソート", () => {
      // Arrange - Create hierarchical structure
      const baseEmbedding = createNormalizedEmbedding();

      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2", "task-1"); // child of task-1
      repository.addContext("task-3", "Content 3", "task-2"); // child of task-2

      repository.setEmbedding("task-1", createSimilarEmbedding(baseEmbedding, 0.7));
      repository.setEmbedding("task-2", createSimilarEmbedding(baseEmbedding, 0.9));
      repository.setEmbedding("task-3", createSimilarEmbedding(baseEmbedding, 0.8));

      // Act
      const result = repository.getRelevantContext(baseEmbedding, 0.6);

      // Assert - all nodes should be returned in relevance order
      expect(result.length).toBe(3);
      expect(result[0].metadata.taskId).toBe("task-2"); // most similar
      expect(result[1].metadata.taskId).toBe("task-3");
      expect(result[2].metadata.taskId).toBe("task-1");
    });

    it("getRelevantContext_子ノード含む_探索", () => {
      // Arrange
      const baseEmbedding = createNormalizedEmbedding();

      repository.addContext("task-1", "Parent");
      repository.setEmbedding("task-1", createSimilarEmbedding(baseEmbedding, 0.9));

      repository.addContext("task-2", "Child", "task-1");
      repository.setEmbedding("task-2", createSimilarEmbedding(baseEmbedding, 0.85));

      // Act
      const result = repository.getRelevantContext(baseEmbedding, 0.8);

      // Assert
      expect(result.length).toBe(2);
    });
  });

  // ==========================================================================
  // getContextByTaskId テスト
  // ==========================================================================

  describe("getContextByTaskId", () => {
    it("getContextByTaskId_存在する_返却", () => {
      // Arrange
      repository.addContext("task-1", "Content");

      // Act
      const result = repository.getContextByTaskId("task-1");

      // Assert
      expect(result).toBeDefined();
      expect(result?.metadata.taskId).toBe("task-1");
    });

    it("getContextByTaskId_存在しない_undefined", () => {
      // Act
      const result = repository.getContextByTaskId("nonexistent");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // getInheritedContext テスト
  // ==========================================================================

  describe("getInheritedContext", () => {
    it("getInheritedContext_存在しない_空配列", () => {
      // Act
      const result = repository.getInheritedContext("nonexistent");

      // Assert
      expect(result).toEqual([]);
    });

    it("getInheritedContext_親なし_空配列", () => {
      // Arrange
      repository.addContext("task-1", "Root");

      // Act
      const result = repository.getInheritedContext("task-1");

      // Assert
      expect(result).toEqual([]);
    });

    it("getInheritedContext_親あり_返却", () => {
      // Arrange
      repository.addContext("task-1", "Parent");
      repository.addContext("task-2", "Child", "task-1");

      // Act
      const result = repository.getInheritedContext("task-2");

      // Assert
      expect(result.length).toBe(1);
      expect(result[0].metadata.taskId).toBe("task-1");
    });

    it("getInheritedContext_多世代_全祖先返却", () => {
      // Arrange
      repository.addContext("task-1", "Grandparent");
      repository.addContext("task-2", "Parent", "task-1");
      repository.addContext("task-3", "Child", "task-2");

      // Act
      const result = repository.getInheritedContext("task-3");

      // Assert
      expect(result.length).toBe(2); // Parent + Grandparent
    });
  });

  // ==========================================================================
  // compressContext テスト
  // ==========================================================================

  describe("compressContext", () => {
    it("compressContext_短いコンテンツ_そのまま", async () => {
      // Arrange
      const node = repository.addContext("task-1", "Short content");

      // Act
      const result = await repository.compressContext(node, 1000);

      // Assert
      expect(result).toBe("Short content");
    });

    it("compressContext_長いコンテンツ_圧縮", async () => {
      // Arrange
      const longContent = "a".repeat(10000);
      const node = repository.addContext("task-1", longContent);

      // Act
      const result = await repository.compressContext(node, 100);

      // Assert
      expect(result.length).toBeLessThan(longContent.length);
      expect(result).toContain("[truncated]");
    });

    it("compressContext_目標トークン数_概ね達成", async () => {
      // Arrange
      const longContent = "a".repeat(10000);
      const node = repository.addContext("task-1", longContent);
      const targetTokens = 100;

      // Act
      const result = await repository.compressContext(node, targetTokens);

      // Assert - 目標トークン数 * 4 文字以下（余裕を持って）
      expect(result.length).toBeLessThanOrEqual(targetTokens * 4 + 20);
    });
  });

  // ==========================================================================
  // size テスト
  // ==========================================================================

  describe("size", () => {
    it("size_初期_0", () => {
      // Assert
      expect(repository.size()).toBe(0);
    });

    it("size_追加後_増加", () => {
      // Act
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");

      // Assert
      expect(repository.size()).toBe(2);
    });
  });

  // ==========================================================================
  // getRoot テスト
  // ==========================================================================

  describe("getRoot", () => {
    it("getRoot_初期_null", () => {
      // Assert
      expect(repository.getRoot()).toBeNull();
    });

    it("getRoot_追加後_返却", () => {
      // Arrange
      repository.addContext("task-1", "Root");

      // Assert
      expect(repository.getRoot()).not.toBeNull();
      expect(repository.getRoot()?.id).toBe("ctx-task-1");
    });
  });

  // ==========================================================================
  // clear テスト
  // ==========================================================================

  describe("clear", () => {
    it("clear_全データ削除", () => {
      // Arrange
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2");

      // Act
      repository.clear();

      // Assert
      expect(repository.size()).toBe(0);
      expect(repository.getRoot()).toBeNull();
    });
  });

  // ==========================================================================
  // getStats テスト
  // ==========================================================================

  describe("getStats", () => {
    it("getStats_初期状態", () => {
      // Act
      const stats = repository.getStats();

      // Assert
      expect(stats.totalNodes).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.maxDepth).toBe(0);
      expect(stats.avgTokensPerNode).toBe(0);
    });

    it("getStats_ノード追加後", () => {
      // Arrange
      repository.addContext("task-1", "Content 1");
      repository.addContext("task-2", "Content 2", "task-1");

      // Act
      const stats = repository.getStats();

      // Assert
      expect(stats.totalNodes).toBe(2);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.maxDepth).toBe(2);
    });

    it("getStats_平均トークン計算", () => {
      // Arrange - Create hierarchical structure so all nodes are traversed
      repository.addContext("task-1", "a".repeat(400)); // 100 tokens
      repository.addContext("task-2", "b".repeat(800), "task-1"); // 200 tokens

      // Act
      const stats = repository.getStats();

      // Assert - (100 + 200) / 2 = 150
      expect(stats.avgTokensPerNode).toBe(150);
    });
  });
});

// ============================================================================
// エラーハンドリングテスト
// ============================================================================

describe("エラーハンドリング", () => {
  let repository: ContextRepository;

  beforeEach(() => {
    repository = new ContextRepository();
  });

  it("存在しないキー_getContextByTaskId_undefined", () => {
    // Act
    const result = repository.getContextByTaskId("nonexistent");

    // Assert
    expect(result).toBeUndefined();
  });

  it("存在しないキー_getInheritedContext_空配列", () => {
    // Act
    const result = repository.getInheritedContext("nonexistent");

    // Assert
    expect(result).toEqual([]);
  });

  it("存在しないキー_setEmbedding_無視", () => {
    // Act
    repository.setEmbedding("nonexistent", [1, 2, 3]);

    // Assert - エラーなく完了
    expect(repository.size()).toBe(0);
  });

  it("異なる次元の埋め込み_比較_類似度0", () => {
    // Arrange
    const embedding1 = [1, 2, 3];
    const embedding2 = [1, 2, 3, 4, 5]; // 異なる次元

    repository.addContext("task-1", "Content 1");
    repository.addContext("task-2", "Content 2");

    repository.setEmbedding("task-1", embedding1);
    repository.setEmbedding("task-2", embedding2);

    // Act
    const result = repository.getRelevantContext(embedding1, 0);

    // Assert - 次元が異なるため類似度0として扱われる
    expect(result.length).toBe(1); // task-1のみ（同一ベクトルなので類似度1）
    expect(result[0].metadata.taskId).toBe("task-1");
  });

  it("ゼロベクトル_比較_類似度0", () => {
    // Arrange
    const zeroEmbedding = [0, 0, 0, 0, 0];
    const queryEmbedding = [1, 2, 3, 4, 5];

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", zeroEmbedding);

    // Act - query with non-zero vector against zero embedding
    const result = repository.getRelevantContext(queryEmbedding, 0.5);

    // Assert - zero vector similarity is 0, so not returned
    expect(result.length).toBe(0);
  });

  it("空の埋め込み配列_正常処理", () => {
    // Arrange
    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", []);

    // Act - empty query against empty embedding, threshold 0.5
    // Empty arrays have length 0, cosineSimilarity returns 0
    const result = repository.getRelevantContext([], 0.5);

    // Assert - similarity 0 is not >= 0.5
    expect(result.length).toBe(0);
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  let repository: ContextRepository;

  beforeEach(() => {
    repository = new ContextRepository();
  });

  it("非常に長いコンテンツ_正常処理", () => {
    // Arrange
    const longContent = "x".repeat(100000);

    // Act
    const node = repository.addContext("task-1", longContent);

    // Assert
    expect(node.content).toBe(longContent);
    expect(node.metadata.tokens).toBe(Math.ceil(100000 / 4));
  });

  it("特殊文字コンテンツ_正常処理", () => {
    // Arrange
    const specialContent = "特殊文字: \n\t\r\"'<>&日本語🎉";

    // Act
    const node = repository.addContext("task-1", specialContent);

    // Assert
    expect(node.content).toBe(specialContent);
  });

  it("深い階層構造_正常処理", () => {
    // Arrange
    const depth = 100;
    repository.addContext("task-0", "Root");

    for (let i = 1; i < depth; i++) {
      repository.addContext(`task-${i}`, `Level ${i}`, `task-${i - 1}`);
    }

    // Act
    const stats = repository.getStats();

    // Assert
    expect(stats.totalNodes).toBe(depth);
    expect(stats.maxDepth).toBe(depth);
  });

  it("大量のノード_パフォーマンス", () => {
    // Arrange
    const count = 1000;

    // Act
    const start = performance.now();
    for (let i = 0; i < count; i++) {
      repository.addContext(`task-${i}`, `Content ${i}`);
    }
    const elapsed = performance.now() - start;

    // Assert
    expect(repository.size()).toBe(count);
    expect(elapsed).toBeLessThan(1000); // 1秒以内
  });

  it("同一タスクID_上書き", () => {
    // Arrange
    repository.addContext("task-1", "First content");
    repository.addContext("task-1", "Second content");

    // Act
    const node = repository.getContextByTaskId("task-1");

    // Assert
    expect(node?.content).toBe("Second content");
    expect(repository.size()).toBe(1);
  });

  it("非常に類似度が高い埋め込み_正常処理", () => {
    // Arrange
    const baseEmbedding = createNormalizedEmbedding(128);
    const identicalEmbedding = [...baseEmbedding]; // 完全同一

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", identicalEmbedding);

    // Act
    const result = repository.getRelevantContext(baseEmbedding, 0.99);

    // Assert
    expect(result.length).toBe(1);
    expect(result[0].metadata.relevance).toBeCloseTo(1.0, 5);
  });

  it("負の値を含む埋め込み_正常処理", () => {
    // Arrange
    const embedding = [-0.5, 0.3, -0.8, 0.1, -0.2];

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", embedding);

    // Act
    const result = repository.getRelevantContext(embedding, 0.99);

    // Assert
    expect(result.length).toBe(1);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("addContext_任意のコンテンツ_トークン数正", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10000 }), (content) => {
        const repo = new ContextRepository();
        const node = repo.addContext("task-1", content);
        return node.metadata.tokens >= 0;
      })
    );
  });

  it("addContext_複数追加_size整合", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
        const repo = new ContextRepository();
        for (let i = 0; i < count; i++) {
          repo.addContext(`task-${i}`, `Content ${i}`);
        }
        return repo.size() === count;
      })
    );
  });

  it("getRelevantContext_埋め込み次元一致_類似度範囲", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 128 }),
        fc.integer({ min: 1, max: 10 }),
        (dimensions, nodeCount) => {
          const repo = new ContextRepository();
          const queryEmbedding = createNormalizedEmbedding(dimensions);

          for (let i = 0; i < nodeCount; i++) {
            repo.addContext(`task-${i}`, `Content ${i}`);
            repo.setEmbedding(`task-${i}`, createNormalizedEmbedding(dimensions));
          }

          const results = repo.getRelevantContext(queryEmbedding, 0);
          for (const node of results) {
            if (node.metadata.relevance < -1 || node.metadata.relevance > 1) {
              return false;
            }
          }
          return true;
        }
      )
    );
  });

  it("compressContext_任意の目標トークン_結果短縮", async () => {
    // Simple deterministic test instead of property-based
    const content = "x".repeat(5000);
    const repo = new ContextRepository();
    const node = repo.addContext("task-1", content);
    const compressed = await repo.compressContext(node, 100);
    // compressed is always <= original
    expect(compressed.length).toBeLessThanOrEqual(content.length);
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  let repository: ContextRepository;

  beforeEach(() => {
    repository = new ContextRepository();
  });

  it("閾値1.0_完全一致のみ", () => {
    // Arrange
    const embedding = createNormalizedEmbedding();

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", [...embedding]); // 完全同一

    repository.addContext("task-2", "Content 2");
    repository.setEmbedding("task-2", createSimilarEmbedding(embedding, 0.99));

    // Act
    const result = repository.getRelevantContext(embedding, 1.0);

    // Assert
    expect(result.length).toBe(1);
    expect(result[0].metadata.taskId).toBe("task-1");
  });

  it("閾値0_全て返却", () => {
    // Arrange
    const embedding = createNormalizedEmbedding();

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", createSimilarEmbedding(embedding, 0.1));

    // Act
    const result = repository.getRelevantContext(embedding, 0);

    // Assert
    expect(result.length).toBe(1);
  });

  it("1次元埋め込み_正常処理", () => {
    // Arrange
    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", [1]);

    // Act
    const result = repository.getRelevantContext([1], 0.5);

    // Assert
    expect(result.length).toBe(1);
  });

  it("高次元埋め込み_正常処理", () => {
    // Arrange
    const dimensions = 1536; // OpenAI embedding size
    const embedding = createNormalizedEmbedding(dimensions);

    repository.addContext("task-1", "Content");
    repository.setEmbedding("task-1", embedding);

    // Act
    const result = repository.getRelevantContext(embedding, 0.9);

    // Assert
    expect(result.length).toBe(1);
  });

  it("空文字コンテンツ_トークン0", () => {
    // Act
    const node = repository.addContext("task-1", "");

    // Assert
    expect(node.metadata.tokens).toBe(0);
  });

  it("単一文字コンテンツ_トークン1", () => {
    // Act
    const node = repository.addContext("task-1", "a");

    // Assert
    expect(node.metadata.tokens).toBe(1); // ceil(1/4) = 1
  });
});
