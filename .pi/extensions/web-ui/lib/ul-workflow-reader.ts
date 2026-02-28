/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/ul-workflow-reader.ts
 * @role Read-only accessor for UL workflow tasks
 * @why Provide safe, isolated access to UL workflow data without risk of corruption
 * @related server.ts, instance-registry.ts
 * @public_api getAllUlWorkflowTasks, getUlWorkflowTask, getActiveUlWorkflowTask, invalidateCache
 * @invariants Never writes to any file, only reads
 * @side_effects None (pure read operations)
 * @failure_modes File not found, JSON parse errors (handled gracefully)
 *
 * @abdd.explain
 * @overview Read-only utility to access UL workflow tasks
 * @what_it_does Reads status.json and task.md, converts to Task interface
 * @why_it_exists Isolates UL workflow access from main task storage
 * @scope(in) UL workflow file system
 * @scope(out) Converted Task objects for UI consumption
 */

import * as fs from "fs";
import * as path from "path";

const UL_WORKFLOW_DIR = ".pi/ul-workflow";
const UL_TASKS_DIR = path.join(UL_WORKFLOW_DIR, "tasks");

/**
 * @summary UL workflow task with extended metadata
 */
export interface UlWorkflowTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "medium";
  tags: string[];
  createdAt: string;
  updatedAt: string;
  phase: string;
  ownerInstanceId?: string;
  isUlWorkflow: true;
}

type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled";

/**
 * @summary Maps workflow phases to Kanban column statuses
 */
const PHASE_TO_STATUS: Record<string, TaskStatus> = {
  idle: "todo",
  research: "in_progress",
  plan: "in_progress",
  annotate: "in_progress",
  implement: "in_progress",
  review: "in_progress",
  completed: "completed",
  aborted: "cancelled",
};

// Simple cache (TTL: 5 seconds)
let cachedTasks: UlWorkflowTask[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

/**
 * @summary Get all UL workflow tasks with caching
 * @returns Array of UL workflow tasks
 */
export function getAllUlWorkflowTasks(): UlWorkflowTask[] {
  const now = Date.now();
  if (cachedTasks && now - cacheTime < CACHE_TTL) {
    return cachedTasks;
  }

  cachedTasks = loadAllTasks();
  cacheTime = now;
  return cachedTasks;
}

/**
 * @summary Get single UL workflow task by ID
 * @param taskId - Task ID (with or without "ul-" prefix)
 * @returns Task or null if not found
 */
export function getUlWorkflowTask(taskId: string): UlWorkflowTask | null {
  return loadTask(taskId);
}

/**
 * @summary Get currently active UL workflow task
 * @returns Active task or null if none
 */
export function getActiveUlWorkflowTask(): UlWorkflowTask | null {
  const activePath = path.join(UL_WORKFLOW_DIR, "active.json");
  if (!fs.existsSync(activePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(activePath, "utf-8");
    const registry = JSON.parse(raw);
    if (!registry.activeTaskId) {
      return null;
    }
    return loadTask(registry.activeTaskId);
  } catch {
    return null;
  }
}

/**
 * @summary Invalidate cache (call when UL workflow state changes)
 */
export function invalidateCache(): void {
  cachedTasks = null;
  cacheTime = 0;
}

// --- Internal helpers ---

/**
 * @summary Load all tasks from UL workflow directory
 */
function loadAllTasks(): UlWorkflowTask[] {
  if (!fs.existsSync(UL_TASKS_DIR)) {
    return [];
  }

  const taskDirs = fs.readdirSync(UL_TASKS_DIR)
    .filter(name => fs.statSync(path.join(UL_TASKS_DIR, name)).isDirectory());

  return taskDirs
    .map(taskId => loadTask(taskId))
    .filter((task): task is UlWorkflowTask => task !== null);
}

/**
 * @summary Load single task from directory
 * @param taskId - Task directory name (without "ul-" prefix)
 */
function loadTask(taskId: string): UlWorkflowTask | null {
  // Strip "ul-" prefix if present
  const rawTaskId = taskId.startsWith("ul-") ? taskId.slice(3) : taskId;
  
  const statusPath = path.join(UL_TASKS_DIR, rawTaskId, "status.json");
  const taskPath = path.join(UL_TASKS_DIR, rawTaskId, "task.md");

  try {
    // Read status.json
    if (!fs.existsSync(statusPath)) {
      return null;
    }
    const statusRaw = fs.readFileSync(statusPath, "utf-8");
    const status = JSON.parse(statusRaw);

    // Extract description from task.md
    let description: string | undefined;
    if (fs.existsSync(taskPath)) {
      const taskContent = fs.readFileSync(taskPath, "utf-8");
      const match = taskContent.match(/## Description\s*\n\n([\s\S]*?)(?:\n\n---|$)/);
      description = match?.[1]?.trim();
    }

    return {
      id: `ul-${status.taskId}`,
      title: status.taskDescription || rawTaskId,
      description,
      status: PHASE_TO_STATUS[status.phase] || "todo",
      priority: "medium",
      tags: ["ul-workflow", `phase:${status.phase}`],
      createdAt: status.createdAt || new Date().toISOString(),
      updatedAt: status.updatedAt || new Date().toISOString(),
      phase: status.phase || "unknown",
      ownerInstanceId: status.ownerInstanceId,
      isUlWorkflow: true,
    };
  } catch {
    return null;
  }
}
