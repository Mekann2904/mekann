/**
 * Shared agent error handling utilities.
 * Provides unified error classification and outcome resolution for
 * subagent and team member execution.
 *
 * Layer: 1 (depends on Layer 0: error-utils, agent-types)
 *
 * Enhanced with extended error classification (P1-5 improvement).
 * New error types: SCHEMA_VIOLATION, LOW_SUBSTANCE, EMPTY_OUTPUT
 */

import {
  classifyPressureError,
  extractStatusCodeFromMessage,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
} from "./error-utils.js";
import { type RunOutcomeCode, type RunOutcomeSignal } from "./agent-types.js";
import { type EntityType, type EntityConfig, SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG } from "./agent-common.js";

// ============================================================================
// Extended Error Classification (P1-5)
// ============================================================================

/**
 * Extended error classification codes.
 * Extends the base RunOutcomeCode with semantic error types.
 */
export type ExtendedOutcomeCode =
  | RunOutcomeCode
  | "SCHEMA_VIOLATION"
  | "LOW_SUBSTANCE"
  | "EMPTY_OUTPUT"
  | "PARSE_ERROR";

/**
 * Extended outcome signal with semantic error classification.
 * Uses Omit to avoid type conflict with RunOutcomeSignal.outcomeCode.
 */
export interface ExtendedOutcomeSignal extends Omit<RunOutcomeSignal, 'outcomeCode'> {
  outcomeCode: ExtendedOutcomeCode;
  semanticError?: string;
  schemaViolations?: string[];
  /** Entity IDs that failed (for aggregate outcomes) */
  failedEntityIds?: string[];
}

/**
 * Classify semantic error from output content.
 * Used for extended error classification beyond infrastructure errors.
 *
 * @param output - Output content to analyze
 * @param error - Error message if available
 * @returns Extended error code if semantic error detected, undefined otherwise
 */
export function classifySemanticError(
  output?: string,
  error?: unknown,
): { code: ExtendedOutcomeCode | null; details?: string[] } {
  const errorMessage = error ? toErrorMessage(error).toLowerCase() : "";
  const outputLower = output?.toLowerCase() || "";

  // Schema violation detection
  if (
    errorMessage.includes("schema violation") ||
    errorMessage.includes("missing labels") ||
    errorMessage.includes("invalid format") ||
    errorMessage.includes("validation failed") ||
    outputLower.includes("schema violation")
  ) {
    return { code: "SCHEMA_VIOLATION", details: ["output_format_mismatch"] };
  }

  // Low substance detection (intent-only output)
  if (
    errorMessage.includes("intent-only") ||
    errorMessage.includes("low-substance") ||
    errorMessage.includes("insufficient content")
  ) {
    return { code: "LOW_SUBSTANCE", details: ["intent_only_output"] };
  }

  // Empty output detection
  if (
    errorMessage.includes("empty output") ||
    errorMessage.includes("empty result") ||
    (!output || output.trim().length === 0)
  ) {
    return { code: "EMPTY_OUTPUT", details: ["no_content"] };
  }

  // Parse error detection
  if (
    errorMessage.includes("parse error") ||
    errorMessage.includes("json parse") ||
    errorMessage.includes("syntax error") ||
    errorMessage.includes("unexpected token")
  ) {
    return { code: "PARSE_ERROR", details: ["parsing_failed"] };
  }

  return { code: null };
}

/**
 * Resolve extended outcome signal with semantic error classification.
 *
 * @param error - The error that occurred
 * @param output - Output content if available
 * @param config - Entity configuration (optional)
 * @returns Extended outcome signal with semantic classification
 */
export function resolveExtendedFailureOutcome(
  error: unknown,
  output?: string,
  config?: EntityConfig,
): ExtendedOutcomeSignal {
  // First check for semantic errors
  const semantic = classifySemanticError(output, error);
  if (semantic.code) {
    // SCHEMA_VIOLATION and LOW_SUBSTANCE are retryable with different prompts
    const retryable = semantic.code === "SCHEMA_VIOLATION" || semantic.code === "LOW_SUBSTANCE";
    return {
      outcomeCode: semantic.code,
      retryRecommended: retryable,
      semanticError: semantic.code,
      schemaViolations: semantic.details,
    };
  }

  // Fall back to standard failure resolution
  const baseResult = resolveFailureOutcome(error, config);
  return {
    outcomeCode: baseResult.outcomeCode,
    retryRecommended: baseResult.retryRecommended,
  };
}

// ============================================================================
// Retryable Error Patterns (OCP-Compliant Configuration)
// ============================================================================

/**
 * Default retryable error patterns.
 * These patterns are checked against error messages to determine retryability.
 */
const DEFAULT_RETRYABLE_PATTERNS: string[] = [
  "rate limit",
  "too many requests",
  "temporarily unavailable",
  "service unavailable",
  "try again",
  "overloaded",
  "capacity exceeded",
];

/**
 * Cache for parsed retryable patterns from environment variable.
 */
let cachedRetryablePatterns: string[] | undefined;

