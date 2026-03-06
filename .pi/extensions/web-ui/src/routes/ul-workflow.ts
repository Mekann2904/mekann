/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/ul-workflow.ts
 * @role UL Workflow APIルート (Hono)
 * @why HonoベースのAPIで UL ワークフローの参照と削除を扱う
 * @related lib/ul-workflow-reader.ts
 * @public_api ulWorkflowRoutes
 * @invariants 削除後は active レジストリとキャッシュが整合する
 * @side_effects ULワークフローファイルの読み書き
 * @failure_modes ファイルシステムエラー
 */

import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
  invalidateCache,
} from "../../lib/ul-workflow-reader.js";
import type { SuccessResponse } from "../schemas/common.schema.js";

/**
 * ULワークフロールート
 */
export const ulWorkflowRoutes = new Hono();

interface ActiveWorkflowRegistryEntry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
}

interface ActiveWorkflowRegistry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
  activeByInstance?: Record<string, ActiveWorkflowRegistryEntry>;
}

export function normalizeUlTaskId(taskId: string): string {
  return taskId.startsWith("ul-") ? taskId.slice(3) : taskId;
}

function resolveLatestActiveEntry(
  activeByInstance: Record<string, ActiveWorkflowRegistryEntry> | undefined,
): ActiveWorkflowRegistryEntry {
  const entries = Object.values(activeByInstance ?? {}).filter(
    (entry) => entry.activeTaskId,
  );

  if (entries.length === 0) {
    return {
      activeTaskId: null,
      ownerInstanceId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return entries[0];
}

export function deleteUlWorkflowTaskFiles(baseDir: string, taskId: string): boolean {
  const rawTaskId = normalizeUlTaskId(taskId);
  const ulWorkflowDir = path.join(baseDir, ".pi", "ul-workflow");
  const taskDir = path.join(ulWorkflowDir, "tasks", rawTaskId);
  const activePath = path.join(ulWorkflowDir, "active.json");
  const taskExists = fs.existsSync(taskDir);

  let registryChanged = false;

  if (fs.existsSync(activePath)) {
    try {
      const raw = fs.readFileSync(activePath, "utf-8");
      const registry = JSON.parse(raw) as Partial<ActiveWorkflowRegistry>;
      const nextRegistry: ActiveWorkflowRegistry = {
        activeTaskId: registry.activeTaskId ?? null,
        ownerInstanceId: registry.ownerInstanceId ?? null,
        updatedAt: registry.updatedAt ?? new Date().toISOString(),
        activeByInstance: { ...(registry.activeByInstance ?? {}) },
      };

      for (const [instanceId, entry] of Object.entries(nextRegistry.activeByInstance ?? {})) {
        if (entry.activeTaskId === rawTaskId) {
          delete nextRegistry.activeByInstance![instanceId];
          registryChanged = true;
        }
      }

      if (nextRegistry.activeTaskId === rawTaskId) {
        registryChanged = true;
      }

      if (registryChanged) {
        const latestEntry = resolveLatestActiveEntry(nextRegistry.activeByInstance);
        nextRegistry.activeTaskId = latestEntry.activeTaskId;
        nextRegistry.ownerInstanceId = latestEntry.ownerInstanceId;
        nextRegistry.updatedAt = latestEntry.updatedAt;
        fs.writeFileSync(activePath, JSON.stringify(nextRegistry, null, 2), "utf-8");
      }
    } catch {
      // active.json が壊れていても task 削除は続行する
    }
  }

  if (!taskExists) {
    if (registryChanged) {
      invalidateCache();
    }
    return false;
  }

  fs.rmSync(taskDir, { recursive: true, force: true });
  invalidateCache();
  return true;
}

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
    const taskId = normalizeUlTaskId(rawId);

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

/**
 * DELETE /tasks/:id - 特定のULワークフロータスクを削除
 */
ulWorkflowRoutes.delete("/tasks/:id", (c) => {
  try {
    const rawId = c.req.param("id");
    const deleted = deleteUlWorkflowTaskFiles(process.cwd(), rawId);

    if (!deleted) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({
      success: true,
      data: { deletedTaskId: rawId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json(
      { success: false, error: "Failed to delete UL workflow task", details: message },
      500
    );
  }
});
