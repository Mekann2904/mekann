// File: .pi/extensions/agent-teams/parallel-execution.ts
// Description: Parallel execution capacity resolution for agent teams.
// Why: Separates parallel execution logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts

import {
  reserveRuntimeCapacity,
  tryReserveRuntimeCapacity,
  type RuntimeCapacityReservationLease,
} from "../agent-runtime";

// ============================================================================
// Types
// ============================================================================

/**
 * チーム並列実行容量の候補値を定義するインターフェース
 *
 * 並列実行の容量確保時に使用される、チームおよびメンバーの並列度と
 * 追加リソース要件を表します。
 *
 * @property teamParallelism - チーム全体の並列実行数
 * @property memberParallelism - 各メンバーの並列実行数
 */
export interface TeamParallelCapacityCandidate {
  teamParallelism: number;
  memberParallelism: number;
  additionalRequests: number;
  additionalLlm: number;
}

export interface TeamParallelCapacityResolution {
  allowed: boolean;
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  appliedTeamParallelism: number;
  appliedMemberParallelism: number;
  reduced: boolean;
  reasons: string[];
  waitedMs: number;
  timedOut: boolean;
  aborted: boolean;
  attempts: number;
  projectedRequests: number;
  projectedLlm: number;
  reservation?: RuntimeCapacityReservationLease;
}

// ============================================================================
// Candidate Building
// ============================================================================

export function buildMemberParallelCandidates(memberParallelism: number): TeamParallelCapacityCandidate[] {
  const requestedMemberParallelism = Math.max(1, Math.trunc(memberParallelism));
  const candidates: TeamParallelCapacityCandidate[] = [];
  for (let member = requestedMemberParallelism; member >= 1; member -= 1) {
    candidates.push({
      teamParallelism: 1,
      memberParallelism: member,
      additionalRequests: 1,
      additionalLlm: member,
    });
  }
  return candidates;
}

export function buildTeamAndMemberParallelCandidates(
  teamParallelism: number,
/**
   * /**
   * * チーム並列実行容量を解決・確保する
   * *
   * * 要求されたチーム並列度とメンバー並列度に基づいて、利用可能な候補から
   * * 実行容量を確保します。容量が不足する場合は、maxWaitMsで指定された
   * * タイムアウトまでポーリングして待機します。
   * *
   * * @param input - 解決パラメータを含むオブジェクト
   * * @param input.requestedTeamParallelism - 要求するチームレベルの並列度（最小1）
   * * @param input.requestedMemberParallelism - 要求するメンバーごとの並列度（最小1）
   * * @param input.candidates - 並列容量候
   */
  memberParallelism: number,
): TeamParallelCapacityCandidate[] {
  const requestedTeamParallelism = Math.max(1, Math.trunc(teamParallelism));
  const requestedMemberParallelism = Math.max(1, Math.trunc(memberParallelism));
  const candidates: TeamParallelCapacityCandidate[] = [];

  for (let team = requestedTeamParallelism; team >= 1; team -= 1) {
    for (let member = requestedMemberParallelism; member >= 1; member -= 1) {
      candidates.push({
        teamParallelism: team,
        memberParallelism: member,
        additionalRequests: team,
        additionalLlm: team * member,
      });
    }
  }

  return candidates;
}

// ============================================================================
// Capacity Resolution
// ============================================================================

export async function resolveTeamParallelCapacity(input: {
  requestedTeamParallelism: number;
  requestedMemberParallelism: number;
  candidates: TeamParallelCapacityCandidate[];
  toolName?: string;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<TeamParallelCapacityResolution> {
  const requestedTeamParallelism = Math.max(1, Math.trunc(input.requestedTeamParallelism));
  const requestedMemberParallelism = Math.max(1, Math.trunc(input.requestedMemberParallelism));
  const normalizedCandidates =
    input.candidates.length > 0
      ? input.candidates
      : [
          {
            teamParallelism: 1,
            memberParallelism: 1,
            additionalRequests: 1,
            additionalLlm: 1,
          },
        ];
  const reservationToolName = String(input.toolName || "agent_team_run_parallel");

  let immediateAttempts = 0;
  for (const candidate of normalizedCandidates) {
    immediateAttempts += 1;
    const attempt = tryReserveRuntimeCapacity({
      toolName: reservationToolName,
      additionalRequests: candidate.additionalRequests,
      additionalLlm: candidate.additionalLlm,
    });
    if (attempt.allowed && attempt.reservation) {
      return {
        allowed: true,
        requestedTeamParallelism,
        requestedMemberParallelism,
        appliedTeamParallelism: candidate.teamParallelism,
        appliedMemberParallelism: candidate.memberParallelism,
        reduced:
          candidate.teamParallelism < requestedTeamParallelism ||
          candidate.memberParallelism < requestedMemberParallelism,
        reasons: [],
        waitedMs: 0,
        timedOut: false,
        aborted: false,
        attempts: immediateAttempts,
        projectedRequests: attempt.projectedRequests,
        projectedLlm: attempt.projectedLlm,
        reservation: attempt.reservation,
      };
    }
  }

  const fallbackCandidate = normalizedCandidates[normalizedCandidates.length - 1];
  const waitResult = await reserveRuntimeCapacity({
    toolName: reservationToolName,
    additionalRequests: fallbackCandidate.additionalRequests,
    additionalLlm: fallbackCandidate.additionalLlm,
    maxWaitMs: input.maxWaitMs,
    pollIntervalMs: input.pollIntervalMs,
    signal: input.signal,
  });

  if (!waitResult.allowed || !waitResult.reservation) {
    return {
      allowed: false,
      requestedTeamParallelism,
      requestedMemberParallelism,
      appliedTeamParallelism: fallbackCandidate.teamParallelism,
      appliedMemberParallelism: fallbackCandidate.memberParallelism,
      reduced: true,
      reasons: waitResult.reasons,
      waitedMs: waitResult.waitedMs,
      timedOut: waitResult.timedOut,
      aborted: waitResult.aborted,
      attempts: immediateAttempts + waitResult.attempts,
      projectedRequests: waitResult.projectedRequests,
      projectedLlm: waitResult.projectedLlm,
    };
  }

  return {
    allowed: true,
    requestedTeamParallelism,
    requestedMemberParallelism,
    appliedTeamParallelism: fallbackCandidate.teamParallelism,
    appliedMemberParallelism: fallbackCandidate.memberParallelism,
    reduced:
      fallbackCandidate.teamParallelism < requestedTeamParallelism ||
      fallbackCandidate.memberParallelism < requestedMemberParallelism,
    reasons: [],
    waitedMs: waitResult.waitedMs,
    timedOut: false,
    aborted: false,
    attempts: immediateAttempts + waitResult.attempts,
    projectedRequests: waitResult.projectedRequests,
    projectedLlm: waitResult.projectedLlm,
    reservation: waitResult.reservation,
  };
}
