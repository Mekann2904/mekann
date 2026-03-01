/**
 * @abdd.meta
 * @path .pi/tests/lib/delegation-quality.test.ts
 * @role Test suite for delegation quality scoring
 * @why Verify quality calculation, suggestions, and success rate estimation
 * @related ../../lib/delegation-quality.ts
 * @public_api Tests for calculateDelegationScore and related functions
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateDelegationScore,
  calculateProtectedDelegationScore,
  generateUnmeasurableWarnings,
  DelegationQualityTracker,
  delegationQualityTracker,
  type DelegationQualityInput,
  type DelegationDimension,
} from "../../lib/delegation-quality";

describe("delegation-quality", () => {
  describe("calculateDelegationScore", () => {
    it("calculateDelegationScore_minimalInput_returnsLowScore", () => {
      const input: DelegationQualityInput = {
        taskDescription: "Do something",
        targetId: "agent-1",
      };

      const result = calculateDelegationScore(input);

      expect(result.overall).toBeLessThan(60);
      expect(result.isHighRisk).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("calculateDelegationScore_comprehensiveInput_returnsHighScore", () => {
      const input: DelegationQualityInput = {
        taskDescription: "分析せよ：対象範囲はsrcディレクトリ、出力形式はJSON形式で報告してください。期限内に完了すること。",
        sharedContext: "関連ファイルはsrc/lib/module.tsです。前提としてTypeScriptを使用しています。背景としてリファクタリングが必要です。",
        successCriteria: ["テストが通ること", "型エラーがないこと", "ドキュメントが更新されていること"],
        targetId: "implementer",
        availableResources: ["src/lib/module.ts", "tests/module.test.ts", "docs/module.md"],
      };

      const result = calculateDelegationScore(input);

      expect(result.overall).toBeGreaterThan(50);
      expect(result.estimatedSuccessRate).toBeGreaterThan(50);
    });

    it("calculateDelegationScore_evaluatesClarityDimension", () => {
      const clearInput: DelegationQualityInput = {
        taskDescription: "分析せよ：対象範囲は全体、出力形式はレポート、期限内に完了",
        targetId: "agent-1",
      };

      const vagueInput: DelegationQualityInput = {
        taskDescription: "適当にやって",
        targetId: "agent-1",
      };

      const clearResult = calculateDelegationScore(clearInput);
      const vagueResult = calculateDelegationScore(vagueInput);

      expect(clearResult.dimensions.clarity).toBeGreaterThan(vagueResult.dimensions.clarity);
    });

    it("calculateDelegationScore_evaluatesContextDimension", () => {
      const withContext: DelegationQualityInput = {
        taskDescription: "Test task",
        sharedContext: "x".repeat(600) + " 関連ファイル 参照",
        targetId: "agent-1",
      };

      const withoutContext: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
      };

      const withResult = calculateDelegationScore(withContext);
      const withoutResult = calculateDelegationScore(withoutContext);

      expect(withResult.dimensions.context).toBeGreaterThan(withoutResult.dimensions.context);
    });

    it("calculateDelegationScore_evaluatesCriteriaDimension", () => {
      const withCriteria: DelegationQualityInput = {
        taskDescription: "Test task",
        successCriteria: ["Criteria 1", "Criteria 2", "Criteria 3", "Criteria 4"],
        targetId: "agent-1",
      };

      const withoutCriteria: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
      };

      const withResult = calculateDelegationScore(withCriteria);
      const withoutResult = calculateDelegationScore(withoutCriteria);

      expect(withResult.dimensions.criteria).toBeGreaterThan(withoutResult.dimensions.criteria);
    });

    it("calculateDelegationScore_evaluatesResourcesDimension", () => {
      const withResources: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
        availableResources: ["file1.ts", "file2.ts", "file3.ts"],
      };

      const withoutResources: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "",
      };

      const withResult = calculateDelegationScore(withResources);
      const withoutResult = calculateDelegationScore(withoutResources);

      expect(withResult.dimensions.resources).toBeGreaterThan(withoutResult.dimensions.resources);
    });

    it("calculateDelegationScore_evaluatesPreconditionsDimension", () => {
      const manyResources: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
        availableResources: ["file1.ts", "file2.ts", "file3.ts", "file4.ts", "file5.ts"],
      };

      const fewResources: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
        availableResources: ["file1.ts"],
      };

      const manyResult = calculateDelegationScore(manyResources);
      const fewResult = calculateDelegationScore(fewResources);

      expect(manyResult.dimensions.preconditions).toBeGreaterThan(fewResult.dimensions.preconditions);
    });

    it("calculateDelegationScore_generatesSuggestions", () => {
      const input: DelegationQualityInput = {
        taskDescription: "Do it",
        targetId: "agent-1",
      };

      const result = calculateDelegationScore(input);

      // Should have suggestions for improvement
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("calculateDelegationScore_calculatesEstimatedSuccessRate", () => {
      const highQualityInput: DelegationQualityInput = {
        taskDescription: "分析せよ：対象範囲はsrc、出力形式はJSON、期限内完了",
        sharedContext: "関連ファイルはsrc/lib/main.tsです。前提としてTypeScriptを使用。",
        successCriteria: ["テストが通る", "型エラーがない"],
        targetId: "implementer",
        availableResources: ["src/lib/main.ts"],
      };

      const lowQualityInput: DelegationQualityInput = {
        taskDescription: "適当に",
        targetId: "agent-1",
      };

      const highResult = calculateDelegationScore(highQualityInput);
      const lowResult = calculateDelegationScore(lowQualityInput);

      expect(highResult.estimatedSuccessRate).toBeGreaterThan(lowResult.estimatedSuccessRate);
    });

    it("calculateDelegationScore_returnsScoreInValidRange", () => {
      const input: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
      };

      const result = calculateDelegationScore(input);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);

      Object.values(result.dimensions).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      expect(result.estimatedSuccessRate).toBeGreaterThanOrEqual(0);
      expect(result.estimatedSuccessRate).toBeLessThanOrEqual(100);
    });
  });

  describe("calculateProtectedDelegationScore", () => {
    it("calculateProtectedDelegationScore_includesWarnings", () => {
      const highQualityInput: DelegationQualityInput = {
        taskDescription: "分析せよ：対象範囲はsrc、出力形式はJSON、期限内完了。詳細な仕様書に基づき実装すること。",
        sharedContext: "関連ファイルはsrc/lib/main.tsです。前提としてTypeScriptを使用。背景として大規模リファクタリングが必要。",
        successCriteria: ["テストが通る", "型エラーがない", "ドキュメント更新", "レビュー通過"],
        targetId: "implementer",
        availableResources: ["src/lib/main.ts", "tests/", "docs/"],
      };

      const result = calculateProtectedDelegationScore(highQualityInput);

      expect(result.unmeasurableWarnings).toBeDefined();
      // High score should trigger warnings about over-reliance on metrics
      if (result.overall >= 80) {
        expect(result.unmeasurableWarnings.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateUnmeasurableWarnings", () => {
    it("generateUnmeasurableWarnings_highScore_generatesWarnings", () => {
      const warnings = generateUnmeasurableWarnings(85);

      expect(warnings.length).toBeGreaterThan(0);
      // Check for any warning content (actual text may vary)
      expect(warnings.some((w) => w.length > 0)).toBe(true);
    });

    it("generateUnmeasurableWarnings_mediumScore_generatesInfoWarning", () => {
      const warnings = generateUnmeasurableWarnings(70);

      expect(warnings.length).toBeGreaterThan(0);
    });

    it("generateUnmeasurableWarnings_lowScore_returnsEmptyArray", () => {
      const warnings = generateUnmeasurableWarnings(50);

      expect(warnings).toEqual([]);
    });
  });

  describe("DelegationQualityTracker", () => {
    let tracker: DelegationQualityTracker;

    beforeEach(() => {
      tracker = new DelegationQualityTracker();
    });

    it("record_addsRecordToTracker", () => {
      const input: DelegationQualityInput = {
        taskDescription: "Test task",
        targetId: "agent-1",
      };
      const score = calculateDelegationScore(input);

      tracker.record(input, score, "success");

      expect(tracker.getRecordCount()).toBe(1);
    });

    it("analyzeSuccessPatterns_withNoRecords_returnsZeroes", () => {
      const patterns = tracker.analyzeSuccessPatterns();

      expect(patterns.avgClarity).toBe(0);
      expect(patterns.avgContext).toBe(0);
      expect(patterns.commonCharacteristics).toEqual([]);
    });

    it("analyzeSuccessPatterns_withRecords_returnsAnalysis", () => {
      const input: DelegationQualityInput = {
        taskDescription: "分析せよ：詳細なタスク記述",
        sharedContext: "x".repeat(300),
        targetId: "agent-1",
      };
      const score = calculateDelegationScore(input);

      tracker.record(input, score, "success");
      tracker.record(input, score, "success");

      const patterns = tracker.analyzeSuccessPatterns();

      expect(patterns.avgClarity).toBeGreaterThan(0);
      expect(patterns.avgContext).toBeGreaterThan(0);
    });

    it("analyzeSuccessPatterns_filtersBySuccessOnly", () => {
      const successInput: DelegationQualityInput = {
        taskDescription: "分析せよ：詳細なタスク記述",
        targetId: "agent-1",
      };
      const failInput: DelegationQualityInput = {
        taskDescription: "Do it",
        targetId: "agent-1",
      };

      const successScore = calculateDelegationScore(successInput);
      const failScore = calculateDelegationScore(failInput);

      tracker.record(successInput, successScore, "success");
      tracker.record(failInput, failScore, "failure");

      const patterns = tracker.analyzeSuccessPatterns();

      // Should only analyze success records
      expect(patterns.avgClarity).toBe(successScore.dimensions.clarity);
    });
  });

  describe("integration tests", () => {
    it("full delegation quality workflow", () => {
      // Step 1: Create delegation input
      const input: DelegationQualityInput = {
        taskDescription: "分析せよ：src/lib/module.tsの複雑度を計測し、出力形式はJSONで報告してください。期限内に完了すること。",
        sharedContext: "関連ファイルはsrc/lib/module.tsです。前提としてTypeScriptを使用しています。",
        successCriteria: ["複雑度が計算されている", "JSON形式で出力されている"],
        targetId: "analyzer-agent",
        availableResources: ["src/lib/module.ts", "package.json"],
      };

      // Step 2: Calculate quality score
      const result = calculateDelegationScore(input);

      // Step 3: Verify results
      expect(result.overall).toBeGreaterThan(0);
      expect(result.dimensions.clarity).toBeGreaterThan(0);
      expect(result.estimatedSuccessRate).toBeGreaterThan(0);

      // Step 4: Check if high risk
      if (result.isHighRisk) {
        expect(result.suggestions.length).toBeGreaterThan(0);
      }

      // Step 5: Get protected score with warnings
      const protectedResult = calculateProtectedDelegationScore(input);
      expect(protectedResult.unmeasurableWarnings).toBeDefined();
    });

    it("quality improvement workflow", () => {
      // Start with low-quality input
      let input: DelegationQualityInput = {
        taskDescription: "Do it",
        targetId: "agent-1",
      };

      let result = calculateDelegationScore(input);
      const initialScore = result.overall;

      // Apply suggestions iteratively
      if (result.dimensions.clarity < 60) {
        input = {
          ...input,
          taskDescription: "分析せよ：srcディレクトリのコードを調査し、レポートを作成してください。",
        };
      }

      if (result.dimensions.context < 60) {
        input = {
          ...input,
          sharedContext: "関連ファイルはsrc/lib/main.tsです。",
        };
      }

      if (result.dimensions.criteria < 60) {
        input = {
          ...input,
          successCriteria: ["レポートが作成されている"],
        };
      }

      result = calculateDelegationScore(input);
      expect(result.overall).toBeGreaterThan(initialScore);
    });
  });
});
