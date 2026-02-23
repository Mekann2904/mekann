/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/result-aggregation.ts
 * role: チームおよびメンバーの実行結果集計と状態判定
 * why: agent-teams.tsから結果処理ロジックを分離し、保守性と可読性を向上させるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, ../../lib/error-utils.js
 * public_api: resolveTeamFailureOutcome, resolveTeamMemberAggregateOutcome, resolveTeamParallelRunOutcome, RunOutcomeCode, RunOutcomeSignal, isRetryableTeamMemberError
 * invariants: 結果コードはRunOutcomeCodeのいずれかである、retryRecommendedはエラー分類に基づくブール値である
 * side_effects: なし（純粋な関数）
 * failure_modes: error分類ロジックの変更による結果不一致、未知のエラータイプの誤判定
 * @abdd.explain
 * overview: エージェントチームの実行結果を集計し、成功・失敗・部分的成功などの状態コードを決定するモジュール
 * what_it_does:
 *   - エラー内容に基づき再試行可能かどうかを判定し、実行結果コード（SUCCESS, RETRYABLE_FAILURE等）を決定する
 *   - 複数のメンバー結果を統合し、チーム全体の最終結果と失敗メンバーIDリストを生成する
 *   - 並列実行された複数チームの結果を集計する
 * why_it_exists:
 *   - 複雑な結果判定ロジックをメインのフローから分離して単一責任にする
 *   - エラー分類と結果集計のロジックを再利用可能にする
 * scope:
 *   in: エラーオブジェクト、メンバー実行結果リスト、チーム定義、実行記録
 *   out: 実行結果コード、再試行推奨フラグ、失敗メンバーIDリストを含むRunOutcomeSignalオブジェクト
 */

// File: .pi/extensions/agent-teams/result-aggregation.ts
// Description: Result aggregation and formatting for agent teams.
// Why: Separates result handling logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts

import {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
} from "../../lib/error-utils.js";
import {
  type RunOutcomeCode,
  type RunOutcomeSignal,
} from "../../lib/agent-types.js";
import { isRetryableTeamMemberError as isRetryableTeamMemberErrorLib } from "../../lib/agent-errors.js";

import type { TeamMemberResult, TeamRunRecord, TeamDefinition, TeamCommunicationAuditEntry } from "./storage";

// Re-export outcome types for convenience
export type { RunOutcomeCode, RunOutcomeSignal };

// ============================================================================
// Failure Resolution
// ============================================================================

// Re-export isRetryableTeamMemberError from lib for backward compatibility
export { isRetryableTeamMemberErrorLib as isRetryableTeamMemberError };

/**
 * 失敗時の結果生成
 * @summary 失敗結果生成
 * @param error 発生したエラー
 * @returns 失敗シグナル
 */
export function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal {
  if (isCancelledErrorMessage(error)) {
    return { outcomeCode: "CANCELLED", retryRecommended: false };
  }
  if (isTimeoutErrorMessage(error)) {
    return { outcomeCode: "TIMEOUT", retryRecommended: true };
  }

  const pressure = classifyPressureError(error);
  if (pressure !== "other") {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  const statusCode = extractStatusCodeFromMessage(error);
  if (isRetryableTeamMemberErrorLib(error, statusCode)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

// ============================================================================
// Member Outcome Resolution
// ============================================================================

/**
 * メンバー結果の統合判定
 * @summary メンバー統合判定
 * @param memberResults メンバーの実行結果リスト
 * @returns 統合された実行結果と失敗メンバーID
 */
export function resolveTeamMemberAggregateOutcome(memberResults: TeamMemberResult[]): RunOutcomeSignal & {
  failedMemberIds: string[];
} {
  const failed = memberResults.filter((result) => result.status === "failed");
  if (failed.length === 0) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedMemberIds: [],
    };
  }

  const failedMemberIds = failed.map((result) => result.memberId);
  const retryableFailureCount = failed.filter((result) => {
    const failure = resolveTeamFailureOutcome(result.error || result.summary);
    return failure.retryRecommended;
  }).length;
  const hasAnySuccess = failed.length < memberResults.length;

  if (hasAnySuccess) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedMemberIds,
    };
  }

  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedMemberIds,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedMemberIds,
      };
}

