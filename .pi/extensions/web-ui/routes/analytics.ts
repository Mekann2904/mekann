/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/analytics.ts
 * @role Analytics API routes for web-ui server
 * @why Provide RESTful API for analytics data access
 * @related server.ts, routes/*.ts
 * @public_api registerAnalyticsRoutes
 * @invariants None
 * @side_effects Reads analytics files from .pi/analytics/
 * @failure_modes File system errors, JSON parse errors
 *
 * @abdd.explain
 * @overview Analytics data API endpoints
 * @what_it_does Provides storage stats, behavior records, aggregates, anomalies
 * @why_it_exists Enables analytics visualization via web UI
 * @scope(in) HTTP requests with query parameters
 * @scope(out) JSON responses with analytics data
 */

import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import {
  getStorageStats,
  loadRecentRecords,
  getAnalyticsPaths,
} from "../../../lib/analytics/behavior-storage.js";
import {
  getAggregationSummary,
  loadAggregates,
} from "../../../lib/analytics/aggregator.js";
import {
  getAnomalySummary,
} from "../../../lib/analytics/anomaly-detector.js";

/**
 * @summary Register analytics routes on Express app
 * @param app - Express application instance
 */
export function registerAnalyticsRoutes(app: Express): void {
  /**
   * GET /api/analytics/stats - Get storage statistics
   */
  app.get("/api/analytics/stats", (_req: Request, res: Response) => {
    try {
      const stats = getStorageStats();
      res.json(stats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get stats", details: errorMessage });
    }
  });

  /**
   * GET /api/analytics/records - Get recent behavior records
   */
  app.get("/api/analytics/records", (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || "50", 10);
      const records = loadRecentRecords(limit);
      res.json(records);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get records", details: errorMessage });
    }
  });

  /**
   * GET /api/analytics/aggregates - Get aggregated data
   */
  app.get("/api/analytics/aggregates", (req: Request, res: Response) => {
    try {
      const type = (req.query.type as string || "daily") as "hourly" | "daily" | "weekly";
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const aggregates = loadAggregates(type, startDate, endDate);
      res.json(aggregates);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get aggregates", details: errorMessage });
    }
  });

  /**
   * GET /api/analytics/anomalies - Get anomaly summary
   */
  app.get("/api/analytics/anomalies", (_req: Request, res: Response) => {
    try {
      const summary = getAnomalySummary();
      res.json(summary);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get anomalies", details: errorMessage });
    }
  });

  /**
   * GET /api/analytics/summary - Get aggregation summary
   */
  app.get("/api/analytics/summary", (_req: Request, res: Response) => {
    try {
      const summary = getAggregationSummary();
      res.json(summary);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get summary", details: errorMessage });
    }
  });

  /**
   * GET /api/analytics/paths - Get analytics paths
   */
  app.get("/api/analytics/paths", (_req: Request, res: Response) => {
    try {
      const paths = getAnalyticsPaths();
      res.json(paths);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get paths", details: errorMessage });
    }
  });

  /**
   * GET /api/agent-usage - Get agent usage statistics
   */
  app.get("/api/agent-usage", (_req: Request, res: Response) => {
    try {
      const usageFile = path.join(process.cwd(), ".pi", "analytics", "agent-usage-stats.json");

      if (!fs.existsSync(usageFile)) {
        res.json({
          success: true,
          data: {
            totals: {
              toolCalls: 0,
              toolErrors: 0,
              agentRuns: 0,
              agentRunErrors: 0,
              contextSamples: 0,
              contextRatioSum: 0,
              contextTokenSamples: 0,
              contextTokenSum: 0,
            },
            features: {},
            events: [],
          },
        });
        return;
      }

      const rawData = fs.readFileSync(usageFile, "utf-8");
      const data = JSON.parse(rawData);

      res.json({ success: true, data });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to get agent usage", details: errorMessage });
    }
  });
}
