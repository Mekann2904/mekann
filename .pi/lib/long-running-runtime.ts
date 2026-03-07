// Path: .pi/lib/long-running-runtime.ts
// What: 旧 long-running runtime API を long-running supervisor backend へ委譲する互換レイヤー
// Why: 既存の autonomy_* 呼び出しとテストを壊さずに durable backend を一本化するため
// Related: .pi/lib/long-running-supervisor.ts, .pi/extensions/autonomy-policy.ts, tests/unit/lib/long-running-runtime.test.ts, docs/02-user-guide/25-long-running-runtime.md

import {
  beginLongRunningSessionSync,
  createLongRunningReplay,
  finalizeLongRunningSession,
  heartbeatLongRunningSession as heartbeatSupervisorSession,
  loadLatestLongRunningSession,
  loadLongRunningJournal as loadSupervisorJournal,
  loadLongRunningSession,
  recordLongRunningEvent,
  recordLongRunningToolCall as recordSupervisorToolCall,
  recordLongRunningToolResult as recordSupervisorToolResult,
  runLongRunningPreflight,
  runLongRunningSupervisorSweep,
  type LongRunningJournalEvent,
  type LongRunningSessionState,
} from "./long-running-supervisor.js";

export type LongRunningSessionStatus =
  | "active"
  | "completed"
  | "cancelled"
  | "stale"
  | "crashed";

export type LongRunningLeaseStatus = "active" | "released" | "expired";

export type LongRunningJournalKind =
  | "session_start"
  | "session_finish"
  | "tool_call"
  | "tool_result"
  | "checkpoint"
  | "supervisor_recovery"
  | "preflight";

export interface LongRunningSessionRecord {
  id: string;
  cwd: string;
  pid: number;
  startedAt: string;
  updatedAt: string;
  status: LongRunningSessionStatus;
  mode?: string;
  profile?: string;
  pendingResume: boolean;
  pendingReason?: string;
  lastToolName?: string;
  lastToolCallId?: string;
  lastToolStartedAt?: string;
  lastToolFinishedAt?: string;
  lastCheckpointId?: string;
  lastCheckpointAt?: string;
}

export interface LongRunningLeaseRecord {
  id: string;
  sessionId: string;
  resourceType: "tool";
  resourceId: string;
  toolName: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: LongRunningLeaseStatus;
}

export interface LongRunningJournalEntry {
  id: string;
  timestamp: string;
  sessionId?: string;
  kind: LongRunningJournalKind;
  summary: string;
  details?: Record<string, unknown>;
}

export interface LongRunningRuntimeState {
  version: 1;
  activeSessionId?: string;
  lastRecoveredAt?: string;
  sessions: LongRunningSessionRecord[];
  leases: LongRunningLeaseRecord[];
}

export interface AutonomyPreflightInput {
  cwd?: string;
  task?: string;
  requestedTools?: string[];
  nonInteractive?: boolean;
  requireVerification?: boolean;
}

export interface AutonomyPreflightReport {
  ok: boolean;
  policy: {
    enabled: boolean;
    profile: string;
    mode: string;
    gatekeeper: string;
    permissions: Record<string, unknown>;
  };
  requiredPermissions: string[];
  blockers: string[];
  warnings: string[];
  resumePhase: string;
  nextSuggestedAction?: string;
}

export interface LongRunningResumeReport {
  pendingSession?: LongRunningSessionRecord;
  checkpointId?: string;
  workspaceVerification: {
    phase: string;
    reason: string;
    replay?: {
      summary?: {
        nextSuggestedAction?: string;
        resumePhase?: string;
      };
    };
  };
  runningBackgroundProcesses: Array<Record<string, unknown>>;
  recentJournal: LongRunningJournalEntry[];
}

function mapStatus(status: LongRunningSessionState["status"]): LongRunningSessionStatus {
  if (status === "clean_shutdown") {
    return "completed";
  }
  if (status === "superseded") {
    return "stale";
  }
  return status;
}

function mapSession(session: LongRunningSessionState | null | undefined): LongRunningSessionRecord | undefined {
  if (!session) {
    return undefined;
  }

  const pendingResume = session.status === "crashed";
  return {
    id: session.id,
    cwd: session.cwd,
    pid: session.ownerPid,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    status: mapStatus(session.status),
    pendingResume,
    pendingReason: pendingResume ? (session.lastError ?? "Session requires resume.") : undefined,
    lastToolName: session.lastToolName,
    lastCheckpointId: session.id,
    lastCheckpointAt: session.updatedAt,
  };
}

function mapJournalKind(eventType: LongRunningJournalEvent["type"]): LongRunningJournalKind {
  switch (eventType) {
    case "session_start":
    case "session_resume":
      return "session_start";
    case "session_shutdown":
      return "session_finish";
    case "tool_call":
      return "tool_call";
    case "tool_result":
      return "tool_result";
    case "supervisor_sweep":
      return "supervisor_recovery";
    default:
      return "checkpoint";
  }
}

