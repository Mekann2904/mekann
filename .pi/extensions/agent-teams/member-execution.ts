// File: .pi/extensions/agent-teams/member-execution.ts
// Description: Team member execution logic for agent teams.
// Why: Separates member execution logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { TeamDefinition, TeamMember, TeamMemberResult } from "./storage";

import {
  normalizeForSingleLine,
} from "../../lib/format-utils.js";
import {
  toErrorMessage,
} from "../../lib/error-utils.js";
import {
  type ThinkingLevel,
} from "../../lib/agent-types.js";
import {
  validateTeamMemberOutput,
} from "../../lib/output-validation.js";
import { SchemaValidationError } from "../../lib/errors.js";
import {
  isPlanModeActive,
  PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import { getTeamMemberExecutionRules } from "../../lib/execution-rules";
import { runPiPrintMode as sharedRunPiPrintMode, type PrintCommandResult } from "../shared/pi-print-executor";

// ============================================================================
// Types
// ============================================================================

/**
 * チームメンバー実行結果の正規化出力を表すインターフェース
 *
 * @property ok - 実行が成功したかどうか
 * @property output - 実行結果の出力テキスト
 * @property degraded - 縮退モードで実行されたかどうか
 * @property reason - 縮退または失敗の理由（オプション）
 */
export interface TeamNormalizedOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

// ============================================================================
// Output Normalization
// ============================================================================

/**
 * Pick a candidate text for a field from unstructured output.
 * Note: Kept locally because the field format is team-member-specific.
 */
function pickTeamFieldCandidate(text: string, maxLength: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return "情報を整理しました。";
  const first =
    lines.find((line) => !/^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP)\s*:/i.test(line)) ??
    lines[0];
  const compact = first
    .replace(/^[-*]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "情報を整理しました。";
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}...`;
}

/**
 * Normalize team member output to required format.
 * Note: Kept locally (not in lib) because:
 * - Uses team-member-specific SUMMARY/CLAIM/EVIDENCE/CONFIDENCE/RESULT/NEXT_STEP format
 * - Has team-member-specific fallback messages (Japanese)
 * - Uses pickTeamFieldCandidate which is team-member-specific
 * Subagent output has different requirements (only SUMMARY/RESULT/NEXT_STEP).
 */
export function normalizeTeamMemberOutput(output: string): TeamNormalizedOutput {
  const trimmed = output.trim();
  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  const quality = validateTeamMemberOutput(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  const summary = pickTeamFieldCandidate(trimmed, 100);
  const claim = pickTeamFieldCandidate(trimmed, 120);
  const evidence = "not-provided";
  const structured = [
    `SUMMARY: ${summary}`,
    `CLAIM: ${claim}`,
    `EVIDENCE: ${evidence}`,
    "RESULT:",
    trimmed,
    "NEXT_STEP: none",
  ].join("\n");
  const structuredQuality = validateTeamMemberOutput(structured);
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
 * Resolve effective skills for a team member.
 * Inheritance: teamSkills (common) -> memberSkills (individual)
 */
export function resolveEffectiveTeamMemberSkills(
  team: TeamDefinition,
  member: TeamMember,
): string[] | undefined {
  return mergeSkillArrays(team.skills, member.skills);
}

/**
 * Format skill list for prompt inclusion (Japanese).
 */
export function formatTeamMemberSkillsSection(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => `- ${skill}`).join("\n");
}

/**
 * Skill search paths in priority order.
 * - .pi/lib/skills/: Team-specific skills (only loaded when explicitly assigned)
 * - .pi/skills/: Global skills (available to all agents)
 */
const TEAM_SKILL_PATHS = [
  join(process.cwd(), ".pi", "lib", "skills"),
  join(process.cwd(), ".pi", "skills"),
];

/**
 * Load skill content from SKILL.md file.
 * Searches in team-specific path first, then global path.
 * Returns null if skill not found.
 */
export function loadSkillContent(skillName: string): string | null {
  for (const basePath of TEAM_SKILL_PATHS) {
    const skillPath = join(basePath, skillName, "SKILL.md");
    if (existsSync(skillPath)) {
      try {
        const content = readFileSync(skillPath, "utf-8");
        // Extract content after frontmatter
        const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        return frontmatterMatch ? frontmatterMatch[1].trim() : content.trim();
      } catch {
        // Continue to next path on error
      }
    }
  }
  return null;
}

/**
 * Build skills section with content for prompt inclusion.
 * Only includes skills that are explicitly assigned to the team/member.
 * Falls back to skill names only if content cannot be loaded.
 */
export function buildSkillsSectionWithContent(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;

  const lines: string[] = [];

  for (const skill of skills) {
    const content = loadSkillContent(skill);
    if (content) {
      lines.push(`## ${skill}`);
      lines.push(content);
      lines.push("");
    } else {
      // Fallback: skill name only
      lines.push(`## ${skill}`);
/**
       * /**
       * * チームメンバー用のプロンプトを構築する
       * *
       * * チーム定義、メンバー情報、タスク内容などを組み合わせて、
       * * エージェントが実行するためのプロンプト文字列を生成します。
       * *
       * * @param input - プロンプト構築に必要な入力オブジェクト
       * * @param input.team - チームの定義情報
       * * @param input.member - 対象となるチームメンバーの情報
       * * @param input.task - メンバーに割り当てるタスク内容
       * * @param input.sharedContext - チーム全体で共有するコンテキスト（省略可）
       * * @param input.phase - 実行フェーズ（"initial" または "communication"、省略時は "initial"）
       * * @param input.communicationContext - コミュニケーションフェーズでの追加コンテキスト（省略可）
       * * @returns 構築されたプロンプト文字列
       * * @example
       * * // 基本的な使用例
       * * const prompt = buildTeamMemberPrompt({
       * *   team: teamDefinition,
       * *   member:
       */
      lines.push("(スキル内容を読み込めませんでした)");
      lines.push("");
    }
  }

  return lines.length > 0 ? lines.join("\n").trim() : null;
}

