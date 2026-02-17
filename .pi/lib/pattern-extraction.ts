/**
 * Pattern Extraction Module.
 * Extracts reusable patterns from run history for learning.
 * Identifies success/failure patterns and task-specific approaches.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import {
  extractKeywords,
  classifyTaskType,
  extractFiles,
  type TaskType,
} from "./run-index.js";
import { atomicWriteTextFile } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Extracted pattern from run history.
 */
export interface ExtractedPattern {
  id: string;
  patternType: "success" | "failure" | "approach";
  taskType: TaskType;
  description: string;
  keywords: string[];
  files: string[];
  agentOrTeam: string;
  frequency: number;
  lastSeen: string;
  confidence: number;
  examples: PatternExample[];
}

/**
 * Example of a pattern in action.
 */
export interface PatternExample {
  runId: string;
  task: string;
  summary: string;
  timestamp: string;
}

/**
 * Pattern storage structure.
 */
export interface PatternStorage {
  version: number;
  lastUpdated: string;
  patterns: ExtractedPattern[];
  patternsByTaskType: Record<TaskType, string[]>;
}

/**
 * Run data for pattern extraction.
 */
export interface RunData {
  runId: string;
  agentId?: string;
  teamId?: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

export const PATTERN_STORAGE_VERSION = 1;

/**
 * Success indicators in summaries.
 */
const SUCCESS_INDICATORS = [
  "completed",
  "success",
  "done",
  "完了",
  "成功",
  "resolved",
  "fixed",
  "implemented",
  "worked",
  "solved",
];

/**
 * Failure indicators in summaries.
 * Note: "error" alone is not sufficient - it could be "fixed error", "resolved error"
 */
const FAILURE_INDICATORS = [
  "failed",
  "timeout",
  "失敗",
  "エラー",
  "unable",
  "could not",
  "cannot",
  "did not work",
  "was not able",
];

/**
 * Strong failure patterns that indicate actual failures even with success words.
 */
const STRONG_FAILURE_PATTERNS = [
  /failed\s*:\s*\w/i,       // "failed: test"
  /error\s*:\s*\w/i,        // "error: cannot"
  /exception\s*:/i,         // "Exception: ..."
  /fatal\s+error/i,         // "fatal error"
  /crash(ed)?\b/i,          // "crashed", "crash"
];

// ============================================================================
// Pattern Extraction
// ============================================================================

/**
 * Generate a unique pattern ID.
 */
function generatePatternId(taskType: TaskType, keywords: string[]): string {
  const hash = keywords.slice(0, 3).join("-").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return `${taskType}-${hash}-${Date.now().toString(36)}`;
}

/**
 * Detect if a run represents a success pattern.
 */
function isSuccessPattern(summary: string): boolean {
  const lower = summary.toLowerCase();
  return SUCCESS_INDICATORS.some((ind) => lower.includes(ind));
}

/**
 * Check if "error" appears in a resolved context (e.g., "fixed error", "resolved error").
 */
function isErrorResolved(summary: string): boolean {
  const lower = summary.toLowerCase();
  const resolvedPatterns = [
    /fixed\s+(the\s+)?error/i,
    /resolved\s+(the\s+)?error/i,
    /solved\s+(the\s+)?error/i,
    /error\s+(was\s+)?(fixed|resolved|solved)/i,
    /corrected\s+(the\s+)?error/i,
    /handled\s+(the\s+)?error/i,
    /error\s+handling/i,
  ];
  return resolvedPatterns.some((p) => p.test(lower));
}

/**
 * Detect if a run represents a failure pattern.
 * Improved logic to avoid false positives from resolved errors.
 */
function isFailurePattern(summary: string, status: string): boolean {
  // Explicit failure status is always a failure
  if (status === "failed") return true;

  const lower = summary.toLowerCase();

  // Check for strong failure patterns (these override success indicators)
  if (STRONG_FAILURE_PATTERNS.some((p) => p.test(summary))) {
    return true;
  }

  // If there are success indicators, "error" is likely resolved
  if (isSuccessPattern(summary)) {
    // Only if error is NOT in a resolved context, it might still be failure
    if (lower.includes("error") && !isErrorResolved(summary)) {
      // Check if error appears in a negative context
      // e.g., "success but got error" or "completed with error"
      const negativeContexts = [
        /with\s+error/i,
        /but\s+.*error/i,
        /however.*error/i,
        /still.*error/i,
      ];
      if (negativeContexts.some((p) => p.test(lower))) {
        return true;
      }
    }
    // Otherwise, success indicators take precedence
    return false;
  }

  // No success indicators - check for failure indicators
  return FAILURE_INDICATORS.some((ind) => lower.includes(ind));
}

/**
 * Extract pattern from a single run.
 */
export function extractPatternFromRun(run: RunData): ExtractedPattern | null {
  const taskType = classifyTaskType(run.task, run.summary);
  const keywords = extractKeywords(`${run.task} ${run.summary}`);
  const files = extractFiles(`${run.task} ${run.summary}`);

  // Determine pattern type
  let patternType: "success" | "failure" | "approach";
  if (isFailurePattern(run.summary, run.status)) {
    patternType = "failure";
  } else if (isSuccessPattern(run.summary)) {
    patternType = "success";
  } else {
    patternType = "approach";
  }

  // Create description based on pattern type
  let description: string;
  if (patternType === "success") {
    description = `Successful approach for ${taskType}: ${run.summary.slice(0, 100)}`;
  } else if (patternType === "failure") {
    description = `Failure pattern for ${taskType}: ${run.error || run.summary.slice(0, 100)}`;
  } else {
    description = `Approach for ${taskType}: ${run.summary.slice(0, 100)}`;
  }

  return {
    id: generatePatternId(taskType, keywords),
    patternType,
    taskType,
    description,
    keywords: keywords.slice(0, 10),
    files,
    agentOrTeam: run.agentId || run.teamId || "unknown",
    frequency: 1,
    lastSeen: run.startedAt,
    confidence: run.status === "completed" ? 0.8 : 0.5,
    examples: [
      {
        runId: run.runId,
        task: run.task,
        summary: run.summary,
        timestamp: run.startedAt,
      },
    ],
  };
}

/**
 * Merge two patterns if they are similar.
 */
function mergePatterns(existing: ExtractedPattern, newPattern: ExtractedPattern): ExtractedPattern {
  // Combine keywords
  const combinedKeywords = [...new Set([...existing.keywords, ...newPattern.keywords])];

  // Combine files
  const combinedFiles = [...new Set([...existing.files, ...newPattern.files])];

  // Update examples (keep last 5)
  const combinedExamples = [...existing.examples, ...newPattern.examples]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return {
    ...existing,
    keywords: combinedKeywords.slice(0, 15),
    files: combinedFiles.slice(0, 10),
    frequency: existing.frequency + 1,
    lastSeen: newPattern.lastSeen,
    confidence: Math.min(existing.confidence + 0.05, 0.95),
    examples: combinedExamples,
  };
}

/**
 * Check if two patterns are similar enough to merge.
 */
function arePatternsSimilar(a: ExtractedPattern, b: ExtractedPattern): boolean {
  // Must be same type and task type
  if (a.patternType !== b.patternType || a.taskType !== b.taskType) {
    return false;
  }

  // Check keyword overlap
  const aKeywords = new Set(a.keywords);
  const bKeywords = new Set(b.keywords);
  const overlap = [...aKeywords].filter((k) => bKeywords.has(k)).length;
  const minKeywords = Math.min(aKeywords.size, bKeywords.size);

  // At least 50% keyword overlap
  return minKeywords > 0 && overlap / minKeywords >= 0.5;
}

// ============================================================================
// Pattern Storage Operations
// ============================================================================

/**
 * Get the path to the pattern storage file.
 */
export function getPatternStoragePath(cwd: string): string {
  return join(cwd, ".pi", "memory", "patterns.json");
}

/**
 * Load pattern storage from disk.
 */
export function loadPatternStorage(cwd: string): PatternStorage {
  const path = getPatternStoragePath(cwd);
  if (!existsSync(path)) {
    return {
      version: PATTERN_STORAGE_VERSION,
      lastUpdated: new Date().toISOString(),
      patterns: [],
      patternsByTaskType: {} as Record<TaskType, string[]>,
    };
  }

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: PATTERN_STORAGE_VERSION,
      lastUpdated: new Date().toISOString(),
      patterns: [],
      patternsByTaskType: {} as Record<TaskType, string[]>,
    };
  }
}

