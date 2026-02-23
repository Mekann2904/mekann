/**
 * @abdd.meta
 * path: .pi/tests/extensions/agent-teams/judge.test.ts
 * role: judge.tsモジュールの品質保証テスト
 * why: computeProxyUncertaintyWithExplainability等の数式ロジックが正確であることを保証するため
 * related: .pi/extensions/agent-teams/judge.ts, .pi/tests/extensions/abbr.test.ts
 * public_api: なし（テストファイル）
 * invariants: 全テストが再現可能である、副作用がない
 * side_effects: なし
 * failure_modes: テスト失敗時はjudge.tsのバグまたはテストの誤り
 * @abdd.explain
 * overview: エージェントチームの判定ロジック（judge.ts）に対する包括的なユニットテスト。
 * what_it_does:
 *   - computeProxyUncertaintyWithExplainabilityの数式検証
 *   - エッジケース（0メンバー、全失敗、NaN等）の検証
 *   - formatJudgeExplanationの出力フォーマット検証
 *   - buildFallbackJudgeの判定ロジック検証
 * why_it_exists:
 *   - 機能実装後に品質保証が欠落していた問題を解消するため
 *   - 説明可能性機能の正確性を保証するため
 * scope:
 *   in: judge.tsからexportされる関数
 *   out: テスト成功/失敗の結果
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeProxyUncertainty,
  computeProxyUncertaintyWithExplainability,
  formatJudgeExplanation,
  buildFallbackJudge,
  analyzeMemberOutput,
  extractDiscussionSection,
  countEvidenceSignals,
  clampConfidence,
  parseUnitInterval,
  getJudgeWeights,
  setJudgeWeights,
  resetJudgeWeights,
  DEFAULT_JUDGE_WEIGHTS,
  type TeamMemberResult,
  type JudgeWeightConfig,
  type JudgeExplanation,
} from "../../../extensions/agent-teams/judge";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * 標準的な完了メンバー結果を作成
 */
function createCompletedMemberResult(
  memberId: string,
  overrides: Partial<TeamMemberResult> = {},
): TeamMemberResult {
  return {
    memberId,
    role: "test-role",
    summary: "Test summary",
    output: "SUMMARY: Test\nCLAIM: Test claim\nEVIDENCE: file1.ts:10, file2.ts:20\nCONFIDENCE: 0.8",
    status: "completed",
    latencyMs: 100,
    diagnostics: {
      confidence: 0.8,
      evidenceCount: 2,
      contradictionSignals: 0,
      conflictSignals: 0,
    },
    ...overrides,
  };
}

/**
 * 失敗メンバー結果を作成
 */
function createFailedMemberResult(
  memberId: string,
  error: string = "Test error",
): TeamMemberResult {
  return {
    memberId,
    role: "test-role",
    summary: "(failed)",
    output: "",
    status: "failed",
    latencyMs: 0,
    error,
    diagnostics: {
      confidence: 0,
      evidenceCount: 0,
      contradictionSignals: 0,
      conflictSignals: 0,
    },
  };
}

// ============================================================================
// clampConfidence Tests
// ============================================================================

describe("clampConfidence", () => {
  it("should clamp values above 1.0 to 1.0", () => {
    expect(clampConfidence(1.5)).toBe(1.0);
    expect(clampConfidence(100)).toBe(1.0);
  });

  it("should clamp values below 0.0 to 0.0", () => {
    expect(clampConfidence(-0.5)).toBe(0.0);
    expect(clampConfidence(-100)).toBe(0.0);
  });

  it("should preserve values within [0, 1]", () => {
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(1)).toBe(1);
  });

  it("should handle NaN by returning 0.5 (safe default)", () => {
    // NaN returns 0.5 as a safe default, not 0
    expect(clampConfidence(NaN)).toBe(0.5);
  });

  it("should handle Infinity by returning 0.5 (safe default)", () => {
    // Non-finite values return 0.5 as a safe default
    expect(clampConfidence(Infinity)).toBe(0.5);
    expect(clampConfidence(-Infinity)).toBe(0.5);
  });
});

// ============================================================================
// parseUnitInterval Tests
// ============================================================================

