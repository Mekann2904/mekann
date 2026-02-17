/**
 * Run Index Module.
 * Creates searchable indexes from subagent and team run histories.
 * Enables semantic and keyword-based retrieval of past solutions.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import { atomicWriteTextFile } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Indexed run record with extracted keywords and tags.
 */
export interface IndexedRun {
  runId: string;
  source: "subagent" | "agent-team";
  agentId?: string;
  teamId?: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  keywords: string[];
  taskType: TaskType;
  files: string[];
  timestamp: string;
  successPattern?: string;
  failurePattern?: string;
}

/**
 * Task type classification.
 */
export type TaskType =
  | "code-review"
  | "bug-fix"
  | "feature-implementation"
  | "refactoring"
  | "research"
  | "documentation"
  | "testing"
  | "architecture"
  | "analysis"
  | "optimization"
  | "security"
  | "configuration"
  | "unknown";

/**
 * Run index structure.
 */
export interface RunIndex {
  version: number;
  lastUpdated: string;
  runs: IndexedRun[];
  keywordIndex: Record<string, string[]>; // keyword -> runIds
  taskTypeIndex: Record<TaskType, string[]>; // taskType -> runIds
}

/**
 * Search options for querying the index.
 */
export interface SearchOptions {
  limit?: number;
  status?: "completed" | "failed";
  taskType?: TaskType;
  minKeywordMatch?: number;
}

/**
 * Search result with relevance score.
 */
export interface SearchResult {
  run: IndexedRun;
  score: number;
  matchedKeywords: string[];
}

// ============================================================================
// Constants
// ============================================================================

export const RUN_INDEX_VERSION = 1;

/**
 * Keywords that indicate specific task types.
 */
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  "code-review": ["review", "レビュー", "feedback", "品質", "quality", "check"],
  "bug-fix": ["fix", "bug", "error", "修正", "バグ", "エラー", "issue", "resolve"],
  "feature-implementation": ["implement", "add", "create", "実装", "追加", "feature", "機能"],
  refactoring: ["refactor", "リファクタ", "clean", "improve", "改善", "restructure"],
  research: ["research", "investigate", "analyze", "調査", "分析", "study", "explore"],
  documentation: ["document", "doc", "readme", "ドキュメント", "説明"],
  testing: ["test", "テスト", "spec", "verify", "検証"],
  architecture: ["architecture", "design", "アーキテクチャ", "設計", "structure"],
  analysis: ["analyze", "analysis", "解析", "examine", "evaluate"],
  optimization: ["optimize", "performance", "最適化", "speed", "efficient"],
  security: ["security", "vulnerability", "セキュリティ", "脆弱性", "auth"],
  configuration: ["config", "設定", "setup", "configure", "environment"],
  unknown: [],
};

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * Extract keywords from text using simple heuristics.
 */
export function extractKeywords(text: string): string[] {
  const keywords: Set<string> = new Set();

  // Extract words (alphanumeric + Japanese)
  const words = text.match(/[a-zA-Z][a-zA-Z0-9_-]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || [];

  for (const word of words) {
    const lower = word.toLowerCase();

    // Skip very short words
    if (lower.length < 2) continue;

    // Skip common stop words
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "have", "has", "had", "do", "does", "did", "will", "would",
      "could", "should", "may", "might", "must", "shall", "can",
      "this", "that", "these", "those", "it", "its", "for", "from",
      "with", "about", "into", "through", "during", "before", "after",
      "above", "below", "to", "of", "in", "on", "at", "by", "and", "or",
    ]);

    if (stopWords.has(lower)) continue;

    keywords.add(lower);
  }

  return Array.from(keywords);
}

/**
 * Classify task type based on keywords.
 */
export function classifyTaskType(task: string, summary: string): TaskType {
  const text = `${task} ${summary}`.toLowerCase();
  const scores: Record<TaskType, number> = {} as Record<TaskType, number>;

  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (type === "unknown") continue;
    scores[type as TaskType] = keywords.reduce((score, kw) => {
      return score + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
  }

  // Find the type with highest score
  let maxScore = 0;
  let maxType: TaskType = "unknown";

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as TaskType;
    }
  }

  return maxType;
}

/**
 * Extract file paths from text.
 */
