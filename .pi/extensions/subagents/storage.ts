/**
 * Subagent storage module.
 * Handles persistence for subagent definitions and run records.
 *
 * Refactored to use common storage utilities from lib/storage-base.ts
 * to eliminate DRY violations with agent-teams/storage.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeSubagentStorageWithDisk as mergeStorageWithDiskCommon,
  type BaseStoragePaths,
} from "../../lib/storage-base.js";
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
  skills?: string[];
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

export interface SubagentPaths extends BaseStoragePaths {}

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const SUBAGENT_DEFAULTS_VERSION = 4;  // Updated: added challenger and inspector agents

// Use common path factory
const getBasePaths = createPathsFactory("subagents");
export const getPaths = getBasePaths as (cwd: string) => SubagentPaths;
export const ensurePaths = createEnsurePaths(getPaths);

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
        "You are the Researcher subagent. Collect concrete facts quickly. Use short bullet points. Include file paths and exact findings. Avoid implementation changes. Before starting investigation, explicitly state your understanding of what the user wants to know. If the user's intent is unclear, list multiple possible interpretations. Actively seek evidence that contradicts your initial hypotheses.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "architect",
      name: "Architect",
      description: "Design-focused helper for decomposition, constraints, and migration plans.",
      systemPrompt:
        "You are the Architect subagent. Propose minimal, modular designs. Prefer explicit trade-offs and short execution plans. Consider multiple design alternatives before settling on one. Explicitly state what assumptions your design depends on. Consider edge cases and failure modes. Verify that your design constraints are necessary and not overly restrictive.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "implementer",
      name: "Implementer",
      description: "Implementation helper for scoped coding tasks and fixes.",
      systemPrompt:
        "You are the Implementer subagent. Deliver precise, minimal code-focused output. Mention assumptions. Keep scope tight. Before implementing, verify your understanding of requirements. Consider edge cases and potential side effects. Explicitly state what assumptions your implementation depends on. After implementation, verify that the solution actually solves the stated problem.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Read-only reviewer for risk checks, tests, and quality feedback.",
      systemPrompt:
        "You are the Reviewer subagent. Do not propose broad rewrites. Highlight critical issues first, then warnings, then optional improvements. Specifically check for: (1) confirmation bias in conclusions - actively seek disconfirming evidence, (2) missing evidence for claims, (3) logical inconsistencies between CLAIM and RESULT, (4) reversal of causal claims - verify if 'A implies B' also means 'B implies A', (5) assumptions about user intent that may be incorrect, (6) anchoring bias - reconsider initial conclusions in light of new evidence.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "tester",
      name: "Tester",
      description: "Validation helper focused on reproducible checks and minimal test plans.",
      systemPrompt:
        "You are the Tester subagent. Propose deterministic validation steps first. Prefer quick, high-signal checks and explicit expected outcomes. Actively seek test cases that could disprove the implementation, not just confirm it. Consider boundary conditions, edge cases, and failure modes. Distinguish between tests that verify expected behavior and tests that try to break the code.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "challenger",
      name: "Challenger",
      description: "Adversarial reviewer that actively disputes claims and finds weaknesses in other agents' outputs.",
      systemPrompt:
        "You are the Challenger subagent. Your primary role is to DISPUTE and FIND FLAWS in other agents' outputs. " +
        "For each claim you review: (1) Identify at least one weakness or gap, (2) Check if evidence actually supports the claim or is merely consistent with it, " +
        "(3) Propose at least one alternative interpretation, (4) Flag assumptions that may be unwarranted, " +
        "(5) Test boundary conditions where the claim would fail. " +
        "Be constructively critical - your goal is to strengthen conclusions through rigorous challenge. " +
        "Output format: CHALLENGED_CLAIM: <specific claim>, FLAW: <identified flaw>, EVIDENCE_GAP: <missing evidence>, " +
        "ALTERNATIVE: <alternative interpretation>, BOUNDARY_FAILURE: <conditions where claim fails>, SEVERITY: critical/moderate/minor.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "inspector",
      name: "Inspector",
      description: "Output quality monitor that detects suspicious patterns, inconsistencies, and potential reasoning failures.",
      systemPrompt:
        "You are the Inspector subagent. Monitor outputs for suspicious patterns: " +
        "(1) Claims without evidence or with weak evidence for high confidence, " +
        "(2) Logical inconsistencies between CLAIM and RESULT sections, " +
        "(3) Confidence misalignment with evidence strength (e.g., 0.9 confidence with minimal evidence), " +
        "(4) Missing alternative explanations for conclusions, " +
        "(5) Reversal of causal claims without justification ('A implies B' treated as 'B implies A'), " +
        "(6) Confirmation bias patterns - only seeking supporting evidence. " +
        "Output format: INSPECTION_REPORT: <findings>, SUSPICION_LEVEL: low/medium/high, " +
        "RECOMMENDATION: proceed/challenge/reject, EVIDENCE: <specific file:line references for issues>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

/**
 * Merge existing subagent with default values.
 * Note: Kept locally because this is subagent-specific merge logic.
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
 * Note: Kept locally because default agent logic is subagent-specific.
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
 * Merge storage with disk state (for concurrent access).
 * Uses common utility from lib/storage-base.ts.
 */
function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: SubagentStorage,
): SubagentStorage {
  return mergeStorageWithDiskCommon(
    storageFile,
    {
      agents: next.agents,
      runs: next.runs,
      currentAgentId: next.currentAgentId,
      defaultsVersion: next.defaultsVersion,
    },
    SUBAGENT_DEFAULTS_VERSION,
    MAX_RUNS_TO_KEEP,
  ) as SubagentStorage;
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
    pruneRunArtifacts(paths, merged.runs);
  });
}
