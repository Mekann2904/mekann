/**
 * Subagent type definitions.
 * Extracted from subagents.ts for maintainability.
 *
 * These types are used by the subagent live monitoring system and
 * parallel execution coordination.
 *
 * Related: extensions/subagents.ts, extensions/subagents/storage.ts
 */

import type { LiveStatus, LiveStreamView, LiveViewMode } from "./live-monitor-base.js";
import type { LiveStatus as LiveStatusBase } from "./live-view-utils.js";

// Use LiveStatus from live-view-utils.ts for the canonical definition
export type { LiveStreamView, LiveViewMode } from "./live-monitor-base.js";

// ============================================================================
// Subagent Live Monitor Types
// ============================================================================

/**
 * View mode for subagent live monitoring interface.
 * Alias for base LiveViewMode for semantic clarity.
 */
export type SubagentLiveViewMode = LiveViewMode;

/**
 * Stream view selection for subagent output display.
 * Alias for base LiveStreamView for semantic clarity.
 */
export type SubagentLiveStreamView = LiveStreamView;

/**
 * Live item tracking for subagent execution.
 * Maintains real-time state for TUI rendering.
 */
export interface SubagentLiveItem {
  /** Subagent ID */
  id: string;
  /** Subagent name */
  name: string;
  /** Current execution status */
  status: LiveStatus;
  /** Execution start timestamp */
  startedAtMs?: number;
  /** Execution finish timestamp */
  finishedAtMs?: number;
  /** Last output chunk timestamp */
  lastChunkAtMs?: number;
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
}

// ============================================================================
// Subagent Monitor Interfaces (ISP-Compliant)
// ============================================================================

/**
 * Lifecycle operations for marking agent execution states.
 * Used by code that only needs to track start/finish transitions.
 *
 * @see Interface Segregation Principle - clients depend only on needed methods
 */
export interface SubagentMonitorLifecycle {
  markStarted: (agentId: string) => void;
  markFinished: (
    agentId: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}

/**
 * Stream output operations for appending stdout/stderr chunks.
 * Used by code that only needs to handle output streaming.
 */
export interface SubagentMonitorStream {
  appendChunk: (agentId: string, stream: SubagentLiveStreamView, chunk: string) => void;
}

/**
 * Resource cleanup and termination operations.
 * Used by code that only needs to manage monitor lifecycle.
 */
export interface SubagentMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * Full monitor controller combining all capabilities.
 * Extends partial interfaces to maintain backward compatibility.
 * Clients should use narrower interfaces when possible.
 */
export interface SubagentLiveMonitorController
  extends SubagentMonitorLifecycle,
    SubagentMonitorStream,
    SubagentMonitorResource {}

// ============================================================================
// Subagent Parallel Execution Types
// ============================================================================

/**
 * Normalized output structure for subagent execution.
 * Used for parsing and validating subagent outputs.
 */
export interface SubagentNormalizedOutput {
  /** Extracted summary */
  summary: string;
  /** Full output content */
  output: string;
  /** Whether output contains result section */
  hasResult: boolean;
}

/**
 * Resolution result for subagent parallel capacity.
 * Determines actual parallelism after capacity negotiation.
 */
export interface SubagentParallelCapacityResolution {
  /** Subagent ID */
  agentId: string;
  /** Approved parallelism level */
  approvedParallelism: number;
  /** Whether request was approved */
  approved: boolean;
  /** Rejection reason if not approved */
  reason?: string;
}

// ============================================================================
// Subagent Delegation State Types
// ============================================================================

/**
 * State tracking for delegation-first policy enforcement.
 * Monitors whether delegation has occurred and direct write confirmations.
 */
export interface DelegationState {
  /** Whether any delegation tool was called this request */
  delegatedThisRequest: boolean;
  /** Whether direct write was confirmed this request */
  directWriteConfirmedThisRequest: boolean;
  /** Timestamp until which direct write is confirmed */
  pendingDirectWriteConfirmUntilMs: number;
  /** Total delegation calls in this session */
  sessionDelegationCalls: number;
}

/**
 * Print command execution result.
 * Used for print mode execution tracking.
 */
export interface PrintCommandResult {
  /** Output content */
  output: string;
  /** Execution latency in milliseconds */
  latencyMs: number;
}
