/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/kanban-task-card.tsx
 * @role Draggable task card for Kanban board
 * @why Render compact task card with drag support
 * @related tasks-page.tsx, task-form.tsx
 * @public_api KanbanTaskCard, Task, TaskStatus, TaskPriority
 * @invariants Task data is immutable during render
 * @side_effects Calls onComplete, onDelete, onEdit, drag callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview Compact draggable card for Kanban columns
 * @what_it_does Shows task title, priority, tags with drag handle
 * @why_it_exists Optimized for vertical Kanban layout
 * @scope(in) Task data, callbacks, drag state
 * @scope(out) Rendered card with drag support
 */

import { h } from "preact";
import { CheckCircle2, Circle, Clock, AlertTriangle, GripVertical, Calendar, Edit, Trash2 } from "lucide-preact";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

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
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (task: Task) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
  isDragging?: boolean;
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; bgColor: string; label: string }> = {
  low: { color: "bg-slate-400", bgColor: "bg-slate-400/10", label: "L" },
  medium: { color: "bg-yellow-400", bgColor: "bg-yellow-400/10", label: "M" },
  high: { color: "bg-orange-400", bgColor: "bg-orange-400/10", label: "H" },
  urgent: { color: "bg-red-400", bgColor: "bg-red-400/10", label: "!" },
};

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: AlertTriangle,
  failed: AlertTriangle,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "text-slate-400",
  in_progress: "text-blue-400",
  completed: "text-green-400",
  cancelled: "text-slate-500",
  failed: "text-red-400",
};

export function KanbanTaskCard({
  task,
  onComplete,
  onDelete,
  onEdit,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanTaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const StatusIcon = STATUS_ICONS[task.status];
  const isOverdue =
    task.dueDate &&
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    new Date(task.dueDate) < new Date();

  const handleDragStart = (e: DragEvent) => {
    onDragStart?.(e);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      class={cn(
        "group relative bg-card rounded-lg border border-border p-3 cursor-grab active:cursor-grabbing",
        "transition-all hover:shadow-md hover:border-primary/30",
        isDragging && "opacity-50 rotate-2 scale-105 shadow-lg",
        task.status === "completed" && "opacity-60",
        isOverdue && "border-red-500/30 hover:border-red-500/50"
      )}
    >
      {/* Drag handle + Priority */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-1.5">
          {/* Drag handle */}
          <GripVertical class="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
          
          {/* Priority badge */}
          <span
            class={cn(
              "inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-white",
              priorityConfig.color
            )}
            title={`${task.priority} priority`}
          >
            {priorityConfig.label}
          </span>
        </div>

        {/* Actions (visible on hover) */}
        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {task.status !== "completed" && (
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6 hover:text-green-500"
              onClick={() => onComplete?.(task.id)}
              title="Mark complete"
            >
              <CheckCircle2 class="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            onClick={() => onEdit?.(task)}
            title="Edit"
          >
            <Edit class="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 hover:text-destructive"
            onClick={() => onDelete?.(task.id)}
            title="Delete"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Title */}
      <h4
        class={cn(
          "text-sm font-medium leading-snug mb-2",
          task.status === "completed" && "line-through text-muted-foreground"
        )}
      >
        {task.title}
      </h4>

      {/* Description preview */}
      {task.description && (
        <p class="text-xs text-muted-foreground line-clamp-2 mb-2">
          {task.description}
        </p>
      )}

      {/* Meta info */}
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {/* Due date */}
        {task.dueDate && (
          <span
            class={cn(
              "flex items-center gap-1",
              isOverdue && "text-red-400"
            )}
          >
            <Calendar class="h-3 w-3" />
            {new Date(task.dueDate).toLocaleDateString("ja-JP", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}

        {/* Assignee */}
        {task.assignee && (
          <span class="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded">
            {task.assignee.slice(0, 2)}
          </span>
        )}
      </div>

      {/* Tags */}
      {task.tags.length > 0 && (
        <div class="flex flex-wrap gap-1 mt-2">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              class="inline-block px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded truncate max-w-[80px]"
              title={tag}
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span class="text-xs text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Subtask indicator */}
      {task.parentTaskId && (
        <div class="absolute top-2 right-2">
          <span class="text-xs text-muted-foreground/50">sub</span>
        </div>
      )}
    </div>
  );
}
