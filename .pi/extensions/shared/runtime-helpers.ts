/**
 * Shared runtime helper utilities.
 * Used by both subagents.ts and agent-teams.ts for consistent runtime behavior.
 */

import {
  getRuntimeSnapshot,
  type RuntimeCapacityReservationLease,
} from "../agent-runtime.js";

/**
 * Options for building runtime limit error messages.
 */
export interface RuntimeLimitErrorOptions {
  waitedMs?: number;
  timedOut?: boolean;
}

/**
 * Queue wait information for building queue wait error messages.
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
 * Build an error message for runtime limit reached conditions.
 * @param toolName - Name of the tool that was blocked
 * @param reasons - Array of reason strings
 * @param options - Optional wait time information
 * @returns Formatted error message string
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
 * Build an error message for orchestration queue wait conditions.
 * @param toolName - Name of the tool that was blocked
 * @param queueWait - Queue wait information
 * @returns Formatted error message string
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
 * Start a heartbeat timer to keep a reservation alive during long-running operations.
 * @param reservation - The reservation lease to keep alive
 * @returns Cleanup function to stop the heartbeat
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
 * Refresh runtime status display in the UI.
 * @param ctx - Extension context with UI capabilities
 * @param statusKey - Status key to use ("subagent-runtime" or "agent-team-runtime")
 * @param primaryLabel - Primary agent label for display
 * @param primaryActive - Primary agent active count
 * @param secondaryLabel - Secondary agent label for display
 * @param secondaryActive - Secondary agent active count
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
