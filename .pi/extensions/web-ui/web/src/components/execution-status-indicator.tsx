/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/execution-status-indicator.tsx
 * @role Visual indicator for agent execution status on Kanban cards
 * @why Show real-time execution progress and status to users
 * @related kanban-task-card.tsx, runtime-status-panel.tsx
 * @public_api ExecutionStatusIndicator, MiniProgressBar, StatusBadge
 * @invariants Session data is immutable during render
 * @side_effects None (display only)
 * @failure_modes None (graceful fallback for missing data)
 *
 * @abdd.explain
 * @overview Compact execution status display with progress bar
 * @what_it_does Shows agent icon, name, status, and progress bar
 * @why_it_exists Provides at-a-glance execution status on Kanban cards
 * @scope(in) RuntimeSession data
 * @scope(out) Rendered status indicator
 */

import { h } from "preact";
import { Loader2, CheckCircle2, XCircle, Clock, Users } from "lucide-preact";
import { cn } from "@/lib/utils";
import type { RuntimeSession, RuntimeSessionStatus } from "../hooks/useRuntimeStatus";
import {
  TYPOGRAPHY,
  PATTERNS,
  SPACING,
  STATE_STYLES,
} from "./layout";

interface ExecutionStatusIndicatorProps {
  /** Session data */
  session: RuntimeSession;
  /** Compact mode for card display */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Status configuration with icon, color, and label
 */
const STATUS_CONFIG: Record<
  RuntimeSessionStatus,
  {
    icon: typeof Loader2;
    color: string;
    bgColor: string;
    label: string;
    animate?: boolean;
  }
> = {
  starting: {
    icon: Clock,
    color: STATE_STYLES.warning.text,
    bgColor: STATE_STYLES.warning.bg,
    label: "Starting",
  },
  running: {
    icon: Loader2,
    color: STATE_STYLES.info.text,
    bgColor: STATE_STYLES.info.bg,
    label: "Running",
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    color: STATE_STYLES.success.text,
    bgColor: STATE_STYLES.success.bg,
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: STATE_STYLES.error.text,
    bgColor: STATE_STYLES.error.bg,
    label: "Failed",
  },
};

/**
 * Format duration from start time
 * @summary 実行時間フォーマット
 * @param startedAt - 開始時刻（Unix timestamp）
 * @returns フォーマット済み時間文字列
 */
function formatDuration(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Get agent display name with type indicator
 * @summary エージェント表示名取得
 * @param session - セッション
 * @returns 表示用エージェント名
 */
function getAgentDisplayName(session: RuntimeSession): string {
  if (session.type === "agent-team") {
    return session.teamId || "Team";
  }
  return session.agentId;
}

/**
 * Execution status indicator component
 * Shows agent execution status with progress bar
 * @summary 実行状態インジケータ
 */
export function ExecutionStatusIndicator({
  session,
  compact = false,
  className,
}: ExecutionStatusIndicatorProps) {
  const config = STATUS_CONFIG[session.status];
  const Icon = config.icon;
  const duration = session.status === "running" || session.status === "starting"
    ? formatDuration(session.startedAt)
    : null;

  // Compact mode: single line with icon and agent name
  if (compact) {
    return (
      <div
        class={cn(
          "flex items-center px-2 py-1 rounded",
          SPACING.element,
          config.bgColor,
          className
        )}
      >
        <Icon
          class={cn(
            "h-3 w-3",
            config.color,
            config.animate && "animate-spin"
          )}
        />
        <span class={cn(TYPOGRAPHY.monoSm, "text-foreground/80 truncate max-w-[100px]")}>
          {getAgentDisplayName(session)}
        </span>
        {session.status === "running" && typeof session.progress === "number" && (
          <span class={TYPOGRAPHY.monoSm}>
            {session.progress}%
          </span>
        )}
        {duration && (
          <span class={cn(TYPOGRAPHY.monoSm, "ml-auto")}>
            {duration}
          </span>
        )}
      </div>
    );
  }

  // Full mode: detailed status with progress bar
  return (
    <div
      class={cn(
        "flex flex-col p-2.5 rounded-md border border-border/50",
        SPACING.element,
        config.bgColor,
        className
      )}
    >
      {/* Header: icon, agent name, status */}
      <div class={cn("flex items-center", SPACING.element)}>
        <Icon
          class={cn(
            "h-4 w-4",
            config.color,
            config.animate && "animate-spin"
          )}
        />
        <div class={cn("flex items-center flex-1 min-w-0", SPACING.element)}>
          <span class={cn(TYPOGRAPHY.body, "truncate")}>
            {getAgentDisplayName(session)}
          </span>
          {session.type === "agent-team" && session.teammateCount && (
            <span class={cn("flex items-center", SPACING.tight, TYPOGRAPHY.muted)}>
              <Users class="h-3 w-3" />
              {session.teammateCount}
            </span>
          )}
        </div>
        <span class={cn(TYPOGRAPHY.monoSm, "font-medium", config.color)}>
          {config.label}
        </span>
      </div>

      {/* Task title (if available) */}
      {session.taskTitle && (
        <p class={cn(TYPOGRAPHY.muted, "truncate")}>
          {session.taskTitle}
        </p>
      )}

      {/* Progress bar (for running sessions) */}
      {session.status === "running" && typeof session.progress === "number" && (
        <div class={SPACING.tight}>
          <div class="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, session.progress))}%` }}
            />
          </div>
          <div class="flex items-center justify-between">
            <span class={TYPOGRAPHY.monoSm}>
              {session.progress}%
            </span>
            {duration && (
              <span class={TYPOGRAPHY.monoSm}>{duration}</span>
            )}
          </div>
        </div>
      )}

      {/* Status message (if available) */}
      {session.message && (
        <p class={cn(TYPOGRAPHY.monoSm, "line-clamp-2")}>
          {session.message}
        </p>
      )}

      {/* Duration for starting/completed/failed */}
      {session.status !== "running" && duration && (
        <span class={TYPOGRAPHY.monoSm}>
          {session.status === "starting" ? `Waiting ${duration}` : duration}
        </span>
      )}
    </div>
  );
}

/**
 * Mini progress bar for compact display
 * @summary ミニプログレスバー
 */
export function MiniProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div class={cn("h-0.5 bg-muted rounded-full overflow-hidden", className)}>
      <div
        class="h-full bg-blue-500 transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}

/**
 * Status badge for display in lists
 * @summary ステータスバッジ
 */
export function StatusBadge({
  status,
  size = "sm",
}: {
  status: RuntimeSessionStatus;
  size?: "xs" | "sm" | "md";
}) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const sizeClasses = {
    xs: "h-3 w-3",
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
  };

  return (
    <span
      class={cn(
        PATTERNS.badge,
        "rounded-full",
        SPACING.tight,
        config.bgColor
      )}
    >
      <Icon
        class={cn(
          sizeClasses[size],
          config.color,
          config.animate && "animate-spin"
        )}
      />
      <span class={cn(TYPOGRAPHY.monoSm, config.color)}>
        {config.label}
      </span>
    </span>
  );
}
