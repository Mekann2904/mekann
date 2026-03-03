/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/lib/storage.ts
 * @role JSON ファイルベースのデータ永続化
 * @why ファイル操作の一元化とエラーハンドリング
 * @related repositories/*.ts, lib/file-lock.ts
 * @public_api JsonStorage, createStorage
 * @invariants ファイル操作はアトミック、エラー時はデフォルト値を返す
 * @side_effects ファイルシステムへの読み書き
 * @failure_modes ファイル不存在、権限エラー、ディスク満杯
 *
 * @abdd.explain
 * @overview JSON ファイルの安全な読み書きを行うストレージクラス
 * @what_it_does アトミック書き込み、自動マイグレーション、エラーリカバリ
 * @why_it_exists データ永続化の信頼性向上
 * @scope(in) ファイルパス、デフォルト値
 * @scope(out) JSON データ
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { FileLock } from "./file-lock.js";

/**
 * ストレージ設定
 */
export interface StorageConfig {
  /** データディレクトリ */
  dataDir: string;
  /** ファイルロックを使用するか */
  useLock: boolean;
  /** 書き込み時にバックアップを作成するか */
  backup: boolean;
}

/**
 * デフォルト設定
 */
const DEFAULT_CONFIG: StorageConfig = {
  dataDir: join(homedir(), ".pi-shared"),
  useLock: true,
  backup: true,
};

/**
 * JSON ファイルストレージ
 * 
 * @example
 * ```ts
 * const storage = new JsonStorage<TaskStorage>("tasks.json", { tasks: [] });
 * const data = storage.read();
 * data.tasks.push(newTask);
 * storage.write(data);
 * ```
 */
export class JsonStorage<T> {
  private readonly filePath: string;
  private readonly defaultValue: T;
  private readonly config: StorageConfig;
  private readonly lock: FileLock;

  constructor(
    filename: string,
    defaultValue: T,
    config: Partial<StorageConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.filePath = join(this.config.dataDir, filename);
    this.defaultValue = defaultValue;
    this.lock = new FileLock(this.filePath);
    
    this.ensureDirectory();
  }

  /**
   * データを読み込む
   * ファイルが存在しない場合はデフォルト値を返す
   */
  read(): T {
    try {
      if (!existsSync(this.filePath)) {
        return this.cloneDefault();
      }

      const content = readFileSync(this.filePath, "utf-8");
      const data = JSON.parse(content);
      
      // マイグレーション: デフォルト値とマージ
      return this.mergeWithDefault(data);
    } catch (error) {
      console.error(`[storage] Failed to read ${this.filePath}:`, error);
      return this.cloneDefault();
    }
  }

  /**
   * データを書き込む（アトミック操作）
   */
  write(data: T): void {
    this.ensureDirectory();

    if (this.config.useLock) {
      this.lock.withLock(() => this.writeInternal(data));
    } else {
      this.writeInternal(data);
    }
  }

  /**
   * 内部書き込み処理
   */
  private writeInternal(data: T): void {
    // バックアップ作成
    if (this.config.backup && existsSync(this.filePath)) {
      const backupPath = `${this.filePath}.bak`;
      try {
        writeFileSync(backupPath, readFileSync(this.filePath));
      } catch {
        // バックアップ失敗は無視
      }
    }

    // 一時ファイルに書き込み
    const tempPath = `${this.filePath}.tmp`;
    const content = JSON.stringify(data, null, 2);
    writeFileSync(tempPath, content, "utf-8");

    // アトミックリネーム
    try {
      renameSync(tempPath, this.filePath);
    } catch {
      // クロスデバイスリンク対策
      writeFileSync(this.filePath, content, "utf-8");
      try {
        unlinkSync(tempPath);
      } catch {
        // 無視
      }
    }
  }

  /**
   * ファイルを削除
   */
  delete(): void {
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath);
      }
    } catch (error) {
      console.error(`[storage] Failed to delete ${this.filePath}:`, error);
    }
  }

  /**
   * ファイルが存在するか確認
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * ディレクトリを確保
   */
  private ensureDirectory(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * デフォルト値をクローン
   */
  private cloneDefault(): T {
    return JSON.parse(JSON.stringify(this.defaultValue));
  }

  /**
   * 読み込みデータとデフォルト値をマージ
   */
  private mergeWithDefault(data: Partial<T>): T {
    return { ...this.cloneDefault(), ...data };
  }
}

/**
 * ストレージファクトリ関数
 */
export function createStorage<T>(
  filename: string,
  defaultValue: T,
  config?: Partial<StorageConfig>
): JsonStorage<T> {
  return new JsonStorage(filename, defaultValue, config);
}

/**
 * 共有データディレクトリのパス
 */
export const SHARED_DIR = DEFAULT_CONFIG.dataDir;
