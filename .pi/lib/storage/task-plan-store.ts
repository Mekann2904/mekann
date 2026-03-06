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
