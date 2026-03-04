/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/schemas/task.schema.ts
 * @role タスク関連のZodスキーマ定義
 * @why タスクAPIの入出力バリデーションと型安全性
 * @related common.schema.ts, routes/tasks.ts, services/task-service.ts
 * @public_api TaskSchema, CreateTaskSchema, UpdateTaskSchema, TaskFilterSchema
 * @invariants タスクIDは一意、ステータスは定義された値のみ
 * @side_effects なし
 * @failure_modes バリデーション失敗時はZodError
 *
 * @abdd.explain
 * @overview タスクのCRUD操作に必要なスキーマ定義
 * @what_it_does タスクの作成・更新・フィルタリングのバリデーション
 * @why_it_exists 型安全なAPIとランタイムバリデーション
 * @scope(in) HTTPリクエストボディ・クエリパラメータ
 * @scope(out) 型定義とバリデーション関数
 */

import { z } from "zod";
import { IdSchema, TimestampSchema } from "./common.schema.js";

/**
 * タスクステータス
 */
export const TaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);

/**
 * タスク優先度
 */
export const TaskPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

/**
 * タスクスキーマ（完全版）
 */
export const TaskSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  tags: z.array(z.string().max(50)).max(20),
  dueDate: TimestampSchema.nullable(),
  assignee: z.string().max(100).nullable(),
  parentTaskId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
});

/**
 * タスク作成スキーマ
 */
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(200),
  description: z.string().max(5000).optional(),
  status: TaskStatusSchema.optional().default("todo"),
  priority: TaskPrioritySchema.optional().default("medium"),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  dueDate: TimestampSchema.nullable().optional(),
  assignee: z.string().max(100).optional(),
  parentTaskId: IdSchema.optional(),
});

/**
 * タスク更新スキーマ（部分更新）
 */
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  dueDate: TimestampSchema.nullable().optional(),
  assignee: z.string().max(100).nullable().optional(),
});

/**
 * タスクフィルタスキーマ
 */
export const TaskFilterSchema = z.object({
  status: z.string().transform((val) => val.split(",")).optional(),
  priority: z.string().transform((val) => val.split(",")).optional(),
  tag: z.string().max(50).optional(),
  assignee: z.string().max(100).optional(),
  overdue: z.enum(["true", "false"]).transform((val) => val === "true").optional(),
});

/**
 * サブタスク作成スキーマ
 */
export const CreateSubtaskSchema = z.object({
  title: z.string().min(1, "タイトルは必須です").max(200),
  description: z.string().max(5000).optional(),
  status: TaskStatusSchema.optional().default("todo"),
  priority: TaskPrioritySchema.optional(),
});

/**
 * タスク統計スキーマ
 */
export const TaskStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  todo: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  byPriority: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    urgent: z.number().int().nonnegative(),
  }),
});

/**
 * 型エクスポート
 */
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type CreateSubtaskInput = z.infer<typeof CreateSubtaskSchema>;
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
export type TaskStats = z.infer<typeof TaskStatsSchema>;
