/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/kanban-task-card.tsx
 * @role Draggable task card for GitHub-style Kanban board
 * @why Render compact GitHub-style task card with drag support
 * @related tasks-page.tsx, task-detail-panel.tsx
 * @public_api KanbanTaskCard, Task, TaskStatus, TaskPriority
 * @invariants Task data is immutable during render
 * @side_effects Calls onClick, drag callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview GitHub Projects style compact card
 * @what_it_does Shows task title, labels (priority, tags), assignee avatar
 * @why_it_exists Familiar GitHub UX
 * @scope(in) Task data, callbacks, drag state
 * @scope(out) Rendered card with drag support
 */

import { h } from "preact";
import { GripVertical, Calendar } from "lucide-preact";
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
  onClick?: () => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: (e: DragEvent) => void;
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

// Status colors for subtle indicators
const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-slate-500",
  failed: "bg-red-500",
};

// Tag color palette (GitHub style)
const TAG_COLORS = [
  "#1d76db", "#0e8a16", "#d93f0b", "#5319e7", 
  "#fbca04", "#bfd4f2", "#bfdadc", "#c5def5",
];

function getTagColor(tag: string): { bg: string; text: string } {
  // Generate consistent color based on tag name
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  // Determine text color based on background brightness
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
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  isSelected,
}: KanbanTaskCardProps) {
  const priorityColor = PRIORITY_COLORS[task.priority];
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

      {/* Content */}
      <div class="p-2.5 pl-6">
        {/* Title */}
        <p
          class={cn(
            "text-sm leading-snug mb-2",
            task.status === "completed" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </p>

        {/* Labels row */}
        <div class="flex flex-wrap gap-1 mb-2">
          {/* Tags */}
          {task.tags.slice(0, 3).map((tag) => {
            const tagColor = getTagColor(tag);
            return (
              <span
                key={tag}
                class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium truncate max-w-[100px]"
                style={{ backgroundColor: tagColor.bg, color: tagColor.text }}
                title={tag}
              >
                {tag}
              </span>
            );
          })}
          {task.tags.length > 3 && (
            <span class="text-[10px] text-muted-foreground">+{task.tags.length - 3}</span>
          )}
        </div>

        {/* Footer: due date + assignee */}
        <div class="flex items-center justify-between">
          {/* Due date */}
          {task.dueDate && (
            <span
              class={cn(
                "flex items-center gap-1 text-[11px] text-muted-foreground",
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

          {/* Assignee avatar */}
          {task.assignee && (
            <div
              class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-white ml-auto"
              style={{ backgroundColor: getAvatarColor(task.assignee) }}
              title={task.assignee}
            >
              {getInitials(task.assignee)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
