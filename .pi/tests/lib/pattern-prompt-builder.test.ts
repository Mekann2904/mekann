/**
 * pattern-prompt-builder.tsの単体テスト
 * パターン参照をプロンプトに組み込む機能を検証する
 */

import { describe, it, expect } from "vitest";
import {
  type RelevantPattern,
  type PromptLanguage,
  buildPatternsPromptSection,
  formatPatternForPrompt,
  toRelevantPattern,
  buildPatternsPromptSectionJa,
  buildPatternsPromptSectionEn,
} from "../../lib/pattern-prompt-builder.js";
import { type ExtractedPattern } from "../../lib/storage/pattern-extraction.js";

describe("pattern-prompt-builder", () => {
  describe("formatPatternForPrompt", () => {
    it("パターンをフォーマットする", () => {
      // Arrange
      const pattern: RelevantPattern = {
        patternType: "success",
        taskType: "refactoring",
        description: "Successfully refactored the module",
        agentOrTeam: "implementer",
        confidence: 0.9,
        keywords: ["refactor", "module"],
      };

      // Act
      const formatted = formatPatternForPrompt(pattern);

      // Assert
      expect(formatted).toContain("[implementer]");
      expect(formatted).toContain("Successfully refactored the module");
    });

    it("長い説明は切り詰められる", () => {
      // Arrange
      const longDescription = "A".repeat(100);
      const pattern: RelevantPattern = {
        patternType: "success",
        taskType: "test",
        description: longDescription,
        agentOrTeam: "test-agent",
        confidence: 0.8,
        keywords: [],
      };

      // Act
      const formatted = formatPatternForPrompt(pattern);

      // Assert
      expect(formatted.length).toBeLessThan(longDescription.length + 50);
    });
  });

  describe("buildPatternsPromptSection", () => {
    it("空の配列は空文字列を返す", () => {
      // Arrange & Act
      const result = buildPatternsPromptSection([]);

      // Assert
      expect(result).toBe("");
    });

    it("undefinedは空文字列を返す", () => {
      // Arrange & Act
      const result = buildPatternsPromptSection(undefined);

      // Assert
      expect(result).toBe("");
    });

    it("成功パターンを含むセクションを構築する（英語）", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "success",
          taskType: "test",
          description: "Test passed",
          agentOrTeam: "tester",
          confidence: 0.9,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "en");

      // Assert
      expect(result).toContain("Patterns from past executions");
      expect(result).toContain("Previously successful");
      expect(result).toContain("Test passed");
    });

    it("失敗パターンを含むセクションを構築する（英語）", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "failure",
          taskType: "test",
          description: "Test failed",
          agentOrTeam: "tester",
          confidence: 0.9,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "en");

      // Assert
      expect(result).toContain("Previously challenging");
      expect(result).toContain("Test failed");
    });

    it("日本語でセクションを構築する", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "success",
          taskType: "test",
          description: "テスト成功",
          agentOrTeam: "tester",
          confidence: 0.9,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "ja");

      // Assert
      expect(result).toContain("過去の実行パターン");
      expect(result).toContain("以前に成功したアプローチ");
      expect(result).toContain("テスト成功");
    });

    it("各タイプのパターンは最大2つまで", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        { patternType: "success", taskType: "t1", description: "s1", agentOrTeam: "a", confidence: 0.9, keywords: [] },
        { patternType: "success", taskType: "t2", description: "s2", agentOrTeam: "a", confidence: 0.9, keywords: [] },
        { patternType: "success", taskType: "t3", description: "s3", agentOrTeam: "a", confidence: 0.9, keywords: [] },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "en");

      // Assert
      const successMatches = result.match(/s[12]/g);
      expect(successMatches?.length).toBe(2);
      expect(result).not.toContain("s3");
    });

    it("考慮事項のセクションを含む", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "approach",
          taskType: "test",
          description: "Approach used",
          agentOrTeam: "agent",
          confidence: 0.8,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "en");

      // Assert
      expect(result).toContain("Consider:");
    });
  });

  describe("buildPatternsPromptSectionJapanese", () => {
    it("日本語でセクションを構築する", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "success",
          taskType: "test",
          description: "成功",
          agentOrTeam: "エージェント",
          confidence: 0.9,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSectionJa(patterns);

      // Assert
      expect(result).toContain("対話相手");
      expect(result).toContain("制約ではない");
    });
  });

  describe("buildPatternsPromptSectionEnglish", () => {
    it("英語でセクションを構築する", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        {
          patternType: "success",
          taskType: "test",
          description: "Success",
          agentOrTeam: "agent",
          confidence: 0.9,
          keywords: [],
        },
      ];

      // Act
      const result = buildPatternsPromptSectionEn(patterns);

      // Assert
      expect(result).toContain("dialogue partners");
      expect(result).toContain("not constraints");
    });
  });

  describe("toRelevantPattern", () => {
    it("ExtractedPatternをRelevantPatternに変換する", () => {
      // Arrange
      const extracted: ExtractedPattern = {
        patternType: "success",
        taskType: "refactoring",
        description: "Refactored successfully",
        agentOrTeam: "refactorer",
        confidence: 0.85,
        keywords: ["refactor"],
        extractedAt: "2024-01-01T00:00:00.000Z",
        applicableConditions: ["clean code"],
      };

      // Act
      const result = toRelevantPattern(extracted);

      // Assert
      expect(result.patternType).toBe("success");
      expect(result.taskType).toBe("refactoring");
      expect(result.description).toBe("Refactored successfully");
      expect(result.agentOrTeam).toBe("refactorer");
      expect(result.confidence).toBe(0.85);
      expect(result.keywords).toEqual(["refactor"]);
    });
  });

  describe("複合パターンタイプ", () => {
    it("複数のタイプを含むセクションを構築する", () => {
      // Arrange
      const patterns: RelevantPattern[] = [
        { patternType: "success", taskType: "t1", description: "成功", agentOrTeam: "a", confidence: 0.9, keywords: [] },
        { patternType: "failure", taskType: "t2", description: "失敗", agentOrTeam: "a", confidence: 0.8, keywords: [] },
        { patternType: "approach", taskType: "t3", description: "アプローチ", agentOrTeam: "a", confidence: 0.7, keywords: [] },
      ];

      // Act
      const result = buildPatternsPromptSection(patterns, "ja");

      // Assert
      expect(result).toContain("以前に成功したアプローチ");
      expect(result).toContain("以前に課題があったアプローチ");
      expect(result).toContain("関連するアプローチ");
    });
  });
});
