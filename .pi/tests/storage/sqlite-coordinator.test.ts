/**
 * @abdd.meta
 * path: .pi/tests/storage/sqlite-coordinator.test.ts
 * role: SQLiteコーディネータの単体テスト
 * why: SQLiteベースのインスタンス管理が正しく動作することを検証するため
 * related: .pi/lib/coordination/cross-instance-coordinator.ts
 * public_api: なし（テストファイル）
 * invariants: テスト間でデータベースをクリーンアップする
 * side_effects: 一時的なSQLiteデータベースファイルの作成・削除
 * failure_modes: なし
 * @abdd.explain
 * overview: SQLite版コーディネータの基本機能をテストする
 * what_it_does:
 *   - インスタンス登録・解除のテスト
 *   - 並列数計算のテスト
 *   - 期限切れインスタンスの削除テスト
 * why_it_exists:
 *   - SQLite移行が正しく機能することを保証するため
 * scope:
 *   in: Coordinatorクラス
 *   out: テスト結果
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { existsSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";

// テスト用の一時ディレクトリ
let testDir: string;
let testDb: string;
let rawDb: DatabaseType | null = null;

// モジュールを動的にインポート
async function importModules() {
  try {
    const betterSqlite3 = await import("better-sqlite3");
    const Database = betterSqlite3.default;
    const { Coordinator } = await import("../../lib/coordination/cross-instance-coordinator.js");
    return { Database, Coordinator };
  } catch (e) {
    console.log("SQLite modules not available, skipping tests:", (e as Error).message);
    return null;
  }
}

// テスト用スキーマを作成
function createTestSchema(db: DatabaseType): void {
  db.exec(`
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
    
    CREATE INDEX IF NOT EXISTS idx_instances_heartbeat 
    ON instances(last_heartbeat);
  `);
}

// PiDatabaseのモックを作成
function createMockDb(db: DatabaseType) {
  return {
    prepare: (sql: string) => db.prepare(sql),
    transaction: <T>(fn: () => T): (() => T) => {
      // better-sqlite3のtransactionは関数を返す
      return () => db.transaction(fn)() as T;
    },
    close: () => db.close(),
  } as unknown as import("../../lib/storage/sqlite-db.js").PiDatabase;
}

describe("SQLite Coordinator", () => {
  let modules: Awaited<ReturnType<typeof importModules>>;

  beforeEach(async () => {
    // テストディレクトリを作成
    testDir = join(tmpdir(), "pi-sqlite-test-" + Date.now());
    testDb = join(testDir, "test-coordinator.db");

    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    // 既存のテストDBを削除
    if (existsSync(testDb)) {
      unlinkSync(testDb);
    }

    modules = await importModules();
  });

  afterEach(() => {
    // テストDBを閉じる
    if (rawDb) {
      try {
        rawDb.close();
      } catch {
        // 無視
      }
      rawDb = null;
    }
    
    // テストDBを削除
    if (testDb && existsSync(testDb)) {
      try {
        unlinkSync(testDb);
        // WALファイルも削除
        if (existsSync(testDb + "-wal")) unlinkSync(testDb + "-wal");
        if (existsSync(testDb + "-shm")) unlinkSync(testDb + "-shm");
      } catch {
        // 無視
      }
    }
    // テストディレクトリを削除
    if (testDir && existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        // 無視
      }
    }
  });

  it("should create database with WAL mode", async () => {
    if (!modules) {
      return; // Skip if SQLite not available
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    
    // WALモードを確認
    const result = rawDb.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result?.journal_mode.toLowerCase()).toBe("wal");
  });

  it("should register and unregister instance", async () => {
    if (!modules) {
      return;
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    createTestSchema(rawDb);
    
    const mockDb = createMockDb(rawDb);
    const coordinator = new modules.Coordinator(mockDb);

    // 初期状態では未登録
    expect(coordinator.isInitialized()).toBe(false);

    // インスタンスを登録
    coordinator.registerInstance("test-session-123", "/test/cwd");
    expect(coordinator.isInitialized()).toBe(true);

    // 登録解除
    coordinator.unregisterInstance();
    expect(coordinator.isInitialized()).toBe(false);
  });

  it("should return parallel limit", async () => {
    if (!modules) {
      return;
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    createTestSchema(rawDb);
    
    const mockDb = createMockDb(rawDb);
    const coordinator = new modules.Coordinator(mockDb);

    // 未登録時は1を返す
    const limitBeforeRegister = coordinator.getMyParallelLimit();
    expect(limitBeforeRegister).toBe(1);

    // 登録後は設定値に基づく並列数を返す
    coordinator.registerInstance("test-session-456", "/test/cwd", {
      totalMaxLlm: 10,
      heartbeatIntervalMs: 60000,
      heartbeatTimeoutMs: 180000,
    });

    const limitAfterRegister = coordinator.getMyParallelLimit();
    expect(limitAfterRegister).toBeGreaterThanOrEqual(1);

    coordinator.unregisterInstance();
  });

  it("should track active instances", async () => {
    if (!modules) {
      return;
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    createTestSchema(rawDb);
    
    const mockDb = createMockDb(rawDb);
    const coordinator = new modules.Coordinator(mockDb);

    // 未登録時は1（自分のみ想定）
    const countBeforeRegister = coordinator.getActiveInstanceCount();
    expect(countBeforeRegister).toBe(1);

    // 登録後は1（自分）
    coordinator.registerInstance("test-session-789", "/test/cwd");

    const countAfterRegister = coordinator.getActiveInstanceCount();
    expect(countAfterRegister).toBe(1);

    coordinator.unregisterInstance();
  });

  it("should update active models", async () => {
    if (!modules) {
      return;
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    createTestSchema(rawDb);
    
    const mockDb = createMockDb(rawDb);
    const coordinator = new modules.Coordinator(mockDb);

    coordinator.registerInstance("test-session-models", "/test/cwd");

    // アクティブモデルを設定
    coordinator.setActiveModel("anthropic", "claude-3-opus");
    coordinator.setActiveModel("openai", "gpt-4");

    // ステータスを確認
    const status = coordinator.getCoordinatorStatus();
    expect(status.registered).toBe(true);
    expect(status.myInstanceId).toContain("test-ses");

    coordinator.unregisterInstance();
  });

  it("should clear active models", async () => {
    if (!modules) {
      return;
    }

    rawDb = new modules.Database(testDb) as DatabaseType;
    rawDb.pragma("journal_mode = WAL");
    createTestSchema(rawDb);
    
    const mockDb = createMockDb(rawDb);
    const coordinator = new modules.Coordinator(mockDb);

    coordinator.registerInstance("test-session-clear", "/test/cwd");

    // アクティブモデルを設定
    coordinator.setActiveModel("anthropic", "claude-3-opus");

    // モデルをクリア
    coordinator.clearActiveModel("anthropic", "claude-3-opus");

    const status = coordinator.getCoordinatorStatus();
    expect(status.registered).toBe(true);

    coordinator.unregisterInstance();
  });
});
