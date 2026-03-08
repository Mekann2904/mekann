/**
 * path: .pi/lib/symphony-config.ts
 * role: WORKFLOW.md frontmatter から Symphony 実行設定を型付きで解決する
 * why: tracker, polling, agent, runtime の設定を scheduler や orchestrator が共通で使うため
 * related: .pi/lib/workflow-workpad.ts, .pi/lib/symphony-tracker.ts, .pi/lib/symphony-orchestrator-loop.ts, WORKFLOW.md
 */

import { loadWorkflowDocument } from "./workflow-workpad.js";

export type SymphonyTrackerKind = "task_queue" | "linear";

export interface SymphonyTrackerConfig {
  kind: SymphonyTrackerKind;
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface SymphonyEffectiveConfig {
  workflowPath: string;
  tracker: SymphonyTrackerConfig;
  polling: {
    intervalMs: number;
  };
  agent: {
    maxConcurrentAgents: number;
    maxRetryBackoffMs: number;
  };
  runtime: {
    kind: string;
    command: string;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
}

const DEFAULT_LINEAR_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_CONCURRENT_AGENTS = 10;
const DEFAULT_MAX_RETRY_BACKOFF_MS = 300_000;
const DEFAULT_TURN_TIMEOUT_MS = 3_600_000;
const DEFAULT_READ_TIMEOUT_MS = 5_000;
const DEFAULT_STALL_TIMEOUT_MS = 300_000;
const DEFAULT_RUNTIME_KIND = "pi-mono-extension";
const DEFAULT_RUNTIME_COMMAND = "pi";
const DEFAULT_ACTIVE_STATES = ["Todo", "In Progress"];
const DEFAULT_TERMINAL_STATES = ["Closed", "Cancelled", "Canceled", "Duplicate", "Done", "Failed"];

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitStates(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
    return items.length > 0 ? items : fallback;
  }

  if (typeof value === "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : fallback;
  }

  return fallback;
}

function resolveEnvBackedValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("$")) {
    return trimmed;
  }

  const envName = trimmed.slice(1);
  const resolved = process.env[envName]?.trim() ?? "";
  return resolved || null;
}

export function normalizeSymphonyStateName(value: string): string {
  return value.trim().toLowerCase();
}

export function loadSymphonyConfig(cwd: string = process.cwd()): SymphonyEffectiveConfig {
  const workflow = loadWorkflowDocument(cwd);
  const trackerKindRaw = String(workflow.frontmatter.tracker?.kind ?? "task_queue").trim().toLowerCase();
  const trackerKind: SymphonyTrackerKind = trackerKindRaw === "linear" ? "linear" : "task_queue";

  const trackerApiKey = resolveEnvBackedValue(
    workflow.frontmatter.tracker?.api_key ?? (trackerKind === "linear" ? "$LINEAR_API_KEY" : null),
  );

  return {
    workflowPath: workflow.path,
    tracker: {
      kind: trackerKind,
      endpoint: String(workflow.frontmatter.tracker?.endpoint ?? DEFAULT_LINEAR_ENDPOINT).trim() || DEFAULT_LINEAR_ENDPOINT,
      apiKey: trackerApiKey,
      projectSlug: resolveEnvBackedValue(workflow.frontmatter.tracker?.project_slug),
      activeStates: splitStates(workflow.frontmatter.tracker?.active_states, DEFAULT_ACTIVE_STATES),
      terminalStates: splitStates(workflow.frontmatter.tracker?.terminal_states, DEFAULT_TERMINAL_STATES),
    },
    polling: {
      intervalMs: parsePositiveInt(workflow.frontmatter.polling?.interval_ms, DEFAULT_POLL_INTERVAL_MS),
    },
    agent: {
      maxConcurrentAgents: parsePositiveInt(
        workflow.frontmatter.agent?.max_concurrent_agents,
        DEFAULT_MAX_CONCURRENT_AGENTS,
      ),
      maxRetryBackoffMs: parsePositiveInt(
        workflow.frontmatter.agent?.max_retry_backoff_ms,
        DEFAULT_MAX_RETRY_BACKOFF_MS,
      ),
    },
    runtime: {
      kind: String(
        workflow.frontmatter.runtime?.kind
        ?? "pi-mono-extension",
      ).trim() || DEFAULT_RUNTIME_KIND,
      command: String(
        workflow.frontmatter.runtime?.command
        ?? workflow.frontmatter.codex?.command
        ?? DEFAULT_RUNTIME_COMMAND,
      ).trim() || DEFAULT_RUNTIME_COMMAND,
      turnTimeoutMs: parsePositiveInt(
        workflow.frontmatter.runtime?.turn_timeout_ms ?? workflow.frontmatter.codex?.turn_timeout_ms,
        DEFAULT_TURN_TIMEOUT_MS,
      ),
      readTimeoutMs: parsePositiveInt(
        workflow.frontmatter.runtime?.read_timeout_ms ?? workflow.frontmatter.codex?.read_timeout_ms,
        DEFAULT_READ_TIMEOUT_MS,
      ),
      stallTimeoutMs: parsePositiveInt(
        workflow.frontmatter.runtime?.stall_timeout_ms ?? workflow.frontmatter.codex?.stall_timeout_ms,
        DEFAULT_STALL_TIMEOUT_MS,
      ),
    },
  };
}
