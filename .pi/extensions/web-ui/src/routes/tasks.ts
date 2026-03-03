/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/tasks.ts
 * @role タスクAPIルート定義
 * @why タスク管理のHTTPエンドポイント
 * @related services/task-service.ts, middleware/*.ts, schemas/task.schema.ts
 * @public_api taskRoutes
 * @invariants すべてのレスポンスは統一形式
 * @side_effects なし（サービス層経由でファイル操作）
 * @failure_modes バリデーションエラー、サービスエラー
 *
 * @abdd.explain
 * @overview タスクCRUDのHTTP API
 * @what_it_does GET/POST/PUT/PATCH/DELETE エンドポイント
 * @why_it_exists HTTPインターフェースの提供
 * @scope(in) HTTPリクエスト
 * @scope(out) JSON レスポンス
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getTaskService } from "../services/task-service.js";
import { CreateTaskSchema, UpdateTaskSchema, TaskFilterSchema } from "../schemas/task.schema.js";
import { z } from "zod";
import type { SuccessResponse } from "../schemas/common.schema.js";
import type { Task, TaskStats, CreateTaskInput, UpdateTaskInput } from "../schemas/task.schema.js";

/**
 * IDパラメータスキーマ
 */
const IdParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * タスクルート
 */
export const taskRoutes = new Hono();

/**
 * GET /api/tasks - タスク一覧
 */
taskRoutes.get("/", zValidator("query", TaskFilterSchema), (c) => {
  const service = getTaskService();
  const filter = c.req.valid("query");
  const tasks = service.list(filter as Parameters<typeof service.list>[0]);

  return c.json<SuccessResponse<Task[]>>({
    success: true,
    data: tasks,
  });
});

/**
 * GET /api/tasks/stats - タスク統計
 */
taskRoutes.get("/stats", (c) => {
  const service = getTaskService();
  const stats = service.getStats();

  return c.json<SuccessResponse<TaskStats>>({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/tasks/:id - タスク詳細
 */
taskRoutes.get("/:id", zValidator("param", IdParamSchema), (c) => {
  const { id } = c.req.valid("param");
  const service = getTaskService();
  const task = service.getById(id);

  if (!task) {
    return c.json({ success: false, error: "タスクが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<Task>>({
    success: true,
    data: task,
  });
});

/**
 * POST /api/tasks - タスク作成
 */
taskRoutes.post("/", zValidator("json", CreateTaskSchema), (c) => {
  const input = c.req.valid("json");
  const service = getTaskService();
  const task = service.create(input as CreateTaskInput);

  return c.json<SuccessResponse<Task>>({
    success: true,
    data: task,
  }, 201);
});

/**
 * PUT /api/tasks/:id - タスク更新
 */
taskRoutes.put("/:id", zValidator("param", IdParamSchema), zValidator("json", UpdateTaskSchema), (c) => {
  const { id } = c.req.valid("param");
  const input = c.req.valid("json");
  const service = getTaskService();
  const task = service.update(id, input as UpdateTaskInput);

  if (!task) {
    return c.json({ success: false, error: "タスクが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<Task>>({
    success: true,
    data: task,
  });
});

/**
 * PATCH /api/tasks/:id/complete - タスク完了
 */
taskRoutes.patch("/:id/complete", zValidator("param", IdParamSchema), (c) => {
  const { id } = c.req.valid("param");
  const service = getTaskService();
  const task = service.complete(id);

  if (!task) {
    return c.json({ success: false, error: "タスクが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<Task>>({
    success: true,
    data: task,
  });
});

/**
 * DELETE /api/tasks/:id - タスク削除
 */
taskRoutes.delete("/:id", zValidator("param", IdParamSchema), (c) => {
  const { id } = c.req.valid("param");
  const service = getTaskService();
  const deleted = service.delete(id);

  if (!deleted) {
    return c.json({ success: false, error: "タスクが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<{ deletedTaskId: string }>>({
    success: true,
    data: { deletedTaskId: id },
  });
});
