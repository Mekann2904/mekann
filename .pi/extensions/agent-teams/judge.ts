/**
 * Agent team judge module.
 * Handles uncertainty calculation and final judgment logic.
 *
 * Extracted from agent-teams.ts for SRP compliance.
 * Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts
 */

import type {
  TeamDefinition,
  TeamFinalJudge,
  TeamMemberResult,
  TeamStrategy,
} from "./storage";

// Re-export types for external use
export type {
  TeamDefinition,
  TeamFinalJudge,
  TeamMemberResult,
  TeamStrategy,
};

/**
 * Uncertainty proxy computed from member results.
 * Used to assess overall team output quality and reliability.
 */
export interface TeamUncertaintyProxy {
  /** Intra-member uncertainty (internal inconsistency) */
  uIntra: number;
  /** Inter-member uncertainty (disagreement between members) */
  uInter: number;
  /** System-level uncertainty (combined measure) */
  uSys: number;
  /** Signals that triggered collapse conditions */
  collapseSignals: string[];
}

/**
 * Clamp a confidence value to the valid range [0, 1].
 * Invalid values default to 0.5 (neutral).
 */
export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/**
 * Parse a unit interval value from a string.
 * Handles both decimal (0.5) and percentage (50%) formats.
 * Returns undefined for invalid or empty input.
 */
export function parseUnitInterval(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;

  const percent = value.endsWith("%");
  const numeric = Number.parseFloat(percent ? value.slice(0, -1) : value);
  if (!Number.isFinite(numeric)) return undefined;

  if (percent || numeric > 1) {
    return clampConfidence(numeric / 100);
  }
  return clampConfidence(numeric);
}

/**
 * Extract a named field from structured output text.
 * Matches patterns like "FIELD_NAME: value" (case-insensitive).
 */
export function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

/**
 * Extract the DISCUSSION section from structured output.
 * Returns content between DISCUSSION: label and the next major label.
 */
export function extractDiscussionSection(output: string): string {
  const discussionPattern = /^DISCUSSION\s*:\s*$/im;
  const lines = output.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => discussionPattern.test(line));

  if (startIndex === -1) {
    return "";
  }

  const discussionLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next major label (SUMMARY, CLAIM, EVIDENCE, etc.)
    if (/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP)\s*:/i.test(line)) {
      break;
    }
    discussionLines.push(line);
  }

  return discussionLines.join("\n");
}

/**
 * Count how many keywords appear in the output text.
 * Used for signal detection in member outputs.
 */
