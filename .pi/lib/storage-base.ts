/**
 * @abdd.meta
 * path: .pi/lib/storage-base.ts
 * role: 拡張機能（サブエージェントやエージェントチーム等）のストレージ実装における共通基底モジュール
 * why: 同様のストレージ実装間で発生するDRY違反を排除し、循環依存を回避して一貫したパス生成・ファイル管理を行うため
 * related: .pi/lib/fs-utils.ts, .pi/lib/storage-lock.ts, extensions/subagents/storage.ts, extensions/agent-teams/storage.ts
 * public_api: createPathsFactory, createEnsurePaths, BaseStorage, BaseStoragePaths, BaseRunRecord, HasId
 * invariants: ディレクトリ構造は `.pi/{subdir}/runs` および `.pi/{subdir}/storage.json` に基づく
 * side_effects: ディレクトリの作成（ensureDir）、ファイルの読み書きおよびロック取得
 * failure_modes: ディレクトリ作成権限がない場合、ファイルロックが取得できない場合、循環依存が発生した場合
 * @abdd.explain
 * overview: ストレージパスの生成、ディレクトリ初期化、およびジェネリックな型定義を提供する基底モジュール
 * what_it_does:
 *   - 指定されたサブディレクトリ名に基づき、`.pi` 配下のパス構造を生成する
 *   - 必要なディレクトリを確保するパス生成関数を作成する
 *   - IDを持つエンティティ、実行記録、ストレージ構造の型を定義する
 *   - fs-utilsおよびstorage-lockと連携してファイル操作を安全に行う
 * why_it_exists:
 *   - 複数の拡張機能で重複するストレージロジックを共通化して保守性を高めるため
 *   - モジュール間の循環依存を防止し、依存グラフを明確に管理するため
 * scope:
 *   in: サブディレクトリ名、現在作業中のディレクトリパス
 *   out: ディレクトリ構造を持つパスオブジェクト、定義された型情報、初期化されたファイルシステム状態
 */

/**
 * Generic storage base module.
 * Provides common patterns for extension storage (subagents, agent-teams, etc.).
 * Eliminates DRY violations between similar storage implementations.
 *
 * DEPENDENCY GRAPH (to prevent circular dependencies):
 * ============================================
 * storage-base.ts
 *   ├── fs-utils.ts (ensureDir)
 *   └── storage-lock.ts (atomicWriteTextFile, withFileLock)
 *
 * storage-lock.ts
 *   └── (no internal dependencies)
 *
 * CONSUMERS (import from storage-base.ts):
 * - extensions/subagents/storage.ts
 * - extensions/agent-teams/storage.ts
 * - extensions/plan.ts
 *
 * IMPORTANT: Do not add imports from consumers back to this module
 * to avoid circular dependencies. If extending, use dependency injection
 * or callback patterns instead of direct imports.
 */

import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import { atomicWriteTextFile, withFileLock } from "./storage-lock.js";

// ============================================================================
// Core Types
// ============================================================================

/**
 * @summary ID属性を持つ
 * @description ID属性を持つことを示すインターフェース
 */
export interface HasId {
  id: string;
}

/**
 * 実行記録のインターフェース
 * @summary 実行記録定義
 */
export interface BaseRunRecord {
  runId: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  outputFile: string;
  error?: string;
}

/**
 * BUG-SEC-004修正: IDのバリデーションパターン
 * パストラバーサル攻撃を防ぐため、安全な文字のみを許可
 */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * BUG-SEC-004修正: IDをバリデーションしてパストラバーサルを防止
 * @summary IDをバリデーション
 * @param id - 検証するID
 * @returns バリデーション結果（true: 安全, false: 危険）
 */
export function isSafeId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return SAFE_ID_PATTERN.test(trimmed);
}

/**
 * BUG-SEC-004修正: IDをサニタイズ（安全な形式に変換）
 * @summary IDをサニタイズ
 * @param id - サニタイズするID
 * @returns サニタイズされたID（安全でない場合は空文字）
 */
export function sanitizeId(id: unknown): string {
  if (!isSafeId(id)) return "";
  return (id as string).trim();
}

/**
 * ストレージパスのインターフェース
 * @summary ストレージパス定義
 */
export interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

/**
 * ストレージの基底インターフェース
 * @summary ストレージ基底定義
 */
export interface BaseStorage<
  TDefinition extends HasId,
  TRun extends BaseRunRecord,
  TCurrentKey extends string,
