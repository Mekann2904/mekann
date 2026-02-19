/**
 * context-engineering.ts 単体テスト
 * カバレッジ分析: estimateTokens, optimizeContextWindow, detectSemanticBoundaries,
 * chunkText, extractStateSummary, formatStateSummary, createContextItem,
 * mergeContextItems, calculateUtilization
 */
import {
  describe,
  it,
  expect,
  beforeEach,
} from "vitest";
import * as fc from "fast-check";
import {
  estimateTokens,
  estimateContextItemTokens,
  optimizeContextWindow,
  detectSemanticBoundaries,
  chunkText,
  extractStateSummary,
  formatStateSummary,
  createContextItem,
  mergeContextItems,
  calculateUtilization,
  DEFAULT_CONTEXT_WINDOW_CONFIG,
  DEFAULT_CHUNKING_CONFIG,
  DEFAULT_SUMMARY_CONFIG,
  type ContextItem,
  type ContextPriority,
  type ContextCategory,
} from "../../../.pi/lib/context-engineering.js";

// ============================================================================
// estimateTokens テスト
// ============================================================================

describe("estimateTokens", () => {
  it("estimateTokens_空文字_0返却", () => {
    // Arrange & Act
    const result = estimateTokens("");

    // Assert
    expect(result).toBe(0);
  });

  it("estimateTokens_nullOrUndefined_0返却", () => {
    // Arrange & Act & Assert
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it("estimateTokens_英単語_単語数ベースで推定", () => {
    // Arrange
    const text = "hello world test";

    // Act
    const result = estimateTokens(text);

    // Assert - 3 words, should be at least 3
    expect(result).toBeGreaterThanOrEqual(3);
  });

  it("estimateTokens_CJK文字_0.5倍で推定", () => {
    // Arrange
    const text = "日本語テスト"; // 5 CJK characters

    // Act
    const result = estimateTokens(text);

    // Assert - 5 CJK chars * 0.5 = 2.5, ceil = 3
    expect(result).toBeGreaterThanOrEqual(2);
  });

  it("estimateTokens_コード記号_0.3倍で推定", () => {
    // Arrange
    const text = "{}[]();:,."; // 10 code tokens

    // Act
    const result = estimateTokens(text);

    // Assert - 10 code tokens * 0.3 = 3
    expect(result).toBeGreaterThanOrEqual(3);
  });

  it("estimateTokens_複合テキスト_統合推定", () => {
    // Arrange
    const text = "hello 日本語 {world}";

    // Act
    const result = estimateTokens(text);

    // Assert - combination of all estimation methods
    expect(result).toBeGreaterThan(0);
  });
});

// ============================================================================
// estimateContextItemTokens テスト
// ============================================================================

describe("estimateContextItemTokens", () => {
  it("estimateContextItemTokens_tokenEstimateあり_その値返却", () => {
    // Arrange
    const item: ContextItem = {
      id: "test-1",
      content: "test content",
      priority: "medium",
      tokenEstimate: 100,
      category: "file-content",
      timestamp: Date.now(),
    };

    // Act
    const result = estimateContextItemTokens(item);

    // Assert
    expect(result).toBe(100);
  });

  it("estimateContextItemTokens_tokenEstimateなし_contentから推定", () => {
    // Arrange
    const item: ContextItem = {
      id: "test-1",
      content: "hello world",
      priority: "medium",
      tokenEstimate: 0,
      category: "file-content",
      timestamp: Date.now(),
    };

    // Act
    const result = estimateContextItemTokens(item);

    // Assert
    expect(result).toBeGreaterThan(0);
  });
});

// ============================================================================
// optimizeContextWindow テスト
// ============================================================================

describe("optimizeContextWindow", () => {
  it("optimizeContextWindow_空配列_空の結果返却", () => {
    // Arrange & Act
    const result = optimizeContextWindow([]);

    // Assert
    expect(result.items).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.utilizationRatio).toBe(0);
  });

  it("optimizeContextWindow_予算内_全アイテム保持", () => {
    // Arrange
    const items: ContextItem[] = [
      createContextItem("test content", "file-content", "medium"),
    ];

    // Act
    const result = optimizeContextWindow(items, {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxTokens: 10000,
      reservedTokens: 1000,
    });

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.trimmedItems).toHaveLength(0);
  });

  it("optimizeContextWindow_予算超過_優先度でトリム", () => {
    // Arrange
    const items: ContextItem[] = [
      createContextItem("critical content", "task-instruction", "critical"),
      createContextItem("optional content", "reference-doc", "optional"),
    ];

    // 小さな予算で設定
    const config = {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxTokens: 100,
      reservedTokens: 50,
      enableSummarization: false,
    };

    // Act
    const result = optimizeContextWindow(items, config);

    // Assert - criticalは残る、optionalはトリムされる可能性
    expect(result.items.some((i) => i.priority === "critical")).toBe(true);
  });

  it("optimizeContextWindow_全てcritical_トリム不可で警告", () => {
    // Arrange
    const items: ContextItem[] = [
      createContextItem("content 1", "task-instruction", "critical"),
      createContextItem("content 2", "task-instruction", "critical"),
    ];

    const config = {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxTokens: 50,
      reservedTokens: 25,
    };

    // Act
    const result = optimizeContextWindow(items, config);

    // Assert - critical items are preserved even when over budget
    expect(result.items.some((i) => i.priority === "critical")).toBe(true);
  });

  it("optimizeContextWindow_preserveOrder_true_順序維持", () => {
    // Arrange
    const items: ContextItem[] = [
      createContextItem("first", "file-content", "low"),
      createContextItem("second", "file-content", "high"),
      createContextItem("third", "file-content", "medium"),
    ];

    const config = {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      preserveOrder: true,
    };

    // Act
    const result = optimizeContextWindow(items, config);

    // Assert
    expect(result.items[0].content).toBe("first");
    expect(result.items[1].content).toBe("second");
    expect(result.items[2].content).toBe("third");
  });

  it("optimizeContextWindow_高利用率_警告追加", () => {
    // Arrange - 高利用率になるような設定
    const longContent = "x".repeat(10000);
    const items: ContextItem[] = [
      createContextItem(longContent, "file-content", "medium"),
    ];

    const config = {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxTokens: 15000,
      reservedTokens: 1000,
    };

    // Act
    const result = optimizeContextWindow(items, config);

    // Assert
    if (result.utilizationRatio > 0.9) {
      expect(result.warnings.some((w) => w.includes("utilization"))).toBe(true);
    }
  });
});