export function countKeywordSignals(output: string, keywords: string[]): number {
  const lowered = output.toLowerCase();
  let count = 0;
  for (const keyword of keywords) {
    if (lowered.includes(keyword.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

/**
 * Count evidence signals in the output.
 * Looks for EVIDENCE field items and file:line references.
 */
export function countEvidenceSignals(output: string): number {
  let count = 0;

  const evidenceField = extractField(output, "EVIDENCE");
  if (evidenceField) {
    const items = evidenceField
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    count += items.length;
  }

  const fileRefs = output.match(/\b[\w./-]+\.[a-z]{1,8}:\d+\b/gi);
  if (fileRefs) {
    count += fileRefs.length;
  }

  return Math.max(0, Math.min(50, count));
}

/**
 * Analyze a team member's output for quality signals.
 * Returns diagnostic metrics for uncertainty calculation.
 */
export function analyzeMemberOutput(output: string): TeamMemberResult["diagnostics"] {
  const confidence = parseUnitInterval(extractField(output, "CONFIDENCE")) ?? 0.5;
  const evidenceCount = countEvidenceSignals(output);
  const contradictionSignals = countKeywordSignals(output, [
    "self-contradict",
    "contradict",
    "inconsistent",
    "\u{7F3A}\u{76F8}", // 矛盾
    "\u{81EA}\u{5DF1}\u{7F3A}\u{76F8}", // 自己矛盾
  ]);
  const conflictSignals = countKeywordSignals(output, [
    "disagree",
    "conflict",
    "not aligned",
    "\u{5BFE}\u{7ACB}", // 対立
    "\u{4E0D}\u{4E00}\u{81F4}", // 不一致
    "\u{610F}\u{898B}\u{304C}\u{5272}\u{308C}", // 意見が割れ
  ]);

  return {
    confidence,
    evidenceCount,
    contradictionSignals,
    conflictSignals,
  };
}

/**
 * Compute uncertainty proxy from team member results.
 * Calculates intra-member, inter-member, and system-level uncertainty.
 */
export function computeProxyUncertainty(memberResults: TeamMemberResult[]): TeamUncertaintyProxy {
  const total = Math.max(1, memberResults.length);
  const failedCount = memberResults.filter((result) => result.status === "failed").length;
  const failedRatio = failedCount / total;

  const confidences = memberResults.map((result) => result.diagnostics?.confidence ?? 0.5);
  const meanConfidence = confidences.reduce((sum, value) => sum + value, 0) / total;
  const lowConfidence = 1 - meanConfidence;

  const noEvidenceRatio =
    memberResults.filter((result) => (result.diagnostics?.evidenceCount ?? 0) <= 0).length / total;
  const contradictionRatio =
    memberResults.filter((result) => (result.diagnostics?.contradictionSignals ?? 0) > 0).length / total;
  const conflictRatio =
    memberResults.filter((result) => (result.diagnostics?.conflictSignals ?? 0) > 0).length / total;

  const variance =
    confidences.reduce((sum, value) => sum + (value - meanConfidence) ** 2, 0) / total;
  const confidenceSpread = clampConfidence(Math.sqrt(Math.max(0, variance)) / 0.5);

  const uIntra = clampConfidence(
    0.38 * failedRatio + 0.26 * lowConfidence + 0.2 * noEvidenceRatio + 0.16 * contradictionRatio,
  );
  const uInter = clampConfidence(
    0.42 * conflictRatio + 0.28 * confidenceSpread + 0.2 * failedRatio + 0.1 * noEvidenceRatio,
  );
  const uSys = clampConfidence(0.45 * uIntra + 0.35 * uInter + 0.2 * failedRatio);

  const collapseSignals: string[] = [];
  if (uIntra >= 0.55) collapseSignals.push("high_intra_uncertainty");
  if (uInter >= 0.55) collapseSignals.push("high_inter_disagreement");
  if (uSys >= 0.6) collapseSignals.push("high_system_uncertainty");
  if (failedRatio >= 0.3) collapseSignals.push("teammate_failures");
  if (noEvidenceRatio >= 0.5) collapseSignals.push("insufficient_evidence");

  return {
    uIntra,
    uInter,
    uSys,
    collapseSignals,
  };
}

/**
 * Build a fallback judge verdict when no LLM-based judgment is available.
 * Uses deterministic rules based on uncertainty proxy.
 */
export function buildFallbackJudge(input: {
  memberResults: TeamMemberResult[];
  proxy?: TeamUncertaintyProxy;
  error?: string;
}): TeamFinalJudge {
  const proxy = input.proxy ?? computeProxyUncertainty(input.memberResults);
  const failed = input.memberResults.filter((result) => result.status === "failed").length;
  const total = input.memberResults.length;

  if (total === 0 || failed === total) {
    return {
      verdict: "untrusted",
      confidence: 0.1,
      reason: input.error || "No successful teammate output was available for reliable judgment.",
      nextStep: "Re-run the team and ensure at least one high-quality output is produced.",
      uIntra: 1,
      uInter: 1,
      uSys: 1,
      collapseSignals: ["no_successful_output"],
      rawOutput: input.error || "",
    };
  }

  if (proxy.uSys >= 0.6 || failed > 0) {
    return {
      verdict: "partial",
      confidence: clampConfidence(1 - proxy.uSys),
      reason:
        input.error ||
        `Result reliability is partial (uSys=${proxy.uSys.toFixed(2)}, failures=${failed}/${total}).`,
      nextStep: "Re-check contested claims with one focused follow-up run.",
      uIntra: proxy.uIntra,
      uInter: proxy.uInter,
      uSys: proxy.uSys,
      collapseSignals: proxy.collapseSignals,
      rawOutput: input.error || "",
    };
  }

  return {
    verdict: "trusted",
    confidence: clampConfidence(1 - proxy.uSys * 0.6),
    reason: "All teammates completed and no runtime failures were reported.",
    nextStep: "Proceed, but validate high-impact claims with direct evidence if needed.",
    uIntra: proxy.uIntra,
    uInter: proxy.uInter,
    uSys: proxy.uSys,
    collapseSignals: proxy.collapseSignals,
    rawOutput: input.error || "",
  };
}

/**
 * Run the final judge process.
 * In stable profile mode, this uses deterministic fallback logic without LLM calls.
 */
export async function runFinalJudge(input: {
  team: TeamDefinition;
  task: string;
  strategy: TeamStrategy;
  memberResults: TeamMemberResult[];
  proxy: TeamUncertaintyProxy;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TeamFinalJudge> {
  // Stable profile: final judge is deterministic and does not trigger extra LLM calls.
  const { memberResults, proxy } = input;
  return buildFallbackJudge({
    memberResults,
    proxy,
  });
}
