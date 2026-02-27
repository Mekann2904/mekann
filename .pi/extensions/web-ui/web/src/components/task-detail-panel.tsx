/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/task-detail-panel.tsx
 * @role Side panel for task details (GitHub style)
 * @why Provide detailed view and editing without modal
 * @related tasks-page.tsx, kanban-task-card.tsx
 * @public_api TaskDetailPanel
 * @invariants Task data is controlled by parent
 * @side_effects Calls onUpdate, onDelete, onStatusChange callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview GitHub Projects style side panel
 * @what_it_does Shows task details, allows inline editing
 * @why_it_exists Non-modal editing experience
 * @scope(in) Task data, callbacks
 * @scope(out) Rendered panel with edit forms
 */

import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { X, Calendar, User, Tag, Trash2, CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "./kanban-task-card";

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
}

// Status options
const STATUS_OPTIONS: { value: TaskStatus; label: string; icon: typeof Circle }[] = [
  { value: "todo", label: "Todo", icon: Circle },
  { value: "in_progress", label: "In Progress", icon: Clock },
  { value: "completed", label: "Done", icon: CheckCircle2 },
  { value: "cancelled", label: "Cancelled", icon: AlertTriangle },
  { value: "failed", label: "Failed", icon: AlertTriangle },
];

// Priority options with GitHub colors
const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "#b60205" },
  { value: "high", label: "High", color: "#d93f0b" },
  { value: "medium", label: "Medium", color: "#fbca04" },
  { value: "low", label: "Low", color: "#cfd3d7" },
];

export function TaskDetailPanel({
  task,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
}: TaskDetailPanelProps) {
  const [editedTask, setEditedTask] = useState(task);
  const [newTag, setNewTag] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Sync with prop changes
  useEffect(() => {
    setEditedTask(task);
  }, [task]);

  // Focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Focus description when editing
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [isEditingDescription]);

  const updateField = <K extends keyof Task>(key: K, value: Task[K]) => {
    const updated = { ...editedTask, [key]: value };
    setEditedTask(updated);
    onUpdate(updated);
  };

  const addTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !editedTask.tags.includes(trimmed)) {
      updateField("tags", [...editedTask.tags, trimmed]);
      setNewTag("");
    }
  };

  const removeTag = (tag: string) => {
    updateField(
      "tags",
      editedTask.tags.filter((t) => t !== tag)
    );
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (editedTask.title.trim() !== task.title) {
      onUpdate(editedTask);
    }
  };

  const handleDescriptionBlur = () => {
    setIsEditingDescription(false);
    if (editedTask.description !== task.description) {
      onUpdate(editedTask);
    }
  };

  const isOverdue =
    editedTask.dueDate &&
    editedTask.status !== "completed" &&
    editedTask.status !== "cancelled" &&
    new Date(editedTask.dueDate) < new Date();

  return (
    <div class="w-[360px] shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <span class="text-xs text-muted-foreground font-mono">#{task.id.slice(0, 7)}</span>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Delete this task?")) {
                onDelete();
              }
            }}
            title="Delete task"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" class="h-7 w-7" onClick={onClose}>
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editedTask.title}
              onInput={(e) => setEditedTask({ ...editedTask, title: (e.target as HTMLInputElement).value })}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleTitleBlur();
                } else if (e.key === "Escape") {
                  setEditedTask({ ...editedTask, title: task.title });
                  setIsEditingTitle(false);
                }
              }}
              class="w-full text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
            />
          ) : (
            <h2
              class={cn(
                "text-lg font-semibold cursor-text hover:bg-muted/30 rounded px-1 -mx-1",
                task.status === "completed" && "line-through text-muted-foreground"
              )}
              onClick={() => setIsEditingTitle(true)}
            >
              {editedTask.title}
            </h2>
          )}
        </div>

        {/* Status */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label>
          <div class="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = editedTask.status === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    updateField("status", option.value);
                    onStatusChange(option.value);
                  }}
                  class={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon class="h-3 w-3" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
          <div class="flex flex-wrap gap-1.5">
            {PRIORITY_OPTIONS.map((option) => {
              const isActive = editedTask.priority === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => updateField("priority", option.value)}
                  class={cn(
                    "inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100"
                  )}
                  style={{
                    backgroundColor: option.color,
                    color: option.value === "low" || option.value === "medium" ? "#000" : "#fff",
                    ringColor: isActive ? option.color : undefined,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <Calendar class="h-3 w-3" />
            Due Date
          </label>
          <Input
            type="date"
            value={editedTask.dueDate || ""}
            onInput={(e) => updateField("dueDate", (e.target as HTMLInputElement).value || undefined)}
            class={cn(isOverdue && "border-red-500/50")}
          />
          {isOverdue && (
            <p class="text-xs text-red-500 mt-1">This task is overdue</p>
          )}
        </div>

        {/* Assignee */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <User class="h-3 w-3" />
            Assignee
          </label>
          <Input
            type="text"
            value={editedTask.assignee || ""}
            onInput={(e) => updateField("assignee", (e.target as HTMLInputElement).value || undefined)}
            placeholder="Add assignee..."
          />
        </div>

        {/* Tags */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <Tag class="h-3 w-3" />
            Labels
          </label>
          <div class="flex flex-wrap gap-1.5 mb-2">
            {editedTask.tags.map((tag) => (
              <span
                key={tag}
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  class="hover:text-destructive transition-colors"
                >
                  <X class="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div class="flex gap-2">
            <Input
              type="text"
              value={newTag}
              onInput={(e) => setNewTag((e.target as HTMLInputElement).value)}
              placeholder="Add label..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              class="h-8 text-xs"
            />
            <Button size="sm" class="h-8" onClick={addTag} disabled={!newTag.trim()}>
              Add
            </Button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
          {isEditingDescription ? (
            <textarea
              ref={descriptionRef}
              value={editedTask.description || ""}
              onInput={(e) => setEditedTask({ ...editedTask, description: (e.target as HTMLTextAreaElement).value })}
              onBlur={handleDescriptionBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditedTask({ ...editedTask, description: task.description });
                  setIsEditingDescription(false);
                }
              }}
              placeholder="Add a description..."
              rows={4}
              class={cn(
                "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
              )}
            />
          ) : (
            <div
              class={cn(
                "min-h-[80px] rounded-md border border-transparent hover:border-border px-3 py-2 text-sm cursor-text",
                !editedTask.description && "text-muted-foreground/50 italic"
              )}
              onClick={() => setIsEditingDescription(true)}
            >
              {editedTask.description || "Add a description..."}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div class="shrink-0 px-4 py-3 border-t border-border text-xs text-muted-foreground">
        <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
        <p>Updated: {new Date(task.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}
