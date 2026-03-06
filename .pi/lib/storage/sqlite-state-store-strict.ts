/**
 * path: .pi/lib/storage/sqlite-state-store-strict.ts
 * role: SQLite必須のJSON状態ストア（フォールバックなし）
 * why: 完全SQLite移行のため、ファイル保存や互換フォールバックを排除する
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/storage/sqlite-schema.ts
 */

import { getDatabase, isSQLiteAvailable } from "./sqlite-db.js";
import "./sqlite-schema.js";

interface JsonStateRow {
  value_json: string;
}

function requireSQLite(): void {
  if (!isSQLiteAvailable()) {
    throw new Error("SQLite is required but not available");
  }
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

export function readStrictJsonState<T>(stateKey: string): T | null {
  requireSQLite();
  ensureJsonStateTable();

  const db = getDatabase();
  const row = db
    .prepare<[string], JsonStateRow>("SELECT value_json FROM json_state WHERE state_key = ?")
    .get(stateKey);

  if (!row) return null;
  return JSON.parse(row.value_json) as T;
}

export function writeStrictJsonState<T>(stateKey: string, value: T): void {
  requireSQLite();
  ensureJsonStateTable();

  const db = getDatabase();
  db.prepare(
    `INSERT INTO json_state (state_key, value_json, updated_at)
     VALUES (@stateKey, @valueJson, @updatedAt)
     ON CONFLICT(state_key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`
  ).run({
    stateKey,
    valueJson: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
  });
}

export function deleteStrictJsonState(stateKey: string): void {
  requireSQLite();
  ensureJsonStateTable();

  const db = getDatabase();
  db.prepare("DELETE FROM json_state WHERE state_key = ?").run(stateKey);
}
