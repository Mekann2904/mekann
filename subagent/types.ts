/**
 * Subagent Extension — Type definitions.
 */

// ─── Agent status ────────────────────────────────────────────────

export type AgentStatus =
  | "pending_init"
  | "running"
  | "interrupted"
  | "completed"
  | "errored"
  | "shutdown"
  | "not_found";

/** Terminal statuses — once reached, the agent will not transition further. */
export const TERMINAL_STATUSES: ReadonlySet<AgentStatus> = new Set([
  "completed",
  "errored",
  "shutdown",
  "interrupted",
]);

export function isTerminalStatus(s: AgentStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

// ─── Agent metadata ──────────────────────────────────────────────

export interface AgentMetadata {
  agentId: string;
  sessionId: string;
  parentAgentId?: string;
  parentSessionId?: string;
  agentPath: string;
  nickname?: string;
  role?: string;
  status: AgentStatus;
  lastTaskMessage?: string;
  createdAt: number;
  updatedAt: number;
  depth: number;
  open: boolean;
  cancellationRequested: boolean;
  timeoutDeadline?: number;
}

// ─── Lifecycle events ────────────────────────────────────────────

/** Base fields shared by all lifecycle events. */
interface LifecycleBase {
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentSpawnBegin extends LifecycleBase { type: "agent_spawn_begin"; parentAgentId?: string; }
export interface AgentSpawnEnd extends LifecycleBase { type: "agent_spawn_end"; success: boolean; error?: string; }
export interface AgentMessageBegin extends LifecycleBase { type: "agent_message_begin"; }
export interface AgentMessageEnd extends LifecycleBase { type: "agent_message_end"; }
export interface AgentWaitingBegin extends LifecycleBase { type: "agent_waiting_begin"; }
export interface AgentWaitingEnd extends LifecycleBase { type: "agent_waiting_end"; }
export interface AgentCloseBegin extends LifecycleBase { type: "agent_close_begin"; }
export interface AgentCloseEnd extends LifecycleBase { type: "agent_close_end"; }
export interface AgentStatusChanged extends LifecycleBase { type: "agent_status_changed"; previousStatus: AgentStatus; newStatus: AgentStatus; }
export interface AgentFinalMessage extends LifecycleBase { type: "agent_final_message"; parentAgentId?: string; message: string; status: AgentStatus; }

export type LifecycleEvent =
  | AgentSpawnBegin | AgentSpawnEnd
  | AgentMessageBegin | AgentMessageEnd
  | AgentWaitingBegin | AgentWaitingEnd
  | AgentCloseBegin | AgentCloseEnd
  | AgentStatusChanged | AgentFinalMessage;

// ─── Mailbox item ────────────────────────────────────────────────

export interface MailboxItem {
  seq: number;
  fromAgentId: string;
  fromAgentPath: string;
  toAgentPath: string;
  content: string;
  timestamp: number;
  kind: "message" | "followup" | "final_result";
}

// ─── Spawn params ────────────────────────────────────────────────

export interface SpawnParams {
  task_name: string;
  message: string;
  model?: string;
  reasoning_effort?: string;
  role?: string;
  nickname?: string;
  fork_turns?: number | "all" | "none";
}

export interface SendMessageParams {
  target: string;
  message: string;
}

export type FollowupTaskParams = SendMessageParams;

export interface WaitAgentParams {
  timeout_ms?: number;
}

export interface ListAgentsParams {
  path_prefix?: string;
}

export interface CloseAgentParams {
  target: string;
}

// ─── Spawn result ────────────────────────────────────────────────

export interface SpawnResult {
  agent_id: string;
  task_name: string;
  status: AgentStatus;
}

export interface WaitResult {
  timed_out: boolean;
  events: LifecycleEvent[];
  mailbox: MailboxItem[];
}

export interface ListResult {
  agents: Array<{
    agent_id: string;
    agent_path: string;
    status: AgentStatus;
    last_task?: string;
    nickname?: string;
    role?: string;
    depth: number;
  }>;
}

// ─── Registry change subscriber ──────────────────────────────────

export type RegistrySubscriber = (event: LifecycleEvent) => void;
/**
 * Subagent Extension — Agent path resolution and validation.
 *
 * Root is always `/root`.
 * Task names are relative to the current agent's path.
 * Paths are canonical and used as dedup keys in the registry.
 */

export const ROOT_PATH = "/root";

/**
 * Validate a single path segment. Rejects `.`, `..`, empty, and `/`.
 */
export function isValidSegment(seg: string): boolean {
  return seg.length > 0 && seg !== "." && seg !== ".." && !seg.includes("/");
}

/**
 * Join segments into a canonical path.
 * Returns the canonical path or throws on invalid segments.
 */
export function joinSegments(base: string, segments: string[]): string {
  for (const seg of segments) {
    if (!isValidSegment(seg)) {
      throw new Error(
        `Invalid path segment: "${seg}". Segments must not be empty, ".", "..", or contain "/".`,
      );
    }
  }
  const parts = base.split("/").filter(Boolean);
  return "/" + [...parts, ...segments].join("/");
}

/**
 * Resolve a task_name relative to the current agent's path.
 *
 * - Absolute path: must start with `/root/...`
 * - Relative path: joined to currentPath
 *
 * Returns the canonical path or throws.
 */
export function resolveTaskPath(
  taskName: string,
  currentPath: string,
): string {
  const trimmed = taskName.trim();
  if (!trimmed) {
    throw new Error("task_name must not be empty.");
  }

  if (trimmed.startsWith("/")) {
    // Absolute path — must be under /root
    if (trimmed === ROOT_PATH) {
      throw new Error(`Cannot spawn at root path "${ROOT_PATH}".`);
    }
    if (!trimmed.startsWith(ROOT_PATH + "/")) {
      throw new Error(
        `Absolute task_name must start with "${ROOT_PATH}/". Got: "${trimmed}".`,
      );
    }
    // Validate segments
    const segments = trimmed.slice(ROOT_PATH.length + 1).split("/");
    for (const seg of segments) {
      if (!isValidSegment(seg)) {
        throw new Error(
          `Invalid path segment in absolute path: "${seg}".`,
        );
      }
    }
    return trimmed;
  }

  // Relative path
  const segments = trimmed.split("/");
  return joinSegments(currentPath, segments);
}

/**
 * Check if `candidatePath` starts with `prefix` at a segment boundary.
 *
 * Example:
 *   pathPrefix("/root/research", "/root/research/api_scan") → true
 *   pathPrefix("/root/research", "/root/research2") → false
 */
export function pathPrefix(prefix: string, candidatePath: string): boolean {
  if (prefix === candidatePath) return true;
  if (!candidatePath.startsWith(prefix + "/")) return false;
  return true;
}

/**
 * Get the parent path of a canonical agent path.
 * Returns ROOT_PATH for direct children of root.
 * Returns null for ROOT_PATH itself.
 */
export function parentPath(path: string): string | null {
  if (path === ROOT_PATH) return null;
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === 0) return ROOT_PATH;
  return path.slice(0, lastSlash);
}

/**
 * Get the depth of a path (number of segments below root).
 * ROOT_PATH → 0, /root/foo → 1, /root/foo/bar → 2
 */
export function pathDepth(path: string): number {
  if (path === ROOT_PATH) return 0;
  return path.split("/").length - 2; // -1 for leading /, -1 for "root"
}