/**
 * Save pattern storage to disk.
 */
export function savePatternStorage(cwd: string, storage: PatternStorage): void {
  const path = getPatternStoragePath(cwd);
  ensureDir(join(cwd, ".pi", "memory"));
  storage.lastUpdated = new Date().toISOString();
  atomicWriteTextFile(path, JSON.stringify(storage, null, 2));
}

/**
 * Add a run to pattern storage.
 * Extracts pattern and merges with existing if similar.
 */
export function addRunToPatterns(cwd: string, run: RunData): void {
  const storage = loadPatternStorage(cwd);
  const newPattern = extractPatternFromRun(run);

  if (!newPattern) return;

  // Check for similar existing pattern
  let merged = false;
  for (let i = 0; i < storage.patterns.length; i++) {
    if (arePatternsSimilar(storage.patterns[i], newPattern)) {
      storage.patterns[i] = mergePatterns(storage.patterns[i], newPattern);
      merged = true;
      break;
    }
  }

  // Add new pattern if not merged
  if (!merged) {
    storage.patterns.push(newPattern);
  }

  // Rebuild task type index
  storage.patternsByTaskType = {} as Record<TaskType, string[]>;
  for (const pattern of storage.patterns) {
    if (!storage.patternsByTaskType[pattern.taskType]) {
      storage.patternsByTaskType[pattern.taskType] = [];
    }
    storage.patternsByTaskType[pattern.taskType].push(pattern.id);
  }

  savePatternStorage(cwd, storage);
}

/**
 * Extract patterns from all runs in storage.
 */
