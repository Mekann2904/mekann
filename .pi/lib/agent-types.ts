/**
 * Shared agent types and constants.
 * Consolidates duplicate type definitions from:
 * - .pi/extensions/loop.ts (ThinkingLevel)
 * - .pi/extensions/rsa.ts (ThinkingLevel)
 * - .pi/extensions/subagents.ts (RunOutcomeCode, RunOutcomeSignal)
 * - .pi/extensions/agent-teams.ts (RunOutcomeCode, RunOutcomeSignal)
 */

/**
 * Thinking level for model reasoning.
 * Controls the depth of thinking/reasoning output from the model.
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * Outcome codes for agent/subagent/team execution results.
 * Used to classify the result of a run for retry logic and reporting.
 */
export type RunOutcomeCode =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "RETRYABLE_FAILURE"
  | "NONRETRYABLE_FAILURE"
  | "CANCELLED"
  | "TIMEOUT";

/**
 * Signal returned from agent/subagent/team execution.
 * Encapsulates the outcome code and whether a retry is recommended.
 */
export interface RunOutcomeSignal {
  outcomeCode: RunOutcomeCode;
  retryRecommended: boolean;
}

/**
 * Default timeout for agent operations in milliseconds.
 * 10 minutes - conservative default for complex operations.
 */
export const DEFAULT_AGENT_TIMEOUT_MS = 10 * 60 * 1000;
