/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-output.ts
 * role: Generate practical developer outputs from analysis
 * why: Convert abstract analysis to actionable artifacts
 * related: self-improvement-dev-analyzer.ts, self-improvement-pipeline.ts
 * public_api: generateRefactoringSuggestions, generateTestCases, generateDocUpdates, PracticalOutput
 * invariants: Output must be actionable and specific
 * side_effects: None (pure generation)
 * failure_modes: Invalid analysis input
 * @abdd.explain
 * overview: Converts philosophical analysis results into concrete developer artifacts
 * what_it_does:
 *   - Generates refactoring suggestions with priority and code examples
 *   - Creates test case recommendations with test code templates
 *   - Produces documentation update suggestions
 * why_it_exists: Bridges abstract philosophical analysis with practical development tasks
 * scope:
 *   in: Analysis results with perspective findings and scores
 *   out: RefactoringSuggestion[], TestCaseRecommendation[], DocumentationUpdate[]
 */

import type { PerspectiveName } from "./self-improvement-dev-analyzer.js";

/**
 * 分析入力の型定義
 * @summary Analysis input type
 */
export interface AnalysisInput {
  /** 使用された視座 */
  perspective: PerspectiveName;
  /** 発見事項 */
  findings: string[];
  /** スコア（0-100） */
  score: number;
}

/**
 * リファクタリング提案
 * @summary Refactoring suggestion with priority
 */
export interface RefactoringSuggestion {
  /** 優先度 */
  priority: "critical" | "high" | "medium" | "low";
  /** 対象ファイル */
  file: string;
  /** 行番号（オプション） */
  line?: number;
  /** 現在のコード */
  currentCode: string;
  /** 提案コード */
  suggestedCode: string;
  /** 理由 */
  reason: string;
  /** 関連視座 */
  perspective: PerspectiveName;
}

/**
 * テストケース推奨
 * @summary Test case recommendation
 */
export interface TestCaseRecommendation {
  /** テストタイプ */
  type: "unit" | "integration" | "edge_case" | "property";
  /** 説明 */
  description: string;
  /** テストコード */
  code: string;
  /** 関連コード */
  relatedCode: string;
  /** 関連視座 */
  perspective: PerspectiveName;
}

/**
 * ドキュメント更新
 * @summary Documentation update suggestion
 */
export interface DocumentationUpdate {
  /** 対象ファイル */
  file: string;
  /** セクション名 */
  section: string;
  /** 現在の内容（オプション） */
  currentContent?: string;
  /** 提案内容 */
  suggestedContent: string;
  /** 理由 */
  reason: string;
}

/**
 * 開発者ノート
 * @summary Developer note for next iteration
 */
export interface DeveloperNote {
  /** カテゴリ */
  category: "warning" | "info" | "todo";
  /** メッセージ */
  message: string;
  /** 影響を受けるファイル */
  affectedFiles: string[];
  /** 推奨アクション */
  recommendedAction: string;
}

/**
 * 実践的出力のまとめ
 * @summary Practical output from self-improvement cycle
 */
export interface PracticalOutput {
  /** リファクタリング提案 */
  refactoringSuggestions: RefactoringSuggestion[];
  /** テストケース推奨 */
  testCases: TestCaseRecommendation[];
  /** ドキュメント更新 */
  documentationUpdates: DocumentationUpdate[];
  /** 次回開発時のノート */
  nextDevNotes: DeveloperNote[];
}

/**
 * 分析結果からリファクタリング提案を生成する
 *
 * 低スコアの視座を特定し、具体的なリファクタリング提案を生成する。
 * 提案は優先度順にソートされる。
 *
 * @summary Generates refactoring suggestions from analysis
 * @param analyses - 分析結果の配列
 * @returns 優先度順のリファクタリング提案
 *
 * @example
 * ```typescript
 * const suggestions = generateRefactoringSuggestions([
 *   { perspective: "logic", findings: ["off-by-one error"], score: 30 }
 * ]);
 * // suggestions[0].priority === "high"
 * ```
 */
export function generateRefactoringSuggestions(
  analyses: AnalysisInput[]
): RefactoringSuggestion[] {
  const suggestions: RefactoringSuggestion[] = [];

  for (const analysis of analyses) {
    // スコアが50未満の視座から改善提案を生成
    if (analysis.score < 50) {
      for (const finding of analysis.findings) {
        const priority: RefactoringSuggestion["priority"] =
          analysis.score < 30 ? "critical" : analysis.score < 40 ? "high" : "medium";

        suggestions.push({
          priority,
          file: "[detected file]",
          currentCode: "[current implementation]",
          suggestedCode: generateSuggestedCode(analysis.perspective, finding),
          reason: `${analysis.perspective} perspective: ${finding}`,
          perspective: analysis.perspective,
        });
      }
    }
  }

  return sortSuggestionsByPriority(suggestions);
}

