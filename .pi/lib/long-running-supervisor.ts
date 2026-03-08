/**
 * path: .pi/lib/long-running-supervisor.ts
 * role: root task journal、checkpoint、resume、preflight、supervisor sweep をまとめて扱う
 * why: loop / subagents / verification / background-process の回復情報を 1 本に統合するため
 * related: .pi/extensions/long-running-supervisor.ts, .pi/lib/workspace-verification.ts, .pi/lib/background-processes.ts, tests/unit/lib/long-running-supervisor.test.ts
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  isProcessAlive,
  listBackgroundProcesses,
  loadBackgroundProcessConfig,
  sweepBackgroundProcesses,
  type BackgroundProcessRecord,
} from "./background-processes.js";
import {
  type PermissionKey,
  loadAutonomyPolicyConfig,
  resolvePermissionKey,
} from "./autonomy-policy.js";
import { loadPlanStorage } from "./storage/task-plan-store.js";
import {
  loadWorkspaceVerificationConfig,
  loadWorkspaceVerificationState,
  resolveWorkspaceVerificationPlan,
  resolveWorkspaceVerificationResumePlan,
  type WorkspaceVerificationResumePlan,
} from "./workspace-verification.js";

export type LongRunningSessionStatus =
  | "active"
  | "clean_shutdown"
  | "crashed"
  | "superseded";

export type LongRunningJournalEventType =
  | "session_start"
  | "session_resume"
  | "agent_start"
  | "agent_end"
  | "tool_call"
  | "tool_result"
  | "loop_run"
  | "loop_iteration"
  | "subagent_run"
  | "supervisor_sweep"
  | "session_shutdown";

export interface LongRunningPlanSnapshot {
  planId?: string;
  name?: string;
  currentStep?: string;
  acceptanceCriteria: string[];
  fileModuleImpact: string[];
  recentProgress: string[];
}

export interface LongRunningJournalEvent {
  timestamp: string;
  type: LongRunningJournalEventType;
  summary: string;
  toolName?: string;
  success?: boolean;
  details?: Record<string, unknown>;
}

export interface LongRunningSessionState {
  id: string;
  cwd: string;
  ownerPid: number;
  startedAt: string;
  updatedAt: string;
  status: LongRunningSessionStatus;
  resumedFromSessionId?: string;
  lastToolName?: string;
  pendingToolName?: string;
  lastError?: string;
  lastEventSummary?: string;
  plan: LongRunningPlanSnapshot;
  journalPath: string;
  checkpointPath: string;
}

export interface LongRunningSessionIndex {
  activeSessionId?: string;
  latestSessionId?: string;
  sessionIds: string[];
}

export interface LongRunningSweepResult {
  warnings: string[];
  background: {
    runningCount: number;
    orphanedCount: number;
    reclaimedCount: number;
    running: BackgroundProcessRecord[];
    orphaned: BackgroundProcessRecord[];
    reclaimed: BackgroundProcessRecord[];
  };
  subagents: {
    activeCount: number;
    orphanedCount: number;
    staleCount: number;
    recoveredCount: number;
    active: LongRunningActiveSubagentRun[];
    orphaned: LongRunningActiveSubagentRun[];
    stale: LongRunningActiveSubagentRun[];
    recovered: LongRunningActiveSubagentRun[];
  };
  recoveredSessionId?: string;
}

export interface LongRunningActiveSubagentRun {
  runId: string;
  agentId: string;
  task: string;
  cwd: string;
  ownerPid: number;
  startedAt: string;
  heartbeatAt: string;
  status: "running" | "completed" | "failed" | "recovered";
  lastError?: string;
}

export interface LongRunningReplay {
  session: LongRunningSessionState | null;
  checkpointPath?: string;
  journalPath?: string;
  continuityPath?: string;
  trajectoryPath?: string;
  nextAction: string;
  resumeReason: string;
  workspaceVerification: WorkspaceVerificationResumePlan;
  backgroundProcesses: Array<Pick<BackgroundProcessRecord, "id" | "label" | "status" | "pid" | "keepAliveOnShutdown">>;
  plan: LongRunningPlanSnapshot;
  recentEvents: LongRunningJournalEvent[];
  warnings: string[];
}

export interface LongRunningPreflightResult {
  ok: boolean;
  blockers: string[];
  warnings: string[];
  requiredPermissions: PermissionKey[];
  missingPermissions: PermissionKey[];
  workspaceVerificationPhase: WorkspaceVerificationResumePlan["phase"];
  runtimeNeedsBackgroundProcess: boolean;
}

export interface LongRunningPreflightInput {
  cwd?: string;
  task?: string;
  requestedTools?: string[];
  nonInteractive?: boolean;
  requireVerification?: boolean;
}

interface LongRunningNextActionInput {
  workspaceResume: WorkspaceVerificationResumePlan;
  activeSubagentRuns: LongRunningActiveSubagentRun[];
  pendingToolName?: string;
  plan: LongRunningPlanSnapshot;
}

type ToolCallLike = {
  toolName?: unknown;
  input?: unknown;
};

type ToolResultLike = {
  toolName?: unknown;
  isError?: unknown;
  error?: unknown;
  message?: unknown;
  output?: unknown;
  result?: unknown;
};

const INDEX_FILE = "index.json";
const SESSION_FILE = "session.json";
const CHECKPOINT_FILE = "checkpoint.json";
const JOURNAL_FILE = "journal.jsonl";
const ACTIVE_SUBAGENT_RUNS_FILE = "active-subagent-runs.json";
const SUBAGENT_STALE_THRESHOLD_MS = 2 * 60 * 1000;
const SESSION_STALE_THRESHOLD_MS = 2 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

function ensureRootDir(cwd?: string): string {
  const dir = join(normalizeCwd(cwd), ".pi", "long-running");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function ensureSessionsDir(cwd?: string): string {
  const dir = join(ensureRootDir(cwd), "sessions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getIndexPath(cwd?: string): string {
  return join(ensureRootDir(cwd), INDEX_FILE);
}

function getSessionDir(cwd: string, sessionId: string): string {
  const dir = join(ensureSessionsDir(cwd), sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSessionPath(cwd: string, sessionId: string): string {
  return join(getSessionDir(cwd, sessionId), SESSION_FILE);
}

function getJournalPath(cwd: string, sessionId: string): string {
  return join(getSessionDir(cwd, sessionId), JOURNAL_FILE);
}

function getCheckpointPath(cwd: string, sessionId: string): string {
  return join(getSessionDir(cwd, sessionId), CHECKPOINT_FILE);
}

function getActiveSubagentRunsPath(cwd?: string): string {
  return join(ensureRootDir(cwd), ACTIVE_SUBAGENT_RUNS_FILE);
}

function createSessionId(): string {
  return `lr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeJsonParse<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function loadActiveSubagentRuns(cwd?: string): LongRunningActiveSubagentRun[] {
  return safeJsonParse<LongRunningActiveSubagentRun[]>(getActiveSubagentRunsPath(cwd), []);
}

function saveActiveSubagentRuns(cwd: string, runs: LongRunningActiveSubagentRun[]): LongRunningActiveSubagentRun[] {
  writeFileSync(getActiveSubagentRunsPath(cwd), `${JSON.stringify(runs, null, 2)}\n`, "utf-8");
  return runs;
}

function loadIndex(cwd?: string): LongRunningSessionIndex {
  return safeJsonParse<LongRunningSessionIndex>(getIndexPath(cwd), {
    sessionIds: [],
  });
}

function saveIndex(cwd: string, index: LongRunningSessionIndex): LongRunningSessionIndex {
  const normalized: LongRunningSessionIndex = {
    activeSessionId: index.activeSessionId,
    latestSessionId: index.latestSessionId,
    sessionIds: Array.from(new Set(index.sessionIds)),
  };
  writeFileSync(getIndexPath(cwd), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

function resolvePlanSnapshot(cwd: string): LongRunningPlanSnapshot {
  try {
    const storage = loadPlanStorage<{ plans: Array<Record<string, unknown>>; currentPlanId?: string }>(cwd);
    const plans = Array.isArray(storage.plans) ? storage.plans : [];
    const current = plans.find((plan) => plan.id === storage.currentPlanId)
      ?? [...plans].reverse().find((plan) => plan.status === "active" || plan.status === "draft");

    if (!current) {
      return {
        acceptanceCriteria: [],
        fileModuleImpact: [],
        recentProgress: [],
      };
    }

    const steps = Array.isArray(current.steps) ? current.steps : [];
    const inProgress = steps.find((step) => step && typeof step === "object" && step.status === "in_progress") as Record<string, unknown> | undefined;

    return {
      planId: typeof current.id === "string" ? current.id : undefined,
      name: typeof current.name === "string" ? current.name : undefined,
      currentStep: typeof inProgress?.title === "string" ? inProgress.title : undefined,
      acceptanceCriteria: normalizeStringArray(current.acceptanceCriteria),
      fileModuleImpact: normalizeStringArray(current.fileModuleImpact),
      recentProgress: normalizeStringArray(current.progressLog).slice(-5),
    };
  } catch {
    return {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      recentProgress: [],
    };
  }
}

export function buildLongRunningNextAction(input: LongRunningNextActionInput): string {
  if (input.workspaceResume.phase !== "clear") {
    return input.workspaceResume.reason;
  }

  if (input.activeSubagentRuns.length > 0) {
    return "Inspect or recover active subagent runs before resuming.";
  }

  if (input.pendingToolName) {
    return `Investigate the interrupted tool call: ${input.pendingToolName}.`;
  }

  if (input.plan.currentStep) {
    return `Resume the single highest-priority plan step: ${input.plan.currentStep}.`;
  }

  return "Resume from the latest journal event and choose only one concrete next step.";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferPermissionsFromTask(task?: string): PermissionKey[] {
  const normalized = (task ?? "").toLowerCase();
  const required = new Set<PermissionKey>();

  if (!normalized) {
    return [];
  }
  if (/(implement|edit|write|patch|fix|refactor|create|update)/i.test(normalized)) {
    required.add("write");
  }
  if (/(test|lint|typecheck|build|run|verify|command|shell|npm|pnpm|yarn|cargo)/i.test(normalized)) {
    required.add("command");
  }
  if (/(subagent|delegate|parallel|dag|team)/i.test(normalized)) {
    required.add("subtasks");
  }
  if (/(browser|playwright|ui|screenshot|open page|web)/i.test(normalized)) {
    required.add("browser");
  }
  if (/(mcp|github|hugging face|deepwiki)/i.test(normalized)) {
    required.add("mcp");
  }
  if (/(plan|todo|step)/i.test(normalized)) {
    required.add("todo");
  }

  return [...required];
}

export function loadLongRunningSession(cwd: string, sessionId: string): LongRunningSessionState | null {
  return safeJsonParse<LongRunningSessionState | null>(getSessionPath(cwd, sessionId), null);
}

export function loadLatestLongRunningSession(cwd?: string): LongRunningSessionState | null {
  const targetCwd = normalizeCwd(cwd);
  const index = loadIndex(targetCwd);
  const sessionId = index.latestSessionId ?? index.activeSessionId;
  if (!sessionId) {
    return null;
  }
  return loadLongRunningSession(targetCwd, sessionId);
}

function saveLongRunningSession(cwd: string, session: LongRunningSessionState): LongRunningSessionState {
  const normalized: LongRunningSessionState = {
    ...session,
    cwd,
    updatedAt: session.updatedAt || nowIso(),
    plan: session.plan ?? resolvePlanSnapshot(cwd),
    journalPath: session.journalPath || getJournalPath(cwd, session.id),
    checkpointPath: session.checkpointPath || getCheckpointPath(cwd, session.id),
  };
  writeFileSync(getSessionPath(cwd, normalized.id), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

function appendJournalEvent(
  cwd: string,
  session: LongRunningSessionState,
  event: LongRunningJournalEvent,
): void {
  appendFileSync(session.journalPath, `${JSON.stringify(event)}\n`, "utf-8");
  saveLongRunningSession(cwd, {
    ...session,
    updatedAt: event.timestamp,
    lastEventSummary: event.summary,
    lastToolName: event.toolName ?? session.lastToolName,
  });
}

export function loadLongRunningJournal(cwd: string, sessionId: string): LongRunningJournalEvent[] {
  const path = getJournalPath(cwd, sessionId);
  if (!existsSync(path)) {
    return [];
  }

  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LongRunningJournalEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is LongRunningJournalEvent => Boolean(item));
}

export function recordLongRunningEvent(
  cwdInput: string | undefined,
  event: Omit<LongRunningJournalEvent, "timestamp"> & { timestamp?: string },
): void {
  const cwd = normalizeCwd(cwdInput);
  const index = loadIndex(cwd);
  if (!index.activeSessionId) {
    return;
  }

  const session = loadLongRunningSession(cwd, index.activeSessionId);
  if (!session) {
    return;
  }

  appendJournalEvent(cwd, session, {
    ...event,
    timestamp: event.timestamp ?? nowIso(),
  });
  saveCheckpoint(cwd, loadLongRunningSession(cwd, session.id) ?? session);
}

export function heartbeatLongRunningSession(input: {
  cwd?: string;
  sessionId: string;
  toolName?: string;
}): LongRunningSessionState | null {
  const cwd = normalizeCwd(input.cwd);
  const session = loadLongRunningSession(cwd, input.sessionId);
  if (!session || session.status !== "active") {
    return null;
  }

  return saveLongRunningSession(cwd, {
    ...session,
    updatedAt: nowIso(),
    lastToolName: input.toolName ?? session.lastToolName,
    plan: resolvePlanSnapshot(cwd),
  });
}

function summarizeUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim().slice(0, 240) || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const candidate = [
    record.error,
    record.message,
    record.summary,
    record.reason,
  ].map((item) => summarizeUnknown(item)).find(Boolean);

  if (candidate) {
    return candidate;
  }

  try {
    return JSON.stringify(record).slice(0, 240);
  } catch {
    return undefined;
  }
}

function buildWorkspaceVerificationWarnings(cwd: string): string[] {
  const state = loadWorkspaceVerificationState(cwd);
  const warnings: string[] = [];

  if (state.continuityPath && !existsSync(state.continuityPath)) {
    warnings.push("workspace verification continuity pack is missing");
  }
  if (state.trajectoryPath && !existsSync(state.trajectoryPath)) {
    warnings.push("workspace verification trajectory is missing");
  }

  return warnings;
}

function saveCheckpoint(cwd: string, session: LongRunningSessionState): void {
  const replay = createLongRunningReplay(cwd, session.id);
  writeFileSync(session.checkpointPath, `${JSON.stringify(replay, null, 2)}\n`, "utf-8");
}

export function registerActiveSubagentRun(input: {
  cwd?: string;
  runId: string;
  agentId: string;
  task: string;
}): LongRunningActiveSubagentRun {
  const cwd = normalizeCwd(input.cwd);
  const now = nowIso();
  const current = loadActiveSubagentRuns(cwd).filter((item) => item.runId !== input.runId);
  const run: LongRunningActiveSubagentRun = {
    runId: input.runId,
    agentId: input.agentId,
    task: input.task,
    cwd,
    ownerPid: process.pid,
    startedAt: now,
    heartbeatAt: now,
    status: "running",
  };
  saveActiveSubagentRuns(cwd, [...current, run]);
  recordLongRunningEvent(cwd, {
    type: "subagent_run",
    summary: `subagent started: ${input.agentId}`,
    success: true,
    details: {
      runId: input.runId,
      task: input.task,
      phase: "start",
    },
  });
  return run;
}

export function heartbeatActiveSubagentRun(input: {
  cwd?: string;
  runId: string;
}): LongRunningActiveSubagentRun | null {
  const cwd = normalizeCwd(input.cwd);
  const now = nowIso();
  let matched: LongRunningActiveSubagentRun | null = null;
  const updated = loadActiveSubagentRuns(cwd).map((item) => {
    if (item.runId !== input.runId || item.status !== "running") {
      return item;
    }
    matched = {
      ...item,
      heartbeatAt: now,
    };
    return matched;
  });
  saveActiveSubagentRuns(cwd, updated);
  return matched;
}

export function finalizeActiveSubagentRun(input: {
  cwd?: string;
  runId: string;
  success: boolean;
  error?: string;
}): LongRunningActiveSubagentRun | null {
  const cwd = normalizeCwd(input.cwd);
  const now = nowIso();
  const updated = loadActiveSubagentRuns(cwd).map((item) => {
    if (item.runId !== input.runId) {
      return item;
    }
    const nextStatus: LongRunningActiveSubagentRun["status"] = input.success ? "completed" : "failed";
    return {
      ...item,
      heartbeatAt: now,
      status: nextStatus,
      lastError: input.error?.trim() || item.lastError,
    };
  });
  const completedRun = updated.find((item) => item.runId === input.runId) ?? null;
  saveActiveSubagentRuns(cwd, updated.filter((item) => item.status === "running"));
  if (completedRun) {
    recordLongRunningEvent(cwd, {
      type: "subagent_run",
      summary: input.success
        ? `subagent completed: ${completedRun.agentId}`
        : `subagent failed: ${completedRun.agentId}${completedRun.lastError ? ` (${completedRun.lastError})` : ""}`,
      success: input.success,
      details: {
        runId: completedRun.runId,
        task: completedRun.task,
        phase: "end",
      },
    });
  }
  return completedRun;
}

export async function runLongRunningSupervisorSweep(input?: {
  cwd?: string;
  reclaimBackgroundOrphans?: boolean;
}): Promise<LongRunningSweepResult> {
  const cwd = normalizeCwd(input?.cwd);
  const warnings = buildWorkspaceVerificationWarnings(cwd);
  const background = await sweepBackgroundProcesses({
    cwd,
    reclaimOrphans: input?.reclaimBackgroundOrphans !== false,
  });
  const latest = loadLatestLongRunningSession(cwd);
  let recoveredSessionId: string | undefined;

  const latestUpdatedAtMs = latest ? Date.parse(latest.updatedAt) : Number.NaN;
  const latestSessionStale = latest
    && latest.status === "active"
    && Number.isFinite(latestUpdatedAtMs)
    && Date.now() - latestUpdatedAtMs > SESSION_STALE_THRESHOLD_MS;
  const latestSessionDead = latest
    && latest.status === "active"
    && latest.ownerPid !== process.pid
    && !isProcessAlive(latest.ownerPid);

  if (latest && (latestSessionDead || latestSessionStale)) {
    recoveredSessionId = latest.id;
    const crashedSession = saveLongRunningSession(cwd, {
      ...latest,
      status: "crashed",
      updatedAt: nowIso(),
      lastError: latest.lastError ?? (
        latestSessionDead
          ? "session ended without clean shutdown"
          : "session heartbeat expired before clean shutdown"
      ),
    });
    appendJournalEvent(cwd, crashedSession, {
      timestamp: nowIso(),
      type: "supervisor_sweep",
      summary: latestSessionDead
        ? "detected orphan active session and marked it as crashed"
        : "detected stale active session heartbeat and marked it as crashed",
      success: false,
      details: {
        ownerPid: latest.ownerPid,
        updatedAt: latest.updatedAt,
      },
    });
    warnings.push(`Recovered unclean session: ${latest.id}`);
  }

  if (background.orphaned.length > 0) {
    warnings.push(`Detected ${background.orphaned.length} orphan background process(es).`);
  }
  if (background.reclaimed.length > 0) {
    warnings.push(`Reclaimed ${background.reclaimed.length} orphan non-persistent background process(es).`);
  }

  const activeSubagents = loadActiveSubagentRuns(cwd);
  const staleSubagents = activeSubagents.filter((run) => {
    const heartbeatAtMs = Date.parse(run.heartbeatAt);
    return Number.isFinite(heartbeatAtMs) && Date.now() - heartbeatAtMs > SUBAGENT_STALE_THRESHOLD_MS;
  });
  const orphanedSubagents = activeSubagents.filter((run) => run.ownerPid > 0 && !isProcessAlive(run.ownerPid));
  const recoveredByRunId = new Map<string, LongRunningActiveSubagentRun>();
  for (const run of staleSubagents) {
    recoveredByRunId.set(run.runId, {
      ...run,
      status: "recovered",
      lastError: run.lastError ?? "stale subagent run recovered by supervisor",
    });
  }
  for (const run of orphanedSubagents) {
    recoveredByRunId.set(run.runId, {
      ...run,
      status: "recovered",
      lastError: run.lastError ?? "orphaned subagent run recovered by supervisor",
    });
  }
  const recoveredSubagents = [...recoveredByRunId.values()];
  if (recoveredSubagents.length > 0) {
    const recoveredIds = new Set(recoveredSubagents.map((item) => item.runId));
    saveActiveSubagentRuns(cwd, activeSubagents.filter((item) => !recoveredIds.has(item.runId)));
    for (const run of recoveredSubagents) {
      recordLongRunningEvent(cwd, {
        type: "supervisor_sweep",
        summary: `recovered subagent run: ${run.agentId}`,
        success: false,
        details: {
          runId: run.runId,
          reason: run.lastError,
        },
      });
    }
    warnings.push(`Recovered ${recoveredSubagents.length} stale/orphan subagent run(s).`);
  }

  return {
    warnings,
    background: {
      runningCount: background.running.length,
      orphanedCount: background.orphaned.length,
      reclaimedCount: background.reclaimed.length,
      running: background.running,
      orphaned: background.orphaned,
      reclaimed: background.reclaimed,
    },
    subagents: {
      activeCount: activeSubagents.length,
      orphanedCount: orphanedSubagents.length,
      staleCount: staleSubagents.length,
      recoveredCount: recoveredSubagents.length,
      active: activeSubagents,
      orphaned: orphanedSubagents,
      stale: staleSubagents,
      recovered: recoveredSubagents,
    },
    recoveredSessionId,
  };
}

export async function beginLongRunningSession(input?: {
  cwd?: string;
}): Promise<{ session: LongRunningSessionState; sweep: LongRunningSweepResult }> {
  const cwd = normalizeCwd(input?.cwd);
  const sweep = await runLongRunningSupervisorSweep({ cwd });
  const index = loadIndex(cwd);
  const previous = sweep.recoveredSessionId ? loadLongRunningSession(cwd, sweep.recoveredSessionId) : null;
  const id = createSessionId();
  const session: LongRunningSessionState = saveLongRunningSession(cwd, {
    id,
    cwd,
    ownerPid: process.pid,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    status: "active",
    resumedFromSessionId: previous?.id,
    plan: resolvePlanSnapshot(cwd),
    journalPath: getJournalPath(cwd, id),
    checkpointPath: getCheckpointPath(cwd, id),
  });

  saveIndex(cwd, {
    activeSessionId: session.id,
    latestSessionId: session.id,
    sessionIds: [...index.sessionIds, session.id],
  });

  appendJournalEvent(cwd, session, {
    timestamp: nowIso(),
    type: previous ? "session_resume" : "session_start",
    summary: previous
      ? `started new session from crashed session ${previous.id}`
      : "started long-running session",
    success: true,
    details: previous ? { recoveredSessionId: previous.id } : undefined,
  });
  saveCheckpoint(cwd, session);

  return { session, sweep };
}

export function beginLongRunningSessionSync(input?: {
  cwd?: string;
}): { session: LongRunningSessionState } {
  const cwd = normalizeCwd(input?.cwd);
  const index = loadIndex(cwd);
  const previous = index.activeSessionId ? loadLongRunningSession(cwd, index.activeSessionId) : null;
  const id = createSessionId();
  const session: LongRunningSessionState = saveLongRunningSession(cwd, {
    id,
    cwd,
    ownerPid: process.pid,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    status: "active",
    resumedFromSessionId: previous?.status === "crashed" ? previous.id : undefined,
    plan: resolvePlanSnapshot(cwd),
    journalPath: getJournalPath(cwd, id),
    checkpointPath: getCheckpointPath(cwd, id),
  });

  saveIndex(cwd, {
    activeSessionId: session.id,
    latestSessionId: session.id,
    sessionIds: [...index.sessionIds, session.id],
  });

  appendJournalEvent(cwd, session, {
    timestamp: nowIso(),
    type: previous?.status === "crashed" ? "session_resume" : "session_start",
    summary: previous?.status === "crashed"
      ? `started new session from crashed session ${previous.id}`
      : "started long-running session",
    success: true,
    details: previous?.status === "crashed" ? { recoveredSessionId: previous.id } : undefined,
  });
  saveCheckpoint(cwd, session);

  return { session };
}

export function recordLongRunningToolCall(
  cwdInput: string | undefined,
  sessionId: string,
  event: ToolCallLike,
): void {
  const cwd = normalizeCwd(cwdInput);
  const session = loadLongRunningSession(cwd, sessionId);
  if (!session) {
    return;
  }

  const toolName = typeof event.toolName === "string" ? event.toolName : "unknown";
  const next = saveLongRunningSession(cwd, {
    ...session,
    updatedAt: nowIso(),
    pendingToolName: toolName,
    lastToolName: toolName,
    plan: resolvePlanSnapshot(cwd),
  });
  appendJournalEvent(cwd, next, {
    timestamp: nowIso(),
    type: "tool_call",
    toolName,
    summary: `tool call started: ${toolName}`,
    success: true,
    details: {
      input: summarizeUnknown(event.input),
    },
  });
  saveCheckpoint(cwd, next);
}

export function recordLongRunningToolResult(
  cwdInput: string | undefined,
  sessionId: string,
  event: ToolResultLike,
): void {
  const cwd = normalizeCwd(cwdInput);
  const session = loadLongRunningSession(cwd, sessionId);
  if (!session) {
    return;
  }

  const toolName = typeof event.toolName === "string" ? event.toolName : session.pendingToolName ?? "unknown";
  const isError = Boolean(event.isError);
  const errorSummary = summarizeUnknown(event.error)
    ?? summarizeUnknown(event.message)
    ?? summarizeUnknown(event.output)
    ?? summarizeUnknown(event.result);
  const next = saveLongRunningSession(cwd, {
    ...session,
    updatedAt: nowIso(),
    pendingToolName: undefined,
    lastToolName: toolName,
    lastError: isError ? (errorSummary ?? `tool failed: ${toolName}`) : session.lastError,
    plan: resolvePlanSnapshot(cwd),
  });
  appendJournalEvent(cwd, next, {
    timestamp: nowIso(),
    type: "tool_result",
    toolName,
    summary: isError
      ? `tool failed: ${toolName}${errorSummary ? ` (${errorSummary})` : ""}`
      : `tool completed: ${toolName}`,
    success: !isError,
    details: errorSummary ? { error: errorSummary } : undefined,
  });
  saveCheckpoint(cwd, next);
}

export function recordLongRunningAgentLifecycle(
  cwdInput: string | undefined,
  sessionId: string,
  active: boolean,
): void {
  const cwd = normalizeCwd(cwdInput);
  const session = loadLongRunningSession(cwd, sessionId);
  if (!session) {
    return;
  }

  const next = saveLongRunningSession(cwd, {
    ...session,
    updatedAt: nowIso(),
    plan: resolvePlanSnapshot(cwd),
  });
  appendJournalEvent(cwd, next, {
    timestamp: nowIso(),
    type: active ? "agent_start" : "agent_end",
    summary: active ? "agent turn started" : "agent turn finished",
    success: true,
  });
  saveCheckpoint(cwd, next);
}

export function finalizeLongRunningSession(
  cwdInput: string | undefined,
  sessionId: string,
  reason: LongRunningSessionStatus = "clean_shutdown",
): void {
  const cwd = normalizeCwd(cwdInput);
  const session = loadLongRunningSession(cwd, sessionId);
  if (!session) {
    return;
  }

  const next = saveLongRunningSession(cwd, {
    ...session,
    status: reason,
    updatedAt: nowIso(),
    pendingToolName: undefined,
    plan: resolvePlanSnapshot(cwd),
  });
  appendJournalEvent(cwd, next, {
    timestamp: nowIso(),
    type: "session_shutdown",
    summary: `session closed with status ${reason}`,
    success: reason === "clean_shutdown",
  });
  const index = loadIndex(cwd);
  if (index.activeSessionId === sessionId) {
    saveIndex(cwd, {
      ...index,
      activeSessionId: undefined,
      latestSessionId: sessionId,
    });
  }
  saveCheckpoint(cwd, next);
}

export function createLongRunningReplay(cwdInput?: string, sessionId?: string): LongRunningReplay {
  const cwd = normalizeCwd(cwdInput);
  const session = sessionId
    ? loadLongRunningSession(cwd, sessionId)
    : loadLatestLongRunningSession(cwd);
  const workspaceConfig = loadWorkspaceVerificationConfig(cwd);
  const workspaceState = loadWorkspaceVerificationState(cwd);
  const resolvedPlan = resolveWorkspaceVerificationPlan(workspaceConfig, cwd);
  const workspaceResume = resolveWorkspaceVerificationResumePlan(workspaceState, resolvedPlan);
  const recentEvents = session ? loadLongRunningJournal(cwd, session.id).slice(-12) : [];
  const backgroundProcesses = listBackgroundProcesses({
    cwd,
    includeExited: false,
  }).map((record) => ({
    id: record.id,
    label: record.label,
    status: record.status,
    pid: record.pid,
    keepAliveOnShutdown: record.keepAliveOnShutdown,
  }));
  const warnings = buildWorkspaceVerificationWarnings(cwd);

  if (session?.status === "crashed") {
    warnings.unshift(`Latest session crashed: ${session.id}`);
  }
  if (session?.pendingToolName) {
    warnings.push(`Interrupted tool call detected: ${session.pendingToolName}`);
  }
  const activeSubagentRuns = loadActiveSubagentRuns(cwd);
  if (activeSubagentRuns.length > 0) {
    warnings.push(`Active subagent runs detected: ${activeSubagentRuns.length}`);
  }

  const nextAction = buildLongRunningNextAction({
    workspaceResume,
    activeSubagentRuns,
    pendingToolName: session?.pendingToolName,
    plan: session?.plan ?? resolvePlanSnapshot(cwd),
  });

  const resumeReason = session?.status === "crashed"
    ? "Previous session ended without a clean shutdown."
    : workspaceResume.reason;

  return {
    session,
    checkpointPath: session?.checkpointPath,
    journalPath: session?.journalPath,
    continuityPath: workspaceState.continuityPath,
    trajectoryPath: workspaceState.trajectoryPath,
    nextAction,
    resumeReason,
    workspaceVerification: workspaceResume,
    backgroundProcesses,
    plan: session?.plan ?? resolvePlanSnapshot(cwd),
    recentEvents,
    warnings,
  };
}

function collectRequiredPermissions(input: {
  hasPlan: boolean;
  verification: WorkspaceVerificationResumePlan;
  runtimeEnabled: boolean;
  uiEnabled: boolean;
  task?: string;
  requestedTools?: string[];
  requireVerification?: boolean;
}): PermissionKey[] {
  const required = new Set<PermissionKey>(["read", "write"]);

  for (const key of inferPermissionsFromTask(input.task)) {
    required.add(key);
  }
  for (const toolName of input.requestedTools ?? []) {
    required.add(resolvePermissionKey(toolName));
  }

  if (input.hasPlan) {
    required.add("todo");
  }
  if (input.verification.phase === "verification" || input.runtimeEnabled || input.requireVerification) {
    required.add("command");
  }
  if (input.uiEnabled) {
    required.add("browser");
  }

  return [...required];
}

export function runLongRunningPreflight(input?: string | LongRunningPreflightInput): LongRunningPreflightResult {
  const request = typeof input === "string" || input === undefined ? { cwd: input } : input;
  const cwd = normalizeCwd(request.cwd);
  const policy = loadAutonomyPolicyConfig(cwd);
  const workspaceConfig = loadWorkspaceVerificationConfig(cwd);
  const workspaceState = loadWorkspaceVerificationState(cwd);
  const resolvedPlan = resolveWorkspaceVerificationPlan(workspaceConfig, cwd);
  const workspaceResume = resolveWorkspaceVerificationResumePlan(workspaceState, resolvedPlan);
  const backgroundConfig = loadBackgroundProcessConfig(cwd);
  const plan = resolvePlanSnapshot(cwd);
  const activeSubagentRuns = loadActiveSubagentRuns(cwd);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredPermissions = collectRequiredPermissions({
    hasPlan: Boolean(plan.planId),
    verification: workspaceResume,
    runtimeEnabled: resolvedPlan.runtime.enabled,
    uiEnabled: resolvedPlan.ui.enabled,
    task: request.task,
    requestedTools: request.requestedTools,
    requireVerification: request.requireVerification,
  });
  const missingPermissions = requiredPermissions.filter((key) => {
    if (policy.mode === "plan" && (key === "write" || key === "command")) {
      return true;
    }
    return policy.permissions[key] !== "allow";
  });

  if (workspaceState.pendingProofReview) {
    blockers.push("workspace verification proof review is pending");
  }
  if (workspaceState.pendingReviewArtifact) {
    blockers.push("workspace review artifact acknowledgement is pending");
  }
  if (workspaceState.replanRequired) {
    blockers.push("workspace verification requires a new repair strategy before continuing");
  }
  if (resolvedPlan.runtime.enabled && !backgroundConfig.enabled) {
    blockers.push("runtime verification requires background processes, but background-process support is disabled");
  }
  if (policy.mode === "plan") {
    blockers.push("autonomy policy is in plan mode, so writes and commands are denied");
  }
  if (activeSubagentRuns.length > 0) {
    blockers.push("active subagent runs are still recorded; recover or wait for them before starting another unattended execution");
  }

  for (const key of missingPermissions) {
    const decision = policy.permissions[key];
    const detail = `${key} permission is ${decision}`;
    if (decision === "deny") {
      blockers.push(detail);
      continue;
    }
    if (request.nonInteractive !== false) {
      blockers.push(`non-interactive execution cannot satisfy ${detail}`);
      continue;
    }
    warnings.push(detail);
  }

  if (workspaceResume.phase === "verification" && requiredPermissions.includes("command") && policy.permissions.command === "ask") {
    blockers.push("verification resume needs command permission, but command is ask");
  }
  if (resolvedPlan.ui.enabled && policy.permissions.browser !== "allow") {
    blockers.push(`ui verification needs browser permission, but browser is ${policy.permissions.browser}`);
  }
  if (buildWorkspaceVerificationWarnings(cwd).length > 0) {
    warnings.push(...buildWorkspaceVerificationWarnings(cwd));
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    requiredPermissions,
    missingPermissions,
    workspaceVerificationPhase: workspaceResume.phase,
    runtimeNeedsBackgroundProcess: resolvedPlan.runtime.enabled,
  };
}

export function formatLongRunningReplay(replay: LongRunningReplay): string {
  const lines = [
    "# Long-Running Replay",
    "",
    `session_id: ${replay.session?.id ?? "-"}`,
    `session_status: ${replay.session?.status ?? "-"}`,
    `resume_reason: ${replay.resumeReason}`,
    `next_action: ${replay.nextAction}`,
    `workspace_verification_phase: ${replay.workspaceVerification.phase}`,
    `workspace_verification_reason: ${replay.workspaceVerification.reason}`,
    `checkpoint_path: ${replay.checkpointPath ?? "-"}`,
    `journal_path: ${replay.journalPath ?? "-"}`,
    `continuity_path: ${replay.continuityPath ?? "-"}`,
    `trajectory_path: ${replay.trajectoryPath ?? "-"}`,
    "",
    "recent_events:",
  ];

  if (replay.recentEvents.length === 0) {
    lines.push("- none");
  } else {
    for (const event of replay.recentEvents) {
      lines.push(`- ${event.timestamp} [${event.type}] ${event.summary}`);
    }
  }

  lines.push("", "background_processes:");
  if (replay.backgroundProcesses.length === 0) {
    lines.push("- none");
  } else {
    for (const record of replay.backgroundProcesses) {
      lines.push(`- ${record.id} ${record.label} pid=${record.pid} status=${record.status} keepAlive=${record.keepAliveOnShutdown}`);
    }
  }

  if (replay.plan.currentStep || replay.plan.name) {
    lines.push("", "plan:");
    lines.push(`- name: ${replay.plan.name ?? "-"}`);
    lines.push(`- current_step: ${replay.plan.currentStep ?? "-"}`);
  }

  if (replay.warnings.length > 0) {
    lines.push("", "warnings:");
    for (const warning of replay.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatLongRunningPreflight(result: LongRunningPreflightResult): string {
  const lines = [
    "# Long-Running Preflight",
    "",
    `ok: ${result.ok}`,
    `workspace_verification_phase: ${result.workspaceVerificationPhase}`,
    `runtime_needs_background_process: ${result.runtimeNeedsBackgroundProcess}`,
    `required_permissions: ${result.requiredPermissions.join(", ") || "-"}`,
    `missing_permissions: ${result.missingPermissions.join(", ") || "-"}`,
    "",
    "blockers:",
  ];

  if (result.blockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push("", "warnings:");
  if (result.warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