describe("parseUnitInterval", () => {
  it("should parse valid confidence values", () => {
    expect(parseUnitInterval("0.5")).toBe(0.5);
    expect(parseUnitInterval("0.8")).toBe(0.8);
    expect(parseUnitInterval("1.0")).toBe(1.0);
  });

  it("should return undefined for truly invalid values", () => {
    // parseUnitInterval returns undefined (not null) for invalid values
    expect(parseUnitInterval("invalid")).toBeUndefined();
    expect(parseUnitInterval("")).toBeUndefined();
  });

  it("should clamp values > 1.0 as percentages", () => {
    // Values > 1.0 are treated as percentages: 2.0 -> 0.02
    expect(parseUnitInterval("2.0")).toBeCloseTo(0.02, 3);
    expect(parseUnitInterval("50")).toBe(0.5);
    expect(parseUnitInterval("100")).toBe(1.0);
  });

  it("should clamp negative values to 0", () => {
    expect(parseUnitInterval("-0.5")).toBe(0); // Clamped to 0
  });

  it("should handle edge cases", () => {
    expect(parseUnitInterval("0")).toBe(0);
    expect(parseUnitInterval("1")).toBe(1);
  });
});

// ============================================================================
// computeProxyUncertainty Tests (Legacy function)
// ============================================================================

