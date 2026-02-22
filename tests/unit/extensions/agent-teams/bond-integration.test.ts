/**
 * @summary ボンド統合モジュールの単体テスト
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  augmentDiagnosticsWithBondAnalysis,
  adjustConfidenceByBondAnalysis,
  formatBondAnalysisForJudgeExplanation,
  getBondConfig,
  DEFAULT_BOND_CONFIG,
  type BondDiagnostics,
  type BondAnalysisConfig,
} from "../../../../.pi/extensions/agent-teams/bond-integration.js";
import type { TeamMemberResult } from "../../../../.pi/extensions/agent-teams/storage.js";

describe("bond-integration", () => {
  const createMockResult = (
    memberId: string,
    role: string,
    output: string,
    confidence: number = 0.7,
    status: string = "completed"
  ): TeamMemberResult => ({
    memberId,
    role,
    output,
    status,
    summary: "Test summary",
    diagnostics: {
      confidence,
      evidenceCount: 1,
      contradictionSignals: 0,
      conflictSignals: 0,
    },
  });

  const sampleOutput = `
SUMMARY: Analyzed the component dependencies step by step
CLAIM: Therefore, the module has a circular dependency issue
EVIDENCE: Because file1.ts imports file2.ts
CONFIDENCE: 0.85
RESULT: Circular dependency detected
NEXT_STEP: Break the cycle
  `;

  describe("augmentDiagnosticsWithBondAnalysis", () => {
    it("should return disabled analysis when config.enabled is false", () => {
      const results = [createMockResult("m1", "R1", sampleOutput)];
      const config: BondAnalysisConfig = { ...DEFAULT_BOND_CONFIG, enabled: false };

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results, config);

      expect(diagnostics.analyzed).toBe(false);
    });

    it("should return warning when no completed members", () => {
      const results: TeamMemberResult[] = [
        { memberId: "m1", role: "R1", output: "", status: "failed", summary: "" },
      ];

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results);

      expect(diagnostics.analyzed).toBe(false);
      expect(diagnostics.warnings.length).toBeGreaterThan(0);
    });

    it("should analyze completed members", () => {
      const results = [
        createMockResult("m1", "R1", sampleOutput, 0.85),
        createMockResult("m2", "R2", sampleOutput, 0.9),
      ];

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results);

      expect(diagnostics.analyzed).toBe(true);
      expect(diagnostics.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(diagnostics.stabilityScore).toBeLessThanOrEqual(1);
      expect(diagnostics.overallAssessment).toBeDefined();
    });

    it("should generate warnings for low stability", () => {
      // Create results that will produce low stability
      const explorationOutput = `
SUMMARY: Maybe trying different approaches
CLAIM: Perhaps we should explore option A
EVIDENCE: Let's consider this
CONFIDENCE: 0.3
RESULT: Multiple options
NEXT_STEP: Evaluate
      `;

      const results = [
        createMockResult("m1", "R1", explorationOutput, 0.3),
        createMockResult("m2", "R2", explorationOutput, 0.2),
        createMockResult("m3", "R3", explorationOutput, 0.4),
      ];

      const config: BondAnalysisConfig = {
        ...DEFAULT_BOND_CONFIG,
        lowStabilityThreshold: 0.9, // High threshold to trigger warning
      };

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results, config);

      // Should have analyzed
      expect(diagnostics.analyzed).toBe(true);
    });

    it("should generate detailed report when verbose is true", () => {
      const results = [createMockResult("m1", "R1", sampleOutput)];
      const config: BondAnalysisConfig = { ...DEFAULT_BOND_CONFIG, verbose: true };

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results, config);

      expect(diagnostics.detailedReport).toBeDefined();
      expect(diagnostics.detailedReport).toContain("Reasoning Bond Analysis Report");
    });

    it("should not generate detailed report when verbose is false", () => {
      const results = [createMockResult("m1", "R1", sampleOutput)];
      const config: BondAnalysisConfig = { ...DEFAULT_BOND_CONFIG, verbose: false };

      const diagnostics = augmentDiagnosticsWithBondAnalysis(results, config);

      expect(diagnostics.detailedReport).toBeUndefined();
    });

    it("should handle errors gracefully", () => {
      // Create results that might cause issues
      const results = [
        { memberId: "m1", role: "R1", output: "", status: "completed", summary: "" },
      ];

      // Should not throw
      const diagnostics = augmentDiagnosticsWithBondAnalysis(results as TeamMemberResult[]);
      expect(diagnostics).toBeDefined();
    });
  });

  describe("adjustConfidenceByBondAnalysis", () => {
    it("should not adjust when analysis is disabled", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: false,
        stabilityScore: 0,
        overallAssessment: "optimal",
        entropyConvergenceRate: 0,
        dominantBond: "unknown",
        warnings: [],
        recommendations: [],
      };

      const adjusted = adjustConfidenceByBondAnalysis(diagnostics, 0.8);

      expect(adjusted).toBe(0.8);
    });

    it("should adjust confidence based on stability score", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.5,
        overallAssessment: "suboptimal",
        entropyConvergenceRate: 0.5,
        dominantBond: "deep-reasoning",
        warnings: [],
        recommendations: [],
      };

      const adjusted = adjustConfidenceByBondAnalysis(diagnostics, 0.8);

      // 0.8 * 0.5 = 0.4
      expect(adjusted).toBeCloseTo(0.4, 2);
    });

    it("should apply chaos penalty", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.8,
        overallAssessment: "chaotic",
        entropyConvergenceRate: 0.5,
        dominantBond: "self-exploration",
        warnings: [],
        recommendations: [],
      };

      const adjusted = adjustConfidenceByBondAnalysis(diagnostics, 0.8);

      // 0.8 * 0.8 - 0.3 = 0.34
      expect(adjusted).toBeCloseTo(0.34, 2);
    });

    it("should clamp to 0-1 range", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.5,
        overallAssessment: "chaotic",
        entropyConvergenceRate: 0.5,
        dominantBond: "self-exploration",
        warnings: [],
        recommendations: [],
      };

      const adjusted = adjustConfidenceByBondAnalysis(diagnostics, 0.3);

      // 0.3 * 0.5 - 0.3 = -0.15 -> clamped to 0
      expect(adjusted).toBe(0);
    });
  });

  describe("formatBondAnalysisForJudgeExplanation", () => {
    it("should return empty string when analysis is disabled", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: false,
        stabilityScore: 0,
        overallAssessment: "optimal",
        entropyConvergenceRate: 0,
        dominantBond: "unknown",
        warnings: [],
        recommendations: [],
      };

      const explanation = formatBondAnalysisForJudgeExplanation(diagnostics);

      expect(explanation).toBe("");
    });

    it("should format basic analysis results", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.75,
        overallAssessment: "optimal",
        entropyConvergenceRate: 0.6,
        dominantBond: "deep-reasoning",
        warnings: [],
        recommendations: [],
      };

      const explanation = formatBondAnalysisForJudgeExplanation(diagnostics);

      expect(explanation).toContain("推論ボンド分析");
      expect(explanation).toContain("75.0%");
      expect(explanation).toContain("optimal");
      expect(explanation).toContain("deep-reasoning");
    });

    it("should include warnings when present", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.3,
        overallAssessment: "unstable",
        entropyConvergenceRate: 0.2,
        dominantBond: "self-exploration",
        warnings: ["構造安定性が低いです"],
        recommendations: [],
      };

      const explanation = formatBondAnalysisForJudgeExplanation(diagnostics);

      expect(explanation).toContain("警告");
      expect(explanation).toContain("構造安定性が低いです");
    });

    it("should include recommendations when present", () => {
      const diagnostics: BondDiagnostics = {
        analyzed: true,
        stabilityScore: 0.5,
        overallAssessment: "suboptimal",
        entropyConvergenceRate: 0.3,
        dominantBond: "self-reflection",
        warnings: [],
        recommendations: ["Deep Reasoningが不足しています"],
      };

      const explanation = formatBondAnalysisForJudgeExplanation(diagnostics);

      expect(explanation).toContain("推奨事項");
      expect(explanation).toContain("Deep Reasoningが不足しています");
    });
  });

  describe("getBondConfig", () => {
    it("should return default config when no env vars are set", () => {
      const config = getBondConfig();

      expect(config.enabled).toBe(true);
      expect(config.verbose).toBe(false);
    });
  });

  describe("DEFAULT_BOND_CONFIG", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_BOND_CONFIG.enabled).toBe(true);
      expect(DEFAULT_BOND_CONFIG.verbose).toBe(false);
      expect(DEFAULT_BOND_CONFIG.chaosWarningThreshold).toBe(0.3);
      expect(DEFAULT_BOND_CONFIG.lowStabilityThreshold).toBe(0.5);
    });
  });
});
