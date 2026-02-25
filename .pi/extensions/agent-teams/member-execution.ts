/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/member-execution.ts
 * role: チームメンバーの実行ロジックと出力正規化
 * why: agent-teams.tsから分離し、メンバー実行の責務を分離して保守性を高めるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, ../../lib/output-validation.ts, ../../lib/execution-rules.ts
 * public_api: normalizeTeamMemberOutput, TeamNormalizedOutput
 * invariants: 出力が10文字未満の場合はok: false, 品質検証エラー時はok: false
 * side_effects: なし（純粋な関数と型定義）
 * failure_modes: 入力文字列が空の場合、文字数が不足している場合
 * @abdd.explain
 * overview: エージェントチームにおける個別メンバーの実行処理および、その出力結果の正規化・検証を行うモジュール。
 * what_it_does:
 *   - メンバーからの出力テキストを正規化（TeamNormalizedOutput型へ変換）
 *   - 出力の文字数チェックおよび品質検証（validateTeamMemberOutput）
 *   - 不構造化テキストからのフィールド候補抽出（pickTeamFieldCandidate）
 * why_it_exists:
 *   - メインのチーム制御ロジックからメンバー実行の詳細を分離するため
 *   - 出力形式を統一し、後続プロセスでの扱いやすさを確保するため
 * scope:
 *   in: メンバーからの生の出力文字列（string）
 *   out: 正規化された実行結果（TeamNormalizedOutput）
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
  trimForError,
  buildRateLimitKey,
} from "../../lib/runtime-utils.js";
import {
  type ThinkingLevel,
} from "../../lib/agent-types.js";
import {
  validateTeamMemberOutput,
} from "../../lib/output-validation.js";
import { SchemaValidationError, ExecutionError } from "../../lib/errors.js";
import {
  findRelevantPatterns,
  type ExtractedPattern,
} from "../../lib/pattern-extraction.js";
import {
  isPlanModeActive,
  PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import { getTeamMemberExecutionRules } from "../../lib/execution-rules";
import { runPiPrintMode as sharedRunPiPrintMode, type PrintCommandResult } from "../shared/pi-print-executor";
import {
  retryWithBackoff,
  getRateLimitGateSnapshot,
  type RetryWithBackoffOverrides,
} from "../../lib/retry-with-backoff.js";
import { sleep } from "../../lib/sleep-utils.js";
import { isHighStakesTask } from "../../lib/verification-high-stakes.js";
import {
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
} from "../../lib/agent-common.js";

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

// 環境変数で設定可能な再試行パラメータ
const IDLE_TIMEOUT_RETRY_LIMIT = (() => {
  const envVal = process.env.PI_IDLE_TIMEOUT_RETRY_LIMIT;
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed < 0) {
      console.warn(
        `[member-execution] Invalid PI_IDLE_TIMEOUT_RETRY_LIMIT="${envVal}", using default 1`
      );
      return 1;
    }
    return Math.max(0, Math.min(5, parsed)); // 0-5回に制限
  }
  return 1;
})();

const IDLE_TIMEOUT_RETRY_DELAY_MS = (() => {
  const envVal = process.env.PI_IDLE_TIMEOUT_RETRY_DELAY_MS;
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed < 100) {
      console.warn(
        `[member-execution] Invalid PI_IDLE_TIMEOUT_RETRY_DELAY_MS="${envVal}", using default 1500`
      );
      return 1500;
    }
    return Math.max(100, Math.min(10000, parsed)); // 100ms-10sに制限
  }
  return 1500;
})();

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

  // 最小限の文字数チェック（10文字以上あれば処理を続ける）
  if (trimmed.length < 10) {
    return { ok: false, output: "", degraded: false, reason: `too short (${trimmed.length} chars)` };
  }

  const quality = validateTeamMemberOutput(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  // 正規化を試みる - より堅牢な実装
  const summary = extractFieldIfExists(trimmed, "SUMMARY") ?? pickTeamFieldCandidate(trimmed, 100);
  const claim = extractFieldIfExists(trimmed, "CLAIM") ?? pickTeamFieldCandidate(trimmed, 120);
  const evidence = extractFieldIfExists(trimmed, "EVIDENCE") ?? "not-provided";
  const nextStep = extractFieldIfExists(trimmed, "NEXT_STEP") ?? "none";

  const structured = [
    `SUMMARY: ${summary}`,
    `CLAIM: ${claim}`,
    `EVIDENCE: ${evidence}`,
    "RESULT:",
    trimmed,
    `NEXT_STEP: ${nextStep}`,
  ].join("\n");

  // 正規化された出力は常に受け入れる（graceful degradation）
  // これにより、LLMが期待通りの形式で出力しなかった場合でも、
  // 有用な情報を失わずに処理を継続できる
  return {
    ok: true,
    output: structured,
    degraded: true,
    reason: quality.reason ?? "normalized",
  };
}

