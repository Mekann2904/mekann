/**
 * semantic-repetition.ts 単体テスト
 * カバレッジ分析: detectSemanticRepetition, TrajectoryTracker, getRecommendedAction
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";

// 埋め込みモジュールのモック
vi.mock("../../../.pi/lib/embeddings/index.js", () => ({
  generateEmbedding: vi.fn(),
  cosineSimilarity: vi.fn((a, b) => {
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

import {
  detectSemanticRepetition,
  detectSemanticRepetitionFromEmbeddings,
  TrajectoryTracker,
  getRecommendedAction,
  isSemanticRepetitionAvailable,
  DEFAULT_REPETITION_THRESHOLD,
  DEFAULT_MAX_TEXT_LENGTH,
  DEFAULT_MAX_TRAJECTORY_STEPS,
  type SemanticRepetitionResult,
  type SemanticRepetitionOptions,
} from "../../../.pi/lib/semantic-repetition.js";
import { generateEmbedding, getEmbeddingProvider } from "../../../.pi/lib/embeddings/index.js";

// ============================================================================
// detectSemanticRepetition テスト
// ============================================================================

describe("detectSemanticRepetition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detectSemanticRepetition_完全一致_重複検出", async () => {
    // Arrange
    const text = "This is the same text";

    // Act
    const result = await detectSemanticRepetition(text, text);

    // Assert
    expect(result.isRepeated).toBe(true);
    expect(result.similarity).toBe(1.0);
    expect(result.method).toBe("exact");
  });

  it("detectSemanticRepetition_異なるテキスト_非重複", async () => {
    // Arrange
    vi.mocked(getEmbeddingProvider).mockResolvedValue(null);

    // Act
    const result = await detectSemanticRepetition("Hello world", "Goodbye world", {
      useEmbedding: false,
    });

    // Assert
    expect(result.isRepeated).toBe(false);
    expect(result.method).toBe("exact");
  });

  it("detectSemanticRepetition_空文字_非重複", async () => {
    // Arrange & Act
    const result = await detectSemanticRepetition("", "some text");

    // Assert
    expect(result.isRepeated).toBe(false);
    expect(result.similarity).toBe(0);
  });

  it("detectSemanticRepetition_両方空文字_非重複", async () => {
    // Arrange & Act
    const result = await detectSemanticRepetition("", "");

    // Assert
    expect(result.isRepeated).toBe(false);
    expect(result.similarity).toBe(0);
  });

  it("detectSemanticRepetition_空白正規化_完全一致", async () => {
    // Arrange
    const text1 = "Hello   world";
    const text2 = "Hello world";

    // Act
    const result = await detectSemanticRepetition(text1, text2);

    // Assert - 正規化後に一致するため完全一致と判定される
    expect(result.method).toBe("exact");
    expect(result.isRepeated).toBe(true);
  });

  it("detectSemanticRepetition_カスタム閾値_適用", async () => {
    // Arrange
    vi.mocked(getEmbeddingProvider).mockResolvedValue({} as any);
    vi.mocked(generateEmbedding).mockResolvedValueOnce([1, 0, 0]);
    vi.mocked(generateEmbedding).mockResolvedValueOnce([0.9, 0, 0]);

    // Act
    const result = await detectSemanticRepetition("text1", "text2", {
      threshold: 0.5,
      useEmbedding: true,
    });

    // Assert
    expect(result.method).toBe("embedding");
    expect(result.similarity).toBeGreaterThan(0.5);
  });

  it("detectSemanticRepetition_プロバイダなし_unavailable", async () => {
    // Arrange
    vi.mocked(getEmbeddingProvider).mockResolvedValue(null);

    // Act
    const result = await detectSemanticRepetition("text1", "text2", {
      useEmbedding: true,
    });

    // Assert
    expect(result.method).toBe("unavailable");
    expect(result.isRepeated).toBe(false);
  });

  it("detectSemanticRepetition_テキスト長制限_切り詰め", async () => {
    // Arrange
    const longText1 = "a".repeat(3000);
    const longText2 = "a".repeat(3000);

    // Act
    const result = await detectSemanticRepetition(longText1, longText2, {
      maxTextLength: 2000,
    });

    // Assert - 切り詰められても一致と判定される
    expect(result.isRepeated).toBe(true);
    expect(result.method).toBe("exact");
  });
});

// ============================================================================
// detectSemanticRepetitionFromEmbeddings テスト
// ============================================================================

describe("detectSemanticRepetitionFromEmbeddings", () => {
  it("detectSemanticRepetitionFromEmbeddings_高類似度_重複検出", () => {
    // Arrange
    const emb1 = [1, 0, 0];
    const emb2 = [0.95, 0, 0];

    // Act
    const result = detectSemanticRepetitionFromEmbeddings(emb1, emb2, 0.85);

    // Assert
    expect(result.isRepeated).toBe(true);
    expect(result.method).toBe("embedding");
  });

  it("detectSemanticRepetitionFromEmbeddings_低類似度_非重複", () => {
    // Arrange - 直交に近いベクトルでテスト
    const emb1 = [1, 0, 0];
    const emb2 = [0.1, 0.1, 0.99]; // 異なる方向

    // Act
    const result = detectSemanticRepetitionFromEmbeddings(emb1, emb2, 0.85);

    // Assert - 直交に近いベクトルの類似度は0.1程度で閾値0.85未満
    expect(result.similarity).toBeLessThan(0.2);
    expect(result.isRepeated).toBe(false);
  });

  it("detectSemanticRepetitionFromEmbeddings_直交ベクトル_類似度0", () => {
    // Arrange
    const emb1 = [1, 0, 0];
    const emb2 = [0, 1, 0];

    // Act
    const result = detectSemanticRepetitionFromEmbeddings(emb1, emb2);

    // Assert
    expect(result.similarity).toBe(0);
    expect(result.isRepeated).toBe(false);
  });

  it("detectSemanticRepetitionFromEmbeddings_同一ベクトル_類似度1", () => {
    // Arrange
    const emb = [1, 2, 3, 4, 5];

    // Act
    const result = detectSemanticRepetitionFromEmbeddings(emb, emb);

    // Assert
    expect(result.similarity).toBe(1);
    expect(result.isRepeated).toBe(true);
  });
});

// ============================================================================
// TrajectoryTracker テスト
// ============================================================================

describe("TrajectoryTracker", () => {
  let tracker: TrajectoryTracker;

  beforeEach(() => {
    tracker = new TrajectoryTracker();
    vi.clearAllMocks();
  });

  it("TrajectoryTracker_初期状態_ステップ0", () => {
    // Assert
    expect(tracker.stepCount).toBe(0);
  });

  it("TrajectoryTracker_ステップ記録_カウント増加", async () => {
    // Arrange & Act
    await tracker.recordStep("First output");

    // Assert
    expect(tracker.stepCount).toBe(1);
  });

  it("TrajectoryTracker_複数ステップ_順次記録", async () => {
    // Arrange & Act
    await tracker.recordStep("Output 1");
    await tracker.recordStep("Output 2");
    await tracker.recordStep("Output 3");

    // Assert
    expect(tracker.stepCount).toBe(3);
  });

  it("TrajectoryTracker_同一出力_重複検出", async () => {
    // Arrange & Act
    await tracker.recordStep("Same text");
    const result = await tracker.recordStep("Same text");

    // Assert
    expect(result.isRepeated).toBe(true);
    expect(result.method).toBe("exact");
  });

  it("TrajectoryTracker_サマリー_正しい統計", async () => {
    // Arrange & Act
    await tracker.recordStep("Output 1");
    await tracker.recordStep("Output 2");
    await tracker.recordStep("Output 2"); // 1回重複

    const summary = tracker.getSummary();

    // Assert
    expect(summary.totalSteps).toBe(3);
    expect(summary.repetitionCount).toBe(1);
  });

  it("TrajectoryTracker_空サマリー_初期値", () => {
    // Act
    const summary = tracker.getSummary();

    // Assert
    expect(summary.totalSteps).toBe(0);
    expect(summary.repetitionCount).toBe(0);
    expect(summary.averageSimilarity).toBe(0);
    expect(summary.isStuck).toBe(false);
  });

  it("TrajectoryTracker_リセット_状態クリア", async () => {
    // Arrange
    await tracker.recordStep("Output");

    // Act
    tracker.reset();

    // Assert
    expect(tracker.stepCount).toBe(0);
  });

  it("TrajectoryTracker_最大ステップ_超過時削除", async () => {
    // Arrange
    const smallTracker = new TrajectoryTracker(3);

    // Act
    for (let i = 0; i < 5; i++) {
      await smallTracker.recordStep(`Output ${i}`);
    }

    // Assert
    expect(smallTracker.stepCount).toBe(3);
  });

  it("TrajectoryTracker_停滞検出_連続重複", async () => {
    // Arrange & Act
    await tracker.recordStep("Same");
    await tracker.recordStep("Same");
    await tracker.recordStep("Same");
    await tracker.recordStep("Same");

    const summary = tracker.getSummary();

    // Assert
    expect(summary.isStuck).toBe(true);
  });

  it("TrajectoryTracker_傾向_安定", async () => {
    // Arrange & Act
    await tracker.recordStep("Output 1");
    await tracker.recordStep("Output 2");
    await tracker.recordStep("Output 3");

    const summary = tracker.getSummary();

    // Assert
    expect(summary.similarityTrend).toBe("stable");
  });
});

// ============================================================================
// getRecommendedAction テスト
// ============================================================================

describe("getRecommendedAction", () => {
  it("getRecommendedAction_停滞状態_早期停止", () => {
    // Arrange & Act
    const result = getRecommendedAction(3, 5, true);

    // Assert
    expect(result).toBe("early_stop");
  });

  it("getRecommendedAction_高重複率_ピボット", () => {
    // Arrange - 50%重複率
    // Act
    const result = getRecommendedAction(5, 10, false);

    // Assert
    expect(result).toBe("pivot");
  });

  it("getRecommendedAction_低重複率_継続", () => {
    // Arrange - 10%重複率
    // Act
    const result = getRecommendedAction(1, 10, false);

    // Assert
    expect(result).toBe("continue");
  });

  it("getRecommendedAction_ゼロステップ_継続", () => {
    // Arrange & Act
    const result = getRecommendedAction(0, 0, false);

    // Assert
    expect(result).toBe("continue");
  });

  it("getRecommendedAction_境界40パーセント_ピボット", () => {
    // Arrange - 正確に40%
    // Act
    const result = getRecommendedAction(4, 10, false);

    // Assert - 40%はpivotの境界外（>40%が必要）
    expect(result).toBe("continue");
  });

  it("getRecommendedAction_境界超過_ピボット", () => {
    // Arrange - 41%重複率
    // Act
    const result = getRecommendedAction(41, 100, false);

    // Assert
    expect(result).toBe("pivot");
  });
});

// ============================================================================
// isSemanticRepetitionAvailable テスト
// ============================================================================

describe("isSemanticRepetitionAvailable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isSemanticRepetitionAvailable_プロバイダなし_false", async () => {
    // Arrange
    vi.mocked(getEmbeddingProvider).mockResolvedValue(null);

    // Act
    const result = await isSemanticRepetitionAvailable();

    // Assert
    expect(result).toBe(false);
  });

  it("isSemanticRepetitionAvailable_プロバイダあり_true", async () => {
    // Arrange
    vi.mocked(getEmbeddingProvider).mockResolvedValue({} as any);

    // Act
    const result = await isSemanticRepetitionAvailable();

    // Assert
    expect(result).toBe(true);
  });
});

// ============================================================================
// 定数テスト
// ============================================================================

describe("定数", () => {
  it("定数_DEFAULT_REPETITION_THRESHOLD_値確認", () => {
    expect(DEFAULT_REPETITION_THRESHOLD).toBe(0.85);
  });

  it("定数_DEFAULT_MAX_TEXT_LENGTH_値確認", () => {
    expect(DEFAULT_MAX_TEXT_LENGTH).toBe(2000);
  });

  it("定数_DEFAULT_MAX_TRAJECTORY_STEPS_値確認", () => {
    expect(DEFAULT_MAX_TRAJECTORY_STEPS).toBe(100);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("detectSemanticRepetitionFromEmbeddings_任意ベクトル_類似度範囲", () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 3, maxLength: 10 }),
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 3, maxLength: 10 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (emb1, emb2, threshold) => {
          const result = detectSemanticRepetitionFromEmbeddings(emb1, emb2, threshold);
          return result.similarity >= -1 && result.similarity <= 1;
        }
      )
    );
  });

  it("getRecommendedAction_任意の値_有効なアクション", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (repetitionCount, totalSteps, isStuck) => {
          const result = getRecommendedAction(repetitionCount, totalSteps, isStuck);
          return ["continue", "pivot", "early_stop"].includes(result);
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("TrajectoryTracker_最小ステップ1_正常動作", async () => {
    // Arrange
    const tracker = new TrajectoryTracker(1);

    // Act
    await tracker.recordStep("Output 1");
    await tracker.recordStep("Output 2");

    // Assert
    expect(tracker.stepCount).toBe(1);
  });

  it("detectSemanticRepetition_非常に長いテキスト_処理可能", async () => {
    // Arrange
    const longText = "a".repeat(10000);

    // Act & Assert
    await expect(detectSemanticRepetition(longText, longText)).resolves.not.toThrow();
  });

  it("detectSemanticRepetition_Unicodeテキスト_処理可能", async () => {
    // Arrange
    const unicodeText = "日本語テスト🎉🚀✨";

    // Act
    const result = await detectSemanticRepetition(unicodeText, unicodeText);

    // Assert
    expect(result.isRepeated).toBe(true);
  });
});
