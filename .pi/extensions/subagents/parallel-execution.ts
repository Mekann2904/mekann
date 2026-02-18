/**
 * @abdd.meta
 * path: .pi/extensions/subagents/parallel-execution.ts
 * role: サブエージェント並列実行時の容量解決と予約管理
 * why: 並列実行の容量制御をsubagents.tsから分離し、保守性を確保するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts
 * public_api: resolveSubagentParallelCapacity, SubagentParallelCapacityResolution
 * invariants:
 *   - appliedParallelismは常に1以上の整数
 *   - candidateはrequestedParallelismから1ずつ減らして探索
 *   - 予約取得失敗時はallowed=falseで返却
 * side_effects:
 *   - RuntimeCapacityReservationLeaseの発行
 *   - 容量予約によるランタイムリソースの確保
 *   - 待機発生時のポーリング実行
 * failure_modes:
 *   - タイムアウトによる予約失敗
 *   - AbortSignalによる中断
 *   - 全candidateでの即時予約失敗
 * @abdd.explain
 * overview: サブエージェント並列実行における容量予約の解決を行うモジュール
 * what_it_does:
 *   - 要求並列度から利用可能な容量を降順探索で検索
 *   - 即時予約不可時は最小枠(1)で待機予約を実行
 *   - 予約結果に削減有無、待機時間、試行回数等のメタ情報を付与
 * why_it_exists:
 *   - subagents.tsの単一責任を守るため並列容量制御を分離
 *   - 並列度の段階的削減ロジックを再利用可能にするため
 * scope:
 *   in: 並列実行容量の解決、予約、待機処理
 *   out: 実際のサブエージェント実行、タスクスケジューリング
 */

// File: .pi/extensions/subagents/parallel-execution.ts
// Description: Parallel execution capacity resolution for subagents.
// Why: Separates parallel execution logic from main subagents.ts for maintainability.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts

import {
  reserveRuntimeCapacity,
  tryReserveRuntimeCapacity,
  type RuntimeCapacityReservationLease,
} from "../agent-runtime";

// ============================================================================
// Types
// ============================================================================

 /**
  * サブエージェントの並列実行容量解決結果
  * @property allowed - 並列実行が許可されたかどうか
  * @property requestedParallelism - 要求された並列度
  * @property appliedParallelism - 実際に適用された並列度
  * @property reduced - 並列度が削減されたかどうか
  * @property reasons - 判定理由のリスト
  * @property waitedMs - 待機時間（ミリ秒）
  * @property timedOut - タイムアウトしたかどうか
  * @property aborted - 中止されたかどうか
  * @property attempts - 試行回数
  */
export interface SubagentParallelCapacityResolution {
  allowed: boolean;
/**
   * /**
   * * サブエージェントの並列実行容量を解決する
   * *
   * * 要求された並列度に基づいて、利用可能な容量を探索し、
   * * 並列実行のための容量予約を解決します。
   * *
   * * @param input - 容量解決の入力パラメータ
   * * @param input.requestedParallelism - 要求する並列実行数
   * * @param input.additionalRequests - 追加で必要なリクエスト数
   * * @param input.maxWaitMs - 最大待機時間（ミリ秒）
   * * @param input.pollIntervalMs - ポーリング間隔（ミリ秒）
   * * @param input.signal - 処理を中断するためのAbortSignal
   * * @returns 容量解決結果を含むPromise
   * * @example
   * * //
   */
  requestedParallelism: number;
  appliedParallelism: number;
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
// Capacity Resolution
// ============================================================================

/**
 * サブエージェントの並列実行容量を解決する
 * @param input リクエストパラメータ
 * @param input.requestedParallelism リクエストされた並列数
 * @param input.additionalRequests 追加リクエスト数
 * @param input.maxWaitMs 最大待機時間（ミリ秒）
 * @param input.pollIntervalMs ポーリング間隔（ミリ秒）
 * @param input.signal 中断シグナル
 * @returns 容量解決結果
 */
export async function resolveSubagentParallelCapacity(input: {
  requestedParallelism: number;
  additionalRequests: number;
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}): Promise<SubagentParallelCapacityResolution> {
  const requestedParallelism = Math.max(1, Math.trunc(input.requestedParallelism));
  let immediateAttempts = 0;
  for (let candidate = requestedParallelism; candidate >= 1; candidate -= 1) {
    immediateAttempts += 1;
    const attempt = tryReserveRuntimeCapacity({
      toolName: "subagent_run_parallel",
      additionalRequests: input.additionalRequests,
      additionalLlm: candidate,
    });
    if (attempt.allowed && attempt.reservation) {
      return {
        allowed: true,
        requestedParallelism,
        appliedParallelism: candidate,
        reduced: candidate < requestedParallelism,
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

  // Immediate枠が取れない場合は最小枠(1)を待機し、予約を取得してから実行する。
  const waitResult = await reserveRuntimeCapacity({
    toolName: "subagent_run_parallel",
    additionalRequests: input.additionalRequests,
    additionalLlm: 1,
    maxWaitMs: input.maxWaitMs,
    pollIntervalMs: input.pollIntervalMs,
    signal: input.signal,
  });

  if (!waitResult.allowed || !waitResult.reservation) {
    return {
      allowed: false,
      requestedParallelism,
      appliedParallelism: 1,
      reduced: requestedParallelism > 1,
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
    requestedParallelism,
    appliedParallelism: 1,
    reduced: requestedParallelism > 1,
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