/**
 * 出力から特定のフィールド値を抽出（存在する場合）
 * @summary フィールド抽出
 * @param output 出力テキスト
 * @param fieldName フィールド名（SUMMARY, CLAIM等）
 * @returns フィールド値、または null
 */
function extractFieldIfExists(output: string, fieldName: string): string | null {
  const regex = new RegExp(`^\\s*${fieldName}\\s*:\\s*(.+)$`, "im");
  const match = output.match(regex);
  if (match?.[1]) {
    const value = match[1].trim();
    // 次のフィールドラベルで終了
    const endMatch = value.match(/^(.+?)(?:\s*[A-Z_]+\s*:|$)/s);
    return endMatch ? endMatch[1].trim() : value;
  }
  return null;
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
      } catch (error) {
        // Bug #8 fix: エラーをログ記録して次のパスを試行
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[member-execution] スキル読み込みエラー: ${skillPath} - ${errorMessage}`);
        continue;
      }
    }
  }
  // Bug #15 fix: スキルが見つからなかった場合にログを記録
  console.debug(`[member-execution] スキルが見つかりません: ${skillName} (searched paths: ${skillPaths.length})`);
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

// ============================================================================
// Directive Parsing for Token Efficiency
// ============================================================================

/**
 * プロンプトディレクティブ
 * @summary 出力モード等の制御ディレクティブ
 */
interface PromptDirective {
  outputMode: "internal" | "user-facing";
  language: "english" | "japanese";
  maxTokens: number;
  format: "structured" | "detailed";
}

/**
 * sharedContextからディレクティブを解析
 * @summary ディレクティブ解析
 * @param sharedContext 共有コンテキスト文字列
 * @returns 解析されたディレクティブ
 */
function parseDirectives(sharedContext?: string): PromptDirective {
  const ctx = sharedContext ?? "";
  const isInternal = ctx.includes("OUTPUT MODE: INTERNAL");
  
  if (isInternal) {
    // Extract max tokens if specified
    const maxTokensMatch = ctx.match(/Max:\s*(\d+)\s*tokens/i);
    const maxTokens = maxTokensMatch ? parseInt(maxTokensMatch[1], 10) : 300;
    
    return {
      outputMode: "internal",
      language: "english",
      maxTokens: Math.max(100, Math.min(1000, maxTokens)),
      format: "structured",
    };
  }
  
  return {
    outputMode: "user-facing",
    language: "japanese",
    maxTokens: 0, // no limit
    format: "detailed",
  };
}

export function buildTeamMemberPrompt(input: {
  team: TeamDefinition;
  member: TeamMember;
  task: string;
  sharedContext?: string;
  phase?: "initial" | "communication";
  communicationContext?: string;
  relevantPatterns?: ExtractedPattern[];
}): string {
  const lines: string[] = [];
  const phase = input.phase ?? "initial";
  
  // Parse directives from sharedContext
  const directives = parseDirectives(input.sharedContext);
  const isInternal = directives.outputMode === "internal";

  // INTERNAL mode: Build English prompt with strict output control
  if (isInternal) {
    lines.push(`You are a member of agent team "${input.team.id}".`);
    lines.push(`Role: ${input.member.role}`);
    lines.push(`Mission: ${input.member.description}`);
    lines.push("");
    lines.push("TASK:");
    lines.push(input.task);
    
    // Minimal skills section
    const effectiveSkills = resolveEffectiveTeamMemberSkills(input.team, input.member) ?? [];
    if (effectiveSkills.length > 0) {
      lines.push("");
      lines.push(`Skills: ${effectiveSkills.map(s => typeof s === 'string' ? s : s).join(", ")}`);
    }
    
    // Communication context (compact)
    if (input.communicationContext?.trim()) {
      lines.push("");
      lines.push("TEAMMATE OUTPUTS:");
      // Truncate to essential info
      const compactContext = input.communicationContext
        .split("\n")
        .slice(0, 20)
        .join("\n");
      lines.push(compactContext);
    }
    
    // CRITICAL: Output format at the END with maximum priority
    lines.push("");
    lines.push("=".repeat(60));
    lines.push("CRITICAL OUTPUT REQUIREMENTS (STRICT COMPLIANCE):");
    lines.push("=".repeat(60));
    lines.push(`MAX TOKENS: ${directives.maxTokens}`);
    lines.push("LANGUAGE: English ONLY (no Japanese)");
    lines.push("FORMAT: Structured, concise, no verbosity");
    lines.push("");
    lines.push("REQUIRED OUTPUT STRUCTURE:");
    lines.push("[CLAIM] <one sentence assertion>");
    lines.push("[EVIDENCE]");
    lines.push("- <evidence 1> (file:line if applicable)");
    lines.push("- <evidence 2> (file:line if applicable)");
    lines.push("[CONFIDENCE] <0.0 to 1.0>");
    lines.push("[ACTION] <next step OR done>");
    if (phase === "communication") {
      lines.push("[DISCUSSION] <brief reference to teammates>");
    }
    lines.push("");
    lines.push("PROHIBITED:");
    lines.push("- Japanese text");
    lines.push("- Long explanations");
    lines.push("- Thinking blocks");
    lines.push("- Verbose summaries");
    lines.push("=".repeat(60));
    
    return lines.join("\n");
  }

  // USER-FACING mode: Original Japanese detailed prompt
  const phaseLabel = phase === "initial" ? "初期検討" : "コミュニケーション";

  lines.push(`あなたはエージェントチーム ${input.team.name} (${input.team.id}) のメンバーです。`);
  lines.push(`チームミッション: ${input.team.description}`);
  lines.push(`あなたの役割: ${input.member.role} (${input.member.id})`);
  lines.push(`役割目標: ${input.member.description}`);
  lines.push(`現在フェーズ: ${phaseLabel}`);

  // Resolve and include skills (team common + member individual)
  const effectiveSkills = resolveEffectiveTeamMemberSkills(input.team, input.member) ?? [];
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

  // Add relevant patterns from past executions as dialogue partners (not constraints)
  // This promotes deterritorialization (creative reconfiguration) rather than stagnation
  if (input.relevantPatterns && input.relevantPatterns.length > 0) {
    lines.push("");
    lines.push("過去の実行パターン（対話相手、制約ではない）:");
    const successPatterns = input.relevantPatterns.filter(p => p.patternType === "success");
    const failurePatterns = input.relevantPatterns.filter(p => p.patternType === "failure");
    const approachPatterns = input.relevantPatterns.filter(p => p.patternType === "approach");

    if (successPatterns.length > 0) {
      lines.push("以前に成功したアプローチ:");
      for (const p of successPatterns.slice(0, 2)) {
        lines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 80)}`);
      }
    }
    if (failurePatterns.length > 0) {
      lines.push("以前に課題があったアプローチ:");
      for (const p of failurePatterns.slice(0, 2)) {
        lines.push(`- ${p.description.slice(0, 70)}`);
      }
    }
    if (approachPatterns.length > 0) {
      lines.push("関連するアプローチ:");
      for (const p of approachPatterns.slice(0, 2)) {
        lines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 70)}`);
      }
    }
    lines.push("");
    lines.push("考慮事項: これらのパターンは今回のタスクに適用できるか？できない場合、なぜ？新しいアプローチが必要か？");
  }

  // Inject plan mode warning if active
  if (isPlanModeActive()) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getTeamMemberExecutionRules(phase, true));

  // Token efficiency mode: detect OUTPUT MODE: INTERNAL in sharedContext
  const isInternalMode = input.sharedContext?.includes("OUTPUT MODE: INTERNAL") ?? false;

  // 思考領域改善: 高リスクタスクでは自動的にhighに昇格
  // Note: INTERNAL mode already returned earlier, this is USER-FACING only
  const baseThinkingLevel = input.member.thinkingLevel ?? input.team.thinkingLevel ?? "medium";
  const isHighStakes = isHighStakesTask(input.task);
  const effectiveThinkingLevel = isHighStakes && (baseThinkingLevel === "medium" || baseThinkingLevel === "low" || baseThinkingLevel === "minimal")
    ? "high"
    : baseThinkingLevel;
  
  if (isHighStakes && effectiveThinkingLevel === "high") {
    lines.push("");
    lines.push("【高リスクタスク検出: 深い推論モード自動適用】");
  }
  
  if (effectiveThinkingLevel === "high" || effectiveThinkingLevel === "xhigh") {
    lines.push("");
    lines.push("【深い推論モード】");
    lines.push("以下の思考プロセスを厳格に実施せよ:");
    lines.push("1. 反例探索: 自分の仮説を否定する証拠を最低1つ探せ");
    lines.push("2. 認知バイアスチェック: 確認バイアス、アンカリング効果の影響を検査せよ");
    lines.push("3. 多視点検討: 少なくとも2つの異なる視点から問題を捉え直せ");
    lines.push("4. 境界条件テスト: 主張が成り立たない境界条件を明示せよ");
    lines.push("5. COUNTER_EVIDENCE: <自分の結論と矛盾する証拠>を必ず記述せよ");
  } else if (effectiveThinkingLevel === "low" || effectiveThinkingLevel === "minimal") {
    lines.push("");
    lines.push("【簡易推論モード】");
    lines.push("- 標準的な分析プロセスで実施");
    lines.push("- 主要な証拠を1つ以上提示");
  }
  // mediumの場合はデフォルト（特別な指示なし）

  // USER-FACING output format (Japanese detailed)
  lines.push("");
  lines.push("Output format (strict, labels must stay in English):");
  lines.push("SUMMARY: <日本語の短い要約>");
  lines.push("CLAIM: <日本語で1文の中核主張>");
  lines.push("EVIDENCE: <根拠をカンマ区切り。可能なら file:line>");
  
  // 思考領域改善: high/xhighモードでCOUNTER_EVIDENCEを必須化
  if (effectiveThinkingLevel === "high" || effectiveThinkingLevel === "xhigh") {
    lines.push("COUNTER_EVIDENCE: <自分の結論と矛盾する証拠。最低1つ必須>");
  }
  
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
    // Team member child runs must stay isolated from extension side effects
    // (e.g. cross-instance registration or proactive orchestration injection).
    noExtensions: true,
    envOverrides: {
      // Avoid recursive delegation prompt injection in child runs.
      PI_SUBAGENT_PROACTIVE_PROMPT: "0",
      PI_AGENT_TEAM_PROACTIVE_PROMPT: "0",
      // Explicitly mark child member execution so team tools can reject recursion.
      PI_AGENT_TEAM_CHILD_RUN: "1",
    },
  });
}

function isIdleTimeoutErrorMessage(message: string): boolean {
  return /idle timeout after \d+ms of no output/i.test(message);
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
  // Load relevant patterns from past executions for memory-guided execution
  let relevantPatterns: ExtractedPattern[] = [];
  try {
    relevantPatterns = findRelevantPatterns(input.cwd, input.task, 5);
  } catch {
    // Pattern loading failure should not block execution
  }

  const prompt = buildTeamMemberPrompt({
    team: input.team,
    member: input.member,
    task: input.task,
    sharedContext: input.sharedContext,
    phase: input.phase,
    communicationContext: input.communicationContext,
    relevantPatterns,

  });
  const resolvedProvider = input.member.provider ?? input.fallbackProvider ?? "(session-default)";
  const resolvedModel = input.member.model ?? input.fallbackModel ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  const retryOverrides: RetryWithBackoffOverrides = {
    maxRetries: STABLE_MAX_RETRIES,
    initialDelayMs: STABLE_INITIAL_DELAY_MS,
    maxDelayMs: STABLE_MAX_DELAY_MS,
    ...(input.retryOverrides ?? {}),
  };
  let retryCount = 0;
  let lastRetryStatusCode: number | undefined;
  let lastRetryMessage = "";

  input.onStart?.(input.member);
  try {
    try {
      const provider = input.member.provider ?? input.fallbackProvider;
      const model = input.member.model ?? input.fallbackModel;
      let rateLimitGateLogged = false;

      const result = await retryWithBackoff(
        async () => {
          let commandResult: PrintCommandResult | undefined;
          let lastErrorMessage = "";
          for (let attempt = 0; attempt <= IDLE_TIMEOUT_RETRY_LIMIT; attempt += 1) {
            try {
              commandResult = await runPiPrintMode({
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

          // ループ完了後にcommandResultが未定義の場合は明示的にエラーをスロー
          if (!commandResult) {
            throw new ExecutionError(
              `チームメンバー実行が再試行後に失敗しました (member=${input.member.id}, team=${input.team.id}, retries=${retryCount}): ${lastErrorMessage || "unknown error"}`,
              {
                severity: "high",
                context: {
                  operation: "team-member-execution",
                  component: "agent-teams",
                  metadata: {
                    memberId: input.member.id,
                    memberRole: input.member.role,
                    teamId: input.team.id,
                    provider: provider || "(session-default)",
                    model: model || "(session-default)",
                    retryCount,
                    lastStatusCode: lastRetryStatusCode,
                    lastError: lastRetryMessage,
                  },
                },
              },
            );
          }
          return commandResult;
        },
        {
          cwd: input.cwd,
          overrides: retryOverrides,
          signal: input.signal,
          rateLimitKey,
          maxRateLimitRetries: STABLE_MAX_RATE_LIMIT_RETRIES,
          maxRateLimitWaitMs: STABLE_MAX_RATE_LIMIT_WAIT_MS,
          onRateLimitWait: ({ waitMs, hits }) => {
            if (rateLimitGateLogged) return;
            rateLimitGateLogged = true;
            input.onEvent?.(
              input.member,
              `rate-limit-gate wait=${waitMs}ms hits=${hits} provider=${resolvedProvider} model=${resolvedModel}`,
            );
          },
          onRetry: ({ attempt, statusCode, error }) => {
            retryCount = attempt;
            lastRetryStatusCode = statusCode;
            lastRetryMessage = trimForError(toErrorMessage(error), 160);
            if (statusCode !== 429 || attempt === 1) {
              const errorText = statusCode === 429 ? "rate limit" : lastRetryMessage;
              input.onEvent?.(
                input.member,
                `retry attempt=${attempt} status=${statusCode ?? "-"} error=${errorText}`,
              );
            }
          },
        },
      );
      const normalized = normalizeTeamMemberOutput(result.output);
      if (!normalized.ok) {
        // ログに記録し、failedステータスで返す（例外をスローしない）
        input.onEvent?.(
          input.member,
          `output normalization failed: ${normalized.reason || "unknown"}`
        );
        return {
          memberId: input.member.id,
          role: input.member.role,
          summary: "(normalization failed)",
          output: result.output.slice(0, 500), // 生の出力を一部保持
          status: "failed",
          latencyMs: result.latencyMs,
          error: `Output normalization failed: ${normalized.reason}`,
          diagnostics: {
            confidence: 0,
            evidenceCount: 0,
            contradictionSignals: 0,
            conflictSignals: 0,
          },
        };
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
      const gateSnapshot = await getRateLimitGateSnapshot(rateLimitKey);
      const diagnostic = [
        `provider=${resolvedProvider}`,
        `model=${resolvedModel}`,
        `retries=${retryCount}`,
        lastRetryStatusCode !== undefined ? `last_status=${lastRetryStatusCode}` : "",
        lastRetryMessage ? `last_retry_error=${lastRetryMessage}` : "",
        `gate_wait_ms=${gateSnapshot.waitMs}`,
        `gate_hits=${gateSnapshot.hits}`,
      ]
        .filter(Boolean)
        .join(" ");
      const detailedErrorMessage = diagnostic ? `${errorMessage} | ${diagnostic}` : errorMessage;
      input.onEvent?.(
        input.member,
        `member run failed: ${normalizeForSingleLine(detailedErrorMessage, 180)}`,
      );
      return {
        memberId: input.member.id,
        role: input.member.role,
        summary: "(failed)",
        output: "",
        status: "failed",
        latencyMs: 0,
        error: detailedErrorMessage,
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
