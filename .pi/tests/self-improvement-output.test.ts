/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-output.test.ts
 * role: Unit tests for self-improvement-output.ts
 * why: Verify output generation functions work correctly
 * related: self-improvement-output.ts, self-improvement-dev-analyzer.ts
 * public_api: None (test file)
 * invariants: Output must be actionable and specific
 * side_effects: None
 * failure_modes: Test failures indicate output generation bugs
 * @abdd.explain
 * overview: Unit tests for practical developer output generation
 * what_it_does:
 *   - Tests refactoring suggestion generation
 *   - Tests test case recommendation generation
 *   - Tests documentation update generation
 * why_it_exists: Ensures output quality and actionability
 * scope:
 *   in: self-improvement-output.ts exports
 *   out: Test results
 */

import { describe, it, expect } from "vitest";
import {
  generateRefactoringSuggestions,
  generateTestCases,
  generateDocUpdates,
  generatePracticalOutput,
  type AnalysisInput,
  type RefactoringSuggestion,
  type TestCaseRecommendation,
  type DocumentationUpdate,
  type PracticalOutput,
} from "../extensions/self-improvement-output.js";

describe("generateRefactoringSuggestions", () => {
  it("should return empty array for high-score analyses", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["all good"], score: 80 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);
    expect(suggestions).toHaveLength(0);
  });

  it("should generate suggestions for low-score analyses", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["off-by-one error"], score: 30 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("should assign critical priority for very low scores", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["critical bug"], score: 20 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);
    expect(suggestions[0].priority).toBe("critical");
  });

  it("should assign high priority for moderately low scores", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "eudaimonia", findings: ["complex code"], score: 35 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);
    expect(suggestions[0].priority).toBe("high");
  });

  it("should sort suggestions by priority", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["bug1"], score: 20 },
      { perspective: "eudaimonia", findings: ["issue1"], score: 45 },
      { perspective: "deconstruction", findings: ["bug2"], score: 25 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);

    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < suggestions.length; i++) {
      expect(priorityOrder[suggestions[i - 1].priority]).toBeLessThanOrEqual(
        priorityOrder[suggestions[i].priority]
      );
    }
  });

  it("should include perspective in reason", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["test finding"], score: 30 },
    ];

    const suggestions = generateRefactoringSuggestions(analyses);
    expect(suggestions[0].reason).toContain("logic");
  });
});

describe("generateTestCases", () => {
  it("should generate edge case tests for logic perspective with edge findings", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "logic",
        findings: ["edge case: empty input", "boundary condition issue"],
        score: 40,
      },
    ];

    const tests = generateTestCases(analyses);
    expect(tests.length).toBeGreaterThan(0);

    const edgeCaseTests = tests.filter((t) => t.type === "edge_case");
    expect(edgeCaseTests.length).toBeGreaterThan(0);
  });

  it("should generate integration tests for schizoanalysis perspective", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "schizoanalysis",
        findings: ["side effect detected"],
        score: 40,
      },
    ];

    const tests = generateTestCases(analyses);
    const integrationTests = tests.filter((t) => t.type === "integration");
    expect(integrationTests.length).toBeGreaterThan(0);
  });

  it("should generate scalability tests for utopia_dystopia with scale findings", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "utopia_dystopia",
        findings: ["scale issue detected"],
        score: 40,
      },
    ];

    const tests = generateTestCases(analyses);
    expect(tests.length).toBeGreaterThan(0);
  });

  it("should include test code in output", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "logic",
        findings: ["edge case: null input"],
        score: 40,
      },
    ];

    const tests = generateTestCases(analyses);
    expect(tests[0].code).toBeDefined();
    expect(tests[0].code.length).toBeGreaterThan(0);
  });

  it("should include description in output", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "logic",
        findings: ["edge case issue"],
        score: 40,
      },
    ];

    const tests = generateTestCases(analyses);
    expect(tests[0].description).toBeDefined();
  });
});