export function buildTeamMemberPrompt(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
}): string {
  const lines: string[] = [];

  const phase = input.phase ?? "initial";
  const phaseLabel = phase === "initial" ? "初期検討" : "コミュニケーション";

  lines.push(`あなたはエージェントチーム ${input.team.name} (${input.team.id}) のメンバーです。`);
  lines.push(`チームミッション: ${input.team.description}`);
  lines.push(`あなたの役割: ${input.member.role} (${input.member.id})`);
  lines.push(`役割目標: ${input.member.description}`);
  lines.push(`現在フェーズ: ${phaseLabel}`);

  // Resolve and include skills (team common + member individual)
  const effectiveSkills = resolveEffectiveTeamMemberSkills(input.team, input.member);
  const skillsSection = buildSkillsSectionWithContent(effectiveSkills);
  if (skillsSection) {
    lines.push("");
    lines.push("割り当てスキル:");
    lines.push(skillsSection);
  }

  lines.push("");
  lines.push("リードからのタスク:");
  lines.push(input.task);

  if (input.sharedContext?.trim()) {
    lines.push("");
    lines.push("共有コンテキスト:");
    lines.push(input.sharedContext.trim());
  }

  if (input.communicationContext?.trim()) {
    lines.push("");
    lines.push("連携コンテキスト:");
    lines.push(input.communicationContext.trim());
  }

  // Inject plan mode warning if active
  if (isPlanModeActive()) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getTeamMemberExecutionRules(phase, true));

  lines.push("");
  lines.push("Output format (strict, labels must stay in English):");
  lines.push("SUMMARY: <日本語の短い要約>");
  lines.push("CLAIM: <日本語で1文の中核主張>");
  lines.push("EVIDENCE: <根拠をカンマ区切り。可能なら file:line>");
  if (phase === "communication") {
    lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（必須）>");
/**
   * /**
   * * チームメンバーを実行し、タスク処理結果を返す
   * *
   * * 指定されたチーム定義とメンバー設定に基
   */
  } else {
    lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（コミュニケーションフェーズで必須）>");
  }
  lines.push("RESULT:");
  lines.push("<日本語の結果本文>");
  lines.push("NEXT_STEP: <日本語で次のアクション、不要なら none>");

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
    entityLabel: "agent team member",
  });
}

export async function runMember(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: any;
  fallbackProvider?: string;
  fallbackModel?: string;
  signal?: AbortSignal;
  onStart?: (member: TeamMember) => void;
  onEnd?: (member: TeamMember) => void;
  onEvent?: (member: TeamMember, event: string) => void;
  onTextDelta?: (member: TeamMember, delta: string) => void;
  onStderrChunk?: (member: TeamMember, chunk: string) => void;
}): Promise<TeamMemberResult> {
  const prompt = buildTeamMemberPrompt({
    team: input.team,
    member: input.member,
    task: input.task,
    sharedContext: input.sharedContext,
    phase: input.phase,
    communicationContext: input.communicationContext,
  });
  const resolvedProvider = input.member.provider ?? input.fallbackProvider ?? "(session-default)";
  const resolvedModel = input.member.model ?? input.fallbackModel ?? "(session-default)";

  input.onStart?.(input.member);
  try {
    try {
      const result = await runPiPrintMode({
        provider: input.member.provider ?? input.fallbackProvider,
        model: input.member.model ?? input.fallbackModel,
        prompt,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        onTextDelta: (delta) => input.onTextDelta?.(input.member, delta),
        onStderrChunk: (chunk) => input.onStderrChunk?.(input.member, chunk),
      });
      const normalized = normalizeTeamMemberOutput(result.output);
      if (!normalized.ok) {
        throw new SchemaValidationError(`agent team member low-substance output: ${normalized.reason}`, {
          violations: [normalized.reason ?? "unknown"],
          field: "output",
        });
      }
      if (normalized.degraded) {
        input.onEvent?.(
          input.member,
          `normalize: team member output normalized reason=${normalized.reason || "format-mismatch"}`,
        );
      }

      // Extract summary and diagnostics
      const summary = extractSummary(result.output);

      return {
        memberId: input.member.id,
        role: input.member.role,
        summary,
        output: normalized.output,
        status: "completed",
        latencyMs: result.latencyMs,
        diagnostics: {
          confidence: 0.5,
          evidenceCount: 0,
          contradictionSignals: 0,
          conflictSignals: 0,
        },
      };
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      input.onEvent?.(
        input.member,
        `member run failed: ${normalizeForSingleLine(errorMessage, 180)}`,
      );
      return {
        memberId: input.member.id,
        role: input.member.role,
        summary: "(failed)",
        output: "",
        status: "failed",
        latencyMs: 0,
        error: errorMessage,
        diagnostics: {
          confidence: 0,
          evidenceCount: 0,
          contradictionSignals: 0,
          conflictSignals: 0,
        },
      };
    }
  } finally {
    input.onEnd?.(input.member);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function extractSummary(output: string): string {
  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]) {
    return match[1].trim();
  }

  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "(no summary)";
  }

  return firstLine.length > 120 ? `${firstLine.slice(0, 120)}...` : firstLine;
}