> {
  definitions: TDefinition[];
  runs: TRun[];
  currentId?: TCurrentKey;
  defaultsVersion?: number;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * パスファクトリを作成
 * @summary パスファクトリ作成
 * @param subdir サブディレクトリ名
 */
export function createPathsFactory(subdir: string) {
  return (cwd: string): BaseStoragePaths => {
    const baseDir = join(cwd, ".pi", subdir);
    return {
      baseDir,
      runsDir: join(baseDir, "runs"),
      storageFile: join(baseDir, "storage.json"),
    };
  };
}

/**
 * パス生成関数を作成
 * @summary パス生成関数作成
 * @param getPaths ディレクトリからパス群を生成する関数
 * @returns パス群を返す高階関数
 */
export function createEnsurePaths<TPaths extends BaseStoragePaths>(
  getPaths: (cwd: string) => TPaths,
): (cwd: string) => TPaths {
  return (cwd: string): TPaths => {
    const paths = getPaths(cwd);
    ensureDir(paths.baseDir);
    ensureDir(paths.runsDir);
    return paths;
  };
}

// ============================================================================
// Run Artifact Pruning
// ============================================================================

/**
 * 実行アーティファクトを削除（グレース期間付き）
 * @summary アーティファクト削除
 * @param paths ストレージパス
 * @param runs 対象のRun配列
 * @param gracePeriodMs 削除猶予期間（ミリ秒、デフォルト60秒）
 * @returns なし
 *
 * ENOENT Race Condition対策:
 * 同時実行中のrunがファイルを書き込んでいる可能性があるため、
 * 最近作成されたファイル（gracePeriodMs以内）は削除しない。
 */
export function pruneRunArtifacts<TRun extends BaseRunRecord>(
  paths: BaseStoragePaths,
  runs: TRun[],
  gracePeriodMs: number = 60000,
): void {
  let files: string[] = [];
  try {
    files = readdirSync(paths.runsDir);
  } catch {
    return;
  }

  const keep = new Set(
    runs
      .map((run) => basename(run.outputFile || ""))
      .filter((name) => name.endsWith(".json")),
  );
  // runsが空の場合、またはkeepが空の場合は何も削除しない
  // (並列実行中に他のサブエージェントがファイルを作成している可能性があるため)
  if (runs.length === 0 || keep.size === 0) {
    return;
  }

  const now = Date.now();

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    if (keep.has(file)) continue;

    const filepath = join(paths.runsDir, file);

    // Grace period check: don't delete recently created files
    try {
      const stat = statSync(filepath);
      const fileAge = now - stat.mtimeMs;
      if (fileAge < gracePeriodMs) {
        continue; // Skip deletion for files created within grace period
      }
    } catch {
      // If we can't stat the file, skip it
      continue;
    }

    try {
      unlinkSync(filepath);
    } catch {
      // noop
    }
  }
}

// ============================================================================
// Storage Merge Utilities
// ============================================================================

/**
 * IDでエンティティをマージ
 * BUG-SEC-004修正: IDのサニタイズを適用
 * @summary エンティティマージ
 * @param disk ディスク上のエンティティ配列
 * @param next 次のエンティティ配列
 * @returns マージ後のエンティティ配列
 */
export function mergeEntitiesById<TEntity extends HasId>(
  disk: TEntity[],
  next: TEntity[],
): TEntity[] {
  const byId = new Map<string, TEntity>();

  for (const entity of disk) {
    if (!entity || typeof entity !== "object") continue;
    if (typeof (entity as { id?: unknown }).id !== "string") continue;
    // BUG-SEC-004修正: IDをサニタイズ
    const id = sanitizeId((entity as { id: string }).id);
    if (!id) continue;
    byId.set(id, entity);
  }

  for (const entity of next) {
    if (!entity || typeof entity !== "object") continue;
    if (typeof (entity as { id?: unknown }).id !== "string") continue;
    // BUG-SEC-004修正: IDをサニタイズ
    const id = sanitizeId((entity as { id: string }).id);
    if (!id) continue;
    byId.set(id, entity);
  }

  return Array.from(byId.values());
}

/**
 * runIdで配列を結合・ソートし上限を適用
 * @summary Run配列結合
 * @param disk ディスク上のRun配列
 * @param next 次のRun配列
 * @param maxRuns 最大保持数
 * @returns マージ後のRun配列
 */
export function mergeRunsById<
  TRun extends { runId: string; startedAt?: string; finishedAt?: string }