/**
 * 分析結果からテストケース推奨を生成する
 *
 * 特にロジック視座とスキゾ分析視座から、
 * エッジケーステストと副作用テストを生成する。
 *
 * @summary Generates test case recommendations
 * @param analyses - 分析結果の配列
 * @returns テストケース推奨の配列
 *
 * @example
 * ```typescript
 * const tests = generateTestCases([
 *   { perspective: "logic", findings: ["edge case: empty input"] }
 * ]);
 * // tests[0].type === "edge_case"
 * ```
 */
export function generateTestCases(analyses: AnalysisInput[]): TestCaseRecommendation[] {
  const testCases: TestCaseRecommendation[] = [];

  // Logic視座からエッジケーステストを生成
  const logicAnalysis = analyses.find((a) => a.perspective === "logic");
  if (logicAnalysis) {
    for (const finding of logicAnalysis.findings) {
      if (finding.includes("edge") || finding.includes("boundary") || finding.includes("境界")) {
        testCases.push({
          type: "edge_case",
          description: `Edge case test for: ${finding}`,
          code: generateEdgeCaseTest(finding),
          relatedCode: "[related code]",
          perspective: "logic",
        });
      }
    }

    // 常に基本的なロジックテストを追加
    if (logicAnalysis.findings.length > 0) {
      testCases.push({
        type: "unit",
        description: "Logic verification test",
        code: generateLogicTest(logicAnalysis.findings),
        relatedCode: "[function under test]",
        perspective: "logic",
      });
    }
  }

  // Schizoanalysis視座から副作用テストを生成
  const schizoAnalysis = analyses.find((a) => a.perspective === "schizoanalysis");
  if (schizoAnalysis && schizoAnalysis.findings.length > 0) {
    testCases.push({
      type: "integration",
      description: "Side effect verification test",
      code: generateSideEffectTest(schizoAnalysis.findings),
      relatedCode: "[affected code]",
      perspective: "schizoanalysis",
    });
  }

  // Utopia/Dystopia視座からスケーラビリティテストを生成
  const utopiaAnalysis = analyses.find((a) => a.perspective === "utopia_dystopia");
  if (utopiaAnalysis && utopiaAnalysis.findings.some((f) => f.includes("scale") || f.includes("スケール"))) {
    testCases.push({
      type: "property",
      description: "Scalability property test",
      code: generateScalabilityTest(),
      relatedCode: "[scalable component]",
      perspective: "utopia_dystopia",
    });
  }

  return testCases;
}

/**
 * 分析結果からドキュメント更新ポイントを生成する
 *
 * Deconstruction視座から前提の文書化を提案し、
 * Eudaimonia視座からDXノートの追加を提案する。
 *
 * @summary Generates documentation update points
 * @param analyses - 分析結果の配列
 * @returns ドキュメント更新提案の配列
 *
 * @example
 * ```typescript
 * const updates = generateDocUpdates([
 *   { perspective: "deconstruction", findings: ["assumes Node.js 18+"] }
 * ]);
 * // updates[0].section === "Assumptions"
 * ```
 */
export function generateDocUpdates(
  analyses: AnalysisInput[]
): DocumentationUpdate[] {
  const updates: DocumentationUpdate[] = [];

  // Deconstruction視座から前提の文書化を提案
  const deconAnalysis = analyses.find((a) => a.perspective === "deconstruction");
  if (deconAnalysis && deconAnalysis.findings.length > 0) {
    updates.push({
      file: "README.md",
      section: "Assumptions",
      suggestedContent: `
## Assumptions & Prerequisites

${deconAnalysis.findings.map((f) => `- ${f}`).join("\n")}
`,
      reason: "Hidden assumptions detected by deconstruction analysis",
    });
  }

  // Eudaimonia視座からDXノートを追加
  const eudaimoniaAnalysis = analyses.find((a) => a.perspective === "eudaimonia");
  if (eudaimoniaAnalysis && eudaimoniaAnalysis.findings.length > 0) {
    updates.push({
      file: "CONTRIBUTING.md",
      section: "Developer Experience",
      suggestedContent: `
## Developer Experience Notes

${eudaimoniaAnalysis.findings.map((f) => `- ${f}`).join("\n")}
`,
      reason: "DX concerns identified by eudaimonia analysis",
    });
  }

  // Utopia/Dystopia視座からアーキテクチャノートを追加
  const utopiaAnalysis = analyses.find((a) => a.perspective === "utopia_dystopia");
  if (utopiaAnalysis && utopiaAnalysis.findings.length > 0) {
    updates.push({
      file: "ARCHITECTURE.md",
      section: "Future Considerations",
      suggestedContent: `
## Future Considerations

${utopiaAnalysis.findings.map((f) => `- ${f}`).join("\n")}
`,
      reason: "Future risks identified by utopia/dystopia analysis",
    });
  }

  return updates;
}

