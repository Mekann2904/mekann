/**
 * Shared agent common utilities.
 * Provides unified constants and functions for subagent and team member execution.
 * Eliminates code duplication between subagents.ts and agent-teams.ts.
 *
 * Layer: 1 (depends on Layer 0: error-utils, validation-utils, format-utils)
 */

import { hasIntentOnlyContent } from "./output-validation.js";
import { toFiniteNumberWithDefault } from "./validation-utils.js";

// ============================================================================
// Stable Runtime Profile Constants
// ============================================================================

/**
 * Global stable runtime profile flag.
 * When true, enables deterministic behavior for production reliability:
 * - Disables ad-hoc retry tuning
 * - Uses fixed default retry/timeout parameters
 * - Prevents unpredictable fan-out behavior
 *
 * Both subagents.ts and agent-teams.ts should use this unified constant.
 */
export const STABLE_RUNTIME_PROFILE = true;

/**
 * Adaptive parallelism penalty configuration.
 * In stable mode (STABLE_RUNTIME_PROFILE = true), max penalty is 0 to ensure
 * predictable parallelism. In development mode, allows up to 3 penalty steps.
 */
export const ADAPTIVE_PARALLEL_MAX_PENALTY = STABLE_RUNTIME_PROFILE ? 0 : 3;

/**
 * Adaptive parallelism decay interval in milliseconds.
 * Penalties decay after this duration of successful operations.
 */
export const ADAPTIVE_PARALLEL_DECAY_MS = 8 * 60 * 1000; // 8 minutes

// ============================================================================
// Retry Configuration Constants (Stable Profile)
// ============================================================================

/**
 * Maximum retry attempts for stable runtime profile.
 * Reduced from 4 to 2 for faster failure detection and recovery.
 */
export const STABLE_MAX_RETRIES = 2;

/**
 * Initial delay for retry backoff in milliseconds.
 * Reduced from 1000ms for faster initial retry.
 */
export const STABLE_INITIAL_DELAY_MS = 800;

/**
 * Maximum delay for retry backoff in milliseconds.
 * Reduced from 30000ms (30s) to 10000ms (10s) for faster recovery.
 */
export const STABLE_MAX_DELAY_MS = 10_000;

/**
 * Maximum retry attempts specifically for rate limit errors.
 * Reduced from 6 to 4 for faster fallback.
 */
export const STABLE_MAX_RATE_LIMIT_RETRIES = 4;

/**
 * Maximum wait time for rate limit gate in milliseconds.
 */
export const STABLE_MAX_RATE_LIMIT_WAIT_MS = 90_000;

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Entity type identifier for shared functions.
 * Used to distinguish between subagent and team member contexts.
 */
export type EntityType = "subagent" | "team-member";

/**
 * Configuration for entity-specific behavior.
 */
export interface EntityConfig {
  type: EntityType;
  label: string;
  emptyOutputMessage: string;
  defaultSummaryFallback: string;
}

/**
 * Default subagent configuration.
 */
export const SUBAGENT_CONFIG: EntityConfig = {
  type: "subagent",
  label: "subagent",
  emptyOutputMessage: "subagent returned empty output",
  defaultSummaryFallback: "回答を整形しました。",
};

/**
 * Default team member configuration.
 */
export const TEAM_MEMBER_CONFIG: EntityConfig = {
  type: "team-member",
  label: "team member",
  emptyOutputMessage: "agent team member returned empty output",
  defaultSummaryFallback: "情報を整理しました。",
};

// ============================================================================
// Normalized Output Types
// ============================================================================

/**
 * Result of normalizing entity output to required format.
 */
export interface NormalizedEntityOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

// ============================================================================
// Field Candidate Picker
// ============================================================================

/**
 * Options for pickFieldCandidate function.
 */
export interface PickFieldCandidateOptions {
  /** Maximum length for the candidate text */
  maxLength: number;
  /** Labels to exclude from consideration (e.g., SUMMARY:, RESULT:) */
  excludeLabels?: string[];
  /** Fallback text when no valid candidate found */
  fallback?: string;
}

/**
 * Pick a candidate text for a structured field from unstructured output.
 * Used to extract SUMMARY, CLAIM, or other field values when output
 * doesn't conform to expected format.
 *
 * Algorithm:
 * 1. Split text into non-empty lines
 * 2. Find first line that doesn't start with excluded labels
 * 3. Clean markdown formatting and extra whitespace
 * 4. Truncate to maxLength with ellipsis if needed
 *
 * @param text - Raw output text to extract candidate from
 * @param options - Configuration options
 * @returns Extracted candidate text or fallback
 */
