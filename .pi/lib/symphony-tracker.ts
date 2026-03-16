/**
 * path: .pi/lib/symphony-tracker.ts
 * role: Symphony 用の issue tracker abstraction と task_queue / Linear adapter を提供する
 * why: scheduler と orchestrator が issue source を差し替え可能な形で扱えるようにするため
 * related: .pi/lib/symphony-config.ts, .pi/lib/storage/task-plan-store.ts, .pi/lib/symphony-scheduler.ts, WORKFLOW.md
 */

import { loadTaskStorage, saveTaskStorage } from "./storage/task-plan-store.js";
import { loadSymphonyConfig, normalizeSymphonyStateName, type SymphonyEffectiveConfig } from "./symphony-config.js";
import { getAllUlWorkflowTasks } from "../extensions/web-ui/lib/ul-workflow-reader.js";

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

interface StoredTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  retryCount?: number;
  nextRetryAt?: string;
  lastError?: string;
}

interface StoredTaskStorage {
  tasks: StoredTask[];
}

interface StoredUlTask {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "completed" | "cancelled";
  priority: "medium";
  createdAt: string;
  updatedAt: string;
  phase: string;
}

interface LinearIssueNode {
  id?: string;
  identifier?: string;
  title?: string;
  description?: string | null;
  priority?: number | null;
  branchName?: string | null;
  url?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  state?: {
    name?: string | null;
  } | null;
  labels?: {
    nodes?: Array<{ name?: string | null }>;
  } | null;
  inverseRelations?: {
    nodes?: Array<{
      type?: string | null;
      issue?: {
        id?: string | null;
        identifier?: string | null;
        state?: {
          name?: string | null;
        } | null;
      } | null;
    }>;
  } | null;
}

interface LinearCandidateIssuesResponse {
  issues?: {
    nodes?: LinearIssueNode[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  };
}

interface LinearIssuesByIdsResponse {
  issues?: {
    nodes?: LinearIssueNode[];
  };
}

interface LinearIssueStateCatalogResponse {
  issue?: {
    id?: string | null;
    team?: {
      states?: {
        nodes?: Array<{
          id?: string | null;
          name?: string | null;
        }>;
      } | null;
    } | null;
  } | null;
}

interface LinearIssueUpdateResponse {
  issueUpdate?: {
    success?: boolean | null;
  } | null;
}

export interface SymphonyTrackerIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: Array<{
    id: string | null;
    identifier: string | null;
    state: string | null;
  }>;
  created_at: string | null;
  updated_at: string | null;
  retry_count?: number;
  retry_at: string | null;
  last_error?: string | null;
}

export class SymphonyTrackerError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "SymphonyTrackerError";
    this.code = code;
  }
}

function mapTaskPriority(priority: TaskPriority): number {
  switch (priority) {
    case "urgent":
      return 1;
    case "high":
      return 2;
    case "medium":
      return 3;
    default:
      return 4;
  }
}

function mapTaskStatusToTrackerState(status: TaskStatus): string {
  switch (status) {
    case "todo":
      return "Todo";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Done";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
  }
}

function normalizeTaskIssue(task: StoredTask): SymphonyTrackerIssue {
  return {
    id: task.id,
    identifier: task.id,
    title: task.title,
    description: task.description ?? null,
    priority: mapTaskPriority(task.priority),
    state: mapTaskStatusToTrackerState(task.status),
    branch_name: null,
    url: null,
    labels: [],
    blocked_by: [],
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    retry_count: task.retryCount ?? 0,
    retry_at: task.nextRetryAt ?? null,
    last_error: task.lastError ?? null,
  };
}

function normalizeUlWorkflowIssue(task: StoredUlTask): SymphonyTrackerIssue {
  return {
    id: task.id,
    identifier: task.id,
    title: task.title,
    description: task.description ?? null,
    priority: mapTaskPriority(task.priority),
    state: mapTaskStatusToTrackerState(task.status),
    branch_name: null,
    url: null,
    labels: ["ul-workflow", `phase:${task.phase}`],
    blocked_by: [],
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    retry_count: 0,
    retry_at: null,
    last_error: null,
  };
}