export function extractFiles(text: string): string[] {
  const filePatterns = [
    // File paths with extensions (handles commas, semicolons, parens, brackets around/before filenames)
    /(?:^|[\s"'`(\[])([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})(?:[\s"'`,;:)\]]|$)/g,
    // Quoted paths
    /["'`]([^"'`]+\.[a-zA-Z]{1,10})["'`]/g,
  ];

  const files: Set<string> = new Set();

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const path = match[1];
      // Filter out obvious non-file patterns
      if (path.length > 3 && !path.includes("://") && !path.startsWith("http")) {
        files.add(path);
      }
    }
  }

  return Array.from(files);
}

// ============================================================================
// Index Building
// ============================================================================

/**
 * Build an indexed run from a subagent run record.
 */
export function indexSubagentRun(
  run: {
    runId: string;
    agentId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }
): IndexedRun {
  const text = `${run.task} ${run.summary}`;
  const keywords = extractKeywords(text);
  const taskType = classifyTaskType(run.task, run.summary);
  const files = extractFiles(text);

  return {
    runId: run.runId,
    source: "subagent",
    agentId: run.agentId,
    task: run.task,
    summary: run.summary,
    status: run.status,
    keywords,
    taskType,
    files,
    timestamp: run.startedAt,
  };
}

/**
 * Build an indexed run from a team run record.
 */
export function indexTeamRun(
  run: {
    runId: string;
    teamId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }
): IndexedRun {
  const text = `${run.task} ${run.summary}`;
  const keywords = extractKeywords(text);
  const taskType = classifyTaskType(run.task, run.summary);
  const files = extractFiles(text);

  return {
    runId: run.runId,
    source: "agent-team",
    teamId: run.teamId,
    task: run.task,
    summary: run.summary,
    status: run.status,
    keywords,
    taskType,
    files,
    timestamp: run.startedAt,
  };
}

/**
 * Build the complete run index from storage files.
 */
export function buildRunIndex(cwd: string): RunIndex {
  const runs: IndexedRun[] = [];
  const keywordIndex: Record<string, string[]> = {};
  const taskTypeIndex: Record<TaskType, string[]> = {} as Record<TaskType, string[]>;

  // Initialize task type index
  for (const type of Object.keys(TASK_TYPE_KEYWORDS)) {
    taskTypeIndex[type as TaskType] = [];
  }

  // Read subagent runs
  const subagentStoragePath = join(cwd, ".pi", "subagents", "storage.json");
  if (existsSync(subagentStoragePath)) {
    try {
      const content = readFileSync(subagentStoragePath, "utf-8");
      const storage = JSON.parse(content);
      for (const run of storage.runs || []) {
        const indexed = indexSubagentRun(run);
        runs.push(indexed);

        // Update keyword index
        for (const kw of indexed.keywords) {
          if (!keywordIndex[kw]) keywordIndex[kw] = [];
          keywordIndex[kw].push(run.runId);
        }

        // Update task type index
        taskTypeIndex[indexed.taskType].push(run.runId);
      }
    } catch (error) {
      console.error("Error reading subagent storage:", error);
    }
  }

  // Read team runs
  const teamStoragePath = join(cwd, ".pi", "agent-teams", "storage.json");
  if (existsSync(teamStoragePath)) {
    try {
      const content = readFileSync(teamStoragePath, "utf-8");
      const storage = JSON.parse(content);
      for (const run of storage.runs || []) {
        const indexed = indexTeamRun(run);
        runs.push(indexed);

        // Update keyword index
        for (const kw of indexed.keywords) {
          if (!keywordIndex[kw]) keywordIndex[kw] = [];
          keywordIndex[kw].push(run.runId);
        }

        // Update task type index
        taskTypeIndex[indexed.taskType].push(run.runId);
      }
    } catch (error) {
      console.error("Error reading team storage:", error);
    }
  }

  return {
    version: RUN_INDEX_VERSION,
    lastUpdated: new Date().toISOString(),
    runs,
    keywordIndex,
    taskTypeIndex,
  };
}

// ============================================================================
// Index Storage
// ============================================================================

/**
 * Get the path to the run index file.
 */
export function getRunIndexPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "run-index.json");
}

/**
 * Load the run index from disk.
 */
export function loadRunIndex(cwd: string): RunIndex | null {
  const path = getRunIndexPath(cwd);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save the run index to disk.
 */
export function saveRunIndex(cwd: string, index: RunIndex): void {
  const path = getRunIndexPath(cwd);
  ensureDir(join(cwd, ".pi", "memory"));
  index.lastUpdated = new Date().toISOString();
  atomicWriteTextFile(path, JSON.stringify(index, null, 2));
}

/**
 * Get or build the run index.
 * Returns cached index if available and recent, otherwise rebuilds.
 */
export function getOrBuildRunIndex(cwd: string, maxAgeMs: number = 60000): RunIndex {
  const cached = loadRunIndex(cwd);

  if (cached) {
    const age = Date.now() - new Date(cached.lastUpdated).getTime();
    if (age < maxAgeMs) {
      return cached;
    }
  }

  const index = buildRunIndex(cwd);
  saveRunIndex(cwd, index);
  return index;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search for runs matching a query.
 */
export function searchRuns(
  index: RunIndex,
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const { limit = 10, status, taskType, minKeywordMatch = 1 } = options;

  // Extract keywords from query
  const queryKeywords = extractKeywords(query);

  // Score each run
  const results: SearchResult[] = [];

  for (const run of index.runs) {
    // Filter by status if specified
    if (status && run.status !== status) continue;

    // Filter by task type if specified
    if (taskType && run.taskType !== taskType) continue;

    // Calculate keyword match score
    const matchedKeywords = run.keywords.filter((kw) =>
      queryKeywords.some((qk) => qk === kw || kw.includes(qk) || qk.includes(kw))
    );

    if (matchedKeywords.length < minKeywordMatch) continue;

    // Calculate relevance score
    const score = matchedKeywords.length / Math.max(queryKeywords.length, 1);

    results.push({
      run,
      score,
      matchedKeywords,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  return results.slice(0, limit);
}

/**
 * Find similar past runs based on task description.
 */
export function findSimilarRuns(
  index: RunIndex,
  task: string,
  limit: number = 5
): SearchResult[] {
  return searchRuns(index, task, { limit, status: "completed" });
}

/**
 * Get runs by task type.
 */
export function getRunsByType(index: RunIndex, taskType: TaskType): IndexedRun[] {
  const runIds = new Set(index.taskTypeIndex[taskType] || []);
  return index.runs.filter((run) => runIds.has(run.runId));
}

/**
 * Get successful patterns for a given task type.
 */
export function getSuccessfulPatterns(
  index: RunIndex,
  taskType: TaskType,
  limit: number = 10
): IndexedRun[] {
  const runs = getRunsByType(index, taskType)
    .filter((run) => run.status === "completed")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return runs.slice(0, limit);
}
