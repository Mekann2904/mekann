/**
 * path: .pi/lib/storage/sqlite-state-store.ts
 * role: SQLite 上の JSON 状態ストアを提供する
 * why: SQLite が使える時は一元管理し、使えない時も JSON fallback で拡張全体を止めないため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/storage/sqlite-schema.ts, .pi/lib/storage/task-plan-store.ts
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { getDatabase, getSQLiteDisableReason, isSQLiteAvailable } from "./sqlite-db.js";
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

function isSQLiteFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("[sqlite-db]")
    || message.includes("SQLite is required but not available")
    || message.includes("better-sqlite3");
}

function resolveFallbackRoot(stateKey: string): string {
  const separatorIndex = stateKey.indexOf(":");
  const candidate = separatorIndex >= 0 ? stateKey.slice(separatorIndex + 1) : "";
  if (candidate && isAbsolute(candidate)) {
    return join(candidate, ".pi", "state", "json-state");
  }
  return join(process.cwd(), ".pi", "state", "json-state");
}

function ensureFallbackDir(stateKey: string): string {
  const root = resolveFallbackRoot(stateKey);
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
  return root;
}

function buildFallbackFilePath(stateKey: string): string {
  const root = ensureFallbackDir(stateKey);
  const digest = createHash("sha256").update(stateKey).digest("hex").slice(0, 16);
  const safeLabel = stateKey
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 48)
    .replace(/^_+|_+$/g, "");
  const fileName = `${safeLabel || "state"}-${digest}.json`;
  return join(root, fileName);
}

function readFallbackValue<T>(stateKey: string): T | null {
  const filePath = buildFallbackFilePath(stateKey);
  if (!existsSync(filePath)) {
    return null;
  }

  const parsed = safeParseJson<{ stateKey?: string; value?: T }>(readFileSync(filePath, "utf-8"));
  if (!parsed || parsed.stateKey !== stateKey) {
    return null;
  }
  return parsed.value ?? null;
}

function writeFallbackValue<T>(stateKey: string, value: T): void {
  const filePath = buildFallbackFilePath(stateKey);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify({
    stateKey,
    updatedAt: new Date().toISOString(),
    value,
  }, null, 2)}\n`);
}

function listFallbackKeys(prefix?: string): string[] {
  const root = resolveFallbackRoot(prefix ?? "");
  if (!existsSync(root)) {
    return [];
  }

  const keys: string[] = [];
  for (const fileName of readdirSync(root)) {
    if (!fileName.endsWith(".json")) {
      continue;
    }
    const parsed = safeParseJson<{ stateKey?: string }>(readFileSync(join(root, fileName), "utf-8"));
    if (!parsed?.stateKey) {
      continue;
    }
    if (!prefix || parsed.stateKey.startsWith(prefix)) {
      keys.push(parsed.stateKey);
    }
  }

  return keys.sort();
}

function runWithFallback<T>(stateKey: string, fallback: () => T, primary: () => T): T {
  if (!isSQLiteAvailable()) {
    return fallback();
  }

  try {
    return primary();
  } catch (error) {
    if (!isSQLiteFailure(error)) {
      throw error;
    }
    console.warn(
      "[sqlite-state-store] Falling back to JSON state store:",
      getSQLiteDisableReason() ?? (error instanceof Error ? error.message : String(error)),
    );
    return fallback();
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
  return runWithFallback(
    input.stateKey,
    () => {
      const stored = readFallbackValue<T>(input.stateKey);
      if (stored !== null) {
        return stored;
      }

      const initialValue = input.createDefault();
      writeFallbackValue(input.stateKey, initialValue);
      return initialValue;
    },
    () => {
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
    },
  );
}

export function writeJsonState<T>(input: {
  stateKey: string;
  value: T;
}): void {
  runWithFallback(
    input.stateKey,
    () => {
      writeFallbackValue(input.stateKey, input.value);
    },
    () => {
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
    },
  );
}

export function deleteJsonState(stateKey: string): void {
  runWithFallback(
    stateKey,
    () => {
      rmSync(buildFallbackFilePath(stateKey), { force: true });
    },
    () => {
      requireSQLite();
      ensureTable();

      const db = getDatabase();
      db.prepare("DELETE FROM json_state WHERE state_key = ?").run(stateKey);
    },
  );
}

export function listJsonStateKeys(prefix?: string): string[] {
  const stateKey = prefix ?? "__fallback__";
  return runWithFallback(
    stateKey,
    () => listFallbackKeys(prefix),
    () => {
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
    },
  );
}