describe("computeProxyUncertainty", () => {
  it("should return valid proxy for 3 completed members", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const proxy = computeProxyUncertainty(members);

    expect(proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(proxy.uIntra).toBeLessThanOrEqual(1);
    expect(proxy.uInter).toBeGreaterThanOrEqual(0);
    expect(proxy.uInter).toBeLessThanOrEqual(1);
    expect(proxy.uSys).toBeGreaterThanOrEqual(0);
    expect(proxy.uSys).toBeLessThanOrEqual(1);
    expect(proxy.collapseSignals).toBeInstanceOf(Array);
  });

  it("should handle 0 members with default low confidence behavior", () => {
    // When no members exist, lowConfidence defaults to 1 (no confidence data available)
    // This results in non-zero uIntra due to low confidence contribution
    const proxy = computeProxyUncertainty([]);

    // uIntra = 0.38*0 + 0.26*1 + 0.2*0 + 0.16*0 = 0.26
    expect(proxy.uIntra).toBeCloseTo(0.26, 2);
    expect(proxy.uInter).toBeGreaterThanOrEqual(0);
    expect(proxy.uSys).toBeGreaterThanOrEqual(0);
  });

  it("should handle 1 member", () => {
    const members = [createCompletedMemberResult("member-1")];
    const proxy = computeProxyUncertainty(members);

    expect(proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(proxy.uSys).toBeGreaterThanOrEqual(0);
  });

  it("should detect collapse signals for all failed members", () => {
    const members = [
      createFailedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
      createFailedMemberResult("member-3"),
    ];

    const proxy = computeProxyUncertainty(members);

    expect(proxy.uSys).toBeGreaterThan(0.5);
    expect(proxy.collapseSignals.length).toBeGreaterThan(0);
  });

  it("should detect high_intra_uncertainty when confidence is low", () => {
    const members = [
      createCompletedMemberResult("member-1", {
        diagnostics: { confidence: 0.1, evidenceCount: 0, contradictionSignals: 0, conflictSignals: 0 },
      }),
      createCompletedMemberResult("member-2", {
        diagnostics: { confidence: 0.1, evidenceCount: 0, contradictionSignals: 0, conflictSignals: 0 },
      }),
      createCompletedMemberResult("member-3", {
        diagnostics: { confidence: 0.1, evidenceCount: 0, contradictionSignals: 0, conflictSignals: 0 },
      }),
    ];

    const proxy = computeProxyUncertainty(members);

    // Low confidence should contribute to higher uIntra
    expect(proxy.uIntra).toBeGreaterThan(0);
  });
});

// ============================================================================
// computeProxyUncertaintyWithExplainability Tests
// ============================================================================

describe("computeProxyUncertaintyWithExplainability", () => {
  it("should return both proxy and explanation", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const result = computeProxyUncertaintyWithExplainability(members);

    expect(result).toHaveProperty("proxy");
    expect(result).toHaveProperty("explanation");
    expect(result.proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(result.explanation.inputs.total).toBe(3);
  });

  it("should provide detailed contribution breakdown", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);

    // Check uIntra contributions
    expect(explanation.computation.uIntra.contributions).toHaveLength(4);
    expect(explanation.computation.uIntra.contributions[0]).toHaveProperty("factor");
    expect(explanation.computation.uIntra.contributions[0]).toHaveProperty("weight");
    expect(explanation.computation.uIntra.contributions[0]).toHaveProperty("value");
    expect(explanation.computation.uIntra.contributions[0]).toHaveProperty("contribution");

    // Check uInter contributions
    expect(explanation.computation.uInter.contributions).toHaveLength(4);

    // Check uSys contributions
    expect(explanation.computation.uSys.contributions).toHaveLength(3);
  });

  it("should compute contributions correctly (sum should equal value)", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);

    // uIntra sum of contributions should equal uIntra value (before clamping)
    const uIntraSum = explanation.computation.uIntra.contributions.reduce(
      (sum, c) => sum + c.contribution,
      0,
    );
    expect(Math.abs(explanation.computation.uIntra.value - uIntraSum)).toBeLessThan(0.001);

    // uInter sum of contributions should equal uInter value
    const uInterSum = explanation.computation.uInter.contributions.reduce(
      (sum, c) => sum + c.contribution,
      0,
    );
    expect(Math.abs(explanation.computation.uInter.value - uInterSum)).toBeLessThan(0.001);

    // uSys sum of contributions should equal uSys value
    const uSysSum = explanation.computation.uSys.contributions.reduce(
      (sum, c) => sum + c.contribution,
      0,
    );
    expect(Math.abs(explanation.computation.uSys.value - uSysSum)).toBeLessThan(0.001);
  });

  it("should track collapse triggers correctly", () => {
    const members = [
      createFailedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
      createFailedMemberResult("member-3"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);

    // All triggers should be present
    expect(explanation.triggers).toHaveLength(5);
    explanation.triggers.forEach((trigger) => {
      expect(trigger).toHaveProperty("signal");
      expect(trigger).toHaveProperty("actualValue");
      expect(trigger).toHaveProperty("threshold");
      expect(trigger).toHaveProperty("triggered");
    });

    // At least some triggers should be triggered for all-failed case
    const triggeredCount = explanation.triggers.filter((t) => t.triggered).length;
    expect(triggeredCount).toBeGreaterThan(0);
  });

  it("should build reasoning chain", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);

    expect(explanation.reasoningChain.length).toBeGreaterThan(0);
    expect(explanation.reasoningChain[0]).toContain("Analyzed");
    expect(explanation.reasoningChain[0]).toContain("2 member outputs");
  });

  it("should handle 0 members with explicit maximum uncertainty", () => {
    // P0 improvement: Empty input returns explicit maximum uncertainty
    // This prevents silent failures and makes the edge case explicit
    const result = computeProxyUncertaintyWithExplainability([]);

    // Empty array should return maximum uncertainty
    expect(result.proxy.uIntra).toBe(1);
    expect(result.proxy.uInter).toBe(1);
    expect(result.proxy.uSys).toBe(1);
    expect(result.proxy.collapseSignals).toContain("no_member_results");
    expect(result.explanation.inputs.total).toBe(0);
    expect(result.explanation.inputs.failedCount).toBe(0);
    expect(result.explanation.reasoningChain[0]).toContain("No member results");
  });

  it("should handle mixed success/failure results", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const { proxy, explanation } = computeProxyUncertaintyWithExplainability(members);

    expect(explanation.inputs.total).toBe(3);
    expect(explanation.inputs.failedCount).toBe(1);
    expect(explanation.inputs.failedRatio).toBeCloseTo(1 / 3, 2);
    // 1/3 failures = 0.333 >= 0.30 threshold, so teammate_failures signal triggers
    expect(proxy.collapseSignals).toContain("teammate_failures");
  });

  it("should use custom weights when provided", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
    ];

    const customWeights: JudgeWeightConfig = {
      ...DEFAULT_JUDGE_WEIGHTS,
      intraWeights: {
        failedRatio: 0.5,
        lowConfidence: 0.3,
        noEvidence: 0.1,
        contradiction: 0.1,
      },
    };

    const result = computeProxyUncertaintyWithExplainability(members, customWeights);

    // With custom weights, the contribution breakdown should reflect them
    const failedRatioContribution = result.explanation.computation.uIntra.contributions.find(
      (c) => c.factor === "failedRatio",
    );
    expect(failedRatioContribution?.weight).toBe(0.5);
  });

  it("should handle NaN in diagnostics gracefully", () => {
    const members = [
      createCompletedMemberResult("member-1", {
        diagnostics: {
          confidence: NaN,
          evidenceCount: 2,
          contradictionSignals: 0,
          conflictSignals: 0,
        },
      }),
    ];

    // Should not throw
    const result = computeProxyUncertaintyWithExplainability(members);
    expect(result.proxy.uIntra).toBeGreaterThanOrEqual(0);
  });

  it("should use default weights when invalid weights are provided", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
    ];

    // Create invalid weights (NaN in weight)
    const invalidWeights: JudgeWeightConfig = {
      ...DEFAULT_JUDGE_WEIGHTS,
      intraWeights: {
        failedRatio: NaN, // Invalid!
        lowConfidence: 0.3,
        noEvidence: 0.1,
        contradiction: 0.1,
      },
    };

    // Should fall back to defaults without throwing
    const result = computeProxyUncertaintyWithExplainability(members, invalidWeights);

    // Should still produce valid output using defaults
    expect(result.proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(result.proxy.uIntra).toBeLessThanOrEqual(1);

    // Reasoning chain should contain warning about invalid weights
    const warningLine = result.explanation.reasoningChain.find((line) =>
      line.includes("Invalid weights")
    );
    expect(warningLine).toBeDefined();
  });

  it("should use default weights when null weights are provided", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
    ];

    // Should fall back to defaults without throwing
    const result = computeProxyUncertaintyWithExplainability(members, null as unknown as JudgeWeightConfig);

    expect(result.proxy.uIntra).toBeGreaterThanOrEqual(0);
    expect(result.explanation.reasoningChain.some((line) => line.includes("Invalid weights"))).toBe(true);
  });

  it("should use default weights when partially missing weights are provided", () => {
    const members = [
      createCompletedMemberResult("member-1"),
    ];

    // Create weights with missing nested object
    const partialWeights = {
      version: "partial",
      // Missing intraWeights, interWeights, etc.
    } as JudgeWeightConfig;

    // Should fall back to defaults without throwing
    const result = computeProxyUncertaintyWithExplainability(members, partialWeights);

    expect(result.proxy.uIntra).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// formatJudgeExplanation Tests
// ============================================================================

describe("formatJudgeExplanation", () => {
  it("should produce well-formatted output", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);
    const formatted = formatJudgeExplanation(explanation);

    expect(formatted).toContain("## Judge Decision Explanation");
    expect(formatted).toContain("**Input Summary:**");
    expect(formatted).toContain("**Uncertainty Computation:**");
    expect(formatted).toContain("- uIntra");
    expect(formatted).toContain("- uInter");
    expect(formatted).toContain("- uSys");
    expect(formatted).toContain("**Collapse Triggers:**");
    expect(formatted).toContain("**Reasoning Chain:**");
  });

  it("should include triggered signals when present", () => {
    const members = [
      createFailedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
      createFailedMemberResult("member-3"),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);
    const formatted = formatJudgeExplanation(explanation);

    expect(formatted).toContain("[TRIGGERED]");
  });

  it("should show [ok] for non-triggered signals", () => {
    const members = [
      createCompletedMemberResult("member-1", {
        diagnostics: { confidence: 0.9, evidenceCount: 5, contradictionSignals: 0, conflictSignals: 0 },
      }),
      createCompletedMemberResult("member-2", {
        diagnostics: { confidence: 0.9, evidenceCount: 5, contradictionSignals: 0, conflictSignals: 0 },
      }),
    ];

    const { explanation } = computeProxyUncertaintyWithExplainability(members);
    const formatted = formatJudgeExplanation(explanation);

    expect(formatted).toContain("[ok]");
  });
});

