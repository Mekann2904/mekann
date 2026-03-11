// Path: .pi/extensions/bug-hunt/reporting.ts
// What: bug-hunt 用の prompt 生成とモデル出力の正規化を担当する
// Why: runner の I/O を純粋関数へ分離してテストしやすくするため
// Related: .pi/extensions/bug-hunt/runner.ts, .pi/extensions/bug-hunt/storage.ts, tests/unit/extensions/bug-hunt-reporting.test.ts

import type { BugHuntEvidence, BugHuntModelResult, BugHuntReport, BugHuntSeverity } from "./types.js";

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

function normalizeEvidence(value: unknown): BugHuntEvidence[] {
  if (!Array.isArray(value)) {
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

  if (evidence.length === 0) {
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

export function buildBugHuntPrompt(input: {
  taskPrompt: string;
  cwd: string;
  iteration: number;
  knownFingerprints: string[];
  recentTitles: string[];
}): string {
  const knownFingerprints = input.knownFingerprints.slice(-20).join(", ") || "(none)";
  const recentTitles = input.recentTitles.slice(0, 12).join(" | ") || "(none)";

  return [
    "You are a bug-hunting agent for a TypeScript-heavy pi extension repository.",
    "Find at most one distinct, credible bug in the current workspace.",
    "Only report issues that have concrete file evidence.",
    "Prefer correctness, lifecycle, concurrency, data integrity, and error-handling bugs.",
    "Avoid duplicates that match known dedupe keys or recent titles.",
    "",
    `Workspace: ${input.cwd}`,
    `Iteration: ${input.iteration}`,
    `Mission: ${input.taskPrompt}`,
    `Known dedupe keys: ${knownFingerprints}`,
    `Recent bug titles: ${recentTitles}`,
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
    "",
    "If you cannot find a new credible bug, return status=no_bug.",
  ].join("\n");
}

export function parseBugHuntModelOutput(raw: string): BugHuntModelResult {
  const parsed = JSON.parse(extractJsonBlock(raw)) as Record<string, unknown>;
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