function byState(states: string[]) {
  const allowed = new Set(states.map(normalizeSymphonyStateName));
  return (issue: SymphonyTrackerIssue) => allowed.has(normalizeSymphonyStateName(issue.state));
}

async function fetchTaskQueueIssuesByStates(
  cwd: string,
  states: string[],
): Promise<SymphonyTrackerIssue[]> {
  const tasks = loadTaskStorage<{ tasks: StoredTask[] }>(cwd).tasks ?? [];
  const ulTasks = getAllUlWorkflowTasks() as StoredUlTask[];
  return [...tasks.map(normalizeTaskIssue), ...ulTasks.map(normalizeUlWorkflowIssue)]
    .filter(byState(states));
}

async function fetchLinearGraphQL<T>(
  config: SymphonyEffectiveConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  if (!config.tracker.apiKey) {
    throw new SymphonyTrackerError("missing_tracker_api_key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let response: Response;
    try {
      response = await fetch(config.tracker.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: config.tracker.apiKey,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (error) {
      const code = error instanceof DOMException && error.name === "AbortError"
        ? "linear_api_request"
        : "linear_api_request";
      const message = error instanceof Error ? error.message : String(error);
      throw new SymphonyTrackerError(code, message);
    }

    if (!response.ok) {
      throw new SymphonyTrackerError("linear_api_status", String(response.status));
    }

    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new SymphonyTrackerError(
        "linear_graphql_errors",
        payload.errors.map((item) => item.message || "unknown").join(" | "),
      );
    }
    if (!payload.data) {
      throw new SymphonyTrackerError("linear_unknown_payload");
    }
    return payload.data;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeLinearIssue(issue: LinearIssueNode): SymphonyTrackerIssue | null {
  if (!issue.id || !issue.identifier || !issue.title || !issue.state?.name) {
    return null;
  }

  const labels = new Set(
    (issue.labels?.nodes ?? [])
      .map((label) => String(label.name ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  const blockedBy = (issue.inverseRelations?.nodes ?? [])
    .filter((relation) => String(relation.type ?? "").trim().toLowerCase() === "blocks")
    .map((relation) => ({
      id: relation.issue?.id ?? null,
      identifier: relation.issue?.identifier ?? null,
      state: relation.issue?.state?.name ?? null,
    }));

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: typeof issue.priority === "number" ? issue.priority : null,
    state: issue.state.name,
    branch_name: issue.branchName ?? null,
    url: issue.url ?? null,
    labels: [...labels],
    blocked_by: blockedBy,
    created_at: issue.createdAt ?? null,
    updated_at: issue.updatedAt ?? null,
    retry_count: 0,
    retry_at: null,
    last_error: null,
  };
}

function getTrackerTodoStateName(config: SymphonyEffectiveConfig): string {
  return config.tracker.activeStates[0] ?? "Todo";
}

function getTrackerInProgressStateName(config: SymphonyEffectiveConfig): string {
  return config.tracker.activeStates[1] ?? config.tracker.activeStates[0] ?? "In Progress";
}

function getTrackerDoneStateName(config: SymphonyEffectiveConfig): string {
  const matched = config.tracker.terminalStates.find((state) => /done|closed|complete/i.test(state));
  return matched ?? config.tracker.terminalStates[0] ?? "Done";
}

function getTrackerFailedStateName(config: SymphonyEffectiveConfig): string {
  const matched = config.tracker.terminalStates.find((state) => /fail/i.test(state));
  return matched ?? config.tracker.terminalStates[0] ?? "Failed";
}

function resolveTaskStatusFromTrackerState(
  stateName: string,
  config: SymphonyEffectiveConfig,
): TaskStatus | null {
  const normalized = normalizeSymphonyStateName(stateName);
  if (normalized === normalizeSymphonyStateName(getTrackerTodoStateName(config))) {
    return "todo";
  }
  if (normalized === normalizeSymphonyStateName(getTrackerInProgressStateName(config))) {
    return "in_progress";
  }
  if (normalized === normalizeSymphonyStateName(getTrackerDoneStateName(config))) {
    return "completed";
  }
  if (normalized === normalizeSymphonyStateName(getTrackerFailedStateName(config))) {
    return "failed";
  }
  if (normalized === normalizeSymphonyStateName("cancelled") || normalized === normalizeSymphonyStateName("canceled")) {
    return "cancelled";
  }
  return null;
}

function updateTaskQueueIssueState(
  cwd: string,
  issueId: string,
  nextStateName: string,
): boolean {
  const config = loadSymphonyConfig(cwd);
  const nextStatus = resolveTaskStatusFromTrackerState(nextStateName, config);
  if (!nextStatus) {
    return false;
  }

  const storage = loadTaskStorage<StoredTaskStorage>(cwd);
  const taskIndex = storage.tasks.findIndex((task) => task.id === issueId);
  if (taskIndex < 0) {
    return false;
  }

  const current = storage.tasks[taskIndex];
  const nextTask: StoredTask = {
    ...current,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  if (nextStatus === "completed") {
    nextTask.lastError = undefined;
    nextTask.nextRetryAt = undefined;
    nextTask.retryCount = 0;
  } else if (nextStatus === "failed") {
    nextTask.nextRetryAt = undefined;
  }

  storage.tasks[taskIndex] = nextTask;
  saveTaskStorage(storage, cwd);
  return true;
}

async function resolveLinearStateId(
  config: SymphonyEffectiveConfig,
  issueId: string,
  targetStateName: string,
): Promise<string> {
  const query = `
    query SymphonyIssueStateCatalog($issueId: ID!) {
      issue(id: $issueId) {
        id
        team {
          states {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await fetchLinearGraphQL<LinearIssueStateCatalogResponse>(config, query, {
    issueId,
  });
  const states = data.issue?.team?.states?.nodes ?? [];
  const matched = states.find((state) => normalizeSymphonyStateName(String(state.name ?? "")) === normalizeSymphonyStateName(targetStateName));
  if (!matched?.id) {
    throw new SymphonyTrackerError("linear_missing_state", `target state not found: ${targetStateName}`);
  }
  return matched.id;
}

async function updateLinearIssueState(
  config: SymphonyEffectiveConfig,
  issueId: string,
  targetStateName: string,
): Promise<void> {
  const stateId = await resolveLinearStateId(config, issueId, targetStateName);
  const mutation = `
    mutation SymphonyIssueUpdateState($issueId: ID!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
      }
    }
  `;

  const data = await fetchLinearGraphQL<LinearIssueUpdateResponse>(config, mutation, {
    issueId,
    stateId,
  });
  if (!data.issueUpdate?.success) {
    throw new SymphonyTrackerError("linear_issue_update_failed", `failed to move issue: ${issueId}`);
  }
}

async function fetchLinearCandidateIssues(config: SymphonyEffectiveConfig): Promise<SymphonyTrackerIssue[]> {
  if (!config.tracker.projectSlug) {
    throw new SymphonyTrackerError("missing_tracker_project_slug");
  }

  const query = `
    query SymphonyCandidateIssues($projectSlug: String!, $states: [String!], $first: Int!, $after: String) {
      issues(
        filter: {
          project: { slugId: { eq: $projectSlug } }
          state: { name: { in: $states } }
        }
        first: $first
        after: $after
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          branchName
          url
          createdAt
          updatedAt
          state { name }
          labels { nodes { name } }
          inverseRelations {
            nodes {
              type
              issue {
                id
                identifier
                state { name }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const issues: SymphonyTrackerIssue[] = [];
  let after: string | null = null;

  while (true) {
    const data: LinearCandidateIssuesResponse = await fetchLinearGraphQL<LinearCandidateIssuesResponse>(config, query, {
      projectSlug: config.tracker.projectSlug,
      states: config.tracker.activeStates,
      first: 50,
      after,
    });

    const page: LinearCandidateIssuesResponse["issues"] = data.issues;
    for (const issue of page?.nodes ?? []) {
      const normalized = normalizeLinearIssue(issue);
      if (normalized) {
        issues.push(normalized);
      }
    }

    if (!page?.pageInfo?.hasNextPage) {
      break;
    }

    after = page.pageInfo.endCursor ?? null;
    if (!after) {
      throw new SymphonyTrackerError("linear_missing_end_cursor");
    }
  }

  return issues;
}

async function fetchLinearIssuesByIds(
  config: SymphonyEffectiveConfig,
  issueIds: string[],
): Promise<SymphonyTrackerIssue[]> {
  if (issueIds.length === 0) {
    return [];
  }

  const query = `
    query SymphonyIssuesByIds($ids: [ID!]) {
      issues(filter: { id: { in: $ids } }) {
        nodes {
          id
          identifier
          title
          description
          priority
          branchName
          url
          createdAt
          updatedAt
          state { name }
          labels { nodes { name } }
          inverseRelations {
            nodes {
              type
              issue {
                id
                identifier
                state { name }
              }
            }
          }
        }
      }
    }
  `;

  const data = await fetchLinearGraphQL<LinearIssuesByIdsResponse>(config, query, { ids: issueIds });

  return (data.issues?.nodes ?? [])
    .map(normalizeLinearIssue)
    .filter((item): item is SymphonyTrackerIssue => Boolean(item));
}

export async function fetchSymphonyCandidateIssues(cwd: string = process.cwd()): Promise<SymphonyTrackerIssue[]> {
  const config = loadSymphonyConfig(cwd);
  if (config.tracker.kind === "linear") {
    return fetchLinearCandidateIssues(config);
  }
  return fetchTaskQueueIssuesByStates(cwd, config.tracker.activeStates);
}

export async function fetchSymphonyIssuesByStates(
  cwd: string = process.cwd(),
  states: string[],
): Promise<SymphonyTrackerIssue[]> {
  const config = loadSymphonyConfig(cwd);
  if (config.tracker.kind === "linear") {
    const issues = await fetchLinearCandidateIssues({
      ...config,
      tracker: {
        ...config.tracker,
        activeStates: states,
      },
    });
    return issues.filter(byState(states));
  }
  return fetchTaskQueueIssuesByStates(cwd, states);
}

export async function fetchSymphonyIssueStatesByIds(
  cwd: string = process.cwd(),
  issueIds: string[],
): Promise<SymphonyTrackerIssue[]> {
  const config = loadSymphonyConfig(cwd);
  if (config.tracker.kind === "linear") {
    return fetchLinearIssuesByIds(config, issueIds);
  }

  const tasks = loadTaskStorage<{ tasks: StoredTask[] }>(cwd).tasks ?? [];
  const ulTasks = getAllUlWorkflowTasks() as StoredUlTask[];
  const idSet = new Set(issueIds);
  return [
    ...tasks
      .filter((task) => idSet.has(task.id))
      .map(normalizeTaskIssue),
    ...ulTasks
      .filter((task) => idSet.has(task.id))
      .map(normalizeUlWorkflowIssue),
  ];
}

export async function updateSymphonyTrackerIssueState(
  cwd: string = process.cwd(),
  issueId: string,
  targetStateName: string,
  config: SymphonyEffectiveConfig = loadSymphonyConfig(cwd),
): Promise<void> {
  if (config.tracker.kind === "linear") {
    await updateLinearIssueState(config, issueId, targetStateName);
    return;
  }
  updateTaskQueueIssueState(cwd, issueId, targetStateName);
}

export async function markSymphonyTrackerIssueTodo(
  cwd: string = process.cwd(),
  issueId: string,
): Promise<void> {
  const config = loadSymphonyConfig(cwd);
  await updateSymphonyTrackerIssueState(cwd, issueId, getTrackerTodoStateName(config), config);
}

export async function markSymphonyTrackerIssueInProgress(
  cwd: string = process.cwd(),
  issueId: string,
): Promise<void> {
  const config = loadSymphonyConfig(cwd);
  await updateSymphonyTrackerIssueState(cwd, issueId, getTrackerInProgressStateName(config), config);
}

export async function markSymphonyTrackerIssueCompleted(
  cwd: string = process.cwd(),
  issueId: string,
): Promise<void> {
  const config = loadSymphonyConfig(cwd);
  await updateSymphonyTrackerIssueState(cwd, issueId, getTrackerDoneStateName(config), config);
}

export async function markSymphonyTrackerIssueFailed(
  cwd: string = process.cwd(),
  issueId: string,
): Promise<void> {
  const config = loadSymphonyConfig(cwd);
  await updateSymphonyTrackerIssueState(cwd, issueId, getTrackerFailedStateName(config), config);
}
