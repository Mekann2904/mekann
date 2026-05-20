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

export type AgentDisplayKind = "kitty-pi" | "kitty-split";

export interface AgentDisplayRef {
  kind: AgentDisplayKind;
  status: "opening" | "open" | "failed" | "closed";
  windowId?: string;
  agentId?: string;
  title: string;
  cwd: string;
  logPath?: string;
  socketPath?: string;
  pid?: number;
  error?: string;
}

export interface AgentDisplayResult {
  kind: AgentDisplayKind;
  status: "opening" | "open" | "failed" | "closed";
  window_id?: string;
  title?: string;
  log_path?: string;
  socket_path?: string;
  pid?: number;
  error?: string;
}

export type AgentRuntime =
  | { mode: "in_process"; agentId: string; agentPath: string; session: import("@earendil-works/pi-coding-agent").AgentSession; display?: AgentDisplayRef }
  | { mode: "external_pi"; agentId: string; agentPath: string; socketPath: string; pid?: number; display?: AgentDisplayRef; connected: boolean; capabilities?: string[] };

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
  display?: AgentDisplayRef;
  authority?: SubagentAuthority;
  authorityEnforced?: boolean;
  workspaceCwd?: string;
  resultContract?: ResultContract;
}

// ─── Lifecycle events ────────────────────────────────────────────

