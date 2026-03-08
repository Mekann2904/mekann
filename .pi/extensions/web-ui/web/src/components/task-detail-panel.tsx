/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/task-detail-panel.tsx
 * @role Side panel for task details with subtask support (GitHub style)
 * @why Provide detailed view and editing without modal
 * @related tasks-page.tsx, kanban-task-card.tsx
 * @public_api TaskDetailPanel
 * @invariants Task data is controlled by parent
 * @side_effects Calls onUpdate, onDelete, onStatusChange, onCreateSubtask callbacks
 * @failure_modes None (display only)
 *
 * @abdd.explain
 * @overview GitHub Projects style side panel with subtask support
 * @what_it_does Shows task details, allows inline editing, subtask management
 * @why_it_exists Non-modal editing experience, hierarchical task structure
 * @scope(in) Task data, all tasks for subtask lookup, callbacks
 * @scope(out) Rendered panel with edit forms and subtask list
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { memo } from "preact/compat";
import { X, Calendar, User, Tag, Trash2, CheckCircle2, Circle, Clock, AlertTriangle, Plus, ListChecks, FileText } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "./kanban-task-card";
import {
  InlineLoading,
} from "./layout";

interface TaskDetailPanelProps {
  task: Task;
  allTasks: Task[];  // For finding subtasks
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onDelete: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onCreateSubtask: (parentId: string, title: string) => void;
  onUpdateSubtask: (subtask: Task) => void;
  onDeleteSubtask: (subtaskId: string) => void;
}

interface WorkflowWorkpad {
  id: string;
  updatedAt?: string;
  sections?: {
    progress?: string;
    verification?: string;
    next?: string;
  };
}