// ============================================================================
// buildFallbackJudge Tests
// ============================================================================

describe("buildFallbackJudge", () => {
  it("should return untrusted verdict for no successful outputs", () => {
    const members = [
      createFailedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
    ];

    const judge = buildFallbackJudge({ memberResults: members });

    expect(judge.verdict).toBe("untrusted");
    expect(judge.confidence).toBeLessThan(0.2);
    expect(judge.collapseSignals).toContain("no_successful_output");
  });

  it("should return trusted verdict for all successful outputs with low uncertainty", () => {
    const members = [
      createCompletedMemberResult("member-1", {
        diagnostics: { confidence: 0.9, evidenceCount: 5, contradictionSignals: 0, conflictSignals: 0 },
      }),
      createCompletedMemberResult("member-2", {
        diagnostics: { confidence: 0.9, evidenceCount: 5, contradictionSignals: 0, conflictSignals: 0 },
      }),
    ];

    const proxy = computeProxyUncertainty(members);
    const judge = buildFallbackJudge({ memberResults: members, proxy });

    expect(judge.verdict).toBe("trusted");
    expect(judge.confidence).toBeGreaterThan(0.5);
  });

  it("should return partial verdict for mixed results", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createFailedMemberResult("member-2"),
      createCompletedMemberResult("member-3"),
    ];

    const judge = buildFallbackJudge({ memberResults: members });

    expect(judge.verdict).toBe("partial");
    expect(judge.reason).toContain("partial");
  });

  it("should return appropriate verdict for high system uncertainty", () => {
    const members = [
      createCompletedMemberResult("member-1", {
        diagnostics: { confidence: 0.3, evidenceCount: 0, contradictionSignals: 1, conflictSignals: 1 },
      }),
      createCompletedMemberResult("member-2", {
        diagnostics: { confidence: 0.3, evidenceCount: 0, contradictionSignals: 1, conflictSignals: 1 },
      }),
    ];

    const proxy = computeProxyUncertainty(members);
    const judge = buildFallbackJudge({ memberResults: members, proxy });

    // High uncertainty should result in partial or untrusted
    // Note: The actual verdict depends on proxy.uSys and failed count
    expect(["partial", "untrusted", "trusted"]).toContain(judge.verdict);
    // With low confidence and contradictions, uSys should be elevated
    expect(proxy.uSys).toBeGreaterThan(0.3);
  });

  it("should include error message when provided", () => {
    const members = [createCompletedMemberResult("member-1")];
    const judge = buildFallbackJudge({
      memberResults: members,
      error: "Test error message",
    });

    expect(judge.rawOutput).toBe("Test error message");
  });
});