/** Base fields shared by all lifecycle events. */
interface LifecycleBase {
  agentId: string;
  agentPath: string;
  timestamp: number;
  seq?: number;
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
  authority?: SubagentAuthority;
  result_contract?: ResultContract;
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
  display?: AgentDisplayResult;
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
    display?: AgentDisplayResult;
    authority?: SubagentAuthority;
    authority_enforced?: boolean;
    result_contract?: ResultContract;
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

function validateSegments(segments: string[], context: string): void {
  for (const seg of segments) {
    if (!isValidSegment(seg)) throw new Error(`Invalid path segment${context}: "${seg}".`);
  }
}

/**
 * Join segments into a canonical path.
 * Returns the canonical path or throws on invalid segments.
 */
export function joinSegments(base: string, segments: string[]): string {
  validateSegments(segments, "");
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
    validateSegments(segments, " in absolute path");
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

// ---------------------------------------------------------------------------
// TUI rendering helpers (migrated from render.ts)
// ---------------------------------------------------------------------------

/**
 * Format a list of agents for display in the /agents command.
 */
export function formatAgentList(agents: AgentMetadata[]): string[] {
  if (agents.length === 0) return ["(no agents)"];

  const lines: string[] = [];
  for (const agent of agents) {
    const statusIcon = agent.open ? "●" : "○";
    const nickname = agent.nickname ? ` (${agent.nickname})` : "";
    const role = agent.role ? ` [${agent.role}]` : "";
    const task = agent.lastTaskMessage
      ? ` — ${truncate(agent.lastTaskMessage, 60)}`
      : "";
    const display = agent.display
      ? agent.display.status === "failed"
        ? ` — display: ${agent.display.kind}/failed: ${agent.display.error ?? "unknown error"}`
        : ` — display: ${agent.display.kind}/${agent.display.status}${agent.display.pid ? ` pid=${agent.display.pid}` : ""}${agent.display.windowId ? ` window=${agent.display.windowId}` : ""}`
      : "";
    lines.push(
      `${statusIcon} ${agent.agentPath}${nickname}${role} — ${agent.status}${display}${task}`,
    );
  }
  return lines;
}

/**
 * Format a wait result for display.
 */
export function formatWaitResult(
  events: LifecycleEvent[],
  mailbox: MailboxItem[],
  timedOut: boolean,
): string[] {
  const lines: string[] = [];
  if (timedOut) {
    lines.push("(timed out — no updates in the given period)");
  }

  if (mailbox.length > 0) {
    lines.push(`Mailbox (${mailbox.length} messages):`);
    for (const item of mailbox) {
      lines.push(`  [${item.kind}] from ${item.fromAgentPath}: ${truncate(item.content, 100)}`);
    }
  }

  const statusEvents = events.filter(
    (e) =>
      e.type === "agent_status_changed" || e.type === "agent_final_message",
  );
  if (statusEvents.length > 0) {
    lines.push("Events:");
    for (const evt of statusEvents) {
      if (evt.type === "agent_status_changed") {
        lines.push(`  ${evt.agentPath}: ${evt.previousStatus} → ${evt.newStatus}`);
      } else if (evt.type === "agent_final_message") {
        lines.push(`  ${evt.agentPath}: ${truncate(evt.message, 100)}`);
      }
    }
  }

  if (lines.length === 0) {
    lines.push("(no updates)");
  }
  return lines;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

// ─── Structured subagent results / authority ─────────────────────

export type ResultContract = "free_text" | "subagent_result_v1";
export type SubagentAuthorityMode = "read_only" | "propose_patch" | "edit";

export interface SubagentAuthority {
  mode: SubagentAuthorityMode;
  write_scope?: string[];
  semantic_scope?: SemanticTarget[];
  allowed_commands?: ValidationCommand[];
  max_patch_bytes?: number;
  require_base_hash?: boolean;
  isolated_worktree?: "required" | "preferred" | "none";
}

export type SemanticTargetKind = "symbol" | "type" | "api_route" | "graphql_field" | "db_table" | "db_column" | "config_key" | "feature" | "event_payload" | "cli_command" | "file_format" | "test_contract" | "file";
export interface SemanticTarget { kind: SemanticTargetKind; name: string; }
export interface SemanticReadWriteSet { reads: SemanticTarget[]; writes: SemanticTarget[]; }
export type Compatibility = "backward_compatible" | "breaking" | "unknown";
export type SemanticEffect =
  | { kind: "api_contract"; target: SemanticTarget; change: "add" | "remove" | "modify"; compatibility: Compatibility }
  | { kind: "data_model"; target: SemanticTarget; change: "add" | "remove" | "rename" | "type_change" | "semantic_change"; compatibility: Compatibility }
  | { kind: "behavior"; target: SemanticTarget; description: string; compatibility: Compatibility }
  | { kind: "config"; target: SemanticTarget; change: "add" | "remove" | "modify"; compatibility: Compatibility }
  | { kind: "side_effect"; target: SemanticTarget; operation: "read" | "write" | "delete" | "network" | "db" }
  | { kind: "test_expectation"; target: SemanticTarget; change: "add" | "modify" | "remove" };
export interface SemanticAssumption { kind: "symbol_signature" | "data_shape" | "behavior" | "config_value" | "dependency_version" | "feature_flag" | "test_contract"; target: SemanticTarget; expected: string; fingerprint?: string; }
export interface SemanticFingerprint { target: SemanticTarget; hash: string; extractor: string; }
export type PublicSurfaceKind = "typescript_export" | "rest_api" | "graphql_schema" | "database_schema" | "config_schema" | "cli" | "event_payload" | "file_format";
export interface PublicSurfaceDelta { surface: PublicSurfaceKind; name: string; change: "add" | "remove" | "modify"; compatibility: "compatible" | "breaking" | "unknown"; }
export interface SemanticRisk { level: "low" | "medium" | "high"; reasons?: string[]; }
export type ValidationCommand = { kind: "npm_script"; script: string; args?: string[] } | { kind: "shell_allowlisted"; command_id: string; args?: string[] };
export interface RequiredCheck { kind: "typecheck" | "unit_test" | "affected_test" | "contract_test" | "public_surface_diff" | "invariant"; target?: string; command?: ValidationCommand; }
export interface FileFingerprint { path: string; hash: string; }
export interface AffectedTarget { target: SemanticTarget; reason?: string; }

export interface NoChangeResult { schema: "subagent.result.v1"; outcome: "no_change"; summary: string; evidence?: string[]; }
export interface PatchProposalResult { schema: "subagent.result.v1"; outcome: "patch"; summary: string; patch: { format: "unified_diff"; ref?: string; body?: string; bytes?: number }; base: { git_commit?: string; files: FileFingerprint[]; semantic_fingerprints?: SemanticFingerprint[] }; scope: { allowed_paths: string[]; touched_paths: string[]; semantic_scope?: SemanticTarget[] }; semantic: { reads: SemanticTarget[]; writes: SemanticTarget[]; assumptions: SemanticAssumption[]; effects: SemanticEffect[]; public_surface_delta: PublicSurfaceDelta[]; affected_invariants?: string[]; affected_targets?: AffectedTarget[]; risk: SemanticRisk }; validation: { suggested: ValidationCommand[]; required?: RequiredCheck[] }; }
export interface BlockedResult { schema: "subagent.result.v1"; outcome: "blocked"; reason: string; required_permission?: Partial<SubagentAuthority>; }
export interface NeedsDecisionResult { schema: "subagent.result.v1"; outcome: "needs_decision"; question: string; options: Array<{ id: string; description: string }>; }
export interface ObservationResult { schema: "subagent.result.v1"; outcome: "observation"; summary: string; findings: Array<{ target?: SemanticTarget; path?: string; message: string }>; }
export type SubagentResultV1 = NoChangeResult | PatchProposalResult | BlockedResult | NeedsDecisionResult | ObservationResult;

export type StoredResultStatus = "pending" | "escrowed" | "applying" | "applied" | "rejected" | "needs_review" | "superseded";
export interface EscrowRecord { system: "autoresearch"; candidate_id: string; contract_hash: string; escrowed_at: number; }
export interface StoredSubagentResult { result_id: string; agent_id: string; agent_path: string; created_at: number; status: StoredResultStatus; result: SubagentResultV1; authority?: SubagentAuthority; authority_enforced?: boolean; workspace_cwd?: string; applying_at?: number; apply_record?: ApplyRecord; escrow_record?: EscrowRecord; reject_reason?: RejectReason; reject_details?: unknown; review_record?: ReviewRecord; superseded_reason?: string; }
export type RejectReason = "invalid_schema" | "invalid_patch_ref" | "patch_too_large" | "outside_path_scope" | "outside_semantic_scope" | "base_hash_mismatch" | "semantic_base_mismatch" | "semantic_write_conflict" | "public_surface_barrier" | "undeclared_public_surface_delta" | "patch_check_failed" | "declared_touched_paths_mismatch" | "validation_command_not_allowed" | "validation_failed" | "high_risk_requires_review" | "manual_reject" | "require_regeneration" | "not_patch";
export interface ApplyRecord { result_id: string; agent_path: string; applied_at: number; patch_ref?: string; validation_result?: ValidationResult; }
export interface RejectRecord { result_id: string; reason: RejectReason; details?: unknown; }
export interface ReviewRecord { result_id: string; reason: string; details?: unknown; }
export interface SkipRecord { result_id: string; reason: string; }
export interface ApplyAgentResultsParams { source?: "pending" | "result_ids"; result_ids?: string[]; order?: "fifo"; max_results?: number; rollback_on_failure?: boolean; allow_high_risk?: boolean; }
export interface ApplyAgentResultsResult { applied: ApplyRecord[]; rejected: RejectRecord[]; needs_review: ReviewRecord[]; skipped: SkipRecord[]; }
export interface ValidationResult { ok: boolean; command?: ValidationCommand; output?: string; error?: string; }
export interface SemanticApplyLogEntry { result_id: string; agent_path: string; applied_at: number; candidate_id?: string; materialized_commit?: string; materialized_by?: "autoresearch"; reads: SemanticTarget[]; writes: SemanticTarget[]; assumptions: SemanticAssumption[]; effects: SemanticEffect[]; public_surface_delta: PublicSurfaceDelta[]; validation_result: ValidationResult; }
export interface ResultFilter { status?: StoredResultStatus; outcome?: SubagentResultV1["outcome"]; agent_path?: string; }
