/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/member-execution.ts
 * role: チームメンバーの出力正規化ロジックの実装
 * why: メインファイルから分離し、責務を明確にして保守性を向上させるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, ../../lib/output-validation.ts, ../../lib/agent-types.ts
 * public_api: normalizeTeamMemberOutput, type TeamNormalizedOutput
 * invariants: 出力正規化の際は validateTeamMemberOutput を通じて品質検証を行う
 * side_effects: ファイルシステムへのアクセスなし（純粋な関数処理）
 * failure_modes: 正規化に失敗した場合、ok: false の結果を返す
 * @abdd.explain
 * overview: エージェントチームメンバーの実行結果出力を、システムで扱いやすい形式に整形・正規化するモジュール。
 * what_it_does:
 *   - 入力文字列をバリデーションし、必要に応じて構造化フォーマット（SUMMARY, CLAIM等）に変換する
 *   - 変換された出力が有効かどうか検証し、成功/失敗/縮退モードのフラグを返す
 *   - 無効な出力から有用なテキスト候補を抽出して代替構造を生成する
 * why_it_exists:
 *   - LLMからの出力形式を統一し、ダウンストリーム処理でのエラーを防ぐため
 *   - 複雑な正規化ロジックを agent-teams.ts 本体から分離してモジュール性を高めるため
 * scope:
 *   in: 生のテキスト出力（TeamMemberResult.output相当）
 *   out: 検証済みの正規化済み文字列、またはエラー理由を含むステータスオブジェクト
 */

// File: .pi/extensions/agent-teams/member-execution.ts
// Description: Team member execution logic for agent teams.
// Why: Separates member execution logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
import type { RetryWithBackoffOverrides } from "../../lib/retry-with-backoff.js";

// ============================================================================
// Types
// ============================================================================

/**
 * チーム実行結果の正規化出力
 * @summary 正規化出力
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

const IDLE_TIMEOUT_RETRY_LIMIT = 1;
const IDLE_TIMEOUT_RETRY_DELAY_MS = 1500;

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
 * チームメンバー出力を正規化
 * @summary 出力を正規化
 * @param output - 正規化対象の文字列
 * @returns 正規化された結果オブジェクト
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
  * スキル配列を継承ルールに従ってマージする。
  * @param base ベースとなるスキル配列
  * @param override 上書きするスキル配列
  * @returns マージされたスキル配列、または未定義
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
  * チームメンバーの有効なスキルを解決する。
  * @param team チーム定義
  * @param member チームメンバー
  * @returns マージされたスキルリスト
  */
export function resolveEffectiveTeamMemberSkills(
  team: TeamDefinition,
  member: TeamMember,
): string[] | undefined {
  return mergeSkillArrays(team.skills, member.skills);
}

 /**
  * スキルリストをプロンプト用に整形
  * @param skills スキル名の配列（未定義可）
  * @returns 整形されたスキルリストの文字列、またはnull
  */
export function formatTeamMemberSkillsSection(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => `- ${skill}`).join("\n");
}

/**
 * Resolve package root directory relative to this file.
 * This file is at: .pi/extensions/agent-teams/member-execution.ts
 * Package root is: ../../../ (3 levels up)
 */
const getPackageRoot = (): string => {
  // Use import.meta.url for ES Module compatibility
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  // .pi/extensions/agent-teams/ -> .pi/extensions/ -> .pi/ -> package-root/
  return dirname(dirname(dirname(currentDir)));
};

/**
 * Get global agent directory from environment variable.
 */
const getGlobalAgentDir = (): string => {
  const raw = process.env.PI_CODING_AGENT_DIR;
  if (!raw || !raw.trim()) {
    return join(homedir(), ".pi", "agent");
  }
  const value = raw.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
};

/**
 * Skill search paths in priority order.
 * 1. Project skills (process.cwd()/.pi/skills, process.cwd()/.pi/lib/skills)
 * 2. Global skills (~/.pi/agent/skills)
 * 3. Package bundled skills (PACKAGE_ROOT/.pi/skills, PACKAGE_ROOT/.pi/lib/skills)
 *
 * This ensures skills are found regardless of where pi is executed from,
 * while allowing project-level overrides.
 */
