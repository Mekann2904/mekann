/**
 * @abdd.meta
 * path: .pi/extensions/shared/runtime-helpers.ts
 * role: ランタイム制限エラーの生成およびリソース予約ライフサイクルの管理
 * why: エージェントとチーム全体で一貫したランタイム挙動とエラーメッセージを提供するため
 * related: agent-runtime.ts, subagents.ts, agent-teams.ts
 * public_api: buildRuntimeLimitError, buildRuntimeQueueWaitError, startReservationHeartbeat
 * invariants: startReservationHeartbeat は返却された関数を実行するまで5秒間隔で処理を継続する
 * side_effects: getRuntimeSnapshot による状態読み取り, reservation.heartbeat によるリースTTL更新, console.warn によるログ出力
 * failure_modes: ハートビート連続失敗による停止予兆, スナップショット取得不可による情報欠落
 * @abdd.explain
 * overview: ランタイムのリソース制限超過時のエラーメッセージ構築と、予約リースの有効期限延長（ハートビート）を行うユーティリティ群
 * what_it_does:
 *   - アクティブリクエスト数やLLM利用数に基づく制限エラーメッセージを生成する
 *   - オーケストレーションキューの待機状況に基づくブロックエラーメッセージを生成する
 *   - 定期的なハートビート呼び出しによりリソース予約の期限切れ（ゾンビ化）を防ぐ
 *   - ハートビートの連続失敗を検出し、警告ログを出力する
 * why_it_exists:
 *   - subagents.ts と agent-teams.ts で共通のエラー発生ロジックを利用するため
 *   - 実行制限やキュー待機の理由をユーザーに明確に提示するため
 *   - 長時間実行タスクにおけるリソース予約の有効性を維持するため
 * scope:
 *   in: ツール名, エラー理由, 待機情報, 予約リースオブジェクト
 *   out: 整形されたエラーメッセージ文字列, ハートビート停止関数
 */

/**
 * Shared runtime helper utilities.
 * Used by both subagents.ts and agent-teams.ts for consistent runtime behavior.
 */

import {
  getRuntimeSnapshot,
  type RuntimeCapacityReservationLease,
} from "../agent-runtime.js";

/**
 * 実行時制限エラーオプション
 * @summary 制限エラーオプション定義
 */
export interface RuntimeLimitErrorOptions {
  waitedMs?: number;
  timedOut?: boolean;
}

/**
 * 実行時キューウェイト情報
 * @summary キューウェイト情報定義
 */
export interface RuntimeQueueWaitInfo {
  waitedMs: number;
  attempts: number;
  timedOut: boolean;
  aborted: boolean;
  queuePosition: number;
  queuedAhead: number;
}

/**
 * 実行制限エラーメッセージ生成
 * @summary 実行制限エラー生成
 * @param toolName ツール名
 * @param reasons エラー理由リスト
 * @param options オプション設定
 * @returns エラーメッセージ文字列
 */
