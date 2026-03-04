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
    // 正しいパス: .pi/analytics/agent-usage-stats.json
    const usagePath = path.join(process.cwd(), ".pi", "analytics", "agent-usage-stats.json");

    if (!fs.existsSync(usagePath)) {
      return c.json({ data: { features: {}, events: [], totals: { calls: 0, errors: 0 } } });
    }

    const content = fs.readFileSync(usagePath, "utf-8");
    const rawData = JSON.parse(content);

    // フロントエンドが期待する形式に変換
    const data = {
      ...rawData,
      totals: {
        calls: rawData.totals.toolCalls ?? rawData.totals.calls ?? 0,
        errors: rawData.totals.toolErrors ?? rawData.totals.errors ?? 0,
        agentRuns: rawData.totals.agentRuns ?? 0,
        agentRunErrors: rawData.totals.agentRunErrors ?? 0,
      }
    };

    // フロントエンドが期待する形式で返す（dataラッパー付き）
    return c.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get agent usage", details: message }, 500);
  }
});
