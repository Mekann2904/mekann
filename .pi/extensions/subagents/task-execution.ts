/**
 * @abdd.meta
 * path: .pi/extensions/subagents/task-execution.ts
 * role: サブエージェントのタスク実行および出力処理の制御
 * why: メインファイルから実行ロジックを分離し、保守性を高めるため
 * related: .pi/extensions/subagents.ts, .pi/extensions/subagents/storage.ts, ../../lib/output-schema.js, ../../lib/output-validation.js
 * public_api: isHighRiskTask, SubagentExecutionResult
 * invariants: 高リスクタスクは定義されたパターンに基づき判定される
 * side_effects: ファイルシステムへの書き込み (writeFileSync)
 * failure_modes: ネットワークエラー, スキーマ検証失敗, タイムアウト, レート制限超過
 * @abdd.explain
 * overview: サブエージェントによるタスク実行の主要なロジック、出力正規化、スキーマ適用、リトライ制御を担当するモジュール。
 * what_it_does:
 *   - タスク内容のリスク判定（Ralph Wiggum Loopトリガー）
 *   - 出力のスキーマ検証および強制適用
 *   - エラー分類とリトライ処理（バックオフ、レートリミット）
 *   - 実行結果のファイル保存
 * why_it_exists:
 *   - タスク実行の複雑さを分離してコードベースを整理するため
 *   - 安全な実行と堅牢なエラーハンドリングを実装するため
 * scope:
 *   in: タスク文字列, 実行設定, 実行ルール, パフォーマンスプロファイル
 *   out: 実行結果文字列, 成功/失敗ステータス, エラー理由, ファイルシステムへのレコード保存
 */

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
import {
  findRelevantPatterns,
  type ExtractedPattern,
} from "../../lib/pattern-extraction.js";
import {
  type SchemaViolation,
  type RegenerationConfig,
  SCHEMAS,
  validateSubagentOutputWithSchema,
  generateWithSchemaEnforcement,
  buildRegenerationPrompt,
} from "../../lib/output-schema.js";
import {
  applyOutputTemplate,
  hasMinimumStructure,
} from "../../lib/output-template.js";
import { SchemaValidationError } from "../../lib/errors.js";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import { getSubagentExecutionRules, getExecutionRulesForProfile } from "../../lib/execution-rules";
import { getProfileForTask, type PerformanceProfile } from "../../lib/performance-profiles";
import {
  isNetworkErrorRetryable,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../../lib/retry-with-backoff";
import { getRateLimitGateSnapshot } from "../../lib/retry-with-backoff";
import {
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
} from "../../lib/agent-common.js";
import { runPiPrintMode as sharedRunPiPrintMode, type PrintCommandResult } from "../shared/pi-print-executor";

import type { SubagentDefinition, SubagentRunRecord, SubagentPaths } from "./storage";
import { ensurePaths } from "./storage";

// Re-export types
export type { RunOutcomeCode, RunOutcomeSignal };

// ============================================================================
// High-Risk Task Detection (Ralph Wiggum Loop)
// ============================================================================

/**
 * 高リスクタスクのパターン
 * Ralph Wiggum Loop（自己修正ループ）をトリガーする危険な操作のキーワード
 */
const HIGH_RISK_PATTERNS: RegExp[] = [
  /削除/i, /delete/i, /remove/i,
  /本番/i, /production/i, /prod/i,
  /セキュリティ/i, /security/i, /auth/i,
  /権限/i, /permission/i, /privilege/i,
];

/**
 * 高リスクタスク判定
 * @summary リスク判定（Ralph Wiggum Loop用）
 * @param task タスク内容
 * @returns 高リスクの場合はtrue
 */
export function isHighRiskTask(task: string): boolean {
  return HIGH_RISK_PATTERNS.some(pattern => pattern.test(task));
}

// ============================================================================
// Types
// ============================================================================

/**
 * サブエージェントの実行結果
 * @summary 実行結果を取得
 * @param ok 成功したかどうか
 * @param output 出力文字列
 * @param degraded パフォーマンス低下などが発生したかどうか
 * @param reason 失敗や劣化の理由（任意）
 */
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
 * 出力を正規化する
 * @summary 出力を正規化
 * @param output サブエージェントの出力文字列
 * @returns 正規化された実行結果オブジェクト
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
// Three-Layer Hybrid Strategy Pipeline
// ============================================================================

/**
 * Three-Layer Pipeline の処理結果
 * @summary 3層パイプライン結果インターフェース
 */
export interface ThreeLayerPipelineResult {
  /** 処理後の出力文字列 */
  output: string;
  /** パイプライン全体が成功したか */
  ok: boolean;
  /** 品質低下フラグ（テンプレート適用等） */
  degraded: boolean;
  /** 使用されたレイヤー（1-3） */
  appliedLayer: number;
  /** 検出された違反リスト */
  violations: SchemaViolation[];
  /** 失敗理由（ある場合） */
  reason?: string;
}

/**
 * Layer 3（機械的テンプレート適用）を適用する
 * @summary Layer 3 適用
 * @param rawOutput 生の出力
 * @param violations 違反リスト
 * @returns パイプライン結果
 */
function applyLayerThreeTemplate(
  rawOutput: string,
  violations: SchemaViolation[],
): ThreeLayerPipelineResult {
  const templateResult = applyOutputTemplate(rawOutput, violations);
  return {
    output: templateResult.formatted,
    ok: true,
    degraded: true,
    appliedLayer: 3,
    violations,
    reason: templateResult.filledFields.length > 0
      ? `Layer 3 template applied: filled ${templateResult.filledFields.join(", ")}`
      : undefined,
  };
}

/**
 * 出力をThree-Layer Hybrid Strategyで処理する
 * @summary 3層ハイブリッド戦略パイプライン
 * @param rawOutput 生の出力文字列
 * @returns パイプライン処理結果
 * @description
 * Layer 1: 構造化出力強制（再生成）は呼び出し元で実施
 * Layer 2: 生成時品質保証（QUALITY_BASELINE_RULES）はプロンプトに組み込み済み
 * Layer 3: 機械的テンプレート適用をこの関数で実施
 */
export function processOutputWithThreeLayerPipeline(
  rawOutput: string,
): ThreeLayerPipelineResult {
  const trimmed = rawOutput.trim();

  // 空出力チェック
  if (!trimmed) {
    // Layer 3: 空出力に対して最小テンプレートを適用
    return applyLayerThreeTemplate("", [
      { field: "SUMMARY", violationType: "missing", expected: "required field" },
      { field: "RESULT", violationType: "missing", expected: "required field" },
    ]);
  }

  // Layer 2 スキーマ検証
  const schemaResult = validateSubagentOutputWithSchema(trimmed);

  if (schemaResult.ok && schemaResult.parsed) {
    return {
      output: trimmed,
      ok: true,
      degraded: false,
      appliedLayer: 2,
      violations: [],
    };
  }

  // Layer 3: テンプレート適用
  return applyLayerThreeTemplate(trimmed, schemaResult.violations);
}

/**
 * 出力が最小構造を満たしているかを確認し、必要に応じてLayer 3を適用する
 * @summary 出力検証とLayer 3適用
 * @param output 出力文字列
 * @returns 処理結果
 */
export function ensureOutputStructure(output: string): ThreeLayerPipelineResult {
  if (hasMinimumStructure(output)) {
    const schemaResult = validateSubagentOutputWithSchema(output);
    if (schemaResult.ok) {
      return {
        output,
        ok: true,
        degraded: false,
        appliedLayer: 0, // 処理不要
        violations: [],
      };
    }
  }
  return processOutputWithThreeLayerPipeline(output);
}

// ============================================================================
// Failure Resolution
// ============================================================================

/**
 * リトライ可能か判定する
 * @summary リトライ可否判定
 * @param error 判定対象のエラー
 * @param statusCode ステータスコード（任意）
 * @returns リトライ可能な場合true
 */
export function isRetryableSubagentError(error: unknown, statusCode?: number): boolean {
  if (isNetworkErrorRetryable(error, statusCode)) {
    return true;
  }

  const message = toErrorMessage(error).toLowerCase();
  return message.includes("subagent returned empty output");
}

/**
 * 空出力エラーか判定する
 * @summary 空出力エラー判定
 * @param message 検査するメッセージ
 * @returns 空出力エラーの場合true
 */
export function isEmptyOutputFailureMessage(message: string): boolean {
  return message.toLowerCase().includes("subagent returned empty output");
}

/**
 * エラー概要を作成する
 * @summary エラー概要を作成
 * @param message 元のエラーメッセージ
 * @returns 作成した要約文字列
 */
export function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

/**
 * エラー種別を判定する
 * @summary エラー種別を判定
 * @param error 判定対象のエラー
 * @returns エラー種別を示すシグナル
 */
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
 * @summary スキル配列をマージ
 * @param base ベースとなるスキル配列
 * @param override 上書きするスキル配列
 * @returns マージ後のスキル配列（どちらも指定がない場合はundefined）
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
 * サブエージェントの実効スキルを解決する
 * @summary 実効スキルを解決
 * @param agent サブエージェント定義
 * @param parentSkills 親スキルのリスト（任意）
 * @returns マージされたスキルの配列、または未定義
 */
export function resolveEffectiveSkills(
  agent: SubagentDefinition,
  parentSkills?: string[],
): string[] | undefined {
  return mergeSkillArrays(parentSkills, agent.skills);
}

/**
 * スキル一覧を整形
 * @summary スキル一覧を整形
 * @param skills スキル配列
 * @returns 整形された文字列、またはnull
 */
export function formatSkillsSection(skills: string[] | undefined): string | null {
  if (!skills || skills.length === 0) return null;
  return skills.map((skill) => `- ${skill}`).join("\n");
}

 /**
  * サブエージェント用のプロンプトを構築する
  * @param input.agent サブエージェントの定義
  * @param input.task 実行するタスク
  * @param input.extraContext 追加のコンテキスト
  * @param input.enforcePlanMode プランモードを強制するか
  * @param input.parentSkills 親エージェントのスキルリスト
  * @param input.profileId パフォーマンスプロファイルID（省略時は自動選択）
  * @returns 構築されたプロンプト文字列
  */
export function buildSubagentPrompt(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
  parentSkills?: string[];
  profileId?: string;
  relevantPatterns?: ExtractedPattern[];
}): string {
  // タスクに基づいてプロファイルを自動選択
  const profile = input.profileId 
    ? undefined 
    : getProfileForTask(input.task, { isHighRisk: isHighRiskTask(input.task) });
  const effectiveProfileId = input.profileId ?? profile?.id ?? 'standard';
  
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

  // Add relevant patterns from past executions as dialogue partners (not constraints)
  // This promotes deterritorialization (creative reconfiguration) rather than stagnation
  if (input.relevantPatterns && input.relevantPatterns.length > 0) {
    lines.push("");
    lines.push("Patterns from past executions (dialogue partners, not constraints):");
    const successPatterns = input.relevantPatterns.filter(p => p.patternType === "success");
    const failurePatterns = input.relevantPatterns.filter(p => p.patternType === "failure");
    const approachPatterns = input.relevantPatterns.filter(p => p.patternType === "approach");

    if (successPatterns.length > 0) {
      lines.push("Previously successful:");
      for (const p of successPatterns.slice(0, 2)) {
        lines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 80)}`);
      }
    }
    if (failurePatterns.length > 0) {
      lines.push("Previously challenging:");
      for (const p of failurePatterns.slice(0, 2)) {
        lines.push(`- ${p.description.slice(0, 70)}`);
      }
    }
    if (approachPatterns.length > 0) {
      lines.push("Relevant approaches:");
      for (const p of approachPatterns.slice(0, 2)) {
        lines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 70)}`);
      }
    }
    lines.push("");
    lines.push("Consider: Do these patterns apply to THIS task? If not, why? What NEW approach might be needed?");
  }

  // Subagent plan mode enforcement
  if (input.enforcePlanMode) {
    lines.push("");
    lines.push(PLAN_MODE_WARNING);
  }

  lines.push("");
  lines.push(getExecutionRulesForProfile(effectiveProfileId, true));

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

