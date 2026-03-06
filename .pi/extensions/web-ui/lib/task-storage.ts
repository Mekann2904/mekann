/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/task-storage.ts
 * @role Task storage utilities for file-based persistence
 * @why Encapsulate task storage logic for reuse and testability
 * @related routes/tasks.ts
 * @public_api loadTaskStorage, saveTaskStorage, ensureTaskDir, type Task, type TaskStorage
 * @invariants Storage file must be written atomically, task IDs must be unique
 * @side_effects Reads/writes .pi/tasks/storage.json
 * @failure_modes File system errors, JSON parse errors
 *
 * @abdd.explain
 * @overview File-based task storage with atomic writes
 * @what_it_does Loads and saves tasks to JSON file with atomic write pattern
 * @why_it_exists Provides persistent task storage for the web UI
 * @scope(in) Task data structures
 * @scope(out) JSON file on disk
 */

import {
  ensureTaskDir as ensureSharedTaskDir,
  loadTaskStorage as loadSharedTaskStorage,
  saveTaskStorage as saveSharedTaskStorage,
} from "../../../lib/storage/task-plan-store.js";

/**
 * @summary Task entity
 */
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[];
  dueDate?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentTaskId?: string;
}

/**
 * @summary Task storage structure
 */
export interface TaskStorage {
  tasks: Task[];
  currentTaskId?: string;
}

/**
 * @summary Ensure task directory exists
 */
export function ensureTaskDir(): void {
  ensureSharedTaskDir();
}

/**
 * @summary Load task storage from disk
 * @returns Task storage object, or empty storage if file doesn't exist
 */
export function loadTaskStorage(): TaskStorage {
  return loadSharedTaskStorage<TaskStorage>();
}

/**
 * @summary Save task storage to disk atomically
 * @param storage - Task storage object to save
 */
export function saveTaskStorage(storage: TaskStorage): void {
  saveSharedTaskStorage(storage);
}
