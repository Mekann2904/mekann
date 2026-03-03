/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/instances.ts
 * @role Instance API routes for web-ui server
 * @why Provide RESTful API for instance management and configuration
 * @related server.ts, routes/*.ts
 * @public_api registerInstanceRoutes
 * @invariants Instance registry must be consistent across all instances
 * @side_effects Reads/writes instance registry, theme settings
 * @failure_modes Registry file errors, theme file errors
 *
 * @abdd.explain
 * @overview Instance management API endpoints
 * @what_it_does Lists instances, manages theme settings, provides status
 * @why_it_exists Enables multi-instance management via web UI
 * @scope(in) HTTP requests with instance/theme data
 * @scope(out) JSON responses with instance info, theme settings
 */

import type { Express, Request, Response } from "express";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  InstanceRegistry,
  ThemeStorage,
  ContextHistoryStorage,
  type ThemeSettings,
  type InstanceContextHistory,
} from "../lib/instance-registry.js";

/**
 * @summary Register instance routes on Express app
 * @param app - Express application instance
 * @param getCtx - Function to get extension context
 */
export function registerInstanceRoutes(
  app: Express,
  getCtx: () => ExtensionContext | null
): void {
  /**
   * GET /api/status - Current instance status
   */
  app.get("/api/status", (_req: Request, res: Response) => {
    const ctx = getCtx();
    if (!ctx) {
      res.status(503).json({ error: "Context not available" });
      return;
    }

    const contextUsage = ctx.getContextUsage();
    res.json({
      status: {
        model: ctx.model?.id ?? "unknown",
        cwd: ctx.cwd,
        contextUsage: contextUsage?.percent ?? 0,
        totalTokens: contextUsage?.tokens ?? 0,
        cost: 0, // TODO: integrate with usage tracking
      },
    });
  });

  /**
   * GET /api/instances - All running instances
   */
  app.get("/api/instances", (_req: Request, res: Response) => {
    try {
      const instances = InstanceRegistry.getAll();
      res.json({
        instances,
        count: instances.length,
        serverPid: process.pid,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get instances" });
    }
  });

  /**
   * GET /api/theme - Get global theme settings
   */
  app.get("/api/theme", (_req: Request, res: Response) => {
    try {
      const theme = ThemeStorage.get();
      res.json(theme);
    } catch (error) {
      res.status(500).json({ error: "Failed to get theme" });
    }
  });

  /**
   * POST /api/theme - Update global theme settings
   */
  app.post("/api/theme", (req: Request, res: Response) => {
    try {
      const { themeId, mode } = req.body as Partial<ThemeSettings>;

      if (!themeId || !mode) {
        res.status(400).json({ error: "Missing themeId or mode" });
        return;
      }

      if (mode !== "light" && mode !== "dark") {
        res.status(400).json({ error: "Invalid mode" });
        return;
      }

      ThemeStorage.set({ themeId, mode });
      res.json({ success: true, themeId, mode });
    } catch (error) {
      res.status(500).json({ error: "Failed to save theme" });
    }
  });

  /**
   * POST /api/config - Update configuration
   */
  app.post("/api/config", (req: Request, res: Response) => {
    // TODO: implement config persistence
    res.json({ success: true, config: req.body });
  });

  /**
   * GET /api/context-history - 全インスタンスのコンテキスト使用量履歴を取得
   */
  app.get("/api/context-history", (_req: Request, res: Response) => {
    try {
      const instancesHistory = ContextHistoryStorage.getActiveInstancesHistory();

      // レスポンス形式をマップに変換
      const instances: Record<number, InstanceContextHistory> = {};
      for (const instance of instancesHistory) {
        instances[instance.pid] = instance;
      }

      res.json({ instances });
    } catch (error) {
      res.status(500).json({ error: "Failed to get context history" });
    }
  });


}