const PACKAGE_ROOT = getPackageRoot();
const getSkillSearchPaths = (): string[] => {
  const cwd = process.cwd();
  const globalDir = getGlobalAgentDir();
  return [
    // Project skills (highest priority)
    join(cwd, ".pi", "lib", "skills"),
    join(cwd, ".pi", "skills"),
    // Global skills
    join(globalDir, "skills"),
    // Package bundled skills (fallback)
    join(PACKAGE_ROOT, ".pi", "lib", "skills"),
    join(PACKAGE_ROOT, ".pi", "skills"),
  ];
};

/**
 * スキル名からファイル内容を読込
 * @summary スキル内容読込
 * @param skillName スキル名
 * @returns スキルのファイル内容、またはnull
 */
export function loadSkillContent(skillName: string): string | null {
  const skillPaths = getSkillSearchPaths();
  for (const basePath of skillPaths) {
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
 * スキル定義からコンテンツを生成
 * @summary スキルセクション生成
 * @param skills スキル名の配列
 * @returns 生成されたスキルセクション文字列、またはnull
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
      lines.push("(スキル内容を読み込めませんでした)");
      lines.push("");
    }
  }

  return lines.length > 0 ? lines.join("\n").trim() : null;
}

/**
 * チームメンバー用プロンプトを構築
 * @summary プロンプト構築
 * @param input.team チーム定義
 * @param input.member チームメンバー
 * @param input.task 実行タスク
 * @param input.sharedContext 共有コンテキスト
 * @param input.phase フェーズ
 * @param input.communicationContext コミュニケーションコンテキスト
 * @returns 構築されたプロンプト文字列
 */
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
    noExtensions: false,
    envOverrides: {
      // Avoid recursive delegation prompt injection in child runs.
      PI_SUBAGENT_PROACTIVE_PROMPT: "0",
    },
  });
}

function isIdleTimeoutErrorMessage(message: string): boolean {
  return /idle timeout after \d+ms of no output/i.test(message);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * メンバータスクを実行し結果を返却
 * @summary タスクを実行
 * @param input.team チーム定義
 * @param input.member チームメンバー
 * @param input.task 実行タスク
 * @param input.sharedContext 共有コンテキスト
 * @param input.phase フェーズ
 * @param input.communicationContext コミュニケーションコンテキスト
 * @param input.timeoutMs タイムアウト時間
 * @param input.cwd カレントワーキングディレクトリ
 * @param input.retryOverrides リトライ設定
 * @param input.fallbackProvider フォールバックプロバイダー
 * @param input.fallbackModel フォールバックモデル
 * @param input.signal 中断シグナル
 * @param input.onStart 開始時コールバック
 * @param input.onEnd 終了時コールバック
 * @param input.onEvent イベント発生時コールバック
 * @param input.onTextDelta テキスト追加時コールバック
 * @param input.onStderrChunk 標準エラー出力時コールバック
 * @returns 実行結果
 */
export async function runMember(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
  timeoutMs: number;
  cwd: string;
  retryOverrides?: RetryWithBackoffOverrides;
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
      const provider = input.member.provider ?? input.fallbackProvider;
      const model = input.member.model ?? input.fallbackModel;
      let result: PrintCommandResult | undefined;
      let lastErrorMessage = "";

      for (let attempt = 0; attempt <= IDLE_TIMEOUT_RETRY_LIMIT; attempt += 1) {
        try {
          result = await runPiPrintMode({
            provider,
            model,
            prompt,
            timeoutMs: input.timeoutMs,
            signal: input.signal,
            onTextDelta: (delta) => input.onTextDelta?.(input.member, delta),
            onStderrChunk: (chunk) => input.onStderrChunk?.(input.member, chunk),
          });
          break;
        } catch (error) {
          lastErrorMessage = toErrorMessage(error);
          const shouldRetry =
            attempt < IDLE_TIMEOUT_RETRY_LIMIT &&
            isIdleTimeoutErrorMessage(lastErrorMessage) &&
            !input.signal?.aborted;

          if (!shouldRetry) {
            throw error;
          }

          input.onEvent?.(
            input.member,
            `idle-timeout retry: attempt=${attempt + 1}/${IDLE_TIMEOUT_RETRY_LIMIT} provider=${provider || "(session-default)"} model=${model || "(session-default)"} timeoutMs=${input.timeoutMs}`,
          );
          await sleep(IDLE_TIMEOUT_RETRY_DELAY_MS);
        }
      }

      if (!result) {
        throw new Error(lastErrorMessage || "agent team member execution failed");
      }
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
