/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useTaskData.ts
 * @role Task data management hook
 * @why Extract task operations from tasks-page.tsx (1060 lines) to reduce complexity
 * @related tasks-page.tsx, kanban-task-card.tsx, task-detail-panel.tsx
 * @public_api useTaskData, TaskDataState, TaskDataActions
 * @invariants Tasks array is always synchronized with server after operations
 * @side_effects Fetches from /api/tasks and /api/ul-workflow/tasks, creates/updates/deletes tasks
 * @failure_modes API unavailable, network error
 *
 * @abdd.explain
 * @overview Task data management with CRUD operations
 * @what_it_does Fetches tasks, provides CRUD operations, manages loading/error state
 * @why_it_exists Reduces tasks-page.tsx complexity by extracting data logic
 * @scope(in) None
 * @scope(out) Tasks array, stats, loading/error state, CRUD functions
 */

import { useState, useCallback, useEffect, useMemo } from "preact/hooks";
import type { Task, TaskStatus, TaskPriority } from "../components/kanban-task-card";

const API_BASE = "/api/v2";

export function buildDeleteTaskEndpoint(taskId: string): string {
  if (taskId.startsWith("ul-")) {
    return `${API_BASE}/ul-workflow/tasks/${taskId}`;
  }
  return `${API_BASE}/tasks/${taskId}`;
}

export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  failed: number;
  overdue: number;
}

export interface UseTaskDataReturn {
  tasks: Task[];
  stats: TaskStats | null;
  loading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createTask: (title: string, status: TaskStatus, priority: TaskPriority) => Promise<boolean>;
  updateTask: (task: Task) => Promise<boolean>;
  updateTaskStatus: (taskId: string, newStatus: TaskStatus) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  createSubtask: (parentId: string, title: string) => Promise<boolean>;
  updateSubtask: (subtask: Task) => Promise<boolean>;
  deleteSubtask: (subtaskId: string) => Promise<boolean>;
  clearError: () => void;
}

export function useTaskData(pollInterval: number = 10000): UseTaskDataReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      const [regularRes, ulRes] = await Promise.all([
        fetch(`${API_BASE}/tasks`),
        fetch(`${API_BASE}/ul-workflow/tasks`),
      ]);

      const regularData = regularRes.ok ? await regularRes.json() : { data: [] };
      const ulData = ulRes.ok ? await ulRes.json() : { data: [] };

      const mergedTasks: Task[] = [
        ...(regularData.data || []),
        ...(ulData.data || []),
      ];
      setTasks(mergedTasks);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch tasks";
      setError(message);
      console.error("Failed to fetch tasks:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }, []);

  const createTask = useCallback(async (
    title: string,
    status: TaskStatus,
    priority: TaskPriority
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          status,
          priority,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create task");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create task");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const updateTask = useCallback(async (updatedTask: Task): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${updatedTask.id}`, {
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
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const updateTaskStatus = useCallback(async (
    taskId: string,
    newStatus: TaskStatus
  ): Promise<boolean> => {
    // Check if moving parent task to "completed" - all subtasks must be completed first
    if (newStatus === "completed") {
      const task = tasks.find((t) => t.id === taskId);
      const subtasks = tasks.filter((t) => t.parentTaskId === taskId);
      const incompleteSubtasks = subtasks.filter((t) => t.status !== "completed");

      if (incompleteSubtasks.length > 0) {
        setError(
          `Cannot complete this task: ${incompleteSubtasks.length} subtask(s) are not done yet.`
        );
        return false;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update task");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
      return false;
    }
  }, [tasks, fetchTasks, fetchStats]);

  const deleteTask = useCallback(async (taskId: string): Promise<boolean> => {
    try {
      const res = await fetch(buildDeleteTaskEndpoint(taskId), {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete task");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const createSubtask = useCallback(async (parentId: string, title: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          parentTaskId: parentId,
          status: "todo" as TaskStatus,
          priority: "medium" as TaskPriority,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create subtask");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create subtask");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const updateSubtask = useCallback(async (subtask: Task): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${subtask.id}`, {
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
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update subtask");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const deleteSubtask = useCallback(async (subtaskId: string): Promise<boolean> => {
    try {
      const res = await fetch(buildDeleteTaskEndpoint(subtaskId), {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete subtask");
      }

      await fetchTasks();
      await fetchStats();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete subtask");
      return false;
    }
  }, [fetchTasks, fetchStats]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Initial load + polling
  useEffect(() => {
    let isInitialLoad = true;

    const fetchAllTasks = async () => {
      if (isInitialLoad) {
        setLoading(true);
      }
      setError(null);
      try {
        const [regularRes, ulRes] = await Promise.all([
          fetch(`${API_BASE}/tasks`),
          fetch(`${API_BASE}/ul-workflow/tasks`),
        ]);

        const regularData = regularRes.ok ? await regularRes.json() : { data: [] };
        const ulData = ulRes.ok ? await ulRes.json() : { data: [] };

        const mergedTasks: Task[] = [
          ...(regularData.data || []),
          ...(ulData.data || []),
        ];
        setTasks(mergedTasks);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to fetch tasks";
        setError(message);
        console.error("Failed to fetch tasks:", e);
      } finally {
        if (isInitialLoad) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    };

    fetchAllTasks();
    fetchStats();
    const interval = setInterval(fetchAllTasks, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStats, pollInterval]);

  return {
    tasks,
    stats,
    loading,
    error,
    fetchTasks,
    fetchStats,
    createTask,
    updateTask,
    updateTaskStatus,
    deleteTask,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    clearError,
  };
}
