/**
 * Subagent storage module.
 * Handles persistence for subagent definitions and run records.
 */

import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { ensureDir } from "../../lib/fs-utils.js";
import { atomicWriteTextFile, withFileLock } from "../../lib/storage-lock.js";

// Re-export types for convenience
export type AgentEnabledState = "enabled" | "disabled";

export interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  enabled: AgentEnabledState;
  createdAt: string;
  updatedAt: string;
}

export interface SubagentRunRecord {
  runId: string;
  agentId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  outputFile: string;
  error?: string;
}

export interface SubagentStorage {
  agents: SubagentDefinition[];
  runs: SubagentRunRecord[];
  currentAgentId?: string;
  defaultsVersion?: number;
}

export interface SubagentPaths {
  baseDir: string;
  runsDir: string;
  storageFile: string;
}

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const SUBAGENT_DEFAULTS_VERSION = 2;

/**
 * Get storage paths for subagent data.
 */
export function getPaths(cwd: string): SubagentPaths {
  const baseDir = join(cwd, ".pi", "subagents");
  return {
    baseDir,
    runsDir: join(baseDir, "runs"),
    storageFile: join(baseDir, "storage.json"),
  };
}

/**
 * Ensure storage directories exist.
 */
export function ensurePaths(cwd: string): SubagentPaths {
  const paths = getPaths(cwd);
  ensureDir(paths.baseDir);
  ensureDir(paths.runsDir);
  return paths;
}

/**
 * Create default subagent definitions.
 */
