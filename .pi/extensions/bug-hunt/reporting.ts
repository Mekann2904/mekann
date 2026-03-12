// Path: .pi/extensions/bug-hunt/reporting.ts
// What: bug-hunt 用の prompt 生成とモデル出力の正規化を担当する
// Why: runner の I/O を純粋関数へ分離してテストしやすくするため
// Related: .pi/extensions/bug-hunt/runner.ts, .pi/extensions/bug-hunt/storage.ts, tests/unit/extensions/bug-hunt-reporting.test.ts

import type {
  BugHuntCandidate,
  BugHuntEvidence,
  BugHuntHypothesis,
  BugHuntInvestigationResult,
  BugHuntInvestigationStatus,
  BugHuntModelResult,
  BugHuntQueryPlan,
  BugHuntReport,
  BugHuntSeverity,
} from "./types.js";

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeSeverity(value: unknown): BugHuntSeverity {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "critical" || raw === "high" || raw === "medium" || raw === "low") {
    return raw;
  }
  return "medium";
}

function normalizeText(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown, limit: number = 12): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  ).slice(0, limit);
}

function normalizeCandidateReference(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^candidate:/, "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, "")
    .replace(/[|@#]+/g, ":")
    .replace(/:+/g, ":")
    .replace(/^:/, "")
    .replace(/:$/, "");
}

function buildCandidateReferenceAliases(candidate: BugHuntCandidate): string[] {
  const file = candidate.file.replace(/\\/g, "/");
  const line = candidate.line ? String(candidate.line) : "";
  const symbol = candidate.symbolName?.trim() || "";
  const aliases = [
    candidate.id,
    candidate.id.replace(/^candidate:/i, ""),
    file,
    line ? `${file}:${line}` : "",
    line && symbol ? `${file}:${line}:${symbol}` : "",
    symbol,
  ];

  return Array.from(
    new Set(
      aliases
        .filter((value) => value.length > 0)
        .map((value) => normalizeCandidateReference(value)),
    ),
  );
}

function normalizeEvidence(value: unknown, allowEmpty: boolean = false): BugHuntEvidence[] {
  if (!Array.isArray(value)) {
    if (allowEmpty) {
      return [];
    }
    throw new Error("evidence must be an array");
  }

  const evidence: BugHuntEvidence[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const file = normalizeOptionalText((entry as { file?: unknown }).file);
    const reason = normalizeOptionalText((entry as { reason?: unknown }).reason);
    const rawLine = (entry as { line?: unknown }).line;
    const line = typeof rawLine === "number" && Number.isFinite(rawLine)
      ? Math.max(1, Math.trunc(rawLine))
      : undefined;

    if (!file || !reason) {
      continue;
    }

    evidence.push({
      file,
      ...(line ? { line } : {}),
      reason,
    });
  }

  if (!allowEmpty && evidence.length === 0) {
    throw new Error("at least one evidence entry is required");
  }

  return evidence;
}

function computeFallbackDedupeKey(title: string, evidence: BugHuntEvidence[]): string {
  return [
    title.toLowerCase(),
    ...evidence.map((entry) => `${entry.file}:${entry.line ?? 0}`.toLowerCase()),
  ].join("|");
}

function normalizeBugReport(value: unknown): BugHuntReport {
  if (!value || typeof value !== "object") {
    throw new Error("bug report payload must be an object");
  }

  const record = value as Record<string, unknown>;
  const title = normalizeText(record.title, "title");
  const summary = normalizeText(record.summary, "summary");
  const why = normalizeText(record.why, "why");
  const evidence = normalizeEvidence(record.evidence);
  const dedupeKey = normalizeOptionalText(record.dedupeKey) ?? computeFallbackDedupeKey(title, evidence);

  return {
    title,
    summary,
    severity: normalizeSeverity(record.severity),
    confidence: clampConfidence(record.confidence),
    why,
    reproduction: normalizeOptionalText(record.reproduction),
    suggestedFix: normalizeOptionalText(record.suggestedFix),
    evidence,
    dedupeKey,
  };
}

function normalizeCandidateId(value: unknown, fieldName: string = "candidateId"): string {
  const raw = normalizeText(value, fieldName);
  return raw.slice(0, 200);
}

function normalizeQueryPlan(value: unknown): BugHuntQueryPlan {
  if (!value || typeof value !== "object") {
    throw new Error("query plan payload must be an object");
  }

  const record = value as Record<string, unknown>;
  const query = normalizeText(record.query, "query");
  const keywords = normalizeStringArray(record.keywords, 16);

  return {
    query,
    keywords: keywords.length > 0 ? keywords : query.split(/\s+/).slice(0, 8),
    bugSignals: normalizeStringArray(record.bugSignals, 12),
    areasToAvoid: normalizeStringArray(record.areasToAvoid, 12),
    confidence: clampConfidence(record.confidence),
  };
}

function normalizeHypotheses(value: unknown): BugHuntHypothesis[] {
  if (!value || typeof value !== "object") {
    throw new Error("hypothesis payload must be an object");
  }

  const entries = Array.isArray((value as { hypotheses?: unknown }).hypotheses)
    ? (value as { hypotheses: unknown[] }).hypotheses
    : [];

  const hypotheses: BugHuntHypothesis[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const candidateId = normalizeOptionalText(record.candidateId);
    const hypothesis = normalizeOptionalText(record.hypothesis);
    if (!candidateId || !hypothesis) {
      continue;
    }

    hypotheses.push({
      id: normalizeOptionalText(record.id) ?? `hypothesis-${index + 1}`,
      candidateId: normalizeCandidateId(candidateId),
      titleHint: normalizeOptionalText(record.titleHint) ?? hypothesis.slice(0, 120),
      hypothesis,
      severity: normalizeSeverity(record.severity),
      confidence: clampConfidence(record.confidence),
      focus: normalizeStringArray(record.focus, 8),
    });
  }

  return hypotheses;
}

function normalizeInvestigationStatus(value: unknown): BugHuntInvestigationStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "supported" || raw === "rejected" || raw === "inconclusive") {
    return raw;
  }
  return "inconclusive";
}

