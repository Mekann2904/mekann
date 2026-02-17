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
  type RunOutcomeCode,
  type RunOutcomeSignal,
} from "../../lib";

import type { TeamMemberResult, TeamRunRecord, TeamDefinition, TeamCommunicationAuditEntry } from "./storage";

// Re-export outcome types for convenience
export type { RunOutcomeCode, RunOutcomeSignal };

// ============================================================================
// Failure Resolution
// ============================================================================

export function isRetryableTeamMemberError(error: unknown, statusCode?: number): boolean {
  const message = toErrorMessage(error).toLowerCase();
  if (/429|rate\s*limit|too many requests/i.test(message)) {
    return true;
  }
  if (/timeout|timed?\s*out/i.test(message)) {
    return true;
  }
  if (/503|service unavailable|overloaded/i.test(message)) {
    return true;
  }
  if (/502|bad gateway/i.test(message)) {
    return true;
  }
  if (/connection|network|econnrefused|econnreset/i.test(message)) {
    return true;
  }
  return message.includes("agent team member returned empty output");
}

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
  if (isRetryableTeamMemberError(error, statusCode)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

// ============================================================================
// Member Outcome Resolution
// ============================================================================

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
