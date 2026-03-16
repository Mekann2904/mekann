/**
 * path: .pi/lib/storage/task-plan-store.ts
 * role: task/plan 関連ストレージを SQLite で扱う共通ラッパー
 * why: 保存先を SQLite に統一して競合と分岐を減らすため
 * related: .pi/extensions/task.ts, .pi/extensions/plan.ts, .pi/lib/storage/sqlite-state-store.ts
 */

import { closeSync, existsSync, mkdirSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { readJsonState, writeJsonState } from "./sqlite-state-store.js";
import { getDatabase, isSQLiteAvailable } from "./sqlite-db.js";
import {
  getPlanModeStateKey,
  getPlanStorageStateKey,
  getTaskStorageStateKey,
} from "./state-keys.js";

const TASK_STORAGE_LOCK_FILE = ".task-storage.lock";
const TASK_STORAGE_LOCK_WAIT_MS = 25;
const TASK_STORAGE_LOCK_TIMEOUT_MS = 2_000;
const SQLITE_MUTATION_RETRY_LIMIT = 12;
const lockSleepBuffer = new Int32Array(new SharedArrayBuffer(4));

interface JsonStateRow {
  value_json: string;
}

interface TaskStorageMutationInput<T extends { tasks: unknown[] }, R> {
  cwd?: string;
  createDefault?: () => T;
  mutate: (storage: T) => R;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function getTaskDir(cwd: string): string {
  return join(cwd, ".pi", "tasks");
}

function getPlanDir(cwd: string): string {
  return join(cwd, ".pi", "plans");
}

export function ensureTaskDir(cwd: string = process.cwd()): void {
  ensureDir(getTaskDir(cwd));
}

export function ensurePlanDir(cwd: string = process.cwd()): void {
  ensureDir(getPlanDir(cwd));
}

export function loadTaskStorage<T extends { tasks: unknown[] } = { tasks: unknown[] }>(
  cwd: string = process.cwd(),
): T {
  ensureTaskDir(cwd);
  return readJsonState<T>({
    stateKey: getTaskStorageStateKey(cwd),
    createDefault: () => ({ tasks: [] } as unknown as T),
  });
}

export function saveTaskStorage<T>(storage: T, cwd: string = process.cwd()): void {
  ensureTaskDir(cwd);
  writeJsonState<T>({
    stateKey: getTaskStorageStateKey(cwd),
    value: storage,
  });
}

function sleepMs(ms: number): void {
  Atomics.wait(lockSleepBuffer, 0, 0, ms);
}

function getTaskStorageLockPath(cwd: string): string {
  return join(getTaskDir(cwd), TASK_STORAGE_LOCK_FILE);
}

function acquireTaskStorageLock(cwd: string): () => void {
  ensureTaskDir(cwd);
  const lockPath = getTaskStorageLockPath(cwd);
  const deadline = Date.now() + TASK_STORAGE_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      return () => {
        closeSync(fd);
        unlinkSync(lockPath);
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring task storage lock: ${lockPath}`);
      }
      sleepMs(TASK_STORAGE_LOCK_WAIT_MS);
    }
  }
}

function createDefaultTaskStorage<T extends { tasks: unknown[] }>(
  createDefault?: () => T,
): T {
  return createDefault ? createDefault() : ({ tasks: [] } as unknown as T);
}

function isSQLiteContentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_BUSY")
    || message.includes("SQLITE_LOCKED")
    || message.includes("database is locked");
}

function ensureJsonStateTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS json_state (
      state_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

function mutateTaskStorageWithSQLite<T extends { tasks: unknown[] }, R>(
  input: TaskStorageMutationInput<T, R>,
): R {
  const cwd = input.cwd ?? process.cwd();
  const stateKey = getTaskStorageStateKey(cwd);
  const createDefault = () => createDefaultTaskStorage(input.createDefault);

  ensureTaskDir(cwd);
  ensureJsonStateTable();

  const db = getDatabase();
  const readStatement = db.prepare<[string], JsonStateRow>(
    "SELECT value_json FROM json_state WHERE state_key = ?",
  );
  const insertStatement = db.prepare<[string, string, string], unknown>(
    `INSERT OR IGNORE INTO json_state (state_key, value_json, updated_at)
     VALUES (?, ?, ?)`,
  );
  const updateStatement = db.prepare<[string, string, string, string], unknown>(
    `UPDATE json_state
     SET value_json = ?, updated_at = ?
     WHERE state_key = ? AND value_json = ?`,
  );

  for (let attempt = 0; attempt < SQLITE_MUTATION_RETRY_LIMIT; attempt += 1) {
    try {
      const row = readStatement.get(stateKey);
      const previousJson = row?.value_json;
      let storage = createDefault();
      if (previousJson) {
        try {
          storage = JSON.parse(previousJson) as T;
        } catch {
          storage = createDefault();
        }
      }
      const result = input.mutate(storage);
      const nextJson = JSON.stringify(storage);
      const updatedAt = new Date().toISOString();

      if (!previousJson) {
        const insertResult = insertStatement.run(stateKey, nextJson, updatedAt);
        if (insertResult.changes === 1) {
          return result;
        }
        continue;
      }

      const updateResult = updateStatement.run(nextJson, updatedAt, stateKey, previousJson);
      if (updateResult.changes === 1) {
        return result;
      }
    } catch (error) {
      if (!isSQLiteContentionError(error) || attempt === SQLITE_MUTATION_RETRY_LIMIT - 1) {
        throw error;
      }
    }

    sleepMs(TASK_STORAGE_LOCK_WAIT_MS);
  }

  throw new Error("Failed to mutate task storage atomically after repeated contention");
}

export function mutateTaskStorage<T extends { tasks: unknown[] }, R>(
  input: TaskStorageMutationInput<T, R>,
): R {
  const cwd = input.cwd ?? process.cwd();

  if (isSQLiteAvailable()) {
    return mutateTaskStorageWithSQLite(input);
  }

  const releaseLock = acquireTaskStorageLock(cwd);
  try {
    const storage = loadTaskStorage<T>(cwd);
    const result = input.mutate(storage);
    saveTaskStorage(storage, cwd);
    return result;
  } finally {
    releaseLock();
  }
}

export function loadPlanStorage<T extends { plans: unknown[] } = { plans: unknown[] }>(
  cwd: string = process.cwd(),
): T {
  ensurePlanDir(cwd);
  return readJsonState<T>({
    stateKey: getPlanStorageStateKey(cwd),
    createDefault: () => ({ plans: [] } as unknown as T),
  });
}

export function savePlanStorage<T>(storage: T, cwd: string = process.cwd()): void {
  ensurePlanDir(cwd);
  writeJsonState<T>({
    stateKey: getPlanStorageStateKey(cwd),
    value: storage,
  });
}

export function loadPlanModeState<T extends { enabled: boolean } = { enabled: boolean }>(
  cwd: string = process.cwd(),
): T | null {
  ensurePlanDir(cwd);
  return readJsonState<T | null>({
    stateKey: getPlanModeStateKey(cwd),
    createDefault: () => null,
  });
}

export function savePlanModeState<T>(state: T, cwd: string = process.cwd()): void {
  ensurePlanDir(cwd);
  writeJsonState<T>({
    stateKey: getPlanModeStateKey(cwd),
    value: state,
  });
}
