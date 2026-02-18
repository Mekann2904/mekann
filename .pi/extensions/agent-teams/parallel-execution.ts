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
  * チーム並列実行容量の候補
  * @param teamParallelism - チーム全体の並列実行数
  * @param memberParallelism - 各メンバーの並列実行数
  * @param additionalRequests - 追加のリクエスト数
  * @param additionalLlm - 追加のLLM呼び出し数
  */
export interface TeamParallelCapacityCandidate {
  teamParallelism: number;
  memberParallelism: number;
  additionalRequests: number;
  additionalLlm: number;
}

 /**
  * チーム並列実行の解決結果を表すインターフェース
  * @param allowed - 許可されたかどうか
  * @param requestedTeamParallelism - 要求されたチーム並列度
  * @param requestedMemberParallelism - 要求されたメンバー並列度
  * @param appliedTeamParallelism - 適用されたチーム並列度
  * @param appliedMemberParallelism - 適用されたメンバー並列度
  * @param reduced - 削減されたかどうか
  * @param reasons - 理由の配列
  * @param waitedMs - 待機時間（ミリ秒）
  * @param timedOut - タイムアウトしたかどうか
  * @param aborted - 中断されたかどうか
  * @param attempts - 試行回数
  * @param projectedRequests - 予測リクエスト数
  * @param projectedLlm - 予測LLM数
  * @param reservation - 予約リソース（オプション）
  */
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

 /**
  * メンバーの並列度に基づいて候補を生成する
  * @param memberParallelism メンバーの並列度
  * @returns チーム並列容量候補の配列
  */
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

 /**
  * チームとメンバーの並列実行候補を生成
  * @param teamParallelism - チームの並列度
  * @param memberParallelism - メンバーの並列度
  * @returns 並列実行容量の候補リスト
  */
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

 /**
  * チームの並列容量を解決する
  * @param input 解決に必要な入力データ
  * @param input.requestedTeamParallelism 要求するチームの並列数
  * @param input.requestedMemberParallelism 要求するメンバーの並列数
  * @param input.candidates 候補となるチーム並列容量のリスト
  * @param input.toolName 対象のツール名（オプション）
  * @param input.maxWaitMs 最大待機時間（ミリ秒）
  * @param input.pollIntervalMs ポーリング間隔（ミリ秒）
  * @param input.signal 中断シグナル（オプション）
  * @returns チーム並列容量の解決結果を含むPromise
  */
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
