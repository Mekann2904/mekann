/**
 * @abdd.meta
 * path: .pi/extensions/shared/runtime-helpers.ts
 * role: ランタイム制限・キュー待機のエラーメッセージ生成と、リソース予約維持機能の提供
 * why: subagents.tsとagent-teams.tsでランタイム動作を一貫させるため
 * related: ../agent-runtime.js, subagents.ts, agent-teams.ts
 * public_api: RuntimeLimitErrorOptions, RuntimeQueueWaitInfo, buildRuntimeLimitError, buildRuntimeQueueWaitError, startReservationHeartbeat
 * invariants: buildRuntimeLimitErrorはgetRuntimeSnapshotから最新情報を取得する、startReservationHeartbeatは5秒間隔でheartbeatを実行する
 * side_effects: startReservationHeartbeatはタイマーを起動し、reservation.heartbeatを呼び出す
 * failure_modes: リソース取得失敗時、heartbeat呼び出し時の例外は連続3回で自動停止、FinalizationRegistryによるクリーンアップ保証
 * @abdd.explain
 * overview: エージェント実行時のリソース制限やオーケストレーションキューエラーを通知するためのユーティリティ。
 * what_it_does:
 *   - 現在のリソース使用状況と制限値を含むエラーメッセージを生成する
 *   - キュー待機状況（待ち時間、順位、試行回数）を含むエラーメッセージを生成する
 *   - リソース予約を維持するための定期的ハートビートタイマーを開始・停止する
 * why_it_exists:
 *   - 複数のエージェント種別（subagents, agent-teams）間でエラーハンドリングロジックを共通化するため
 *   - リソース枯渇時やキュー拥堵時にユーザーへ復旧手順を明示するため
 *   - 期限切れによるリソース予約の消失を防ぐため
 * scope:
 *   in: ツール名、理由配列、待機情報、予約リースオブジェクト
 * out: フォーマットされたエラーメッセージ文字列、タイマー停止用クリーンアップ関数
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