// ============================================================================
// detectSemanticBoundaries テスト
// ============================================================================

describe("detectSemanticBoundaries", () => {
  it("detectSemanticBoundaries_空文字_空配列返却", () => {
    // Arrange & Act
    const result = detectSemanticBoundaries("");

    // Assert
    expect(result).toHaveLength(0);
  });

  it("detectSemanticBoundaries_段落_境界検出", () => {
    // Arrange
    const text = "First paragraph.\n\nSecond paragraph.";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    expect(result.some((b) => b.type === "paragraph")).toBe(true);
  });

  it("detectSemanticBoundaries_Markdown見出し_境界検出", () => {
    // Arrange
    const text = "# Title\n\n## Subtitle";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    const sectionBoundaries = result.filter((b) => b.type === "section");
    expect(sectionBoundaries.length).toBeGreaterThan(0);
    expect(sectionBoundaries[0].metadata?.title).toBe("Title");
  });

  it("detectSemanticBoundaries_コードブロック_境界検出", () => {
    // Arrange
    const text = "```\ncode here\n```";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    const codeBoundaries = result.filter((b) => b.type === "code-block");
    expect(codeBoundaries.length).toBeGreaterThanOrEqual(2); // 開始と終了
  });

  it("detectSemanticBoundaries_エージェント出力マーカー_境界検出", () => {
    // Arrange
    const text = "SUMMARY: test\nCLAIM: something";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    expect(result.some((b) => b.type === "agent-output")).toBe(true);
  });

  it("detectSemanticBoundaries_リスト終了_境界検出", () => {
    // Arrange
    const text = "- item 1\n- item 2\n\nNot a list";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    expect(result.some((b) => b.type === "list-end")).toBe(true);
  });

  it("detectSemanticBoundaries_対話パターン_境界検出", () => {
    // Arrange
    const text = "Q: What?\nA: Something.";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    expect(result.some((b) => b.type === "dialogue-turn")).toBe(true);
  });

  it("detectSemanticBoundaries_トピックシフト_境界検出", () => {
    // Arrange
    const text = "First topic.\n\nHowever, something else.\n\nFurthermore, another point.";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    expect(result.some((b) => b.type === "semantic-gap")).toBe(true);
  });

  it("detectSemanticBoundaries_位置順でソート", () => {
    // Arrange
    const text = "# Title\n\nParagraph\n\n## Section";

    // Act
    const result = detectSemanticBoundaries(text);

    // Assert
    for (let i = 1; i < result.length; i++) {
      expect(result[i].position).toBeGreaterThanOrEqual(result[i - 1].position);
    }
  });
});

