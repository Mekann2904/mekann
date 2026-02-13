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
 * Base interface for entities that have an ID.
 */
export interface HasId {
  id: string;
}

/**
 * Base interface for run records.
 * Note: Uses runId as the unique identifier (not id).
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
 * Base interface for storage paths.
 */
export interface BaseStoragePaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

/**
 * Base interface for storage with definitions and runs.
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
 * Create a paths factory for a given subdirectory.
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
 * Create an ensurePaths function that creates directories.
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
 * Prune old run artifacts from disk.
 * Generic version that works with any run record type.
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
 * Merge two arrays of entities by ID, preferring the second array for duplicates.
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
 * Merge two arrays of run records by runId, preferring the second array for duplicates.
 * Also sorts by finishedAt/startedAt and limits to maxRuns.
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
 * Resolve the current ID, ensuring it exists in the merged definitions.
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
 * Options for creating a storage loader.
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
 * Create a storage loader function.
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
 * Options for creating a storage saver.
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
 * Create a storage saver function.
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
 * Merge subagent storage with disk state.
 * Note: This is exported for direct use by subagents/storage.ts during migration.
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
 * Merge team storage with disk state.
 * Note: This is exported for direct use by agent-teams/storage.ts during migration.
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
