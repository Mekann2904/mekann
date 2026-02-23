/**
 * mediator-prompt.tsの単体テスト
 * Mediator層のプロンプトテンプレート機能を検証する
 */

import { describe, it, expect } from "vitest";
import {
  MEDIATOR_SYSTEM_PROMPT,
  LIC_DETECTION_PROMPT,
  buildInterpretationPrompt,
  buildClarificationPrompt,
  buildStructuringPrompt,
  buildLicDetectionPrompt,
  getQuestionTemplate,
  generateQuestion,
  calculateOverallConfidence,
  type InterpretationPromptInput,
  type ClarificationPromptInput,
  type StructuringPromptInput,
  type LiCDetectionPromptInput,
} from "../../lib/mediator-prompt.js";
import type { InformationGap, Message, ConfirmedFact } from "../../lib/mediator-types.js";

// ============================================================================
// Tests: MEDIATOR_SYSTEM_PROMPT
// ============================================================================

describe("MEDIATOR_SYSTEM_PROMPT", () => {
  it("システムプロンプトが定義されている", () => {
    // Arrange & Act & Assert
    expect(MEDIATOR_SYSTEM_PROMPT).toBeDefined();
    expect(MEDIATOR_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("核心原則を含む", () => {
    // Arrange & Act & Assert
    expect(MEDIATOR_SYSTEM_PROMPT).toContain("意図推論");
    expect(MEDIATOR_SYSTEM_PROMPT).toContain("履歴");
    expect(MEDIATOR_SYSTEM_PROMPT).toContain("曖昧");
  });
});

// ============================================================================
// Tests: buildInterpretationPrompt
// ============================================================================

describe("buildInterpretationPrompt", () => {
  it("基本的なプロンプトを生成する", () => {
    // Arrange
    const input: InterpretationPromptInput = {
      userMessage: "テスト入力",
      conversationHistory: [],
      confirmedFacts: [],
    };

    // Act
    const prompt = buildInterpretationPrompt(input);

    // Assert
    expect(prompt).toContain("テスト入力");
    expect(prompt).toContain("解釈結果");
    expect(prompt).toContain("参照解決");
    expect(prompt).toContain("情報ギャップ");
  });

  it("会話履歴を含むプロンプトを生成する", () => {
    // Arrange
    const input: InterpretationPromptInput = {
      userMessage: "それを修正して",
      conversationHistory: [
        { role: "user", content: "バグがあります", timestamp: new Date().toISOString() },
        { role: "assistant", content: "バグの内容を教えてください", timestamp: new Date().toISOString() },
      ],
      confirmedFacts: [],
    };

    // Act
    const prompt = buildInterpretationPrompt(input);

    // Assert
    expect(prompt).toContain("会話履歴");
    expect(prompt).toContain("バグがあります");
  });

  it("確認済み事実を含むプロンプトを生成する", () => {
    // Arrange
    const input: InterpretationPromptInput = {
      userMessage: "続けて",
      conversationHistory: [],
      confirmedFacts: [
        { key: "topic", value: "TypeScript", confirmedAt: new Date().toISOString() },
        { key: "goal", value: "リファクタリング", confirmedAt: new Date().toISOString() },
      ],
    };

    // Act
    const prompt = buildInterpretationPrompt(input);

    // Assert
    expect(prompt).toContain("確認済み事実");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("リファクタリング");
  });

  it("タスクコンテキストを含むプロンプトを生成する", () => {
    // Arrange
    const input: InterpretationPromptInput = {
      userMessage: "修正して",
      conversationHistory: [],
      confirmedFacts: [],
      taskContext: "ファイル: src/index.ts",
    };

    // Act
    const prompt = buildInterpretationPrompt(input);

    // Assert
    expect(prompt).toContain("タスクコンテキスト");
    expect(prompt).toContain("src/index.ts");
  });
});

// ============================================================================
// Tests: buildClarificationPrompt
// ============================================================================

describe("buildClarificationPrompt", () => {
  it("明確化質問プロンプトを生成する", () => {
    // Arrange
    const input: ClarificationPromptInput = {
      userMessage: "あれを変更して",
      interpretation: "「あれ」が不明確",
      gaps: [
        {
          type: "ambiguous_reference",
          term: "あれ",
          description: "参照先が不明",
          severity: "high",
        },
      ],
    };

    // Act
    const prompt = buildClarificationPrompt(input);

    // Assert
    expect(prompt).toContain("明確化質問");
    expect(prompt).toContain("あれを変更して");
    expect(prompt).toContain("あれ」が不明確");
  });

  it("複数のギャップを含む", () => {
    // Arrange
    const input: ClarificationPromptInput = {
      userMessage: "処理を修正",
      interpretation: "「処理」が不明確",
      gaps: [
        { type: "ambiguous_reference", term: "処理", description: "どの処理か不明", severity: "medium" },
        { type: "missing_target", term: "対象", description: "対象ファイルが不明", severity: "low" },
      ],
    };

    // Act
    const prompt = buildClarificationPrompt(input);

    // Assert
    expect(prompt).toContain("ambiguous_reference");
    expect(prompt).toContain("missing_target");
  });
});

// ============================================================================
// Tests: buildStructuringPrompt
// ============================================================================

describe("buildStructuringPrompt", () => {
  it("構造化指示プロンプトを生成する", () => {
    // Arrange
    const input: StructuringPromptInput = {
      userMessage: "ファイルを作成して",
      interpretation: "新しいTypeScriptファイルを作成",
      conversationHistory: [],
      confirmedFacts: [],
    };

    // Act
    const prompt = buildStructuringPrompt(input);

    // Assert
    expect(prompt).toContain("構造化指示");
    expect(prompt).toContain("ファイルを作成して");
    expect(prompt).toContain("target");
    expect(prompt).toContain("action");
  });

  it("明確化の結果を含む", () => {
    // Arrange
    const input: StructuringPromptInput = {
      userMessage: "それを修正",
      interpretation: "バグを修正",
      clarifications: [
        { question: "どのバグ？", answer: "型エラー" },
      ],
      conversationHistory: [],
      confirmedFacts: [],
    };

    // Act
    const prompt = buildStructuringPrompt(input);

    // Assert
    expect(prompt).toContain("明確化の結果");
    expect(prompt).toContain("どのバグ？");
    expect(prompt).toContain("型エラー");
  });
});

// ============================================================================
// Tests: buildLicDetectionPrompt
// ============================================================================

describe("buildLicDetectionPrompt", () => {
  it("LiC検出プロンプトを生成する", () => {
    // Arrange
    const input: LiCDetectionPromptInput = {
      recentOutputs: ["出力1", "出力2"],
      conversationHistory: [
        { role: "user", content: "質問", timestamp: new Date().toISOString() },
      ],
    };

    // Act
    const prompt = buildLicDetectionPrompt(input);

    // Assert
    expect(prompt).toContain("LiC");
    expect(prompt).toContain("検出");
  });
});

// ============================================================================
// Tests: LIC_DETECTION_PROMPT
// ============================================================================

describe("LIC_DETECTION_PROMPT", () => {
  it("LiC検出用定数プロンプトが定義されている", () => {
    // Arrange & Act & Assert
    expect(LIC_DETECTION_PROMPT).toBeDefined();
    expect(LIC_DETECTION_PROMPT).toContain("Generic Convergence");
    expect(LIC_DETECTION_PROMPT).toContain("Context Drift");
  });
});

// ============================================================================
// Tests: getQuestionTemplate
// ============================================================================

describe("getQuestionTemplate", () => {
  it("ambiguous_referenceのテンプレートを取得する", () => {
    // Arrange & Act
    const template = getQuestionTemplate("ambiguous_reference");

    // Assert
    expect(template.headerTemplate).toBeDefined();
    expect(template.questionTemplate).toBeDefined();
    expect(template.optionTemplates.length).toBeGreaterThan(0);
  });

  it("全てのギャップタイプのテンプレートを取得できる", () => {
    // Arrange
    const gapTypes = [
      "ambiguous_reference",
      "missing_target",
      "unclear_action",
      "missing_constraints",
      "unclear_success_criteria",
      "context_mismatch",
      "implicit_assumption",
    ] as const;

    // Act & Assert
    for (const type of gapTypes) {
      const template = getQuestionTemplate(type);
      expect(template.headerTemplate).toBeDefined();
      expect(template.questionTemplate).toBeDefined();
      expect(template.optionTemplates.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Tests: generateQuestion
// ============================================================================

describe("generateQuestion", () => {
  it("情報ギャップから質問を生成する", () => {
    // Arrange
    const gap: InformationGap = {
      type: "ambiguous_reference",
      term: "それ",
      description: "参照先が不明",
      severity: "high",
    };

    // Act
    const question = generateQuestion(gap);

    // Assert
    expect(question.header).toBeDefined();
    expect(question.question).toContain("それ");
    expect(question.options.length).toBeGreaterThan(0);
    expect(question.relatedGap).toBe("ambiguous_reference");
  });

  it("候補がある場合は選択肢に反映される", () => {
    // Arrange
    const gap: InformationGap = {
      type: "missing_target",
      term: "ファイル",
      description: "対象ファイルが不明",
      severity: "medium",
      candidates: [
        { value: "index.ts", description: "メインファイル" },
        { value: "utils.ts", description: "ユーティリティ" },
      ],
    };

    // Act
    const question = generateQuestion(gap);

    // Assert
    expect(question.options.some(o => o.label.includes("index") || o.description.includes("メイン"))).toBe(true);
  });
});

// ============================================================================
// Tests: calculateOverallConfidence
// ============================================================================

describe("calculateOverallConfidence", () => {
  it("基本的な信頼度を計算する", () => {
    // Arrange
    const interpretation = "ユーザーはファイルを修正したい";
    const gapsRemaining = 0;
    const factsUsed = 0;

    // Act
    const confidence = calculateOverallConfidence(interpretation, gapsRemaining, factsUsed);

    // Assert
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("長い解釈は信頼度が上がる", () => {
    // Arrange
    const shortInterpretation = "短い解釈";
    const longInterpretation = "これは非常に長い解釈で、ユーザーの意図を詳細に分析し、文脈を考慮して複数の可能性を検討しています。";
    const gapsRemaining = 0;
    const factsUsed = 0;

    // Act
    const shortConfidence = calculateOverallConfidence(shortInterpretation, gapsRemaining, factsUsed);
    const longConfidence = calculateOverallConfidence(longInterpretation, gapsRemaining, factsUsed);

    // Assert
    expect(longConfidence).toBeGreaterThan(shortConfidence);
  });

  it("残存ギャップが多いと信頼度が下がる", () => {
    // Arrange
    const interpretation = "解釈";
    const noGaps = calculateOverallConfidence(interpretation, 0, 0);
    const manyGaps = calculateOverallConfidence(interpretation, 5, 0);

    // Assert
    expect(noGaps).toBeGreaterThan(manyGaps);
  });

  it("使用した事実が多いと信頼度が上がる", () => {
    // Arrange
    const interpretation = "解釈";
    const noFacts = calculateOverallConfidence(interpretation, 0, 0);
    const manyFacts = calculateOverallConfidence(interpretation, 0, 5);

    // Assert
    expect(manyFacts).toBeGreaterThan(noFacts);
  });

  it("信頼度は0-1の範囲内", () => {
    // Arrange & Act & Assert
    // 極端な値
    expect(calculateOverallConfidence("", 100, 0)).toBeGreaterThanOrEqual(0);
    expect(calculateOverallConfidence("a".repeat(1000), 0, 100)).toBeLessThanOrEqual(1);
  });
});
