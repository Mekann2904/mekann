/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/parallel-execution.ts
 * role: エージェントチームの並列実行容量の候補生成と解決を行うモジュール
 * why: agent-teams.tsから並列実行ロジックを分離し、保守性を向上させるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
 * public_api: buildMemberParallelCandidates, buildTeamAndMemberParallelCandidates, TeamParallelCapacityCandidate, TeamParallelCapacityResolution
 * invariants: 候補リストは要求された並列数から1へ降順で生成される、teamParallelismとmemberParallelismは1以上の整数である
 * side_effects: agent-runtimeからの容量予約関数呼び出しによるリソース確保
 * failure_modes: 容量不足による並列数の減少、予約処理のタイムアウト、リクエストの中止
 * @abdd.explain
 * overview: チームおよびメンバーの並列実行容量を計算し、利用可能な容量候補を生成・解決する機能を提供する
 * what_it_does:
 *   - 要求された並列数に基づき、チームとメンバーの組み合わせ候補リストを降順で作成する
 *   - ランタイム容量予約APIと連携し、利用可能な並列度を解決する
 *   - 容量不足の場合は並列数を段階的に削減した候補を検証する
 * why_it_exists:
 *   - エージェントチームの実行負荷をシステム全体のリソース容量に制限するため
 *   - 複雑な並列数計算ロジックを単一責任のモジュールとして分離するため
 *   - リソース競合時のスケジューリング（待機、削減、タイムアウト）を管理するため
 * scope:
 *   in: 要求チーム並列数、要求メンバー並列数
 *   out: 許可された並列度、適用された並列度、予約リース、試行回数、待機時間を含む解決結果
 */

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
 * チーム並列容量の候補
 * @summary 容量候補の定義
 * @param teamParallelism チームの並列数
 * @param memberParallelism メンバーの並列数
 * @param additionalRequests 追加リクエスト数
 * @param additionalLlm 追加LLM数
 * @returns 候補オブジェクト
 */
export interface TeamParallelCapacityCandidate {
  teamParallelism: number;
  memberParallelism: number;
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * チーム並列容量の解決結果
 * @summary 解決結果の定義
 * @param allowed 許可されたかどうか
 * @param requestedTeamParallelism 要求されたチーム並列度
 * @param requestedMemberParallelism 要求されたメンバー並列度
 * @param appliedTeamParallelism 適用されたチーム並列度
 * @param appliedMemberParallelism 適用されたメンバー並列度
 * @returns 解決結果オブジェクト
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
 * メンバーの候補を作成
 * @summary メンバー候補作成
 * @param memberParallelism メンバーの並列数
 * @returns 作成された候補リスト
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
 * チームとメンバーの候補を作成
 * @summary 候補リスト作成
 * @param teamParallelism チームの並列数
 * @param memberParallelism メンバーの並列数
 * @returns 作成された候補リスト
 */
export function buildTeamAndMemberParallelCandidates(
  teamParallelism: number,
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
 * チーム並列容量を解決する
 * @summary 並列容量を解決
 * @param input 解決に必要な入力データ
 * @param input.requestedTeamParallelism 要求するチームの並列数
 * @param input.requestedMemberParallelism 要求するメンバーの並列数
 * @param input.candidates 候補となるチーム並列容量のリスト
 * @param input.toolName 対象のツール名（オプション）
 * @param input.maxWaitMs 最大待機時間（ミリ秒）
 * @param input.pollIntervalMs ポーリング間隔（ミリ秒）
 * @param input.signal 中断シグナル（オプション）
 * @returns 並列容量の解決結果
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
