/**
 * path: .pi/lib/symphony-tracker.ts
 * role: Symphony 用の issue tracker abstraction と task_queue / Linear adapter を提供する
 * why: scheduler と orchestrator が issue source を差し替え可能な形で扱えるようにするため
 * related: .pi/lib/symphony-config.ts, .pi/lib/storage/task-plan-store.ts, .pi/lib/symphony-scheduler.ts, WORKFLOW.md
 */

import { loadTaskStorage } from "./storage/task-plan-store.js";
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
    throw new Error("missing_tracker_api_key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(config.tracker.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: config.tracker.apiKey,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`linear_api_status:${response.status}`);
    }

    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(`linear_graphql_errors:${payload.errors.map((item) => item.message || "unknown").join(" | ")}`);
    }
    if (!payload.data) {
      throw new Error("linear_unknown_payload");
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

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: typeof issue.priority === "number" ? issue.priority : null,
    state: issue.state.name,
    branch_name: issue.branchName ?? null,
    url: issue.url ?? null,
    labels: (issue.labels?.nodes ?? [])
      .map((label) => String(label.name ?? "").trim().toLowerCase())
      .filter(Boolean),
    blocked_by: [],
    created_at: issue.createdAt ?? null,
    updated_at: issue.updatedAt ?? null,
    retry_count: 0,
    retry_at: null,
    last_error: null,
  };
}

async function fetchLinearCandidateIssues(config: SymphonyEffectiveConfig): Promise<SymphonyTrackerIssue[]> {
  if (!config.tracker.projectSlug) {
    throw new Error("missing_tracker_project_slug");
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
      throw new Error("linear_missing_end_cursor");
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
  const idSet = new Set(issueIds);
  return tasks
    .filter((task) => idSet.has(task.id))
    .map(normalizeTaskIssue);
}
