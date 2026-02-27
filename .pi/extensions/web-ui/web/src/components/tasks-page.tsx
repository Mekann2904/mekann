/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks-page.tsx
 * @role Main tasks page with GitHub Projects style Kanban board
 * @why Provide intuitive task management matching GitHub UX
 * @related app.tsx, kanban-task-card.tsx, task-detail-panel.tsx
 * @public_api TasksPage
 * @invariants Data is fetched from API and cached locally
 * @side_effects Fetches from /api/tasks, creates/updates/deletes tasks via API
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview GitHub Projects style Kanban board
 * @what_it_does Displays tasks in columns by status, supports drag-and-drop, inline add
 * @why_it_exists Familiar UX for GitHub users
 * @scope(in) User interactions, drag-and-drop events
 * @scope(out) API calls, rendered Kanban board
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import { Plus, Loader2, AlertCircle, ListTodo, RefreshCw, Search, X } from "lucide-preact";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { KanbanTaskCard, type Task, type TaskStatus, type TaskPriority } from "./kanban-task-card";
import { TaskDetailPanel } from "./task-detail-panel";
import { cn } from "@/lib/utils";

interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  failed: number;
  overdue: number;
}

const API_BASE = "http://localhost:3456";

// Column configuration - GitHub Projects style
interface ColumnConfig {
  id: TaskStatus;
  label: string;
  icon: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: "todo", label: "Todo", icon: "○" },
  { id: "in_progress", label: "In progress", icon: "◐" },
  { id: "completed", label: "Done", icon: "●" },
  { id: "cancelled", label: "Cancelled", icon: "⊘" },
  { id: "failed", label: "Failed", icon: "✕" },
];

