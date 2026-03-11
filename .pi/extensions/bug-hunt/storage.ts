// Path: .pi/extensions/bug-hunt/storage.ts
// What: bug-hunt の state 保存と bug report の task 化を担当する
// Why: runner と extension が同じ保存ルールを使えるようにするため
// Related: .pi/extensions/bug-hunt/index.ts, .pi/extensions/bug-hunt/runner.ts, .pi/lib/storage/task-plan-store.ts

import { createHash } from "node:crypto";

import { loadTaskStorage, saveTaskStorage } from "../../lib/storage/task-plan-store.js";
import { readJsonState, writeJsonState } from "../../lib/storage/sqlite-state-store.js";
import { getBugHuntStateKey } from "../../lib/storage/state-keys.js";
import type { BugHuntReport, BugHuntSeverity, BugHuntState } from "./types.js";

interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled" | "failed";
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[];
  dueDate?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  parentTaskId?: string;
}

interface TaskStorageRecord {
  tasks: TaskRecord[];
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_FINGERPRINTS = 256;

export function getDefaultBugHuntPrompt(): string {
  return [
    "Inspect this repository and find one distinct bug at a time.",
    "Prioritize real correctness, lifecycle, concurrency, and error-handling bugs.",
    "Only report issues with concrete file evidence.",
  ].join(" ");
}

export function createDefaultBugHuntState(): BugHuntState {
  return {
    version: 1,
    runId: null,
    status: "idle",
    backgroundProcessId: null,
    startedAt: null,
    stoppedAt: null,
    lastHeartbeatAt: null,
    lastIterationAt: null,
    lastSummary: null,
    lastError: null,
    stopRequested: false,
    iterationCount: 0,
    reportedCount: 0,
    intervalMs: DEFAULT_INTERVAL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    taskPrompt: getDefaultBugHuntPrompt(),
    model: null,
    reportedFingerprints: [],
  };
}

export function loadBugHuntState(cwd: string = process.cwd()): BugHuntState {
  const raw = readJsonState<BugHuntState>({
    stateKey: getBugHuntStateKey(cwd),
    createDefault: createDefaultBugHuntState,
  });

  return {
    ...createDefaultBugHuntState(),
    ...raw,
    reportedFingerprints: Array.isArray(raw.reportedFingerprints)
      ? raw.reportedFingerprints.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [],
  };
}

export function saveBugHuntState(state: BugHuntState, cwd: string = process.cwd()): BugHuntState {
  const normalized: BugHuntState = {
    ...createDefaultBugHuntState(),
    ...state,
    reportedFingerprints: Array.from(
      new Set((state.reportedFingerprints ?? []).filter((value) => typeof value === "string" && value.length > 0)),
    ).slice(-MAX_FINGERPRINTS),
  };

  writeJsonState({
    stateKey: getBugHuntStateKey(cwd),
    value: normalized,
  });

  return normalized;
}

export function createBugHuntRunId(): string {
  return `bug-hunt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createBugHuntFingerprint(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

export function buildBugHuntFingerprintTag(fingerprint: string): string {
  return `bughunt:${fingerprint}`;
}

function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function mapSeverityToPriority(severity: BugHuntSeverity): TaskRecord["priority"] {
  switch (severity) {
    case "critical":
      return "urgent";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
    default:
      return "low";
  }
}

function buildBugTaskDescription(report: BugHuntReport, runId: string): string {
  const evidenceLines = report.evidence.map((entry) => {
    const location = entry.line ? `${entry.file}:${entry.line}` : entry.file;
    return `- ${location} :: ${entry.reason}`;
  });

  const lines = [
    `Source: bug-hunt`,
    `Run ID: ${runId}`,
    `Severity: ${report.severity}`,
    `Confidence: ${report.confidence.toFixed(2)}`,
    `Dedupe: ${report.dedupeKey}`,
    "",
    "Summary:",
    report.summary,
    "",
    "Why this is a bug:",
    report.why,
    "",
    "Evidence:",
    ...evidenceLines,
  ];

  if (report.reproduction) {
    lines.push("", "How to reproduce:", report.reproduction);
  }

  if (report.suggestedFix) {
    lines.push("", "Suggested fix:", report.suggestedFix);
  }

  return truncateText(lines.join("\n"), 4_800);
}

export function loadBugHuntTasks(cwd: string = process.cwd()): TaskRecord[] {
  const storage = loadTaskStorage<TaskStorageRecord>(cwd);
  return Array.isArray(storage.tasks) ? storage.tasks : [];
}

export function hasBugHuntFingerprint(
  fingerprint: string,
  cwd: string = process.cwd(),
): boolean {
  const tag = buildBugHuntFingerprintTag(fingerprint);
  return loadBugHuntTasks(cwd).some((task) => Array.isArray(task.tags) && task.tags.includes(tag));
}

export function listRecentBugHuntTitles(cwd: string = process.cwd(), limit: number = 12): string[] {
  return loadBugHuntTasks(cwd)
    .filter((task) => Array.isArray(task.tags) && task.tags.includes("bug-hunt"))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(1, limit))
    .map((task) => task.title);
}

export function appendBugHuntReportTask(
  report: BugHuntReport,
  input: {
    cwd?: string;
    runId: string;
  },
): TaskRecord {
  const cwd = input.cwd ?? process.cwd();
  const storage = loadTaskStorage<TaskStorageRecord>(cwd);
  const now = new Date().toISOString();
  const fingerprint = createBugHuntFingerprint(report.dedupeKey);

  const task: TaskRecord = {
    id: createTaskId(),
    title: truncateText(`[bug-hunt][${report.severity}] ${report.title}`, 180),
    description: buildBugTaskDescription(report, input.runId),
    status: "todo",
    priority: mapSeverityToPriority(report.severity),
    tags: [
      "bug-hunt",
      "bug",
      `severity:${report.severity}`,
      buildBugHuntFingerprintTag(fingerprint),
    ],
    assignee: "human-review",
    createdAt: now,
    updatedAt: now,
  };

  const nextTasks = Array.isArray(storage.tasks) ? [...storage.tasks, task] : [task];
  saveTaskStorage({ tasks: nextTasks }, cwd);
  return task;
}
