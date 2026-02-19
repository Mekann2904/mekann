/**
 * @abdd.meta
 * path: .pi/lib/storage-base.ts
 * role: サブエージェントやエージェントチーム等の拡張ストレージにおける共通基底実装を提供するモジュール
 * why: 類似するストレージ実装間でのDRY原則違反を排除し、再利用性を高めるため
 * related: ./fs-utils.ts, ./storage-lock.ts
 * public_api: HasId, BaseRunRecord, BaseStoragePaths, BaseStorage, createPathsFactory, createEnsurePaths, pruneRunArtifacts
 * invariants: BaseStoragePaths.baseDirとrunsDirは必ず存在する, TDefinitionはHasIdを継承する
 * side_effects: ディレクトリの作成、実行アーティファクトのファイル削除
 * failure_modes: ファイルシステムへの書き込み権限がない場合、またはパスが無効な場合にエラーが発生する
 * @abdd.explain
 * overview: 拡張ストレージ（subagents, agent-teamsなど）で使用される汎用的なデータ型、パス生成、初期化、および実行アーティファクトの整理機能を提供する。
 * what_it_does:
 *   - IDを持つエンティティ定義と実行記録を管理するための基本型を定義する
 *   - サブディレクトリ構造(.pi/{subdir}/runs)を持つパスを生成するファクトリ関数を提供する
 *   - 必要なディレクトリ構造を確保する関数を提供する
 *   - 実行記録に基づいて古いアーティファクトを削除する機能を提供する
 * why_it_exists:
 *   - 複数のストレージ実装（SubagentStorageやAgentTeamStorageなど）間で重複するコードを集約するため
 *   - 一貫したファイルシステムレイアウトとデータ構造を保証するため
 * scope:
 *   in: サブディレクトリ名(subdir)、現在のワーキングディレクトリ(cwd)
 *   out: 規定されたディレクトリ構造、定義および実行記録の型定義、アーティファクト削除の副作用
 */

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
 * @summary ID属性を持つ
 * @description ID属性を持つことを示すインターフェース
 */
export interface HasId {
  id: string;
}

/**
 * @summary HasIdのランタイムエクスポート
 * @description バレルエクスポート検証用の値
 */
export const HasId = "HasId";

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
 * 実行アーティファクトを削除
 * @summary アーティファクト削除
 * @param paths ストレージパス
 * @param runs 対象のRun配列
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
 * IDでエンティティをマージ
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
 * @summary Run配列結合
 * @param disk ディスク上のRun配列
 * @param next 次のRun配列
 * @param maxRuns 最大保持数
 * @returns マージ後のRun配列
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
