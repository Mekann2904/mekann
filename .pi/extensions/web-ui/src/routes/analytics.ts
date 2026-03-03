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

/**
 * クエリパラメータスキーマ
 */
const RecordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});

const AggregatesQuerySchema = z.object({
  type: z.enum(["hourly", "daily", "weekly"]).default("daily"),
  range: z.string().optional(),
});

/**
 * Analyticsルート
 */
export const analyticsRoutes = new Hono();

/**
 * 動的インポートでモジュールをロード
 */
async function loadAnalyticsModules() {
  const [
    { getStorageStats, loadRecentRecords },
    { getAggregationSummary, loadAggregates },
    { getAnomalySummary },
  ] = await Promise.all([
    import("../../lib/analytics/behavior-storage.js"),
    import("../../lib/analytics/aggregator.js"),
    import("../../lib/analytics/anomaly-detector.js"),
  ]);

  return { getStorageStats, loadRecentRecords, getAggregationSummary, loadAggregates, getAnomalySummary };
}

/**
 * GET /stats - ストレージ統計
 */
analyticsRoutes.get("/stats", async (c) => {
  try {
    const { getStorageStats } = await loadAnalyticsModules();
    const stats = getStorageStats();
    return c.json({ success: true, data: stats });
  } catch (error) {
    console.error("[analytics] Error in /stats:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get stats", details: message }, 500);
  }
});

/**
 * GET /records - 最近の行動記録
 */
analyticsRoutes.get("/records", async (c) => {
  try {
    const query = RecordsQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ success: false, error: "Invalid query", details: query.error.message }, 400);
    }

    const { loadRecentRecords } = await loadAnalyticsModules();
    const { limit } = query.data;
    const records = loadRecentRecords(limit);
    return c.json({ success: true, data: records });
  } catch (error) {
    console.error("[analytics] Error in /records:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get records", details: message }, 500);
  }
});

/**
 * GET /aggregates - 集計データ
 */
analyticsRoutes.get("/aggregates", async (c) => {
  try {
    const query = AggregatesQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ success: false, error: "Invalid query", details: query.error.message }, 400);
    }

    const { loadAggregates } = await loadAnalyticsModules();
    const { type } = query.data;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const aggregates = loadAggregates(type, startDate, endDate);
    return c.json({ success: true, data: aggregates });
  } catch (error) {
    console.error("[analytics] Error in /aggregates:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get aggregates", details: message }, 500);
  }
});

/**
 * GET /summary - 集計サマリー
 */
analyticsRoutes.get("/summary", async (c) => {
  try {
    const { getAggregationSummary } = await loadAnalyticsModules();
    const summary = getAggregationSummary();
    return c.json({ success: true, data: summary });
  } catch (error) {
    console.error("[analytics] Error in /summary:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get summary", details: message }, 500);
  }
});

/**
 * GET /anomalies - 異常検知
 */
analyticsRoutes.get("/anomalies", async (c) => {
  try {
    const { getAnomalySummary } = await loadAnalyticsModules();
    const summary = getAnomalySummary();
    return c.json({ success: true, data: summary });
  } catch (error) {
    console.error("[analytics] Error in /anomalies:", error);
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ success: false, error: "Failed to get anomalies", details: message }, 500);
  }
});
