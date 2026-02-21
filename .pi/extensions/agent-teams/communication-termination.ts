/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-termination.ts
 * role: コミュニケーション終了判定（V2：ゲート＋重み付け）
 * why: より精度の高い終了判定を実現するため
 * related: .pi/extensions/agent-teams/communication.ts, communication-references.ts
 * public_api: TerminationCheckResultV2, checkTerminationV2
 * invariants: スコアは0-100の範囲
 * side_effects: なし
 * failure_modes: なし
 */

import type { PartnerReferenceResultV3 } from "./communication-references";

const THRESHOLDS = {
  proceed: 80,
  extend: 50,
};

const MIN_COVERAGE = 0.6;

export interface TerminationCheckResultV2 {
  canTerminate: boolean;
  recommendation: "proceed" | "extend" | "challenge";

  gates: {
    allHaveResult: boolean;
    noCriticalFailure: boolean;
    minCoverageMet: boolean;
  };

  score: {
    total: number;
    breakdown: {
      coverage: number;
      specificity: number;
      evidence: number;
      confidenceAlignment: number;
      stanceClarity: number;
    };
  };

  deductions: string[];

  raw: {
    avgCoverage: number;
    avgSpecificity: number;
    failedCount: number;
    missingResultCount: number;
  };
}

export interface TeamMemberResultLike {
  memberId: string;
  status: string;
  output?: string;
  diagnostics?: {
    confidence?: number;
    evidenceCount?: number;
  };
}

export function checkTerminationV2(
  results: TeamMemberResultLike[],
  referenceResults: PartnerReferenceResultV3[]
): TerminationCheckResultV2 {
  const deductions: string[] = [];

  const missingResultCount = results.filter(
    r => r.status === "completed" && !extractField(r.output || "", "RESULT")
  ).length;
  const allHaveResult = missingResultCount === 0;
  if (!allHaveResult) {
    deductions.push(`${missingResultCount} members missing RESULT`);
  }

  const failedCount = results.filter(r => r.status === "failed").length;
  const noCriticalFailure = failedCount < results.length / 2;
  if (!noCriticalFailure) {
    deductions.push(`${failedCount} members failed (>= 50%)`);
  }

  const avgCoverage = referenceResults.length > 0
    ? average(referenceResults.map(r => r.coverage.ratio))
    : 0;
  const minCoverageMet = avgCoverage >= MIN_COVERAGE;
  if (!minCoverageMet) {
    deductions.push(`average coverage ${avgCoverage.toFixed(2)} < ${MIN_COVERAGE}`);
  }

  const gates = { allHaveResult, noCriticalFailure, minCoverageMet };
  const allGatesPassed = allHaveResult && noCriticalFailure && minCoverageMet;

  const coverageScore = Math.round(avgCoverage * 30);

  const avgSpecificity = referenceResults.length > 0
    ? average(referenceResults.map(r => r.specificity.ratio))
    : 0;
  const specificityScore = Math.round(avgSpecificity * 20);

  const completedResults = results.filter(r => r.status === "completed");
  const avgEvidence = completedResults.length > 0
    ? average(completedResults.map(r => r.diagnostics?.evidenceCount ?? 0))
    : 0;
  const evidenceScore = Math.round(Math.min(1, avgEvidence / 3) * 20);

  const highConfLowEvidence = results.filter(
    r => (r.diagnostics?.confidence ?? 0) > 0.8 && (r.diagnostics?.evidenceCount ?? 0) < 2
  ).length;
  const confidenceAlignment = Math.max(0, 15 - highConfLowEvidence * 5);
  if (highConfLowEvidence > 0) {
    deductions.push(`${highConfLowEvidence} members have high confidence but low evidence`);
  }

  const avgUnknownStance = referenceResults.length > 0
    ? average(referenceResults.map(r => {
        const s = r.stanceSummary;
        const total = s.agree + s.disagree + s.neutral + s.unknown;
        return total > 0 ? s.unknown / total : 1;
      }))
    : 1;
  const stanceClarity = Math.round((1 - avgUnknownStance) * 15);
  if (avgUnknownStance > 0.5) {
    deductions.push(`${Math.round(avgUnknownStance * 100)}% stances are unknown`);
  }

  const breakdown = {
    coverage: coverageScore,
    specificity: specificityScore,
    evidence: evidenceScore,
    confidenceAlignment,
    stanceClarity,
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  let recommendation: "proceed" | "extend" | "challenge";
  if (!allGatesPassed || total < THRESHOLDS.extend) {
    recommendation = "challenge";
  } else if (total >= THRESHOLDS.proceed) {
    recommendation = "proceed";
  } else {
    recommendation = "extend";
  }

  return {
    canTerminate: allGatesPassed && total >= THRESHOLDS.proceed,
    recommendation,
    gates,
    score: { total, breakdown },
    deductions,
    raw: {
      avgCoverage,
      avgSpecificity,
      failedCount,
      missingResultCount,
    },
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}
