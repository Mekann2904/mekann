/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks-page.tsx
 * @role Main tasks page with GitHub-style Kanban board
 * @why Provide intuitive task management with drag-and-drop
 * @related app.tsx, task-card.tsx, task-form.tsx
 * @public_api TasksPage
 * @invariants Data is fetched from API and cached locally
 * @side_effects Fetches from /api/tasks, creates/updates/deletes tasks via API
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview GitHub Projects style Kanban board
 * @what_it_does Displays tasks in columns by status, supports drag-and-drop
 * @why_it_exists Visual task management with intuitive workflow
 * @scope(in) User interactions, drag-and-drop events
 * @scope(out) API calls, rendered Kanban board
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import { Plus, Loader2, AlertCircle, ListTodo, RefreshCw, X, Settings } from "lucide-preact";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { KanbanTaskCard, type Task, type TaskStatus, type TaskPriority } from "./kanban-task-card";
import { TaskForm, type TaskFormData } from "./task-form";
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

// Column configuration
interface ColumnConfig {
  id: TaskStatus;
  label: string;
  color: string;
  bgColor: string;
}

const COLUMNS: ColumnConfig[] = [
  { id: "todo", label: "Todo", color: "text-slate-400", bgColor: "bg-slate-500/10" },
  { id: "in_progress", label: "In Progress", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  { id: "completed", label: "Done", color: "text-green-400", bgColor: "bg-green-500/10" },
  { id: "cancelled", label: "Cancelled", color: "text-slate-500", bgColor: "bg-slate-500/5" },
  { id: "failed", label: "Failed", color: "text-red-400", bgColor: "bg-red-500/10" },
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<TaskStatus[]>([]);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Load hidden columns from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pi-kanban-hidden-columns");
    if (saved) {
      try {
        setHiddenColumns(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, []);

  // Save hidden columns to localStorage
  useEffect(() => {
    localStorage.setItem("pi-kanban-hidden-columns", JSON.stringify(hiddenColumns));
  }, [hiddenColumns]);

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

  // Group tasks by status
  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      failed: [],
    };

    tasks.forEach((task) => {
      grouped[task.status].push(task);
    });

    // Sort each column by priority
    Object.keys(grouped).forEach((status) => {
      grouped[status as TaskStatus].sort((a, b) => {
        // Overdue tasks first
        const aOverdue = a.dueDate && a.status !== "completed" && a.status !== "cancelled" && new Date(a.dueDate) < new Date();
        const bOverdue = b.dueDate && b.status !== "completed" && b.status !== "cancelled" && new Date(b.dueDate) < new Date();
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;

        // Then by priority
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      });
    });

    return grouped;
  }, [tasks]);

  // Visible columns
  const visibleColumns = COLUMNS.filter((col) => !hiddenColumns.includes(col.id));

  // Create task
  const handleCreate = async (data: TaskFormData) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create task");
      }

      setIsFormOpen(false);
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  };

  // Quick add task
  const handleQuickAdd = async (status: TaskStatus) => {
    if (!quickAddTitle.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickAddTitle.trim(),
          status,
          priority: "medium",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create task");
      }

      setQuickAddTitle("");
      setQuickAddColumn(null);
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
    }
  };

  // Update task
  const handleUpdate = async (data: TaskFormData) => {
    if (!editingTask) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${editingTask.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update task");
      }

      setIsFormOpen(false);
      setEditingTask(null);
      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
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

  // Complete task
  const handleComplete = async (id: string) => {
    await handleStatusChange(id, "completed");
  };

  // Delete task
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete task");
      }

      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    }
  };

  // Open edit form
  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsFormOpen(true);
  };

  // Close form
  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingTask(null);
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

  // Toggle column visibility
  const toggleColumn = (columnId: TaskStatus) => {
    setHiddenColumns((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    );
  };

  // Focus quick add input when opened
  useEffect(() => {
    if (quickAddColumn && quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  }, [quickAddColumn]);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center justify-between p-4 border-b border-border">
        <div>
          <h1 class="text-xl font-bold flex items-center gap-2">
            <ListTodo class="h-5 w-5" />
            Tasks
          </h1>
          <p class="text-sm text-muted-foreground">
            {stats ? `${stats.total} tasks` : "Loading..."}
            {stats?.overdue ? (
              <span class="text-red-500 ml-2">({stats.overdue} overdue)</span>
            ) : null}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchTasks(); fetchStats(); }}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            title="Column settings"
          >
            <Settings class={cn("h-4 w-4", showSettings && "text-primary")} />
          </Button>
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus class="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Column settings dropdown */}
      {showSettings && (
        <div class="shrink-0 p-2 border-b border-border bg-muted/30">
          <div class="flex items-center gap-4 text-sm">
            <span class="text-muted-foreground">Columns:</span>
            {COLUMNS.map((col) => (
              <label key={col.id} class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!hiddenColumns.includes(col.id)}
                  onChange={() => toggleColumn(col.id)}
                  class="rounded"
                />
                <span class={col.color}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <Card class="border-destructive shrink-0 mx-4 mt-4">
          <CardContent class="py-3 flex items-center gap-2 text-destructive">
            <AlertCircle class="h-4 w-4" />
            <span class="text-sm">{error}</span>
            <Button variant="outline" size="sm" onClick={() => setError(null)} class="ml-auto">
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Kanban board */}
      {loading ? (
        <div class="flex-1 flex items-center justify-center">
          <div class="flex flex-col items-center gap-2">
            <Loader2 class="h-6 w-6 animate-spin text-primary" />
            <p class="text-sm text-muted-foreground">Loading tasks...</p>
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <ListTodo class="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
            <p class="text-sm text-muted-foreground">No tasks yet</p>
            <Button
              variant="outline"
              size="sm"
              class="mt-3"
              onClick={() => setIsFormOpen(true)}
            >
              <Plus class="h-4 w-4 mr-1" />
              Create first task
            </Button>
          </div>
        </div>
      ) : (
        <div class="flex-1 overflow-x-auto p-4">
          <div class="flex gap-4 h-full min-w-max">
            {visibleColumns.map((column) => {
              const columnTasks = tasksByColumn[column.id];
              const isDropTarget = dragOverColumn === column.id;

              return (
                <div
                  key={column.id}
                  class={cn(
                    "flex flex-col w-72 shrink-0 rounded-lg bg-muted/30",
                    isDropTarget && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  )}
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column.id)}
                >
                  {/* Column header */}
                  <div class={cn("flex items-center justify-between p-3 border-b border-border", column.bgColor)}>
                    <div class="flex items-center gap-2">
                      <h3 class={cn("font-medium text-sm", column.color)}>{column.label}</h3>
                      <span class="text-xs text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded">
                        {columnTasks.length}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={() => setQuickAddColumn(column.id)}
                      title="Add task"
                    >
                      <Plus class="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Quick add form */}
                  {quickAddColumn === column.id && (
                    <div class="p-2 border-b border-border">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleQuickAdd(column.id);
                        }}
                        class="flex gap-2"
                      >
                        <Input
                          ref={quickAddInputRef}
                          type="text"
                          value={quickAddTitle}
                          onInput={(e) => setQuickAddTitle((e.target as HTMLInputElement).value)}
                          placeholder="Task title..."
                          class="h-8 text-sm"
                        />
                        <Button type="submit" size="sm" class="h-8">
                          Add
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          class="h-8 w-8 p-0"
                          onClick={() => {
                            setQuickAddColumn(null);
                            setQuickAddTitle("");
                          }}
                        >
                          <X class="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  )}

                  {/* Task cards */}
                  <div class="flex-1 overflow-y-auto p-2 space-y-2">
                    {columnTasks.map((task) => (
                      <KanbanTaskCard
                        key={task.id}
                        task={task}
                        onComplete={handleComplete}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        onDragStart={(e) => handleDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedTask?.id === task.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Form modal */}
      <TaskForm
        isOpen={isFormOpen}
        initialData={editingTask}
        onSubmit={editingTask ? handleUpdate : handleCreate}
        onCancel={handleFormClose}
      />
    </div>
  );
}
