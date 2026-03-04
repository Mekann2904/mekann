/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/ul-workflow.ts
 * @role UL Workflow APIルート (Hono)
 * @why HonoベースのAPI
 * @related lib/ul-workflow-reader.ts
 * @public_api ulWorkflowRoutes
 * @invariants 読み取り専用
 * @side_effects ULワークフローファイル読み込み
 * @failure_modes ファイルシステムエラー
 */

import { Hono } from "hono";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
} from "../../lib/ul-workflow-reader.js";
import type { SuccessResponse } from "../schemas/common.schema.js";

/**
 * ULワークフロールート
 */
export const ulWorkflowRoutes = new Hono();

/**
 * GET /tasks - 全ULワークフロータスクを取得
 */
ulWorkflowRoutes.get("/tasks", (c) => {
  try {
    const tasks = getAllUlWorkflowTasks();
    return c.json({
      success: true,
      data: tasks,
      total: tasks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      { success: false, error: "Failed to load UL workflow tasks", details: message },
      500
    );
  }
});

/**
 * GET /tasks/active - アクティブなULワークフロータスクを取得
 */
ulWorkflowRoutes.get("/tasks/active", (c) => {
  try {
    const task = getActiveUlWorkflowTask();
    return c.json<SuccessResponse<typeof task>>({
      success: true,
      data: task,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      { success: false, error: "Failed to load active UL workflow task", details: message },
      500
    );
  }
});

/**
 * GET /tasks/:id - 特定のULワークフロータスクを取得
 */
ulWorkflowRoutes.get("/tasks/:id", (c) => {
  try {
    const rawId = c.req.param("id");
    const taskId = rawId.startsWith("ul-") ? rawId.slice(3) : rawId;

    const task = getUlWorkflowTask(taskId);
    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({
      success: true,
      data: task,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      { success: false, error: "Failed to load task", details: message },
      500
    );
  }
});