function normalizeInvestigation(value: unknown): BugHuntInvestigationResult {
  if (!value || typeof value !== "object") {
    throw new Error("investigation payload must be an object");
  }

  const record = value as Record<string, unknown>;
  const title = normalizeOptionalText(record.title) ?? "Unconfirmed bug candidate";
  const summary = normalizeOptionalText(record.summary) ?? title;
  const why = normalizeOptionalText(record.why) ?? "The evidence is not yet conclusive.";

  return {
    hypothesisId: normalizeOptionalText(record.hypothesisId) ?? "unknown-hypothesis",
    candidateId: normalizeCandidateId(record.candidateId),
    status: normalizeInvestigationStatus(record.status),
    confidence: clampConfidence(record.confidence),
    title,
    summary,
    why,
    evidence: normalizeEvidence(record.evidence, true),
    chain: normalizeStringArray(record.chain, 12),
    reproduction: normalizeOptionalText(record.reproduction),
    suggestedFix: normalizeOptionalText(record.suggestedFix),
  };
}

function extractJsonBlock(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  throw new Error("JSON object not found in model output");
}

function formatCandidate(candidate: BugHuntCandidate): string {
  const location = candidate.line ? `${candidate.file}:${candidate.line}` : candidate.file;
  const sourceLabel = candidate.sources.join("+");
  const snippet = candidate.snippet ? `\nSnippet:\n${candidate.snippet}` : "";

  return [
    `- id: ${candidate.id}`,
    `  location: ${location}`,
    `  symbol: ${candidate.symbolName ?? "(file-level)"}`,
    `  sources: ${sourceLabel}`,
    `  score: ${candidate.score.toFixed(2)}`,
    `  summary: ${candidate.summary}`,
    snippet ? `  details: ${snippet.replace(/\n/g, "\n  ")}` : "",
  ].filter((line) => line.length > 0).join("\n");
}

