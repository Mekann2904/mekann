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
} from "../../lib/agent/runtime-utils.js";
import {
  toErrorMessage,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
} from "../../lib/core/error-utils.js";
import {
  createRunId,
} from "../../lib/agent/agent-utils.js";
import {
  type RunOutcomeCode,
  type RunOutcomeSignal,
} from "../../lib/agent/agent-types.js";
import {
  reevaluateAgentRunFailure,
  isRetryableSubagentError as isRetryableSubagentErrorLib,
  resolveSubagentFailureOutcome as resolveSubagentFailureOutcomeLib,
} from "../../lib/agent/agent-errors.js";
import {
  isEmptyOutputFailureMessage as isEmptyOutputFailureMessageLib,
  buildFailureSummary as buildFailureSummaryLib,
  SUBAGENT_CONFIG,
} from "../../lib/agent/agent-common.js";
import {
  filterRelevantSkills,
  type SkillRelevanceConfig,
} from "../../lib/skill-relevance.js";
import {
  createAndRecordMetrics,
} from "../../lib/analytics/behavior-storage.js";
import {
  DEFAULT_LLM_BEHAVIOR_CONFIG,
} from "../../lib/analytics/llm-behavior-types.js";
import {
  validateSubagentOutput,
} from "../../lib/agent/output-validation.js";
import {
  findRelevantPatterns,
  type ExtractedPattern,
} from "../../lib/storage/pattern-extraction.js";
import {
  type SchemaViolation,
  SCHEMAS,
  validateSubagentOutputWithSchema,
  generateWithSchemaEnforcement,
} from "../../lib/output-schema.js";
import {
  applyOutputTemplate,
  hasMinimumStructure,
} from "../../lib/output-template.js";
import { SchemaValidationError } from "../../lib/core/errors.js";
import {
	isPlanModeActive,
	PLAN_MODE_WARNING,
} from "../../lib/plan-mode-shared";
import {
  renderPromptStack,
  type PromptStackEntry,
} from "../../lib/agent/prompt-stack.js";
import { buildAutonomousLoopPolicy } from "../../lib/agent/autonomous-loop-policy.js";
import {
  summarizePromptStackForBenchmark,
  type PromptStackBenchmarkSummary,
} from "../../lib/agent/benchmark-harness.js";
import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../../lib/agent/runtime-notifications.js";
import {
  buildTurnExecutionContext,
  buildTurnExecutionRuntimeSection,
  deriveTurnExecutionDecisions,
  formatTurnExecutionContextBlock,
} from "../../lib/agent/turn-context-builder.js";
import {
  applyReplayDecisionConstraints,
  applyReplayToolConstraints,
  createTurnExecutionSnapshot,
  type TurnExecutionSnapshot,
} from "../../lib/agent/turn-context-snapshot.js";
import { resolveModelPromptAdapter } from "../../lib/agent/model-adapters.js";
import { getExecutionRulesForProfile } from "../../lib/execution-rules";
import { getProfileForTask } from "../../lib/performance-profiles";
import {
  isNetworkErrorRetryable,
  retryWithBackoff,
  type RetryWithBackoffOverrides,
} from "../../lib/retry-with-backoff.js";
import {
  finalizeActiveSubagentRun,
  heartbeatActiveSubagentRun,
  recordLongRunningEvent,
  registerActiveSubagentRun,
} from "../../lib/long-running-supervisor.js";
import { getRateLimitGateSnapshot } from "../../lib/retry-with-backoff.js";
import {
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
} from "../../lib/agent/agent-common.js";
import { runPiPrintMode as sharedRunPiPrintMode, type PrintCommandResult } from "../shared/pi-print-executor";

import type { SubagentDefinition, SubagentRunRecord } from "./storage";
import { ensurePaths } from "./storage";
import type { TurnExecutionContext } from "../../lib/agent/turn-context.js";

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
 * 調査タスクのパターン
 * OUTPUT MODE: INTERNAL を自動適用するタスクのキーワード
 */