// Priority order for sorting
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Inline add state per column
  const [addingToColumn, setAddingToColumn] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const addInputRefs = useRef<Record<TaskStatus, HTMLTextAreaElement | null>>({} as Record<TaskStatus, HTMLTextAreaElement | null>);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tasks`);
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      
      const data = await res.json();
      setTasks(data.data || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tasks";
      setError(message);
      console.error("Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchTasks();
    fetchStats();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchStats]);

  // Filter tasks by search
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const query = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.description?.toLowerCase().includes(query)) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [tasks, searchQuery]);

  // Group tasks by status
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      failed: [],
    };

    filteredTasks.forEach((task) => {
      grouped[task.status].push(task);
    });

    // Sort each column by priority, then by creation date
    Object.keys(grouped).forEach((status) => {
      grouped[status as TaskStatus].sort((a, b) => {
        // Overdue tasks first
        const aOverdue = a.dueDate && a.status !== "completed" && a.status !== "cancelled" && new Date(a.dueDate) < new Date();
        const bOverdue = b.dueDate && b.status !== "completed" && b.status !== "cancelled" && new Date(b.dueDate) < new Date();
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        // Then by priority
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Then by creation date (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });

    return grouped;
  }, [filteredTasks]);

  // Create task inline
  const handleInlineAdd = async (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          status,
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create task");
      }

      setNewTaskTitle("");
      setAddingToColumn(null);
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  };

  // Update task status (drag and drop)
  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  };

  // Delete task
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete task");
      }

      if (selectedTask?.id === id) {
        setSelectedTask(null);
      }
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  };

  // Create subtask
  const handleCreateSubtask = async (parentId: string, title: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          parentTaskId: parentId,
          status: "todo",
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create subtask");
      }

      await fetchTasks();
      await fetchStats();

      // Refresh selectedTask to update subtask list
      if (selectedTask) {
        const refreshedRes = await fetch(`${API_BASE}/api/tasks/${selectedTask.id}`);
        if (refreshedRes.ok) {
          const data = await refreshedRes.json();
          setSelectedTask(data.data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create subtask");
    }
  };

  // Update subtask
  const handleUpdateSubtask = async (subtask: Task) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${subtask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subtask.title,
          status: subtask.status,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update subtask");
      }

      await fetchTasks();
      await fetchStats();

      // Refresh selectedTask to update subtask progress
      if (selectedTask) {
        const refreshedRes = await fetch(`${API_BASE}/api/tasks/${selectedTask.id}`);
        if (refreshedRes.ok) {
          const data = await refreshedRes.json();
          setSelectedTask(data.data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update subtask");
    }
  };

  // Delete subtask
  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${subtaskId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete subtask");
      }

      await fetchTasks();
      await fetchStats();

      // Refresh selectedTask to update subtask list
      if (selectedTask) {
        const refreshedRes = await fetch(`${API_BASE}/api/tasks/${selectedTask.id}`);
        if (refreshedRes.ok) {
          const data = await refreshedRes.json();
          setSelectedTask(data.data);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete subtask");
    }
  };

  // Update task
  const handleUpdateTask = async (updatedTask: Task) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${updatedTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updatedTask.title,
          description: updatedTask.description,
          status: updatedTask.status,
          priority: updatedTask.priority,
          tags: updatedTask.tags,
          dueDate: updatedTask.dueDate,
          assignee: updatedTask.assignee,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    }
  };

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
      handleStatusChange(draggedTask.id, columnId);
    }
    setDraggedTask(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  // Focus input when adding to column
  useEffect(() => {
    if (addingToColumn && addInputRefs.current[addingToColumn]) {
      addInputRefs.current[addingToColumn]?.focus();
    }
  }, [addingToColumn]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (addingToColumn) {
          setAddingToColumn(null);
          setNewTaskTitle("");
        } else if (selectedTask) {
          setSelectedTask(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addingToColumn, selectedTask]);

  // Render column
  const renderColumn = (column: ColumnConfig) => {
    const columnTasks = tasksByColumn[column.id];
    const isDropTarget = dragOverColumn === column.id;
    const isAdding = addingToColumn === column.id;

    return (
      <div
        key={column.id}
        class={cn(
          "flex flex-col w-[280px] shrink-0 bg-muted/30 rounded-md",
          isDropTarget && "ring-2 ring-primary/50 bg-primary/5"
        )}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
      >
        {/* Column header */}
        <div class="flex items-center justify-between px-3 py-2 border-b border-border/50">
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted-foreground">{column.icon}</span>
            <span class="text-sm font-medium">{column.label}</span>
            <span class="text-xs text-muted-foreground bg-muted px-1.5 rounded">
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
            // Calculate subtask progress
            const taskSubtasks = tasks.filter((t) => t.parentTaskId === task.id);
            const subtaskProgress = taskSubtasks.length > 0 ? {
              completed: taskSubtasks.filter((t) => t.status === "completed").length,
              total: taskSubtasks.length,
            } : null;

            return (
              <KanbanTaskCard
                key={task.id}
                task={task}
                subtaskProgress={subtaskProgress}
                onClick={() => setSelectedTask(task)}
                onDragStart={(e) => handleDragStart(e, task)}
                onDragEnd={handleDragEnd}
                onDelete={() => handleDelete(task.id)}
                isDragging={draggedTask?.id === task.id}
                isSelected={selectedTask?.id === task.id}
              />
            );
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
                placeholder="Add a task..."
                rows={2}
                class={cn(
                  "w-full px-2.5 py-1.5 text-sm rounded-md border border-input bg-background",
                  "placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
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
            <Plus class="h-3.5 w-3.5" />
            <span>Add item</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div class="flex h-full overflow-hidden">
      {/* Main board area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div class="shrink-0 flex items-center justify-between p-4 border-b border-border bg-background">
          <div class="flex items-center gap-4">
            <h1 class="text-lg font-semibold">Tasks</h1>
            {stats && (
              <span class="text-sm text-muted-foreground">
                {stats.total} tasks
                {stats.overdue > 0 && (
                  <span class="text-red-500 ml-1">({stats.overdue} overdue)</span>
                )}
              </span>
            )}
          </div>
          <div class="flex items-center gap-2">
            {/* Search */}
            <div class="relative">
              <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                placeholder="Search tasks..."
                class="h-8 w-48 pl-8 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { fetchTasks(); fetchStats(); }}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw class={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div class="shrink-0 mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md flex items-center gap-2 text-red-500">
            <AlertCircle class="h-4 w-4 shrink-0" />
            <span class="text-sm flex-1">{error}</span>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              <X class="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Kanban board */}
        {loading ? (
          <div class="flex-1 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2">
              <Loader2 class="h-6 w-6 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : (
          <div class="flex-1 overflow-x-auto p-4">
            <div class="flex gap-4 h-full min-w-max">
              {COLUMNS.map(renderColumn)}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel - GitHub style side panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTask(null)}
          onUpdate={(updated) => {
            handleUpdateTask(updated);
            setSelectedTask(updated);
          }}
          onDelete={() => handleDelete(selectedTask.id)}
          onStatusChange={(status) => {
            handleStatusChange(selectedTask.id, status);
            setSelectedTask({ ...selectedTask, status });
          }}
          onCreateSubtask={handleCreateSubtask}
          onUpdateSubtask={(subtask) => {
            handleUpdateSubtask(subtask);
            // Refresh selected task if it's the parent
            if (subtask.parentTaskId === selectedTask.id) {
              // Keep current selection
            }
          }}
          onDeleteSubtask={handleDeleteSubtask}
        />
      )}
    </div>
  );
}
