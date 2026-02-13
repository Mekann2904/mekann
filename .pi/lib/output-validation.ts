/**
 * Output validation utilities for subagent and team member outputs.
 * Provides consistent validation for structured output format compliance.
 */

/**
 * Check if output contains only intent statements without actual content.
 * Detects both English and Japanese intent-only patterns.
 * @param output - Output text to check
 * @returns True if output is intent-only (no actual content)
 */
export function hasIntentOnlyContent(output: string): boolean {
  const compact = output.replace(/\s+/g, " ").trim();
  if (!compact) return false;
  const lower = compact.toLowerCase();
  const enIntentOnly =
    (lower.startsWith("i'll ") || lower.startsWith("i will ") || lower.startsWith("let me ")) &&
    /(analy|review|investig|start|check|examin|look)/.test(lower);
  const jaIntentOnly =
    /(確認|調査|分析|レビュー|検討|開始).{0,20}(します|します。|していきます|しますね|します。)/.test(compact);
  return enIntentOnly || jaIntentOnly;
}

/**
 * Check if output has non-empty RESULT section.
 * @param output - Output text to check
 * @returns True if RESULT section has content
 */
export function hasNonEmptyResultSection(output: string): boolean {
  const lines = output.split(/\r?\n/);
  const resultIndex = lines.findIndex((line) => /^\s*RESULT\s*:/i.test(line));
  if (resultIndex < 0) return false;

  const sameLineContent = lines[resultIndex].replace(/^\s*RESULT\s*:/i, "").trim();
  if (sameLineContent.length > 0) return true;

  for (let index = resultIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*[A-Z_]+\s*:/.test(line)) break;
    if (line.trim().length > 0) return true;
  }

  return false;
}

/**
 * Validation options for subagent output.
 */
export interface SubagentValidationOptions {
  minChars: number;
  requiredLabels: string[];
}

const SUBAGENT_DEFAULT_OPTIONS: SubagentValidationOptions = {
  minChars: 48,
  requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"],
};

/**
 * Validate subagent output format and content.
 * @param output - Output text to validate
 * @param options - Validation options (optional)
 * @returns Validation result with ok status and optional reason
 */
export function validateSubagentOutput(
  output: string,
  options?: Partial<SubagentValidationOptions>,
): { ok: boolean; reason?: string } {
  const opts = { ...SUBAGENT_DEFAULT_OPTIONS, ...options };
  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty output" };
  }

  if (trimmed.length < opts.minChars) {
    return { ok: false, reason: `too short (${trimmed.length} chars)` };
  }

  const missingLabels = opts.requiredLabels.filter(
    (label) => !new RegExp(`^\\s*${label}`, "im").test(trimmed),
  );
  if (missingLabels.length > 0) {
    return { ok: false, reason: `missing labels: ${missingLabels.join(", ")}` };
  }

  if (!hasNonEmptyResultSection(trimmed)) {
    return { ok: false, reason: "empty RESULT section" };
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (nonEmptyLines.length <= 3 && hasIntentOnlyContent(trimmed)) {
    return { ok: false, reason: "intent-only output" };
  }

  return { ok: true };
}

/**
 * Validation options for team member output.
 */
export interface TeamMemberValidationOptions {
  minChars: number;
  requiredLabels: string[];
}

const TEAM_MEMBER_DEFAULT_OPTIONS: TeamMemberValidationOptions = {
  minChars: 80,
  requiredLabels: ["SUMMARY:", "CLAIM:", "EVIDENCE:", "CONFIDENCE:", "RESULT:", "NEXT_STEP:"],
};

/**
 * Validate team member output format and content.
 * Team member output requires more labels and longer content than subagent.
 * @param output - Output text to validate
 * @param options - Validation options (optional)
 * @returns Validation result with ok status and optional reason
 */
export function validateTeamMemberOutput(
  output: string,
  options?: Partial<TeamMemberValidationOptions>,
): { ok: boolean; reason?: string } {
  const opts = { ...TEAM_MEMBER_DEFAULT_OPTIONS, ...options };
  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty output" };
  }

  if (trimmed.length < opts.minChars) {
    return { ok: false, reason: `too short (${trimmed.length} chars)` };
  }

  const missingLabels = opts.requiredLabels.filter(
    (label) => !new RegExp(`^\\s*${label}`, "im").test(trimmed),
  );
  if (missingLabels.length > 0) {
    return { ok: false, reason: `missing labels: ${missingLabels.join(", ")}` };
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (nonEmptyLines.length <= 4 && hasIntentOnlyContent(trimmed)) {
    return { ok: false, reason: "intent-only output" };
  }

  return { ok: true };
}
