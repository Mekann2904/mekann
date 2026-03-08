/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/ul-workflow.ts
 * @role UL Workflow API routes for web-ui server
 * @why Provide RESTful API for UL workflow task access
 * @related server.ts, routes/*.ts
 * @public_api registerUlWorkflowRoutes
 * @invariants Read-only access to UL workflow tasks
 * @side_effects Reads UL workflow task files
 * @failure_modes File system errors, JSON parse errors
 *
 * @abdd.explain
 * @overview UL workflow task API endpoints (read-only)
 * @what_it_does Lists and retrieves UL workflow tasks
 * @why_it_exists Enables UL workflow visualization via web UI
 * @scope(in) HTTP requests with task IDs
 * @scope(out) JSON responses with task data
 */

import type { Express, Request, Response } from "express";
import {
  getAllUlWorkflowTasks,
  getUlWorkflowTask,
  getActiveUlWorkflowTask,
} from "../lib/ul-workflow-reader.js";

/**
 * @summary Register UL workflow routes on Express app
 * @param app - Express application instance
 */
export function registerUlWorkflowRoutes(app: Express): void {
  /**
   * GET /api/ul-workflow/tasks - Get all UL workflow tasks
   */
  app.get("/api/ul-workflow/tasks", (_req: Request, res: Response) => {
    try {
      const tasks = getAllUlWorkflowTasks();
      res.json({ success: true, data: tasks, total: tasks.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load UL workflow tasks", details: errorMessage });
    }
  });

  /**
   * GET /api/ul-workflow/tasks/active - Get active UL workflow task
   */
  app.get("/api/ul-workflow/tasks/active", (_req: Request, res: Response) => {
    try {
      const task = getActiveUlWorkflowTask();
      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load active UL workflow task", details: errorMessage });
    }
  });

  /**
   * GET /api/ul-workflow/tasks/:id - Get single UL workflow task
   */
  app.get("/api/ul-workflow/tasks/:id", (req: Request, res: Response) => {
    try {
      const rawTaskId = req.params.id;
      if (!rawTaskId) {
        res.status(400).json({ success: false, error: "Task id is required" });
        return;
      }

      const taskId = rawTaskId.startsWith("ul-")
        ? rawTaskId.slice(3)
        : rawTaskId;
      const task = getUlWorkflowTask(taskId);
      if (!task) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }
      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load task", details: errorMessage });
    }
  });
}
