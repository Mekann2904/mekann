/**
 * @abdd.meta
 * path: .pi/tests/self-improvement-integration.test.ts
 * role: Integration tests for self-improvement developer tools
 * why: Verify end-to-end workflow from analysis to output
 * related: self-improvement-dev-analyzer.ts, self-improvement-pipeline.ts, self-improvement-output.ts
 * public_api: None (test file)
 * invariants: All components must work together
 * side_effects: None
 * failure_modes: Integration failures indicate broken workflow
 * @abdd.explain
 * overview: Integration tests for complete self-improvement workflow
 * what_it_does:
 *   - Tests analyzer to pipeline integration
 *   - Tests pipeline to output integration
 *   - Tests complete workflow from code to practical output
 * why_it_exists: Ensures all components work together correctly
 * scope:
 *   in: All self-improvement-dev-* modules
 *   out: Test results
 */

import { describe, it, expect } from "vitest";
import { analyzeCodeFromPerspective, DEV_PERSPECTIVE_TRANSLATIONS } from "../extensions/self-improvement-dev-analyzer.js";
import { generatePracticalOutput, type AnalysisInput } from "../extensions/self-improvement-output.js";

describe("Integration: Analyzer to Output Pipeline", () => {
  it("should produce actionable output from code analysis", () => {
    const codeContext = {
      filePath: "src/utils/validator.ts",
      codeSnippet: `
        function validate(input: any): boolean {
          // TODO: add proper validation
          return input != null;
        }
      `,
      changeType: "modify" as const,
      relatedFiles: [],
    };

    // Analyze from multiple perspectives
    const analyses: AnalysisInput[] = [];
    const perspectives = ["deconstruction", "eudaimonia", "logic"] as const;

    for (const perspective of perspectives) {
      const result = analyzeCodeFromPerspective(perspective, codeContext);

      // Convert to analysis input format
      analyses.push({
        perspective,
        findings: [...result.refactoringSuggestions, ...result.testRecommendations],
        score: perspective === "logic" ? 35 : perspective === "eudaimonia" ? 40 : 60,
      });
    }

    // Generate practical output
    const output = generatePracticalOutput(analyses);

    // Verify output completeness
    expect(output.refactoringSuggestions.length).toBeGreaterThan(0);
    expect(output.testCases.length).toBeGreaterThan(0);
    expect(output.nextDevNotes.length).toBeGreaterThan(0);

    // Verify output quality
    for (const suggestion of output.refactoringSuggestions) {
      expect(suggestion.reason).toBeDefined();
      expect(suggestion.perspective).toBeDefined();
      expect(["critical", "high", "medium", "low"]).toContain(suggestion.priority);
    }
  });

  it("should maintain perspective consistency across pipeline", () => {
    const codeContext = {
      filePath: "src/api.ts",
      codeSnippet: "const password = 'hardcoded-secret';",
      changeType: "add" as const,
      relatedFiles: [],
    };

    // Analyze from schizoanalysis perspective (sensitive data)
    const result = analyzeCodeFromPerspective("schizoanalysis", codeContext);

    // Verify perspective is preserved
    expect(result.perspective).toBe("schizoanalysis");

    // Verify analysis mentions the perspective
    const translation = DEV_PERSPECTIVE_TRANSLATIONS.schizoanalysis;
    expect(result.analysis).toContain(translation.devName);
  });
});

describe("Integration: Backward Compatibility", () => {
  it("should not modify existing PerspectiveName values", () => {
    const expectedPerspectives = [
      "deconstruction",
      "schizoanalysis",
      "eudaimonia",
      "utopia_dystopia",
      "thinking_philosophy",
      "thinking_taxonomy",
      "logic",
    ];

    const actualPerspectives = Object.keys(DEV_PERSPECTIVE_TRANSLATIONS);
    expect(actualPerspectives.sort()).toEqual(expectedPerspectives.sort());
  });

  it("should maintain consistent devName format", () => {
    for (const translation of Object.values(DEV_PERSPECTIVE_TRANSLATIONS)) {
      // devName should include English name in parentheses
      expect(translation.devName).toMatch(/\(.*\)/);
    }
  });

  it("should have consistent output format structure", () => {
    const result = analyzeCodeFromPerspective("logic", {
      filePath: "test.ts",
      codeSnippet: "const x = 1;",
      changeType: "add",
      relatedFiles: [],
    });

    // All required fields should be present
    expect(result).toHaveProperty("perspective");
    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("refactoringSuggestions");
    expect(result).toHaveProperty("testRecommendations");
    expect(result).toHaveProperty("documentationUpdates");
    expect(result).toHaveProperty("nextSteps");
  });
});

describe("Integration: Complete Workflow", () => {
  it("should handle complete analysis-to-action workflow", () => {
    // Step 1: Analyze code
    const analysisResult = analyzeCodeFromPerspective("eudaimonia", {
      filePath: "src/complex.ts",
      codeSnippet: `
        // Complex function with high cognitive load
        function process(data: any): any {
          if (data) {
            if (data.items) {
              for (const item of data.items) {
                if (item.value > 0) {
                  // TODO: handle positive
                } else if (item.value < 0) {
                  // TODO: handle negative
                }
              }
            }
          }
          return data;
        }
      `,
      changeType: "modify",
      relatedFiles: ["src/types.ts"],
    });

    // Step 2: Convert to analysis input
    const analyses: AnalysisInput[] = [{
      perspective: "eudaimonia",
      findings: analysisResult.refactoringSuggestions,
      score: 20, // Very low score due to complexity
    }];

    // Step 3: Generate practical output
    const output = generatePracticalOutput(analyses);

    // Step 4: Verify actionable output
    // Score < 30 should produce critical priority
    expect(output.refactoringSuggestions.some(s => s.priority === "critical" || s.priority === "high")).toBe(true);
    expect(output.nextDevNotes.some(n => n.category === "warning")).toBe(true);
  });

  it("should handle multiple perspectives in single workflow", () => {
    const perspectives = Object.keys(DEV_PERSPECTIVE_TRANSLATIONS);
    const codeContext = {
      filePath: "src/auth.ts",
      codeSnippet: "const token = 'secret'; // TODO: use env var",
      changeType: "add" as const,
      relatedFiles: [],
    };

    const analyses: AnalysisInput[] = perspectives.map((perspective) => {
      const result = analyzeCodeFromPerspective(perspective as any, codeContext);
      return {
        perspective: perspective as any,
        findings: result.refactoringSuggestions,
        score: 25, // Low score to trigger suggestions
      };
    });

    const output = generatePracticalOutput(analyses);

    // Should have output from multiple perspectives (at least 1)
    const uniquePerspectives = new Set(
      output.refactoringSuggestions.map(s => s.perspective)
    );
    expect(uniquePerspectives.size).toBeGreaterThanOrEqual(1);
  });
});
