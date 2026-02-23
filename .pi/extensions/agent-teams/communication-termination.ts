/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-termination.ts
 * role: チーム協議の終了可否と推奨アクションを判定するロジック
 * why: 不完全な状態や低品質な結果での誤った終了を防ぐため
 * related: ./communication-references, ./agent-teams-types
 * public_api: checkTerminationV2, TerminationCheckResultV2, TeamMemberResultLike
 * invariants: score.totalは各スコアの合計値, recommendationはTHRESHOLDSに基づき決定
 * side_effects: なし
 * failure_modes: referenceResultsが空の場合スコア計算が0になる, 意図しない文字列パースによる誤判定
 * @abdd.explain
 * overview: チームメンバーの出力結果と参照解析結果に基づき、協議終了条件を満たしているかをスコアリングとゲートチェックで判定する関数群。
 * what_it_does:
 *   - メンバーの結果ステータス（失敗率、RESULTタグの有無）を集計し前提条件（Gate）を満たすか検証する
 *   - カバレッジ、特異性、エビデンス数、信頼度の一致、スタンスの明確さから総合スコアを算出する
 *   - スコアと閾値（proceed: 80, extend: 50）に基づき "proceed", "extend", "challenge" のいずれかを推奨する
 *   - 判定に至った理由（減点要因）をdeductionsとして記録する
 * why_it_exists:
 *   - 定量的な指標と定型的なチェックルストを組み合わせ、終了判定の品質と透明性を担保するため
 *   - 高信頼度だがエビデンスが不足しているケースなど、危険な状態を検出して防止するため
 * scope:
 *   in: チームメンバーの実行結果リストと参照解析結果リスト
 *   out: 終了可否、推奨アクション、スコア内訳、ゲート通過状況、減点事由を含む判定結果オブジェクト
 */

import type { PartnerReferenceResultV3 } from "./communication-references";

const THRESHOLDS = {
  proceed: 80,
  extend: 50,
};

const MIN_COVERAGE = 0.6;

/**
 * 終了判定結果（V2）
 * @summary 終了判定詳細
 */
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

/**
 * チームメンバー結果（簡易版）
 * @summary メンバー結果
 */
export interface TeamMemberResultLike {
  memberId: string;
  status: string;
  output?: string;
  diagnostics?: {
    confidence?: number;
    evidenceCount?: number;
  };
}

/**
 * 終了判定を行う（V2）
 * @summary 終了条件チェック
 * @param results メンバー結果リスト
 * @param referenceResults 参照解析結果
 * @returns 終了判定結果
 */
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