// ============================================================================
// Parallel Run Outcome Resolution
// ============================================================================

/**
 * 並列実行結果の判定
 * @summary 並列実行判定
 * @param results チームごとの実行結果リスト
 * @returns 統合された実行結果と失敗情報
 */
export function resolveTeamParallelRunOutcome(
  results: Array<{
    team: TeamDefinition;
    runRecord: TeamRunRecord;
    memberResults: TeamMemberResult[];
  }>,
): RunOutcomeSignal & {
  failedTeamIds: string[];
  partialTeamIds: string[];
  failedMemberIdsByTeam: Record<string, string[]>;
} {
  const failedTeamIds: string[] = [];
  const partialTeamIds: string[] = [];
  const failedMemberIdsByTeam: Record<string, string[]> = {};
  let retryableFailureCount = 0;
  let hasCompletedTeam = false;

  for (const result of results) {
    const memberOutcome = resolveTeamMemberAggregateOutcome(result.memberResults);
    if (memberOutcome.failedMemberIds.length > 0) {
      failedMemberIdsByTeam[result.team.id] = memberOutcome.failedMemberIds;
    }

    if (result.runRecord.status === "completed") {
      hasCompletedTeam = true;
      if (memberOutcome.outcomeCode === "PARTIAL_SUCCESS") {
        partialTeamIds.push(result.team.id);
        if (memberOutcome.retryRecommended) {
          retryableFailureCount += 1;
        }
      }
      continue;
    }

    failedTeamIds.push(result.team.id);
    const failedTeamOutcome = resolveTeamFailureOutcome(result.runRecord.summary || "team run failed");
    if (failedTeamOutcome.retryRecommended || memberOutcome.retryRecommended) {
      retryableFailureCount += 1;
    }
  }

  const hasAnyFailure = failedTeamIds.length > 0 || partialTeamIds.length > 0;
  if (!hasAnyFailure) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedTeamIds,
      partialTeamIds,
      failedMemberIdsByTeam,
    };
  }

  if (hasCompletedTeam) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedTeamIds,
      partialTeamIds,
      failedMemberIdsByTeam,
    };
  }

  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedTeamIds,
        partialTeamIds,
        failedMemberIdsByTeam,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedTeamIds,
        partialTeamIds,
        failedMemberIdsByTeam,
      };
}

// ============================================================================
// Result Formatting
// ============================================================================

/**
 * チーム結果のテキスト構築
 * @summary チーム結果構築
 * @param input.run チームの実行記録
 * @param input.team チーム定義
 * @param input.memberResults メンバーの実行結果リスト
 * @param input.communicationAudit コミュニケーション監査ログ（オプション）
 * @returns チーム実行結果のテキスト
 */
