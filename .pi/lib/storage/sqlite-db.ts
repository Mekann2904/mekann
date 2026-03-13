/**
 * @abdd.meta
 * path: .pi/lib/storage/sqlite-db.ts
 * role: SQLiteデータベースの接続管理とトランザクション制御を行う基盤モジュール
 * why: 複数の状態管理モジュールで共通して使用するデータベース機能を一元管理するため
 * related: .pi/lib/storage/sqlite-schema.ts, .pi/lib/coordination/cross-instance-coordinator.ts
 * public_api: PiDatabase, getDatabase, closeDatabase, USE_SQLITE
 * invariants: WALモードで動作、シングルトンパターン、トランザクション内でのみ書き込み可能
 * side_effects: ~/.pi/runtime/pi-coordinator.dbへの読み書き、WALファイルの生成
 * failure_modes: better-sqlite3ロード失敗時はフォールバックモードで動作、ディスク容量不足時はエラー
 * @abdd.explain
 * overview: SQLite + WALモードを使用した永続化ストレージの基盤を提供
 * what_it_does:
 *   - データベース接続の初期化と管理
 *   - WALモードとPRAGMA設定の適用
 *   - トランザクションヘルパーの提供
 *   - スキーママイグレーションの実行
 * why_it_exists:
 *   - ファイルベースの状態管理の問題（ロック競合、一貫性）を解決するため
 *   - 複数プロセス間でのデータ共有を効率化するため
 * scope:
 *   in: 環境変数PI_USE_SQLITE, PI_RUNTIME_DIR
 *   out: データベース接続、トランザクション機能
 */

import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// 機能フラグ: SQLite使用可否
export const USE_SQLITE = process.env.PI_USE_SQLITE !== "0";

// データベースパス
function resolveDbPath(): string {
  const runtimeDir = process.env.PI_RUNTIME_DIR || join(homedir(), ".pi", "runtime");
  return join(runtimeDir, "pi-coordinator.db");
}

const DB_PATH = resolveDbPath();

// better-sqlite3の動的インポート（失敗時はnull）
let Database: typeof import("better-sqlite3") | null = null;
let sqliteDisableReason: string | null = null;
let sqliteCapabilityChecked = false;
let sqliteDisableLogged = false;

function isNativeModuleMismatch(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("NODE_MODULE_VERSION")
    || message.includes("ERR_DLOPEN_FAILED")
    || message.includes("was compiled against a different Node.js version")
    || message.includes("Could not locate the bindings file")
    || message.includes("slice is not valid mach-o file");
}

function disableSQLite(reason: string, error?: unknown): void {
  const nextReason = reason.trim() || "unknown sqlite initialization failure";
  const shouldLog = !sqliteDisableLogged || sqliteDisableReason !== nextReason;

  sqliteAvailable = false;
  Database = null;
  sqliteDisableReason = nextReason;
  sqliteCapabilityChecked = true;

  if (!shouldLog) {
    return;
  }

  sqliteDisableLogged = true;
  console.warn("[sqlite-db] SQLite disabled, falling back to JSON state store:", nextReason);
  if (error instanceof Error && error.message !== nextReason) {
    console.warn("[sqlite-db] Original SQLite error:", error.message);
  }
}

function probeSQLiteCapability(): boolean {
  if (!USE_SQLITE || !sqliteAvailable || !Database) {
    return false;
  }

  if (sqliteCapabilityChecked) {
    return sqliteAvailable;
  }

  sqliteCapabilityChecked = true;

  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    disableSQLite(error instanceof Error ? error.message : String(error), error);
    return false;
  }
}

/**
 * better-sqlite3のロードを試行
 * @summary SQLiteライブラリをロード
 * @returns ロード成功時はtrue
 */
async function loadSQLite(): Promise<boolean> {
  if (!USE_SQLITE) return false;
  
  try {
    const module = await import("better-sqlite3");
    Database = module.default || module;
    return true;
  } catch (error) {
    console.warn("[sqlite-db] better-sqlite3 not available, using JSON fallback:", 
      error instanceof Error ? error.message : String(error));
    return false;
  }
}

