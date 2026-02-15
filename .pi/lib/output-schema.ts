/**
 * Structured output schema definitions and validation.
 * Provides JSON Schema-like validation for subagent and team member outputs.
 *
 * Feature Flag: PI_OUTPUT_SCHEMA_MODE
 * - "legacy" (default): Use regex-based validation only
 * - "dual": Run both regex and schema validation, log differences
 * - "strict": Use schema validation only
 *
 * Related: output-validation.ts, agent-teams/judge.ts
 */

import {
  extractField,
  parseUnitInterval,
  clampConfidence,
} from "./text-parsing.js";

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Validation mode for output schema checking.
 */
export type SchemaValidationMode = "legacy" | "dual" | "strict";

/**
 * Schema field definition.
 */
interface SchemaField {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  type: "string" | "number" | "string[]";
}

/**
 * Schema definition for structured output.
 */
interface OutputSchema {
  [fieldName: string]: SchemaField;
}

/**
 * Schema validation result.
 */
export interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
  violations: SchemaViolation[];
  fallbackUsed: boolean;
  parsed?: ParsedStructuredOutput;
}

/**
 * Individual schema violation.
 */
export interface SchemaViolation {
  field: string;
  violationType: "missing" | "too_short" | "too_long" | "pattern_mismatch" | "out_of_range" | "invalid_type";
  expected: string;
  actual?: string;
}

/**
 * Parsed structured output.
 */
export interface ParsedStructuredOutput {
  SUMMARY: string;
  CLAIM?: string;
  EVIDENCE?: string;
  CONFIDENCE?: number;
  DISCUSSION?: string;
  RESULT: string;
  NEXT_STEP?: string;
}

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema for subagent output.
 * Required: SUMMARY, RESULT
 * Optional: NEXT_STEP
 */
const SUBAGENT_OUTPUT_SCHEMA: OutputSchema = {
  SUMMARY: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 500,
  },
  RESULT: {
    type: "string",
    required: true,
    minLength: 20,
    maxLength: 10000,
  },
  NEXT_STEP: {
    type: "string",
    required: false,
    maxLength: 500,
  },
};

/**
 * Schema for team member output.
 * Required: SUMMARY, CLAIM, EVIDENCE, CONFIDENCE, RESULT, NEXT_STEP
 */
const TEAM_MEMBER_OUTPUT_SCHEMA: OutputSchema = {
  SUMMARY: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 300,
  },
  CLAIM: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 500,
  },
  EVIDENCE: {
    type: "string",
    required: true,
    minLength: 5,
    maxLength: 2000,
  },
  CONFIDENCE: {
    type: "number",
    required: true,
    min: 0,
    max: 1,
  },
  DISCUSSION: {
    type: "string",
    required: false,
    maxLength: 3000,
  },
  RESULT: {
    type: "string",
    required: true,
    minLength: 20,
    maxLength: 10000,
  },
  NEXT_STEP: {
    type: "string",
    required: true,
    maxLength: 500,
  },
};

// ============================================================================
// Feature Flag Management
// ============================================================================

/**
 * Communication ID mode for structured output processing.
 * - "legacy" (default): No structured claim/evidence IDs
 * - "structured": Enable claim and evidence ID tracking
 */
export type CommunicationIdMode = "legacy" | "structured";

/**
 * Cache for communication ID mode.
 */
let cachedCommunicationIdMode: CommunicationIdMode | undefined;

/**
 * Get the current communication ID mode.
 * Reads from PI_COMMUNICATION_ID_MODE environment variable.
 *
 * @returns Current communication ID mode
 */
export function getCommunicationIdMode(): CommunicationIdMode {
  if (cachedCommunicationIdMode !== undefined) {
    return cachedCommunicationIdMode;
  }

  const envMode = process.env.PI_COMMUNICATION_ID_MODE?.toLowerCase();
  if (envMode === "structured") {
    cachedCommunicationIdMode = "structured";
  } else {
    // Default: legacy mode for backward compatibility
    cachedCommunicationIdMode = "legacy";
  }

  return cachedCommunicationIdMode;
}