export function buildTeamResultText(input: {
  run: TeamRunRecord;
  team: TeamDefinition;
  memberResults: TeamMemberResult[];
  communicationAudit?: TeamCommunicationAuditEntry[];
}): string {
  const lines: string[] = [];
  lines.push(`Agent team run completed: ${input.run.runId}`);
  lines.push(`Team: ${input.team.id} (${input.team.name})`);
  lines.push(`Strategy: ${input.run.strategy}`);
  lines.push(`Communication rounds: ${input.run.communicationRounds ?? 0}`);
  lines.push(
    `Failed-member retries: ${input.run.failedMemberRetryApplied ?? 0}/${input.run.failedMemberRetryRounds ?? 0}`,
  );
  lines.push("Failed-member retry policy: round1=quality/transient only, round2+=remaining failures (rate-limit/capacity excluded)");
  if ((input.run.recoveredMembers?.length ?? 0) > 0) {
    lines.push(`Recovered members: ${(input.run.recoveredMembers ?? []).join(", ")}`);
  }
  lines.push(`Status: ${input.run.status}`);
  lines.push(`Summary: ${input.run.summary}`);
  lines.push(`Output file: ${input.run.outputFile}`);
  if (input.run.communicationLinks) {
    lines.push("Communication links:");
    for (const [memberId, partners] of Object.entries(input.run.communicationLinks)) {
      lines.push(`- ${memberId} -> ${partners.join(", ") || "-"}`);
    }
  }
  if ((input.run.communicationRounds ?? 0) > 0) {
    lines.push("Communication audit:");
    const auditEntries = (input.communicationAudit ?? [])
      .slice()
      .sort((left, right) => left.round - right.round || left.memberId.localeCompare(right.memberId));
    if (auditEntries.length === 0) {
      lines.push("- no communication exchange was recorded.");
    } else {
      const referencedCount = auditEntries.filter((entry) => entry.referencedPartners.length > 0).length;
      const fullyReferencedCount = auditEntries.filter((entry) => entry.missingPartners.length === 0).length;
      lines.push(
        `- summary: referenced_any=${referencedCount}/${auditEntries.length}, referenced_all=${fullyReferencedCount}/${auditEntries.length}`,
      );
      for (const entry of auditEntries) {
        lines.push(
          `- round ${entry.round} | ${entry.memberId} (${entry.role}) | status=${entry.resultStatus} | partners=${entry.partnerIds.join(", ") || "-"} | referenced=${entry.referencedPartners.join(", ") || "-"} | missing=${entry.missingPartners.join(", ") || "-"}`,
        );
        lines.push(`  context: ${entry.contextPreview || "-"}`);
        lines.push(`  partner_snapshots: ${entry.partnerSnapshots.join(" ; ") || "-"}`);
      }
    }
  }
  if (input.run.finalJudge) {
    lines.push(
      `Final judge: ${input.run.finalJudge.verdict} (${Math.round(input.run.finalJudge.confidence * 100)}%)`,
    );
    lines.push(
      `Uncertainty: intra=${input.run.finalJudge.uIntra.toFixed(2)}, inter=${input.run.finalJudge.uInter.toFixed(2)}, sys=${input.run.finalJudge.uSys.toFixed(2)}`,
    );
    lines.push(`Collapse signals: ${input.run.finalJudge.collapseSignals.join(", ") || "none"}`);
    lines.push(`Judge reason: ${input.run.finalJudge.reason}`);
    lines.push(`Judge next step: ${input.run.finalJudge.nextStep}`);
  }

  // ユーザビリティ改善: 完了状況の可視化
  if (input.run.achieved && input.run.achieved.length > 0) {
    lines.push("");
    lines.push("ACHIEVED:");
    for (const item of input.run.achieved) {
      lines.push(`  - ${item}`);
    }
  }
  if (input.run.remaining && input.run.remaining.length > 0) {
    lines.push("");
    lines.push("REMAINING:");
    for (const item of input.run.remaining) {
      lines.push(`  - ${item}`);
    }
  }
  if (input.run.successCriteria && input.run.successCriteria.length > 0) {
    lines.push("");
    lines.push("SUCCESS CRITERIA:");
    for (const criterion of input.run.successCriteria) {
      const isAchieved = input.run.achieved?.includes(criterion);
      lines.push(`  ${isAchieved ? "[x]" : "[ ]"} ${criterion}`);
    }
  }

  lines.push("");
  lines.push("Member results:");

  for (const result of input.memberResults) {
    const state = result.status === "completed" ? "ok" : "failed";
    lines.push(`- ${result.memberId} (${result.role}) [${state}] ${result.summary}`);
    if (result.error) {
      lines.push(`  error: ${result.error}`);
    }
  }

  lines.push("");
  lines.push("Detailed outputs:");
  for (const result of input.memberResults) {
    lines.push(`\n### ${result.memberId} (${result.role})`);
    lines.push(result.status === "completed" ? result.output : `FAILED: ${result.error}`);
  }

  return lines.join("\n");
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 要約を抽出
 * @summary 要約抽出
 * @param output LLMの出力文字列
 * @returns 抽出された要約文字列
 */
export function extractSummary(output: string): string {
  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }

  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "(no summary)";
  }

  return firstLine.length > 120 ? `${firstLine.slice(0, 120)}...` : firstLine;
}