export function createDefaultAgents(nowIso: string): SubagentDefinition[] {
  return [
    {
      id: "researcher",
      name: "Researcher",
      description: "Fast code and docs investigator. Great for broad discovery and fact collection.",
      systemPrompt:
        "You are the Researcher subagent. Collect concrete facts quickly. Use short bullet points. Include file paths and exact findings. Avoid implementation changes.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "architect",
      name: "Architect",
      description: "Design-focused helper for decomposition, constraints, and migration plans.",
      systemPrompt:
        "You are the Architect subagent. Propose minimal, modular designs. Prefer explicit trade-offs and short execution plans.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "implementer",
      name: "Implementer",
      description: "Implementation helper for scoped coding tasks and fixes.",
      systemPrompt:
        "You are the Implementer subagent. Deliver precise, minimal code-focused output. Mention assumptions. Keep scope tight.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Read-only reviewer for risk checks, tests, and quality feedback.",
      systemPrompt:
        "You are the Reviewer subagent. Do not propose broad rewrites. Highlight critical issues first, then warnings, then optional improvements.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "tester",
      name: "Tester",
      description: "Validation helper focused on reproducible checks and minimal test plans.",
      systemPrompt:
        "You are the Tester subagent. Propose deterministic validation steps first. Prefer quick, high-signal checks and explicit expected outcomes.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

/**
 * Merge existing subagent with default values.
 */
function mergeDefaultSubagent(
  existing: SubagentDefinition,
  fallback: SubagentDefinition,
): SubagentDefinition {
  const hasDrift =
    existing.name !== fallback.name ||
    existing.description !== fallback.description ||
    existing.systemPrompt !== fallback.systemPrompt;
  return {
    ...fallback,
    enabled: existing.enabled,
    provider: existing.provider,
    model: existing.model,
    createdAt: existing.createdAt || fallback.createdAt,
    updatedAt: hasDrift ? new Date().toISOString() : existing.updatedAt || fallback.updatedAt,
  };
}

/**
 * Ensure storage has default agents.
 */
function ensureDefaults(storage: SubagentStorage, nowIso: string): SubagentStorage {
  const defaults = createDefaultAgents(nowIso);
  const defaultIds = new Set(defaults.map((agent) => agent.id));
  const existingById = new Map(storage.agents.map((agent) => [agent.id, agent]));
  const mergedAgents: SubagentDefinition[] = [];

  // Keep built-in definitions synchronized so prompt updates actually apply.
  for (const defaultAgent of defaults) {
    const existing = existingById.get(defaultAgent.id);
    if (!existing) {
      mergedAgents.push(defaultAgent);
      continue;
    }
    mergedAgents.push(mergeDefaultSubagent(existing, defaultAgent));
  }

  // Preserve user-defined agents as-is.
  for (const agent of storage.agents) {
    if (!defaultIds.has(agent.id)) {
      mergedAgents.push(agent);
    }
  }

  storage.agents = mergedAgents;
  storage.defaultsVersion = SUBAGENT_DEFAULTS_VERSION;

  if (!storage.currentAgentId || !storage.agents.some((agent) => agent.id === storage.currentAgentId)) {
    storage.currentAgentId = defaults[0]?.id;
  }

  return storage;
}

/**
 * Prune old run artifacts from disk.
 */
function pruneSubagentRunArtifacts(paths: SubagentPaths, runs: SubagentRunRecord[]): void {
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
function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: SubagentStorage,
): SubagentStorage {
  let disk: Partial<SubagentStorage> = {};
  try {
    if (existsSync(storageFile)) {
      disk = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<SubagentStorage>;
    }
  } catch {
    disk = {};
  }

  const diskAgents = Array.isArray(disk.agents) ? disk.agents : [];
  const nextAgents = Array.isArray(next.agents) ? next.agents : [];
  const agentById = new Map<string, SubagentDefinition>();
  for (const agent of diskAgents) {
    if (!agent || typeof agent !== "object") continue;
    if (typeof (agent as { id?: unknown }).id !== "string") continue;
    const id = (agent as { id: string }).id.trim();
    if (!id) continue;
    agentById.set(agent.id, agent);
  }
  for (const agent of nextAgents) {
    if (!agent || typeof agent !== "object") continue;
    if (typeof (agent as { id?: unknown }).id !== "string") continue;
    const id = (agent as { id: string }).id.trim();
    if (!id) continue;
    agentById.set(agent.id, agent);
  }
  const mergedAgents = Array.from(agentById.values());

  const diskRuns = Array.isArray(disk.runs) ? disk.runs : [];
  const nextRuns = Array.isArray(next.runs) ? next.runs : [];
  const runById = new Map<string, SubagentRunRecord>();
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
    typeof next.currentAgentId === "string" && next.currentAgentId.trim()
      ? next.currentAgentId
      : typeof disk.currentAgentId === "string" && disk.currentAgentId.trim()
        ? disk.currentAgentId
        : undefined;
  const currentAgentId =
    candidateCurrent && mergedAgents.some((agent) => agent.id === candidateCurrent)
      ? candidateCurrent
      : mergedAgents[0]?.id;

  const diskDefaults =
    typeof disk.defaultsVersion === "number" && Number.isFinite(disk.defaultsVersion)
      ? Math.trunc(disk.defaultsVersion)
      : 0;

  return {
    agents: mergedAgents,
    runs: mergedRuns,
    currentAgentId,
    defaultsVersion: Math.max(SUBAGENT_DEFAULTS_VERSION, diskDefaults),
  };
}

/**
 * Load subagent storage from disk.
 */
export function loadStorage(cwd: string): SubagentStorage {
  const paths = ensurePaths(cwd);
  const nowIso = new Date().toISOString();

  const fallback: SubagentStorage = {
    agents: createDefaultAgents(nowIso),
    runs: [],
    currentAgentId: "researcher",
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };

  if (!existsSync(paths.storageFile)) {
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<SubagentStorage>;
    const storage: SubagentStorage = {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentAgentId: typeof parsed.currentAgentId === "string" ? parsed.currentAgentId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return ensureDefaults(storage, nowIso);
  } catch {
    saveStorage(cwd, fallback);
    return fallback;
  }
}

/**
 * Save subagent storage to disk.
 */
export function saveStorage(cwd: string, storage: SubagentStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: SubagentStorage = {
    ...storage,
    runs: storage.runs.slice(-MAX_RUNS_TO_KEEP),
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };
  withFileLock(paths.storageFile, () => {
    const merged = mergeSubagentStorageWithDisk(paths.storageFile, normalized);
    atomicWriteTextFile(paths.storageFile, JSON.stringify(merged, null, 2));
    pruneSubagentRunArtifacts(paths, merged.runs);
  });
}
