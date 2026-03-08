/**
 * path: .pi/extensions/web-ui/lib/symphony-reader.ts
 * role: workflow・task queue・workpad を束ねた Symphony snapshot を組み立てる
 * why: web-ui と API から agent-first orchestration 状態を一貫して読めるようにするため
 * related: .pi/lib/workflow-workpad.ts, .pi/lib/storage/task-plan-store.ts, .pi/extensions/web-ui/lib/workpad-reader.ts, .pi/extensions/web-ui/lib/ul-workflow-reader.ts
 */

import { loadTaskStorage } from "../../../lib/storage/task-plan-store.js";
import { loadSymphonyConfig } from "../../../lib/symphony-config.js";
import { getSymphonyOrchestratorLoopState, type SymphonyOrchestratorLoopState } from "../../../lib/symphony-orchestrator-loop.js";
import { refreshSymphonyScheduler, type SymphonySchedulerSnapshot } from "../../../lib/symphony-scheduler.js";
import { SymphonyTrackerError } from "../../../lib/symphony-tracker.js";
import { getSymphonyWorkspaceInfo } from "../../../lib/symphony-workspace-manager.js";
import { loadWorkflowDocument } from "../../../lib/workflow-workpad.js";
import {
  getSymphonyIssueState,
  listSymphonyIssueEvents,
  listSymphonyIssueStates,
  type SymphonyIssueState,
} from "../../../lib/symphony-orchestrator-state.js";
import { getAllUlWorkflowTasks, getActiveUlWorkflowTask } from "./ul-workflow-reader.js";
import { getAllWorkpads, type WorkpadView } from "./workpad-reader.js";

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

interface StoredTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  updatedAt: string;
  createdAt: string;
  retryCount?: number;
  nextRetryAt?: string;
  lastError?: string;
  workspaceVerificationStatus?: "passed" | "failed";
  workspaceVerifiedAt?: string;
  workspaceVerificationMessage?: string;
  completionGateStatus?: "clear" | "blocked";
  completionGateUpdatedAt?: string;
  completionGateMessage?: string;
  completionGateBlockers?: string[];
  proofArtifacts?: string[];
  verifiedCommands?: string[];
  progressEvidence?: string[];
  verificationEvidence?: string[];
  reviewEvidence?: string[];
}

export interface SymphonyRuntimeSummary {
  activeLlm: number;
  activeRequests: number;
  queuedOrchestrations: number;
  sessions: {
    total: number;
    starting: number;
    running: number;
    completed: number;
    failed: number;
  };
}

export interface SymphonyRuntimeSessionSummary {
  id: string;
  taskId?: string;
  taskTitle?: string;
  status: string;
  startedAt: number;
  message?: string;
  progress?: number;
  agentId?: string;
  type?: string;
}

export interface SymphonySnapshot {
  generatedAt: string;
  health: {
    trackerStatus: "ok" | "error";
    lastTrackerError: string | null;
  };
  workflow: {
    exists: boolean;
    path: string;
    workspaceRoot: string;
    trackerKind: string;
    trackerProjectSlug: string | null;
    runtimeKind: string;
    entrypoints: string[];
    requiredCommands: string[];
    completionGate: {
      singleInProgress: boolean;
      proofArtifacts: boolean;
      workspaceVerification: boolean;
    };
    bodyPreview: string;
  };
  taskQueue: {
    total: number;
    todo: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    failed: number;
    retryScheduled: number;
    workspaceVerificationPassed: number;
    workspaceVerificationFailed: number;
    completionGateBlocked: number;
    nextTask: {
      id: string;
      title: string;
      priority: TaskPriority;
      status: TaskStatus;
      nextRetryAt?: string;
    } | null;
  };
  ulWorkflow: {
    total: number;
    activeTaskId: string | null;
    activePhase: string | null;
  };
  workpads: {
    total: number;
    latest: WorkpadView | null;
    recent: WorkpadView[];
  };
  orchestrator: SymphonyOrchestratorLoopState;
  scheduler: SymphonySchedulerSnapshot;
  orchestration: {
    totalTracked: number;
    claimed: number;
    running: number;
    retrying: number;
    released: number;
    recent: SymphonyIssueState[];
  };
  runtime: SymphonyRuntimeSummary | null;
}