/**
 * Get the list of retryable error patterns.
 * Patterns can be extended via PI_RETRYABLE_ERROR_PATTERNS environment variable
 * (comma-separated list of additional patterns).
 *
 * @returns Array of retryable patterns to check against error messages
 */
export function getRetryablePatterns(): string[] {
  if (cachedRetryablePatterns !== undefined) {
    return cachedRetryablePatterns;
  }

  const envPatterns = process.env.PI_RETRYABLE_ERROR_PATTERNS;
  if (!envPatterns || envPatterns.trim() === "") {
    cachedRetryablePatterns = [...DEFAULT_RETRYABLE_PATTERNS];
    return cachedRetryablePatterns;
  }

  const additionalPatterns = envPatterns
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  cachedRetryablePatterns = [...DEFAULT_RETRYABLE_PATTERNS, ...additionalPatterns];
  return cachedRetryablePatterns;
}

/**
 * Reset the cached retryable patterns (primarily for testing).
 * Forces next call to getRetryablePatterns() to re-parse environment variable.
 */
export function resetRetryablePatternsCache(): void {
  cachedRetryablePatterns = undefined;
}

/**
 * Add custom retryable patterns at runtime.
 * Useful for dynamic configuration without environment variable restart.
 *
 * @param patterns - Additional patterns to add to the retryable list
 */
export function addRetryablePatterns(patterns: string[]): void {
  const normalizedPatterns = patterns
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  const currentPatterns = cachedRetryablePatterns || DEFAULT_RETRYABLE_PATTERNS;
  const newPatterns = normalizedPatterns.filter((p) => !currentPatterns.includes(p));

  if (newPatterns.length > 0) {
    cachedRetryablePatterns = [...currentPatterns, ...newPatterns];
  }
}

// ============================================================================
// Retryable Error Detection
// ============================================================================

/**
 * Check if an error is retryable for entity execution.
 * Combines generic retryable error checks with entity-specific patterns.
 *
 * @param error - The error to check
 * @param statusCode - Optional HTTP status code
 * @param config - Entity configuration for context-specific checks
 * @returns True if the error is retryable
 */
export function isRetryableEntityError(
  error: unknown,
  statusCode: number | undefined,
  config: EntityConfig,
): boolean {
  const message = toErrorMessage(error).toLowerCase();

  // Check for rate limit status codes
  if (statusCode === 429) {
    return true;
  }

  // Check for server errors (5xx)
  if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Check for entity-specific empty output message
  if (message.includes(config.emptyOutputMessage.toLowerCase())) {
    return true;
  }

  // Check for configured retryable patterns (OCP-compliant: patterns are now configurable)
  const retryablePatterns = getRetryablePatterns();
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

/**
 * Check if error is retryable for subagent context.
 * Convenience wrapper with subagent configuration.
 *
 * @param error - The error to check
 * @param statusCode - Optional HTTP status code
 * @returns True if the error is retryable
 */
export function isRetryableSubagentError(
  error: unknown,
  statusCode?: number,
): boolean {
  return isRetryableEntityError(error, statusCode, SUBAGENT_CONFIG);
}

/**
 * Check if error is retryable for team member context.
 * Convenience wrapper with team member configuration.
 *
 * @param error - The error to check
 * @param statusCode - Optional HTTP status code
 * @returns True if the error is retryable
 */
export function isRetryableTeamMemberError(
  error: unknown,
  statusCode?: number,
): boolean {
  return isRetryableEntityError(error, statusCode, TEAM_MEMBER_CONFIG);
}

// ============================================================================
// Failure Outcome Resolution
// ============================================================================

/**
 * Resolve the outcome signal for a failed entity execution.
 * Classifies the error and determines whether retry is recommended.
 *
 * @param error - The error that occurred
 * @param config - Entity configuration (optional, uses default classification)
 * @returns Outcome signal with code and retry recommendation
 */
export function resolveFailureOutcome(
  error: unknown,
  config?: EntityConfig,
): RunOutcomeSignal {
  // Cancellation is never retryable
  if (isCancelledErrorMessage(error)) {
    return { outcomeCode: "CANCELLED", retryRecommended: false };
  }

  // Timeout is always retryable
  if (isTimeoutErrorMessage(error)) {
    return { outcomeCode: "TIMEOUT", retryRecommended: true };
  }

  // Classify pressure-related errors
  const pressure = classifyPressureError(error);
  if (pressure !== "other") {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  // Check for retryable entity-specific errors
  const statusCode = extractStatusCodeFromMessage(error);
  if (config && isRetryableEntityError(error, statusCode, config)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  // Default to non-retryable failure
  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

/**
 * Resolve failure outcome for subagent context.
 * Convenience wrapper with subagent configuration.
 *
 * @param error - The error that occurred
 * @returns Outcome signal with code and retry recommendation
 */
export function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, SUBAGENT_CONFIG);
}

/**
 * Resolve failure outcome for team member context.
 * Convenience wrapper with team member configuration.
 *
 * @param error - The error that occurred
 * @returns Outcome signal with code and retry recommendation
 */
export function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, TEAM_MEMBER_CONFIG);
}