interface SymphonyIssueDetail {
  source: "task" | "ul-workflow";
  queue: {
    position: number | null;
    isNext: boolean;
    totalPending: number;
    blockedReason: string | null;
    retryAt: string | null;
    retryCount: number;
    lastError: string | null;
  };
  runtime: {
    activeSession: {
      id: string;
      status: string;
      agentId?: string;
      progress?: number;
      message?: string;
    } | null;
  };
  verification: {
    status: "passed" | "failed" | "missing";
    verifiedAt: string | null;
    message: string | null;
  };
  completionGate: {
    status: "clear" | "blocked" | "missing";
    updatedAt: string | null;
    message: string | null;
    blockers: string[];
  };
  proofArtifacts: string[];
  debug: {
    recentEvents: Array<{
      at: string;
      action: string;
      reason?: string;
      source?: string;
      sessionId?: string;
    }>;
    relatedSessions: Array<{
      id: string;
      status: string;
      agentId?: string;
      progress?: number;
      message?: string;
      startedAt: number;
      type?: string;
    }>;
  };
  orchestration: {
    runState: "claimed" | "running" | "retrying" | "released";
    updatedAt: string;
    reason?: string;
    retryAttempt?: number;
    workpadId?: string;
  } | null;
  workflow: {
    exists: boolean;
    workspaceRoot: string;
    entrypoints: string[];
    requiredCommands: string[];
    verifiedCommands: string[];
  };
  workspace: {
    path: string;
    exists: boolean;
  };
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

function TaskDetailPanelInner({
  task,
  allTasks,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
  onCreateSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: TaskDetailPanelProps) {
  const [editedTask, setEditedTask] = useState(task);
  const [newTag, setNewTag] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [workpad, setWorkpad] = useState<WorkflowWorkpad | null>(null);
  const [workpadLoading, setWorkpadLoading] = useState(false);
  const [issueDetail, setIssueDetail] = useState<SymphonyIssueDetail | null>(null);
  const [issueDetailLoading, setIssueDetailLoading] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  // UL workflow tasks are read-only
  const isReadOnly = task.isUlWorkflow === true;

  // Get subtasks (memoized)
  const subtasks = useMemo(
    () => allTasks.filter((t) => t.parentTaskId === task.id),
    [allTasks, task.id]
  );
  const completedSubtasks = useMemo(
    () => subtasks.filter((t) => t.status === "completed"),
    [subtasks]
  );
  const subtaskProgress = useMemo(
    () => subtasks.length > 0 ? `${completedSubtasks.length}/${subtasks.length}` : null,
    [subtasks.length, completedSubtasks.length]
  );
  const isOverdue = useMemo(
    () =>
      editedTask.dueDate &&
      editedTask.status !== "completed" &&
      editedTask.status !== "cancelled" &&
      new Date(editedTask.dueDate) < new Date(),
    [editedTask.dueDate, editedTask.status]
  );

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

  // Fetch plan.md for UL workflow tasks
  useEffect(() => {
    if (!task.isUlWorkflow) {
      setPlan(null);
      return;
    }

    const fetchPlan = async () => {
      setPlanLoading(true);
      try {
        const response = await fetch(`/api/ul-workflow/tasks/${task.id}/plan`);
        if (response.ok) {
          const text = await response.text();
          setPlan(text);
        }
      } catch (e) {
        console.error("Failed to fetch plan:", e);
      } finally {
        setPlanLoading(false);
      }
    };

    fetchPlan();
  }, [task.id, task.isUlWorkflow]);

  useEffect(() => {
    let cancelled = false;

    const fetchWorkpad = async () => {
      setWorkpadLoading(true);
      try {
        const params = new URLSearchParams({
          task: task.title,
          issueId: task.id,
        });
        const response = await fetch(`/api/v2/workpads/match?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setWorkpad(Array.isArray(payload?.data) ? payload.data[0] ?? null : null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch workpad:", error);
          setWorkpad(null);
        }
      } finally {
        if (!cancelled) {
          setWorkpadLoading(false);
        }
      }
    };

    fetchWorkpad();

    return () => {
      cancelled = true;
    };
  }, [task.id, task.title]);

  useEffect(() => {
    let cancelled = false;

    const fetchIssueDetail = async () => {
      setIssueDetailLoading(true);
      try {
        const response = await fetch(`/api/v2/runtime/symphony/issues/${task.id}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (!cancelled) {
          setIssueDetail(payload?.data ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch Symphony issue detail:", error);
          setIssueDetail(null);
        }
      } finally {
        if (!cancelled) {
          setIssueDetailLoading(false);
        }
      }
    };

    fetchIssueDetail();

    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // Callbacks (memoized)
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDelete = useCallback(() => {
    if (confirm("Delete this task?")) {
      onDelete();
    }
  }, [onDelete]);

  const updateField = useCallback(<K extends keyof Task>(key: K, value: Task[K]) => {
    setEditedTask((prev) => {
      const updated = { ...prev, [key]: value };
      onUpdate(updated);
      return updated;
    });
  }, [onUpdate]);

  const addTag = useCallback(() => {
    setNewTag((prev) => {
      const trimmed = prev.trim();
      if (trimmed && !editedTask.tags.includes(trimmed)) {
        updateField("tags", [...editedTask.tags, trimmed]);
        return "";
      }
      return prev;
    });
  }, [editedTask.tags, updateField]);

  const removeTag = useCallback((tag: string) => {
    updateField(
      "tags",
      editedTask.tags.filter((t) => t !== tag)
    );
  }, [editedTask.tags, updateField]);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
    if (editedTask.title.trim() !== task.title) {
      onUpdate(editedTask);
    }
  }, [editedTask, task.title, onUpdate]);

  const handleDescriptionBlur = useCallback(() => {
    setIsEditingDescription(false);
    if (editedTask.description !== task.description) {
      onUpdate(editedTask);
    }
  }, [editedTask, task.description, onUpdate]);

  const handleStatusChange = useCallback((status: TaskStatus) => {
    if (!isReadOnly) {
      updateField("status", status);
      onStatusChange(status);
    }
  }, [isReadOnly, updateField, onStatusChange]);

  return (
    <div class="w-[360px] shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <span class="text-xs text-muted-foreground font-mono">#{task.id.slice(0, 7)}</span>
        <div class="flex items-center gap-1">
          {!isReadOnly && (
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-destructive hover:text-destructive"
              onClick={handleDelete}
              title="Delete task"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" class="h-7 w-7" onClick={handleClose}>
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Read-only notice for UL workflow tasks */}
      {isReadOnly && (
        <div class="mx-4 mt-4 bg-purple-500/10 border border-purple-500/20 rounded-md p-3">
          <p class="text-sm text-purple-400 font-medium">UL Workflow Task</p>
          <p class="text-xs text-muted-foreground mt-1">
            This task is managed by UL Workflow. View only - modifications must be made through the workflow system.
          </p>
          {task.phase && (
            <p class="text-xs text-muted-foreground mt-1">
              Current phase: <span class="uppercase font-medium">{task.phase}</span>
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        <div>
          {isEditingTitle && !isReadOnly ? (
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
                  e.stopPropagation();
                  setEditedTask({ ...editedTask, title: task.title });
                  setIsEditingTitle(false);
                }
              }}
              class="w-full text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 p-0"
            />
          ) : (
            <h2
              class={cn(
                "text-lg font-semibold",
                !isReadOnly && "cursor-text hover:bg-muted/30 rounded px-1 -mx-1",
                task.status === "completed" && "line-through text-muted-foreground"
              )}
              onClick={() => !isReadOnly && setIsEditingTitle(true)}
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
                  disabled={isReadOnly}
                  onClick={() => handleStatusChange(option.value)}
                  class={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted",
                    isReadOnly && "cursor-not-allowed opacity-70"
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
                  disabled={isReadOnly}
                  onClick={() => !isReadOnly && updateField("priority", option.value)}
                  class={cn(
                    "inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
                    isActive ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100",
                    isReadOnly && "cursor-not-allowed"
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
            disabled={isReadOnly}
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
            disabled={isReadOnly}
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
                {!isReadOnly && (
                  <button
                    onClick={() => removeTag(tag)}
                    class="hover:text-destructive transition-colors"
                  >
                    <X class="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!isReadOnly && (
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
          )}
        </div>

        {/* Description */}
        <div>
          <label class="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
          {isEditingDescription && !isReadOnly ? (
            <textarea
              ref={descriptionRef}
              value={editedTask.description || ""}
              onInput={(e) => setEditedTask({ ...editedTask, description: (e.target as HTMLTextAreaElement).value })}
              onBlur={handleDescriptionBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
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
                "min-h-[80px] rounded-md border border-transparent hover:border-border px-3 py-2 text-sm",
                !isReadOnly && "cursor-text",
                !editedTask.description && "text-muted-foreground/50 italic"
              )}
              onClick={() => !isReadOnly && setIsEditingDescription(true)}
            >
              {editedTask.description || "Add a description..."}
            </div>
          )}
        </div>

        {/* Subtasks - GitHub style (hide for UL workflow tasks) */}
        {!isReadOnly && (
          <div>
            <label class="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
              <ListChecks class="h-3 w-3" />
              Subtasks
              {subtaskProgress && (
                <span class="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">
                  {subtaskProgress} done
                </span>
              )}
            </label>

            {/* Subtask list */}
            <div class="space-y-1 mb-2">
              {subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  class={cn(
                    "flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group",
                    subtask.status === "completed" && "opacity-60"
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newStatus = subtask.status === "completed" ? "todo" : "completed";
                      onUpdateSubtask({ ...subtask, status: newStatus });
                    }}
                    class="shrink-0"
                  >
                    {subtask.status === "completed" ? (
                      <CheckCircle2 class="h-4 w-4 text-green-500" />
                    ) : (
                      <Circle class="h-4 w-4 text-muted-foreground hover:text-primary" />
                    )}
                  </button>
                  <span
                    class={cn(
                      "flex-1 text-sm truncate",
                      subtask.status === "completed" && "line-through text-muted-foreground"
                    )}
                  >
                    {subtask.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this subtask?")) {
                        onDeleteSubtask(subtask.id);
                      }
                    }}
                    class="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add subtask */}
            {isAddingSubtask ? (
              <div class="flex gap-2">
                <input
                  ref={subtaskInputRef}
                  type="text"
                  value={newSubtaskTitle}
                  onInput={(e) => setNewSubtaskTitle((e.target as HTMLInputElement).value)}
                  placeholder="Subtask title..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newSubtaskTitle.trim()) {
                        onCreateSubtask(task.id, newSubtaskTitle.trim());
                        setNewSubtaskTitle("");
                        setIsAddingSubtask(false);
                      }
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      setNewSubtaskTitle("");
                      setIsAddingSubtask(false);
                    }
                  }}
                  class={cn(
                    "flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs",
                    "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 flex-1"
                  )}
                />
                <Button
                  size="sm"
                  class="h-8"
                  onClick={() => {
                    if (newSubtaskTitle.trim()) {
                      onCreateSubtask(task.id, newSubtaskTitle.trim());
                      setNewSubtaskTitle("");
                      setIsAddingSubtask(false);
                    }
                  }}
                  disabled={!newSubtaskTitle.trim()}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-8"
                  onClick={() => {
                    setNewSubtaskTitle("");
                    setIsAddingSubtask(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsAddingSubtask(true);
                  setTimeout(() => subtaskInputRef.current?.focus(), 0);
                }}
                class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus class="h-3.5 w-3.5" />
                Add subtask
              </button>
            )}
          </div>
        )}

        {/* Plan.md section for UL workflow tasks */}
        {task.isUlWorkflow && (
          <div class="px-4 py-3 border-t border-border">
            <div class="flex items-center gap-2 mb-2">
              <FileText class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium">Plan</span>
            </div>
            {planLoading ? (
              <div class="flex items-center gap-2 text-muted-foreground text-xs">
                <InlineLoading />
                Loading plan...
              </div>
            ) : plan ? (
              <div class="bg-muted/30 rounded-md p-3 max-h-[300px] overflow-y-auto">
                <pre class="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {plan.slice(0, 2000)}
                  {plan.length > 2000 && "..."}
                </pre>
              </div>
            ) : (
              <p class="text-xs text-muted-foreground">No plan available</p>
            )}
          </div>
        )}

        <div class="px-4 py-3 border-t border-border">
          <div class="flex items-center gap-2 mb-2">
            <FileText class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium">Workflow Workpad</span>
          </div>
          {workpadLoading ? (
            <div class="flex items-center gap-2 text-muted-foreground text-xs">
              <InlineLoading />
              Loading workpad...
            </div>
          ) : workpad ? (
            <div class="bg-muted/30 rounded-md p-3 space-y-3">
              <p class="text-[10px] font-mono text-muted-foreground">
                {workpad.id} · {workpad.updatedAt || "updated_at unknown"}
              </p>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>
                <div class="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {workpad.sections?.progress || "-"}
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Verification</p>
                <div class="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {workpad.sections?.verification || "-"}
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next</p>
                <div class="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {workpad.sections?.next || "-"}
                </div>
              </div>
            </div>
          ) : (
            <p class="text-xs text-muted-foreground">No durable workpad found for this task yet</p>
          )}
        </div>

        <div class="px-4 py-3 border-t border-border">
          <div class="flex items-center gap-2 mb-2">
            <Clock class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium">Symphony Orchestration</span>
          </div>
          {issueDetailLoading ? (
            <div class="flex items-center gap-2 text-muted-foreground text-xs">
              <InlineLoading />
              Loading orchestration...
            </div>
          ) : issueDetail ? (
            <div class="bg-muted/30 rounded-md p-3 space-y-3">
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="rounded bg-background/60 px-2 py-1">source: {issueDetail.source}</div>
                <div class="rounded bg-background/60 px-2 py-1">
                  queue: {issueDetail.queue.position ? `${issueDetail.queue.position}/${issueDetail.queue.totalPending}` : "-"}
                </div>
                <div class="rounded bg-background/60 px-2 py-1">
                  retry_count: {issueDetail.queue.retryCount}
                </div>
                <div class="rounded bg-background/60 px-2 py-1">
                  blocked: {issueDetail.queue.blockedReason || "-"}
                </div>
              </div>
              {issueDetail.queue.retryAt && (
                <div class="rounded border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  retry_at: {issueDetail.queue.retryAt}
                  {issueDetail.queue.lastError ? ` · last_error: ${issueDetail.queue.lastError}` : ""}
                </div>
              )}
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Verification State</p>
                <div class="mt-1 text-sm">
                  <p>{issueDetail.verification.status}</p>
                  {issueDetail.verification.verifiedAt && (
                    <p class="text-xs text-muted-foreground">{issueDetail.verification.verifiedAt}</p>
                  )}
                  {issueDetail.verification.message && (
                    <p class="mt-1 text-xs text-muted-foreground">{issueDetail.verification.message}</p>
                  )}
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Completion Gate</p>
                <div class="mt-1 text-sm">
                  <p>{issueDetail.completionGate.status}</p>
                  {issueDetail.completionGate.updatedAt && (
                    <p class="text-xs text-muted-foreground">{issueDetail.completionGate.updatedAt}</p>
                  )}
                  {issueDetail.completionGate.message && (
                    <p class="mt-1 text-xs text-muted-foreground">{issueDetail.completionGate.message}</p>
                  )}
                  {issueDetail.completionGate.blockers.length > 0 && (
                    <div class="mt-2 space-y-1">
                      {issueDetail.completionGate.blockers.map((blocker) => (
                        <p key={blocker} class="text-xs text-muted-foreground">
                          - {blocker}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proof Artifacts</p>
                {issueDetail.proofArtifacts.length > 0 ? (
                  <div class="mt-1 space-y-1">
                    {issueDetail.proofArtifacts.map((artifact) => (
                      <p key={artifact} class="text-xs text-muted-foreground">
                        - {artifact}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p class="mt-1 text-sm text-muted-foreground">No structured proof artifacts</p>
                )}
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Durable State</p>
                {issueDetail.orchestration ? (
                  <div class="mt-1 text-sm">
                    <p>{issueDetail.orchestration.runState}</p>
                    <p class="text-xs text-muted-foreground">{issueDetail.orchestration.updatedAt}</p>
                    {typeof issueDetail.orchestration.retryAttempt === "number" && (
                      <p class="text-xs text-muted-foreground">retry_attempt: {issueDetail.orchestration.retryAttempt}</p>
                    )}
                    {issueDetail.orchestration.reason && (
                      <p class="mt-1 text-xs text-muted-foreground">{issueDetail.orchestration.reason}</p>
                    )}
                  </div>
                ) : (
                  <p class="mt-1 text-sm text-muted-foreground">No durable orchestration state</p>
                )}
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Runtime</p>
                {issueDetail.runtime.activeSession ? (
                  <div class="mt-1 text-sm">
                    <p>{issueDetail.runtime.activeSession.status} · {issueDetail.runtime.activeSession.agentId || "agent"}</p>
                    {typeof issueDetail.runtime.activeSession.progress === "number" && (
                      <p class="text-xs text-muted-foreground">progress: {issueDetail.runtime.activeSession.progress}%</p>
                    )}
                    {issueDetail.runtime.activeSession.message && (
                      <p class="mt-1 text-xs text-muted-foreground">{issueDetail.runtime.activeSession.message}</p>
                    )}
                  </div>
                ) : (
                  <p class="mt-1 text-sm text-muted-foreground">No active runtime session</p>
                )}
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Session History</p>
                {issueDetail.debug.relatedSessions.length > 0 ? (
                  <div class="mt-1 space-y-2">
                    {issueDetail.debug.relatedSessions.map((session) => (
                      <div key={session.id} class="rounded border border-border/60 bg-background/40 px-3 py-2">
                        <p class="text-sm">{session.status} · {session.agentId || "agent"}</p>
                        <p class="text-xs text-muted-foreground">{new Date(session.startedAt).toLocaleString()}</p>
                        {session.message && (
                          <p class="mt-1 text-xs text-muted-foreground">{session.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="mt-1 text-sm text-muted-foreground">No related runtime sessions</p>
                )}
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent Events</p>
                {issueDetail.debug.recentEvents.length > 0 ? (
                  <div class="mt-1 space-y-2">
                    {issueDetail.debug.recentEvents.map((event) => (
                      <div key={`${event.at}-${event.action}`} class="rounded border border-border/60 bg-background/40 px-3 py-2">
                        <p class="text-sm">{event.action}</p>
                        <p class="text-xs text-muted-foreground">{event.at}</p>
                        {event.reason && (
                          <p class="mt-1 text-xs text-muted-foreground">{event.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="mt-1 text-sm text-muted-foreground">No orchestration events</p>
                )}
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workspace</p>
                <p class="mt-1 break-all text-sm">{issueDetail.workspace.path}</p>
                <p class="text-xs text-muted-foreground">{issueDetail.workspace.exists ? "ready" : "not created yet"}</p>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Workflow Entry</p>
                <p class="mt-1 text-sm">{issueDetail.workflow.entrypoints.join(", ") || "-"}</p>
              </div>
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required Commands</p>
                <p class="mt-1 text-sm">{issueDetail.workflow.requiredCommands.join(", ") || "-"}</p>
                {issueDetail.workflow.verifiedCommands.length > 0 && (
                  <div class="mt-2 space-y-1">
                    {issueDetail.workflow.verifiedCommands.map((command) => (
                      <p key={command} class="text-xs text-muted-foreground">
                        - verified: {command}
                      </p>
                    ))}
                  </div>
                )}
                <p class="mt-1 break-all text-xs text-muted-foreground">root: {issueDetail.workflow.workspaceRoot}</p>
              </div>
            </div>
          ) : (
            <p class="text-xs text-muted-foreground">No orchestration detail found for this task</p>
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

export const TaskDetailPanel = memo(TaskDetailPanelInner);
