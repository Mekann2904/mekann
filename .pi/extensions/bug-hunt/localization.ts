// Path: .pi/extensions/bug-hunt/localization.ts
// What: bug-hunt の候補抽出、近傍収集、evidence 検証を担当する
// Why: runner から検索 index 再利用と file validation を分離して単純化するため
// Related: .pi/extensions/bug-hunt/runner.ts, .pi/extensions/bug-hunt/types.ts, .pi/extensions/search/locagent/index.ts, .pi/extensions/repograph-localization/index.ts

import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";

import { repographLocalize } from "../repograph-localization/index.js";
import {
  buildLocAgentGraph,
  isLocAgentGraphStale,
  loadLocAgentGraph,
  saveLocAgentGraph,
} from "../search/locagent/index.js";
import { searchEntities, traverseGraph } from "../search/locagent/query.js";
import { buildCallGraph, readCallGraphIndex, saveCallGraphIndex, isCallGraphIndexStale } from "../search/call-graph/index.js";
import { findCallers, findCallees, getNodeStats } from "../search/call-graph/query.js";
import { buildRepoGraph, isRepoGraphStale, loadRepoGraph, saveRepoGraph } from "../search/repograph/index.js";
import type { CallGraphIndex } from "../search/call-graph/types.js";
import type { LocAgentGraph } from "../search/locagent/types.js";
import type { RepoGraphIndex } from "../search/repograph/types.js";
import type { BugHuntCandidate, BugHuntEvidence, BugHuntReport } from "./types.js";

interface BugHuntLocalizationResources {
  locagent: LocAgentGraph | null;
  repograph: RepoGraphIndex | null;
  callGraph: CallGraphIndex | null;
}

interface MutableCandidate extends BugHuntCandidate {
  _sourceSet: Set<BugHuntCandidate["sources"][number]>;
}

let cachedResources:
  | {
      cwd: string;
      loadedAt: number;
      resources: BugHuntLocalizationResources;
    }
  | null = null;

const CACHE_TTL_MS = 60_000;

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeTextForKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9./:_-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createCandidateKey(input: {
  file: string;
  line?: number;
  symbolName?: string;
}): string {
  return [
    normalizeTextForKey(input.file),
    String(input.line ?? 0),
    normalizeTextForKey(input.symbolName ?? ""),
  ].join("|");
}

function candidateIdFromKey(key: string): string {
  return `candidate:${key}`;
}

function tokenizeKeywords(query: string, extraKeywords: string[] = []): string[] {
  const tokens = [
    ...query.split(/[^a-zA-Z0-9_./:-]+/g),
    ...extraKeywords,
  ]
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 60);

  return Array.from(new Set(tokens)).slice(0, 16);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException)?.code;
    // ENOENT is expected (file doesn't exist), log other errors
    if (errorCode !== "ENOENT") {
      console.error(`[bug-hunt] fileExists failed for ${path}:`, errorCode ?? "unknown", error);
    }
    return false;
  }
}

