/**
 * Shared agent common utilities.
 * Provides unified constants and functions for subagent and team member execution.
 * Eliminates code duplication between subagents.ts and agent-teams.ts.
 *
 * Layer: 1 (depends on Layer 0: error-utils, validation-utils, format-utils)
 */

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

  const lines: string[] = [
    `SUMMARY: ${summary}`,
  ];

  // Add additional fields for team member format
  if (includeConfidence) {
    const claim = pickClaimCandidate(trimmed);
    lines.push(`CLAIM: ${claim}`);
    lines.push("EVIDENCE: not-provided");
  }

  // Add custom fields if provided
  if (formatAdditionalFields) {
    lines.push(...formatAdditionalFields(trimmed));
  }

  // Add RESULT section
  lines.push("RESULT:");
  lines.push(trimmed);

  // Add NEXT_STEP
  lines.push("NEXT_STEP: none");

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


