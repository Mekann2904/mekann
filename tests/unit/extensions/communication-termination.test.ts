/**
 * Tests for communication-termination.ts
 */

import { describe, it, expect } from "vitest";
import {
  checkTerminationV2,
  type TeamMemberResultLike,
} from "../../../.pi/extensions/agent-teams/communication-termination";
import type { PartnerReferenceResultV3 } from "../../../.pi/extensions/agent-teams/communication-references";

describe("communication-termination", () => {
  const createResult = (
    memberId: string,
    overrides: Partial<TeamMemberResultLike> = {}
  ): TeamMemberResultLike => ({
    memberId,
    status: "completed",
    output: "SUMMARY: test\nRESULT: done",
    diagnostics: { confidence: 0.8, evidenceCount: 3 },
    ...overrides,
  });

  const createReferenceResult = (
    overrides: Partial<PartnerReferenceResultV3> = {}
  ): PartnerReferenceResultV3 => ({
    referencedPartners: ["a", "b"],
    missingPartners: [],
    claimReferences: [],
    coverage: { ratio: 0.9, count: 2, total: 2 },
    specificity: { ratio: 0.8, structuredCount: 2, quoteCount: 1 },
    overallQuality: 0.85,
    stanceSummary: { agree: 1, disagree: 0, neutral: 1, unknown: 0 },
    ...overrides,
  });

  describe("checkTerminationV2", () => {
    describe("gates", () => {
      it("should fail gate when missing RESULT", () => {
        const results = [
          createResult("a", { output: "SUMMARY: only summary" }),
          createResult("b"),
        ];
        const refResults = [createReferenceResult(), createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.gates.allHaveResult).toBe(false);
        expect(termination.recommendation).toBe("challenge");
      });

      it("should fail gate when too many failures", () => {
        const results = [
          createResult("a"),
          createResult("b", { status: "failed" }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.gates.noCriticalFailure).toBe(false);
        expect(termination.recommendation).toBe("challenge");
      });

      it("should fail gate when coverage too low", () => {
        const results = [createResult("a"), createResult("b")];
        const refResults = [
          createReferenceResult({ coverage: { ratio: 0.3, count: 1, total: 3 } }),
          createReferenceResult({ coverage: { ratio: 0.3, count: 1, total: 3 } }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.gates.minCoverageMet).toBe(false);
      });
    });

    describe("score calculation", () => {
      it("should calculate coverage score (0-30)", () => {
        const results = [createResult("a")];
        const refResults = [
          createReferenceResult({ coverage: { ratio: 1.0, count: 2, total: 2 } }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.score.breakdown.coverage).toBe(30);
      });

      it("should calculate specificity score (0-20)", () => {
        const results = [createResult("a")];
        const refResults = [
          createReferenceResult({ specificity: { ratio: 1.0, structuredCount: 2, quoteCount: 2 } }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.score.breakdown.specificity).toBe(20);
      });

      it("should calculate evidence score (0-20)", () => {
        const results = [
          createResult("a", { diagnostics: { confidence: 0.8, evidenceCount: 6 } }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.score.breakdown.evidence).toBe(20);
      });

      it("should deduct for high confidence with low evidence", () => {
        const results = [
          createResult("a", { diagnostics: { confidence: 0.95, evidenceCount: 1 } }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.score.breakdown.confidenceAlignment).toBeLessThan(15);
        expect(termination.deductions.some(d => d.includes("high confidence"))).toBe(true);
      });

      it("should deduct for unknown stances", () => {
        const results = [createResult("a")];
        const refResults = [
          createReferenceResult({
            stanceSummary: { agree: 0, disagree: 0, neutral: 0, unknown: 2 },
          }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.score.breakdown.stanceClarity).toBe(0);
      });
    });

    describe("recommendation", () => {
      it("should recommend proceed when all gates pass and score >= 80", () => {
        const results = [
          createResult("a"),
          createResult("b"),
          createResult("c"),
        ];
        const refResults = [
          createReferenceResult(),
          createReferenceResult(),
          createReferenceResult(),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.gates.allHaveResult).toBe(true);
        expect(termination.gates.noCriticalFailure).toBe(true);
        expect(termination.gates.minCoverageMet).toBe(true);
        expect(termination.recommendation).toBe("proceed");
      });

      it("should recommend extend when score between 50-79", () => {
        const results = [
          createResult("a"),
          createResult("b"),
        ];
        const refResults = [
          createReferenceResult({ 
            coverage: { ratio: 0.7, count: 1, total: 2 },
            specificity: { ratio: 0.3, structuredCount: 1, quoteCount: 0 },
          }),
          createReferenceResult({ 
            coverage: { ratio: 0.7, count: 1, total: 2 },
            specificity: { ratio: 0.3, structuredCount: 1, quoteCount: 0 },
          }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.gates.minCoverageMet).toBe(true);
        expect(termination.score.total).toBeLessThan(80);
        expect(termination.score.total).toBeGreaterThanOrEqual(50);
        expect(termination.recommendation).toBe("extend");
      });

      it("should recommend challenge when gates fail", () => {
        const results = [
          createResult("a", { output: "no result" }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.recommendation).toBe("challenge");
      });
    });

    describe("canTerminate", () => {
      it("should be true when all gates pass and score >= 80", () => {
        const results = [
          createResult("a"),
          createResult("b"),
        ];
        const refResults = [
          createReferenceResult(),
          createReferenceResult(),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.canTerminate).toBe(true);
      });

      it("should be false when score < 80", () => {
        const results = [
          createResult("a"),
        ];
        const refResults = [
          createReferenceResult({ coverage: { ratio: 0.5, count: 1, total: 2 } }),
        ];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.canTerminate).toBe(false);
      });

      it("should be false when gates fail", () => {
        const results = [
          createResult("a", { status: "failed" }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.canTerminate).toBe(false);
      });
    });

    describe("deductions", () => {
      it("should record missing results", () => {
        const results = [
          createResult("a", { output: "no result field" }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.deductions.some(d => d.includes("missing RESULT"))).toBe(true);
      });

      it("should record high confidence low evidence", () => {
        const results = [
          createResult("a", { diagnostics: { confidence: 0.95, evidenceCount: 0 } }),
        ];
        const refResults = [createReferenceResult()];

        const termination = checkTerminationV2(results, refResults);

        expect(termination.deductions.some(d => d.includes("high confidence"))).toBe(true);
      });
    });
  });
});
