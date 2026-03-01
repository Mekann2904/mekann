/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/runtime-status-panel.tsx
 * @role Dashboard panel showing runtime status and active sessions
 * @why Provide overview of agent execution state at a glance
 * @related dashboard-page.tsx, execution-status-indicator.tsx
 * @public_api RuntimeStatusPanel, CompactRuntimeStatus
 * @invariants Data is fetched via SSE
 * @side_effects None (display only)
 * @failure_modes SSE connection failure handled gracefully
 *
 * @abdd.explain
 * @overview Dashboard widget with gauges and session list
 * @what_it_does Shows active LLM/request counts, utilization bars, and active sessions
 * @why_it_exists Provides centralized runtime monitoring
 * @scope(in) Runtime status from useRuntimeStatus hook
 * @scope(out) Rendered status panel
 */

import { h } from "preact";
import { Activity, Users, Clock, Loader2, Wifi, WifiOff, RefreshCw, Cpu } from "lucide-preact";
import { useRuntimeStatus, type RuntimeSession } from "../hooks/useRuntimeStatus";
import { ExecutionStatusIndicator } from "./execution-status-indicator";
import { cn } from "@/lib/utils";
import {
  TYPOGRAPHY,
  CARD_STYLES,
  PATTERNS,
  SPACING,
  STATE_STYLES,
} from "./layout";

/**
 * Calculate utilization percentage
 */
function calculateUtilization(current: number, max: number | null | undefined): number {
  if (!max || max <= 0) return 0;
  return Math.round((current / max) * 100);
}

/**
 * Get utilization color based on percentage
 */
function getUtilizationColor(percent: number): string {
  if (percent > 80) return "bg-red-500";
  if (percent > 50) return "bg-yellow-500";
  return "bg-green-500";
}

/**
 * Utilization bar component
 */