const RESEARCH_TASK_PATTERNS: RegExp[] = [
  /調査/i, /investigate/i, /analyze/i, /分析/i,
  /探/i, /find/i, /search/i, /検索/i,
  /確認/i, /verify/i, /check/i, /確認/i,
  /読/i, /read/i, /review/i, /レビュー/i,
  /理解/i, /understand/i, /explain/i, /説明/i,
  /どのファイル/i, /which file/i, /where/i,
  /どうなって/i, /how does/i, /what is/i,
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

/**
 * 調査タスク判定
 * @summary 調査タスク自動判定
 * @param task タスク内容
 * @returns 調査タスクの場合はtrue
 * @description OUTPUT MODE: INTERNAL を自動適用すべきタスクかどうかを判定。
 *              明示的な OUTPUT MODE 指定がある場合は、この判定より優先される。
 */
export function isResearchTask(task: string): boolean {
  return RESEARCH_TASK_PATTERNS.some(pattern => pattern.test(task));
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

  // ヘッダーパターンにマッチしない全ての行を試す
  for (const line of lines) {
    if (/^(SUMMARY|RESULT|NEXT_STEP)\s*:/i.test(line)) continue;
    
    const compact = line
      .replace(/^[-*]\s+/, "")
      .replace(/^#{1,6}\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    
    if (compact) {
      return compact.length <= 90 ? compact : `${compact.slice(0, 90)}...`;
    }
  }
  
  return "回答を整形しました。";
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
// Failure Resolution (re-exported from lib/agent/agent-errors.ts)
// ============================================================================

/**
 * リトライ可能か判定する
 * @summary リトライ可否判定
 * @param error 判定対象のエラー
 * @param statusCode ステータスコード（任意）
 * @returns リトライ可能な場合true
 * @description lib/agent/agent-errors.tsの包括的な実装を使用。
 *              429、5xx、設定可能なパターンもチェックする。
 */
export const isRetryableSubagentError = isRetryableSubagentErrorLib;

/**
 * 空出力エラーか判定する
 * @summary 空出力エラー判定
 * @param message 検査するメッセージ
 * @returns 空出力エラーの場合true
 */
export function isEmptyOutputFailureMessage(message: string): boolean {
  return isEmptyOutputFailureMessageLib(message, SUBAGENT_CONFIG);
}

/**
 * エラー概要を作成する
 * @summary エラー概要を作成
 * @param message 元のエラーメッセージ
 * @returns 作成した要約文字列
 */
export const buildFailureSummary = buildFailureSummaryLib;

/**
 * エラー種別を判定する
 * @summary エラー種別を判定
 * @param error 判定対象のエラー
 * @returns エラー種別を示すシグナル
 * @description lib/agent/agent-errors.tsの包括的な実装を使用。
 *              レート制限、5xxエラーなども適切に判定する。
 */
export const resolveSubagentFailureOutcome = resolveSubagentFailureOutcomeLib;

// ============================================================================
// Research Task Guidelines (Phase 2: File Loading Optimization)
// ============================================================================

/**
 * search-toolsスキル準拠の検索指示を生成
 * @summary 調査タスク用ガイドライン構築
 * @returns 検索タスク用ガイドライン文字列
 * @description 調査タスクで効率的なファイル検索を行うためのベストプラクティスを提供。
 *              search-toolsスキルの主要な推奨事項を抽出。
 */
export function buildResearchTaskGuidelines(): string {
  const lines: string[] = [
    "",
    "【調査ガイドライン】",
    "",
    "1. 調査の順序:",
    "   - まず要求を整理し、何を外部調査すべきかを決める",
    "   - その後で repo 内検索を行い、既存実装と制約を確認する",
    "   - コード棚卸しだけで research を終えない",
    "",
    "2. 外部調査が必須になりやすいケース:",
    "   - 採用技術スタック、ライブラリ、API、標準仕様に関わる判断",
    "   - 新規構築、複合技術、未知ライブラリ、最近変わりうる仕様",
    "   - ユーザが調査・参考文献・公式ドキュメントを求めている場合",
    "   - 公式ドキュメント、一次情報、信頼できる技術資料を優先する",
    "",
    "3. repo 内ツール選択:",
    "   - ファイル探す: file_candidates (exclude: ['node_modules', '.git'])",
    "   - コード検索: code_search (path絞り込み, type指定)",
    "   - シンボル定義: sym_find (kind指定, インデックス済み前提)",
    "",
    "4. パフォーマンス最適化:",
    "   - 必ず limit を設定 (推奨: 20-50)",
    "   - exclude で node_modules, .git, dist を除外",
    "   - 並列実行を活用 (Promise.all)",
    "",
    "5. 検索戦略:",
    "   - 段階的絞り込み: 広い検索 → 狭い検索",
    "   - 複数ツール併用: file_candidates → code_search → sym_find",
    "   - 結果が空ならパターンを緩める",
    "",
    "6. research.md に必ず残すこと:",
    "   - User Intent / Requested Outcome / Constraints / Unknowns",
    "   - 調査した技術スタック、対象ライブラリ、API surface",
    "   - External Research Findings と plan への反映",
    "   - References セクション。使った公式ドキュメントや資料、または外部調査不能の理由",
    "   - Local Codebase Findings と既存制約",
    "",
  ];
  return lines.join("\n");
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
 * タスクに関連するスキルのみをフィルタリング
 * @summary 関連スキルフィルタリング（8.4最適化）
 * @param task タスク内容
 * @param skills スキルリスト
 * @param config 設定（オプション）
 * @returns フィルタリングされたスキルリスト
 */
export function filterSkillsByRelevance(
  task: string,
  skills: string[] | undefined,
  config?: Partial<SkillRelevanceConfig>,
): string[] {
  if (!skills || skills.length === 0) return [];

  const { highRelevance, mediumRelevance } = filterRelevantSkills(task, skills, {
    highRelevanceThreshold: config?.highRelevanceThreshold ?? 0.4,
    mediumRelevanceThreshold: config?.mediumRelevanceThreshold ?? 0.15,
    keywordWeight: config?.keywordWeight ?? 0.7,
    contextWeight: config?.contextWeight ?? 0.3,
  });

  // 高関連 + 中関連のスキルを返す（最大5個）
  return [...highRelevance, ...mediumRelevance].slice(0, 5);
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

// ============================================================================
// Directive Parsing for Token Efficiency (shared with agent-teams)
// ============================================================================

/**
 * サブエージェント用ディレクティブ
 */
interface SubagentDirective {
  outputMode: "internal" | "user-facing";
  language: "english" | "japanese";
  maxTokens: number;
  format: "structured" | "detailed";
}

/**
 * extraContextからディレクティブを解析
 * @summary ディレクティブ解析
 * @param extraContext 追加コンテキスト文字列
 * @param task タスク内容（自動判定用）
 * @returns 解析されたディレクティブ
 * @description
 *   - 明示的な OUTPUT MODE: INTERNAL 指定がある場合は、自動判定より優先
 *   - 調査タスクと判定された場合は、自動的に INTERNAL モードに切り替え
 */
function parseSubagentDirectives(extraContext?: string, task?: string): SubagentDirective {
  const ctx = extraContext ?? "";
  const hasExplicitInternal = ctx.includes("OUTPUT MODE: INTERNAL");
  const hasExplicitUserFacing = ctx.includes("OUTPUT MODE: USER-FACING");

  // 明示的な指定がある場合は優先
  if (hasExplicitInternal) {
    const maxTokensMatch = ctx.match(/Max:\s*(\d+)\s*tokens/i);
    const maxTokens = maxTokensMatch ? parseInt(maxTokensMatch[1], 10) : 300;

    return {
      outputMode: "internal",
      language: "english",
      maxTokens: Math.max(100, Math.min(1000, maxTokens)),
      format: "structured",
    };
  }

  if (hasExplicitUserFacing) {
    return {
      outputMode: "user-facing",
      language: "japanese",
      maxTokens: 0,
      format: "detailed",
    };
  }

  // 自動判定: 調査タスクの場合は INTERNAL モードに切り替え
  if (task && isResearchTask(task)) {
    return {
      outputMode: "internal",
      language: "english",
      maxTokens: 300,
      format: "structured",
    };
  }

  // デフォルト: USER-FACING モード
  return {
    outputMode: "user-facing",
    language: "japanese",
    maxTokens: 0,
    format: "detailed",
  };
}

/**
 * Research-oriented delegated runs need repository search tools.
 * Keep regular delegated runs deterministic by leaving extensions off.
 */
export function shouldEnableSubagentExtensions(
  task: string,
  extraContext?: string,
  turnContext?: TurnExecutionContext,
): boolean {
  const wantsResearchMode = parseSubagentDirectives(extraContext, task).outputMode === "internal";
  if (!wantsResearchMode) {
    return false;
  }
  // If turnContext is undefined, we cannot safely determine if extensions are supported.
  // Default to false for safety - caller must provide turnContext for extensions.
  if (!turnContext) {
    return false;
  }
  return deriveTurnExecutionDecisions(turnContext, {
    taskKind: "research",
    taskText: task,
  }).allowSearchExtensions;
}

export function buildSubagentChildEnvOverrides(): NodeJS.ProcessEnv {
  return {
    PI_CHILD_DISABLE_ORCHESTRATION: "1",
  };
}

function computeHardTimeoutMs(idleTimeoutMs: number): number {
  if (idleTimeoutMs <= 0) {
    return 0;
  }

  const override = Number(process.env.PI_SUBAGENT_HARD_TIMEOUT_MS ?? "");
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  return Math.max(idleTimeoutMs * 3, idleTimeoutMs + 60_000);
}

function buildInternalContextHandoff(extraContext?: string, maxLines = 12): string[] {
  const context = extraContext?.trim();
  if (!context) return [];

  const lines = context
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  const priorityPattern = /known_facts=|open_questions=|evidence_snippets=|KNOWN_FACTS|OPEN_QUESTIONS|EVIDENCE_SNIPPETS|CONTEXT_PACK_V1/i;
  const prioritized: string[] = [];
  const regular: string[] = [];

  for (const line of lines) {
    if (priorityPattern.test(line)) {
      prioritized.push(line);
    } else {
      regular.push(line);
    }
  }

  return [...prioritized, ...regular].slice(0, maxLines);
}

/**
 * サブエージェント用プロンプトを構築
 * @summary プロンプト構築
 * @param input エージェント定義やタスクを含む入力オブジェクト
 * @param input.agent サブエージェントの定義
 * @param input.task 実行するタスク内容
 * @param input.extraContext 追加のコンテキスト情報
 * @param input.enforcePlanMode 計画モードを強制するか
 * @param input.parentSkills 親スキルのリスト
 * @param input.profileId プロファイルID
 * @param input.relevantPatterns 関連するパターン情報
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
  modelProvider?: string;
  modelId?: string;
  turnContext?: TurnExecutionContext;
}): string {
  return buildSubagentPromptPackage(input).prompt;
}

export function buildSubagentPromptPackage(input: {
  agent: SubagentDefinition;
  task: string;
  extraContext?: string;
  enforcePlanMode?: boolean;
  parentSkills?: string[];
  profileId?: string;
  relevantPatterns?: ExtractedPattern[];
  modelProvider?: string;
  modelId?: string;
  turnContext?: TurnExecutionContext;
}): {
  prompt: string;
  entries: PromptStackEntry[];
  runtimeNotificationCount: number;
} {
  // Parse directives from extraContext and task (auto-detect research tasks)
  const directives = parseSubagentDirectives(input.extraContext, input.task);
  const isInternal = directives.outputMode === "internal";
  const adapter = resolveModelPromptAdapter(
    input.agent.provider ?? input.modelProvider,
    input.agent.model ?? input.modelId,
  );
  const allSkills = resolveEffectiveSkills(input.agent, input.parentSkills) ?? [];
  const effectiveSkills = filterSkillsByRelevance(input.task, allSkills);
  const turnContext = input.turnContext;
  const _turnDecisions = turnContext
    ? deriveTurnExecutionDecisions(turnContext, {
        taskKind: isInternal ? "research" : "implementation",
        taskText: input.task,
      })
    : undefined;

  // INTERNAL mode: Build compact English prompt
  if (isInternal) {
    const contextHandoff = buildInternalContextHandoff(
      input.extraContext,
      adapter.internalContextHandoffLines,
    );
    const runtimeNotifications = [
      createRuntimeNotification(
        "subagent-output",
        `MAX TOKENS: ${directives.maxTokens}. English only. Output labels only. No markdown, no internal monologue.`,
        "critical",
        1,
      ),
    ].filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));

    const entries: PromptStackEntry[] = [
      {
        source: "subagent-role",
        layer: "system-policy",
        content: [
          `Subagent: ${input.agent.id}`,
          `Role: ${input.agent.description}`,
          "",
          "TASK:",
          input.task,
          effectiveSkills.length > 0 ? `\nSkills: ${effectiveSkills.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      },
      {
        source: "subagent-autonomous-loop-policy",
        layer: "system-policy",
        content: buildAutonomousLoopPolicy("internal"),
      },
    ];

    if (turnContext) {
      entries.push({
        source: "subagent-turn-context",
        layer: "startup-context",
        content: formatTurnExecutionContextBlock(turnContext),
      });
      const notification = createRuntimeNotification(
        "turn-context",
        buildTurnExecutionRuntimeSection(turnContext),
        "info",
        1,
      );
      if (notification) {
        runtimeNotifications.push(notification);
      }
    }

    if (contextHandoff.length > 0) {
      entries.push({
        source: "subagent-context-handoff",
        layer: "startup-context",
        content: [
          "CONTEXT HANDOFF:",
          ...contextHandoff,
          "Context policy: Reuse known_facts first. Investigate open_questions first. Expand search only when evidence is missing or conflicting.",
        ].join("\n"),
      });
    }

    if (shouldEnableSubagentExtensions(input.task, input.extraContext, turnContext)) {
      entries.push({
        source: "subagent-research-guidelines",
        layer: "tool-description",
        content: buildResearchTaskGuidelines(),
      });
    }

    entries.push({
      source: "subagent-output-requirements",
      layer: adapter.noticePlacement === "inline" ? "system-policy" : "runtime-notification",
      content: [
        "CRITICAL OUTPUT REQUIREMENTS (STRICT COMPLIANCE):",
        `MAX TOKENS: ${directives.maxTokens}`,
        "LANGUAGE: English ONLY",
        "FORMAT: Structured, concise",
        "",
        "REQUIRED OUTPUT:",
        "[CLAIM] <one sentence>",
        "[EVIDENCE]",
        "- <item 1>",
        "- <item 2>",
        "[CONFIDENCE] <0.0-1.0>",
        "[ACTION] <next|done>",
        "",
        "PROHIBITED:",
        "- Japanese language (use English only)",
        "- Long explanations (be concise)",
        "- [Thinking] blocks (output structured format directly)",
        "- Internal monologue (go straight to output)",
        "- Markdown formatting (use labels only)",
      ].join("\n"),
    });

    if (runtimeNotifications.length > 0 && adapter.noticePlacement === "tail") {
      entries.push({
        source: "subagent-runtime-notifications",
        layer: "runtime-notification",
        content: formatRuntimeNotificationBlock(runtimeNotifications),
      });
    }

    const rendered = renderPromptStack(entries);
    return {
      prompt: rendered.prompt,
      entries: rendered.renderedEntries,
      runtimeNotificationCount: rendered.renderedEntries.filter(
        (entry) => entry.layer === "runtime-notification",
      ).length,
    };
  }

  // USER-FACING mode: Original detailed prompt
  // タスクに基づいてプロファイルを自動選択
  const profile = input.profileId 
    ? undefined 
    : getProfileForTask(input.task, { isHighRisk: isHighRiskTask(input.task) });
  const effectiveProfileId = input.profileId ?? profile?.id ?? 'standard';
  
  const skillsSection = formatSkillsSection(effectiveSkills);
  const entries: PromptStackEntry[] = [
    {
      source: "subagent-role",
      layer: "system-policy",
      content: [
        `You are running as delegated subagent: ${input.agent.name} (${input.agent.id}).`,
        `Role description: ${input.agent.description}`,
        "",
        "Subagent operating instructions:",
        input.agent.systemPrompt,
      ].join("\n"),
    },
    {
      source: "subagent-autonomous-loop-policy",
      layer: "system-policy",
      content: buildAutonomousLoopPolicy("delegated"),
    },
  ];

  if (turnContext) {
    entries.push({
      source: "subagent-turn-context",
      layer: "startup-context",
      content: formatTurnExecutionContextBlock(turnContext),
    });
    const notification = createRuntimeNotification(
      "turn-context",
      buildTurnExecutionRuntimeSection(turnContext),
      "info",
      1,
    );
    if (notification) {
      entries.push({
        source: "subagent-turn-context-runtime",
        layer: "runtime-notification",
        content: formatRuntimeNotificationBlock([notification]),
      });
    }
  }

  if (skillsSection) {
    entries.push({
      source: "subagent-skills",
      layer: "tool-description",
      content: ["Assigned skills:", skillsSection].join("\n"),
    });
  }

  entries.push({
    source: "subagent-task",
    layer: "system-policy",
    content: ["Task from lead agent:", input.task].join("\n"),
  });

  if (input.extraContext?.trim()) {
    entries.push({
      source: "subagent-extra-context",
      layer: "startup-context",
      content: [
        "Extra context:",
        input.extraContext.trim(),
        "Context policy:",
        "- Reuse known_facts as baseline and verify contradictions.",
        "- Prioritize open_questions before broad repository scans.",
        "- Use evidence_snippets first; expand exploration only when needed.",
      ].join("\n"),
    });
  }

  // Add relevant patterns from past executions as dialogue partners (not constraints)
  // This promotes deterritorialization (creative reconfiguration) rather than stagnation
  if (input.relevantPatterns && input.relevantPatterns.length > 0) {
    const patternLines: string[] = ["Patterns from past executions (dialogue partners, not constraints):"];
    const successPatterns = input.relevantPatterns.filter(p => p.patternType === "success");
    const failurePatterns = input.relevantPatterns.filter(p => p.patternType === "failure");
    const approachPatterns = input.relevantPatterns.filter(p => p.patternType === "approach");

    if (successPatterns.length > 0) {
      patternLines.push("Previously successful:");
      for (const p of successPatterns.slice(0, 2)) {
        patternLines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 80)}`);
      }
    }
    if (failurePatterns.length > 0) {
      patternLines.push("Previously challenging:");
      for (const p of failurePatterns.slice(0, 2)) {
        patternLines.push(`- ${p.description.slice(0, 70)}`);
      }
    }
    if (approachPatterns.length > 0) {
      patternLines.push("Relevant approaches:");
      for (const p of approachPatterns.slice(0, 2)) {
        patternLines.push(`- [${p.agentOrTeam}] ${p.description.slice(0, 70)}`);
      }
    }
    patternLines.push("");
    patternLines.push("Consider: Do these patterns apply to THIS task? If not, why? What NEW approach might be needed?");
    entries.push({
      source: "subagent-relevant-patterns",
      layer: "startup-context",
      content: patternLines.join("\n"),
    });
  }

  // Subagent plan mode enforcement
  if (input.enforcePlanMode) {
    const notification = createRuntimeNotification(
      "plan-mode",
      PLAN_MODE_WARNING,
      "warning",
      1,
    );
    if (notification) {
      entries.push({
        source: "subagent-plan-mode-notification",
        layer: "runtime-notification",
        content: formatRuntimeNotificationBlock([notification]),
      });
    }
  }

  entries.push({
    source: "subagent-execution-rules",
    layer: "system-policy",
    content: getExecutionRulesForProfile(effectiveProfileId, true),
  });

  entries.push({
    source: "subagent-output-format",
    layer: adapter.prefersStrictOutputTail ? "runtime-notification" : "system-policy",
    content: [
      "Output format (strict):",
      "SUMMARY: <short summary>",
      "CLAIM: <1-sentence core claim (optional, for research/analysis tasks)>",
      "EVIDENCE: <comma-separated evidence with file:line references where possible (optional)>",
      "DISCUSSION: <when working with other agents: references to their outputs, agreements/disagreements, consensus (optional)>",
      "RESULT:",
      "<main answer>",
      "NEXT_STEP: <specific next action or none>",
    ].join("\n"),
  });

  const rendered = renderPromptStack(entries);
  return {
    prompt: rendered.prompt,
    entries: rendered.renderedEntries,
    runtimeNotificationCount: rendered.renderedEntries.filter(
      (entry) => entry.layer === "runtime-notification",
    ).length,
  };
}

// ============================================================================
// Execution
// ============================================================================

async function runPiPrintMode(input: {
  provider?: string;
  model?: string;
  prompt: string;
  noExtensions?: boolean;
  envOverrides?: NodeJS.ProcessEnv;
  timeoutMs: number;
  hardTimeoutMs?: number;
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
  replaySnapshot?: TurnExecutionSnapshot;
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onTextDelta?: (delta: string) => void;
  onStderrChunk?: (chunk: string) => void;
}): Promise<{
  runRecord: SubagentRunRecord;
  output: string;
  prompt: string;
  promptStackSummary: PromptStackBenchmarkSummary;
  runtimeNotificationCount: number;
}> {
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
  } catch (err) {
    // Pattern loading failure should not block execution
    console.warn("[subagent] Failed to load relevant patterns:", err instanceof Error ? err.message : String(err));
  }

  const liveTurnContext = buildTurnExecutionContext({
    cwd: input.cwd,
    startupKind: "delta",
    isFirstTurn: false,
    previousContextAvailable: Boolean(input.extraContext?.trim()),
    sessionElapsedMs: 0,
  });
  const turnContext = applyReplayToolConstraints(liveTurnContext, input.replaySnapshot);
  const liveTurnDecisions = deriveTurnExecutionDecisions(turnContext, {
    taskKind: shouldEnableSubagentExtensions(input.task, input.extraContext, turnContext) ? "research" : "implementation",
    taskText: input.task,
  });
  const turnDecisions = applyReplayDecisionConstraints(liveTurnDecisions, input.replaySnapshot);
  const turnSnapshot = createTurnExecutionSnapshot(turnContext, turnDecisions);

  const promptPackage = buildSubagentPromptPackage({
    agent: input.agent,
    task: input.task,
    extraContext: input.extraContext,
    enforcePlanMode: planModeActive,
    parentSkills: input.parentSkills,
    relevantPatterns,
    modelProvider: input.modelProvider,
    modelId: input.modelId,
    turnContext,
  });
  const prompt = promptPackage.prompt;
  const promptStackSummary = summarizePromptStackForBenchmark(promptPackage.entries);
  const resolvedProvider = input.agent.provider ?? input.modelProvider ?? "(session-default)";
  const resolvedModel = input.agent.model ?? input.modelId ?? "(session-default)";
  const rateLimitKey = buildRateLimitKey(resolvedProvider, resolvedModel);
  // Stable retry defaults keep delegated runs resilient to transient 429/5xx.
  const retryOverrides: RetryWithBackoffOverrides = {
    maxRetries: turnDecisions?.retryOverrides.maxRetries ?? STABLE_MAX_RETRIES,
    initialDelayMs: turnDecisions?.retryOverrides.initialDelayMs ?? STABLE_INITIAL_DELAY_MS,
    maxDelayMs: turnDecisions?.retryOverrides.maxDelayMs ?? STABLE_MAX_DELAY_MS,
    ...(input.retryOverrides ?? {}),
  };
  let retryCount = 0;
  let lastRetryStatusCode: number | undefined;
  let lastRetryMessage = "";
  let lastRateLimitWaitMs = 0;
  let lastRateLimitHits = 0;
  let rateLimitGateLogged = false;
  let rateLimitStderrLogged = false;
  let finalized = false; // 二重ファイナライズ防止フラグ
  const heartbeat = () => {
    heartbeatActiveSubagentRun({
      cwd: input.cwd,
      runId,
    });
  };
  const emitTextDelta = (delta: string) => {
    heartbeat();
    input.onTextDelta?.(delta);
  };
  const emitStderrChunk = (chunk: string) => {
    heartbeat();
    const isRateLimitChunk = /429|rate\s*limit|too many requests/i.test(chunk);
    if (isRateLimitChunk) {
      if (rateLimitStderrLogged) {
        return;
      }
      rateLimitStderrLogged = true;
    }
    input.onStderrChunk?.(chunk);
  };

  registerActiveSubagentRun({
    cwd: input.cwd,
    runId,
    agentId: input.agent.id,
    task: input.task,
  });
  input.onStart?.();
  try {
    try {
      // Layer 1統合: 高リスクタスクの場合のみ再生成メカニズムを使用
      const useLayer1Enforcement = isHighRiskTask(input.task);
      const enableExtensions = shouldEnableSubagentExtensions(input.task, input.extraContext, turnContext);

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
                  noExtensions: !enableExtensions,
                  envOverrides: buildSubagentChildEnvOverrides(),
                  timeoutMs: input.timeoutMs,
                  hardTimeoutMs: computeHardTimeoutMs(input.timeoutMs),
                  signal: input.signal,
                  onTextDelta: emitTextDelta,
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
            noExtensions: !enableExtensions,
            envOverrides: buildSubagentChildEnvOverrides(),
            timeoutMs: input.timeoutMs,
            hardTimeoutMs: computeHardTimeoutMs(input.timeoutMs),
            signal: input.signal,
            onTextDelta: emitTextDelta,
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
          providerKey: resolvedProvider,
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
      finalizeActiveSubagentRun({
        cwd: input.cwd,
        runId,
        success: true,
      });
      finalized = true;
      recordLongRunningEvent(input.cwd, {
        type: "subagent_run",
        summary: `subagent artifact persisted: ${input.agent.id}`,
        success: true,
        details: {
          runId,
          outputFile,
          status: runRecord.status,
        },
      });

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
            // Console logging is intentional for debugging purposes
            console.log(`[RalphWiggum] ${input.agent.id}: ${verificationResult.result.issues.length} issues, verdict=${verificationResult.result.verdict}`);
          }
        } catch (err) {
          // 検証フックエラーは無視して処理を継続
          console.warn("[subagent] Verification hook error:", err instanceof Error ? err.message : String(err));
        }
      }

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            turnContext: turnSnapshot,
            prompt,
            output: commandResult.output,
          },
          null,
          2,
        ),
        "utf-8",
      );

      // 8.4最適化: LLM行動計測
      if (DEFAULT_LLM_BEHAVIOR_CONFIG.enabled && Math.random() < DEFAULT_LLM_BEHAVIOR_CONFIG.samplingRate) {
        try {
          createAndRecordMetrics({
            source: "subagent",
            prompt: { text: prompt },
            output: { text: commandResult.output },
            execution: {
              durationMs: Date.now() - startedAtMs,
              retryCount,
              outcomeCode: "SUCCESS",
              modelUsed: resolvedModel,
              thinkingLevel: "medium",
            },
            context: {
              task: input.task,
              agentId: input.agent.id,
            },
            cwd: input.cwd,
          });
        } catch (err) {
          // 計測エラーは実行に影響させない
          console.debug?.("[subagent] Metrics recording error:", err instanceof Error ? err.message : String(err));
        }
      }

      return {
        runRecord,
        output: commandResult.output,
        prompt,
        promptStackSummary,
        runtimeNotificationCount: promptPackage.runtimeNotificationCount,
      };
    } catch (error: unknown) {
      let message = toErrorMessage(error);

      // エラー再評価: ツール呼び出しの部分的失敗を適切に処理
      const reevaluation = reevaluateAgentRunFailure(message);
      let effectiveStatus: "completed" | "failed" = "failed";
      let effectiveSummary = buildFailureSummary(message);

      if (reevaluation.shouldDowngrade && reevaluation.originalFailure) {
        // 失敗率が低い場合は警告として扱い、ステータスを completed にする
        const { failed, total } = reevaluation.originalFailure;
        emitStderrChunk(
          `[error-reeval] downgraded: ${failed}/${total} tool calls failed (${((failed / total) * 100).toFixed(1)}%) -> warning\n`,
        );
        effectiveStatus = "completed";
        effectiveSummary = `Completed with ${failed} non-critical tool failure(s) (ignored)`;
      }

      const gateSnapshot = await getRateLimitGateSnapshot(rateLimitKey);
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
        summary: effectiveSummary,
        status: effectiveStatus,
        startedAt,
        finishedAt,
        latencyMs: Math.max(0, Date.now() - startedAtMs),
        outputFile,
        error: effectiveStatus === "failed" ? message : undefined,
      };
      finalizeActiveSubagentRun({
        cwd: input.cwd,
        runId,
        success: effectiveStatus === "completed",
        error: effectiveStatus === "failed" ? message : undefined,
      });
      finalized = true;
      recordLongRunningEvent(input.cwd, {
        type: "subagent_run",
        summary: effectiveStatus === "completed"
          ? `subagent completed with downgraded warning: ${input.agent.id}`
          : `subagent execution failed: ${input.agent.id}`,
        success: effectiveStatus === "completed",
        details: {
          runId,
          outputFile,
          status: effectiveStatus,
          error: effectiveStatus === "failed" ? message : undefined,
        },
      });

      writeFileSync(
        outputFile,
        JSON.stringify(
          {
            run: runRecord,
            turnContext: turnSnapshot,
            prompt,
            output: "",
            error: message,
          },
          null,
          2,
        ),
        "utf-8",
      );

      // 8.4最適化: LLM行動計測（失敗時）
      if (DEFAULT_LLM_BEHAVIOR_CONFIG.enabled && Math.random() < DEFAULT_LLM_BEHAVIOR_CONFIG.samplingRate) {
        try {
          createAndRecordMetrics({
            source: "subagent",
            prompt: { text: prompt },
            output: { text: "" },
            execution: {
              durationMs: Date.now() - startedAtMs,
              retryCount,
              outcomeCode: effectiveStatus === "completed" ? "SUCCESS" : "FAILURE",
              modelUsed: resolvedModel,
              thinkingLevel: "medium",
            },
            context: {
              task: input.task,
              agentId: input.agent.id,
            },
            cwd: input.cwd,
          });
        } catch (err) {
          // 計測エラーは実行に影響させない
          console.debug?.("[subagent] Metrics recording error:", err instanceof Error ? err.message : String(err));
        }
      }

      return {
        runRecord,
        output: "",
        prompt,
        promptStackSummary,
        runtimeNotificationCount: promptPackage.runtimeNotificationCount,
      };
    }
  } finally {
    // 二重ファイナライズ防止: 成功/失敗パスですでにファイナライズ済みの場合はスキップ
    if (!finalized) {
      finalizeActiveSubagentRun({
        cwd: input.cwd,
        runId,
        success: false,
        error: "subagent execution interrupted before completion",
      });
    }
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