describe("generateDocUpdates", () => {
  it("should generate README update for deconstruction findings", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "deconstruction",
        findings: ["assumes Node.js 18+"],
        score: 40,
      },
    ];

    const updates = generateDocUpdates(analyses);
    const readmeUpdate = updates.find((u) => u.file === "README.md");
    expect(readmeUpdate).toBeDefined();
    expect(readmeUpdate?.section).toBe("Assumptions");
  });

  it("should generate CONTRIBUTING update for eudaimonia findings", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "eudaimonia",
        findings: ["high cognitive complexity"],
        score: 40,
      },
    ];

    const updates = generateDocUpdates(analyses);
    const contributingUpdate = updates.find((u) => u.file === "CONTRIBUTING.md");
    expect(contributingUpdate).toBeDefined();
    expect(contributingUpdate?.section).toBe("Developer Experience");
  });

  it("should generate ARCHITECTURE update for utopia_dystopia findings", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "utopia_dystopia",
        findings: ["future scalability concern"],
        score: 40,
      },
    ];

    const updates = generateDocUpdates(analyses);
    const archUpdate = updates.find((u) => u.file === "ARCHITECTURE.md");
    expect(archUpdate).toBeDefined();
    expect(archUpdate?.section).toBe("Future Considerations");
  });

  it("should include reason for each update", () => {
    const analyses: AnalysisInput[] = [
      {
        perspective: "deconstruction",
        findings: ["hidden assumption"],
        score: 40,
      },
    ];

    const updates = generateDocUpdates(analyses);
    for (const update of updates) {
      expect(update.reason).toBeDefined();
      expect(update.reason.length).toBeGreaterThan(0);
    }
  });

  it("should return empty array when no relevant findings", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: [], score: 80 },
    ];

    const updates = generateDocUpdates(analyses);
    expect(updates).toHaveLength(0);
  });
});

describe("generatePracticalOutput", () => {
  it("should return complete PracticalOutput structure", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["bug"], score: 30 },
      { perspective: "eudaimonia", findings: ["complexity"], score: 45 },
    ];

    const output = generatePracticalOutput(analyses);

    expect(output).toBeDefined();
    expect(Array.isArray(output.refactoringSuggestions)).toBe(true);
    expect(Array.isArray(output.testCases)).toBe(true);
    expect(Array.isArray(output.documentationUpdates)).toBe(true);
    expect(Array.isArray(output.nextDevNotes)).toBe(true);
  });

  it("should generate developer notes for low scores", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["critical bug"], score: 25 },
    ];

    const output = generatePracticalOutput(analyses);

    const warningNotes = output.nextDevNotes.filter((n) => n.category === "warning");
    expect(warningNotes.length).toBeGreaterThan(0);
  });

  it("should generate todo note for critical refactoring suggestions", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["critical bug"], score: 20 },
    ];

    const output = generatePracticalOutput(analyses);

    const todoNotes = output.nextDevNotes.filter((n) => n.category === "todo");
    expect(todoNotes.length).toBeGreaterThan(0);
  });

  it("should include affected files in developer notes", () => {
    const analyses: AnalysisInput[] = [
      { perspective: "logic", findings: ["bug"], score: 25 },
    ];

    const output = generatePracticalOutput(analyses);

    for (const note of output.nextDevNotes) {
      expect(Array.isArray(note.affectedFiles)).toBe(true);
    }
  });
});

describe("Type exports", () => {
  it("should export RefactoringSuggestion type correctly", () => {
    const suggestion: RefactoringSuggestion = {
      priority: "high",
      file: "test.ts",
      line: 10,
      currentCode: "old",
      suggestedCode: "new",
      reason: "test",
      perspective: "logic",
    };
    expect(suggestion.priority).toBe("high");
  });

  it("should export TestCaseRecommendation type correctly", () => {
    const testCase: TestCaseRecommendation = {
      type: "edge_case",
      description: "test",
      code: "it('test', () => {})",
      relatedCode: "src.ts",
      perspective: "logic",
    };
    expect(testCase.type).toBe("edge_case");
  });

  it("should export DocumentationUpdate type correctly", () => {
    const update: DocumentationUpdate = {
      file: "README.md",
      section: "Test",
      suggestedContent: "content",
      reason: "test",
    };
    expect(update.file).toBe("README.md");
  });

  it("should export PracticalOutput type correctly", () => {
    const output: PracticalOutput = {
      refactoringSuggestions: [],
      testCases: [],
      documentationUpdates: [],
      nextDevNotes: [],
    };
    expect(output.refactoringSuggestions).toBeDefined();
  });
});
