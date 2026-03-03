/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/context-history.ts
 * @role コンテキスト履歴APIルート
 * @why HonoベースのAPI
 * @related lib/instance-registry.ts
 * @public_api contextHistoryRoutes
 * @invariants なし
 * @side_effects ファイル読み込み
 * @failure_modes ファイルシステムエラー
 */

import { Hono } from "hono";
import { ContextHistoryStorage } from "../../lib/instance-registry.js";
import type { SuccessResponse } from "../schemas/common.schema.js";
import type { InstanceContextHistory } from "../schemas/instance.schema.js";

/**
 * コンテキスト履歴ルート
 */
export const contextHistoryRoutes = new Hono();

/**
 * GET / - 全インスタンスのコンテキスト履歴を取得
 */
contextHistoryRoutes.get("/", (c) => {
  try {
    const historyMap = ContextHistoryStorage.getAllInstances();
    const history = Array.from(historyMap.entries()).map(([pid, entries]) => ({
      pid,
      history: entries,
    }));
    return c.json<SuccessResponse<InstanceContextHistory[]>>({
      success: true,
      data: history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get context history", details: message }, 500);
  }
});

/**
 * GET /:pid - 特定インスタンスのコンテキスト履歴を取得
 */
contextHistoryRoutes.get("/:pid", (c) => {
  try {
    const pid = parseInt(c.req.param("pid"), 10);

    if (isNaN(pid)) {
      return c.json({ success: false, error: "Invalid PID" }, 400);
    }

    // 特定PIDの履歴を取得
    const historyMap = ContextHistoryStorage.getAllInstances();
    const entries = historyMap.get(pid);

    if (!entries) {
      return c.json({ success: false, error: "Instance not found" }, 404);
    }

    return c.json({
      success: true,
      data: { pid, history: entries },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get context history", details: message }, 500);
  }
});
