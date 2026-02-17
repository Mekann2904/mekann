// File: .pi/extensions/subagents/task-execution.ts
// Description: Subagent task execution logic.
// Why: Separates task execution logic from main subagents.ts for maintainability.
// Related: .pi/extensions/subagents.ts, .pi/extensions/subagents/storage.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  trimForError,
  buildRateLimitKey,
} from "../../lib/runtime-utils.js";
import {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
} from "../../lib/error-utils.js";
import {
  createRunId,
} from "../../lib/agent-utils.js";
import {
  type ThinkingLevel,
  type RunOutcomeCode,
  type RunOutcomeSignal,
} from "../../lib/agent-types.js";
import {
  validateSubagentOutput,
} from "../../lib/output-validation.js";
import { SchemaValidationError } from "../../lib/errors.js";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import { getSubagentExecutionRules } from "../../lib/execution-rules";
import {
  isRetryableError,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../../lib/retry-with-backoff";
import { getRateLimitGateSnapshot } from "../../lib/retry-with-backoff";
import { runPiPrintMode as sharedRunPiPrintMode, type PrintCommandResult } from "../shared/pi-print-executor";

import type { SubagentDefinition, SubagentRunRecord, SubagentPaths } from "./storage";
import { ensurePaths } from "./storage";

// Re-export types
export type { RunOutcomeCode, RunOutcomeSignal };

// ============================================================================
// Types
// ============================================================================

export interface SubagentExecutionResult {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

// ============================================================================
// Output Normalization
// ============================================================================

/**
 * Pick a candidate text for SUMMARY field from unstructured output.
 * Note: Kept locally because the summary format is subagent-specific.
 */
function pickSubagentSummaryCandidate(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "回答を整形しました。";

  const first =
    lines.find((line) => !/^(SUMMARY|RESULT|NEXT_STEP)\s*:/i.test(line)) ?? lines[0];
  const compact = first
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "回答を整形しました。";
  return compact.length <= 90 ? compact : `${compact.slice(0, 90)}...`;
}

/**
 * Normalize subagent output to required format.
 * Note: Kept locally (not in lib) because:
 * - Uses subagent-specific SUMMARY/RESULT/NEXT_STEP format
 * - Has subagent-specific fallback messages (Japanese)
 * - Uses pickSubagentSummaryCandidate which is subagent-specific
 * Team member output has different requirements (CLAIM/EVIDENCE/CONFIDENCE).
 */
export function normalizeSubagentOutput(output: string): SubagentExecutionResult {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  const quality = validateSubagentOutput(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  const summary = pickSubagentSummaryCandidate(trimmed);
  const structured = [
    `SUMMARY: ${summary}`,
    "",
    "RESULT:",
    trimmed,
    "",
    "NEXT_STEP: none",
  ].join("\n");
  const structuredQuality = validateSubagentOutput(structured);
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
// Failure Resolution
// ============================================================================

export function isRetryableSubagentError(error: unknown, statusCode?: number): boolean {
  if (isRetryableError(error, statusCode)) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("subagent returned empty output");
}

export function isEmptyOutputFailureMessage(message: string): boolean {
  return message.toLowerCase().includes("subagent returned empty output");
}

export function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

export function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal {
  if (isCancelledErrorMessage(error)) {
    return { outcomeCode: "CANCELLED", retryRecommended: false };
  }
  if (isTimeoutErrorMessage(error)) {
    return { outcomeCode: "TIMEOUT", retryRecommended: true };
  }

  const pressure = classifyPressureError(error);
  if (pressure !== "other") {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  const statusCode = extractStatusCodeFromMessage(error);
  if (isRetryableSubagentError(error, statusCode)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Merge skill arrays following inheritance rules.
 * - Empty array [] is treated as unspecified (ignored)
 * - Non-empty arrays are merged with deduplication
 */
export function mergeSkillArrays(base: string[] | undefined, override: string[] | undefined): string[] | undefined {
  const hasBase = Array.isArray(base) && base.length > 0;
  const hasOverride = Array.isArray(override) && override.length > 0;

  if (!hasBase && !hasOverride) return undefined;
  if (!hasBase) return override;
  if (!hasOverride) return base;

  const merged = [...base];
  for (const skill of override) {
    if (!merged.includes(skill)) {
      merged.push(skill);
    }
  }
  return merged;
}

/**
 * Resolve effective skills for a subagent.
 * Inheritance: parentSkills (if any) -> agent.skills
 */
export function resolveEffectiveSkills(
  agent: SubagentDefinition,
  parentSkills?: string[],
): string[] | undefined {
  return mergeSkillArrays(parentSkills, agent.skills);
}

/**
 * Format skill list for prompt inclusion.
 */
export function formatSkillsSection(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => `- ${skill}`).join("\n");
}

export function buildSubagentPrompt(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
  parentSkills?: string[];
}): string {
  const lines: string[] = [];
  lines.push(`You are running as delegated subagent: ${input.agent.name} (${input.agent.id}).`);
  lines.push(`Role description: ${input.agent.description}`);
  lines.push("");
  lines.push("Subagent operating instructions:");
  lines.push(input.agent.systemPrompt);

  // Resolve and include skills
  const effectiveSkills = resolveEffectiveSkills(input.agent, input.parentSkills);
  const skillsSection = formatSkillsSection(effectiveSkills);
  if (skillsSection) {
    lines.push("");
    lines.push("Assigned skills:");
    lines.push(skillsSection);
  }

  lines.push("");
  lines.push("Task from lead agent:");
  lines.push(input.task);

  if (input.extraContext?.trim()) {
    lines.push("");
    lines.push("Extra context:");
    lines.push(input.extraContext.trim());
  }

  // Subagent plan mode enforcement
  if (input.enforcePlanMode) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getSubagentExecutionRules(true));

  lines.push("");
  lines.push("Output format (strict):");
  lines.push("SUMMARY: <short summary>");
  lines.push("CLAIM: <1-sentence core claim (optional, for research/analysis tasks)>");
  lines.push("EVIDENCE: <comma-separated evidence with file:line references where possible (optional)>");
  lines.push("DISCUSSION: <when working with other agents: references to their outputs, agreements/disagreements, consensus (optional)>");
  lines.push("RESULT:");
  lines.push("<main answer>");
  lines.push("NEXT_STEP: <specific next action or none>");

  return lines.join("\n");
}

// ============================================================================
// Execution
// ============================================================================

async function runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<PrintCommandResult> {
  return sharedRunPiPrintMode({
    ...input,
    entityLabel: "subagent",
  });
}

export async function runSubagentTask(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
  modelProvider?: string;
  modelId?: string;
  parentSkills?: string[];
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<{ runRecord: SubagentRunRecord; output: string; prompt: string }> {
  const runId = createRunId();
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const paths = ensurePaths(input.cwd);
  const outputFile = join(paths.runsDir, `${runId}.json`);

  // Check if plan mode is active (via environment variable set by plan.ts)
  const planModeActive = isPlanModeActive();

  const prompt = buildSubagentPrompt({
    agent: input.agent,
    task: input.task,
    extraContext: input.extraContext,
    enforcePlanMode: planModeActive,
    parentSkills: input.parentSkills,
  });
  const resolvedProvider = input.agent.provider ?? input.modelProvider ?? "(session-default)";
  const resolvedModel = input.agent.model ?? input.modelId ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  let retryCount = 0;
  let lastRetryStatusCode: number | undefined;
  let lastRetryMessage = "";
  let lastRateLimitWaitMs = 0;
  let lastRateLimitHits = 0;
  let rateLimitGateLogged = false;
  let rateLimitStderrLogged = false;
  const emitStderrChunk = (chunk: string) => {
    const isRateLimitChunk = /429|rate\s*limit|too many requests/i.test(chunk);
    if (isRateLimitChunk) {
      if (rateLimitStderrLogged) {
        return;
      }
      rateLimitStderrLogged = true;
    }
    input.onStderrChunk?.(chunk);
  };

  input.onStart?.();
  try {
    try {
      const commandResult = await retryWithBackoff(
        async () => {
          const result = await runPiPrintMode({
            provider: input.agent.provider ?? input.modelProvider,
            model: input.agent.model ?? input.modelId,
            prompt,
            timeoutMs: input.timeoutMs,
            signal: input.signal,
            onTextDelta: input.onTextDelta,
            onStderrChunk: emitStderrChunk,
          });
          const normalized = normalizeSubagentOutput(result.output);
          if (!normalized.ok) {
            throw new SchemaValidationError(`subagent low-substance output: ${normalized.reason}`, {
              violations: [normalized.reason ?? "unknown"],
              field: "output",
            });
          }
          if (normalized.degraded) {
            emitStderrChunk(
              `[normalize] subagent output normalized: reason=${normalized.reason || "format-mismatch"}\n`,
            );
          }
          return {
            output: normalized.output,
            latencyMs: result.latencyMs,
          };
        },
        {
          cwd: input.cwd,
          overrides: input.retryOverrides,
          signal: input.signal,
          rateLimitKey,
          maxRateLimitRetries: 3,
          maxRateLimitWaitMs: 120000,
          onRateLimitWait: ({ waitMs, hits }) => {
            lastRateLimitWaitMs = waitMs;
            lastRateLimitHits = hits;
            if (!rateLimitGateLogged) {
              rateLimitGateLogged = true;
              emitStderrChunk(
                `[rate-limit-gate] provider=${resolvedProvider} model=${resolvedModel} wait=${waitMs}ms hits=${hits}\n`,
              );
            }
          },
          shouldRetry: (error, statusCode) => isRetryableSubagentError(error, statusCode),
          onRetry: ({ attempt, statusCode, error }) => {
            retryCount = attempt;
            lastRetryStatusCode = statusCode;
            lastRetryMessage = trimForError(toErrorMessage(error), 160);
            const shouldLog =
              statusCode !== 429 || attempt === 1;
            if (shouldLog) {
              const errorText = statusCode === 429 ? "rate limit" : lastRetryMessage;
              emitStderrChunk(
                `[retry] attempt=${attempt} status=${statusCode ?? "-"} error=${errorText}\n`,
              );
            }
          },
        },
      );

      const summary = extractSummary(commandResult.output);
      const finishedAt = new Date().toISOString();

      const runRecord: SubagentRunRecord = {
        runId,
        agentId: input.agent.id,
        task: input.task,
        summary,
        status: "completed",
        startedAt,
        finishedAt,
        latencyMs: commandResult.latencyMs,
        outputFile,
      };

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            prompt,
            output: commandResult.output,
          },
          null,
          2,
        ),
        "utf-8",
      );

      return {
        runRecord,
        output: commandResult.output,
        prompt,
      };
    } catch (error) {
      let message = toErrorMessage(error);

      const gateSnapshot = getRateLimitGateSnapshot(rateLimitKey);
      const diagnostic = [
        `provider=${resolvedProvider}`,
        `model=${resolvedModel}`,
        `retries=${retryCount}`,
        lastRetryStatusCode !== undefined ? `last_status=${lastRetryStatusCode}` : "",
        lastRetryMessage ? `last_retry_error=${lastRetryMessage}` : "",
        lastRateLimitWaitMs > 0 ? `last_gate_wait_ms=${lastRateLimitWaitMs}` : "",
        lastRateLimitHits > 0 ? `last_gate_hits=${lastRateLimitHits}` : "",
        `gate_wait_ms=${gateSnapshot.waitMs}`,
        `gate_hits=${gateSnapshot.hits}`,
      ]
        .filter(Boolean)
        .join(" ");
      if (diagnostic) {
        message = `${message} | ${diagnostic}`;
      }

      const finishedAt = new Date().toISOString();
      const runRecord: SubagentRunRecord = {
        runId,
        agentId: input.agent.id,
        task: input.task,
        summary: buildFailureSummary(message),
        status: "failed",
        startedAt,
        finishedAt,
        latencyMs: Math.max(0, Date.now() - startedAtMs),
        outputFile,
        error: message,
      };

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            prompt,
            output: "",
            error: message,
          },
          null,
          2,
        ),
        "utf-8",
      );

      return {
        runRecord,
        output: "",
        prompt,
      };
    }
  } finally {
    input.onEnd?.();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function extractSummary(output: string): string {
  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }

  const first = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!first) {
    return "(no summary)";
  }

  return first.length > 120 ? `${first.slice(0, 120)}...` : first;
}
