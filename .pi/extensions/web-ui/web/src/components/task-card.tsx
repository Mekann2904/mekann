/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/task-card.tsx
 * @role Individual task card component for display
 * @why Render task information with status, priority, and actions
 * @related tasks-page.tsx, task-form.tsx
 * @public_api TaskCard
 * @invariants Task data is immutable during render
 * @side_effects Calls onComplete, onDelete, onEdit callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview Card component displaying a single task
 * @what_it_does Shows task title, description, status, priority, tags, due date, actions
 * @why_it_exists Reusable component for task list display
 * @scope(in) Task data, callbacks
 * @scope(out) Rendered card with action buttons
 */

import { h } from "preact";
import { CheckCircle2, Circle, Clock, AlertTriangle, Trash2, Edit, Calendar, User, Tag } from "lucide-preact";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";

export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

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

interface TaskCardProps {
  task: Task;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (task: Task) => void;
}

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "text-green-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

const PRIORITY_BG: Record<TaskPriority, string> = {
  low: "bg-green-500/10",
  medium: "bg-yellow-500/10",
  high: "bg-orange-500/10",
  urgent: "bg-red-500/10",
};

const STATUS_CONFIG: Record<TaskStatus, { icon: typeof Circle; label: string; color: string }> = {
  todo: { icon: Circle, label: "To Do", color: "text-muted-foreground" },
  in_progress: { icon: Clock, label: "In Progress", color: "text-blue-500" },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-green-500" },
  cancelled: { icon: AlertTriangle, label: "Cancelled", color: "text-red-500" },
};

export function TaskCard({ task, onComplete, onDelete, onEdit }: TaskCardProps) {
  const statusConfig = STATUS_CONFIG[task.status];
  const StatusIcon = statusConfig.icon;
  const isOverdue = task.dueDate && 
    task.status !== "completed" && 
    task.status !== "cancelled" && 
    new Date(task.dueDate) < new Date();

  return (
    <Card 
      class={cn(
        "transition-all hover:shadow-md",
        task.status === "completed" && "opacity-60",
        isOverdue && "border-red-500/50"
      )}
    >
      <CardContent class="p-4">
        <div class="flex items-start gap-3">
          {/* Status indicator */}
          <button
            onClick={() => task.status !== "completed" && onComplete?.(task.id)}
            disabled={task.status === "completed"}
            class={cn(
              "mt-0.5 shrink-0",
              task.status === "completed" ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"
            )}
          >
            <StatusIcon class={cn("h-5 w-5", statusConfig.color)} />
          </button>

          {/* Main content */}
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <h3 class={cn(
                "font-medium text-sm leading-tight",
                task.status === "completed" && "line-through text-muted-foreground"
              )}>
                {task.title}
              </h3>
              
              {/* Priority badge */}
              <span class={cn(
                "shrink-0 text-xs px-2 py-0.5 rounded font-medium",
                PRIORITY_BG[task.priority],
                PRIORITY_COLORS[task.priority]
              )}>
                {task.priority}
              </span>
            </div>

            {/* Description */}
            {task.description && (
              <p class="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Meta info */}
            <div class="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              {/* Due date */}
              {task.dueDate && (
                <span class={cn(
                  "flex items-center gap-1",
                  isOverdue && "text-red-500"
                )}>
                  <Calendar class="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString("ja-JP", {
                    month: "short",
                    day: "numeric",
                  })}
                  {isOverdue && " (overdue)"}
                </span>
              )}

              {/* Assignee */}
              {task.assignee && (
                <span class="flex items-center gap-1">
                  <User class="h-3 w-3" />
                  {task.assignee}
                </span>
              )}

              {/* Tags */}
              {task.tags.length > 0 && (
                <span class="flex items-center gap-1">
                  <Tag class="h-3 w-3" />
                  {task.tags.slice(0, 3).join(", ")}
                  {task.tags.length > 3 && ` +${task.tags.length - 3}`}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div class="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              onClick={() => onEdit?.(task)}
              title="Edit task"
            >
              <Edit class="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete?.(task.id)}
              title="Delete task"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