/**
 * Reset the cached communication ID mode (primarily for testing).
 */
export function resetCommunicationIdModeCache(): void {
  cachedCommunicationIdMode = undefined;
}

/**
 * Set communication ID mode at runtime (primarily for testing).
 */
export function setCommunicationIdMode(mode: CommunicationIdMode): void {
  cachedCommunicationIdMode = mode;
}

/**
 * Cache for schema validation mode.
 */
let cachedMode: SchemaValidationMode | undefined;

/**
 * Get the current schema validation mode.
 * Reads from PI_OUTPUT_SCHEMA_MODE environment variable.
 *
 * MIGRATION COMPLETE: Default is now "strict" (v2.0.0+)
 * - "legacy": Use regex-based validation only (deprecated)
 * - "dual": Run both regex and schema validation, log differences
 * - "strict": Use schema validation only (default)
 *
 * @returns Current validation mode
 */
export function getSchemaValidationMode(): SchemaValidationMode {
  if (cachedMode !== undefined) {
    return cachedMode;
  }

  const envMode = process.env.PI_OUTPUT_SCHEMA_MODE?.toLowerCase();
  if (envMode === "legacy") {
    cachedMode = "legacy";
  } else if (envMode === "dual") {
    cachedMode = "dual";
  } else {
    // Default: strict mode (migration complete)
    cachedMode = "strict";
  }

  return cachedMode;
}

/**
 * Reset the cached schema validation mode (primarily for testing).
 */
export function resetSchemaValidationModeCache(): void {
  cachedMode = undefined;
}

/**
 * Set schema validation mode at runtime (primarily for testing).
 */
export function setSchemaValidationMode(mode: SchemaValidationMode): void {
  cachedMode = mode;
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Parse structured output text into a structured object.
 *
 * @param output - Raw output text
 * @returns Parsed structured output
 */
export function parseStructuredOutput(output: string): ParsedStructuredOutput {
  const parsed: ParsedStructuredOutput = {
    SUMMARY: extractField(output, "SUMMARY") || "",
    RESULT: extractField(output, "RESULT") || "",
  };

  const claim = extractField(output, "CLAIM");
  if (claim) parsed.CLAIM = claim;

  const evidence = extractField(output, "EVIDENCE");
  if (evidence) parsed.EVIDENCE = evidence;

  const confidenceRaw = extractField(output, "CONFIDENCE");
  if (confidenceRaw) {
    parsed.CONFIDENCE = parseUnitInterval(confidenceRaw);
  }

  const discussion = extractField(output, "DISCUSSION");
  if (discussion) parsed.DISCUSSION = discussion;

  const nextStep = extractField(output, "NEXT_STEP");
  if (nextStep) parsed.NEXT_STEP = nextStep;

  return parsed;
}

/**
 * Validate a single field against its schema definition.
 *
 * @param fieldName - Field name
 * @param value - Field value
 * @param schema - Schema definition for the field
 * @returns Array of violations (empty if valid)
 */
function validateField(
  fieldName: string,
  value: unknown,
  schema: SchemaField,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  // Check required
  if (schema.required && (value === undefined || value === null || value === "")) {
    violations.push({
      field: fieldName,
      violationType: "missing",
      expected: "required field",
    });
    return violations;
  }

  // Skip further validation if optional and missing
  if (value === undefined || value === null || value === "") {
    return violations;
  }

  // Type validation
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      violations.push({
        field: fieldName,
        violationType: "invalid_type",
        expected: "number",
        actual: String(value),
      });
      return violations;
    }

    // Range validation
    if (schema.min !== undefined && value < schema.min) {
      violations.push({
        field: fieldName,
        violationType: "out_of_range",
        expected: `>= ${schema.min}`,
        actual: String(value),
      });
    }
    if (schema.max !== undefined && value > schema.max) {
      violations.push({
        field: fieldName,
        violationType: "out_of_range",
        expected: `<= ${schema.max}`,
        actual: String(value),
      });
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") {
      violations.push({
        field: fieldName,
        violationType: "invalid_type",
        expected: "string",
        actual: String(value),
      });
      return violations;
    }

    // Length validation
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      violations.push({
        field: fieldName,
        violationType: "too_short",
        expected: `min ${schema.minLength} chars`,
        actual: `${value.length} chars`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      violations.push({
        field: fieldName,
        violationType: "too_long",
        expected: `max ${schema.maxLength} chars`,
        actual: `${value.length} chars`,
      });
    }

    // Pattern validation
    if (schema.pattern && !schema.pattern.test(value)) {
      violations.push({
        field: fieldName,
        violationType: "pattern_mismatch",
        expected: `pattern ${schema.pattern}`,
        actual: value.slice(0, 50),
      });
    }
  }

  return violations;
}

