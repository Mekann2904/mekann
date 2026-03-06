/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/repositories/task-repository.ts
 * @role タスクデータの永続化層
 * @why データアクセスロジックをビジネスロジックから分離
 * @related services/task-service.ts, lib/storage.ts, schemas/task.schema.ts
 * @public_api TaskRepository, TaskStorage
 * @invariants タスクIDは一意、CRUD操作はアトミック
 * @side_effects JSON ファイルへの読み書き
 * @failure_modes ファイルシステムエラー
 *
 * @abdd.explain
 * @overview タスクのCRUD操作を提供するデータアクセス層
 * @what_it_does タスクの保存・取得・更新・削除
 * @why_it_exists データ永続化の抽象化
 * @scope(in) Task 型
 * @scope(out) JSON ファイル
 */

import type { Task, TaskStats } from "../schemas/task.schema.js";
import {
  loadTaskStorage as loadSharedTaskStorage,
  saveTaskStorage as saveSharedTaskStorage,
} from "../../../../lib/storage/task-plan-store.js";

/**
 * タスクストレージのデータ構造
 */
export interface TaskStorage {
  tasks: Task[];
  version: number;
}

/**
 * タスクリポジトリ
 * 
 * @example
 * ```ts
 * const repo = new TaskRepository();
 * const task = repo.findById("task-123");
 * repo.save({ ...task, status: "completed" });
 * ```
 */
export class TaskRepository {
  constructor() {}

  private readStorage(): TaskStorage {
    const loaded = loadSharedTaskStorage<{ tasks: Task[]; currentTaskId?: string }>();
    return {
      tasks: loaded.tasks || [],
      version: 1,
    };
  }

  private writeStorage(data: TaskStorage): void {
    saveSharedTaskStorage({
      tasks: data.tasks,
    });
  }

  /**
   * 全タスクを取得
   */
  findAll(): Task[] {
    return this.readStorage().tasks;
  }

  /**
   * IDでタスクを検索
   */
  findById(id: string): Task | undefined {
    const { tasks } = this.readStorage();
    return tasks.find((t) => t.id === id);
  }

  /**
   * 条件でタスクをフィルタリング
   */
  filter(predicate: (task: Task) => boolean): Task[] {
    const { tasks } = this.readStorage();
    return tasks.filter(predicate);
  }

  /**
   * タスクを保存（新規作成または更新）
   */
  save(task: Task): void {
    const data = this.readStorage();
    const index = data.tasks.findIndex((t) => t.id === task.id);

    if (index >= 0) {
      data.tasks[index] = task;
    } else {
      data.tasks.push(task);
    }

    this.writeStorage(data);
  }

  /**
   * 複数タスクを一括保存
   */
  saveAll(tasks: Task[]): void {
    const data = this.readStorage();
    const taskMap = new Map(data.tasks.map((t) => [t.id, t]));

    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    data.tasks = Array.from(taskMap.values());
    this.writeStorage(data);
  }

  /**
   * タスクを削除
   */
  delete(id: string): boolean {
    const data = this.readStorage();
    const index = data.tasks.findIndex((t) => t.id === id);

    if (index < 0) {
      return false;
    }

    // サブタスクも削除
    data.tasks = data.tasks.filter((t) => t.id !== id && t.parentTaskId !== id);
    this.writeStorage(data);
    return true;
  }

  /**
   * タスク数を取得
   */
  count(): number {
    return this.readStorage().tasks.length;
  }

  /**
   * 統計情報を取得
   */
  getStats(): TaskStats {
    const { tasks } = this.readStorage();
    const now = new Date();

    return {
      total: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      inProgress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      cancelled: tasks.filter((t) => t.status === "cancelled").length,
      overdue: tasks.filter(
        (t) =>
          t.dueDate &&
          new Date(t.dueDate) < now &&
          t.status !== "completed" &&
          t.status !== "cancelled"
      ).length,
      byPriority: {
        low: tasks.filter((t) => t.priority === "low").length,
        medium: tasks.filter((t) => t.priority === "medium").length,
        high: tasks.filter((t) => t.priority === "high").length,
        urgent: tasks.filter((t) => t.priority === "urgent").length,
      },
    };
  }

  /**
   * ストレージをクリア（テスト用）
   */
  clear(): void {
    this.writeStorage({ tasks: [], version: 1 });
  }
}

/**
 * シングルトンインスタンス
 */
let instance: TaskRepository | null = null;

/**
 * リポジトリのシングルトンを取得
 */
export function getTaskRepository(): TaskRepository {
  if (!instance) {
    instance = new TaskRepository();
  }
  return instance;
}
