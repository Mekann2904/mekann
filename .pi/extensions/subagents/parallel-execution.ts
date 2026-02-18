/**
 * @abdd.meta
 * path: .pi/extensions/subagents/parallel-execution.ts
 * role: サブエージェントの並列実行容量を確保・解決するモジュール
 * why: 並列実行ロジックをメインファイルから分離し、保守性を向上させるため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts
 * public_api: SubagentParallelCapacityResolution, resolveSubagentParallelCapacity
 * invariants: appliedParallelismは常に1以上、requestedParallelismは1以上に丸められる
 * side_effects: ランタイム容量のリソース予約を行う
 * failure_modes: 容量不足による並列度低下、最大待機時間経過によるタイムアウト、シグナルによる中断
 * @abdd.explain
 * overview: サブエージェントの並列実行に必要なリソース容量の確保と、その解決結果を管理する
 * what_it_does:
 *   - 要求された並列度に基づき、即座に利用可能な容量を探索して予約を試行する
 *   - 即時確保できない場合、最小限の容量（並列度1）の確保を待機する
 *   - タイムアウトや中断シグナルに応じて、確保状況を判定して結果を返す
 * why_it_exists:
 *   - 並列処理数を動的に制御し、システムリソースの過負荷を防ぐため
 *   - 容量確保の複雑なロジックを単一の責務として分離するため
 * scope:
 *   in: 要求並列度、追加リクエスト数、待機設定、中断シグナル
 *   out: 許可可否、適用並列度、待機時間、予約リース
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
 * サブエージェント並列容量解決結果
 * @summary 解決結果
 * @property {number} allowed - 許可数
 * @property {number} requestedParallelism - リクエスト並列数
 * @property {number} appliedParallelism - 適用並列数
 * @property {boolean} reduced - 削減されたか
 * @property {string[]} reasons - 理由
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
 * 並列実行容量を解決
 * @summary 容量解決
 * @param input - リクエストパラメータ
 * @param input.requestedParallelism - リクエストされた並列数
 * @param input.additionalRequests - 追加リクエスト数
 * @param input.maxWaitMs - 最大待機時間
 * @param input.pollIntervalMs - ポーリング間隔
 * @param input.signal - 中断シグナル
 * @returns {Promise<SubagentParallelCapacityResolution>} 並列実行容量解決結果
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
