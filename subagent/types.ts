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

export interface AgentSpawnBegin {
  type: "agent_spawn_begin";
  agentId: string;
  agentPath: string;
  parentAgentId?: string;
  timestamp: number;
}

export interface AgentSpawnEnd {
  type: "agent_spawn_end";
  agentId: string;
  agentPath: string;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface AgentMessageBegin {
  type: "agent_message_begin";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentMessageEnd {
  type: "agent_message_end";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentWaitingBegin {
  type: "agent_waiting_begin";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentWaitingEnd {
  type: "agent_waiting_end";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentCloseBegin {
  type: "agent_close_begin";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentCloseEnd {
  type: "agent_close_end";
  agentId: string;
  agentPath: string;
  timestamp: number;
}

export interface AgentStatusChanged {
  type: "agent_status_changed";
  agentId: string;
  agentPath: string;
  previousStatus: AgentStatus;
  newStatus: AgentStatus;
  timestamp: number;
}

export interface AgentFinalMessage {
  type: "agent_final_message";
  agentId: string;
  agentPath: string;
  parentAgentId?: string;
  message: string;
  status: AgentStatus;
  timestamp: number;
}

export type LifecycleEvent =
  | AgentSpawnBegin
  | AgentSpawnEnd
  | AgentMessageBegin
  | AgentMessageEnd
  | AgentWaitingBegin
  | AgentWaitingEnd
  | AgentCloseBegin
  | AgentCloseEnd
  | AgentStatusChanged
  | AgentFinalMessage;

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