export function buildBugHuntQueryPrompt(input: {
  taskPrompt: string;
  cwd: string;
  iteration: number;
  knownDedupeKeys: string[];
  recentTitles: string[];
  seenFiles: string[];
}): string {
  const knownFingerprints = input.knownDedupeKeys.slice(-20).join(", ") || "(none)";
  const recentTitles = input.recentTitles.slice(0, 12).join(" | ") || "(none)";
  const seenFiles = input.seenFiles.slice(-20).join(", ") || "(none)";

  return [
    "You are preparing a bug-hunting search query for a TypeScript-heavy repository.",
    "Rewrite the mission into a short, concrete investigation query.",
    "Extract keywords and symptom signals that help code localization.",
    "Avoid duplicates that match known dedupe keys, recent titles, or already-seen files.",
    "",
    `Workspace: ${input.cwd}`,
    `Iteration: ${input.iteration}`,
    `Mission: ${input.taskPrompt}`,
    `Known dedupe keys: ${knownFingerprints}`,
    `Recent bug titles: ${recentTitles}`,
    `Recently seen files: ${seenFiles}`,
    "",
    "Return JSON only.",
    "",
    "{",
    '  "query": "short localized investigation query",',
    '  "keywords": ["identifier", "keyword"],',
    '  "bugSignals": ["symptom or failure signal"],',
    '  "areasToAvoid": ["duplicate or irrelevant area"],',
    '  "confidence": 0.0',
    "}",
  ].join("\n");
}