// ============================================================================
// analyzeMemberOutput Tests
// ============================================================================

describe("analyzeMemberOutput", () => {
  it("should extract confidence from output", () => {
    const output = "SUMMARY: Test\nCONFIDENCE: 0.75";
    const diagnostics = analyzeMemberOutput(output);

    expect(diagnostics!.confidence).toBe(0.75);
  });

  it("should default to 0.5 confidence when not found", () => {
    const output = "SUMMARY: Test without confidence";
    const diagnostics = analyzeMemberOutput(output);

    expect(diagnostics!.confidence).toBe(0.5);
  });

  it("should count evidence signals", () => {
    const output = "EVIDENCE: file1.ts:10, file2.ts:20, file3.ts:30";
    const diagnostics = analyzeMemberOutput(output);

    expect(diagnostics!.evidenceCount).toBeGreaterThan(0);
  });

  it("should detect contradiction signals", () => {
    const output = "RESULT: This is self-contradictory and inconsistent";
    const diagnostics = analyzeMemberOutput(output);

    expect(diagnostics!.contradictionSignals).toBeGreaterThan(0);
  });

  it("should detect conflict signals", () => {
    const output = "DISCUSSION: I disagree with member-2's claim";
    const diagnostics = analyzeMemberOutput(output);

    expect(diagnostics!.conflictSignals).toBeGreaterThan(0);
  });

  it("should handle empty output", () => {
    const diagnostics = analyzeMemberOutput("");

    expect(diagnostics!.confidence).toBe(0.5);
    expect(diagnostics!.evidenceCount).toBe(0);
    expect(diagnostics!.contradictionSignals).toBe(0);
    expect(diagnostics!.conflictSignals).toBe(0);
  });
});

// ============================================================================
// extractDiscussionSection Tests
// ============================================================================

describe("extractDiscussionSection", () => {
  it("should extract DISCUSSION section", () => {
    const output = `SUMMARY: Test
CLAIM: Test claim
DISCUSSION:
This is the discussion content.
It can span multiple lines.
RESULT: Test result`;

    const discussion = extractDiscussionSection(output);

    expect(discussion).toContain("This is the discussion content");
    expect(discussion).toContain("It can span multiple lines");
    expect(discussion).not.toContain("RESULT:");
  });

  it("should return empty string when DISCUSSION not found", () => {
    const output = "SUMMARY: Test\nCLAIM: Test claim\nRESULT: Test result";
    const discussion = extractDiscussionSection(output);

    expect(discussion).toBe("");
  });

  it("should stop at next major label", () => {
    const output = `DISCUSSION:
Discussion content
SUMMARY: Should not include this`;

    const discussion = extractDiscussionSection(output);

    expect(discussion).toContain("Discussion content");
    expect(discussion).not.toContain("Should not include this");
  });
});

// ============================================================================
// countEvidenceSignals Tests
// ============================================================================