function mapJournalEntry(sessionId: string | undefined, event: LongRunningJournalEvent, index: number): LongRunningJournalEntry {
  return {
    id: `${sessionId ?? "session"}-${index}`,
    timestamp: event.timestamp,
    sessionId,
    kind: mapJournalKind(event.type),
    summary: event.summary,
    details: event.details,
  };
}

export function loadLongRunningRuntimeState(cwd?: string): LongRunningRuntimeState {
  const session = loadLatestLongRunningSession(cwd);
  const mapped = mapSession(session);

  return {
    version: 1,
    activeSessionId: session?.status === "active" ? session.id : undefined,
    lastRecoveredAt: session?.updatedAt,
    sessions: mapped ? [mapped] : [],
    leases: [],
  };
}

export function saveLongRunningRuntimeState(
  cwd: string | undefined,
  _state: LongRunningRuntimeState,
): LongRunningRuntimeState {
  return loadLongRunningRuntimeState(cwd);
}

export function appendLongRunningJournalEntry(
  cwd: string | undefined,
  entry: Omit<LongRunningJournalEntry, "id" | "timestamp"> & { id?: string; timestamp?: string },
): LongRunningJournalEntry {
  const session = loadLatestLongRunningSession(cwd);
  recordLongRunningEvent(cwd, {
    timestamp: entry.timestamp,
    type: entry.kind === "tool_result"
      ? "tool_result"
      : entry.kind === "tool_call"
        ? "tool_call"
        : entry.kind === "session_finish"
          ? "session_shutdown"
          : entry.kind === "supervisor_recovery"
            ? "supervisor_sweep"
            : "session_start",
    summary: entry.summary,
    success: true,
    details: entry.details,
  });

  return {
    id: entry.id ?? `${session?.id ?? "session"}-compat`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    sessionId: entry.sessionId ?? session?.id,
    kind: entry.kind,
    summary: entry.summary,
    details: entry.details,
  };
}

export function loadLongRunningJournal(
  cwd?: string,
  maxEntries: number = 20,
): LongRunningJournalEntry[] {
  const session = loadLatestLongRunningSession(cwd);
  if (!session) {
    return [];
  }

  return loadSupervisorJournal(session.cwd, session.id)
    .slice(-Math.max(1, maxEntries))
    .map((event, index) => mapJournalEntry(session.id, event, index));
}

export function recoverLongRunningRuntime(input?: {
  cwd?: string;
  heartbeatTimeoutMs?: number;
}): {
  state: LongRunningRuntimeState;
  recoveredSessions: LongRunningSessionRecord[];
  expiredLeases: LongRunningLeaseRecord[];
} {
  const latestBefore = loadLatestLongRunningSession(input?.cwd);
  const staleBefore = latestBefore && latestBefore.status === "active"
    && Number.isFinite(Date.parse(latestBefore.updatedAt))
    && Date.now() - Date.parse(latestBefore.updatedAt) > Math.max(10_000, input?.heartbeatTimeoutMs ?? 120_000);
  const orphanBefore = latestBefore && latestBefore.status === "active" && latestBefore.ownerPid !== process.pid;
  let recoveredSessions: LongRunningSessionRecord[] = [];
  if (staleBefore || orphanBefore) {
    recordLongRunningEvent(input?.cwd, {
      type: "supervisor_sweep",
      summary: `compat recovery marked session as crashed: ${latestBefore.id}`,
      success: false,
      details: {
        compatibilityLayer: true,
      },
    });
    finalizeLongRunningSession(input?.cwd, latestBefore.id, "crashed");
    const mapped = mapSession(latestBefore);
    if (mapped) {
      recoveredSessions = [{
        ...mapped,
        status: "crashed",
        pendingResume: true,
        pendingReason: staleBefore
          ? "Compatibility recovery detected stale heartbeat."
          : "Compatibility recovery detected orphan owner process.",
      }];
    }
  }
  const fallbackState = loadLongRunningRuntimeState(input?.cwd);

  void runLongRunningSupervisorSweep({
    cwd: input?.cwd,
    reclaimBackgroundOrphans: false,
  });
  return {
    state: fallbackState,
    recoveredSessions,
    expiredLeases: [],
  };
}

export function startLongRunningSession(input: {
  cwd?: string;
  pid?: number;
  mode?: string;
  profile?: string;
}): LongRunningSessionRecord {
  void input.pid;
  void input.mode;
  void input.profile;
  const { session } = beginLongRunningSessionSync({
    cwd: input.cwd,
  });
  const cached = loadLongRunningSession(session.cwd, session.id);
  const mapped = mapSession(cached);
  if (!mapped) {
    throw new Error("Failed to create long-running session.");
  }
  return mapped;
}