// ============================================================================
// Aggregate Outcome Resolution
// ============================================================================

/**
 * Result item interface for aggregate outcome resolution.
 */
export interface EntityResultItem {
  status: "completed" | "failed";
  error?: string;
  summary?: string;
  entityId: string;
}

/**
 * Resolve aggregate outcome from multiple entity results.
 * Used for parallel execution where some entities may succeed and others fail.
 *
 * @param results - Array of entity results
 * @param resolveEntityFailure - Function to resolve individual entity failure outcomes
 * @returns Aggregate outcome with failed entity IDs
 */
export function resolveAggregateOutcome<T extends EntityResultItem>(
  results: T[],
  resolveEntityFailure: (error: unknown) => RunOutcomeSignal,
): RunOutcomeSignal & { failedEntityIds: string[] } {
  const failed = results.filter((result) => result.status === "failed");

  if (failed.length === 0) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedEntityIds: [],
    };
  }

  const failedEntityIds = failed.map((result) => result.entityId);

  const retryableFailureCount = failed.filter((result) => {
    const failure = resolveEntityFailure(result.error || result.summary);
    return failure.retryRecommended;
  }).length;

  const hasAnySuccess = failed.length < results.length;

  // Partial success if some entities completed
  if (hasAnySuccess) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedEntityIds,
    };
  }

  // All failed - determine if retryable
  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedEntityIds,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedEntityIds,
      };
}

/**
 * Resolve aggregate outcome for subagent parallel execution.
 *
 * @param results - Array of subagent run results
 * @returns Aggregate outcome with failed subagent IDs
 */
export function resolveSubagentParallelOutcome(
  results: Array<{ runRecord: { status: "completed" | "failed"; error?: string; summary?: string; agentId: string } }>,
): RunOutcomeSignal & { failedSubagentIds: string[] } {
  const mappedResults: EntityResultItem[] = results.map((r) => ({
    status: r.runRecord.status,
    error: r.runRecord.error,
    summary: r.runRecord.summary,
    entityId: r.runRecord.agentId,
  }));

  const outcome = resolveAggregateOutcome(mappedResults, resolveSubagentFailureOutcome);
  return {
    ...outcome,
    failedSubagentIds: outcome.failedEntityIds,
  };
}

/**
 * Resolve aggregate outcome for team member execution.
 *
 * @param memberResults - Array of team member results
 * @returns Aggregate outcome with failed member IDs
 */
export function resolveTeamMemberAggregateOutcome(
  memberResults: Array<{ status: "completed" | "failed"; error?: string; summary?: string; memberId: string }>,
): RunOutcomeSignal & { failedMemberIds: string[] } {
  const mappedResults: EntityResultItem[] = memberResults.map((r) => ({
    status: r.status,
    error: r.error,
    summary: r.summary,
    entityId: r.memberId,
  }));

  const outcome = resolveAggregateOutcome(mappedResults, resolveTeamFailureOutcome);
  return {
    ...outcome,
    failedMemberIds: outcome.failedEntityIds,
  };
}

// ============================================================================
// Error Message Utilities
// ============================================================================

/**
 * Trim error message for display, ensuring it doesn't exceed max length.
 *
 * @param message - Error message to trim
 * @param maxLength - Maximum length (default: 200)
 * @returns Trimmed message
 */
export function trimErrorMessage(message: string, maxLength = 200): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength - 3)}...`;
}

/**
 * Build diagnostic context string for error messages.
 * Includes retry count, status codes, and rate limit information.
 *
 * @param context - Diagnostic context values
 * @returns Formatted diagnostic string
 */
export function buildDiagnosticContext(context: {
  provider?: string;
  model?: string;
  retries?: number;
  lastStatusCode?: number;
  lastRetryMessage?: string;
  rateLimitWaitMs?: number;
  rateLimitHits?: number;
  gateWaitMs?: number;
  gateHits?: number;
}): string {
  const parts: string[] = [];

  if (context.provider) parts.push(`provider=${context.provider}`);
  if (context.model) parts.push(`model=${context.model}`);
  if (context.retries !== undefined) parts.push(`retries=${context.retries}`);
  if (context.lastStatusCode !== undefined) parts.push(`last_status=${context.lastStatusCode}`);
  if (context.lastRetryMessage) parts.push(`last_retry_error=${trimErrorMessage(context.lastRetryMessage, 60)}`);
  if (context.rateLimitWaitMs && context.rateLimitWaitMs > 0) {
    parts.push(`last_gate_wait_ms=${context.rateLimitWaitMs}`);
  }
  if (context.rateLimitHits && context.rateLimitHits > 0) {
    parts.push(`last_gate_hits=${context.rateLimitHits}`);
  }
  if (context.gateWaitMs !== undefined) parts.push(`gate_wait_ms=${context.gateWaitMs}`);
  if (context.gateHits !== undefined) parts.push(`gate_hits=${context.gateHits}`);

  return parts.join(" ");
}
