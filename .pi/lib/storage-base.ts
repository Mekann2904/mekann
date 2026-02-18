/**
 * Generic storage base module.
 * Provides common patterns for extension storage (subagents, agent-teams, etc.).
 * Eliminates DRY violations between similar storage implementations.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import { atomicWriteTextFile, withFileLock } from "./storage-lock.js";

// ============================================================================
// Core Types
// ============================================================================

 /**
  * IDを持つエンティティの基底インターフェース
  */
export interface HasId {
  id: string;
}

 /**
  * 実行記録の基本インターフェース。runIdを一意識別子とする。
  * @param runId 実行ID
  * @param status 実行ステータス
  * @param startedAt 開始日時
  * @param finishedAt 終了日時
  * @param outputFile 出力ファイルパス
  * @param error エラー内容（任意）
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
  * ストレージの基本パスを定義するインターフェース
  * @param baseDir ベースディレクトリのパス
  * @param runsDir 実行結果を格納するディレクトリのパス
  * @param storageFile ストレージファイルのパス
  */
export interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

 /**
  * 定義と実行を含むストレージの基底インターフェース
  * @param TDefinition IDを持つ定義の型
  * @param TRun 実行レコードの型
  * @param TCurrentKey 現在のキーの型
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
  * サブディレクトリ用のパスファクトリを作成
  * @param subdir サブディレクトリ名
  * @returns 現在のディレクトリからパスを生成する関数
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
  * ディレクトリを作成する関数を生成する
  * @param getPaths パスオブジェクトを取得する関数
  * @returns 指定されたパスのディレクトリを作成し、パスオブジェクトを返す関数
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
  * 古い実行アーティファクトを削除する
  * @param paths ストレージのパス情報
  * @param runs 実行レコードの配列
  * @returns なし
  */
export function pruneRunArtifacts<TRun extends BaseRunRecord>(
  paths: BaseStoragePaths,
  runs: TRun[],
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
  if (runs.length > 0 && keep.size === 0) {
    return;
  }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    if (keep.has(file)) continue;
    try {
      unlinkSync(join(paths.runsDir, file));
    } catch {
      // noop
    }
  }
}

// ============================================================================
// Storage Merge Utilities
// ============================================================================

 /**
  * IDを基にエンティティ配列をマージする。
  * @param disk ディスク上の既存エンティティ配列
  * @param next 追加または更新するエンティティ配列
  * @returns マージされたエンティティ配列
  */
export function mergeEntitiesById<TEntity extends HasId>(
  disk: TEntity[],
  next: TEntity[],
): TEntity[] {
  const byId = new Map<string, TEntity>();

  for (const entity of disk) {
    if (!entity || typeof entity !== "object") continue;
    if (typeof (entity as { id?: unknown }).id !== "string") continue;
    const id = (entity as { id: string }).id.trim();
    if (!id) continue;
    byId.set(entity.id, entity);
  }

  for (const entity of next) {
    if (!entity || typeof entity !== "object") continue;
    if (typeof (entity as { id?: unknown }).id !== "string") continue;
    const id = (entity as { id: string }).id.trim();
    if (!id) continue;
    byId.set(entity.id, entity);
  }

  return Array.from(byId.values());
}

 /**
  * runIdで配列を結合・ソートし上限を適用
  * @param disk ディスク上の実行レコード配列
  * @param next 新しい実行レコード配列（重複は優先）
  * @param maxRuns 最大保持数
  * @returns 結合・ソート・制限後の実行レコード配列
  */
export function mergeRunsById<TRun extends BaseRunRecord>(
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
  * 現在のIDを解決し、定義内に存在するか確認
  * @param nextId 次のID
  * @param diskId ディスクに保存されたID
  * @param definitions エンティティ定義の配列
  * @returns 有効なID、または存在しない場合はundefined
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
 * Extract defaults version from disk storage.
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
  * ストレージローダー作成用のオプション
  * @param ensurePaths パスを生成する関数
  * @param createDefaults デフォルト値を生成する関数
  * @param validateStorage 検証済みストレージを返す関数
  * @param defaultsVersion デフォルトのバージョン番号
  * @param storageKey エラーメッセージ用のキー名
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
  * ストレージ保存機能の作成オプション。
  * @param ensurePaths パス情報を生成する関数。
  * @param normalizeStorage ストレージデータを正規化する関数。
  * @param mergeWithDisk ディスクのデータとマージする関数。
  * @param getRuns 実行レコードのリストを取得する関数。
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
 * Convert string to ID format (lowercase, hyphen-separated).
 */
export function toId(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-\s_]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/\-+/g, "-")
    .replace(/^\-+|\-+$/g, "")
    .slice(0, 48);
}

// ============================================================================
// Subagent-specific Helpers
// ============================================================================

 /**
  * サブエージェントストレージとディスク状態をマージ
  * @param storageFile ストレージファイルパス
  * @param next マージする次の状態
  * @param defaultsVersion デフォルトバージョン
  * @param maxRuns 最大実行数
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
  * @param storageFile ストレージファイルパス
  * @param next マージする次の状態
  * @param defaultsVersion デフォルトのバージョン
  * @param maxRuns 最大実行数
  * @returns マージされた状態
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