export function extractAllPatterns(cwd: string): PatternStorage {
  const storage = loadPatternStorage(cwd);

  // Read subagent runs
  const subagentStoragePath = join(cwd, ".pi", "subagents", "storage.json");
  if (existsSync(subagentStoragePath)) {
    try {
      const content = readFileSync(subagentStoragePath, "utf-8");
      const subagentStorage = JSON.parse(content);
      for (const run of subagentStorage.runs || []) {
        const pattern = extractPatternFromRun({
          runId: run.runId,
          agentId: run.agentId,
          task: run.task,
          summary: run.summary,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          error: run.error,
        });
        if (pattern) {
          // Check for similar existing pattern
          let merged = false;
          for (let i = 0; i < storage.patterns.length; i++) {
            if (arePatternsSimilar(storage.patterns[i], pattern)) {
              storage.patterns[i] = mergePatterns(storage.patterns[i], pattern);
              merged = true;
              break;
            }
          }
          if (!merged) {
            storage.patterns.push(pattern);
          }
        }
      }
    } catch (error) {
      console.error("Error reading subagent storage for pattern extraction:", error);
    }
  }

  // Read team runs
  const teamStoragePath = join(cwd, ".pi", "agent-teams", "storage.json");
  if (existsSync(teamStoragePath)) {
    try {
      const content = readFileSync(teamStoragePath, "utf-8");
      const teamStorage = JSON.parse(content);
      for (const run of teamStorage.runs || []) {
        const pattern = extractPatternFromRun({
          runId: run.runId,
          teamId: run.teamId,
          task: run.task,
          summary: run.summary,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          error: run.error,
        });
        if (pattern) {
          // Check for similar existing pattern
          let merged = false;
          for (let i = 0; i < storage.patterns.length; i++) {
            if (arePatternsSimilar(storage.patterns[i], pattern)) {
              storage.patterns[i] = mergePatterns(storage.patterns[i], pattern);
              merged = true;
              break;
            }
          }
          if (!merged) {
            storage.patterns.push(pattern);
          }
        }
      }
    } catch (error) {
      console.error("Error reading team storage for pattern extraction:", error);
    }
  }

  // Rebuild task type index
  storage.patternsByTaskType = {} as Record<TaskType, string[]>;
  for (const pattern of storage.patterns) {
    if (!storage.patternsByTaskType[pattern.taskType]) {
      storage.patternsByTaskType[pattern.taskType] = [];
    }
    storage.patternsByTaskType[pattern.taskType].push(pattern.id);
  }

  savePatternStorage(cwd, storage);
  return storage;
}

// ============================================================================
// Pattern Query Functions
// ============================================================================

/**
 * Get patterns for a specific task type.
 */
export function getPatternsForTaskType(
  cwd: string,
  taskType: TaskType,
  patternType?: "success" | "failure" | "approach"
): ExtractedPattern[] {
  const storage = loadPatternStorage(cwd);
  const patternIds = new Set(storage.patternsByTaskType[taskType] || []);

  return storage.patterns.filter((p) => {
    if (!patternIds.has(p.id)) return false;
    if (patternType && p.patternType !== patternType) return false;
    return true;
  });
}

/**
 * Get top success patterns.
 */
export function getTopSuccessPatterns(
  cwd: string,
  limit: number = 10
): ExtractedPattern[] {
  const storage = loadPatternStorage(cwd);

  return storage.patterns
    .filter((p) => p.patternType === "success")
    .sort((a, b) => b.frequency * b.confidence - a.frequency * a.confidence)
    .slice(0, limit);
}

/**
 * Get failure patterns to avoid.
 */
export function getFailurePatternsToAvoid(
  cwd: string,
  taskType?: TaskType
): ExtractedPattern[] {
  const storage = loadPatternStorage(cwd);

  let patterns = storage.patterns.filter((p) => p.patternType === "failure");

  if (taskType) {
    const patternIds = new Set(storage.patternsByTaskType[taskType] || []);
    patterns = patterns.filter((p) => patternIds.has(p.id));
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Find patterns relevant to a task description.
 */
export function findRelevantPatterns(
  cwd: string,
  taskDescription: string,
  limit: number = 5
): ExtractedPattern[] {
  const storage = loadPatternStorage(cwd);
  const taskKeywords = extractKeywords(taskDescription);
  const taskType = classifyTaskType(taskDescription, "");

  // Score each pattern
  const scored = storage.patterns.map((pattern) => {
    // Base score from task type match
    let score = pattern.taskType === taskType ? 10 : 0;

    // Keyword overlap
    const patternKeywords = new Set(pattern.keywords);
    const overlap = taskKeywords.filter((k) => patternKeywords.has(k)).length;
    score += overlap * 2;

    // Bonus for success patterns
    if (pattern.patternType === "success") score += 5;

    // Penalty for failure patterns
    if (pattern.patternType === "failure") score -= 3;

    // Frequency and confidence bonus
    score += pattern.frequency * 0.5;
    score += pattern.confidence * 5;

    return { pattern, score };
  });

  // Sort by score and return top results
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.pattern);
}