// 同期的なロード（初期化時）
let sqliteAvailable = false;
const require = createRequire(import.meta.url);
try {
  const module = require("better-sqlite3");
  Database = module.default || module;
  sqliteAvailable = true;
} catch (error) {
  sqliteAvailable = false;
  sqliteDisableReason = error instanceof Error ? error.message : String(error);
  sqliteCapabilityChecked = true;
}

/**
 * SQLiteが利用可能かどうか
 * @summary SQLite利用可否
 */
export function isSQLiteAvailable(): boolean {
  return USE_SQLITE && probeSQLiteCapability();
}

export function getSQLiteDisableReason(): string | null {
  return sqliteDisableReason;
}

/**
 * データベース接続オプション
 * @summary 接続オプション
 */
export interface DatabaseOptions {
  /** WALモードを有効にするか（デフォルト: true） */
  walMode?: boolean;
  /** busy_timeout（ミリ秒、デフォルト: 10000） */
  busyTimeoutMs?: number;
  /** synchronous設定（デフォルト: NORMAL） */
  synchronous?: "OFF" | "NORMAL" | "FULL";
}

/**
 * Piデータベースクラス
 * @summary SQLiteデータベース管理クラス
 */
export class PiDatabase {
  private db: import("better-sqlite3").Database | null = null;
  private options: Required<DatabaseOptions>;
  private connected = false;

  constructor(options?: DatabaseOptions) {
    this.options = {
      walMode: options?.walMode ?? true,
      busyTimeoutMs: options?.busyTimeoutMs ?? 10000,
      synchronous: options?.synchronous ?? "NORMAL",
    };
  }

