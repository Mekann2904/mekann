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

interface AnalyticsModules {
  getStorageStats: (cwd?: string) => unknown;
  loadRecentRecords: (limit: number, cwd?: string) => unknown[];
  loadBehaviorRecords: (startDate: Date, endDate: Date, cwd?: string) => unknown[];
  getAggregationSummary: (cwd?: string) => unknown;
  loadAggregates: (
    period: "hourly" | "daily" | "weekly",
    startDate: Date,
    endDate: Date,
    cwd?: string,
  ) => unknown[];
  calculateAggregates: (
    records: unknown[],
    period?: "hour" | "day" | "week",
  ) => unknown;
  getAnomalySummary: (cwd?: string) => unknown;
}

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
    { loadBehaviorRecords },
    { getAggregationSummary, loadAggregates },
    { calculateAggregates },
    { getAnomalySummary },
  ] = await Promise.all([
    import("../../lib/analytics/behavior-storage.js"),
    import("../../lib/analytics/behavior-storage.js"),
    import("../../lib/analytics/aggregator.js"),
    import("../../lib/analytics/efficiency-analyzer.js"),
    import("../../lib/analytics/anomaly-detector.js"),
  ]);

  return {
    getStorageStats,
    loadRecentRecords,
    loadBehaviorRecords,
    getAggregationSummary,
    loadAggregates,
    calculateAggregates,
    getAnomalySummary,
  } satisfies AnalyticsModules;
}

function resolveRange(range: string | undefined): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date(endDate);

  if (range === "24h") {
    startDate.setHours(startDate.getHours() - 24);
    return { startDate, endDate };
  }

  if (range === "30d") {
    startDate.setDate(startDate.getDate() - 30);
    return { startDate, endDate };
  }

  startDate.setDate(startDate.getDate() - 7);
  return { startDate, endDate };
}

function getBucketPeriod(type: "hourly" | "daily" | "weekly"): "hour" | "day" | "week" {
  if (type === "hourly") return "hour";
  if (type === "weekly") return "week";
  return "day";
}

function createBucketStart(date: Date, type: "hourly" | "daily" | "weekly"): Date {
  const bucketStart = new Date(date);

  if (type === "hourly") {
    bucketStart.setMinutes(0, 0, 0);
    return bucketStart;
  }

  if (type === "daily") {
    bucketStart.setHours(0, 0, 0, 0);
    return bucketStart;
  }

  const dayOfWeek = bucketStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  bucketStart.setDate(bucketStart.getDate() + diff);
  bucketStart.setHours(0, 0, 0, 0);
  return bucketStart;
}

function advanceBucket(date: Date, type: "hourly" | "daily" | "weekly"): Date {
  const next = new Date(date);

  if (type === "hourly") {
    next.setHours(next.getHours() + 1);
    return next;
  }

  if (type === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  next.setDate(next.getDate() + 7);
  return next;
}

function buildLiveAggregates(
  modules: AnalyticsModules,
  type: "hourly" | "daily" | "weekly",
  startDate: Date,
  endDate: Date,
): unknown[] {
  const records = modules.loadBehaviorRecords(startDate, endDate);
  if (records.length === 0) {
    return [];
  }

  const bucketPeriod = getBucketPeriod(type);
  const aggregates: unknown[] = [];
  let bucketStart = createBucketStart(startDate, type);

  while (bucketStart <= endDate) {
    const bucketEnd = advanceBucket(bucketStart, type);
    const bucketRecords = records.filter((record) => {
      const maybeTimestamp =
        typeof record === "object" &&
        record !== null &&
        "timestamp" in record &&
        typeof (record as { timestamp?: unknown }).timestamp === "string"
          ? (record as { timestamp: string }).timestamp
          : null;

      if (!maybeTimestamp) return false;
      const timestamp = new Date(maybeTimestamp);
      return timestamp >= bucketStart && timestamp < bucketEnd;
    });

    if (bucketRecords.length > 0) {
      const aggregate = modules.calculateAggregates(bucketRecords, bucketPeriod);
      if (aggregate) {
        aggregates.push(aggregate);
      }
    }

    bucketStart = bucketEnd;
  }

  return aggregates;
}

function buildLiveSummary(modules: AnalyticsModules): {
  today: unknown | null;
  thisWeek: unknown | null;
  last24Hours: unknown[];
} {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const last24HoursStart = new Date(now);
  last24HoursStart.setHours(last24HoursStart.getHours() - 24);

  const todayRecords = modules.loadBehaviorRecords(todayStart, now);
  const weekRecords = modules.loadBehaviorRecords(weekStart, now);
  const last24Hours = buildLiveAggregates(modules, "hourly", last24HoursStart, now);

  return {
    today: modules.calculateAggregates(todayRecords, "day"),
    thisWeek: modules.calculateAggregates(weekRecords, "week"),
    last24Hours,
  };
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

    const modules = await loadAnalyticsModules();
    const { type, range } = query.data;
    const { startDate, endDate } = resolveRange(range);

    const storedAggregates = modules.loadAggregates(type, startDate, endDate);
    const liveAggregates = buildLiveAggregates(modules, type, startDate, endDate);
    const aggregates = liveAggregates.length > 0 ? liveAggregates : storedAggregates;

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
    const modules = await loadAnalyticsModules();
    const storedSummary = modules.getAggregationSummary();
    const liveSummary = buildLiveSummary(modules);

    const summary = {
      today: liveSummary.today ?? (storedSummary as { today?: unknown } | null)?.today ?? null,
      thisWeek: liveSummary.thisWeek ?? (storedSummary as { thisWeek?: unknown } | null)?.thisWeek ?? null,
      last24Hours:
        liveSummary.last24Hours.length > 0
          ? liveSummary.last24Hours
          : ((storedSummary as { last24Hours?: unknown[] } | null)?.last24Hours ?? []),
    };

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
