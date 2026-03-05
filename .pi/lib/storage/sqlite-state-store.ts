/**
 * path: .pi/lib/storage/sqlite-state-store.ts
 * role: SQLite上のJSON状態ストアを提供し、既存JSONファイルとの移行/互換を吸収する
 * why: 複数モジュールのJSON read-modify-write競合を減らし、段階的にSQLiteへ移行するため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/storage/sqlite-schema.ts, .pi/lib/storage/task-plan-store.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getDatabase, isSQLiteAvailable } from "./sqlite-db.js";

interface JsonStateRow {
  state_key: string;
  value_json: string;
}

function ensureParentDir(filePath: string): void {
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return safeParseJson<T>(raw);
  } catch {
    return null;
  }
}

function writeJsonFile<T>(filePath: string, value: T): void {
  try {
    ensureParentDir(filePath);
    writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
  } catch {
    // ベストエフォート
  }
}

function ensureTable(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS json_state (
      state_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

export function readJsonState<T>(input: {
  stateKey: string;
  fallbackPath?: string;
  createDefault: () => T;
}): T {
  const fallback = (): T => {
    if (input.fallbackPath) {
      const fromFile = readJsonFile<T>(input.fallbackPath);
      if (fromFile !== null) return fromFile;
    }
    return input.createDefault();
  };

  if (!isSQLiteAvailable()) {
    const value = fallback();
    if (input.fallbackPath && !existsSync(input.fallbackPath)) {
      writeJsonFile(input.fallbackPath, value);
    }
    return value;
  }

  try {
    ensureTable();
    const db = getDatabase();
    const row = db.prepare<[string], JsonStateRow>(
      "SELECT state_key, value_json FROM json_state WHERE state_key = ?"
    ).get(input.stateKey);

    if (row && typeof row.value_json === "string") {
      const parsed = safeParseJson<T>(row.value_json);
      if (parsed !== null) return parsed;
    }

    const loaded = fallback();
    writeJsonState({
      stateKey: input.stateKey,
      value: loaded,
      mirrorPath: input.fallbackPath,
    });
    return loaded;
  } catch {
    return fallback();
  }
}

export function writeJsonState<T>(input: {
  stateKey: string;
  value: T;
  mirrorPath?: string;
}): void {
  if (isSQLiteAvailable()) {
    try {
      ensureTable();
      const db = getDatabase();
      db.prepare(
        `INSERT INTO json_state (state_key, value_json, updated_at)
         VALUES (@stateKey, @valueJson, @updatedAt)
         ON CONFLICT(state_key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      ).run({
        stateKey: input.stateKey,
        valueJson: JSON.stringify(input.value),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // SQLite失敗時はミラーファイルへフォールバック
    }
  }

  if (input.mirrorPath) {
    writeJsonFile(input.mirrorPath, input.value);
  }
}
