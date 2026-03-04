/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/instances.ts
 * @role インスタンスAPIルート定義
 * @why インスタンス管理のHTTPエンドポイント
 * @related services/instance-service.ts, schemas/instance.schema.ts
 * @public_api instanceRoutes
 * @invariants すべてのレスポンスは統一形式
 * @side_effects なし
 * @failure_modes バリデーションエラー
 *
 * @abdd.explain
 * @overview インスタンス情報のHTTP API
 * @what_it_does GET エンドポイント
 * @why_it_exists HTTPインターフェースの提供
 * @scope(in) HTTPリクエスト
 * @scope(out) JSON レスポンス
 */

import { Hono } from "hono";
import { getInstanceService } from "../services/instance-service.js";
import type { SuccessResponse } from "../schemas/common.schema.js";
import type { InstanceInfo, InstanceStats, InstanceContextHistory } from "../schemas/instance.schema.js";

/**
 * インスタンスルート
 */
export const instanceRoutes = new Hono();

/**
 * GET /api/instances - インスタンス一覧
 */
instanceRoutes.get("/", (c) => {
  const service = getInstanceService();
  const instances = service.list();

  return c.json<SuccessResponse<InstanceInfo[]>>({
    success: true,
    data: instances,
  });
});

/**
 * GET /api/instances/stats - インスタンス統計
 */
instanceRoutes.get("/stats", (c) => {
  const service = getInstanceService();
  const stats = service.getStats();

  return c.json<SuccessResponse<InstanceStats>>({
    success: true,
    data: stats,
  });
});

/**
 * GET /api/instances/history - コンテキスト履歴
 */
instanceRoutes.get("/history", (c) => {
  const service = getInstanceService();
  const history = service.getContextHistory();

  return c.json<SuccessResponse<InstanceContextHistory[]>>({
    success: true,
    data: history,
  });
});

/**
 * GET /api/instances/:pid - 特定インスタンス
 */
instanceRoutes.get("/:pid", (c) => {
  const pid = parseInt(c.req.param("pid"), 10);

  if (isNaN(pid)) {
    return c.json({ success: false, error: "無効なPIDです" }, 400);
  }

  const service = getInstanceService();
  const instance = service.getByPid(pid);

  if (!instance) {
    return c.json({ success: false, error: "インスタンスが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<InstanceInfo>>({
    success: true,
    data: instance,
  });
});

/**
 * DELETE /api/instances/:pid - インスタンス削除
 */
instanceRoutes.delete("/:pid", (c) => {
  const pid = parseInt(c.req.param("pid"), 10);

  if (isNaN(pid)) {
    return c.json({ success: false, error: "無効なPIDです" }, 400);
  }

  const service = getInstanceService();
  const deleted = service.unregister(pid);

  if (!deleted) {
    return c.json({ success: false, error: "インスタンスが見つかりません" }, 404);
  }

  return c.json<SuccessResponse<{ deletedPid: number }>>({
    success: true,
    data: { deletedPid: pid },
  });
});
