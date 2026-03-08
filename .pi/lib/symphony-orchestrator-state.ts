/**
 * path: .pi/lib/symphony-orchestrator-state.ts
 * role: Symphony 風の claimed/running/retrying 状態を durable に保持する
 * why: 実行セッションをまたいでも orchestration 状態を web-ui と runtime API から読めるようにするため
 * related: .pi/extensions/task-auto-executor.ts, .pi/extensions/long-running-supervisor.ts, .pi/extensions/web-ui/lib/symphony-reader.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SymphonyIssueRunState = "claimed" | "running" | "retrying" | "released";

export interface SymphonyIssueState {
  issueId: string;
  title?: string;
  source?: string;
  runState: SymphonyIssueRunState;
  claimedAt?: string;
  startedAt?: string;
  releasedAt?: string;
  updatedAt: string;
  retryAttempt?: number;
  reason?: string;
  sessionId?: string;
  workpadId?: string;
}

export interface SymphonyOrchestratorEvent {
  at: string;
  issueId: string;
  action: SymphonyIssueRunState;
  source?: string;
  reason?: string;
  sessionId?: string;
  workpadId?: string;
}

export interface SymphonyOrchestratorState {
  version: 1;
  updatedAt: string;
  issues: Record<string, SymphonyIssueState>;
  events: SymphonyOrchestratorEvent[];
}

interface MutationInput {
  cwd: string;
  issueId: string;
  title?: string;
  source?: string;
  reason?: string;
  retryAttempt?: number;
  sessionId?: string;
  workpadId?: string;
}

interface RuntimeSessionLike {
  taskId?: string;
  status: string;
}

const STATE_DIR = ".pi/symphony";
const STATE_FILE = "orchestrator-state.json";
const MAX_EVENTS = 200;

function nowIso(): string {
  return new Date().toISOString();
}

function getStatePath(cwd: string): string {
  return join(cwd, STATE_DIR, STATE_FILE);
}

function ensureStateDir(cwd: string): string {
  const dir = join(cwd, STATE_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createEmptyState(): SymphonyOrchestratorState {
  return {
    version: 1,
    updatedAt: nowIso(),
    issues: {},
    events: [],
  };
}

function normalizeState(raw: unknown): SymphonyOrchestratorState {
  if (!raw || typeof raw !== "object") {
    return createEmptyState();
  }

  const value = raw as Partial<SymphonyOrchestratorState>;
  return {
    version: 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
    issues: value.issues && typeof value.issues === "object" ? value.issues : {},
    events: Array.isArray(value.events) ? value.events.slice(-MAX_EVENTS) : [],
  };
}

function mutateState(
  cwd: string,
  issueId: string,
  updater: (state: SymphonyOrchestratorState, previous: SymphonyIssueState | null) => SymphonyIssueState,
): SymphonyIssueState {
  const state = loadSymphonyOrchestratorState(cwd);
  const previous = state.issues[issueId] ?? null;
  const next = updater(state, previous);
  state.issues[issueId] = next;
  state.updatedAt = nowIso();
  state.events.push({
    at: state.updatedAt,
    issueId,
    action: next.runState,
    source: next.source,
    reason: next.reason,
    sessionId: next.sessionId,
    workpadId: next.workpadId,
  });
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }
  saveSymphonyOrchestratorState(cwd, state);
  return next;
}

export function loadSymphonyOrchestratorState(cwd: string = process.cwd()): SymphonyOrchestratorState {
  const path = getStatePath(cwd);
  if (!existsSync(path)) {
    return createEmptyState();
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return normalizeState(raw);
  } catch {
    return createEmptyState();
  }
}

export function saveSymphonyOrchestratorState(
  cwd: string,
  state: SymphonyOrchestratorState,
): void {
  ensureStateDir(cwd);
  writeFileSync(getStatePath(cwd), JSON.stringify(state, null, 2));
}

export function getSymphonyIssueState(
  cwd: string,
  issueId: string,
): SymphonyIssueState | null {
  return loadSymphonyOrchestratorState(cwd).issues[issueId] ?? null;
}

export function listSymphonyIssueStates(cwd: string = process.cwd()): SymphonyIssueState[] {
  return Object.values(loadSymphonyOrchestratorState(cwd).issues)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listSymphonyIssueEvents(
  cwd: string = process.cwd(),
  issueId?: string,
  limit: number = 20,
): SymphonyOrchestratorEvent[] {
  const events = loadSymphonyOrchestratorState(cwd).events;
  const filtered = issueId
    ? events.filter((event) => event.issueId === issueId)
    : events;
  return filtered.slice(-Math.max(1, limit)).reverse();
}

export function claimSymphonyIssue(input: MutationInput): SymphonyIssueState {
  return mutateState(input.cwd, input.issueId, (_state, previous) => {
    const claimedAt = previous?.claimedAt ?? nowIso();
    return {
      issueId: input.issueId,
      title: input.title ?? previous?.title,
      source: input.source ?? previous?.source,
      runState: "claimed",
      claimedAt,
      startedAt: previous?.startedAt,
      releasedAt: undefined,
      updatedAt: nowIso(),
      retryAttempt: undefined,
      reason: input.reason,
      sessionId: previous?.sessionId,
      workpadId: input.workpadId ?? previous?.workpadId,
    };
  });
}

export function startSymphonyIssueRun(input: MutationInput): SymphonyIssueState {
  return mutateState(input.cwd, input.issueId, (_state, previous) => ({
    issueId: input.issueId,
    title: input.title ?? previous?.title,
    source: input.source ?? previous?.source,
    runState: "running",
    claimedAt: previous?.claimedAt ?? nowIso(),
    startedAt: nowIso(),
    releasedAt: undefined,
    updatedAt: nowIso(),
    retryAttempt: previous?.retryAttempt,
    reason: input.reason,
    sessionId: input.sessionId ?? previous?.sessionId,
    workpadId: input.workpadId ?? previous?.workpadId,
  }));
}

export function queueSymphonyIssueRetry(input: MutationInput): SymphonyIssueState {
  return mutateState(input.cwd, input.issueId, (_state, previous) => ({
    issueId: input.issueId,
    title: input.title ?? previous?.title,
    source: input.source ?? previous?.source,
    runState: "retrying",
    claimedAt: previous?.claimedAt ?? nowIso(),
    startedAt: previous?.startedAt,
    releasedAt: undefined,
    updatedAt: nowIso(),
    retryAttempt: input.retryAttempt ?? previous?.retryAttempt ?? 1,
    reason: input.reason,
    sessionId: input.sessionId ?? previous?.sessionId,
    workpadId: input.workpadId ?? previous?.workpadId,
  }));
}

export function releaseSymphonyIssue(input: MutationInput): SymphonyIssueState {
  return mutateState(input.cwd, input.issueId, (_state, previous) => ({
    issueId: input.issueId,
    title: input.title ?? previous?.title,
    source: input.source ?? previous?.source,
    runState: "released",
    claimedAt: previous?.claimedAt,
    startedAt: previous?.startedAt,
    releasedAt: nowIso(),
    updatedAt: nowIso(),
    retryAttempt: previous?.retryAttempt,
    reason: input.reason,
    sessionId: input.sessionId ?? previous?.sessionId,
    workpadId: input.workpadId ?? previous?.workpadId,
  }));
}

export function repairSymphonyOrchestratorState(
  cwd: string = process.cwd(),
  runtimeSessions: RuntimeSessionLike[] = [],
): SymphonyIssueState[] {
  const repaired: SymphonyIssueState[] = [];
  const activeRuntimeIssueIds = new Set(
    runtimeSessions
      .filter((session) => session.taskId && (session.status === "starting" || session.status === "running"))
      .map((session) => String(session.taskId)),
  );

  for (const issue of listSymphonyIssueStates(cwd)) {
    if (issue.runState !== "claimed" && issue.runState !== "running") {
      continue;
    }

    if (activeRuntimeIssueIds.has(issue.issueId)) {
      continue;
    }

    repaired.push(queueSymphonyIssueRetry({
      cwd,
      issueId: issue.issueId,
      title: issue.title,
      source: "symphony-orchestrator-repair",
      reason: `resume repair: stale ${issue.runState} without active runtime session`,
      retryAttempt: issue.retryAttempt ?? 1,
      sessionId: issue.sessionId,
      workpadId: issue.workpadId,
    }));
  }

  return repaired;
}
