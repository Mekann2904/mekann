/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/hooks/use-tasks.ts
 * @role タスク関連のカスタムフック
 * @why タスクデータの取得・更新
 * @related atoms/index.ts, api/client.ts
 * @public_api useTasks, useTaskStats, useCreateTask, useUpdateTask, useDeleteTask
 * @invariants フックはコンポーネント内でのみ使用
 * @side_effects APIリクエスト、atom更新
 * @failure_modes APIエラー
 *
 * @abdd.explain
 * @overview タスクデータを管理するReactフック
 * @what_it_does データ取得、キャッシュ、CRUD操作
 * @why_it_exists ロジックとUIの分離
 * @scope(in) なし
 * @scope(out) タスクデータ、ローディング状態
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useCallback } from "preact/hooks";
import {
  tasksAtom,
  taskStatsAtom,
  taskFilterAtom,
  selectedTaskIdAtom,
  filteredTasksAtom,
  isLoadingAtom,
  notificationAtom,
} from "../atoms/index.js";
import { apiClient, ApiError } from "../api/client.js";
import type { TaskFilter, CreateTaskInput, UpdateTaskInput } from "../../schemas/task.schema.js";

/**
 * タスク一覧フック
 */
export function useTasks(filter?: Partial<TaskFilter>) {
  const [tasks, setTasks] = useAtom(tasksAtom);
  const [taskFilter, setTaskFilter] = useAtom(taskFilterAtom);
  const filteredTasks = useAtomValue(filteredTasksAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setNotification = useSetAtom(notificationAtom);

  const fetchTasks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.tasks.list(filter);
      setTasks(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "タスク取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [filter, setTasks, setIsLoading, setNotification]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // フィルタ更新
  const updateFilter = useCallback(
    (newFilter: Partial<TaskFilter>) => {
      setTaskFilter((prev) => ({ ...prev, ...newFilter }));
    },
    [setTaskFilter]
  );

  // フィルタリセット
  const resetFilter = useCallback(() => {
    setTaskFilter({});
  }, [setTaskFilter]);

  return {
    tasks,
    filteredTasks,
    taskFilter,
    isLoading,
    refetch: fetchTasks,
    updateFilter,
    resetFilter,
  };
}

/**
 * タスク統計フック
 */
export function useTaskStats() {
  const [stats, setStats] = useAtom(taskStatsAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setNotification = useSetAtom(notificationAtom);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.tasks.stats();
      setStats(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "統計取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [setStats, setIsLoading, setNotification]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
}

/**
 * 選択中タスクフック
 */
export function useSelectedTask() {
  const [selectedId, setSelectedId] = useAtom(selectedTaskIdAtom);
  const tasks = useAtomValue(tasksAtom);

  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  return {
    selectedTask,
    selectedId,
    setSelectedId,
    clearSelection: () => setSelectedId(null),
  };
}

/**
 * タスク作成フック
 */
export function useCreateTask() {
  const setTasks = useSetAtom(tasksAtom);
  const setNotification = useSetAtom(notificationAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  const createTask = useCallback(
    async (input: CreateTaskInput) => {
      try {
        setIsLoading(true);
        const newTask = await apiClient.tasks.create(input);
        setTasks((prev) => [...prev, newTask]);
        setNotification({ message: "タスクを作成しました", type: "success" });
        return newTask;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "作成に失敗しました";
        setNotification({ message, type: "error" });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setTasks, setIsLoading, setNotification]
  );

  return {
    createTask,
    isLoading,
  };
}

/**
 * タスク更新フック
 */
export function useUpdateTask() {
  const setTasks = useSetAtom(tasksAtom);
  const setNotification = useSetAtom(notificationAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskInput) => {
      try {
        setIsLoading(true);
        const updatedTask = await apiClient.tasks.update(id, input);
        setTasks((prev) => prev.map((t) => (t.id === id ? updatedTask : t)));
        setNotification({ message: "タスクを更新しました", type: "success" });
        return updatedTask;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "更新に失敗しました";
        setNotification({ message, type: "error" });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setTasks, setIsLoading, setNotification]
  );

  return {
    updateTask,
    isLoading,
  };
}

/**
 * タスク完了フック
 */
export function useCompleteTask() {
  const setTasks = useSetAtom(tasksAtom);
  const setNotification = useSetAtom(notificationAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  const completeTask = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        const completedTask = await apiClient.tasks.complete(id);
        setTasks((prev) => prev.map((t) => (t.id === id ? completedTask : t)));
        setNotification({ message: "タスクを完了しました", type: "success" });
        return completedTask;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "完了処理に失敗しました";
        setNotification({ message, type: "error" });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [setTasks, setIsLoading, setNotification]
  );

  return {
    completeTask,
    isLoading,
  };
}

/**
 * タスク削除フック
 */
export function useDeleteTask() {
  const setTasks = useSetAtom(tasksAtom);
  const setNotification = useSetAtom(notificationAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        setIsLoading(true);
        await apiClient.tasks.delete(id);
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setNotification({ message: "タスクを削除しました", type: "success" });
        return true;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "削除に失敗しました";
        setNotification({ message, type: "error" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [setTasks, setIsLoading, setNotification]
  );

  return {
    deleteTask,
    isLoading,
  };
}