/**
 * Validate parsed output against a schema.
 *
 * @param parsed - Parsed output object
 * @param schema - Schema to validate against
 * @returns Array of violations (empty if valid)
 */
function validateAgainstSchema(
  parsed: ParsedStructuredOutput,
  schema: OutputSchema,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = (parsed as unknown as Record<string, unknown>)[fieldName];
    const fieldViolations = validateField(fieldName, value, fieldSchema);
    violations.push(...fieldViolations);
  }

  return violations;
}

/**
 * Validate subagent output with schema.
 *
 * @param output - Raw output text
 * @param mode - Validation mode (defaults to current setting)
 * @returns Validation result with violations and fallback flag
 */
export function validateSubagentOutputWithSchema(
  output: string,
  mode: SchemaValidationMode = getSchemaValidationMode(),
): SchemaValidationResult {
  const parsed = parseStructuredOutput(output);
  const violations = validateAgainstSchema(parsed, SUBAGENT_OUTPUT_SCHEMA);

  const ok = violations.length === 0;
  const reason = ok
    ? undefined
    : `schema violations: ${violations.map((v) => `${v.field}:${v.violationType}`).join(", ")}`;

  return {
    ok,
    reason,
    violations,
    fallbackUsed: false,
    parsed: ok ? parsed : undefined,
  };
}

/**
 * Validate team member output with schema.
 *
 * @param output - Raw output text
 * @param mode - Validation mode (defaults to current setting)
 * @returns Validation result with violations and fallback flag
 */
export function validateTeamMemberOutputWithSchema(
  output: string,
  mode: SchemaValidationMode = getSchemaValidationMode(),
): SchemaValidationResult {
  const parsed = parseStructuredOutput(output);
  const violations = validateAgainstSchema(parsed, TEAM_MEMBER_OUTPUT_SCHEMA);

  const ok = violations.length === 0;
  const reason = ok
    ? undefined
    : `schema violations: ${violations.map((v) => `${v.field}:${v.violationType}`).join(", ")}`;

  return {
    ok,
    reason,
    violations,
    fallbackUsed: false,
    parsed: ok ? parsed : undefined,
  };
}

// ============================================================================
// Violation Tracking (for analytics and debugging)
// ============================================================================

/**
 * Global violation counter for analytics.
 */
const violationStats: Map<string, number> = new Map();

/**
 * Record a schema violation for analytics.
 *
 * @param violation - Violation to record
 */
export function recordSchemaViolation(violation: SchemaViolation): void {
  const key = `${violation.field}:${violation.violationType}`;
  const current = violationStats.get(key) || 0;
  violationStats.set(key, current + 1);
}

/**
 * Get schema violation statistics.
 *
 * @returns Map of violation key to count
 */
export function getSchemaViolationStats(): Map<string, number> {
  return new Map(violationStats);
}

/**
 * Reset schema violation statistics.
 */
export function resetSchemaViolationStats(): void {
  violationStats.clear();
}

// ============================================================================
// Exports
// ============================================================================

export const SCHEMAS = {
  subagent: SUBAGENT_OUTPUT_SCHEMA,
  teamMember: TEAM_MEMBER_OUTPUT_SCHEMA,
} as const;
