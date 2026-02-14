/**
 * Agent team storage module.
 * Handles persistence for team definitions and run records.
 *
 * Refactored to use common storage utilities from lib/storage-base.ts
 * to eliminate DRY violations with subagents/storage.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeTeamStorageWithDisk as mergeStorageWithDiskCommon,
  toId as toIdCommon,
  type BaseStoragePaths,
} from "../../lib/storage-base.js";
import { atomicWriteTextFile, withFileLock } from "../../lib/storage-lock.js";

// Re-export types
export type TeamEnabledState = "enabled" | "disabled";
export type TeamStrategy = "parallel" | "sequential";
export type TeamJudgeVerdict = "trusted" | "partial" | "untrusted";

export interface TeamMember {
  id: string;
  role: string;
  description: string;
  provider?: string;
  model?: string;
  enabled: boolean;
  skills?: string[];
}

export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  enabled: TeamEnabledState;
  members: TeamMember[];
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberResult {
  memberId: string;
  role: string;
  summary: string;
  output: string;
  status: "completed" | "failed";
  latencyMs: number;
  error?: string;
  diagnostics?: {
    confidence: number;
    evidenceCount: number;
    contradictionSignals: number;
    conflictSignals: number;
  };
}

export interface TeamFinalJudge {
  verdict: TeamJudgeVerdict;
  confidence: number;
  reason: string;
  nextStep: string;
  uIntra: number;
  uInter: number;
  uSys: number;
  collapseSignals: string[];
  rawOutput: string;
}

export interface TeamCommunicationAuditEntry {
  round: number;
  memberId: string;
  role: string;
  partnerIds: string[];
  referencedPartners: string[];
  missingPartners: string[];
  contextPreview: string;
  partnerSnapshots: string[];
  resultStatus: "completed" | "failed";
}

export interface TeamRunRecord {
  runId: string;
  teamId: string;
  strategy: TeamStrategy;
  task: string;
  communicationRounds?: number;
  failedMemberRetryRounds?: number;
  failedMemberRetryApplied?: number;
  recoveredMembers?: string[];
  communicationLinks?: Record<string, string[]>;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  memberCount: number;
  outputFile: string;
  finalJudge?: {
    verdict: TeamJudgeVerdict;
    confidence: number;
    reason: string;
    nextStep: string;
    uIntra: number;
    uInter: number;
    uSys: number;
    collapseSignals: string[];
  };
}

export interface TeamStorage {
  teams: TeamDefinition[];
  runs: TeamRunRecord[];
  currentTeamId?: string;
  defaultsVersion?: number;
}

export interface TeamPaths extends BaseStoragePaths {}

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const TEAM_DEFAULTS_VERSION = 2;

// Use common path factory
const getBasePaths = createPathsFactory("agent-teams");
export const getPaths = getBasePaths as (cwd: string) => TeamPaths;
export const ensurePaths = createEnsurePaths(getPaths);

/**
 * Convert string to ID format.
 * Uses common utility from lib/storage-base.ts.
 */
export function toId(input: string): string {
  return toIdCommon(input);
}

/**
 * Merge storage with disk state (for concurrent access).
 * Uses common utility from lib/storage-base.ts.
 */
function mergeTeamStorageWithDisk(
  storageFile: string,
  next: TeamStorage,
): TeamStorage {
  return mergeStorageWithDiskCommon(
    storageFile,
    {
      teams: next.teams,
      runs: next.runs,
      currentTeamId: next.currentTeamId,
      defaultsVersion: next.defaultsVersion,
    },
    TEAM_DEFAULTS_VERSION,
    MAX_RUNS_TO_KEEP,
  ) as TeamStorage;
}

// ============================================================================
// Storage Cache (in-memory for performance)
// ============================================================================

const storageCache = new Map<string, { storage: TeamStorage; timestamp: number }>();
const STORAGE_CACHE_TTL_MS = 30_000; // 30秒

/**
 * キャッシュを無効化する（team_create/configure等の変更時）
 */
export function invalidateStorageCache(cwd: string): void {
  storageCache.delete(cwd);
}

/**
 * Load team storage from disk with in-memory caching.
 */
export function loadStorage(cwd: string): TeamStorage {
  // キャッシュチェック
  const cached = storageCache.get(cwd);
  if (cached && Date.now() - cached.timestamp < STORAGE_CACHE_TTL_MS) {
    return cached.storage;
  }

  const storage = loadStorageFromDisk(cwd);
  storageCache.set(cwd, { storage, timestamp: Date.now() });
  return storage;
}

/**
 * Load team storage from disk (actual I/O).
 */
function loadStorageFromDisk(cwd: string): TeamStorage {
  const paths = ensurePaths(cwd);

  if (!existsSync(paths.storageFile)) {
    const fallback: TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: undefined,
      defaultsVersion: TEAM_DEFAULTS_VERSION,
    };
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<TeamStorage>;
    const storage: TeamStorage = {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentTeamId: typeof parsed.currentTeamId === "string" ? parsed.currentTeamId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return storage;
  } catch {
    const fallback: TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: undefined,
      defaultsVersion: TEAM_DEFAULTS_VERSION,
    };
    saveStorage(cwd, fallback);
    return fallback;
  }
}

/**
 * Save team storage to disk.
 */
export function saveStorage(cwd: string, storage: TeamStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: TeamStorage = {
    ...storage,
    runs: storage.runs.slice(-MAX_RUNS_TO_KEEP),
    defaultsVersion: TEAM_DEFAULTS_VERSION,
  };
  withFileLock(paths.storageFile, () => {
    const merged = mergeTeamStorageWithDisk(paths.storageFile, normalized);
    atomicWriteTextFile(paths.storageFile, JSON.stringify(merged, null, 2));
    pruneRunArtifacts(paths, merged.runs);
  });
  // キャッシュを更新
  storageCache.set(cwd, { storage: normalized, timestamp: Date.now() });
}
