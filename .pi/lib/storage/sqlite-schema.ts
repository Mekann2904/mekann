/**
 * @abdd.meta
 * path: .pi/lib/storage/sqlite-schema.ts
 * role: SQLiteデータベースのスキーマ定義とマイグレーション管理
 * why: データベース構造を一元管理し、バージョン管理されたマイグレーションを提供するため
 * related: .pi/lib/storage/sqlite-db.ts, .pi/lib/storage/repositories/
 * public_api: SCHEMA_VERSION, initializeSchema, runMigrations
 * invariants: マイグレーションは冪等、バージョンは単調増加、後方互換性を維持
 * side_effects: データベースへのテーブル作成、インデックス作成
 * failure_modes: マイグレーション失敗時はエラーをスロー
 * @abdd.explain
 * overview: データベーススキーマの定義とバージョン管理されたマイグレーション機能を提供
 * what_it_does:
 *   - スキーマのDDL定義
 *   - マイグレーションスクリプトの管理
 *   - 初期化とアップグレードの自動実行
 * why_it_exists:
 *   - スキーマ変更を安全に管理するため
 *   - 複数環境での一貫性を保つため
 * scope:
 *   in: PiDatabaseインスタンス
 *   out: 初期化されたデータベーススキーマ
 */

import type { PiDatabase } from "./sqlite-db.js";
import { setSchemaInitializer } from "./sqlite-db.js";

// 現在のスキーマバージョン
export const SCHEMA_VERSION = 2;

// ============================================================================
// スキーマ定義
// ============================================================================

/**
 * スキーマバージョン管理テーブル
 */
const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

/**
 * インスタンス管理テーブル
 * cross-instance-coordinator.ts用
 */
const INSTANCES_TABLE = `
CREATE TABLE IF NOT EXISTS instances (
  instance_id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_heartbeat TEXT NOT NULL,
  cwd TEXT NOT NULL,
  active_models_json TEXT DEFAULT '[]',
  pending_task_count INTEGER DEFAULT 0,
  active_request_count INTEGER DEFAULT 0,
  active_llm_count INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,
  last_task_completed_at TEXT
);
`;

const INSTANCES_INDEX = `
CREATE INDEX IF NOT EXISTS idx_instances_heartbeat 
ON instances(last_heartbeat);
`;

const INSTANCES_SESSION_INDEX = `
CREATE INDEX IF NOT EXISTS idx_instances_session 
ON instances(session_id);
`;

/**
 * 適応的レート制限テーブル
 * adaptive-rate-controller.ts用
 */
const ADAPTIVE_LIMITS_TABLE = `
CREATE TABLE IF NOT EXISTS adaptive_limits (
  provider_model TEXT PRIMARY KEY,
  concurrency REAL NOT NULL,
  original_concurrency REAL NOT NULL,
  last_429_at TEXT,
  consecutive_429_count INTEGER DEFAULT 0,
  total_429_count INTEGER DEFAULT 0,
  last_success_at TEXT,
  recovery_scheduled INTEGER DEFAULT 0,
  historical_429s_json TEXT DEFAULT '[]',
  predicted_429_probability REAL DEFAULT 0,
  ramp_up_schedule_json TEXT DEFAULT '[]',
  notes TEXT
);
`;

/**
 * RPMスロットリングテーブル
 * rpm-throttle.ts用
 */
const RPM_THROTTLE_TABLE = `
CREATE TABLE IF NOT EXISTS rpm_throttle (
  provider_model TEXT PRIMARY KEY,
  request_starts_json TEXT NOT NULL DEFAULT '[]',
  cooldown_until_ms INTEGER DEFAULT 0,
  last_accessed_ms INTEGER NOT NULL
);
`;

/**
 * 全体並列数制御テーブル
 * adaptive-total-limit.ts用
 */
const TOTAL_LIMIT_TABLE = `
CREATE TABLE IF NOT EXISTS total_limit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_limit INTEGER NOT NULL,
  learned_limit INTEGER NOT NULL,
  hard_max INTEGER NOT NULL,
  min_limit INTEGER NOT NULL,
  last_decision_at_ms INTEGER,
  cooldown_until_ms INTEGER,
  last_reason TEXT,
  samples_json TEXT DEFAULT '[]',
  last_updated TEXT NOT NULL
);
`;

/**
 * 全体並列数の初期値を挿入
 */
const TOTAL_LIMIT_INIT = `
INSERT OR IGNORE INTO total_limit (id, base_limit, learned_limit, hard_max, min_limit, last_updated)
VALUES (1, 12, 12, 36, 2, datetime('now'));
`;

/**
 * ワークスチーリング用キューステートテーブル
 */
const QUEUE_STATES_TABLE = `
CREATE TABLE IF NOT EXISTS queue_states (
  instance_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  pending_task_count INTEGER DEFAULT 0,
  active_orchestrations INTEGER DEFAULT 0,
  stealable_entries_json TEXT DEFAULT '[]',
  avg_latency_ms INTEGER
);
`;