async function readSnippet(cwd: string, file: string, line?: number, radius: number = 4): Promise<string | undefined> {
  const fullPath = resolve(cwd, file);
  if (!(await fileExists(fullPath))) {
    return undefined;
  }

  try {
    const content = await readFile(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    if (!line || line < 1 || line > lines.length) {
      return truncate(lines.slice(0, 8).join("\n"), 500);
    }

    const start = Math.max(0, line - radius - 1);
    const end = Math.min(lines.length, line + radius);
    return truncate(
      lines
        .slice(start, end)
        .map((entry, index) => `${start + index + 1}: ${entry}`)
        .join("\n"),
      700,
    );
  } catch {
    return undefined;
  }
}

async function ensureLocalizationResources(cwd: string): Promise<BugHuntLocalizationResources> {
  if (
    cachedResources
    && cachedResources.cwd === cwd
    && Date.now() - cachedResources.loadedAt < CACHE_TTL_MS
  ) {
    return cachedResources.resources;
  }

  let locagent = await loadLocAgentGraph(cwd);
  if (!locagent || await isLocAgentGraphStale(cwd, ".")) {
    try {
      locagent = await buildLocAgentGraph(".", cwd);
      await saveLocAgentGraph(locagent, cwd);
    } catch {
      locagent = locagent ?? null;
    }
  }

  let repograph = await loadRepoGraph(cwd);
  if (!repograph || await isRepoGraphStale(cwd, ".")) {
    try {
      repograph = await buildRepoGraph(".", cwd);
      await saveRepoGraph(repograph, cwd);
    } catch {
      repograph = repograph ?? null;
    }
  }

  let callGraph = await readCallGraphIndex(cwd);
  if (!callGraph || await isCallGraphIndexStale(cwd)) {
    try {
      callGraph = await buildCallGraph(".", cwd);
      await saveCallGraphIndex(callGraph, cwd);
    } catch {
      callGraph = callGraph ?? null;
    }
  }

  const resources = {
    locagent,
    repograph,
    callGraph,
  };

  cachedResources = {
    cwd,
    loadedAt: Date.now(),
    resources,
  };

  return resources;
}

function upsertCandidate(
  registry: Map<string, MutableCandidate>,
  nextCandidate: Omit<BugHuntCandidate, "id" | "sources"> & { source: BugHuntCandidate["sources"][number] },
): void {
  const key = createCandidateKey({
    file: nextCandidate.file,
    line: nextCandidate.line,
    symbolName: nextCandidate.symbolName,
  });
  const existing = registry.get(key);

  if (existing) {
    existing._sourceSet.add(nextCandidate.source);
    existing.score += nextCandidate.score;
    if (!existing.summary || existing.summary.length < nextCandidate.summary.length) {
      existing.summary = nextCandidate.summary;
    }
    if (!existing.snippet && nextCandidate.snippet) {
      existing.snippet = nextCandidate.snippet;
    }
    if (!existing.symbolName && nextCandidate.symbolName) {
      existing.symbolName = nextCandidate.symbolName;
    }
    if (!existing.line && nextCandidate.line) {
      existing.line = nextCandidate.line;
    }
    if (!existing.endLine && nextCandidate.endLine) {
      existing.endLine = nextCandidate.endLine;
    }
    if (!existing.locagentNodeId && nextCandidate.locagentNodeId) {
      existing.locagentNodeId = nextCandidate.locagentNodeId;
    }
    return;
  }

  registry.set(key, {
    id: candidateIdFromKey(key),
    sources: [nextCandidate.source],
    _sourceSet: new Set([nextCandidate.source]),
    file: nextCandidate.file,
    line: nextCandidate.line,
    endLine: nextCandidate.endLine,
    symbolName: nextCandidate.symbolName,
    nodeType: nextCandidate.nodeType,
    score: nextCandidate.score,
    summary: nextCandidate.summary,
    snippet: nextCandidate.snippet,
    locagentNodeId: nextCandidate.locagentNodeId,
  });
}

export async function collectBugHuntCandidates(input: {
  cwd: string;
  query: string;
  keywords: string[];
  limit?: number;
  preferredFiles?: string[];
}): Promise<BugHuntCandidate[]> {
  const resources = await ensureLocalizationResources(input.cwd);
  const keywords = tokenizeKeywords(input.query, input.keywords);
  const preferredFiles = new Set((input.preferredFiles ?? []).map((entry) => entry.replace(/\\/g, "/")));
  const registry = new Map<string, MutableCandidate>();

  if (resources.locagent && keywords.length > 0) {
    const locagentResults = searchEntities(resources.locagent, keywords, {
      nodeTypes: ["function", "class", "file"],
      detailLevel: "preview",
      limit: 16,
    });

    for (const result of locagentResults) {
      const file = result.entity.filePath;
      if (!file) {
        continue;
      }

      upsertCandidate(registry, {
        source: "locagent",
        file,
        line: result.entity.line,
        endLine: result.entity.endLine,
        symbolName: result.entity.nodeType === "file" ? undefined : result.entity.name,
        nodeType: result.entity.nodeType,
        score: 1 + (result.score / 10),
        summary: truncate(
          result.entity.signature
            || result.entity.docstring
            || result.codeSnippet
            || `${result.entity.nodeType} ${result.entity.name}`,
          220,
        ),
        snippet: truncate(result.codeSnippet, 400),
        locagentNodeId: result.entity.id,
      });
    }
  }

  const repoResult = await repographLocalize(input.query, input.cwd, {
    k: 4,
    maxNodes: 40,
  });
  if (repoResult.success) {
    for (const location of repoResult.locations.slice(0, 16)) {
      upsertCandidate(registry, {
        source: "repograph",
        file: location.file,
        line: location.line,
        symbolName: location.symbolName || undefined,
        nodeType: location.nodeType,
        score: 1 + location.relevance,
        summary: truncate(`RepoGraph hit near ${location.symbolName || location.file}`, 220),
      });
    }
  }

  const ranked = Array.from(registry.values())
    .map((candidate) => {
      if (resources.callGraph && candidate.symbolName) {
        const stats = getNodeStats(resources.callGraph, candidate.symbolName);
        candidate.score += Math.min(1.2, ((stats.directCallers + stats.directCallees) / 10));
      }
      if (preferredFiles.has(candidate.file.replace(/\\/g, "/"))) {
        candidate.score += 2.5;
      }

      return {
        ...candidate,
        sources: Array.from(candidate._sourceSet),
      } satisfies BugHuntCandidate;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, input.limit ?? 8));

  for (const candidate of ranked) {
    if (!candidate.snippet) {
      candidate.snippet = await readSnippet(input.cwd, candidate.file, candidate.line);
    }
  }

  return ranked;
}

function normalizeWorkspacePath(pathValue: string): string {
  return pathValue.replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveRelativeImportPath(fromFile: string, specifier: string): string[] | null {
  const normalizedFrom = normalizeWorkspacePath(fromFile);
  const fromDir = dirname(normalizedFrom);
  const basePath = normalizeWorkspacePath(posix.normalize(posix.join(fromDir, specifier)));
  
  // パストラバーサル防止: ワークスペース外へのパスを拒否
  // 正規化後のパスが '..' で始まる場合、ワークスペース外へのアクセスを試みている
  if (basePath.startsWith("../") || basePath === "..") {
    console.warn(`[bug-hunt] Path traversal blocked: ${specifier} resolves to ${basePath}`);
    return null;
  }
  
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    basePath.replace(/\.js$/i, ".ts"),
    basePath.replace(/\.js$/i, ".tsx"),
  ];
  return Array.from(new Set(candidates.map((entry) => normalizeWorkspacePath(entry))));
}

export async function expandBugHuntPreferredFiles(cwd: string, focusFiles: string[]): Promise<string[]> {
  const expanded = new Set<string>();

  for (const focusFile of focusFiles) {
    const normalizedFocusFile = normalizeWorkspacePath(focusFile);
    expanded.add(normalizedFocusFile);

    const absolutePath = resolve(cwd, normalizedFocusFile);
    if (!(await fileExists(absolutePath))) {
      continue;
    }

    try {
      const content = await readFile(absolutePath, "utf8");
      const importMatches = content.matchAll(/from\s+["'](\.[^"']+)["']|import\s+["'](\.[^"']+)["']/g);
      for (const match of importMatches) {
        const specifier = match[1] || match[2];
        if (!specifier) {
          continue;
        }
        const resolvedPaths = resolveRelativeImportPath(normalizedFocusFile, specifier);
        // パストラバーサルが検出された場合はスキップ
        if (!resolvedPaths) {
          continue;
        }
        for (const candidate of resolvedPaths) {
          const candidateAbsolutePath = resolve(cwd, candidate);
          if (await fileExists(candidateAbsolutePath)) {
            expanded.add(candidate);
          }
        }
      }
    } catch (error) {
      const errorCode = (error as NodeJS.ErrnoException)?.code;
      if (errorCode !== "ENOENT") {
        console.warn(`[bug-hunt] expandBugHuntPreferredFiles: Failed to read ${absolutePath}:`, errorCode ?? "unknown", error);
      }
      continue;
    }
  }

  return Array.from(expanded).slice(0, 16);
}

export async function buildBugHuntInvestigationContext(input: {
  cwd: string;
  candidate: BugHuntCandidate;
}): Promise<string> {
  const resources = await ensureLocalizationResources(input.cwd);
  const lines: string[] = [];

  lines.push(`Candidate file: ${input.candidate.file}`);
  if (input.candidate.line) {
    lines.push(`Candidate line: ${input.candidate.line}`);
  }
  if (input.candidate.symbolName) {
    lines.push(`Candidate symbol: ${input.candidate.symbolName}`);
  }
  lines.push(`Candidate summary: ${input.candidate.summary}`);

  if (input.candidate.snippet) {
    lines.push("", "Candidate snippet:", input.candidate.snippet);
  }

  if (resources.locagent && input.candidate.locagentNodeId) {
    const neighborhood = traverseGraph(resources.locagent, [input.candidate.locagentNodeId], {
      direction: "both",
      hops: 2,
      limit: 16,
    });
    const nearbyNodes = neighborhood.nodes
      .filter((node) => node.id !== input.candidate.locagentNodeId)
      .slice(0, 8)
      .map((node) => {
        const location = node.filePath
          ? `${node.filePath}${node.line ? `:${node.line}` : ""}`
          : node.id;
        return `${node.nodeType} ${node.name} @ ${location}`;
      });

    if (nearbyNodes.length > 0) {
      lines.push("", "LocAgent neighborhood:", ...nearbyNodes.map((entry) => `- ${entry}`));
    }
  }

  if (resources.callGraph && input.candidate.symbolName) {
    const callers = findCallers(resources.callGraph, input.candidate.symbolName, 2, 5)
      .map((result) => `${result.node.name} @ ${result.node.file}:${result.node.line} (depth=${result.depth}, conf=${result.confidence.toFixed(2)})`);
    const callees = findCallees(resources.callGraph, input.candidate.symbolName, 2, 5)
      .map((result) => `${result.node.name} @ ${result.node.file}:${result.node.line} (depth=${result.depth}, conf=${result.confidence.toFixed(2)})`);

    if (callers.length > 0) {
      lines.push("", "Callers:", ...callers.map((entry) => `- ${entry}`));
    }
    if (callees.length > 0) {
      lines.push("", "Callees:", ...callees.map((entry) => `- ${entry}`));
    }
  }

  const fileSnippet = await readSnippet(input.cwd, input.candidate.file, input.candidate.line, 8);
  if (fileSnippet && fileSnippet !== input.candidate.snippet) {
    lines.push("", "Local file excerpt:", fileSnippet);
  }

  return lines.join("\n");
}

export async function validateBugHuntReportEvidence(
  report: BugHuntReport,
  cwd: string,
): Promise<{ valid: boolean; report: BugHuntReport | null; issues: string[] }> {
  const issues: string[] = [];
  const normalizedEvidence: BugHuntEvidence[] = [];

  for (const entry of report.evidence) {
    const absolutePath = isAbsolute(entry.file) ? entry.file : resolve(cwd, entry.file);
    const relativePath = relative(cwd, absolutePath).replace(/\\/g, "/");

    if (relativePath.startsWith("..")) {
      issues.push(`evidence outside workspace: ${entry.file}`);
      continue;
    }

    if (!(await fileExists(absolutePath))) {
      issues.push(`missing evidence file: ${entry.file}`);
      continue;
    }

    let normalizedLine = entry.line;
    if (normalizedLine) {
      try {
        const content = await readFile(absolutePath, "utf8");
        const lineCount = content.split(/\r?\n/).length;
        if (normalizedLine < 1 || normalizedLine > lineCount) {
          issues.push(`invalid evidence line ${normalizedLine} for ${relativePath}`);
          normalizedLine = undefined;
        }
      } catch {
        issues.push(`failed to validate evidence line: ${relativePath}`);
      }
    }

    normalizedEvidence.push({
      file: relativePath || dirname(absolutePath),
      line: normalizedLine,
      reason: entry.reason,
    });
  }

  const dedupedEvidence = Array.from(
    new Map(
      normalizedEvidence.map((entry) => [
        `${entry.file}:${entry.line ?? 0}:${normalizeTextForKey(entry.reason)}`,
        entry,
      ]),
    ).values(),
  );

  if (dedupedEvidence.length === 0) {
    return {
      valid: false,
      report: null,
      issues: issues.length > 0 ? issues : ["all evidence entries were rejected"],
    };
  }

  return {
    valid: true,
    report: {
      ...report,
      evidence: dedupedEvidence,
    },
    issues,
  };
}

export function summarizeCandidatesForState(candidates: BugHuntCandidate[]): string[] {
  return candidates.slice(0, 8).map((candidate) => {
    const location = candidate.line ? `${candidate.file}:${candidate.line}` : candidate.file;
    const symbol = candidate.symbolName ? ` ${candidate.symbolName}` : "";
    return `${location}${symbol} [${candidate.score.toFixed(2)}]`;
  });
}