  /**
   * データベースに接続
   * @summary 接続を開始
   */
  connect(): void {
    if (this.connected) return;
    
    if (!isSQLiteAvailable() || !Database) {
      throw new Error(
        `[sqlite-db] Cannot connect: SQLite is not available. ${sqliteDisableReason ? `Reason: ${sqliteDisableReason}` : "Please ensure better-sqlite3 is properly installed."}`
      );
    }

    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      this.db = new Database(DB_PATH);
      
      // PRAGMA設定
      if (this.options.walMode) {
        this.db.pragma("journal_mode = WAL");
      }
      this.db.pragma(`synchronous = ${this.options.synchronous}`);
      this.db.pragma(`busy_timeout = ${this.options.busyTimeoutMs}`);
      
      // 外部キー制約を有効化
      this.db.pragma("foreign_keys = ON");
      
      this.connected = true;
    } catch (error) {
      if (isNativeModuleMismatch(error)) {
        const reason = error instanceof Error ? error.message : "native module mismatch";
        disableSQLite(reason, error);
        throw new Error(`[sqlite-db] Cannot connect: SQLite is not available. Reason: ${reason}`);
      } else {
        console.error("[sqlite-db] Failed to connect:", error);
      }
      throw error;
    }
  }

  /**
   * SQLを実行（スキーマ作成用）
   * @summary SQL実行
   * @param sql - SQL文
   */
  exec(sql: string): void {
    this.ensureConnected();
    this.db!.exec(sql);
  }

  /**
   * プリペアドステートメントを作成
   * @summary ステートメント作成
   * @param sql - SQL文
   * @returns プリペアドステートメント
   */
  prepare<BindParameters extends unknown[] | Record<string, unknown> = unknown[], Result = unknown>(
    sql: string
  ): import("better-sqlite3").Statement<
    BindParameters extends unknown[] ? BindParameters : [BindParameters],
    Result
  > {
    this.ensureConnected();
    return this.db!.prepare(sql) as import("better-sqlite3").Statement<
      BindParameters extends unknown[] ? BindParameters : [BindParameters],
      Result
    >;
  }

  /**
   * トランザクションを実行
   * @summary トランザクション実行
   * @param fn - 実行する関数
   * @returns 関数の戻り値
   */
  transaction<T>(fn: () => T): T {
    this.ensureConnected();
    return this.db!.transaction(fn)();
  }

  /**
   * 読み取り専用トランザクションを実行
   * @summary 読み取りトランザクション
   * @param fn - 実行する関数
   * @returns 関数の戻り値
   */
  readTransaction<T>(fn: () => T): T {
    // SQLiteのBEGINはデフォルトでDEFERREDなので、
    // 書き込みがない場合は自動的に読み取り専用になる
    return this.transaction(fn);
  }

  /**
   * データベース接続を閉じる
   * @summary 接続を閉じる
   */
  close(): void {
    if (this.db) {
      try {
        // WALチェックポイントを実行
        this.db.pragma("wal_checkpoint(TRUNCATE)");
        this.db.close();
      } catch {
        // クローズエラーは無視
      }
      this.db = null;
      this.connected = false;
    }
  }

  /**
   * データベースが接続されているか確認
   * @summary 接続状態確認
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * WALチェックポイントを実行
   * @summary チェックポイント実行
   */
  checkpoint(): void {
    if (this.db) {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
    }
  }

  /**
   * データベースを最適化
   * @summary VACUUM実行
   */
  vacuum(): void {
    if (this.db) {
      this.db.exec("VACUUM");
    }
  }

  /**
   * テーブルが存在するか確認
   * @summary テーブル存在確認
   * @param tableName - テーブル名
   * @returns 存在すればtrue
   */
  tableExists(tableName: string): boolean {
    this.ensureConnected();
    const stmt = this.db!.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    );
    return stmt.get(tableName) !== undefined;
  }

  /**
   * スキーマバージョンを取得
   * @summary バージョン取得
   * @returns スキーマバージョン
   */
  getSchemaVersion(): number {
    if (!this.tableExists("schema_version")) {
      return 0;
    }
    const stmt = this.prepare<[], { version: number }>("SELECT MAX(version) as version FROM schema_version");
    const result = stmt.get();
    return result?.version ?? 0;
  }

  /**
   * スキーマバージョンを設定
   * @summary バージョン設定
   * @param version - 新しいバージョン
   */
  setSchemaVersion(version: number): void {
    const stmt = this.prepare<[number, string], unknown>(
      "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)"
    );
    stmt.run(version, new Date().toISOString());
  }

  private ensureConnected(): void {
    if (!this.connected || !this.db) {
      throw new Error("[sqlite-db] Database not connected");
    }
  }
}

// シングルトンインスタンス
let instance: PiDatabase | null = null;

/**
 * データベースインスタンスを取得
 * @summary データベース取得
 * @returns データベースインスタンス
 */
export function getDatabase(): PiDatabase {
  if (!instance) {
    if (!isSQLiteAvailable()) {
      instance = new PiDatabase();
      return instance;
    }
    instance = new PiDatabase();
    try {
      instance.connect();
    } catch (error) {
      instance = null;
      throw error;
    }
    
    // スキーマ初期化
    initializeSchema(instance);
  }
  return instance;
}

/**
 * データベース接続を閉じる
 * @summary 接続を閉じる
 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/**
 * テスト用にデータベースをリセット
 * @summary データベースリセット
 * @param dbPath - テスト用データベースパス
 * @returns テスト用データベースインスタンス
 */
export function createTestDatabase(dbPath: string): PiDatabase {
  const db = new PiDatabase();
  // テスト用パスで接続するため、一時的にDB_PATHをオーバーライド
  // 注: 実際のテストではin-memoryデータベースを使用
  (db as unknown as { db: import("better-sqlite3").Database | null }).db = null;
  return db;
}

// スキーマ初期化関数（sqlite-schema.tsで実装）
let initializeSchema: (db: PiDatabase) => void = () => {
  // デフォルトは何もしない（sqlite-schema.tsで上書き）
};

/**
 * スキーマ初期化関数を設定
 * @summary スキーマ初期化設定
 * @param fn - 初期化関数
 */
export function setSchemaInitializer(fn: (db: PiDatabase) => void): void {
  initializeSchema = fn;
}
