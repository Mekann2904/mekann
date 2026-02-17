/**
 * Team orchestration type definitions.
 * Extracted from agent-teams.ts for maintainability.
 *
 * These types are used by the team live monitoring system and
 * parallel execution coordination.
 *
 * Related: extensions/agent-teams.ts, extensions/agent-teams/storage.ts
 */

import type { LiveStatus, LiveStreamView } from "./index.js";

// Re-export LiveStreamView for convenience
export type { LiveStreamView } from "./index.js";

// ============================================================================
// Team Live Monitor Types
// ============================================================================

/**
 * Team execution phase during orchestration.
 * Tracks the current stage of team member execution.
 */
export type TeamLivePhase =
  | "queued"
  | "initial"
  | "communication"
  | "judge"
  | "finished";

/**
 * View mode for team live monitoring interface.
 * Extends base LiveViewMode with "discussion" mode.
 */
export type TeamLiveViewMode = "list" | "detail" | "discussion";

/**
 * Live item tracking for team member execution.
 * Maintains real-time state for TUI rendering.
 */
export interface TeamLiveItem {
  /** Unique key: teamId/memberId */
  key: string;
  /** Display label */
  label: string;
  /** Communication partners (member IDs) */
  partners: string[];
  /** Current execution status */
  status: LiveStatus;
  /** Current execution phase */
  phase: TeamLivePhase;
  /** Communication round number (if in communication phase) */
  phaseRound?: number;
  /** Execution start timestamp */
  startedAtMs?: number;
  /** Execution finish timestamp */
  finishedAtMs?: number;
  /** Last output chunk timestamp */
  lastChunkAtMs?: number;
  /** Last event timestamp */
  lastEventAtMs?: number;
  /** Last event description */
  lastEvent?: string;
  /** Execution summary */
  summary?: string;
  /** Error message if failed */
  error?: string;
  /** Recent stdout lines */
  stdoutTail: string;
  /** Recent stderr lines */
  stderrTail: string;
  /** Total stdout bytes */
  stdoutBytes: number;
  /** Total stderr bytes */
  stderrBytes: number;
  /** Newline count in stdout */
  stdoutNewlineCount: number;
  /** Newline count in stderr */
  stderrNewlineCount: number;
  /** Whether stdout ends with newline */
  stdoutEndsWithNewline: boolean;
  /** Whether stderr ends with newline */
  stderrEndsWithNewline: boolean;
  /** Event log entries */
  events: string[];
  /** Discussion content tail */
  discussionTail: string;
  /** Discussion content bytes */
  discussionBytes: number;
  /** Discussion newline count */
  discussionNewlineCount: number;
  /** Whether discussion ends with newline */
  discussionEndsWithNewline: boolean;
}

// ============================================================================
// Team Monitor Interfaces (ISP-Compliant)
// ============================================================================

/**
 * Lifecycle operations for marking team member execution states.
 * Used by code that only needs to track start/finish transitions.
 *
 * @see Interface Segregation Principle - clients depend only on needed methods
 */
export interface TeamMonitorLifecycle {
  markStarted: (itemKey: string) => void;
  markFinished: (
    itemKey: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}

/**
 * Phase tracking operations for team member execution phases.
 * Used by code that only needs to manage phase transitions.
 */
export interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}

/**
 * Event logging operations for tracking execution events.
 * Used by code that only needs to record events.
 */
export interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}

/**
 * Stream output operations for appending stdout/stderr chunks.
 * Used by code that only needs to handle output streaming.
 */
export interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}

/**
 * Discussion tracking operations for multi-agent communication.
 * Used by code that only needs to track discussion content.
 */
export interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}

/**
 * Resource cleanup and termination operations.
 * Used by code that only needs to manage monitor lifecycle.
 */
export interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * Full monitor controller combining all capabilities.
 * Extends partial interfaces to maintain backward compatibility.
 * Clients should use narrower interfaces when possible.
 */
export interface AgentTeamLiveMonitorController
  extends TeamMonitorLifecycle,
    TeamMonitorPhase,
    TeamMonitorEvents,
    TeamMonitorStream,
    TeamMonitorDiscussion,
    TeamMonitorResource {}

// ============================================================================
// Team Parallel Execution Types
// ============================================================================

/**
 * Normalized output structure for team member execution.
 * Used for parsing and validating member outputs.
 */
export interface TeamNormalizedOutput {
  /** Extracted summary */
  summary: string;
  /** Full output content */
  output: string;
  /** Evidence count from output */
  evidenceCount: number;
  /** Whether output contains discussion section */
  hasDiscussion: boolean;
}

/**
 * Candidate for parallel capacity allocation.
 * Used in team parallel execution planning.
 */
export interface TeamParallelCapacityCandidate {
  /** Team ID */
  teamId: string;
  /** Requested parallelism level */
  parallelism: number;
}

/**
 * Resolution result for team parallel capacity.
 * Determines actual parallelism after capacity negotiation.
 */
export interface TeamParallelCapacityResolution {
  /** Team ID */
  teamId: string;
  /** Approved parallelism level */
  approvedParallelism: number;
  /** Whether request was approved */
  approved: boolean;
  /** Rejection reason if not approved */
  reason?: string;
}

// ============================================================================
// Team Frontmatter Types (Markdown Parsing)
// ============================================================================

/**
 * Team frontmatter structure for markdown team definitions.
 * Used when parsing team definition files.
 */
export interface TeamFrontmatter {
  id: string;
  name: string;
  description: string;
  enabled: "enabled" | "disabled";
  strategy?: "parallel" | "sequential";
  skills?: string[];
  members: TeamMemberFrontmatter[];
}

/**
 * Team member frontmatter for markdown parsing.
 */
export interface TeamMemberFrontmatter {
  id: string;
  role: string;
  description: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  skills?: string[];
}

/**
 * Parsed team markdown file structure.
 */
export interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}