function UtilizationBar({
  label,
  current,
  max,
  icon: Icon,
}: {
  label: string;
  current: number;
  max: number | null | undefined;
  icon: typeof Activity;
}) {
  const percent = calculateUtilization(current, max);
  const colorClass = getUtilizationColor(percent);

  return (
    <div class={SPACING.element}>
      <div class={cn("flex items-center justify-between", TYPOGRAPHY.muted)}>
        <span class={cn("flex items-center", SPACING.tight)}>
          <Icon class="h-3 w-3" />
          {label}
        </span>
        <span class={PATTERNS.mono}>
          {current}/{max ?? "?"}
        </span>
      </div>
      <div class="h-2 bg-muted rounded-full overflow-hidden">
        <div
          class={cn("h-full transition-all duration-300", colorClass)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div class={cn(TYPOGRAPHY.monoSm, "text-right")}>{percent}%</div>
    </div>
  );
}

/**
 * Runtime status panel component
 * Shows active LLM/request counts, utilization, and active sessions
 * @summary ランタイムステータスパネル
 */
export function RuntimeStatusPanel() {
  const { status, sessions, connected, error, refresh } = useRuntimeStatus();

  // Loading state
  if (!status && !error) {
    return (
      <div class={cn("p-4 text-center", SPACING.element)}>
        <Loader2 class="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        <p class={cn(TYPOGRAPHY.muted, "mt-2")}>Loading runtime status...</p>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div class={cn("p-4 text-center", SPACING.element)}>
        <WifiOff class="h-5 w-5 mx-auto text-red-500" />
        <p class={cn(TYPOGRAPHY.muted, "mt-2", STATE_STYLES.error.text)}>{error}</p>
        <button
          onClick={refresh}
          class={cn("mt-2", TYPOGRAPHY.muted, "hover:text-foreground underline")}
        >
          Retry
        </button>
      </div>
    );
  }

  const activeSessions = sessions.filter(
    (s) => s.status === "running" || s.status === "starting"
  );
  const completedSessions = sessions.filter(
    (s) => s.status === "completed" || s.status === "failed"
  );

  return (
    <div class={cn("p-4", SPACING.section)}>
      {/* Header with connection status */}
      <div class="flex items-center justify-between">
        <h3 class={cn(TYPOGRAPHY.h4, "flex items-center gap-2")}>
          <Cpu class="h-4 w-4" />
          Runtime
        </h3>
        <div class={cn("flex items-center", SPACING.element)}>
          {connected ? (
            <Wifi class="h-3.5 w-3.5 text-green-500" title="Connected" />
          ) : (
            <WifiOff class="h-3.5 w-3.5 text-red-500" title="Disconnected" />
          )}
          <button
            onClick={refresh}
            class="p-1 rounded hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw class="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Warning if agent-runtime unavailable */}
      {status?.warning && (
        <div class={cn(
          "p-2 rounded-md",
          TYPOGRAPHY.muted,
          STATE_STYLES.warning.bg,
          `border ${STATE_STYLES.warning.border}`
        )}>
          {status.warning}
        </div>
      )}

      {/* Utilization gauges */}
      <div class={SPACING.section}>
        <UtilizationBar
          label="Active LLMs"
          current={status?.activeLlm ?? 0}
          max={status?.limits?.maxTotalActiveLlm}
          icon={Activity}
        />
        <UtilizationBar
          label="Active Requests"
          current={status?.activeRequests ?? 0}
          max={status?.limits?.maxTotalActiveRequests}
          icon={Users}
        />
      </div>

      {/* Queue status */}
      {status?.queuedOrchestrations && status.queuedOrchestrations > 0 && (
        <div class={cn("flex items-center gap-2", TYPOGRAPHY.muted)}>
          <Clock class="h-3 w-3" />
          {status.queuedOrchestrations} queued
        </div>
      )}

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div class={SPACING.element}>
          <h4 class={cn(TYPOGRAPHY.label, "flex items-center gap-1")}>
            <Activity class="h-3 w-3" />
            Active ({activeSessions.length})
          </h4>
          <div class={SPACING.element}>
            {activeSessions.slice(0, 5).map((session) => (
              <ExecutionStatusIndicator key={session.id} session={session} />
            ))}
            {activeSessions.length > 5 && (
              <p class={cn(TYPOGRAPHY.monoSm, "text-center")}>
                +{activeSessions.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recently completed sessions */}
      {completedSessions.length > 0 && (
        <details class="group">
          <summary class={cn(TYPOGRAPHY.label, "cursor-pointer hover:text-foreground flex items-center gap-1")}>
            <Clock class="h-3 w-3" />
            Recent ({completedSessions.length})
          </summary>
          <div class={cn("mt-2", SPACING.element)}>
            {completedSessions.slice(0, 10).map((session) => (
              <ExecutionStatusIndicator key={session.id} session={session} />
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {activeSessions.length === 0 && completedSessions.length === 0 && (
        <div class={cn("text-center py-4 text-muted-foreground", SPACING.element)}>
          <Activity class="h-6 w-6 mx-auto opacity-50" />
          <p class={cn(TYPOGRAPHY.muted, "mt-2")}>No active sessions</p>
        </div>
      )}

      {/* Session stats summary */}
      {status?.sessions && (
        <div class={cn(
          TYPOGRAPHY.monoSm,
          "border-t border-border/50 pt-2 flex items-center justify-between"
        )}>
          <span>
            Total: {status.sessions.total}
          </span>
          <span class={cn("flex items-center", SPACING.element)}>
            {status.sessions.starting > 0 && (
              <span class="text-yellow-500">◐ {status.sessions.starting}</span>
            )}
            {status.sessions.running > 0 && (
              <span class="text-blue-500">● {status.sessions.running}</span>
            )}
            {status.sessions.completed > 0 && (
              <span class="text-green-500">✓ {status.sessions.completed}</span>
            )}
            {status.sessions.failed > 0 && (
              <span class="text-red-500">✕ {status.sessions.failed}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact runtime status widget for header/sidebar
 * @summary コンパクト版ランタイムステータス
 */
export function CompactRuntimeStatus() {
  const { status, connected } = useRuntimeStatus();

  const activeCount = status?.sessions?.running ?? status?.activeLlm ?? 0;

  return (
    <div class={cn(
      "flex items-center px-2 py-1 rounded-md bg-muted/30",
      SPACING.element,
      TYPOGRAPHY.muted
    )}>
      {connected ? (
        <Wifi class="h-3 w-3 text-green-500" />
      ) : (
        <WifiOff class="h-3 w-3 text-red-500" />
      )}
      <span>{activeCount} active</span>
    </div>
  );
}
