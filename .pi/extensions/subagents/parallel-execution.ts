/**
 * @abdd.meta
 * path: .pi/extensions/subagents/parallel-execution.ts
 * role: サブエージェントの並列実行容量を解決し、リソース予約を管理する
 * why: メインファイル（subagents.ts）から並列実行ロジックを分離し、保守性を向上させるため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-runtime.ts
 * public_api: SubagentParallelCapacityResolution, resolveSubagentParallelCapacity
 * invariants: requestedParallelismは1以上の整数に丸められる, appliedParallelismは1以上
 * side_effects: agent-runtimeのリソース予約（CapacityReservationLease）を確保または解放する
 * failure_modes: リソース枯渇による許可拒否, タイムアウト, シグナルによる中断
 * @abdd.explain
 * overview: サブエージェントの並列実行に必要なリソース容量を計算・確保し、即時実行可能か待機が必要かを判定するモジュール
 * what_it_does:
 *   - リクエストされた並列数に基づき、即時実行可能な容量を降順で探索して確保を試みる
 *   - 即時確保ができない場合、並列数1の最小枠で待機し、リソースが空くまで予約を試行する
 *   - 最大待機時間、ポーリング間隔、中断シグナルを制御し、結果を詳細なレポートとして返す
 *   - agent-runtimeの`tryReserveRuntimeCapacity`および`reserveRuntimeCapacity`を呼び出す
 * why_it_exists:
 *   - 並列処理のリソース競合を制御し、システム全体の安定性を保つため
 *   - 容量確保ロジックを集中化し、複雑な条件分岐や待機処理を共通化するため
 *   - 即時実行と遅延実行の戦略を明確に分離し、エラーハンドリングを統一するため
 * scope:
 *   in: requestedParallelism, additionalRequests, maxWaitMs, pollIntervalMs, signal
 *   out: SubagentParallelCapacityResolution (allowed, appliedParallelism, reservation, etc.)
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
