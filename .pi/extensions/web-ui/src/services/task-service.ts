/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/task-service.ts
 * @role タスク関連のビジネスロジック
 * @why ドメインロジックをデータアクセスから分離
 * @related repositories/task-repository.ts, routes/tasks.ts
 * @public_api TaskService
 * @invariants タスク作成時にIDとタイムスタンプを自動生成
 * @side_effects リポジトリ経由でファイルシステムに書き込み
 * @failure_modes バリデーションエラー、リポジトリエラー
 *
 * @abdd.explain
 * @overview タスクのCRUD操作とビジネスルールの適用
 * @what_it_does タスク作成・更新・完了・削除、フィルタリング
 * @why_it_exists ビジネスロジックの一元管理
 * @scope(in) CreateTaskInput, UpdateTaskInput, TaskFilter
 * @scope(out) Task, TaskStats
 */

import type {
  Task,
  CreateTaskInput,
  CreateSubtaskInput,
  UpdateTaskInput,
  TaskFilter,
  TaskStats,
  TaskPriority,
} from "../schemas/task.schema.js";
import { TaskRepository, getTaskRepository } from "../repositories/task-repository.js";

/**
 * タスクサービス
 * 
 * @example
 * ```ts
 * const service = new TaskService();
 * const task = service.create({ title: "新規タスク" });
 * service.complete(task.id);
 * ```
 */
export class TaskService {
  constructor(private readonly repository: TaskRepository = getTaskRepository()) {}

  /**
   * タスク一覧を取得（フィルタリング・ソート付き）
   */
  list(filter?: Partial<TaskFilter>): Task[] {
    let tasks = this.repository.findAll();

    if (filter) {
      // ステータスフィルタ
      if (filter.status && filter.status.length > 0) {
        tasks = tasks.filter((t) => filter.status!.includes(t.status));
      }

      // 優先度フィルタ
      if (filter.priority && filter.priority.length > 0) {
        tasks = tasks.filter((t) => filter.priority!.includes(t.priority));
      }

      // タグフィルタ
      if (filter.tag) {
        tasks = tasks.filter((t) => t.tags.includes(filter.tag!));
      }

      // 担当者フィルタ
      if (filter.assignee) {
        tasks = tasks.filter((t) => t.assignee === filter.assignee);
      }

      // 期限切れフィルタ
      if (filter.overdue) {
        const now = new Date();
        tasks = tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < now &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        );
      }
    }

    // 優先度でソート（urgent > high > medium > low）
    return this.sortByPriority(tasks);
  }

  /**
   * タスクをIDで取得
   */
  getById(id: string): Task | null {
    return this.repository.findById(id) ?? null;
  }

  /**
   * 新しいタスクを作成
   */
  create(input: CreateTaskInput): Task {
    const now = new Date().toISOString();
    const id = this.generateId();

    const task: Task = {
      id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      tags: input.tags,
      dueDate: input.dueDate ?? null,
      assignee: input.assignee ?? null,
      parentTaskId: input.parentTaskId ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.repository.save(task);
    return task;
  }

  /**
   * タスクを更新
   */
  update(id: string, input: UpdateTaskInput): Task | null {
    const existing = this.repository.findById(id);
    if (!existing) {
      return null;
    }

    const updated: Task = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    this.repository.save(updated);
    return updated;
  }

  /**
   * タスクを完了状態にする
   */
  complete(id: string): Task | null {
    const existing = this.repository.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updated: Task = {
      ...existing,
      status: "completed",
      completedAt: now,
      updatedAt: now,
    };

    this.repository.save(updated);
    return updated;
  }

  /**
   * サブタスクを作成
   */
  createSubtask(parentId: string, input: CreateSubtaskInput): Task | null {
    const parent = this.repository.findById(parentId);
    if (!parent) {
      return null;
    }

    const now = new Date().toISOString();
    const id = this.generateId();

    const subtask: Task = {
      id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority ?? parent.priority, // デフォルトは親の優先度
      tags: [...parent.tags], // 親のタグを継承
      dueDate: parent.dueDate, // 親の期限を継承
      assignee: parent.assignee, // 親の担当者を継承
      parentTaskId: parentId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.repository.save(subtask);
    return subtask;
  }

  /**
   * サブタスク一覧を取得
   */
  getSubtasks(parentId: string): Task[] {
    const allTasks = this.repository.findAll();
    return allTasks.filter((t) => t.parentTaskId === parentId);
  }

  /**
   * タスクを削除（サブタスクも含む）
   */
  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  /**
   * 統計情報を取得
   */
  getStats(): TaskStats {
    return this.repository.getStats();
  }

  /**
   * 優先度でソート
   */
  private sortByPriority(tasks: Task[]): Task[] {
    const priorityOrder: Record<TaskPriority, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return [...tasks].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  /**
   * ユニークIDを生成
   */
  private generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `task-${timestamp}-${random}`;
  }
}

/**
 * シングルトンインスタンス
 */
let instance: TaskService | null = null;

/**
 * サービスのシングルトンを取得
 */
export function getTaskService(): TaskService {
  if (!instance) {
    instance = new TaskService();
  }
  return instance;
}