>(
  disk: TRun[],
  next: TRun[],
  maxRuns: number,
): TRun[] {
  const byId = new Map<string, TRun>();

  for (const run of disk) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    byId.set(run.runId, run);
  }

  for (const run of next) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    byId.set(run.runId, run);
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      const leftKey = left.finishedAt || left.startedAt || "";
      const rightKey = right.finishedAt || right.startedAt || "";
      return leftKey.localeCompare(rightKey);
    })
    .slice(-maxRuns);
}

/**
 * 現在のIDを解決
 * @summary 現在のID解決
 * @param nextId 次のID
 * @param diskId ディスク上のID
 * @param definitions エンティティ定義リスト
 * @returns 解決されたID
 */
export function resolveCurrentId<TEntity extends HasId>(
  nextId: string | undefined,
  diskId: string | undefined,
  definitions: TEntity[],
): string | undefined {
  const candidate =
    typeof nextId === "string" && nextId.trim()
      ? nextId
      : typeof diskId === "string" && diskId.trim()
        ? diskId
        : undefined;

  return candidate && definitions.some((def) => def.id === candidate)
    ? candidate
    : definitions[0]?.id;
}

/**
 * デフォルト版数を解決
 * @summary デフォルト版数解決
 * @param diskVersion ディスク上のバージョン
 * @param currentVersion 現在のバージョン
 * @returns 解決されたバージョン番号
 */
export function resolveDefaultsVersion(
  diskVersion: unknown,
  currentVersion: number,
): number {
  const diskDefaults =
    typeof diskVersion === "number" && Number.isFinite(diskVersion)
      ? Math.trunc(diskVersion)
      : 0;

  return Math.max(currentVersion, diskDefaults);
}

// ============================================================================
// Storage Load/Save Factories
// ============================================================================

/**
 * ストレージ読込用オプション
 * @summary 読込用オプション
 * @param {Function} ensurePaths - パス確認関数
 * @param {Function} createDefaults - デフォルト作成関数
 * @param {Function} validateStorage - 検証関数
 * @param {number} defaultsVersion - デフォルトバージョン
 * @param {string} storageKey - ストレージキー
 */
export interface CreateStorageLoaderOptions<
  TStorage,
  TPaths extends BaseStoragePaths,
> {
  ensurePaths: (cwd: string) => TPaths;
  createDefaults: (nowIso: string) => TStorage;
  validateStorage: (parsed: unknown, nowIso: string) => TStorage;
  defaultsVersion: number;
  storageKey: string; // For error messages
}

 /**
  * ストレージローダー関数を作成する。
  * @param options パス生成、デフォルト作成、バリデーションなどの設定
  * @returns 作業ディレクトリを受け取り、ストレージを返す関数
  */
export function createStorageLoader<
  TStorage,
  TPaths extends BaseStoragePaths,
>(
  options: CreateStorageLoaderOptions<TStorage, TPaths>,
): (cwd: string) => TStorage {
  const { ensurePaths, createDefaults, validateStorage, defaultsVersion, storageKey } = options;

  return (cwd: string): TStorage => {
    const paths = ensurePaths(cwd);
    const fallback = createDefaults(new Date().toISOString());

    if (!existsSync(paths.storageFile)) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8"));
      return validateStorage(parsed, new Date().toISOString());
    } catch {
      return fallback;
    }
  };
}

/**
 * ストレージ保存用オプション
 * @summary 保存用オプション
 * @param {Function} ensurePaths - パス確認関数
 * @param {Function} normalizeStorage - 正規化関数
 * @param {Function} mergeWithDisk - ディスクマージ関数
 * @param {Function} getRuns - 実行記録取得関数
 */
export interface CreateStorageSaverOptions<
  TStorage,
  TPaths extends BaseStoragePaths,
> {
  ensurePaths: (cwd: string) => TPaths;
  normalizeStorage: (storage: TStorage) => TStorage;
  mergeWithDisk: (storageFile: string, storage: TStorage) => TStorage;
  getRuns: (storage: TStorage) => BaseRunRecord[];
}

 /**
  * ストレージ保存用関数を作成する
  * @param options 保存処理のオプション
  * @returns ストレージを保存する関数
  */
export function createStorageSaver<
  TStorage,
  TPaths extends BaseStoragePaths,
>(
  options: CreateStorageSaverOptions<TStorage, TPaths>,
): (cwd: string, storage: TStorage) => void {
  const { ensurePaths, normalizeStorage, mergeWithDisk, getRuns } = options;

  return (cwd: string, storage: TStorage): void => {
    const paths = ensurePaths(cwd);
    const normalized = normalizeStorage(storage);

    withFileLock(paths.storageFile, () => {
      const merged = mergeWithDisk(paths.storageFile, normalized);
      atomicWriteTextFile(paths.storageFile, JSON.stringify(merged, null, 2));
      pruneRunArtifacts(paths, getRuns(merged));
    });
  };
}

