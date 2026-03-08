/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/tasks.ts
 * @role Task API routes for web-ui server
 * @why Provide RESTful API for task management
 * @related server.ts, routes/*.ts, lib/task-storage.ts
 * @public_api registerTaskRoutes
 * @invariants Task IDs must be unique, storage must be atomic
 * @side_effects Reads/writes .pi/tasks/storage.json
 * @failure_modes File system errors, JSON parse errors
 *
 * @abdd.explain
 * @overview Task management API endpoints
 * @what_it_does CRUD operations for tasks, filtering, statistics
 * @why_it_exists Enables task tracking and management via web UI
 * @scope(in) HTTP requests with task data
 * @scope(out) JSON responses with task data
 */

import type { Express, Request, Response } from "express";
import { loadTaskStorage, saveTaskStorage, type Task } from "../lib/task-storage.js";

/**
 * @summary 生のbodyを安全なオブジェクトへ正規化する
 * @param body - Express request body
 * @returns キー参照可能なオブジェクト
 */
function normalizeTaskBody(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

/**
 * @summary 任意値を文字列へ正規化する
 * @param value - 入力値
 * @returns 文字列またはundefined
 */
function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * @summary 任意値を文字列配列へ正規化する
 * @param value - 入力値
 * @returns 文字列配列
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * @summary 任意値をTask statusへ正規化する
 * @param value - 入力値
 * @param fallback - 不正値時の既定値
 * @returns 安全なstatus
 */
function toTaskStatus(value: unknown, fallback: Task["status"]): Task["status"] {
  return value === "todo" || value === "in_progress" || value === "completed" || value === "cancelled"
    ? value
    : fallback;
}

/**
 * @summary 任意値をTask priorityへ正規化する
 * @param value - 入力値
 * @param fallback - 不正値時の既定値
 * @returns 安全なpriority
 */
function toTaskPriority(value: unknown, fallback: Task["priority"]): Task["priority"] {
  return value === "low" || value === "medium" || value === "high" || value === "urgent"
    ? value
    : fallback;
}

/**
 * @summary Register task routes on Express app
 * @param app - Express application instance
 */
export function registerTaskRoutes(app: Express): void {
  /**
   * GET /api/tasks - List tasks with filters
   */
  app.get("/api/tasks", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      let tasks = [...storage.tasks];

      // Apply filters
      const { status, priority, tag, assignee, overdue } = req.query;

      if (status && typeof status === "string") {
        const statuses = status.split(",");
        tasks = tasks.filter((t) => statuses.includes(t.status));
      }

      if (priority && typeof priority === "string") {
        const priorities = priority.split(",");
        tasks = tasks.filter((t) => priorities.includes(t.priority));
      }

      if (tag && typeof tag === "string") {
        tasks = tasks.filter((t) => t.tags.includes(tag));
      }

      if (assignee && typeof assignee === "string") {
        tasks = tasks.filter((t) => t.assignee === assignee);
      }

      if (overdue === "true") {
        const now = new Date();
        tasks = tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < now &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        );
      }

      // Sort by priority (urgent > high > medium > low)
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      tasks.sort((a, b) => {
        const pa = priorityOrder[a.priority] ?? 2;
        const pb = priorityOrder[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      res.json({ success: true, data: tasks, total: tasks.length });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to load tasks", details: errorMessage });
    }
  });

  /**
   * GET /api/tasks/stats - Get task statistics
   */
  app.get("/api/tasks/stats", (_req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const tasks = storage.tasks;
      const now = new Date();

      const stats = {
        total: tasks.length,
        todo: tasks.filter((t) => t.status === "todo").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        completed: tasks.filter((t) => t.status === "completed").length,
        cancelled: tasks.filter((t) => t.status === "cancelled").length,
        overdue: tasks.filter(
          (t) =>
            t.dueDate &&
            new Date(t.dueDate) < now &&
            t.status !== "completed" &&
            t.status !== "cancelled"
        ).length,
        byPriority: {
          low: tasks.filter((t) => t.priority === "low").length,
          medium: tasks.filter((t) => t.priority === "medium").length,
          high: tasks.filter((t) => t.priority === "high").length,
          urgent: tasks.filter((t) => t.priority === "urgent").length,
        },
      };

      res.json({ success: true, data: stats });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to get stats", details: errorMessage });
    }
  });

  /**
   * GET /api/tasks/:id - Get single task
   */
  app.get("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const task = storage.tasks.find((t) => t.id === req.params.id);

      if (!task) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      res.json({ success: true, data: task });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to get task", details: errorMessage });
    }
  });

  /**
   * POST /api/tasks - Create new task
   */
  app.post("/api/tasks", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const now = new Date().toISOString();
      const body = normalizeTaskBody(req.body);
      const title = toOptionalString(body.title);

      const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: title || "Untitled",
        description: toOptionalString(body.description),
        status: toTaskStatus(body.status, "todo"),
        priority: toTaskPriority(body.priority, "medium"),
        tags: toStringArray(body.tags),
        dueDate: toOptionalString(body.dueDate),
        assignee: toOptionalString(body.assignee),
        parentTaskId: toOptionalString(body.parentTaskId),
        createdAt: now,
        updatedAt: now,
      };

      storage.tasks.push(newTask);
      saveTaskStorage(storage);

      res.json({ success: true, data: newTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to create task", details: errorMessage });
    }
  });

  /**
   * PUT /api/tasks/:id - Update task
   */
  app.put("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);
      const body = normalizeTaskBody(req.body);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const task = storage.tasks[taskIndex];
      const nextTitle = toOptionalString(body.title);
      const nextDescription = toOptionalString(body.description);
      const nextDueDate = toOptionalString(body.dueDate);
      const nextAssignee = toOptionalString(body.assignee);
      const updatedTask: Task = {
        ...task,
        title: nextTitle ?? task.title,
        description: nextDescription ?? task.description,
        status: body.status === undefined ? task.status : toTaskStatus(body.status, task.status),
        priority: body.priority === undefined ? task.priority : toTaskPriority(body.priority, task.priority),
        tags: body.tags === undefined ? task.tags : toStringArray(body.tags),
        dueDate: nextDueDate ?? task.dueDate,
        assignee: nextAssignee ?? task.assignee,
        updatedAt: new Date().toISOString(),
      };

      storage.tasks[taskIndex] = updatedTask;
      saveTaskStorage(storage);

      res.json({ success: true, data: updatedTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to update task", details: errorMessage });
    }
  });

  /**
   * PATCH /api/tasks/:id/complete - Mark task as completed
   */
  app.patch("/api/tasks/:id/complete", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const task = storage.tasks[taskIndex];
      const now = new Date().toISOString();
      const updatedTask: Task = {
        ...task,
        status: "completed",
        completedAt: now,
        updatedAt: now,
      };

      storage.tasks[taskIndex] = updatedTask;
      saveTaskStorage(storage);

      res.json({ success: true, data: updatedTask });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to complete task", details: errorMessage });
    }
  });

  /**
   * DELETE /api/tasks/:id - Delete task
   */
  app.delete("/api/tasks/:id", (req: Request, res: Response) => {
    try {
      const storage = loadTaskStorage();
      const taskIndex = storage.tasks.findIndex((t) => t.id === req.params.id);

      if (taskIndex === -1) {
        res.status(404).json({ success: false, error: "Task not found" });
        return;
      }

      const taskId = storage.tasks[taskIndex].id;

      // Delete task and its subtasks
      storage.tasks = storage.tasks.filter(
        (t) => t.id !== taskId && t.parentTaskId !== taskId
      );
      saveTaskStorage(storage);

      res.json({ success: true, data: { deletedTaskId: taskId } });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: "Failed to delete task", details: errorMessage });
    }
  });
}