/**
 * 全ての実践的出力を生成する
 *
 * @summary Generates all practical outputs
 * @param analyses - 分析結果の配列
 * @returns 実践的出力のまとめ
 */
export function generatePracticalOutput(analyses: AnalysisInput[]): PracticalOutput {
  const refactoringSuggestions = generateRefactoringSuggestions(analyses);
  const testCases = generateTestCases(analyses);
  const documentationUpdates = generateDocUpdates(analyses);

  // 開発者ノートを生成
  const nextDevNotes: DeveloperNote[] = [];

  for (const analysis of analyses) {
    if (analysis.score < 50) {
      nextDevNotes.push({
        category: "warning",
        message: `${analysis.perspective} score is low (${analysis.score})`,
        affectedFiles: ["[affected files]"],
        recommendedAction: `Focus on ${analysis.perspective} improvements`,
      });
    }
  }

  if (refactoringSuggestions.some((s) => s.priority === "critical")) {
    nextDevNotes.push({
      category: "todo",
      message: "Critical refactoring suggestions available",
      affectedFiles: refactoringSuggestions.filter((s) => s.priority === "critical").map((s) => s.file),
      recommendedAction: "Review and apply critical refactoring suggestions",
    });
  }

  return {
    refactoringSuggestions,
    testCases,
    documentationUpdates,
    nextDevNotes,
  };
}

// ============================================================================
// ヘルパー関数
// ============================================================================

/**
 * 視座に応じた提案コードを生成する
 * @summary Generates suggested code based on perspective
 */
function generateSuggestedCode(perspective: PerspectiveName, finding: string): string {
  const templates: Partial<Record<PerspectiveName, string>> = {
    deconstruction: `// TODO: Address assumption - ${finding}
// Consider extracting this into a configurable parameter`,
    logic: `// Fix logic issue - ${finding}
// Add validation or guard clause`,
    eudaimonia: `// Improve DX - ${finding}
// Add comment or extract method for clarity`,
    schizoanalysis: `// Side effect consideration - ${finding}
// Document or isolate the side effect`,
    utopia_dystopia: `// Future-proofing - ${finding}
// Consider scalability implications`,
    thinking_philosophy: `// Meta-level concern - ${finding}
// Review for self-referential issues`,
    thinking_taxonomy: `// Thinking mode note - ${finding}
// Consider alternative approach`,
  };
  return templates[perspective] || `// Address: ${finding}`;
}

/**
 * エッジケーステストを生成する
 * @summary Generates edge case test code
 */
function generateEdgeCaseTest(finding: string): string {
  return `
it('should handle edge case: ${finding}', () => {
  // Arrange
  const input = /* edge case input */;

  // Act & Assert
  expect(() => functionUnderTest(input)).not.toThrow();
});
`;
}

/**
 * ロジックテストを生成する
 * @summary Generates logic verification test code
 */
function generateLogicTest(findings: string[]): string {
  return `
describe('Logic Verification', () => {
  it('should satisfy invariants', () => {
    // Test invariants based on: ${findings.slice(0, 3).join(", ")}
    const result = functionUnderTest(/* input */);

    // Assert invariants
    expect(result).toBeDefined();
  });
});
`;
}

/**
 * 副作用テストを生成する
 * @summary Generates side effect test code
 */
function generateSideEffectTest(findings: string[]): string {
  return `
describe('Side Effects', () => {
  it('should not have unintended side effects', () => {
    // Track state before
    const stateBefore = getState();

    // Execute
    executeFunction();

    // Verify only expected changes
    const stateAfter = getState();
    expect(stateAfter).toMatchExpectedChanges();
  });

  // Based on findings: ${findings.slice(0, 2).join(", ")}
});
`;
}

/**
 * スケーラビリティテストを生成する
 * @summary Generates scalability test code
 */
function generateScalabilityTest(): string {
  return `
describe('Scalability Properties', () => {
  it('should handle increasing load', () => {
    // Property: performance degrades gracefully
    for (const size of [100, 1000, 10000]) {
      const start = performance.now();
      processItems(size);
      const duration = performance.now() - start;

      // Should be O(n log n) or better
      expect(duration).toBeLessThan(size * Math.log2(size) * 0.1);
    }
  });
});
`;
}

/**
 * 提案を優先度順にソートする
 * @summary Sorts suggestions by priority
 */
function sortSuggestionsByPriority(
  suggestions: RefactoringSuggestion[]
): RefactoringSuggestion[] {
  const priorityOrder: Record<RefactoringSuggestion["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return [...suggestions].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}
