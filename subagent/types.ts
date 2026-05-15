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

export interface FollowupTaskParams {
  target: string;
  message: string;
}

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
