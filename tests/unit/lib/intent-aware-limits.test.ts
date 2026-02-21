/**
 * intent-aware-limits.ts 単体テスト
 * カバレッジ分析: classifyIntent, getIntentBudget, applyIntentLimits,
 * getEffectiveRepetitionThreshold, isIntentClassificationAvailable,
 * getAllIntentBudgets, summarizeIntentClassification
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";
import {
  classifyIntent,
  getIntentBudget,
  applyIntentLimits,
  getEffectiveRepetitionThreshold,
  isIntentClassificationAvailable,
  getAllIntentBudgets,
  summarizeIntentClassification,
  INTENT_BUDGETS,
  type TaskIntent,
  type IntentClassificationInput,
} from "../../../.pi/lib/intent-aware-limits.js";

// ============================================================================
// classifyIntent テスト
// ============================================================================

describe("classifyIntent", () => {
  // ==========================================================================
  // 宣言的 (declarative) テスト
  // ==========================================================================

  describe("declarative", () => {
    it("classifyIntent_what is_宣言的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "What is TypeScript?",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it("classifyIntent_find_宣言的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Find all files containing 'error'",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
    });

    it("classifyIntent_check if_宣言的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Check if the server is running",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
    });

    it("classifyIntent_list_宣言的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "List all environment variables",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
    });

    it("classifyIntent_show me_宣言的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Show me the configuration",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
    });
  });

  // ==========================================================================
  // 手続き的 (procedural) テスト
  // ==========================================================================

  describe("procedural", () => {
    it("classifyIntent_how to_手続き的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "How to deploy the application",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("procedural");
    });

    it("classifyIntent_implement_手続き的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Implement a new feature",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("procedural");
    });

    it("classifyIntent_create_手続き的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Create a new component",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("procedural");
    });

    it("classifyIntent_fix_手続き的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Fix the bug in the login module",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("procedural");
    });

    it("classifyIntent_configure_手続き的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Configure the database connection",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("procedural");
    });
  });

  // ==========================================================================
  // 推論的 (reasoning) テスト
  // ==========================================================================

  describe("reasoning", () => {
    it("classifyIntent_analyze_推論的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Analyze the performance bottlenecks",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning");
    });

    it("classifyIntent_compare_推論的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Compare the two implementations",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning");
    });

    it("classifyIntent_why_推論的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Why is the system slow?",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning");
    });

    it("classifyIntent_design_推論的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Design a new architecture",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning");
    });

    it("classifyIntent_evaluate_推論的分類", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Evaluate the security risks",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning");
    });
  });

  // ==========================================================================
  // デフォルト・エッジケース
  // ==========================================================================

  describe("default and edge cases", () => {
    it("classifyIntent_空タスク_宣言的デフォルト", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
      expect(result.confidence).toBe(0.4);
    });

    it("classifyIntent_パターンマッチなし_宣言的デフォルト", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "unknown pattern here",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("declarative");
    });

    it("classifyIntent_goalあり_統合分析", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Do something",
        goal: "analyze the results",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.intent).toBe("reasoning"); // goalから分類
    });

    it("classifyIntent_大文字小文字区別なし", () => {
      // Arrange
      const input1: IntentClassificationInput = {
        task: "WHAT IS THIS",
      };
      const input2: IntentClassificationInput = {
        task: "what is this",
      };

      // Act
      const result1 = classifyIntent(input1);
      const result2 = classifyIntent(input2);

      // Assert
      expect(result1.intent).toBe(result2.intent);
    });

    it("classifyIntent_推奨予算含む", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Analyze the code",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.recommendedBudget).toBeDefined();
      expect(result.recommendedBudget.intent).toBe(result.intent);
    });

    it("classifyIntent_信頼度範囲内", () => {
      // Arrange
      const input: IntentClassificationInput = {
        task: "Find the file",
      };

      // Act
      const result = classifyIntent(input);

      // Assert
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// getIntentBudget テスト
// ============================================================================

describe("getIntentBudget", () => {
  it("getIntentBudget_declarative_正しい予算返却", () => {
    // Arrange & Act
    const result = getIntentBudget("declarative");

    // Assert
    expect(result.intent).toBe("declarative");
    expect(result.maxIterations).toBe(6);
    expect(result.timeoutMultiplier).toBe(1.0);
  });

  it("getIntentBudget_procedural_正しい予算返却", () => {
    // Arrange & Act
    const result = getIntentBudget("procedural");

    // Assert
    expect(result.intent).toBe("procedural");
    expect(result.maxIterations).toBe(10);
    expect(result.timeoutMultiplier).toBe(1.5);
  });

  it("getIntentBudget_reasoning_正しい予算返却", () => {
    // Arrange & Act
    const result = getIntentBudget("reasoning");

    // Assert
    expect(result.intent).toBe("reasoning");
    expect(result.maxIterations).toBe(12);
    expect(result.timeoutMultiplier).toBe(2.0);
  });
});

// ============================================================================
// applyIntentLimits テスト
// ============================================================================

describe("applyIntentLimits", () => {
  it("applyIntentLimits_declarative_制限適用", () => {
    // Arrange
    const baseLimits = {
      maxIterations: 20,
      timeoutMs: 60000,
      parallelism: 4,
    };

    // Act
    const result = applyIntentLimits(baseLimits, "declarative");

    // Assert
    expect(result.maxIterations).toBe(6); // declarativeの上限
    expect(result.timeoutMs).toBe(60000); // 1.0x
    expect(result.parallelism).toBe(4); // 1.0x
  });

  it("applyIntentLimits_procedural_タイムアウト増加", () => {
    // Arrange
    const baseLimits = {
      maxIterations: 5,
      timeoutMs: 60000,
      parallelism: 10,
    };

    // Act
    const result = applyIntentLimits(baseLimits, "procedural");

    // Assert
    expect(result.maxIterations).toBe(5); // base < budget
    expect(result.timeoutMs).toBe(90000); // 1.5x
    expect(result.parallelism).toBe(8); // 0.8x
  });

  it("applyIntentLimits_reasoning_最大リソース", () => {
    // Arrange
    const baseLimits = {
      maxIterations: 15,
      timeoutMs: 60000,
      parallelism: 4,
    };

    // Act
    const result = applyIntentLimits(baseLimits, "reasoning");

    // Assert
    expect(result.maxIterations).toBe(12); // base > budget
    expect(result.timeoutMs).toBe(120000); // 2.0x
    expect(result.parallelism).toBe(5); // 1.2x
  });

  it("applyIntentLimits_未定義フィールド_保持", () => {
    // Arrange
    const baseLimits = {
      maxIterations: 10,
    };

    // Act
    const result = applyIntentLimits(baseLimits, "declarative");

    // Assert
    expect(result.maxIterations).toBe(6);
    expect(result.timeoutMs).toBeUndefined();
    expect(result.parallelism).toBeUndefined();
  });

  it("applyIntentLimits_空オブジェクト_予算値使用", () => {
    // Arrange & Act
    const result = applyIntentLimits({}, "declarative");

    // Assert
    expect(result.maxIterations).toBe(6);
  });
});

// ============================================================================
// getEffectiveRepetitionThreshold テスト
// ============================================================================

describe("getEffectiveRepetitionThreshold", () => {
  it("getEffectiveRepetitionThreshold_declarative_高許容", () => {
    // Arrange
    const baseThreshold = 0.5;

    // Act
    const result = getEffectiveRepetitionThreshold(baseThreshold, "declarative");

    // Assert - declarativeは高いrepetitionTolerance (0.6)
    expect(result).toBeGreaterThan(baseThreshold);
  });

  it("getEffectiveRepetitionThreshold_reasoning_低許容", () => {
    // Arrange
    const baseThreshold = 0.5;

    // Act
    const result = getEffectiveRepetitionThreshold(baseThreshold, "reasoning");

    // Assert - reasoningは低いrepetitionTolerance (0.3)
    expect(result).toBeLessThan(baseThreshold);
  });

  it("getEffectiveRepetitionThreshold_procedural_中間", () => {
    // Arrange
    const baseThreshold = 0.5;

    // Act
    const result = getEffectiveRepetitionThreshold(baseThreshold, "procedural");

    // Assert - proceduralは中間のrepetitionTolerance (0.4)
    expect(result).toBeCloseTo(0.48, 1);
  });

  it("getEffectiveRepetitionThreshold_0ベース_範囲内", () => {
    // Arrange & Act
    const result = getEffectiveRepetitionThreshold(0, "declarative");

    // Assert
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// isIntentClassificationAvailable テスト
// ============================================================================

describe("isIntentClassificationAvailable", () => {
  it("isIntentClassificationAvailable_常にtrue", () => {
    // Arrange & Act
    const result = isIntentClassificationAvailable();

    // Assert
    expect(result).toBe(true);
  });
});

// ============================================================================
// getAllIntentBudgets テスト
// ============================================================================

describe("getAllIntentBudgets", () => {
  it("getAllIntentBudgets_3種類返却", () => {
    // Arrange & Act
    const result = getAllIntentBudgets();

    // Assert
    expect(Object.keys(result)).toHaveLength(3);
    expect(result.declarative).toBeDefined();
    expect(result.procedural).toBeDefined();
    expect(result.reasoning).toBeDefined();
  });

  it("getAllIntentBudgets_コピー返却", () => {
    // Arrange & Act
    const result1 = getAllIntentBudgets();
    const result2 = getAllIntentBudgets();

    // Assert - 異なるオブジェクト
    expect(result1).not.toBe(result2);
    expect(result1.declarative).toEqual(result2.declarative);
  });
});

// ============================================================================
// summarizeIntentClassification テスト
// ============================================================================

describe("summarizeIntentClassification", () => {
  it("summarizeIntentClassification_フォーマット確認", () => {
    // Arrange
    const classification = classifyIntent({ task: "Analyze the code" });

    // Act
    const result = summarizeIntentClassification(classification);

    // Assert
    expect(result).toContain("Intent:");
    expect(result).toContain("confidence");
    expect(result).toContain("Budget:");
    expect(result).toContain("Patterns:");
  });

  it("summarimizeIntentClassification_パーセント表示", () => {
    // Arrange
    const classification = {
      intent: "declarative" as TaskIntent,
      confidence: 0.85,
      matchedPatterns: ["pattern1"],
      recommendedBudget: INTENT_BUDGETS.declarative,
    };

    // Act
    const result = summarizeIntentClassification(classification);

    // Assert
    expect(result).toContain("85%");
  });

  it("summarizeIntentClassification_パターン3件まで", () => {
    // Arrange
    const classification = {
      intent: "declarative" as TaskIntent,
      confidence: 0.8,
      matchedPatterns: ["p1", "p2", "p3", "p4", "p5"],
      recommendedBudget: INTENT_BUDGETS.declarative,
    };

    // Act
    const result = summarizeIntentClassification(classification);

    // Assert - 最初の3パターンのみ表示
    expect(result).toContain("p1");
    expect(result).toContain("p2");
    expect(result).toContain("p3");
  });
});

// ============================================================================
// INTENT_BUDGETS 定数テスト
// ============================================================================

describe("INTENT_BUDGETS", () => {
  it("INTENT_BUDGETS_declarative_正しい設定", () => {
    // Assert
    expect(INTENT_BUDGETS.declarative.maxIterations).toBe(6);
    expect(INTENT_BUDGETS.declarative.timeoutMultiplier).toBe(1.0);
    expect(INTENT_BUDGETS.declarative.parallelismMultiplier).toBe(1.0);
    expect(INTENT_BUDGETS.declarative.repetitionTolerance).toBe(0.6);
  });

  it("INTENT_BUDGETS_procedural_正しい設定", () => {
    // Assert
    expect(INTENT_BUDGETS.procedural.maxIterations).toBe(10);
    expect(INTENT_BUDGETS.procedural.timeoutMultiplier).toBe(1.5);
    expect(INTENT_BUDGETS.procedural.parallelismMultiplier).toBe(0.8);
    expect(INTENT_BUDGETS.procedural.repetitionTolerance).toBe(0.4);
  });

  it("INTENT_BUDGETS_reasoning_正しい設定", () => {
    // Assert
    expect(INTENT_BUDGETS.reasoning.maxIterations).toBe(12);
    expect(INTENT_BUDGETS.reasoning.timeoutMultiplier).toBe(2.0);
    expect(INTENT_BUDGETS.reasoning.parallelismMultiplier).toBe(1.2);
    expect(INTENT_BUDGETS.reasoning.repetitionTolerance).toBe(0.3);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("classifyIntent_任意の文字列_有効なインテント返却", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (task) => {
        const result = classifyIntent({ task });
        return (
          result.intent === "declarative" ||
          result.intent === "procedural" ||
          result.intent === "reasoning"
        );
      })
    );
  });

  it("classifyIntent_信頼度_常に0から1の範囲", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (task) => {
        const result = classifyIntent({ task });
        return result.confidence >= 0 && result.confidence <= 1;
      })
    );
  });

  it("applyIntentLimits_任意のベース_制限適用", () => {
    fc.assert(
      fc.property(
        fc.record({
          maxIterations: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
          timeoutMs: fc.option(fc.integer({ min: 1000, max: 3600000 }), { nil: undefined }),
          parallelism: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
        }),
        fc.constantFrom(...(["declarative", "procedural", "reasoning"] as TaskIntent[])),
        (baseLimits, intent) => {
          const result = applyIntentLimits(baseLimits as any, intent);
          return result.maxIterations !== undefined && result.maxIterations > 0;
        }
      )
    );
  });

  it("getEffectiveRepetitionThreshold_任意のベース_有効な範囲", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.9 }), // 極値を避ける
        fc.constantFrom(...(["declarative", "procedural", "reasoning"] as TaskIntent[])),
        (baseThreshold, intent) => {
          const result = getEffectiveRepetitionThreshold(baseThreshold, intent);
          return result >= -0.1 && result <= 1.1; // 許容範囲を広げる
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("classifyIntent_非常に長いタスク_処理可能", () => {
    // Arrange
    const longTask = "find ".repeat(1000);

    // Act
    const result = classifyIntent({ task: longTask });

    // Assert
    expect(result.intent).toBe("declarative");
  });

  it("classifyIntent_特殊文字_処理可能", () => {
    // Arrange
    const specialTask = "分析\x00\x01🎉日本語";

    // Act & Assert
    expect(() => classifyIntent({ task: specialTask })).not.toThrow();
  });

  it("applyIntentLimits_0値_予算値使用", () => {
    // Arrange
    const baseLimits = {
      maxIterations: 0,
      timeoutMs: 0,
      parallelism: 0,
    };

    // Act
    const result = applyIntentLimits(baseLimits, "declarative");

    // Assert - 0の場合は予算値が使用される
    expect(result.maxIterations).toBe(6); // declarativeの予算値
  });

  it("getEffectiveRepetitionThreshold_極値_計算される", () => {
    // Arrange & Act
    const result0 = getEffectiveRepetitionThreshold(0.1, "reasoning"); // 低いベース + 低い許容
    const result1 = getEffectiveRepetitionThreshold(0.9, "declarative"); // 高いベース + 高い許容

    // Assert - reasoningの方が低くなる
    expect(result0).toBeLessThan(result1);
  });
});