// ============================================================================
// ID Utilities
// ============================================================================

/**
 * IDを生成する
 * @summary IDを生成
 * @param {string} input - 入力文字列
 * @returns {string} 生成されたID文字列
 */
export function toId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ============================================================================
// Corrupted Backup Utilities
// ============================================================================

/**
 * 破損したストレージファイルのバックアップを作成
 * @summary 破損バックアップ作成
 * @param storageFile - 元のストレージファイルパス
 * @param prefix - バックアップファイル名のプレフィックス（ログ用）
 * @returns バックアップファイルのパス、失敗時はnull
 */
export function createCorruptedBackup(
  storageFile: string,
  prefix: string,
): string | null {
  try {
    const { copyFileSync, statSync } = require("node:fs");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `${storageFile}.corrupted.${prefix}.${timestamp}.bak`;

    // Get original file stats for logging
    const stats = statSync(storageFile);
    const sizeBytes = stats.size;

    // Create backup copy
    copyFileSync(storageFile, backupFile);

    console.warn(
      `[${prefix}] Created backup of corrupted storage: ${backupFile} (${sizeBytes} bytes)`,
    );

    return backupFile;
  } catch (backupError) {
    console.error(
      `[${prefix}] Failed to create backup of corrupted storage: ${
        backupError instanceof Error ? backupError.message : String(backupError)
      }`,
    );
    return null;
  }
}

// ============================================================================
// Subagent-specific Helpers
// ============================================================================

/**
 * サブエージェントストレージとディスク状態をマージ
 * @summary ストレージ状態をマージ
 * @param storageFile ストレージファイルパス
 * @param next マージする次の状態
 * @param defaultsVersion デフォルトバージョン
 * @param maxRuns 最大実行回数
 * @returns マージ後の状態
 */
export function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: {
    agents: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentAgentId?: string;
    defaultsVersion?: number;
  },
  defaultsVersion: number,
  maxRuns: number,
): typeof next {
  let disk: Partial<typeof next> = {};
  try {
    if (existsSync(storageFile)) {
      disk = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<typeof next>;
    }
  } catch {
    disk = {};
  }

  const mergedAgents = mergeEntitiesById(
    Array.isArray(disk.agents) ? disk.agents : [],
    Array.isArray(next.agents) ? next.agents : [],
  );

  const mergedRuns = mergeRunsById(
    Array.isArray(disk.runs) ? disk.runs : [],
    Array.isArray(next.runs) ? next.runs : [],
    maxRuns,
  );

  const currentAgentId = resolveCurrentId(
    next.currentAgentId,
    disk.currentAgentId,
    mergedAgents,
  );

  return {
    agents: mergedAgents,
    runs: mergedRuns,
    currentAgentId,
    defaultsVersion: resolveDefaultsVersion(disk.defaultsVersion, defaultsVersion),
  };
}

/**
 * チームストレージとディスクの状態をマージする。
 * @summary ストレージ状態をマージ
 * @param storageFile ストレージファイルパス
 * @param next マージする次の状態
 * @param defaultsVersion デフォルトバージョン
 * @param maxRuns 最大実行回数
 * @returns マージ後の状態
 */
export function mergeTeamStorageWithDisk(
  storageFile: string,
  next: {
    teams: Array<{ id: string }>;
    runs: Array<{ runId: string; startedAt?: string; finishedAt?: string }>;
    currentTeamId?: string;
    defaultsVersion?: number;
  },
  defaultsVersion: number,
  maxRuns: number,
): typeof next {
  let disk: Partial<typeof next> = {};
  try {
    if (existsSync(storageFile)) {
      disk = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<typeof next>;
    }
  } catch {
    disk = {};
  }

  const mergedTeams = mergeEntitiesById(
    Array.isArray(disk.teams) ? disk.teams : [],
    Array.isArray(next.teams) ? next.teams : [],
  );

  const mergedRuns = mergeRunsById(
    Array.isArray(disk.runs) ? disk.runs : [],
    Array.isArray(next.runs) ? next.runs : [],
    maxRuns,
  );

  const currentTeamId = resolveCurrentId(
    next.currentTeamId,
    disk.currentTeamId,
    mergedTeams,
  );

  return {
    teams: mergedTeams,
    runs: mergedRuns,
    currentTeamId,
    defaultsVersion: resolveDefaultsVersion(disk.defaultsVersion, defaultsVersion),
  };
}
