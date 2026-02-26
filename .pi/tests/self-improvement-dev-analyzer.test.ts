/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-dev-analyzer.test.ts
 * role: Unit tests for self-improvement-dev-analyzer.ts
 * why: Verify perspective translations and code analysis functions
 * related: self-improvement-dev-analyzer.ts
 * public_api: None (test file)
 * invariants: All 7 perspectives must be tested
 * side_effects: None
 * failure_modes: Test failures indicate implementation bugs
 * @abdd.explain
 * overview: Unit tests for developer-focused philosophical perspective analysis
 * what_it_does:
 *   - Tests DEV_PERSPECTIVE_TRANSLATIONS completeness
 *   - Tests analyzeCodeFromPerspective function
 *   - Tests output format and structure
 * why_it_exists: Ensures quality and correctness of perspective translation layer
 * scope:
 *   in: self-improvement-dev-analyzer.ts exports
 *   out: Test results
 */

import { describe, it, expect } from "vitest";
import {
  DEV_PERSPECTIVE_TRANSLATIONS,
  analyzeCodeFromPerspective,
  type PerspectiveName,
  type CodeContext,
  type CodeAnalysisResult,
} from "../extensions/self-improvement-dev-analyzer.js";

describe("DEV_PERSPECTIVE_TRANSLATIONS", () => {
  it("should have all 7 perspectives defined", () => {
    const expectedPerspectives: PerspectiveName[] = [
      "deconstruction",
      "schizoanalysis",
      "eudaimonia",
      "utopia_dystopia",
      "thinking_philosophy",
      "thinking_taxonomy",
      "logic",
    ];

    for (const perspective of expectedPerspectives) {
      expect(DEV_PERSPECTIVE_TRANSLATIONS[perspective]).toBeDefined();
    }
  });

  it("should have devName for each perspective", () => {
    for (const [key, translation] of Object.entries(DEV_PERSPECTIVE_TRANSLATIONS)) {
      expect(translation.devName).toBeDefined();
      expect(translation.devName.length).toBeGreaterThan(0);
      expect(translation.perspective).toBe(key as PerspectiveName);
    }
  });

  it("should have codeAnalysisPrompts for each perspective", () => {
    for (const translation of Object.values(DEV_PERSPECTIVE_TRANSLATIONS)) {
      expect(translation.codeAnalysisPrompts).toBeDefined();
      expect(Array.isArray(translation.codeAnalysisPrompts)).toBe(true);
      expect(translation.codeAnalysisPrompts.length).toBeGreaterThan(0);
    }
  });

  it("should have outputFormat for each perspective", () => {
    for (const translation of Object.values(DEV_PERSPECTIVE_TRANSLATIONS)) {
      expect(translation.outputFormat).toBeDefined();
      expect(translation.outputFormat.length).toBeGreaterThan(0);
    }
  });

  it("should have optional metrics for perspectives", () => {
    const withMetrics = Object.values(DEV_PERSPECTIVE_TRANSLATIONS).filter(
      (t) => t.metrics && t.metrics.length > 0
    );
    expect(withMetrics.length).toBeGreaterThan(0);
  });
});

describe("analyzeCodeFromPerspective", () => {
  const sampleCodeContext: CodeContext = {
    filePath: "src/utils/helper.ts",
    codeSnippet: `function add(a: number, b: number) { return a + b; }`,
    changeType: "add",
    relatedFiles: [],
  };

  it("should return analysis result for valid perspective", () => {
    const result = analyzeCodeFromPerspective("logic", sampleCodeContext);

    expect(result).toBeDefined();
    expect(result.perspective).toBe("logic");
    expect(result.analysis).toBeDefined();
    expect(Array.isArray(result.refactoringSuggestions)).toBe(true);
    expect(Array.isArray(result.testRecommendations)).toBe(true);
    expect(Array.isArray(result.documentationUpdates)).toBe(true);
    expect(Array.isArray(result.nextSteps)).toBe(true);
  });

  it("should return result for all 7 perspectives", () => {
    const perspectives: PerspectiveName[] = [
      "deconstruction",
      "schizoanalysis",
      "eudaimonia",
      "utopia_dystopia",
      "thinking_philosophy",
      "thinking_taxonomy",
      "logic",
    ];

    for (const perspective of perspectives) {
      const result = analyzeCodeFromPerspective(perspective, sampleCodeContext);
      expect(result.perspective).toBe(perspective);
      expect(result.analysis.length).toBeGreaterThan(0);
    }
  });

  it("should handle modify change type", () => {
    const modifyContext: CodeContext = {
      ...sampleCodeContext,
      changeType: "modify",
    };

    const result = analyzeCodeFromPerspective("eudaimonia", modifyContext);
    expect(result).toBeDefined();
  });

  it("should handle delete change type", () => {
    const deleteContext: CodeContext = {
      ...sampleCodeContext,
      changeType: "delete",
    };

    const result = analyzeCodeFromPerspective("utopia_dystopia", deleteContext);
    expect(result).toBeDefined();
  });

  it("should include file path in analysis", () => {
    const result = analyzeCodeFromPerspective("deconstruction", sampleCodeContext);
    expect(result.analysis).toContain(sampleCodeContext.filePath);
  });

  it("should generate perspective-specific refactoring hints", () => {
    const logicResult = analyzeCodeFromPerspective("logic", sampleCodeContext);
    expect(logicResult.refactoringSuggestions.length).toBeGreaterThan(0);

    const eudaimoniaResult = analyzeCodeFromPerspective("eudaimonia", sampleCodeContext);
    expect(eudaimoniaResult.refactoringSuggestions.length).toBeGreaterThan(0);

    // Different perspectives should produce different hints
    expect(logicResult.refactoringSuggestions).not.toEqual(
      eudaimoniaResult.refactoringSuggestions
    );
  });

  it("should generate perspective-specific test hints", () => {
    const logicResult = analyzeCodeFromPerspective("logic", sampleCodeContext);
    const schizoResult = analyzeCodeFromPerspective("schizoanalysis", sampleCodeContext);

    // Logic perspective should mention edge cases
    expect(
      logicResult.testRecommendations.some((r) =>
        r.toLowerCase().includes("エッジ") || r.toLowerCase().includes("edge")
      )
    ).toBe(true);
  });

  it("should generate next steps", () => {
    const result = analyzeCodeFromPerspective("logic", sampleCodeContext);
    expect(result.nextSteps.length).toBeGreaterThan(0);
  });
});

describe("Type exports", () => {
  it("should export PerspectiveName type correctly", () => {
    const validPerspective: PerspectiveName = "logic";
    expect(validPerspective).toBe("logic");
  });

  it("should export CodeContext type correctly", () => {
    const context: CodeContext = {
      filePath: "test.ts",
      codeSnippet: "const x = 1;",
      changeType: "add",
      relatedFiles: ["other.ts"],
    };
    expect(context.filePath).toBe("test.ts");
  });

  it("should export CodeAnalysisResult type correctly", () => {
    const result: CodeAnalysisResult = {
      perspective: "logic",
      analysis: "test analysis",
      refactoringSuggestions: [],
      testRecommendations: [],
      documentationUpdates: [],
      nextSteps: [],
    };
    expect(result.perspective).toBe("logic");
  });
});