export function pickFieldCandidate(
  text: string,
  options: PickFieldCandidateOptions,
): string {
  const { maxLength, excludeLabels = [], fallback = "Processed." } = options;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return fallback;
  }

  // Build regex pattern for excluded labels
  const labelPattern = excludeLabels.length > 0
    ? new RegExp(`^(${excludeLabels.join("|")})\\s*:`, "i")
    : null;

  // Find first line that doesn't match excluded labels
  const first =
    labelPattern
      ? lines.find((line) => !labelPattern.test(line)) ?? lines[0]
      : lines[0];

  // Clean markdown and formatting
  const compact = first
    .replace(/^[-*]\s+/, "")           // Remove list markers
    .replace(/^#{1,6}\s+/, "")         // Remove heading markers
    .replace(/\s+/g, " ")              // Normalize whitespace
    .trim();

  if (!compact) {
    return fallback;
  }

  // Truncate if needed
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength)}...`;
}

/**
 * Pick candidate text for SUMMARY field.
 * Convenience wrapper with subagent-specific defaults.
 *
 * @param text - Raw output text
 * @returns Extracted summary candidate
 */
export function pickSummaryCandidate(text: string): string {
  return pickFieldCandidate(text, {
    maxLength: 90,
    excludeLabels: ["SUMMARY", "RESULT", "NEXT_STEP"],
    fallback: SUBAGENT_CONFIG.defaultSummaryFallback,
  });
}

/**
 * Pick candidate text for CLAIM field.
 * Convenience wrapper with team-member-specific defaults.
 *
 * @param text - Raw output text
 * @returns Extracted claim candidate
 */
export function pickClaimCandidate(text: string): string {
  return pickFieldCandidate(text, {
    maxLength: 120,
    excludeLabels: ["SUMMARY", "CLAIM", "EVIDENCE", "CONFIDENCE", "RESULT", "NEXT_STEP"],
    fallback: "主張を特定できませんでした。",
  });
}

// ============================================================================
// Entity Output Normalization
// ============================================================================

/**
 * Options for normalizeEntityOutput function.
 */
export interface NormalizeEntityOutputOptions {
  /** Entity configuration for context-specific behavior */
  config: EntityConfig;
  /** Validation function to check output format */
  validateFn: (output: string) => { ok: boolean; reason?: string };
  /** Required labels for structured output */
  requiredLabels: string[];
  /** Function to extract field candidates */
  pickSummary?: (text: string) => string;
  /** Whether to include CONFIDENCE field (team member only) */
  includeConfidence?: boolean;
  /** Custom formatter for additional fields */
  formatAdditionalFields?: (text: string) => string[];
}

/**
 * Normalize entity output to required structured format.
 * When output doesn't conform to expected format, attempts to restructure
 * it while preserving the original content.
 *
 * @param output - Raw output text
 * @param options - Normalization options
 * @returns Normalized output result
 */
export function normalizeEntityOutput(
  output: string,
  options: NormalizeEntityOutputOptions,
): NormalizedEntityOutput {
  const {
    config,
    validateFn,
    requiredLabels,
    pickSummary = pickSummaryCandidate,
    includeConfidence = false,
    formatAdditionalFields,
  } = options;

  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  // Check if output already conforms to required format
  const quality = validateFn(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  // Attempt to restructure output
  const summary = pickSummary(trimmed);
  const hasIntentOnly = hasIntentOnlyContent(trimmed);

  const lines: string[] = [
    `SUMMARY: ${summary}`,
  ];

  // Add additional fields for team member format
  if (includeConfidence) {
    const claim = pickClaimCandidate(trimmed);
    const evidence = "generated-from-raw-output";
    const confidence = hasIntentOnly ? "0.40" : "0.55";
    lines.push(`CLAIM: ${claim}`);
    lines.push(`EVIDENCE: ${evidence}`);
    lines.push(`CONFIDENCE: ${confidence}`);
  }

  // Add custom fields if provided
  if (formatAdditionalFields) {
    lines.push(...formatAdditionalFields(trimmed));
  }

  // Add RESULT section
  lines.push("RESULT:");
  lines.push(trimmed);

  // Add NEXT_STEP
  const nextStep = hasIntentOnly
    ? "対象ファイルを確認し、具体的な差分を列挙する。"
    : "none";
  lines.push(`NEXT_STEP: ${nextStep}`);

  const structured = lines.join("\n");

  // Validate restructured output
  const structuredQuality = validateFn(structured);
  if (structuredQuality.ok) {
    return {
      ok: true,
      output: structured,
      degraded: true,
      reason: quality.reason ?? "normalized",
    };
  }

  return {
    ok: false,
    output: "",
    degraded: false,
    reason: quality.reason ?? structuredQuality.reason ?? "normalization failed",
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if error message indicates empty output failure.
 *
 * @param message - Error message to check
 * @param config - Entity configuration
 * @returns True if message indicates empty output
 */
export function isEmptyOutputFailureMessage(
  message: string,
  config: EntityConfig,
): boolean {
  return message.toLowerCase().includes(config.emptyOutputMessage.toLowerCase());
}

/**
 * Build a human-readable failure summary from error message.
 *
 * @param message - Error message
 * @returns Short failure summary
 */
export function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

/**
 * Resolve timeout with environment variable override support.
 *
 * @param defaultMs - Default timeout in milliseconds
 * @param envKey - Environment variable key to check
 * @returns Resolved timeout value
 */
export function resolveTimeoutWithEnv(
  defaultMs: number,
  envKey: string,
): number {
  const envValue = process.env[envKey];
  if (!envValue) return defaultMs;

  const parsed = toFiniteNumberWithDefault(envValue, defaultMs);
  return Math.max(0, Math.trunc(parsed));
}

// ============================================================================
// Parallel Capacity Resolution Types
// ============================================================================

/**
 * Reservation lease interface for dependency injection.
 * Matches RuntimeCapacityReservationLease from agent-runtime.
 */
export interface CapacityReservationLease {
  heartbeat(): void;
  release(): void;
}

/**
 * Result of an immediate capacity reservation attempt.
 */
export interface TryReserveResult {
  allowed: boolean;
  reservation?: CapacityReservationLease;
  projectedRequests: number;
  projectedLlm: number;
}

/**
 * Result of a waiting capacity reservation attempt.
 */
export interface ReserveResult extends TryReserveResult {
  reasons: string[];
  waitedMs: number;
  timedOut: boolean;
  aborted: boolean;
  attempts: number;
}

/**
 * Candidate configuration for parallel capacity resolution.
 * Each candidate specifies the parallelism level to attempt.
 */
export interface ParallelCapacityCandidate {
  /** Number of parallel entities to attempt */
  parallelism: number;
  /** Additional requests for capacity calculation */
  additionalRequests: number;
  /** Additional LLM calls for capacity calculation */
  additionalLlm: number;
}

/**
 * Options for immediate reservation function.
 */
export interface TryReserveOptions {
  toolName: string;
  additionalRequests: number;
  additionalLlm: number;
}

/**
 * Options for waiting reservation function.
 */
export interface ReserveOptions extends TryReserveOptions {
  maxWaitMs: number;
  pollIntervalMs: number;
  signal?: AbortSignal;
}

/**
 * Result of parallel capacity resolution.
 */
export interface ParallelCapacityResolution {
  /** Whether capacity was successfully reserved */
  allowed: boolean;
  /** Original requested parallelism */
  requestedParallelism: number;
  /** Actually applied parallelism (may be reduced) */
  appliedParallelism: number;
  /** Whether parallelism was reduced from requested */
  reduced: boolean;
  /** Reasons if reservation failed */
  reasons: string[];
  /** Time spent waiting for capacity */
  waitedMs: number;
  /** Whether wait timed out */
  timedOut: boolean;
  /** Whether wait was aborted */
  aborted: boolean;
  /** Number of reservation attempts made */
  attempts: number;
  /** Projected request count */
  projectedRequests: number;
  /** Projected LLM call count */
  projectedLlm: number;
  /** Reservation lease if successful */
  reservation?: CapacityReservationLease;
}

/**
 * Function signature for immediate reservation attempt.
 */
export type TryReserveFunction = (options: TryReserveOptions) => TryReserveResult;

/**
 * Function signature for waiting reservation.
 */
export type ReserveFunction = (options: ReserveOptions) => Promise<ReserveResult>;

/**
 * Options for resolveParallelCapacity function.
 */
export interface ResolveParallelCapacityOptions {
  /** Requested parallelism level */
  requestedParallelism: number;
  /** Candidates to try in order (built externally) */
  candidates: ParallelCapacityCandidate[];
  /** Tool name for reservation */
  toolName: string;
  /** Maximum wait time in milliseconds */
  maxWaitMs: number;
  /** Poll interval for waiting in milliseconds */
  pollIntervalMs: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Function to attempt immediate reservation */
  tryReserve: TryReserveFunction;
  /** Function to wait for reservation */
  reserve: ReserveFunction;
}

// ============================================================================
// Parallel Capacity Resolution
// ============================================================================

/**
 * Build parallel capacity candidates from requested parallelism.
 * Creates candidates from requested down to 1 for graceful degradation.
 *
 * @param requestedParallelism - Original requested parallelism
 * @returns Array of candidates in priority order
 */
export function buildParallelCapacityCandidates(
  requestedParallelism: number,
): ParallelCapacityCandidate[] {
  const normalized = Math.max(1, Math.trunc(requestedParallelism));
  const candidates: ParallelCapacityCandidate[] = [];

  for (let parallelism = normalized; parallelism >= 1; parallelism -= 1) {
    candidates.push({
      parallelism,
      additionalRequests: 1,
      additionalLlm: parallelism,
    });
  }

  return candidates;
}

/**
 * Resolve parallel capacity with graceful degradation.
 *
 * Algorithm:
 * 1. Try immediate reservation for each candidate (highest to lowest parallelism)
 * 2. If all immediate attempts fail, wait for minimum capacity (parallelism=1)
 * 3. Return resolution with applied parallelism and reservation
 *
 * @param options - Resolution options including candidates and reservation functions
 * @returns Resolution result with applied parallelism
 */
export async function resolveParallelCapacity(
  options: ResolveParallelCapacityOptions,
): Promise<ParallelCapacityResolution> {
  const {
    requestedParallelism,
    candidates,
    toolName,
    maxWaitMs,
    pollIntervalMs,
    signal,
    tryReserve,
    reserve,
  } = options;

  const normalizedRequested = Math.max(1, Math.trunc(requestedParallelism));
  const normalizedCandidates =
    candidates.length > 0
      ? candidates
      : buildParallelCapacityCandidates(normalizedRequested);

  // Phase 1: Try immediate reservation for each candidate
  let immediateAttempts = 0;
  for (const candidate of normalizedCandidates) {
    immediateAttempts += 1;

    const attempt = tryReserve({
      toolName,
      additionalRequests: candidate.additionalRequests,
      additionalLlm: candidate.additionalLlm,
    });

    if (attempt.allowed && attempt.reservation) {
      return {
        allowed: true,
        requestedParallelism: normalizedRequested,
        appliedParallelism: candidate.parallelism,
        reduced: candidate.parallelism < normalizedRequested,
        reasons: [],
        waitedMs: 0,
        timedOut: false,
        aborted: false,
        attempts: immediateAttempts,
        projectedRequests: attempt.projectedRequests,
        projectedLlm: attempt.projectedLlm,
        reservation: attempt.reservation,
      };
    }
  }

  // Phase 2: Wait for minimum capacity
  const fallbackCandidate = normalizedCandidates[normalizedCandidates.length - 1];
  const waitResult = await reserve({
    toolName,
    additionalRequests: fallbackCandidate.additionalRequests,
    additionalLlm: fallbackCandidate.additionalLlm,
    maxWaitMs,
    pollIntervalMs,
    signal,
  });

  if (!waitResult.allowed || !waitResult.reservation) {
    return {
      allowed: false,
      requestedParallelism: normalizedRequested,
      appliedParallelism: fallbackCandidate.parallelism,
      reduced: fallbackCandidate.parallelism < normalizedRequested,
      reasons: waitResult.reasons,
      waitedMs: waitResult.waitedMs,
      timedOut: waitResult.timedOut,
      aborted: waitResult.aborted,
      attempts: immediateAttempts + waitResult.attempts,
      projectedRequests: waitResult.projectedRequests,
      projectedLlm: waitResult.projectedLlm,
    };
  }

  return {
    allowed: true,
    requestedParallelism: normalizedRequested,
    appliedParallelism: fallbackCandidate.parallelism,
    reduced: fallbackCandidate.parallelism < normalizedRequested,
    reasons: [],
    waitedMs: waitResult.waitedMs,
    timedOut: false,
    aborted: false,
    attempts: immediateAttempts + waitResult.attempts,
    projectedRequests: waitResult.projectedRequests,
    projectedLlm: waitResult.projectedLlm,
    reservation: waitResult.reservation,
  };
}
