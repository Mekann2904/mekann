/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/parallel-execution.ts
 * role: エージェントチームの並列実行容量解決およびリソース確保を行うモジュール
 * why: 並列実行ロジックを分離し、メインのagent-teams.tsの保守性を向上させるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-runtime.ts
 * public_api: TeamParallelCapacityCandidate, TeamParallelCapacityResolution, buildMemberParallelCandidates, buildTeamAndMemberParallelCandidates, resolveTeamParallelCapacity
 * invariants: 候補生成時の並列度は1以上の整数であること、解決結果のapplied値はrequested値以下であること
 * side_effects: agent-runtime.tsの関数を呼び出し、リソース予約を変更する
 * failure_modes: リソース不足による容量確保の失敗、タイムアウトによる中断
 * @abdd.explain
 * overview: エージェントチームの並列度に基づいて、実行に必要な容量の候補リストを作成し、利用可能なリソースを確保する
 * what_it_does:
 *   - メンバー単位、チーム・メンバー単位の並列実行容量候補を生成する
 *   - 要求された並列度をもとに、利用可能な容量を探索・予約する
 *   - 予約結果（許可可否、削減の有無、待機時間など）を返す
 * why_it_exists:
 *   - チームおよびメンバーの並列処理に必要なリソース量を計算・管理するため
 *   - リソース競合時に並列度を調整し、システム安定性を保つため
 * scope:
 *   in: 要求するチーム並列度、メンバー並列度、最大待機時間
 *   out: 並列実行容量の解決結果、確保されたリソース予約リース
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