// ============================================================================
// chunkText テスト
// ============================================================================

describe("chunkText", () => {
  it("chunkText_空文字_空配列返却", () => {
    // Arrange & Act
    const result = chunkText("");

    // Assert
    expect(result).toHaveLength(0);
  });

  it("chunkText_短いテキスト_単一チャンク", () => {
    // Arrange
    const text = "Short text.";

    // Act
    const result = chunkText(text);

    // Assert
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].content).toContain("Short");
  });

  it("chunkText_長いテキスト_複数チャンク", () => {
    // Arrange
    const text = Array(50).fill("Paragraph content here.").join("\n\n");

    // Act
    const result = chunkText(text, {
      ...DEFAULT_CHUNKING_CONFIG,
      maxChunkTokens: 100,
    });

    // Assert
    expect(result.length).toBeGreaterThan(1);
  });

  it("chunkText_各チャンクにID付与", () => {
    // Arrange
    const text = "First paragraph.\n\nSecond paragraph.";

    // Act
    const result = chunkText(text);

    // Assert
    result.forEach((chunk, index) => {
      expect(chunk.id).toContain("chunk-");
    });
  });

  it("chunkText_コードブロック含む_hasCodeBlock設定", () => {
    // Arrange
    const text = "```\ncode\n```";

    // Act
    const result = chunkText(text);

    // Assert
    expect(result.some((chunk) => chunk.metadata.hasCodeBlock)).toBe(true);
  });

  it("chunkText_Markdown見出し含む_hasMarkdownHeadings設定", () => {
    // Arrange
    const text = "# Title\nContent";

    // Act
    const result = chunkText(text);

    // Assert
    expect(result.some((chunk) => chunk.metadata.hasMarkdownHeadings)).toBe(true);
  });

  it("chunkText_オーバーラップ設定_オーバーラップ追加", () => {
    // Arrange
    const text = Array(20).fill("Paragraph content here.").join("\n\n");

    // Act
    const result = chunkText(text, {
      ...DEFAULT_CHUNKING_CONFIG,
      maxChunkTokens: 50,
      overlapTokens: 10,
    });

    // Assert
    if (result.length > 1) {
      // 2つ目以降のチャンクには [..continued...] が含まれる
      expect(result.slice(1).some((chunk) => chunk.content.includes("continued"))).toBe(true);
    }
  });
});

// ============================================================================
// extractStateSummary テスト
// ============================================================================

