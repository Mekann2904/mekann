/**
 * 委任品質スコアのテスト
 */
import { describe, it, expect } from "vitest";
import {
  calculateDelegationScore,
  calculateProtectedDelegationScore,
  DelegationQualityTracker,
  type DelegationQualityInput,
} from "../lib/delegation-quality";

describe("委任品質スコア", () => {
  describe("calculateDelegationScore", () => {
    it("高品質の委任は高スコアを返す", () => {
      const input: DelegationQualityInput = {
        taskDescription: "以下のTypeScriptファイルを分析し、メモリリークの可能性を調査してください。対象範囲: .pi/extensions/*.ts。出力形式: 検出件数と詳細リスト。",
        sharedContext: "このプロジェクトはpi-coding-agentの拡張機能セットです。関連ファイル: .pi/lib/memory-utils.ts, .pi/lib/cache-manager.ts。前提: Node.js環境。",
        successCriteria: ["メモリリーク候補の特定", "優先度付けされたリスト", "改善提案の提示"],
        targetId: "self-improvement-deep-dive",
        availableResources: [".pi/extensions", ".pi/lib"],
      };

      const result = calculateDelegationScore(input);

      expect(result.overall).toBeGreaterThan(70);
      expect(result.dimensions.clarity).toBeGreaterThan(60);
      expect(result.dimensions.context).toBeGreaterThan(60);
      expect(result.dimensions.criteria).toBeGreaterThan(60);
      expect(result.isHighRisk).toBe(false);
      expect(result.estimatedSuccessRate).toBeGreaterThan(70);
    });

    it("低品質の委任は低スコアを返す", () => {
      const input: DelegationQualityInput = {
        taskDescription: "とりあえず全部見て",
        targetId: "some-team",
      };

      const result = calculateDelegationScore(input);

      expect(result.overall).toBeLessThan(60);
      expect(result.isHighRisk).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it("コンテキストなしは低スコア", () => {
      const input: DelegationQualityInput = {
        taskDescription: "コードをレビューしてください",
        targetId: "code-review-team",
      };

      const result = calculateDelegationScore(input);

      expect(result.dimensions.context).toBeLessThan(50);
      expect(result.suggestions).toContainEqual(
        expect.stringContaining("コンテキスト")
      );
    });

    it("成功基準なしは低スコア", () => {
      const input: DelegationQualityInput = {
        taskDescription: "分析せよ",
        targetId: "analysis-team",
        sharedContext: "対象ファイル: .pi/lib/*.ts",
      };

      const result = calculateDelegationScore(input);

      expect(result.dimensions.criteria).toBeLessThan(50);
    });
  });

  describe("DelegationQualityTracker", () => {
    it("委任を記録してパターンを分析できる", () => {
      const tracker = new DelegationQualityTracker();

      const successInput: DelegationQualityInput = {
        taskDescription: "詳細なタスク記述: 対象範囲、出力形式、期限を明示",
        sharedContext: "豊富なコンテキスト情報: 背景、関連ファイル、前提知識",
        successCriteria: ["基準1", "基準2", "基準3"],
        targetId: "test-team",
      };

      const successScore = calculateDelegationScore(successInput);
      tracker.record(successInput, successScore, "success");

      const failureInput: DelegationQualityInput = {
        taskDescription: "短い",
        targetId: "test-team",
      };

      const failureScore = calculateDelegationScore(failureInput);
      tracker.record(failureInput, failureScore, "failure");

      expect(tracker.getRecordCount()).toBe(2);

      const patterns = tracker.analyzeSuccessPatterns();
      expect(patterns.avgClarity).toBeGreaterThan(0);
      // commonCharacteristicsはavgClarity > 70の場合のみ追加される
      // そのため空の場合もある
    });
  });

  describe("成功率推定", () => {
    it("高品質委任は高い推定成功率を持つ", () => {
      const input: DelegationQualityInput = {
        taskDescription: "明確な動詞と範囲を指定して分析せよ。出力形式はリスト形式。",
        sharedContext: "十分な長さのコンテキスト情報を提供します。関連ファイル: file1.ts, file2.ts",
        successCriteria: ["完了条件1", "完了条件2"],
        targetId: "test-team",
        availableResources: ["resource1", "resource2", "resource3"],
      };

      const result = calculateDelegationScore(input);

      // 高品質委任は70%以上の推定成功率を持つ
      expect(result.estimatedSuccessRate).toBeGreaterThan(65);
    });

    it("低品質委任は低い推定成功率を持つ", () => {
      const input: DelegationQualityInput = {
        taskDescription: "適当にやって",
        targetId: "test-team",
      };

      const result = calculateDelegationScore(input);

      expect(result.estimatedSuccessRate).toBeLessThan(60);
    });
  });

  describe("測定不可能な価値の保護", () => {
    it("高スコアには測定不可能な価値の警告が含まれる", () => {
      const input: DelegationQualityInput = {
        taskDescription: "明確な動詞と範囲を指定して分析せよ。出力形式はリスト形式。",
        sharedContext: "十分な長さのコンテキスト情報を提供します。関連ファイル: file1.ts, file2.ts, file3.ts",
        successCriteria: ["完了条件1", "完了条件2", "完了条件3"],
        targetId: "test-team",
        availableResources: ["resource1", "resource2", "resource3", "resource4", "resource5"],
      };

      const result = calculateProtectedDelegationScore(input);

      // 高スコアの場合、警告が含まれる
      expect(result.unmeasurableWarnings.length).toBeGreaterThan(0);
      expect(result.unmeasurableWarnings[0]).toContain("参考");
    });

    it("低スコアには警告が少ないまたはなし", () => {
      const input: DelegationQualityInput = {
        taskDescription: "短い",
        targetId: "test-team",
      };

      const result = calculateProtectedDelegationScore(input);

      // 低スコアの場合、警告は少ない
      expect(result.unmeasurableWarnings.length).toBe(0);
    });
  });
});
