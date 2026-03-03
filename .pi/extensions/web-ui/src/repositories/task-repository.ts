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
import { JsonStorage } from "../lib/storage.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// tasks/storage.jsonが存在する.piディレクトリを探す
function findPiDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  
  // 上位ディレクトリを順に探索
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    const tasksFile = join(current, ".pi", "tasks", "storage.json");
    if (existsSync(tasksFile)) {
      return join(current, ".pi");
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  
  // cwdから探索
  current = process.cwd();
  for (let i = 0; i < 10; i++) {
    const tasksFile = join(current, ".pi", "tasks", "storage.json");
    if (existsSync(tasksFile)) {
      return join(current, ".pi");
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  
  throw new Error("Could not find .pi/tasks/storage.json");
}

const PI_DIR = findPiDir();

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
  private readonly storage: JsonStorage<TaskStorage>;

  constructor() {
    this.storage = new JsonStorage<TaskStorage>(
      "tasks/storage.json",
      { tasks: [], version: 1 },
      { dataDir: PI_DIR }
    );
  }

  /**
   * 全タスクを取得
   */
  findAll(): Task[] {
    return this.storage.read().tasks;
  }

  /**
   * IDでタスクを検索
   */
  findById(id: string): Task | undefined {
    const { tasks } = this.storage.read();
    return tasks.find((t) => t.id === id);
  }

  /**
   * 条件でタスクをフィルタリング
   */
  filter(predicate: (task: Task) => boolean): Task[] {
    const { tasks } = this.storage.read();
    return tasks.filter(predicate);
  }

  /**
   * タスクを保存（新規作成または更新）
   */
  save(task: Task): void {
    const data = this.storage.read();
    const index = data.tasks.findIndex((t) => t.id === task.id);

    if (index >= 0) {
      data.tasks[index] = task;
    } else {
      data.tasks.push(task);
    }

    this.storage.write(data);
  }

  /**
   * 複数タスクを一括保存
   */
  saveAll(tasks: Task[]): void {
    const data = this.storage.read();
    const taskMap = new Map(data.tasks.map((t) => [t.id, t]));

    for (const task of tasks) {
      taskMap.set(task.id, task);
    }

    data.tasks = Array.from(taskMap.values());
    this.storage.write(data);
  }

  /**
   * タスクを削除
   */
  delete(id: string): boolean {
    const data = this.storage.read();
    const index = data.tasks.findIndex((t) => t.id === id);

    if (index < 0) {
      return false;
    }

    // サブタスクも削除
    data.tasks = data.tasks.filter((t) => t.id !== id && t.parentTaskId !== id);
    this.storage.write(data);
    return true;
  }

  /**
   * タスク数を取得
   */
  count(): number {
    return this.storage.read().tasks.length;
  }

  /**
   * 統計情報を取得
   */
  getStats(): TaskStats {
    const { tasks } = this.storage.read();
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
    this.storage.write({ tasks: [], version: 1 });
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
