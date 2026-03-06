/**
 * path: .pi/lib/storage/task-plan-store.ts
 * role: task/plan 関連ストレージを SQLite で扱う共通ラッパー
 * why: 保存先を SQLite に統一して競合と分岐を減らすため
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
