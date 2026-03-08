/**
 * path: .pi/lib/symphony-scheduler.ts
 * role: issue tracker candidate を Symphony 風 scheduler snapshot へ変換し reconcile を行う
 * why: refresh 時に eligible issue 選定と stale orchestration の reconcile を自動で行うため
 * related: .pi/lib/symphony-tracker.ts, .pi/lib/symphony-config.ts, .pi/lib/symphony-orchestrator-state.ts, .pi/extensions/web-ui/src/routes/runtime.ts
 */

import { loadSymphonyConfig, normalizeSymphonyStateName } from "./symphony-config.js";
import {
  getSymphonyIssueState,
  listSymphonyIssueStates,
  queueSymphonyIssueRetry,
  releaseSymphonyIssue,
} from "./symphony-orchestrator-state.js";
import { removeSymphonyWorkspace } from "./symphony-workspace-manager.js";
import {
  fetchSymphonyCandidateIssues,
  fetchSymphonyIssueStatesByIds,
  fetchSymphonyIssuesByStates,
  type SymphonyTrackerIssue,
} from "./symphony-tracker.js";

interface RuntimeSessionLike {
  taskId?: string;
  status: string;
}

export interface SymphonySchedulerCandidate {
  id: string;
  title: string;
  priority: number | null;
  status: string;
  eligible: boolean;
  reason: string;
  blockedBy?: Array<{
    id: string | null;
    identifier: string | null;
    state: string | null;
  }>;
}

export interface SymphonySchedulerSnapshot {
  generatedAt: string;
  eligibleCount: number;
  blockedCount: number;
  terminalCount: number;
  nextEligibleTask: {
    id: string;
    title: string;
    priority: number | null;
    status: string;
  } | null;
  candidates: SymphonySchedulerCandidate[];
}

interface RefreshOptions {
  reconcile?: boolean;
}

function compareIssues(left: SymphonyTrackerIssue, right: SymphonyTrackerIssue): number {
  const priorityDiff = (left.priority ?? 99) - (right.priority ?? 99);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }
  return Date.parse(left.created_at ?? "") - Date.parse(right.created_at ?? "");
}

function hasActiveRuntimeSession(taskId: string, runtimeSessions: RuntimeSessionLike[]): boolean {
  return runtimeSessions.some((session) => {
    if (session.taskId !== taskId) {
      return false;
    }
    return session.status === "starting" || session.status === "running";
  });
}

function buildCandidate(
  issue: SymphonyTrackerIssue,
  runtimeSessions: RuntimeSessionLike[],
  cwd: string,
  config = loadSymphonyConfig(cwd),
): SymphonySchedulerCandidate {
  const orchestration = getSymphonyIssueState(cwd, issue.id);
  const activeRuntime = hasActiveRuntimeSession(issue.id, runtimeSessions);
  const normalizedState = normalizeSymphonyStateName(issue.state);
  const terminalStateNames = new Set(config.tracker.terminalStates.map(normalizeSymphonyStateName));
  const isTerminal = config.tracker.terminalStates
    .map(normalizeSymphonyStateName)
    .includes(normalizedState);

  if (isTerminal) {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: `terminal:${issue.state}`,
    };
  }

  if (activeRuntime) {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "runtime-active",
    };
  }

  if (orchestration?.runState === "claimed") {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "already-claimed",
    };
  }

  if (orchestration?.runState === "running") {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "stale-running-awaiting-refresh",
    };
  }

  if (orchestration?.runState === "retrying") {
    if (issue.retry_at && Date.parse(issue.retry_at) > Date.now()) {
      return {
        id: issue.id,
        title: issue.title,
        priority: issue.priority,
        status: issue.state,
        eligible: false,
        reason: "retry-delayed",
      };
    }
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "retry-queued",
    };
  }

  if (issue.retry_at && Date.parse(issue.retry_at) > Date.now()) {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "retry-delayed",
    };
  }

  const isTodo = normalizedState === normalizeSymphonyStateName("Todo");
  const hasNonTerminalBlocker = issue.blocked_by.some((blocker) => {
    const blockerState = normalizeSymphonyStateName(String(blocker.state ?? ""));
    return blockerState && !terminalStateNames.has(blockerState);
  });
  if (isTodo && hasNonTerminalBlocker) {
    return {
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      status: issue.state,
      eligible: false,
      reason: "blocked-by-active-issue",
      blockedBy: issue.blocked_by.filter((blocker) => {
        const blockerState = normalizeSymphonyStateName(String(blocker.state ?? ""));
        return blockerState && !terminalStateNames.has(blockerState);
      }),
    };
  }

  return {
    id: issue.id,
    title: issue.title,
    priority: issue.priority,
    status: issue.state,
    eligible: true,
    reason: "eligible",
  };
}

export async function runSymphonyStartupTerminalCleanup(
  cwd: string = process.cwd(),
): Promise<string[]> {
  const config = loadSymphonyConfig(cwd);
  const terminalIssues = await fetchSymphonyIssuesByStates(cwd, config.tracker.terminalStates);
  for (const issue of terminalIssues) {
    await removeSymphonyWorkspace({
      cwd,
      issueId: issue.id,
    });
  }
  return terminalIssues.map((issue) => issue.id);
}

