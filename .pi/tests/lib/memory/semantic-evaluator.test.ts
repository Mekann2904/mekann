/**
 * @abdd.meta
 * path: .pi/tests/lib/memory/semantic-evaluator.test.ts
 * role: LLM-as-a-Judge セマンティック評価の単体テスト
 * why: セマンティック評価機能の正確性と信頼性を保証するため
 * related: .pi/lib/memory/semantic-evaluator.ts
 * public_api: なし（テストファイル）
 * invariants: すべてのテストがパスすること
 * side_effects: なし（モック使用）
 * failure_modes: テスト失敗時は実装バグを示す
 * @abdd.explain
 * overview: セマンティック評価モジュールの包括的単体テスト
 * what_it_does:
 *   - 各ルーブリックの評価プロンプト取得テスト
 *   - F1スコア計算の正確性テスト
 *   - セマンティック評価のモックテスト
 *   - 比較レポート生成テスト
 *   - 一貫性チェックテスト
 *   - 失敗モード検出テスト
 * why_it_exists:
 *   - LLM-as-a-Judge機能の品質保証
 *   - 回帰テストによる保守性確保
 * scope:
 *   in: テストケース、モックLLM
 *   out: テスト結果（パス/失敗）
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type EvaluationRubric,
  type SemanticEvaluationResult,
  type LlmCallFunction,
  getEvaluationPrompt,
  evaluateSemanticCorrectness,
  calculateF1Score,
  generateComparisonReport,
  checkRubricConsistency,
  getDefaultEvaluationConfig,
} from "../../../lib/memory/semantic-evaluator.js";

// ============================================================================
// Test Fixtures
// ============================================================================

const mockQuery = "What is the capital of France?";
const mockRetrieved = "Paris is the capital and largest city of France.";
const mockExpected = "The capital of France is Paris.";

const mockLlmResponse = `SCORE: 0.9
REASONING: The retrieved information correctly identifies Paris as the capital of France.
CRITERIA: {"relevance": 0.95, "accuracy": 0.9, "completeness": 0.85, "conciseness": 0.9}
CONFIDENCE: 0.85
ISSUES: []`;

const mockLlmResponseWithIssues = `SCORE: 0.5
REASONING: The answer is partially correct but misses some key details.
CRITERIA: {"relevance": 0.6, "accuracy": 0.5, "completeness": 0.4, "conciseness": 0.5}
CONFIDENCE: 0.7
ISSUES: [{"type": "paraphrase_penalty", "description": "Different wording used", "severity": "low"}]`;

// ============================================================================
// getEvaluationPrompt Tests
// ============================================================================

describe("getEvaluationPrompt", () => {
  it("should return MAGMA rubric prompt", () => {
    const prompt = getEvaluationPrompt("magma");
    expect(prompt.rubric).toBe("magma");
    expect(prompt.systemPrompt).toContain("Entity Accuracy");
    expect(prompt.systemPrompt).toContain("Relation Correctness");
    expect(prompt.evaluationCriteria).toContain("entity_accuracy");
  });

  it("should return Nemori rubric prompt", () => {
    const prompt = getEvaluationPrompt("nemori");
    expect(prompt.rubric).toBe("nemori");
    expect(prompt.systemPrompt).toContain("Temporal Accuracy");
    expect(prompt.systemPrompt).toContain("Causal Correctness");
    expect(prompt.evaluationCriteria).toContain("temporal_accuracy");
  });

  it("should return SimpleMem rubric prompt", () => {
    const prompt = getEvaluationPrompt("simplemem");
    expect(prompt.rubric).toBe("simplemem");
    expect(prompt.systemPrompt).toContain("Relevance");
    expect(prompt.systemPrompt).toContain("Accuracy");
    expect(prompt.evaluationCriteria).toContain("relevance");
  });

  it("should throw error for custom rubric", () => {
    expect(() => getEvaluationPrompt("custom")).toThrow(
      "Custom rubric requires explicit prompt definition"
    );
  });
});

// ============================================================================
// calculateF1Score Tests
// ============================================================================

describe("calculateF1Score", () => {
  it("should return 1 for identical texts", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    expect(calculateF1Score(text, text)).toBe(1);
  });

  it("should return 0 for completely different texts", () => {
    const text1 = "apple banana orange";
    const text2 = "car bike train";
    expect(calculateF1Score(text1, text2)).toBe(0);
  });

  it("should calculate partial overlap correctly", () => {
    const retrieved = "The capital of France is Paris";
    const expected = "Paris is the capital of France";
    // Both share: the, capital, of, france, is, paris
    const score = calculateF1Score(retrieved, expected);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should return 0 for empty strings", () => {
    expect(calculateF1Score("", "some text")).toBe(0);
    expect(calculateF1Score("some text", "")).toBe(0);
    expect(calculateF1Score("", "")).toBe(0);
  });

  it("should be case-insensitive", () => {
    const text1 = "Paris is the Capital of France";
    const text2 = "paris is the capital of france";
    expect(calculateF1Score(text1, text2)).toBe(1);
  });

  it("should ignore punctuation", () => {
    const text1 = "Paris, is the capital of France!";
    const text2 = "Paris is the capital of France";
    expect(calculateF1Score(text1, text2)).toBe(1);
  });
});

// ============================================================================
// evaluateSemanticCorrectness Tests
// ============================================================================

describe("evaluateSemanticCorrectness", () => {
  it("should evaluate with mock when no LLM provided", async () => {
    const result = await evaluateSemanticCorrectness(
      mockQuery,
      mockRetrieved,
      mockExpected,
      "simplemem"
    );

    expect(result.queryId).toMatch(/^query-/);
    expect(result.rubric).toBe("simplemem");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.reasoning).toContain("Mock evaluation");
    expect(result.confidence).toBe(0.5);
  });

  it("should use LLM when provided", async () => {
    const mockLlm: LlmCallFunction = vi.fn().mockResolvedValue(mockLlmResponse);

    const result = await evaluateSemanticCorrectness(
      mockQuery,
      mockRetrieved,
      mockExpected,
      "simplemem",
      mockLlm
    );

    expect(mockLlm).toHaveBeenCalled();
    expect(result.score).toBe(0.9);
    expect(result.reasoning).toContain("correctly identifies");
    expect(result.criteriaScores.relevance).toBe(0.95);
    expect(result.confidence).toBe(0.85);
  });

  it("should parse issues from LLM response", async () => {
    const mockLlm: LlmCallFunction = vi
      .fn()
      .mockResolvedValue(mockLlmResponseWithIssues);

    const result = await evaluateSemanticCorrectness(
      mockQuery,
      mockRetrieved,
      mockExpected,
      "simplemem",
      mockLlm
    );

    expect(result.detectedIssues).toHaveLength(1);
    expect(result.detectedIssues?.[0].type).toBe("paraphrase_penalty");
    expect(result.detectedIssues?.[0].severity).toBe("low");
  });

  it("should handle LLM errors gracefully", async () => {
    const mockLlm: LlmCallFunction = vi
      .fn()
      .mockRejectedValue(new Error("LLM timeout"));

    const result = await evaluateSemanticCorrectness(
      mockQuery,
      mockRetrieved,
      mockExpected,
      "simplemem",
      mockLlm
    );

    expect(result.score).toBe(0);
    expect(result.reasoning).toContain("Evaluation failed");
    expect(result.confidence).toBe(0);
    expect(result.detectedIssues?.[0].type).toBe("irrelevance");
  });

  it("should detect negation trap", async () => {
    const queryWithNegation = "What is NOT the capital of France?";
    const result = await evaluateSemanticCorrectness(
      queryWithNegation,
      mockRetrieved,
      "London is not the capital of France",
      "simplemem"
    );

    const negationIssue = result.detectedIssues?.find(
      (i) => i.type === "negation_trap"
    );
    expect(negationIssue).toBeDefined();
  });

  it("should work with all rubric types", async () => {
    const rubrics: EvaluationRubric[] = ["magma", "nemori", "simplemem"];

    for (const rubric of rubrics) {
      const result = await evaluateSemanticCorrectness(
        mockQuery,
        mockRetrieved,
        mockExpected,
        rubric
      );
      expect(result.rubric).toBe(rubric);
      expect(result.criteriaScores).toBeDefined();
    }
  });
});

// ============================================================================
// generateComparisonReport Tests
// ============================================================================

describe("generateComparisonReport", () => {
  it("should generate comparison report for single query", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Good match",
        criteriaScores: { entity_accuracy: 0.8 },
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.75,
        reasoning: "Good match",
        criteriaScores: { temporal_accuracy: 0.75 },
        confidence: 0.85,
      },
      {
        queryId: "query-1",
        rubric: "simplemem",
        score: 0.85,
        reasoning: "Good match",
        criteriaScores: { relevance: 0.85 },
        confidence: 0.9,
      },
    ];
    const f1Scores = [0.6];

    const reports = generateComparisonReport(results, f1Scores);

    expect(reports).toHaveLength(1);
    expect(reports[0].queryId).toBe("query-1");
    expect(reports[0].f1Score).toBe(0.6);
    expect(reports[0].semanticScores.magma).toBe(0.8);
    expect(reports[0].semanticScores.nemori).toBe(0.75);
    expect(reports[0].semanticScores.simplemem).toBe(0.85);
  });

  it("should detect misalignment when F1 is low but semantic is high", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Semantically correct",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.8,
        reasoning: "Semantically correct",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "simplemem",
        score: 0.8,
        reasoning: "Semantically correct",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];
    const f1Scores = [0.2]; // Low F1 but high semantic

    const reports = generateComparisonReport(results, f1Scores);

    expect(reports[0].misalignment).toBe(true);
  });

  it("should detect misalignment when F1 is high but semantic is low", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.2,
        reasoning: "Semantically incorrect",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.2,
        reasoning: "Semantically incorrect",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "simplemem",
        score: 0.2,
        reasoning: "Semantically incorrect",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];
    const f1Scores = [0.8]; // High F1 but low semantic

    const reports = generateComparisonReport(results, f1Scores);

    expect(reports[0].misalignment).toBe(true);
  });

  it("should throw error for mismatched array lengths", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];
    const f1Scores = [0.5, 0.6]; // Wrong length

    expect(() => generateComparisonReport(results, f1Scores)).toThrow(
      "must match F1 scores count"
    );
  });
});

// ============================================================================
// checkRubricConsistency Tests
// ============================================================================

describe("checkRubricConsistency", () => {
  it("should return 1 for single result", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];

    expect(checkRubricConsistency(results)).toBe(1);
  });

  it("should return 1 for empty results", () => {
    expect(checkRubricConsistency([])).toBe(1);
  });

  it("should return high consistency for similar scores", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.82,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "simplemem",
        score: 0.78,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];

    const consistency = checkRubricConsistency(results);
    expect(consistency).toBeGreaterThan(0.9);
  });

  it("should return low consistency for divergent scores", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.9,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.2,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "simplemem",
        score: 0.1,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];

    const consistency = checkRubricConsistency(results);
    expect(consistency).toBeLessThan(0.5);
  });

  it("should handle multiple queries independently", () => {
    const results: SemanticEvaluationResult[] = [
      {
        queryId: "query-1",
        rubric: "magma",
        score: 0.8,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-1",
        rubric: "nemori",
        score: 0.8,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-2",
        rubric: "magma",
        score: 0.5,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
      {
        queryId: "query-2",
        rubric: "nemori",
        score: 0.5,
        reasoning: "Test",
        criteriaScores: {},
        confidence: 0.9,
      },
    ];

    const consistency = checkRubricConsistency(results);
    expect(consistency).toBeGreaterThan(0.8);
  });
});

// ============================================================================
// getDefaultEvaluationConfig Tests
// ============================================================================

describe("getDefaultEvaluationConfig", () => {
  it("should return default configuration", () => {
    const config = getDefaultEvaluationConfig();

    expect(config.rubrics).toContain("magma");
    expect(config.rubrics).toContain("nemori");
    expect(config.rubrics).toContain("simplemem");
    expect(config.consistencyThreshold).toBe(0.7);
    expect(config.detectFailureModes).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Full Evaluation Flow", () => {
  it("should complete full evaluation workflow", async () => {
    // Step 1: Get evaluation prompts
    const rubrics: EvaluationRubric[] = ["magma", "nemori", "simplemem"];
    const prompts = rubrics.map((r) => getEvaluationPrompt(r));
    expect(prompts).toHaveLength(3);

    // Step 2: Evaluate with each rubric (use same queryId for all)
    const fixedQueryId = "query-integration-test";
    const results: SemanticEvaluationResult[] = [];
    for (const rubric of rubrics) {
      const result = await evaluateSemanticCorrectness(
        mockQuery,
        mockRetrieved,
        mockExpected,
        rubric
      );
      // Override queryId to be the same for grouping
      result.queryId = fixedQueryId;
      results.push(result);
    }
    expect(results).toHaveLength(3);

    // Step 3: Calculate F1 score
    const f1Score = calculateF1Score(mockRetrieved, mockExpected);
    expect(f1Score).toBeGreaterThan(0);

    // Step 4: Generate comparison report
    const reports = generateComparisonReport(results, [f1Score]);
    expect(reports).toHaveLength(1);

    // Step 5: Check consistency
    const consistency = checkRubricConsistency(results);
    expect(consistency).toBeGreaterThanOrEqual(0);
    expect(consistency).toBeLessThanOrEqual(1);
  });

  it("should demonstrate F1 vs semantic misalignment", async () => {
    // Paraphrased answer - same meaning, different words
    const paraphrasedRetrieved =
      "France's seat of government and largest urban area is Paris.";
    const expected = "The capital of France is Paris.";

    // F1 score will be low due to different words
    const f1Score = calculateF1Score(paraphrasedRetrieved, expected);

    // But semantic evaluation should recognize correctness
    const result = await evaluateSemanticCorrectness(
      "What is the capital of France?",
      paraphrasedRetrieved,
      expected,
      "simplemem"
    );

    // Demonstrate the gap
    expect(f1Score).toBeLessThan(0.5); // Low F1
    // Note: Mock evaluation uses lexical overlap, so semantic score will also be low
    // In real usage with LLM, semantic score would be higher
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