export function buildBugHuntHypothesisPrompt(input: {
  queryPlan: BugHuntQueryPlan;
  candidates: BugHuntCandidate[];
}): string {
  return [
    "You are the hypothesis agent for bug-hunt.",
    "Review the candidate locations and propose the strongest root-cause hypotheses.",
    "Prefer correctness, lifecycle, concurrency, data integrity, and error handling bugs.",
    "Choose at most 3 candidates worth deeper investigation.",
    "",
    `Query: ${input.queryPlan.query}`,
    `Keywords: ${input.queryPlan.keywords.join(", ") || "(none)"}`,
    `Bug signals: ${input.queryPlan.bugSignals.join(", ") || "(none)"}`,
    "",
    "Candidates:",
    ...input.candidates.map((candidate) => formatCandidate(candidate)),
    "",
    "Return JSON only.",
    "",
    "{",
    '  "hypotheses": [',
    "    {",
    '      "id": "hyp-1",',
    '      "candidateId": "candidate id from above",',
    '      "titleHint": "short bug title",',
    '      "hypothesis": "what is likely wrong and why",',
    '      "severity": "low|medium|high|critical",',
    '      "confidence": 0.0,',
    '      "focus": ["specific branch or behavior to inspect"]',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

export function buildBugHuntInvestigationPrompt(input: {
  queryPlan: BugHuntQueryPlan;
  candidate: BugHuntCandidate;
  hypothesis: BugHuntHypothesis;
  context: string;
  rejectedHypotheses: string[];
}): string {
  const rejected = input.rejectedHypotheses.slice(-8).join(" | ") || "(none)";

  return [
    "You are the investigation agent for bug-hunt.",
    "Test the hypothesis against the provided local context only.",
    "Do not invent files or lines that are not present in the context.",
    "If the evidence is weak, return rejected or inconclusive.",
    "",
    `Query: ${input.queryPlan.query}`,
    `Candidate: ${formatCandidate(input.candidate)}`,
    `Hypothesis: ${input.hypothesis.hypothesis}`,
    `Rejected hypotheses to avoid repeating: ${rejected}`,
    "",
    "Local context:",
    input.context,
    "",
    "Return JSON only.",
    "",
    "{",
    '  "candidateId": "same candidate id",',
    '  "hypothesisId": "same hypothesis id",',
    '  "status": "supported|rejected|inconclusive",',
    '  "confidence": 0.0,',
    '  "title": "short title for the bug if supported",',
    '  "summary": "short summary",',
    '  "why": "reasoning grounded in the provided context",',
    '  "reproduction": "optional",',
    '  "suggestedFix": "optional",',
    '  "chain": ["symbol or file path that forms the causal path"],',
    '  "evidence": [',
    '    { "file": "path/to/file.ts", "line": 123, "reason": "why this line matters" }',
    "  ]",
    "}",
  ].join("\n");
}

export function buildBugHuntObserverPrompt(input: {
  taskPrompt: string;
  queryPlan: BugHuntQueryPlan;
  investigations: BugHuntInvestigationResult[];
  knownDedupeKeys: string[];
  recentTitles: string[];
}): string {
  const investigations = input.investigations
    .map((investigation) => JSON.stringify(investigation, null, 2))
    .join("\n\n");

  return [
    "You are the observer agent for bug-hunt.",
    "Review all investigation results and decide whether to report one new bug.",
    "Only report when the evidence is concrete, non-duplicate, and grounded in the investigation results.",
    "If no candidate is credible enough, return status=no_bug.",
    "",
    `Mission: ${input.taskPrompt}`,
    `Query: ${input.queryPlan.query}`,
    `Known dedupe keys: ${input.knownDedupeKeys.slice(-20).join(", ") || "(none)"}`,
    `Recent bug titles: ${input.recentTitles.slice(0, 12).join(" | ") || "(none)"}`,
    "",
    "Investigation results:",
    investigations || "(none)",
    "",
    "Return JSON only.",
    "",
    "{",
    '  "status": "bug_found" | "no_bug",',
    '  "reason": "required when status=no_bug",',
    '  "title": "required when status=bug_found",',
    '  "summary": "required when status=bug_found",',
    '  "severity": "low|medium|high|critical",',
    '  "confidence": 0.0,',
    '  "why": "required when status=bug_found",',
    '  "reproduction": "optional",',
    '  "suggestedFix": "optional",',
    '  "dedupeKey": "stable short key for this bug",',
    '  "evidence": [',
    '    { "file": "path/to/file.ts", "line": 123, "reason": "why this location matters" }',
    "  ]",
    "}",
  ].join("\n");
}

export function buildBugHuntPrompt(input: {
  taskPrompt: string;
  cwd: string;
  iteration: number;
  knownFingerprints: string[];
  recentTitles: string[];
}): string {
  return buildBugHuntQueryPrompt({
    taskPrompt: input.taskPrompt,
    cwd: input.cwd,
    iteration: input.iteration,
    knownDedupeKeys: input.knownFingerprints,
    recentTitles: input.recentTitles,
    seenFiles: [],
  });
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  return JSON.parse(extractJsonBlock(raw)) as Record<string, unknown>;
}

export function parseBugHuntQueryOutput(raw: string): BugHuntQueryPlan {
  return normalizeQueryPlan(parseJsonRecord(raw));
}

export function parseBugHuntHypothesisOutput(raw: string): BugHuntHypothesis[] {
  return normalizeHypotheses(parseJsonRecord(raw));
}

export function resolveBugHuntCandidateReference(
  reference: string,
  candidates: BugHuntCandidate[],
): string | null {
  const normalizedReference = normalizeCandidateReference(reference);
  if (!normalizedReference) {
    return null;
  }

  const exactMatches = candidates.filter((candidate) =>
    buildCandidateReferenceAliases(candidate).includes(normalizedReference),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }
  if (exactMatches.length > 1) {
    return null;
  }

  if (!normalizedReference.includes("/")) {
    return null;
  }

  const fuzzyMatches = candidates.filter((candidate) =>
    buildCandidateReferenceAliases(candidate).some((alias) =>
      alias.startsWith(normalizedReference) || normalizedReference.startsWith(alias),
    ),
  );
  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0].id;
  }

  return null;
}

export function parseBugHuntInvestigationOutput(raw: string): BugHuntInvestigationResult {
  return normalizeInvestigation(parseJsonRecord(raw));
}

export function parseBugHuntModelOutput(raw: string): BugHuntModelResult {
  const parsed = parseJsonRecord(raw);
  const status = String(parsed.status ?? "").trim().toLowerCase();

  if (status === "no_bug" || status === "none" || status === "no_bug_found") {
    return {
      status: "no_bug",
      reason: normalizeOptionalText(parsed.reason) ?? "model did not find a new credible bug",
    };
  }

  return {
    status: "bug_found",
    report: normalizeBugReport(parsed),
  };
}
