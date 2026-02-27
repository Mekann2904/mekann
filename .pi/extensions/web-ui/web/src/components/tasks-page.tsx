/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/components/tasks-page.tsx
 * @role Main tasks page with list, filters, and form
 * @why Provide complete task management UI
 * @related app.tsx, task-card.tsx, task-filters.tsx, task-form.tsx
 * @public_api TasksPage
 * @invariants Data is fetched from API and cached locally
 * @side_effects Fetches from /api/tasks, creates/updates/deletes tasks via API
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Full-featured task management page
 * @what_it_does Displays task list with filters, allows CRUD operations
 * @why_it_exists Central UI for task management
 * @scope(in) User interactions
 * @scope(out) API calls, rendered UI
 */

import { h } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { Plus, Loader2, AlertCircle, ListTodo, RefreshCw } from "lucide-preact";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { TaskCard, type Task } from "./task-card";
import { TaskFilters, type TaskFilterState } from "./task-filters";
import { TaskForm, type TaskFormData } from "./task-form";
import { cn } from "@/lib/utils";

interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

const API_BASE = "http://localhost:3456";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilterState>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.tag) params.set("tag", filters.tag);
      if (filters.assignee) params.set("assignee", filters.assignee);
      if (filters.overdue) params.set("overdue", "true");

      const url = `${API_BASE}/api/tasks${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      
      const data = await res.json();
      let fetchedTasks: Task[] = data.data || [];

      // Client-side search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        fetchedTasks = fetchedTasks.filter(
          (t) =>
            t.title.toLowerCase().includes(search) ||
            (t.description?.toLowerCase().includes(search))
        );
      }

      setTasks(fetchedTasks);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tasks";
      setError(message);
      console.error("Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

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

  // Extract available tags and assignees
  const { availableTags, availableAssignees } = useMemo(() => {
    const tags = new Set<string>();
    const assignees = new Set<string>();

    tasks.forEach((t) => {
      t.tags.forEach((tag) => tags.add(tag));
      if (t.assignee) assignees.add(t.assignee);
    });

    return {
      availableTags: Array.from(tags).sort(),
      availableAssignees: Array.from(assignees).sort(),
    };
  }, [tasks]);

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

  // Complete task
  const handleComplete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${id}/complete`, {
        method: "PATCH",
      });

      if (!res.ok) {
        throw new Error("Failed to complete task");
      }

      await fetchTasks();
      await fetchStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete task");
    }
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

  // Sort tasks by priority (urgent > high > medium > low)
  const sortedTasks = useMemo(() => {
    const priorityOrder: Record<string, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...tasks].sort((a, b) => {
      // Completed tasks at the bottom
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;

      // Then by priority
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [tasks]);

  return (
    <div class="flex h-full flex-col gap-4 p-4 overflow-auto">
      {/* Header */}
      <div class="flex gap-2 shrink-0 items-center justify-between">
        <div>
          <h1 class="text-xl font-bold flex items-center gap-2">
            <ListTodo class="h-5 w-5" />
            Tasks
          </h1>
          <p class="text-sm text-muted-foreground">
            {stats ? `${stats.total} tasks, ${stats.overdue} overdue` : "Loading..."}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchTasks(); fetchStats(); }}
            disabled={loading}
          >
            <RefreshCw class={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus class="h-4 w-4 mr-1" />
            New Task
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div class="grid grid-cols-5 gap-2 shrink-0">
          <Card>
            <CardContent class="py-2 text-center">
              <div class="text-lg font-bold">{stats.total}</div>
              <div class="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="py-2 text-center">
              <div class="text-lg font-bold text-muted-foreground">{stats.todo}</div>
              <div class="text-xs text-muted-foreground">To Do</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="py-2 text-center">
              <div class="text-lg font-bold text-blue-500">{stats.inProgress}</div>
              <div class="text-xs text-muted-foreground">In Progress</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="py-2 text-center">
              <div class="text-lg font-bold text-green-500">{stats.completed}</div>
              <div class="text-xs text-muted-foreground">Done</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent class={cn("py-2 text-center", stats.overdue > 0 && "border-red-500/50")}>
              <div class={cn("text-lg font-bold", stats.overdue > 0 ? "text-red-500" : "text-muted-foreground")}>
                {stats.overdue}
              </div>
              <div class="text-xs text-muted-foreground">Overdue</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <TaskFilters
        filters={filters}
        onFilterChange={setFilters}
        availableTags={availableTags}
        availableAssignees={availableAssignees}
      />

      {/* Error */}
      {error && (
        <Card class="border-destructive shrink-0">
          <CardContent class="py-3 flex items-center gap-2 text-destructive">
            <AlertCircle class="h-4 w-4" />
            <span class="text-sm">{error}</span>
            <Button variant="outline" size="sm" onClick={() => setError(null)} class="ml-auto">
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      {loading ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <div class="flex flex-col items-center gap-2">
              <Loader2 class="h-6 w-6 animate-spin text-primary" />
              <p class="text-sm text-muted-foreground">Loading tasks...</p>
            </div>
          </CardContent>
        </Card>
      ) : sortedTasks.length === 0 ? (
        <Card>
          <CardContent class="py-8 flex items-center justify-center">
            <div class="text-center">
              <ListTodo class="h-12 w-12 mx-auto text-muted-foreground/50 mb-2" />
              <p class="text-sm text-muted-foreground">
                {Object.values(filters).some((v) => v) ? "No tasks match filters" : "No tasks yet"}
              </p>
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
          </CardContent>
        </Card>
      ) : (
        <div class="space-y-2 flex-1">
          {sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
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
