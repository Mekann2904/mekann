/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/execution-status-indicator.tsx
 * @role Visual indicator for agent execution status on Kanban cards
 * @why Show real-time execution progress and status to users
 * @related kanban-task-card.tsx, runtime-status-panel.tsx
 * @public_api ExecutionStatusIndicator
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
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    label: "Starting",
  },
  running: {
    icon: Loader2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Running",
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
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
          "flex items-center gap-1.5 px-2 py-1 rounded",
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
        <span class="text-[10px] font-medium text-foreground/80 truncate max-w-[100px]">
          {getAgentDisplayName(session)}
        </span>
        {session.status === "running" && typeof session.progress === "number" && (
          <span class="text-[9px] text-muted-foreground">
            {session.progress}%
          </span>
        )}
        {duration && (
          <span class="text-[9px] text-muted-foreground ml-auto">
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
        "flex flex-col gap-1.5 p-2.5 rounded-md border border-border/50",
        config.bgColor,
        className
      )}
    >
      {/* Header: icon, agent name, status */}
      <div class="flex items-center gap-2">
        <Icon
          class={cn(
            "h-4 w-4",
            config.color,
            config.animate && "animate-spin"
          )}
        />
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="text-xs font-medium truncate">
            {getAgentDisplayName(session)}
          </span>
          {session.type === "agent-team" && session.teammateCount && (
            <span class="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Users class="h-3 w-3" />
              {session.teammateCount}
            </span>
          )}
        </div>
        <span class={cn("text-[10px] font-medium", config.color)}>
          {config.label}
        </span>
      </div>

      {/* Task title (if available) */}
      {session.taskTitle && (
        <p class="text-[11px] text-muted-foreground truncate">
          {session.taskTitle}
        </p>
      )}

      {/* Progress bar (for running sessions) */}
      {session.status === "running" && typeof session.progress === "number" && (
        <div class="space-y-0.5">
          <div class="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, session.progress))}%` }}
            />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-muted-foreground">
              {session.progress}%
            </span>
            {duration && (
              <span class="text-[10px] text-muted-foreground">{duration}</span>
            )}
          </div>
        </div>
      )}

      {/* Status message (if available) */}
      {session.message && (
        <p class="text-[10px] text-muted-foreground line-clamp-2">
          {session.message}
        </p>
      )}

      {/* Duration for starting/completed/failed */}
      {session.status !== "running" && duration && (
        <span class="text-[10px] text-muted-foreground">
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
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
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
      <span class={cn("text-[10px] font-medium", config.color)}>
        {config.label}
      </span>
    </span>
  );
}