function emptySchedulerSnapshot(): SymphonySchedulerSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    eligibleCount: 0,
    blockedCount: 0,
    terminalCount: 0,
    nextEligibleTask: null,
    candidates: [],
  };
}

function formatTrackerError(error: unknown): string {
  if (error instanceof SymphonyTrackerError) {
    return error.message === error.code ? error.code : `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface SymphonyIssueSnapshot {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: "task" | "ul-workflow";
  health: {
    trackerStatus: "ok" | "error";
    lastTrackerError: string | null;
  };
  queue: {
    position: number | null;
    isNext: boolean;
    totalPending: number;
    blockedReason: string | null;
    blockedBy: Array<{
      id: string | null;
      identifier: string | null;
      state: string | null;
    }>;
    retryAt: string | null;
    retryCount: number;
    lastError: string | null;
    candidateReason: string | null;
  };
  runtime: {
    activeSession: SymphonyRuntimeSessionSummary | null;
  };
  verification: {
    status: "passed" | "failed" | "missing";
    verifiedAt: string | null;
    message: string | null;
  };
  completionGate: {
    status: "clear" | "blocked" | "missing";
    updatedAt: string | null;
    message: string | null;
    blockers: string[];
  };
  proofArtifacts: string[];
  debug: {
    recentEvents: Array<{
      at: string;
      action: string;
      reason?: string;
      source?: string;
      sessionId?: string;
    }>;
    relatedSessions: SymphonyRuntimeSessionSummary[];
  };
  orchestration: SymphonyIssueState | null;
  workpad: WorkpadView | null;
  workflow: {
    exists: boolean;
    workspaceRoot: string;
    entrypoints: string[];
    requiredCommands: string[];
    verifiedCommands: string[];
    progressEvidence: string[];
    verificationEvidence: string[];
    reviewEvidence: string[];
  };
  workspace: {
    path: string;
    exists: boolean;
  };
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function compareTasks(left: StoredTask, right: StoredTask): number {
  const priorityDiff = (PRIORITY_ORDER[left.priority] ?? 9) - (PRIORITY_ORDER[right.priority] ?? 9);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function summarizeWorkflowBody(body: string): string {
  return body
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function extractProofArtifacts(workpad: WorkpadView | null): string[] {
  if (!workpad?.sections) {
    return [];
  }

  const matches = new Set<string>();
  for (const section of [workpad.sections.progress, workpad.sections.verification, workpad.sections.next]) {
    for (const line of String(section ?? "").split("\n")) {
      const match = line.match(/^\s*[-*]?\s*proof artifact:\s*(.+)\s*$/i);
      if (match?.[1]) {
        matches.add(match[1].trim());
      }
    }
  }

  return [...matches];
}

export async function buildSymphonySnapshot(
  cwd: string = process.cwd(),
  runtime: SymphonyRuntimeSummary | null = null,
): Promise<SymphonySnapshot> {
  const workflow = loadWorkflowDocument(cwd);
  const config = loadSymphonyConfig(cwd);
  const tasks = loadTaskStorage<{ tasks: StoredTask[] }>(cwd).tasks ?? [];
  const ulTasks = getAllUlWorkflowTasks();
  const activeUlTask = getActiveUlWorkflowTask();
  const workpads = getAllWorkpads(cwd);
  let scheduler = emptySchedulerSnapshot();
  let trackerStatus: "ok" | "error" = "ok";
  let lastTrackerError: string | null = null;

  try {
    scheduler = await refreshSymphonyScheduler(cwd);
  } catch (error) {
    trackerStatus = "error";
    lastTrackerError = formatTrackerError(error);
  }

  const orchestrationStates = listSymphonyIssueStates(cwd);
  const workspaceRoot = getSymphonyWorkspaceInfo({
    cwd,
    issueId: "__root__",
  }).rootPath;
  const nextTask = [...tasks]
    .filter((task) => {
      if (!(task.status === "todo" || task.status === "in_progress")) {
        return false;
      }
      if (task.nextRetryAt && Date.parse(task.nextRetryAt) > Date.now()) {
        return false;
      }
      return true;
    })
    .sort(compareTasks)[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    health: {
      trackerStatus,
      lastTrackerError,
    },
    workflow: {
      exists: workflow.exists,
      path: workflow.path,
      workspaceRoot,
      trackerKind: config.tracker.kind,
      trackerProjectSlug: config.tracker.projectSlug,
      runtimeKind: config.runtime.kind,
      entrypoints: workflow.frontmatter.entrypoints ?? [],
      requiredCommands: workflow.frontmatter.verification?.required_commands ?? [],
      completionGate: {
        singleInProgress: workflow.frontmatter.completion_gate?.require_single_in_progress_step !== false,
        proofArtifacts: workflow.frontmatter.completion_gate?.require_proof_artifacts !== false,
        workspaceVerification: workflow.frontmatter.completion_gate?.require_workspace_verification !== false,
      },
      bodyPreview: summarizeWorkflowBody(workflow.body),
    },
    taskQueue: {
      total: tasks.length,
      todo: tasks.filter((task) => task.status === "todo").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completed: tasks.filter((task) => task.status === "completed").length,
      cancelled: tasks.filter((task) => task.status === "cancelled").length,
      failed: tasks.filter((task) => task.status === "failed").length,
      retryScheduled: tasks.filter((task) => task.status === "todo" && task.nextRetryAt && Date.parse(task.nextRetryAt) > Date.now()).length,
      workspaceVerificationPassed: tasks.filter((task) => task.workspaceVerificationStatus === "passed").length,
      workspaceVerificationFailed: tasks.filter((task) => task.workspaceVerificationStatus === "failed").length,
      completionGateBlocked: tasks.filter((task) => task.completionGateStatus === "blocked").length,
      nextTask: nextTask
        ? {
            id: nextTask.id,
            title: nextTask.title,
            priority: nextTask.priority,
            status: nextTask.status,
            nextRetryAt: nextTask.nextRetryAt,
          }
        : null,
    },
    ulWorkflow: {
      total: ulTasks.length,
      activeTaskId: activeUlTask?.id ?? null,
      activePhase: activeUlTask?.phase ?? null,
    },
    workpads: {
      total: workpads.length,
      latest: workpads[0] ?? null,
      recent: workpads.slice(0, 5),
    },
    orchestrator: getSymphonyOrchestratorLoopState(),
    scheduler,
    orchestration: {
      totalTracked: orchestrationStates.length,
      claimed: orchestrationStates.filter((item) => item.runState === "claimed").length,
      running: orchestrationStates.filter((item) => item.runState === "running").length,
      retrying: orchestrationStates.filter((item) => item.runState === "retrying").length,
      released: orchestrationStates.filter((item) => item.runState === "released").length,
      recent: orchestrationStates.slice(0, 5),
    },
    runtime,
  };
}

export function buildSymphonyIssueSnapshot(
  issueId: string,
  cwd: string = process.cwd(),
  runtimeSessions: SymphonyRuntimeSessionSummary[] = [],
): SymphonyIssueSnapshot | null {
  const workflow = loadWorkflowDocument(cwd);
  const tasks = loadTaskStorage<{ tasks: StoredTask[] }>(cwd).tasks ?? [];
  const ulTasks = getAllUlWorkflowTasks();
  const workpads = getAllWorkpads(cwd);
  const pendingTasks = [...tasks]
    .filter((task) => {
      if (!(task.status === "todo" || task.status === "in_progress")) {
        return false;
      }
      if (task.nextRetryAt && Date.parse(task.nextRetryAt) > Date.now()) {
        return false;
      }
      return true;
    })
    .sort(compareTasks);
  const orchestration = getSymphonyIssueState(cwd, issueId);

  const regularTask = tasks.find((task) => task.id === issueId) ?? null;
  const ulTask = ulTasks.find((task) => task.id === issueId) ?? null;
  const baseTask = regularTask ?? ulTask;
  if (!baseTask) {
    return null;
  }

  const queueIndex = regularTask ? pendingTasks.findIndex((task) => task.id === issueId) : -1;
  const activeSession = runtimeSessions.find((session) => session.taskId === issueId)
    ?? runtimeSessions.find((session) => session.taskTitle?.trim() === baseTask.title.trim())
    ?? null;
  const relatedSessions = runtimeSessions.filter((session) =>
    session.taskId === issueId
    || session.taskTitle?.trim() === baseTask.title.trim(),
  );
  const workpad = workpads.find((item) => item.issueId === issueId)
    ?? workpads.find((item) => item.task.trim().toLowerCase() === baseTask.title.trim().toLowerCase())
    ?? null;
  const workspace = getSymphonyWorkspaceInfo({ cwd, issueId });
  const blockedReason = regularTask?.nextRetryAt && Date.parse(regularTask.nextRetryAt) > Date.now()
    ? "retry-delayed"
    : null;
  const proofArtifacts = regularTask?.proofArtifacts?.length
    ? regularTask.proofArtifacts
    : extractProofArtifacts(workpad);
  const recentEvents = listSymphonyIssueEvents(cwd, issueId, 10).map((event) => ({
    at: event.at,
    action: event.action,
    reason: event.reason,
    source: event.source,
    sessionId: event.sessionId,
  }));

  return {
    id: baseTask.id,
    title: baseTask.title,
    status: baseTask.status,
    priority: "priority" in baseTask ? String(baseTask.priority) : "medium",
    source: regularTask ? "task" : "ul-workflow",
    health: {
      trackerStatus: "ok",
      lastTrackerError: null,
    },
    queue: {
      position: queueIndex >= 0 ? queueIndex + 1 : null,
      isNext: queueIndex === 0,
      totalPending: pendingTasks.length,
      blockedReason,
      blockedBy: [],
      retryAt: regularTask?.nextRetryAt ?? null,
      retryCount: regularTask?.retryCount ?? 0,
      lastError: regularTask?.lastError ?? null,
      candidateReason: null,
    },
    runtime: {
      activeSession,
    },
    verification: {
      status: regularTask?.workspaceVerificationStatus ?? "missing",
      verifiedAt: regularTask?.workspaceVerifiedAt ?? null,
      message: regularTask?.workspaceVerificationMessage ?? null,
    },
    completionGate: {
      status: regularTask?.completionGateStatus ?? "missing",
      updatedAt: regularTask?.completionGateUpdatedAt ?? null,
      message: regularTask?.completionGateMessage ?? null,
      blockers: regularTask?.completionGateBlockers ?? [],
    },
    proofArtifacts,
    debug: {
      recentEvents,
      relatedSessions,
    },
    orchestration,
    workpad,
    workflow: {
      exists: workflow.exists,
      workspaceRoot: workspace.rootPath,
      entrypoints: workflow.frontmatter.entrypoints ?? [],
      requiredCommands: workflow.frontmatter.verification?.required_commands ?? [],
      verifiedCommands: regularTask?.verifiedCommands ?? [],
      progressEvidence: regularTask?.progressEvidence ?? [],
      verificationEvidence: regularTask?.verificationEvidence ?? [],
      reviewEvidence: regularTask?.reviewEvidence ?? [],
    },
    workspace: {
      path: workspace.path,
      exists: workspace.exists,
    },
  };
}

export async function hydrateSymphonyIssueSnapshot(
  snapshot: SymphonyIssueSnapshot,
  cwd: string = process.cwd(),
  runtimeSessions: SymphonyRuntimeSessionSummary[] = [],
): Promise<SymphonyIssueSnapshot> {
  try {
    const scheduler = await refreshSymphonyScheduler(cwd, runtimeSessions);
    const candidate = scheduler.candidates.find((item) => item.id === snapshot.id) ?? null;
    if (!candidate) {
      return snapshot;
    }

    return {
      ...snapshot,
      queue: {
        ...snapshot.queue,
        blockedReason: snapshot.queue.blockedReason ?? candidate.reason ?? null,
        blockedBy: candidate.blockedBy ?? snapshot.queue.blockedBy,
        candidateReason: candidate.reason ?? null,
      },
    };
  } catch (error) {
    return {
      ...snapshot,
      health: {
        trackerStatus: "error",
        lastTrackerError: formatTrackerError(error),
      },
    };
  }
}