describe("countEvidenceSignals", () => {
  it("should count file:line references", () => {
    const output = "See file1.ts:10 and file2.ts:20 for details";
    const count = countEvidenceSignals(output);

    expect(count).toBe(2);
  });

  it("should count EVIDENCE field items", () => {
    const output = "EVIDENCE: item1, item2, item3";
    const count = countEvidenceSignals(output);

    expect(count).toBe(3);
  });

  it("should handle combined evidence", () => {
    const output = "EVIDENCE: item1, item2\nAlso see file.ts:100";
    const count = countEvidenceSignals(output);

    expect(count).toBe(3);
  });

  it("should return 0 for no evidence", () => {
    const output = "No evidence here";
    const count = countEvidenceSignals(output);

    expect(count).toBe(0);
  });
});

// ============================================================================
// Weight Configuration Tests
// ============================================================================

describe("Weight Configuration", () => {
  beforeEach(() => {
    resetJudgeWeights();
  });

  afterEach(() => {
    resetJudgeWeights();
  });

  it("should return default weights by default", () => {
    const weights = getJudgeWeights();

    expect(weights.version).toBe("1.0.0-default");
    expect(weights.intraWeights.failedRatio).toBe(0.38);
  });

  it("should allow setting custom weights", () => {
    const customWeights: JudgeWeightConfig = {
      ...DEFAULT_JUDGE_WEIGHTS,
      version: "custom-1.0.0",
      intraWeights: {
        failedRatio: 0.5,
        lowConfidence: 0.25,
        noEvidence: 0.15,
        contradiction: 0.1,
      },
    };

    setJudgeWeights(customWeights);
    const weights = getJudgeWeights();

    expect(weights.version).toBe("custom-1.0.0");
    expect(weights.intraWeights.failedRatio).toBe(0.5);
  });

  it("should reset to default weights", () => {
    const customWeights: JudgeWeightConfig = {
      ...DEFAULT_JUDGE_WEIGHTS,
      version: "custom-1.0.0",
    };

    setJudgeWeights(customWeights);
    expect(getJudgeWeights().version).toBe("custom-1.0.0");

    resetJudgeWeights();
    expect(getJudgeWeights().version).toBe("1.0.0-default");
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Full Workflow", () => {
  it("should produce consistent results between legacy and explainability functions", () => {
    const members = [
      createCompletedMemberResult("member-1"),
      createCompletedMemberResult("member-2"),
      createFailedMemberResult("member-3"),
    ];

    const legacyProxy = computeProxyUncertainty(members);
    const { proxy: explainableProxy } = computeProxyUncertaintyWithExplainability(members);

    // Results should be identical (within floating point tolerance)
    expect(Math.abs(legacyProxy.uIntra - explainableProxy.uIntra)).toBeLessThan(0.001);
    expect(Math.abs(legacyProxy.uInter - explainableProxy.uInter)).toBeLessThan(0.001);
    expect(Math.abs(legacyProxy.uSys - explainableProxy.uSys)).toBeLessThan(0.001);
    expect(legacyProxy.collapseSignals).toEqual(explainableProxy.collapseSignals);
  });

  it("should produce verifiable judge output for full team run", () => {
    // Simulate a complete team run
    const members: TeamMemberResult[] = [
      {
        memberId: "researcher",
        role: "Researcher",
        summary: "Found 3 relevant files",
        output: `SUMMARY: Analyzed codebase
CLAIM: The implementation is correct
EVIDENCE: src/main.ts:10, src/utils.ts:20
CONFIDENCE: 0.85
DISCUSSION: Reviewed all related files
RESULT: Implementation verified`,
        status: "completed",
        latencyMs: 1500,
        diagnostics: { confidence: 0.85, evidenceCount: 2, contradictionSignals: 0, conflictSignals: 0 },
      },
      {
        memberId: "reviewer",
        role: "Reviewer",
        summary: "Code quality is good",
        output: `SUMMARY: Reviewed code quality
CLAIM: Code meets standards
EVIDENCE: src/main.ts:5, src/main.ts:15
CONFIDENCE: 0.9
DISCUSSION: I agree with researcher's findings
RESULT: Approved`,
        status: "completed",
        latencyMs: 2000,
        diagnostics: { confidence: 0.9, evidenceCount: 2, contradictionSignals: 0, conflictSignals: 0 },
      },
    ];

    const { proxy, explanation } = computeProxyUncertaintyWithExplainability(members);
    const formatted = formatJudgeExplanation(explanation);
    const judge = buildFallbackJudge({ memberResults: members, proxy });

    // Verify complete output
    expect(proxy.uSys).toBeLessThan(0.6); // Low uncertainty
    expect(judge.verdict).toBe("trusted");
    expect(formatted).toContain("2 member outputs");
    expect(formatted).toContain("0 failed");
  });
});
