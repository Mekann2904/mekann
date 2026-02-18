/**
 * @abdd.meta
 * path: .pi/extensions/shared/runtime-helpers.ts
 * role: ランタイム共通ヘルパーユーティリティ
 * why: subagents.tsとagent-teams.tsで一貫したランタイムエラーメッセージと予約管理を提供するため
 * related: subagents.ts, agent-teams.ts, agent-runtime.ts, extensions-context.ts
 * public_api: buildRuntimeLimitError, buildRuntimeQueueWaitError, startReservationHeartbeat, RuntimeLimitErrorOptions, RuntimeQueueWaitInfo
 * invariants: ハートビート間隔は5000ms固定、エラーメッセージは現在値と上限値の両方を含む
 * side_effects: startReservationHeartbeatはsetIntervalを生成しタイマーを登録する、getRuntimeSnapshotを通じてランタイム状態を参照する
 * failure_modes: reservation.heartbeat()の失敗は無視される、存在しないreservation渡しでハートビート呼び出し失敗
 * @abdd.explain
 * overview: エージェントランタイムの制限・キューエラー通知と予約維持を行う共有ユーティリティ
 * what_it_does:
 *   - ランタイム制限到達時のエラーメッセージを構築する
 *   - オーケストレーションキュー待機時のエラーメッセージを構築する
 *   - 予約リースのTTLを定期的に延長するハートビートを開始・停止する
 * why_it_exists:
 *   - 複数のエージェント種別で同一フォーマットのエラーメッセージを使い回すため
 *   - ゾンビ予約による容量リークを防ぐため自動的にTTLを延長する仕組みが必要
 * scope:
 *   in: ツール名、制限理由、待機情報、予約リース
 *   out: フォーマット済みエラーメッセージ文字列、ハートビート停止関数
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
  * 実行制限エラーのオプション。
  * @param waitedMs 待機時間（ミリ秒）。
  * @param timedOut タイムアウトしたかどうか。
  */
export interface RuntimeLimitErrorOptions {
  waitedMs?: number;
  timedOut?: boolean;
}

 /**
  * キューエラーメッセージ構築用情報
  * @param waitedMs 待機時間（ミリ秒）。
  * @param attempts 試行回数。
  * @param timedOut タイムアウトしたかどうか。
  * @param aborted 中断されたかどうか。
  * @param queuePosition キュー内の位置。
  * @param queuedAhead 自分より前のキュー数。
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
  * 実行時制限エラーメッセージを生成する
  * @param toolName - ブロックされたツール名
  * @param reasons - 理由の文字列配列
  * @param options - 待機時間などのオプション情報
  * @returns フォーマットされたエラーメッセージ文字列
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
  * オーケストレーションキュー待機のエラーメッセージを生成します。
  * @param toolName - ブロックされたツールの名前
  * @param queueWait - キュー待機情報
  * @returns フォーマットされたエラーメッセージ文字列
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
  * 予約を維持するハートビートを開始する
  * @param reservation 維持する予約リース
  * @returns ハートビートを停止するクリーンアップ関数
  */
export function startReservationHeartbeat(
  reservation: RuntimeCapacityReservationLease,
): () => void {
  // 期限切れによるゾンビ予約を防ぐため、実行中は定期的にTTLを延長する。
  const intervalMs = 5_000;
  const timer = setInterval(() => {
    try {
      reservation.heartbeat();
    } catch {
      // noop
    }
  }, intervalMs);
  timer.unref?.();
  return () => {
    clearInterval(timer);
  };
}

 /**
  * ランタイムステータス表示を更新する
  * @param ctx - UI機能を持つ拡張機能コンテキスト
  * @param statusKey - 使用するステータスキー ("subagent-runtime" または "agent-team-runtime")
  * @param primaryLabel - プライマリエージェントの表示ラベル
  * @param primaryActive - プライマリエージェントのアクティブ数
  * @param secondaryLabel - セカンダリエージェントの表示ラベル
  * @param secondaryActive - セカンダリエージェントのアクティブ数
  * @returns なし
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