export function heartbeatLongRunningSession(input: {
  cwd?: string;
  sessionId: string;
  toolName?: string;
  toolCallId?: string;
}): LongRunningSessionRecord | undefined {
  void input.toolCallId;
  return mapSession(heartbeatSupervisorSession({
    cwd: input.cwd,
    sessionId: input.sessionId,
    toolName: input.toolName,
  }));
}

export function finishLongRunningSession(input: {
  cwd?: string;
  sessionId: string;
  status?: Extract<LongRunningSessionStatus, "completed" | "cancelled">;
}): LongRunningSessionRecord | undefined {
  finalizeLongRunningSession(
    input.cwd,
    input.sessionId,
    input.status === "cancelled" ? "superseded" : "clean_shutdown",
  );
  return mapSession(loadLongRunningSession(input.cwd ?? process.cwd(), input.sessionId));
}

export function recordLongRunningToolCall(input: {
  cwd?: string;
  sessionId: string;
  toolName: string;
  toolCallId?: string;
  toolInput?: unknown;
}): LongRunningLeaseRecord {
  recordSupervisorToolCall(input.cwd, input.sessionId, {
    toolName: input.toolName,
    input: input.toolInput,
  });

  const now = new Date().toISOString();
  return {
    id: input.toolCallId ?? `${input.sessionId}-${input.toolName}`,
    sessionId: input.sessionId,
    resourceType: "tool",
    resourceId: input.toolCallId ?? `${input.sessionId}-${input.toolName}`,
    toolName: input.toolName,
    acquiredAt: now,
    heartbeatAt: now,
    expiresAt: now,
    status: "released",
  };
}

export async function recordLongRunningToolResult(input: {
  cwd?: string;
  sessionId: string;
  toolName: string;
  toolCallId?: string;
  isError?: boolean;
  details?: Record<string, unknown>;
}): Promise<LongRunningSessionRecord | undefined> {
  recordSupervisorToolResult(input.cwd, input.sessionId, {
    toolName: input.toolName,
    isError: input.isError,
    result: input.details,
  });

  recordLongRunningEvent(input.cwd, {
    type: "subagent_run",
    toolName: input.toolName,
    summary: `compat checkpoint after ${input.toolName}`,
    success: input.isError !== true,
    details: {
      compatibilityLayer: true,
      checkpointId: `compat-${input.sessionId}`,
    },
  });

  return mapSession(loadLongRunningSession(input.cwd ?? process.cwd(), input.sessionId));
}

export function createAutonomyPreflightReport(input: AutonomyPreflightInput = {}): AutonomyPreflightReport {
  const report = runLongRunningPreflight({
    cwd: input.cwd,
    task: input.task,
    requestedTools: input.requestedTools,
    nonInteractive: input.nonInteractive,
    requireVerification: input.requireVerification,
  });

  return {
    ok: report.ok,
    policy: {
      enabled: true,
      profile: "compat",
      mode: "build",
      gatekeeper: "compat",
      permissions: {},
    },
    requiredPermissions: report.requiredPermissions,
    blockers: report.blockers,
    warnings: report.warnings,
    resumePhase: report.workspaceVerificationPhase,
  };
}

export function createLongRunningResumeReport(cwd?: string): LongRunningResumeReport {
  const replay = createLongRunningReplay(cwd);
  const pendingSession = replay.session?.status === "crashed" ? mapSession(replay.session) : undefined;
  const replaySummary = replay.nextAction
    ? {
        summary: {
          nextSuggestedAction: replay.nextAction,
          resumePhase: replay.workspaceVerification.phase,
        },
      }
    : undefined;

  return {
    pendingSession,
    checkpointId: replay.session?.id,
    workspaceVerification: {
      phase: replay.workspaceVerification.phase,
      reason: replay.workspaceVerification.reason,
      replay: replaySummary,
    },
    runningBackgroundProcesses: replay.backgroundProcesses,
    recentJournal: replay.session
      ? loadSupervisorJournal(replay.session.cwd, replay.session.id).map((event, index) =>
          mapJournalEntry(replay.session?.id, event, index))
      : [],
  };
}

export function formatLongRunningResumePrompt(report: LongRunningResumeReport): string {
  const lines = [
    "## Long-Running Runtime",
    "",
    `pending_session: ${report.pendingSession?.id ?? "-"}`,
    `resume_phase: ${report.workspaceVerification.phase}`,
    `resume_reason: ${report.workspaceVerification.reason}`,
    `checkpoint_id: ${report.checkpointId ?? "-"}`,
  ];

  if (report.workspaceVerification.replay?.summary?.nextSuggestedAction) {
    lines.push(`next_action: ${report.workspaceVerification.replay.summary.nextSuggestedAction}`);
  }

  return `${lines.join("\n")}\n`;
}
