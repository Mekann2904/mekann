/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks/TaskKanban.tsx
 * @role Kanban board component for task management
 * @why Extract Kanban rendering from tasks-page.tsx (1060 lines) to reduce complexity
 * @related tasks-page.tsx, kanban-task-card.tsx
 * @public_api TaskKanban, TaskKanbanProps
 * @invariants Tasks are grouped by status, drag-and-drop works correctly
 * @side_effects None (pure presentation)
 * @failure_modes Invalid task data
 *
 * @abdd.explain
 * @overview Kanban board component with drag-and-drop
 * @what_it_does Renders tasks in columns by status, supports drag-and-drop between columns
 * @why_it_exists Reduces tasks-page.tsx complexity by extracting Kanban rendering
 * @scope(in) Tasks, column config, drag handlers, selected task
 * @scope(out) Rendered Kanban board
 */

import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Plus } from "lucide-preact";
import { Button } from "../ui/button";
import { KanbanTaskCard, type Task, type TaskStatus } from "../kanban-task-card";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY, PATTERNS, SPACING } from "../layout";

export interface ColumnConfig {
  id: TaskStatus;
  label: string;
  icon: string;
}

interface RuntimeSession {
  taskId: string;
  status: string;
}

export interface TaskKanbanProps {
  tasks: Task[];
  tasksByColumn: Record<TaskStatus, Task[]>;
  columns: ColumnConfig[];
  selectedTaskId: string | null;
  runtimeSessions: RuntimeSession[];
  onTaskClick: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<boolean>;
  onAddTask: (title: string, status: TaskStatus) => Promise<boolean>;
}

export function TaskKanban({
  tasks,
  tasksByColumn,
  columns,
  selectedTaskId,
  runtimeSessions,
  onTaskClick,
  onTaskDelete,
  onStatusChange,
  onAddTask,
}: TaskKanbanProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const addInputRefs = useRef<Record<TaskStatus, HTMLTextAreaElement | null>>({} as Record<TaskStatus, HTMLTextAreaElement | null>);

  // Drag handlers
  const handleDragStart = (e: DragEvent, task: Task) => {
    setDraggedTask(task);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    }
  };

  const handleDragOver = (e: DragEvent, columnId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: DragEvent, columnId: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedTask && draggedTask.status !== columnId) {
      onStatusChange(draggedTask.id, columnId);
    }
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  // Handle inline add
  const handleInlineAdd = async (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return;

    const success = await onAddTask(newTaskTitle.trim(), status);
    if (success) {
      setNewTaskTitle("");
      setAddingToColumn(null);
    }
  };

  // Focus input when adding to column
  useEffect(() => {
    if (addingToColumn && addInputRefs.current[addingToColumn]) {
      addInputRefs.current[addingToColumn]?.focus();
    }
  }, [addingToColumn]);

  // Render column
  const renderColumn = (column: ColumnConfig) => {
    const columnTasks = tasksByColumn[column.id];
    const isDropTarget = dragOverColumn === column.id;
    const isAdding = addingToColumn === column.id;

    return (
      <div
        key={column.id}
        class={cn(
          "flex flex-col w-[280px] shrink-0 bg-muted/30 rounded-md transition-all duration-150",
          isDropTarget && "ring-2 ring-primary/50 bg-accent/10"
        )}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
      >
        {/* Column header */}
        <div class={cn("flex items-center justify-between px-3 py-2", PATTERNS.divider)}>
          <div class={cn("flex items-center", SPACING.element)}>
            <span class={TYPOGRAPHY.body}>{column.icon}</span>
            <span class={TYPOGRAPHY.labelLarge}>{column.label}</span>
            <span class={cn(PATTERNS.badge, "bg-muted")}>
              {columnTasks.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6 opacity-0 hover:opacity-100 data-[show]:opacity-100"
            data-show={isAdding ? "" : undefined}
            onClick={() => setAddingToColumn(column.id)}
            title="Add task"
          >
            <Plus class="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Task cards */}
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          {columnTasks.map((task) => {
            // Check if this is a subtask
            const isSubtask = !!task.parentTaskId;
            // Calculate subtask progress (only for parent tasks)
            const taskSubtasks = isSubtask ? [] : tasks.filter((t) => t.parentTaskId === task.id);
            const subtaskProgress = taskSubtasks.length > 0 ? {
              completed: taskSubtasks.filter((t) => t.status === "completed").length,
              total: taskSubtasks.length,
            } : null;
            // Find runtime session for this task
            const taskSession = runtimeSessions.find((s) => s.taskId === task.id);

            const card = (
              <KanbanTaskCard
                key={task.id}
                task={task}
                subtaskProgress={subtaskProgress}
                isSubtask={isSubtask}
                session={taskSession}
                onClick={() => onTaskClick(task.id)}
                onDragStart={(e) => handleDragStart(e, task)}
                onDragEnd={handleDragEnd}
                onDelete={() => onTaskDelete(task.id)}
                isDragging={draggedTask?.id === task.id}
                isSelected={selectedTaskId === task.id}
              />
            );

            // Indent subtasks slightly
            if (isSubtask) {
              return <div key={task.id} class="ml-3">{card}</div>;
            }
            return card;
          })}
        </div>

        {/* Add task form at bottom - GitHub style */}
        {isAdding ? (
          <div class="p-2 border-t border-border/50">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleInlineAdd(column.id);
              }}
              class="space-y-2"
            >
              <textarea
                ref={(el) => {
                  if (el) addInputRefs.current[column.id] = el as unknown as HTMLTextAreaElement;
                }}
                value={newTaskTitle}
                onInput={(e) => setNewTaskTitle((e.target as HTMLTextAreaElement).value)}
                placeholder="Add a task... (⌘+Enter to add)"
                rows={2}
                class={cn(
                  "w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                )}
                onKeyDown={(e) => {
                  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleInlineAdd(column.id);
                  }
                }}
              />
              <div class="flex items-center gap-2">
                <Button type="submit" size="sm" class="h-7 text-xs" disabled={!newTaskTitle.trim()}>
                  Add
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs"
                  onClick={() => {
                    setAddingToColumn(null);
                    setNewTaskTitle("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <button
            class="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-b-md"
            onClick={() => setAddingToColumn(column.id)}
          >
            <Plus class="h-4 w-4" />
            <span>Add task</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div class="flex gap-4 overflow-x-auto pb-4 h-full">
      {columns.map(renderColumn)}
    </div>
  );
}

// Export column configuration for reuse
export const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "todo", label: "Todo", icon: "○" },
  { id: "in_progress", label: "In progress", icon: "◐" },
  { id: "completed", label: "Done", icon: "●" },
  { id: "cancelled", label: "Cancelled", icon: "⊘" },
  { id: "failed", label: "Failed", icon: "✕" },
];
