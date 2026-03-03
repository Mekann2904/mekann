/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/agent-usage.ts
 * @role エージェント使用量APIルート
 * @why HonoベースのAPI
 * @related routes/agent-usage.ts (Express版)
 * @public_api agentUsageRoutes
 * @invariants なし
 * @side_effects ファイル読み込み
 * @failure_modes ファイルシステムエラー
 */

import { Hono } from "hono";
import fs from "fs";
import path from "path";
import type { SuccessResponse } from "../schemas/common.schema.js";

/**
 * エージェント使用量ルート
 */
export const agentUsageRoutes = new Hono();

/**
 * GET / - エージェント使用量を取得
 */
agentUsageRoutes.get("/", (c) => {
  try {
    const usagePath = path.join(process.cwd(), ".pi", "agent-usage.json");

    if (!fs.existsSync(usagePath)) {
      return c.json<SuccessResponse<null>>({
        success: true,
        data: null,
      });
    }

    const content = fs.readFileSync(usagePath, "utf-8");
    const data = JSON.parse(content);

    return c.json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get agent usage", details: message }, 500);
  }
});