export function buildRuntimeLimitError(
  toolName: string,
  reasons: string[],
  options?: RuntimeLimitErrorOptions,
): string {
  const snapshot = getRuntimeSnapshot();
  const waitLine =
    options?.waitedMs === undefined
      ? undefined
      : `待機時間: ${options.waitedMs}ms${options.timedOut ? " (timeout)" : ""}`;
  return [
    `${toolName} blocked: runtime limit reached.`,
    ...reasons.map((reason) => `- ${reason}`),
    `現在: requests=${snapshot.totalActiveRequests}, llm=${snapshot.totalActiveLlm}`,
    `上限: requests=${snapshot.limits.maxTotalActiveRequests}, llm=${snapshot.limits.maxTotalActiveLlm}`,
    waitLine,
    "ヒント: 対象数を減らすか、実行中ジョブの完了を待って再実行してください。",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

/**
 * キューウェイトエラーを生成
 * @summary キューウェイトエラー生成
 * @param toolName ツール名
 * @param queueWait キューウェイト情報
 * @returns エラーメッセージ文字列
 */
export function buildRuntimeQueueWaitError(
  toolName: string,
  queueWait: RuntimeQueueWaitInfo,
): string {
  const snapshot = getRuntimeSnapshot();
  const mode = queueWait.aborted ? "aborted" : queueWait.timedOut ? "timeout" : "blocked";
  const queuedPreview = snapshot.queuedTools.length > 0 ? snapshot.queuedTools.join(", ") : "-";
  return [
    `${toolName} blocked: orchestration queue ${mode}.`,
    `- queued_ahead: ${queueWait.queuedAhead}`,
    `- queue_position: ${queueWait.queuePosition}`,
    `- waited_ms: ${queueWait.waitedMs}`,
    `- attempts: ${queueWait.attempts}`,
    `現在: active_orchestrations=${snapshot.activeOrchestrations}, queued=${snapshot.queuedOrchestrations}`,
    `上限: max_concurrent_orchestrations=${snapshot.limits.maxConcurrentOrchestrations}`,
    `待機中ツール: ${queuedPreview}`,
    "ヒント: 同時に走らせる run を減らすか、先行ジョブ完了後に再実行してください。",
  ].join("\n");
}

/**
 * 予約ハートビート開始
 * @summary ハートビート開始
 * @param reservation - 容量予約リース情報
 * @returns ハートビート停止関数
 */
export function startReservationHeartbeat(
  reservation: RuntimeCapacityReservationLease,
): () => void {
  // 期限切れによるゾンビ予約を防ぐため、実行中は定期的にTTLを延長する。
  const intervalMs = 5_000;
  const maxConsecutiveErrors = 3;
  let consecutiveErrors = 0;
  let isStopped = false;
  let registry: FinalizationRegistry<string> | null = null;

  const timer = setInterval(() => {
    if (isStopped) return;

    try {
      reservation.heartbeat();
      consecutiveErrors = 0; // Reset on success
    } catch (error) {
      consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : String(error);

      console.warn(
        `[runtime-helpers] heartbeat() failed (attempt ${consecutiveErrors}/${maxConsecutiveErrors}): ${errorMsg}`,
      );

      // Auto-stop on consecutive failures to prevent resource leak
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error(
          `[runtime-helpers] heartbeat() failed ${maxConsecutiveErrors} times consecutively. ` +
            `Stopping heartbeat timer to prevent resource leak.`,
        );
        isStopped = true;
        clearInterval(timer);
      }
    }
  }, intervalMs);

  timer.unref?.();

  // Core cleanup function
  const doCleanup = () => {
    if (isStopped) return;
    isStopped = true;
    if (registry) {
      registry.unregister(reservation);
    }
    clearInterval(timer);
  };

  // Use FinalizationRegistry to ensure cleanup if caller forgets to call stop function
  // This is a safety net, not a replacement for explicit cleanup
  if (typeof FinalizationRegistry !== "undefined") {
    registry = new FinalizationRegistry((heldValue: string) => {
      if (!isStopped) {
        console.warn(
          `[runtime-helpers] Reservation garbage collected without explicit cleanup. ` +
            `Auto-stopping heartbeat timer (id: ${heldValue}).`,
        );
        doCleanup();
      }
    });

    // Register the reservation for cleanup
    registry.register(reservation, `heartbeat-${Date.now()}`, reservation);
  }

  return doCleanup;
}

/**
 * ランタイムステータス更新
 * @summary ステータス更新
 * @param ctx - UI機能を持つ拡張機能コンテキスト
 * @param statusKey - ステータスキー ("subagent-runtime" または "agent-team-runtime")
 * @param primaryLabel - プライマリエージェントの表示ラベル
 * @param primaryActive - プライマリのアクティブ数
 * @param secondaryLabel - セカンダリエージェントの表示ラベル
 * @param secondaryActive - セカンダリのアクティブ数
 * @returns -
 */
export function refreshRuntimeStatus(
  ctx: any,
  statusKey: "subagent-runtime" | "agent-team-runtime",
  primaryLabel: string,
  primaryActive: number,
  secondaryLabel: string,
  secondaryActive: number,
): void {
  if (!ctx?.hasUI || !ctx?.ui) return;
  const snapshot = getRuntimeSnapshot();

  if (
    snapshot.totalActiveRequests <= 0 &&
    snapshot.totalActiveLlm <= 0 &&
    snapshot.activeOrchestrations <= 0 &&
    snapshot.queuedOrchestrations <= 0
  ) {
    ctx.ui.setStatus?.(statusKey, undefined);
    return;
  }

  ctx.ui.setStatus?.(
    statusKey,
    [
      `LLM実行中:${snapshot.totalActiveLlm}`,
      `(${primaryLabel}:${primaryActive}/${secondaryLabel}:${secondaryActive})`,
      `Req:${snapshot.totalActiveRequests}`,
      `Queue:${snapshot.activeOrchestrations}/${snapshot.limits.maxConcurrentOrchestrations}+${snapshot.queuedOrchestrations}`,
    ].join(" "),
  );
}