export async function refreshSymphonyScheduler(
  cwd: string = process.cwd(),
  runtimeSessions: RuntimeSessionLike[] = [],
  options: RefreshOptions = {},
): Promise<SymphonySchedulerSnapshot> {
  const config = loadSymphonyConfig(cwd);
  const issues = await fetchSymphonyCandidateIssues(cwd);
  const orchestrationStates = listSymphonyIssueStates(cwd);
  const issueIds = new Set(issues.map((issue) => issue.id));
  const terminalStateNames = new Set(config.tracker.terminalStates.map(normalizeSymphonyStateName));
  const activeStateNames = new Set(config.tracker.activeStates.map(normalizeSymphonyStateName));

  if (options.reconcile) {
    const terminalIssues = await fetchSymphonyIssuesByStates(cwd, config.tracker.terminalStates);
    const terminalIssueIds = new Set(terminalIssues.map((issue) => issue.id));
    const trackedIssueIds = orchestrationStates.map((item) => item.issueId);
    const trackedIssues = await fetchSymphonyIssueStatesByIds(cwd, trackedIssueIds);
    const trackedIssuesById = new Map(trackedIssues.map((issue) => [issue.id, issue]));

    for (const issue of issues) {
      const orchestration = getSymphonyIssueState(cwd, issue.id);
      const activeRuntime = hasActiveRuntimeSession(issue.id, runtimeSessions);

      if (terminalStateNames.has(normalizeSymphonyStateName(issue.state)) || terminalIssueIds.has(issue.id)) {
        if (orchestration && orchestration.runState !== "released") {
          releaseSymphonyIssue({
            cwd,
            issueId: issue.id,
            title: issue.title,
            source: "symphony-scheduler",
            reason: `issue reached terminal state: ${issue.state}`,
            sessionId: orchestration.sessionId,
            workpadId: orchestration.workpadId,
          });
          await removeSymphonyWorkspace({
            cwd,
            issueId: issue.id,
          });
        }
        continue;
      }

      if (!activeRuntime && orchestration?.runState === "running" && !terminalIssueIds.has(issue.id)) {
        queueSymphonyIssueRetry({
          cwd,
          issueId: issue.id,
          title: issue.title,
          source: "symphony-scheduler",
          reason: "no active runtime session for running orchestration",
          retryAttempt: (orchestration.retryAttempt ?? 0) + 1,
          sessionId: orchestration.sessionId,
          workpadId: orchestration.workpadId,
        });
      }
    }

    for (const orchestration of orchestrationStates) {
      if (orchestration.runState === "released") {
        continue;
      }
      if (issueIds.has(orchestration.issueId)) {
        continue;
      }

      const trackedIssue = trackedIssuesById.get(orchestration.issueId);
      if (!trackedIssue) {
        releaseSymphonyIssue({
          cwd,
          issueId: orchestration.issueId,
          title: orchestration.title,
          source: "symphony-scheduler",
          reason: "issue missing from tracker state refresh",
          sessionId: orchestration.sessionId,
          workpadId: orchestration.workpadId,
        });
        continue;
      }

      const normalizedTrackedState = normalizeSymphonyStateName(trackedIssue.state);
      const activeRuntime = hasActiveRuntimeSession(orchestration.issueId, runtimeSessions);

      if (terminalStateNames.has(normalizedTrackedState)) {
        releaseSymphonyIssue({
          cwd,
          issueId: orchestration.issueId,
          title: trackedIssue.title,
          source: "symphony-scheduler",
          reason: `issue reached terminal state: ${trackedIssue.state}`,
          sessionId: orchestration.sessionId,
          workpadId: orchestration.workpadId,
        });
        await removeSymphonyWorkspace({
          cwd,
          issueId: orchestration.issueId,
        });
        continue;
      }

      if (activeStateNames.has(normalizedTrackedState)) {
        if (!activeRuntime && orchestration.runState === "running") {
          queueSymphonyIssueRetry({
            cwd,
            issueId: orchestration.issueId,
            title: trackedIssue.title,
            source: "symphony-scheduler",
            reason: `no active runtime session for tracked active issue: ${trackedIssue.state}`,
            retryAttempt: (orchestration.retryAttempt ?? 0) + 1,
            sessionId: orchestration.sessionId,
            workpadId: orchestration.workpadId,
          });
        }
        continue;
      }

      releaseSymphonyIssue({
        cwd,
        issueId: orchestration.issueId,
        title: trackedIssue.title,
        source: "symphony-scheduler",
        reason: `issue left active states: ${trackedIssue.state}`,
        sessionId: orchestration.sessionId,
        workpadId: orchestration.workpadId,
      });
    }
  }

  const candidates = issues
    .sort(compareIssues)
    .map((issue) => buildCandidate(issue, runtimeSessions, cwd, config));

  const eligible = candidates.filter((item) => item.eligible);
  const terminalCount = candidates.filter((item) => item.reason.startsWith("terminal:")).length;

  return {
    generatedAt: new Date().toISOString(),
    eligibleCount: eligible.length,
    blockedCount: candidates.length - eligible.length - terminalCount,
    terminalCount,
    nextEligibleTask: eligible[0]
      ? {
          id: eligible[0].id,
          title: eligible[0].title,
          priority: eligible[0].priority,
          status: eligible[0].status,
        }
      : null,
    candidates: candidates.slice(0, 20),
  };
}