const QUEUE_STATES_INDEX = `
CREATE INDEX IF NOT EXISTS idx_queue_states_timestamp 
ON queue_states(timestamp);
`;

/**
 * 分散ロックテーブル
 * 必要に応じて使用（SQLiteのトランザクションで代替可能だが、
 * 長時間のロックが必要な場合用）
 */
const DISTRIBUTED_LOCKS_TABLE = `
CREATE TABLE IF NOT EXISTS distributed_locks (
  resource TEXT PRIMARY KEY,
  lock_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

/**
 * 汎用JSON状態ストアテーブル
 * 段階的移行で task/plan/web-ui/history/memory の状態を保持する
 */
const JSON_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS json_state (
  state_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// ============================================================================
// マイグレーション定義
// ============================================================================

interface Migration {
  version: number;
  description: string;
  up: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    up: [
      SCHEMA_VERSION_TABLE,
      INSTANCES_TABLE,
      INSTANCES_INDEX,
      INSTANCES_SESSION_INDEX,
      ADAPTIVE_LIMITS_TABLE,
      RPM_THROTTLE_TABLE,
      TOTAL_LIMIT_TABLE,
      TOTAL_LIMIT_INIT,
      QUEUE_STATES_TABLE,
      QUEUE_STATES_INDEX,
      DISTRIBUTED_LOCKS_TABLE,
    ],
  },
  {
    version: 2,
    description: "Add generic json state table",
    up: [
      JSON_STATE_TABLE,
    ],
  },
];

// ============================================================================
// マイグレーション実行
// ============================================================================

/**
 * スキーマを初期化
 * @summary スキーマ初期化
 * @param db - データベースインスタンス
 */
export function initializeSchema(db: PiDatabase): void {
  const schemaState = db.getSchemaState();

  if (schemaState.status === "corrupted") {
    // 破損状態: schema_versionテーブルが存在しないが他のテーブルが存在
    // 自動修復は危険なため、明示的なエラーを投げる
    throw new Error(
      "[sqlite-schema] Database corruption detected: schema_version table is missing but other application tables exist. " +
      "Manual intervention required. Either restore schema_version table from backup, or drop all tables and reinitialize."
    );
  }

  if (schemaState.status === "fresh") {
    // 初回作成: 全テーブルを作成
    console.debug("[sqlite-schema] Creating initial schema");
    db.transaction(() => {
      for (const migration of MIGRATIONS) {
        for (const sql of migration.up) {
          db.exec(sql);
        }
        db.setSchemaVersion(migration.version);
      }
    });
  } else if (schemaState.version < SCHEMA_VERSION) {
    // アップグレード: 必要なマイグレーションのみ実行
    runMigrations(db, schemaState.version);
  }
}

/**
 * マイグレーションを実行
 * @summary マイグレーション実行
 * @param db - データベースインスタンス
 * @param fromVersion - 現在のバージョン
 */
export function runMigrations(db: PiDatabase, fromVersion: number): void {
  const pendingMigrations = MIGRATIONS.filter((m) => m.version > fromVersion);
  
  if (pendingMigrations.length === 0) {
    return;
  }
  
  console.debug(`[sqlite-schema] Running ${pendingMigrations.length} migrations from version ${fromVersion}`);
  
  db.transaction(() => {
    for (const migration of pendingMigrations) {
      console.debug(`[sqlite-schema] Applying migration ${migration.version}: ${migration.description}`);
      for (const sql of migration.up) {
        db.exec(sql);
      }
      db.setSchemaVersion(migration.version);
    }
  });
}

/**
 * 全テーブルを削除（テスト用）
 * @summary 全テーブル削除
 * @param db - データベースインスタンス
 */
export function dropAllTables(db: PiDatabase): void {
  const tables = [
    "json_state",
    "distributed_locks",
    "queue_states",
    "total_limit",
    "rpm_throttle",
    "adaptive_limits",
    "instances",
    "schema_version",
  ];
  
  db.transaction(() => {
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  });
}

// スキーマ初期化関数を登録
setSchemaInitializer(initializeSchema);

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * JSONフィールドを安全にパース
 * @summary JSONパース
 * @param json - JSON文字列
 * @param fallback - 失敗時のフォールバック値
 * @returns パース結果
 */
export function safeParseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 値を安全にJSON文字列化
 * @summary JSON文字列化
 * @param value - 値
 * @returns JSON文字列
 */
export function safeStringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * タイムスタンプをISO形式で取得
 * @summary タイムスタンプ取得
 * @returns ISO形式のタイムスタンプ
 */
export function timestampNow(): string {
  return new Date().toISOString();
}

/**
 * ミリ秒タイムスタンプを取得
 * @summary ミリ秒取得
 * @returns ミリ秒タイムスタンプ
 */
export function timestampMs(): number {
  return Date.now();
}
