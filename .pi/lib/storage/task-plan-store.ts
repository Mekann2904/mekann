/**
 * path: .pi/lib/storage/task-plan-store.ts
 * role: task/plan関連ストレージをSQLite優先で扱う共通ラッパー
 * why: 拡張ごとの重複したJSON read-modify-writeを一元化して競合を減らすため
 * related: .pi/extensions/task.ts, .pi/extensions/plan.ts, .pi/lib/storage/sqlite-state-store.ts
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { readJsonState, writeJsonState } from "./sqlite-state-store.js";
import {
  getPlanModeStateKey,
  getPlanStorageStateKey,
  getTaskStorageStateKey,
} from "./state-keys.js";

const TASK_DIR = join(process.cwd(), ".pi", "tasks");
const PLAN_DIR = join(process.cwd(), ".pi", "plans");
const TASK_STORAGE_FILE = join(TASK_DIR, "storage.json");
const PLAN_STORAGE_FILE = join(PLAN_DIR, "storage.json");
const PLAN_MODE_STATE_FILE = join(PLAN_DIR, "plan-mode-state.json");

const taskStateKey = getTaskStorageStateKey(process.cwd());
const planStateKey = getPlanStorageStateKey(process.cwd());
const planModeStateKey = getPlanModeStateKey(process.cwd());

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function ensureTaskDir(): void {
  ensureDir(TASK_DIR);
}

export function ensurePlanDir(): void {
  ensureDir(PLAN_DIR);
}

export function loadTaskStorage<T extends { tasks: unknown[] } = { tasks: unknown[] }>(): T {
  ensureTaskDir();
  return readJsonState<T>({
    stateKey: taskStateKey,
    fallbackPath: TASK_STORAGE_FILE,
    createDefault: () => ({ tasks: [] } as unknown as T),
  });
}

export function saveTaskStorage<T>(storage: T): void {
  ensureTaskDir();
  writeJsonState<T>({
    stateKey: taskStateKey,
    value: storage,
  });
}

export function loadPlanStorage<T extends { plans: unknown[] } = { plans: unknown[] }>(): T {
  ensurePlanDir();
  return readJsonState<T>({
    stateKey: planStateKey,
    fallbackPath: PLAN_STORAGE_FILE,
    createDefault: () => ({ plans: [] } as unknown as T),
  });
}

export function savePlanStorage<T>(storage: T): void {
  ensurePlanDir();
  writeJsonState<T>({
    stateKey: planStateKey,
    value: storage,
  });
}

export function loadPlanModeState<T extends { enabled: boolean } = { enabled: boolean }>(): T | null {
  ensurePlanDir();
  return readJsonState<T | null>({
    stateKey: planModeStateKey,
    fallbackPath: PLAN_MODE_STATE_FILE,
    createDefault: () => null,
  });
}

export function savePlanModeState<T>(state: T): void {
  ensurePlanDir();
  writeJsonState<T>({
    stateKey: planModeStateKey,
    value: state,
  });
}
