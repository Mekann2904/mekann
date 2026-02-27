/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/kanban-task-card.tsx
 * @role Draggable task card for GitHub-style Kanban board with subtask progress
 * @why Render compact GitHub-style task card with drag support
 * @related tasks-page.tsx, task-detail-panel.tsx
 * @public_api KanbanTaskCard, Task, TaskStatus, TaskPriority
 * @invariants Task data is immutable during render
 * @side_effects Calls onClick, drag callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview GitHub Projects style compact card with subtask progress
 * @what_it_does Shows task title, description preview, priority label, tags, assignee, subtask progress
 * @why_it_exists Familiar GitHub UX with hierarchical task support
 * @scope(in) Task data, subtask progress, callbacks, drag state
 * @scope(out) Rendered card with drag support and progress bar
 */

import { h } from "preact";
import { GripVertical, Calendar, Trash2, CheckCircle2, Circle } from "lucide-preact";
import { cn } from "@/lib/utils";
import type { RuntimeSession } from "../hooks/useRuntimeStatus";
import { ExecutionStatusIndicator } from "./execution-status-indicator";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentTaskId?: string;
}

interface KanbanTaskCardProps {
  task: Task;
  subtaskProgress?: { completed: number; total: number } | null;
  isSubtask?: boolean;
  /** Active runtime session for this task (optional) */
  session?: RuntimeSession;
  onClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  onDelete?: () => void;
  isDragging?: boolean;
  isSelected?: boolean;
}

// GitHub label colors
const PRIORITY_COLORS: Record<TaskPriority, { bg: string; text: string }> = {
  urgent: { bg: "#b60205", text: "#ffffff" },
  high: { bg: "#d93f0b", text: "#ffffff" },
  medium: { bg: "#fbca04", text: "#000000" },
  low: { bg: "#cfd3d7", text: "#000000" },
};

// Priority labels
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Tag color palette (GitHub style)
const TAG_COLORS = [
  "#1d76db", "#0e8a16", "#d93f0b", "#5319e7", 
  "#fbca04", "#bfd4f2", "#bfdadc", "#c5def5",
];

// Format description preview (strip markdown, truncate)
function formatDescriptionPreview(description: string | undefined, maxLength: number = 80): string | null {
  if (!description) return null;
  
  const stripped = description
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`]+`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_~>`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  
  if (stripped.length === 0) return null;
  return stripped.length > maxLength ? stripped.slice(0, maxLength) + "..." : stripped;
}

function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return { bg: color, text: brightness > 128 ? "#000000" : "#ffffff" };
}

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "#1d76db", "#0e8a16", "#d93f0b", "#5319e7",
    "#e99695", "#f9d0c4", "#fef2c0", "#c2e0c6",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function KanbanTaskCard({
  task,
  subtaskProgress,
  isSubtask,
  session,
  onClick,
  onDragStart,
  onDragEnd,
  onDelete,
  isDragging,
  isSelected,
}: KanbanTaskCardProps) {
  const priorityColor = PRIORITY_COLORS[task.priority];
  const priorityLabel = PRIORITY_LABELS[task.priority];
  const descriptionPreview = formatDescriptionPreview(task.description);
  const isOverdue =
    task.dueDate &&
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    new Date(task.dueDate) < new Date();

  const handleDragStart = (e: DragEvent) => {
    e.stopPropagation();
    onDragStart?.(e);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      class={cn(
        "group relative bg-card rounded-md border border-border cursor-pointer",
        "transition-all duration-150",
        "hover:border-primary/30 hover:shadow-sm",
        isDragging && "opacity-50 scale-[0.98]",
        isSelected && "ring-2 ring-primary border-primary/50",
        task.status === "completed" && "opacity-60"
      )}
    >
      {/* Drag handle */}
      <div class="absolute left-0 top-0 bottom-0 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical class="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>

      {/* Delete button - hover only */}
      {onDelete && (
        <button
          class="absolute right-1 top-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500 text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete task"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      )}

      {/* Content */}
      <div class="p-2.5 pl-6">
        {/* Title */}
        <p
          class={cn(
            "text-[15px] font-medium leading-snug mb-1.5",
            task.status === "completed" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </p>

        {/* Subtask progress - GitHub style (only for parent tasks) */}
        {!isSubtask && subtaskProgress && subtaskProgress.total > 0 && (
          <div class="flex items-center gap-1.5 mb-2">
            <div class="flex items-center gap-1">
              {subtaskProgress.completed === subtaskProgress.total ? (
                <CheckCircle2 class="h-3 w-3 text-green-500" />
              ) : (
                <Circle class="h-3 w-3 text-muted-foreground" />
              )}
              <span class="text-[10px] text-muted-foreground">
                {subtaskProgress.completed}/{subtaskProgress.total} subtasks
              </span>
            </div>
            {/* Progress bar */}
            <div class="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all"
                style={{ width: `${(subtaskProgress.completed / subtaskProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Description preview */}
        {descriptionPreview && (
          <p class="text-[12px] text-muted-foreground/80 leading-relaxed line-clamp-2 mb-2">
            {descriptionPreview}
          </p>
        )}

        {/* Meta info (priority label, tags, due date, assignee) */}
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {/* Priority label */}
            <span
              class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}
            >
              {priorityLabel}
            </span>

            {/* Tags */}
            {task.tags.slice(0, 2).map((tag) => {
              const tagColor = getTagColor(tag);
              return (
                <span
                  key={tag}
                  class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium truncate max-w-[80px]"
                  style={{ backgroundColor: tagColor.bg, color: tagColor.text }}
                  title={tag}
                >
                  {tag}
                </span>
              );
            })}
            {task.tags.length > 2 && (
              <span class="text-[10px] text-muted-foreground">+{task.tags.length - 2}</span>
            )}

            {/* Due date */}
            {task.dueDate && (
              <span
                class={cn(
                  "flex items-center gap-0.5 text-[10px] text-muted-foreground",
                  isOverdue && "text-red-500"
                )}
              >
                <Calendar class="h-3 w-3" />
                {new Date(task.dueDate).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>

          {/* Assignee avatar */}
          {task.assignee && (
            <div
              class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-white shrink-0"
              style={{ backgroundColor: getAvatarColor(task.assignee) }}
              title={task.assignee}
            >
              {getInitials(task.assignee)}
            </div>
          )}
        </div>

        {/* Execution status indicator (if session provided) */}
        {session && (session.status === "running" || session.status === "starting") && (
          <div class="mt-2 border-t border-border/50 pt-2">
            <ExecutionStatusIndicator session={session} compact />
          </div>
        )}
      </div>
    </div>
  );
}
