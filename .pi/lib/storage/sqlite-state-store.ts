/**
 * path: .pi/lib/storage/sqlite-state-store.ts
 * role: SQLite 上の JSON 状態ストアを提供する
 * why: 状態保存を SQLite に一本化して実装を単純化するため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/storage/sqlite-schema.ts, .pi/lib/storage/task-plan-store.ts
 */

import { getDatabase, isSQLiteAvailable } from "./sqlite-db.js";
import "./sqlite-schema.js";

interface JsonStateRow {
  value_json: string;
}

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
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

function requireSQLite(): void {
  if (!isSQLiteAvailable()) {
    throw new Error("SQLite is required but not available");
  }
}

function readStoredValue<T>(stateKey: string): T | null {
  const db = getDatabase();
  const row = db.prepare<[string], JsonStateRow>(
    "SELECT value_json FROM json_state WHERE state_key = ?"
  ).get(stateKey);

  if (!row || typeof row.value_json !== "string") {
    return null;
  }

  return safeParseJson<T>(row.value_json);
}

export function readJsonState<T>(input: {
  stateKey: string;
  createDefault: () => T;
}): T {
  requireSQLite();
  ensureTable();

  const stored = readStoredValue<T>(input.stateKey);
  if (stored !== null) {
    return stored;
  }

  const initialValue = input.createDefault();
  writeJsonState({
    stateKey: input.stateKey,
    value: initialValue,
  });
  return initialValue;
}

export function writeJsonState<T>(input: {
  stateKey: string;
  value: T;
}): void {
  requireSQLite();
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
}

export function deleteJsonState(stateKey: string): void {
  requireSQLite();
  ensureTable();

  const db = getDatabase();
  db.prepare("DELETE FROM json_state WHERE state_key = ?").run(stateKey);
}

export function listJsonStateKeys(prefix?: string): string[] {
  requireSQLite();
  ensureTable();

  const db = getDatabase();
  if (prefix) {
    const rows = db.prepare<[string], { state_key: string }>(
      "SELECT state_key FROM json_state WHERE state_key LIKE ? ORDER BY state_key"
    ).all(`${prefix}%`);
    return rows.map((row) => row.state_key);
  }

  const rows = db.prepare<[], { state_key: string }>(
    "SELECT state_key FROM json_state ORDER BY state_key"
  ).all();
  return rows.map((row) => row.state_key);
}
