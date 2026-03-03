/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/analytics.ts
 * @role Analytics API routes (Hono)
 * @why HonoベースのAPIとして再実装
 * @related routes/analytics.ts (Express版), schemas/analytics.schema.ts
 * @public_api analyticsRoutes
 * @invariants なし
 * @side_effects .pi/analytics/ 配下のファイル読み込み
 * @failure_modes ファイルシステムエラー
 *
 * @abdd.explain
 * @overview 分析データのHono APIエンドポイント
 * @what_it_does ストレージ統計、行動記録、集計、異常検知を提供
 * @why_it_exists Hono APIへの移行
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getStorageStats,
  loadRecentRecords,
} from "../../lib/analytics/behavior-storage.js";
import {
  getAggregationSummary,
  loadAggregates,
} from "../../lib/analytics/aggregator.js";
import {
  getAnomalySummary,
} from "../../lib/analytics/anomaly-detector.js";

/**
 * クエリパラメータスキーマ
 */
const RecordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});

const AggregatesQuerySchema = z.object({
  type: z.enum(["hourly", "daily", "weekly"]).default("daily"),
});

/**
 * Analyticsルート
 */
export const analyticsRoutes = new Hono();

/**
 * GET / - ストレージ統計
 */
analyticsRoutes.get("/stats", (c) => {
  try {
    const stats = getStorageStats();
    return c.json({ success: true, data: stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get stats", details: message }, 500);
  }
});

/**
 * GET /records - 最近の行動記録
 */
analyticsRoutes.get("/records", (c) => {
  try {
    const query = RecordsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ success: false, error: "Invalid query", details: query.error.message }, 400);
    }

    const { limit } = query.data;
    const records = loadRecentRecords(limit);
    return c.json({ success: true, data: records });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get records", details: message }, 500);
  }
});

/**
 * GET /aggregates - 集計データ
 */
analyticsRoutes.get("/aggregates", (c) => {
  try {
    const query = AggregatesQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ success: false, error: "Invalid query", details: query.error.message }, 400);
    }

    const { type } = query.data;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const aggregates = loadAggregates(type, startDate, endDate);
    return c.json({ success: true, data: aggregates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get aggregates", details: message }, 500);
  }
});

/**
 * GET /summary - 集計サマリー
 */
analyticsRoutes.get("/summary", (c) => {
  try {
    const summary = getAggregationSummary();
    return c.json({ success: true, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get summary", details: message }, 500);
  }
});

/**
 * GET /anomalies - 異常検知
 */
analyticsRoutes.get("/anomalies", (c) => {
  try {
    const summary = getAnomalySummary();
    return c.json({ success: true, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get anomalies", details: message }, 500);
  }
});
