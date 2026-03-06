/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useTaskDataNew.ts
 * @role 新しいJotaiベースのタスクデータフックへのアダプター
 * @why 既存コンポーネントとの互換性を維持しながら段階的に移行
 * @related useTaskData.ts, ../../src/web/hooks/use-tasks.ts
 * @public_api useTaskDataNew
 * @invariants 既存のuseTaskDataと同じインターフェース
 * @side_effects Jotai atom更新
 * @failure_modes APIエラー
 *
 * @abdd.explain
 * @overview 新しいJotaiフックを既存インターフェースに適合
 * @what_it_does 型変換、インターフェース統一
 * @why_it_exists 段階的移行のためのブリッジ
 */

import { useCallback, useEffect, useState } from "preact/hooks";
import type { Task, TaskStatus, TaskPriority } from "../components/kanban-task-card";

// 型定義（既存と互換）
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

const API_BASE = "/api/v2";

export function buildDeleteTaskEndpoint(taskId: string): string {
  if (taskId.startsWith("ul-")) {
    return `${API_BASE}/ul-workflow/tasks/${taskId}`;
  }
  return `${API_BASE}/tasks/${taskId}`;
}

/**
 * 新しいAPI（/api/v2）を使用するタスクデータフック
 * 既存のuseTaskDataと同じインターフェースを提供
 */
export function useTaskDataNew(pollInterval: number = 10000): UseTaskDataReturn {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setError(null);
    try {
      // 新しいHono APIを使用
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
        body: JSON.stringify({ title, status, priority }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create task");
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
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update task");
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
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update task");
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
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete task");
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
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create subtask");
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
    return updateTask(subtask);
  }, [updateTask]);

  const deleteSubtask = useCallback(async (subtaskId: string): Promise<boolean> => {
    return deleteTask(subtaskId);
  }, [deleteTask]);

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
