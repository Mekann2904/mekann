/**
 * Agent team storage module.
 * Handles persistence for team definitions and run records.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { ensureDir } from "../../lib/fs-utils.js";
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
}

export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  enabled: TeamEnabledState;
  members: TeamMember[];
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

export interface TeamPaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const TEAM_DEFAULTS_VERSION = 2;

/**
 * Get storage paths for team data.
 */
export function getPaths(cwd: string): TeamPaths {
  const baseDir = join(cwd, ".pi", "agent-teams");
  return {
    baseDir,
    runsDir: join(baseDir, "runs"),
    storageFile: join(baseDir, "storage.json"),
  };
}

/**
 * Ensure storage directories exist.
 */
export function ensurePaths(cwd: string): TeamPaths {
  const paths = getPaths(cwd);
  ensureDir(paths.baseDir);
  ensureDir(paths.runsDir);
  return paths;
}

/**
 * Convert string to ID format.
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

/**
 * Prune old run artifacts from disk.
 */
function pruneTeamRunArtifacts(paths: TeamPaths, runs: TeamRunRecord[]): void {
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

/**
 * Merge storage with disk state (for concurrent access).
 */
function mergeTeamStorageWithDisk(
  storageFile: string,
  next: TeamStorage,
): TeamStorage {
  let disk: Partial<TeamStorage> = {};
  try {
    if (existsSync(storageFile)) {
      disk = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<TeamStorage>;
    }
  } catch {
    disk = {};
  }

  const diskTeams = Array.isArray(disk.teams) ? disk.teams : [];
  const nextTeams = Array.isArray(next.teams) ? next.teams : [];
  const teamById = new Map<string, TeamDefinition>();
  for (const team of diskTeams) {
    if (!team || typeof team !== "object") continue;
    if (typeof (team as { id?: unknown }).id !== "string") continue;
    const id = (team as { id: string }).id.trim();
    if (!id) continue;
    teamById.set(team.id, team);
  }
  for (const team of nextTeams) {
    if (!team || typeof team !== "object") continue;
    if (typeof (team as { id?: unknown }).id !== "string") continue;
    const id = (team as { id: string }).id.trim();
    if (!id) continue;
    teamById.set(team.id, team);
  }
  const mergedTeams = Array.from(teamById.values());

  const diskRuns = Array.isArray(disk.runs) ? disk.runs : [];
  const nextRuns = Array.isArray(next.runs) ? next.runs : [];
  const runById = new Map<string, TeamRunRecord>();
  for (const run of diskRuns) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    runById.set(run.runId, run);
  }
  for (const run of nextRuns) {
    if (!run || typeof run !== "object") continue;
    if (typeof (run as { runId?: unknown }).runId !== "string") continue;
    const runId = (run as { runId: string }).runId.trim();
    if (!runId) continue;
    runById.set(run.runId, run);
  }
  const mergedRuns = Array.from(runById.values())
    .sort((left, right) => {
      const leftKey = left.finishedAt || left.startedAt || "";
      const rightKey = right.finishedAt || right.startedAt || "";
      return leftKey.localeCompare(rightKey);
    })
    .slice(-MAX_RUNS_TO_KEEP);

  const candidateCurrent =
    typeof next.currentTeamId === "string" && next.currentTeamId.trim()
      ? next.currentTeamId
      : typeof disk.currentTeamId === "string" && disk.currentTeamId.trim()
        ? disk.currentTeamId
        : undefined;
  const currentTeamId =
    candidateCurrent && mergedTeams.some((team) => team.id === candidateCurrent)
      ? candidateCurrent
      : mergedTeams[0]?.id;

  const diskDefaults =
    typeof disk.defaultsVersion === "number" && Number.isFinite(disk.defaultsVersion)
      ? Math.trunc(disk.defaultsVersion)
      : 0;

  return {
    teams: mergedTeams,
    runs: mergedRuns,
    currentTeamId,
    defaultsVersion: Math.max(TEAM_DEFAULTS_VERSION, diskDefaults),
  };
}

/**
 * Load team storage from disk.
 */
export function loadStorage(cwd: string): TeamStorage {
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
    pruneTeamRunArtifacts(paths, merged.runs);
  });
}