/**
 * サブエージェントタスク実行
 * @summary サブエージェントタスク実行
 * @param input.agent サブエージェント定義
 * @param input.task タスク内容
 * @param input.extraContext 追加コンテキスト
 * @param input.timeoutMs タイムアウト時間（ミリ秒）
 * @param input.cwd カレントワーキングディレクトリ
 * @param input.retryOverrides リトライ設定の上書き
 * @param input.modelProvider モデルプロバイダー
 * @param input.modelId モデルID
 * @param input.parentSkills 親スキルのリスト
 * @param input.signal 中断シグナル
 * @param input.onStart 開始時のコールバック
 * @param input.onEnd 終了時のコールバック
 * @param input.onTextDelta テキスト差分のコールバック
 * @param input.onStderrChunk 標準エラーチャンクのコールバック
 * @returns 実行レコード、出力、プロンプトを含む結果
 */
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

  // Load relevant patterns from past executions for memory-guided execution
  let relevantPatterns: ExtractedPattern[] = [];
  try {
    relevantPatterns = findRelevantPatterns(input.cwd, input.task, 5);
  } catch {
    // Pattern loading failure should not block execution
  }

  const prompt = buildSubagentPrompt({
    agent: input.agent,
    task: input.task,
    extraContext: input.extraContext,
    enforcePlanMode: planModeActive,
    parentSkills: input.parentSkills,
    relevantPatterns,
  });
  const resolvedProvider = input.agent.provider ?? input.modelProvider ?? "(session-default)";
  const resolvedModel = input.agent.model ?? input.modelId ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  // Stable retry defaults keep delegated runs resilient to transient 429/5xx.
  const retryOverrides: RetryWithBackoffOverrides = {
    maxRetries: STABLE_MAX_RETRIES,
    initialDelayMs: STABLE_INITIAL_DELAY_MS,
    maxDelayMs: STABLE_MAX_DELAY_MS,
    ...(input.retryOverrides ?? {}),
  };
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
      // Layer 1統合: 高リスクタスクの場合のみ再生成メカニズムを使用
      const useLayer1Enforcement = isHighRiskTask(input.task);

      const commandResult = await retryWithBackoff(
        async () => {
          if (useLayer1Enforcement) {
            // Layer 1: 構造化出力強制（再生成メカニズム）
            const enforcementResult = await generateWithSchemaEnforcement(
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
                return result.output;
              },
              SCHEMAS.subagent,
              {
                maxRetries: 2,
                backoffMs: 500,
                onRegenerate: (attempt, violations) => {
                  emitStderrChunk(
                    `[layer1] schema enforcement: attempt=${attempt} violations=${violations.length}\n`,
                  );
                },
              },
            );

            if (enforcementResult.attempts > 1) {
              emitStderrChunk(
                `[layer1] regeneration completed: attempts=${enforcementResult.attempts}\n`,
              );
            }

            // Layer 3: テンプレート適用（フォールバック）
            const pipelineResult = processOutputWithThreeLayerPipeline(enforcementResult.output);
            if (pipelineResult.degraded) {
              emitStderrChunk(
                `[layer3] template applied: ${pipelineResult.reason || "format-mismatch"}\n`,
              );
            }

            return {
              output: pipelineResult.output,
              latencyMs: 0, // Layer 1使用時は正確なレイテンシー計測が困難
            };
          }

          // 通常タスク: 既存のフロー（Layer 3のみ）
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
          overrides: retryOverrides,
          signal: input.signal,
          rateLimitKey,
          maxRateLimitRetries: STABLE_MAX_RATE_LIMIT_RETRIES,
          maxRateLimitWaitMs: STABLE_MAX_RATE_LIMIT_WAIT_MS,
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

      // 思考領域改善: サブエージェント実行後の簡易検証（同期）
      // 高リスクタスク時のみ検証を実行（Ralph Wiggum Loopの条件付き適用）
      if (isHighRiskTask(input.task)) {
        try {
          const { simpleVerificationHook } = await import("../../lib/verification-simple.js");
          const verificationResult = await simpleVerificationHook(
            commandResult.output,
            0.7, // デフォルト信頼度
            {
              agentId: input.agent.id,
              task: input.task,
              triggerMode: "post-subagent",
            }
          );
          if (verificationResult.triggered && verificationResult.result) {
            // eslint-disable-next-line no-console
            console.log(`[RalphWiggum] ${input.agent.id}: ${verificationResult.result.issues.length} issues, verdict=${verificationResult.result.verdict}`);
          }
        } catch {
          // 検証フックエラーは無視して処理を継続
        }
      }

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

/**
 * 要約を抽出
 * @summary 要約を抽出
 * @param output 出力文字列
 * @returns 抽出された要約
 */
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