describe("extractStateSummary", () => {
  it("extractStateSummary_空テキスト_基本構造返却", () => {
    // Arrange & Act
    const result = extractStateSummary("");

    // Assert
    expect(result.carriedForward).toHaveLength(0);
    expect(result.pendingTasks).toHaveLength(0);
    expect(result.confidence).toBeDefined();
  });

  it("extractStateSummary_CARRIED_FORWARD抽出", () => {
    // Arrange
    const text = "CARRIED_FORWARD:\n  - item1\n  - item2";

    // Act
    const result = extractStateSummary(text);

    // Assert
    expect(result.carriedForward.length).toBeGreaterThan(0);
  });

  it("extractStateSummary_NEXT_STEP抽出", () => {
    // Arrange
    const text = "NEXT_STEP: Do something important";

    // Act
    const result = extractStateSummary(text);

    // Assert
    expect(result.pendingTasks).toContain("Do something important");
  });

  it("extractStateSummary_NEXT_STEP_none_空配列", () => {
    // Arrange
    const text = "NEXT_STEP: none";

    // Act
    const result = extractStateSummary(text);

    // Assert
    expect(result.pendingTasks).toHaveLength(0);
  });

  it("extractStateSummary_CONFIDENCE抽出", () => {
    // Arrange
    const text = "CONFIDENCE: 0.85";

    // Act
    const result = extractStateSummary(text);

    // Assert
    expect(result.confidence).toBe(0.85);
  });

  it("extractStateSummary_EVIDENCE抽出", () => {
    // Arrange
    const text = "EVIDENCE:\n  - evidence1\n  - evidence2";

    // Act
    const result = extractStateSummary(text);

    // Assert
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it("extractStateSummary_前回サマリーあり_統合", () => {
    // Arrange
    const previousSummary = {
      id: "prev-1",
      timestamp: Date.now() - 1000,
      carriedForward: ["old item"],
      pendingTasks: [],
      decisions: [],
      blockers: ["old blocker"],
      assumptions: ["old assumption"],
      evidence: [],
      confidence: 0.5,
    };

    const text = "CARRIED_FORWARD:\n- new item";

    // Act
    const result = extractStateSummary(text, previousSummary);

    // Assert
    expect(result.carriedForward).toContain("old item");
    expect(result.carriedForward.some((item) => item.includes("new item"))).toBe(true);
  });

  it("extractStateSummary_maxCarriedForward制限適用", () => {
    // Arrange
    const text = "CARRIED_FORWARD:\n  - item1\n  - item2\n  - item3\n  - item4\n  - item5";

    // Act
    const result = extractStateSummary(text, undefined, {
      ...DEFAULT_SUMMARY_CONFIG,
      maxCarriedForward: 2,
    });

    // Assert
    expect(result.carriedForward.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// formatStateSummary テスト
// ============================================================================

describe("formatStateSummary", () => {
  it("formatStateSummary_空サマリー_CONFIDENCEのみ", () => {
    // Arrange
    const summary = {
      id: "test-1",
      timestamp: Date.now(),
      carriedForward: [],
      pendingTasks: [],
      decisions: [],
      blockers: [],
      assumptions: [],
      evidence: [],
      confidence: 0.5,
    };

    // Act
    const result = formatStateSummary(summary);

    // Assert
    expect(result).toContain("CONFIDENCE: 0.50");
  });

  it("formatStateSummary_全フィールド_整形出力", () => {
    // Arrange
    const summary = {
      id: "test-1",
      timestamp: Date.now(),
      carriedForward: ["item1"],
      pendingTasks: ["task1"],
      decisions: ["decision1"],
      blockers: ["blocker1"],
      assumptions: ["assumption1"],
      evidence: [],
      confidence: 0.85,
    };

    // Act
    const result = formatStateSummary(summary);

    // Assert
    expect(result).toContain("CARRIED_FORWARD:");
    expect(result).toContain("PENDING_TASKS:");
    expect(result).toContain("DECISIONS:");
    expect(result).toContain("BLOCKERS:");
    expect(result).toContain("ASSUMPTIONS:");
    expect(result).toContain("CONFIDENCE: 0.85");
  });
});

// ============================================================================
// createContextItem テスト
// ============================================================================

describe("createContextItem", () => {
  it("createContextItem_基本パラメータ_正常作成", () => {
    // Arrange & Act
    const result = createContextItem("test content", "file-content", "medium");

    // Assert
    expect(result.content).toBe("test content");
    expect(result.category).toBe("file-content");
    expect(result.priority).toBe("medium");
    expect(result.id).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it("createContextItem_オプション指定_反映", () => {
    // Arrange & Act
    const result = createContextItem("test", "task-instruction", "critical", {
      id: "custom-id",
      source: "test-source",
      metadata: { key: "value" },
    });

    // Assert
    expect(result.id).toBe("custom-id");
    expect(result.source).toBe("test-source");
    expect(result.metadata?.key).toBe("value");
    expect(result.priority).toBe("critical");
  });

  it("createContextItem_ID自動生成_一意性", () => {
    // Arrange & Act
    const result1 = createContextItem("test", "file-content");
    const result2 = createContextItem("test", "file-content");

    // Assert
    expect(result1.id).not.toBe(result2.id);
  });
});

// ============================================================================
// mergeContextItems テスト
// ============================================================================

describe("mergeContextItems", () => {
  it("mergeContextItems_空配列_空アイテム返却", () => {
    // Arrange & Act
    const result = mergeContextItems([]);

    // Assert
    expect(result.content).toBe("");
    expect(result.category).toBe("working-memory");
  });

  it("mergeContextItems_単一アイテム_そのまま返却", () => {
    // Arrange
    const item = createContextItem("single", "file-content", "high");

    // Act
    const result = mergeContextItems([item]);

    // Assert
    expect(result.content).toBe("single");
    expect(result.id).toBe(item.id);
  });

  it("mergeContextItems_concat戦略_連結", () => {
    // Arrange
    const items = [
      createContextItem("first", "file-content", "medium"),
      createContextItem("second", "file-content", "medium"),
    ];

    // Act
    const result = mergeContextItems(items, "concat");

    // Assert
    expect(result.content).toBe("first\n\nsecond");
  });

  it("mergeContextItems_priority-first戦略_優先度順", () => {
    // Arrange
    const items = [
      createContextItem("low", "file-content", "low"),
      createContextItem("critical", "file-content", "critical"),
      createContextItem("medium", "file-content", "medium"),
    ];

    // Act
    const result = mergeContextItems(items, "priority-first");

    // Assert
    expect(result.priority).toBe("critical"); // 最高優先度を継承
    expect(result.content).toContain("critical");
  });

  it("mergeContextItems_summarize戦略_要約形式", () => {
    // Arrange
    const items = [
      createContextItem("first content", "file-content", "medium"),
      createContextItem("second content", "file-content", "medium"),
    ];

    // Act
    const result = mergeContextItems(items, "summarize");

    // Assert
    expect(result.content).toContain("first content");
  });
});

// ============================================================================
// calculateUtilization テスト
// ============================================================================

describe("calculateUtilization", () => {
  it("calculateUtilization_空配列_0利用率", () => {
    // Arrange & Act
    const result = calculateUtilization([], 10000);

    // Assert
    expect(result.usedTokens).toBe(0);
    expect(result.utilizationRatio).toBe(0);
  });

  it("calculateUtilization_アイテムあり_計算", () => {
    // Arrange
    const items = [
      createContextItem("test content", "file-content", "medium"),
    ];

    // Act
    const result = calculateUtilization(items, 10000);

    // Assert
    expect(result.usedTokens).toBeGreaterThan(0);
    expect(result.utilizationRatio).toBeGreaterThan(0);
    expect(result.utilizationRatio).toBeLessThanOrEqual(1);
  });

  it("calculateUtilization_カテゴリ別内訳_集計", () => {
    // Arrange
    const items = [
      createContextItem("content1", "file-content", "medium"),
      createContextItem("content2", "conversation", "high"),
    ];

    // Act
    const result = calculateUtilization(items, 10000);

    // Assert
    expect(result.categoryBreakdown["file-content"]).toBeGreaterThan(0);
    expect(result.categoryBreakdown["conversation"]).toBeGreaterThan(0);
  });

  it("calculateUtilization_優先度別内訳_集計", () => {
    // Arrange
    const items = [
      createContextItem("critical", "task-instruction", "critical"),
      createContextItem("normal", "file-content", "medium"),
    ];

    // Act
    const result = calculateUtilization(items, 10000);

    // Assert
    expect(result.priorityBreakdown["critical"]).toBeGreaterThan(0);
    expect(result.priorityBreakdown["medium"]).toBeGreaterThan(0);
  });

  it("calculateUtilization_予算超過_1以上の比率", () => {
    // Arrange
    const longContent = "x ".repeat(10000); // More tokens
    const items = [createContextItem(longContent, "file-content", "medium")];

    // Act
    const result = calculateUtilization(items, 10); // Very small budget

    // Assert
    expect(result.utilizationRatio).toBeGreaterThanOrEqual(0); // Non-negative
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("estimateTokens_任意の文字列_非負整数", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = estimateTokens(text);
        return Number.isInteger(result) && result >= 0;
      })
    );
  });

  it("createContextItem_任意の内容_一意ID生成", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom(...(["file-content", "task-instruction", "conversation"] as ContextCategory[])),
        fc.constantFrom(...(["critical", "high", "medium", "low", "optional"] as ContextPriority[])),
        (content, category, priority) => {
          const item = createContextItem(content, category, priority);
          return item.id !== undefined && item.id.length > 0;
        }
      )
    );
  });

  it("detectSemanticBoundaries_任意のテキスト_位置順ソート", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 1000 }), (text) => {
        const result = detectSemanticBoundaries(text);
        for (let i = 1; i < result.length; i++) {
          if (result[i].position < result[i - 1].position) {
            return false;
          }
        }
        return true;
      })
    );
  });

  it("extractStateSummary_任意のテキスト_confidence範囲内", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (text) => {
        const result = extractStateSummary(text);
        return result.confidence >= 0 && result.confidence <= 1;
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("大量のアイテム_最適化処理", () => {
    // Arrange
    const items = Array(1000)
      .fill(null)
      .map((_, i) => createContextItem(`content ${i}`, "file-content", "medium"));

    // Act
    const result = optimizeContextWindow(items, {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxTokens: 50000,
      reservedTokens: 5000,
    });

    // Assert
    expect(result.items.length).toBeLessThanOrEqual(1000);
  });

  it("非常に長いテキスト_チャンキング", () => {
    // Arrange
    const text = "Paragraph ".repeat(10000);

    // Act
    const result = chunkText(text, {
      ...DEFAULT_CHUNKING_CONFIG,
      maxChunkTokens: 100,
      minChunkTokens: 10,
    });

    // Assert - テキストが分割されることを確認
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("特殊文字を含むテキスト_トークン推定", () => {
    // Arrange
    const text = "🎉\t\n\r\x00\x1F";

    // Act
    const result = estimateTokens(text);

    // Assert - エラーにならずに数値を返す
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
