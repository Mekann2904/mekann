/**
 * @abdd.meta
 * path: .pi/lib/agent-errors.ts
 * role: エラー分類および実行結果解決モジュール
 * why: サブエージェントおよびチームメンバーの実行結果に対し、統一的なエラー分類とスキーマ違反・低品質出力などの意味論的エラー検出を行うため
 * related: ./error-utils.ts, ./agent-types.ts, ./agent-common.ts
 * public_api: ExtendedOutcomeCode, ExtendedOutcomeSignal, classifySemanticError, resolveExtendedFailureOutcome
 * invariants: ExtendedOutcomeSignalのoutcomeCodeはExtendedOutcomeCode型に含まれる値のみをとる
 * side_effects: なし（純粋な関数と型定義のみ）
 * failure_modes: 分類ロジックがエラーメッセージのキーワードに依存するため、予期しないメッセージ形式の場合は分類がnullになる
 * @abdd.explain
 * overview: Layer 1に位置し、共通のエラーユーティリティとエージェント型定義を利用して、実行時の出力内容とエラーオブジェクトから意味論的なエラーを分類・解決するモジュール。
 * what_it_does:
 *   - RunOutcomeCodeを拡張したExtendedOutcomeCode（SCHEMA_VIOLATION, LOW_SUBSTANCE等）を定義する
 *   - 出力文字列やエラーメッセージのパターンマッチングにより、意味論的なエラーを特定する
 *   - エラーと出力内容に基づき、詳細なエラー情報を含むExtendedOutcomeSignalを生成する
 * why_it_exists:
 *   - 従来のステータスコードだけでは表現できない、スキーマ違反や中身のない出力などの品質問題を検知するため
 *   - サブエージェントとチームメンバーの実行結果ハンドリングを共通化し、集約結果の生成（failedEntityIdsなど）を容易にするため
 * scope:
 *   in: エラーオブジェクト（unknown）、出力文字列（string）、エンティティ設定（EntityConfig）
 *   out: 拡張された実行結果コード、エラー詳細配列、結果シグナル（ExtendedOutcomeSignal）
 */

/**
 * Shared agent error handling utilities.
 * Provides unified error classification and outcome resolution for
 * subagent and team member execution.
 *
 * Layer: 1 (depends on Layer 0: error-utils, agent-types)
 *
 * Enhanced with extended error classification (P1-5 improvement).
 * New error types: SCHEMA_VIOLATION, LOW_SUBSTANCE, EMPTY_OUTPUT
 */

import { type EntityType, type EntityConfig, SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG } from "./agent-common.js";
import { type RunOutcomeCode, type RunOutcomeSignal } from "./agent-types.js";
import {
  classifyPressureError,
  extractStatusCodeFromMessage,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  toErrorMessage,
} from "./error-utils.js";

// ============================================================================
// Extended Error Classification (P1-5)
// ============================================================================

/**
 * 拡張実行結果コード
 * @summary 拡張実行結果コード
 */
export type ExtendedOutcomeCode =
  | RunOutcomeCode
  | "SCHEMA_VIOLATION"
  | "LOW_SUBSTANCE"
  | "EMPTY_OUTPUT"
  | "PARSE_ERROR";

/**
 * 拡張実行結果シグナル
 * @summary 拡張実行結果シグナル
 */
export interface ExtendedOutcomeSignal extends Omit<RunOutcomeSignal, 'outcomeCode'> {
  outcomeCode: ExtendedOutcomeCode;
  semanticError?: string;
  schemaViolations?: string[];
  /** Entity IDs that failed (for aggregate outcomes) */
  failedEntityIds?: string[];
}

/**
 * 意味論的エラーを分類
 * @summary 意味論的エラーを分類
 * @param output 出力文字列
 * @param error エラーオブジェクト
 * @returns エラーコードと詳細を含むオブジェクト
 */
export function classifySemanticError(
  output?: string,
  error?: unknown,
): { code: ExtendedOutcomeCode | null; details?: string[] } {
  const errorMessage = error ? toErrorMessage(error).toLowerCase() : "";
  const outputLower = output?.toLowerCase() || "";

  // Schema violation detection
  if (
    errorMessage.includes("schema violation") ||
    errorMessage.includes("missing labels") ||
    errorMessage.includes("invalid format") ||
    errorMessage.includes("validation failed") ||
    outputLower.includes("schema violation")
  ) {
    return { code: "SCHEMA_VIOLATION", details: ["output_format_mismatch"] };
  }

  // Low substance detection (intent-only output)
  if (
    errorMessage.includes("intent-only") ||
    errorMessage.includes("low-substance") ||
    errorMessage.includes("insufficient content")
  ) {
    return { code: "LOW_SUBSTANCE", details: ["intent_only_output"] };
  }

  // Empty output detection
  if (
    errorMessage.includes("empty output") ||
    errorMessage.includes("empty result") ||
    (!output || output.trim().length === 0)
  ) {
    return { code: "EMPTY_OUTPUT", details: ["no_content"] };
  }

  // Parse error detection
  if (
    errorMessage.includes("parse error") ||
    errorMessage.includes("json parse") ||
    errorMessage.includes("syntax error") ||
    errorMessage.includes("unexpected token")
  ) {
    return { code: "PARSE_ERROR", details: ["parsing_failed"] };
  }

  return { code: null };
}

/**
 * 拡張失敗結果を解決
 * @summary 拡張失敗結果を解決
 * @param error 未知のエラーオブジェクト
 * @param output 出力文字列
 * @param config エンティティ設定
 * @returns 拡張実行結果シグナル
 */
export function resolveExtendedFailureOutcome(
  error: unknown,
  output?: string,
  config?: EntityConfig,
): ExtendedOutcomeSignal {
  // First check for semantic errors
  const semantic = classifySemanticError(output, error);
  if (semantic.code) {
    // SCHEMA_VIOLATION and LOW_SUBSTANCE are retryable with different prompts
    const retryable = semantic.code === "SCHEMA_VIOLATION" || semantic.code === "LOW_SUBSTANCE";
    return {
      outcomeCode: semantic.code,
      retryRecommended: retryable,
      semanticError: semantic.code,
      schemaViolations: semantic.details,
    };
  }

  // Fall back to standard failure resolution
  const baseResult = resolveFailureOutcome(error, config);
  return {
    outcomeCode: baseResult.outcomeCode,
    retryRecommended: baseResult.retryRecommended,
  };
}

// ============================================================================
// Retryable Error Patterns (OCP-Compliant Configuration)
// ============================================================================

/**
 * Default retryable error patterns.
 * These patterns are checked against error messages to determine retryability.
 */
const DEFAULT_RETRYABLE_PATTERNS: string[] = [
  "rate limit",
  "too many requests",
  "temporarily unavailable",
  "service unavailable",
  "try again",
  "overloaded",
  "capacity exceeded",
];

/**
 * Cache for parsed retryable patterns from environment variable.
 */
let cachedRetryablePatterns: string[] | undefined;

 /**
  * リトライ可能なエラーパターンを取得
  * @returns エラーメッセージとの照合に使用するパターンの配列
  */
export function getRetryablePatterns(): string[] {
  if (cachedRetryablePatterns !== undefined) {
    return cachedRetryablePatterns;
  }

  const envPatterns = process.env.PI_RETRYABLE_ERROR_PATTERNS;
  if (!envPatterns || envPatterns.trim() === "") {
    cachedRetryablePatterns = [...DEFAULT_RETRYABLE_PATTERNS];
    return cachedRetryablePatterns;
  }

  const additionalPatterns = envPatterns
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  cachedRetryablePatterns = [...DEFAULT_RETRYABLE_PATTERNS, ...additionalPatterns];
  return cachedRetryablePatterns;
}

/**
 * キャッシュをリセット
 * @summary キャッシュをリセット
 * @returns なし
 */
export function resetRetryablePatternsCache(): void {
  cachedRetryablePatterns = undefined;
}

/**
 * 再試行パターンを追加
 * @summary パターン追加
 * @param patterns 再試行リストに追加するパターン
 * @returns なし
 */
export function addRetryablePatterns(patterns: string[]): void {
  const normalizedPatterns = patterns
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  const currentPatterns = cachedRetryablePatterns || DEFAULT_RETRYABLE_PATTERNS;
  const newPatterns = normalizedPatterns.filter((p) => !currentPatterns.includes(p));

  if (newPatterns.length > 0) {
    cachedRetryablePatterns = [...currentPatterns, ...newPatterns];
  }
}

// ============================================================================
// Retryable Error Detection
// ============================================================================

/**
 * 再試行可否判定
 * @summary 再試行可否判定
 * @param error - チェック対象のエラー
 * @param statusCode - HTTPステータスコード（任意）
 * @param config - コンテキスト固有のチェックを行うエンティティ設定
 * @returns エラーが再試行可能な場合はtrue
 */
export function isRetryableEntityError(
  error: unknown,
  statusCode: number | undefined,
  config: EntityConfig,
): boolean {
  const message = toErrorMessage(error).toLowerCase();

  // Check for rate limit status codes
  if (statusCode === 429) {
    return true;
  }

  // Check for server errors (5xx)
  if (statusCode !== undefined && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // Check for entity-specific empty output message
  if (message.includes(config.emptyOutputMessage.toLowerCase())) {
    return true;
  }

  // Check for configured retryable patterns (OCP-compliant: patterns are now configurable)
  const retryablePatterns = getRetryablePatterns();
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

 /**
  * サブエージェントのエラーが再試行可能か判定
  * @param error - チェック対象のエラー
  * @param statusCode - HTTPステータスコード（任意）
  * @returns エラーが再試行可能な場合はtrue
  */
export function isRetryableSubagentError(
  error: unknown,
  statusCode?: number,
): boolean {
  return isRetryableEntityError(error, statusCode, SUBAGENT_CONFIG);
}

/**
 * @summary リトライ可否判定
 * @param error - 判定対象のエラー
 * @param statusCode - HTTPステータスコード（任意）
 * @returns リトライ可能な場合はtrue
 */
export function isRetryableTeamMemberError(
  error: unknown,
  statusCode?: number,
): boolean {
  return isRetryableEntityError(error, statusCode, TEAM_MEMBER_CONFIG);
}

// ============================================================================
// Failure Outcome Resolution
// ============================================================================

/**
 * チームメンバーのエラーが再試行可能か判定
 * @summary 再試行可否判定
 * @param error 不明なエラーオブジェクト
 * @param statusCode ステータスコード
 * @returns 再試行可能な場合はtrue
 */
export function resolveFailureOutcome(
  error: unknown,
  config?: EntityConfig,
): RunOutcomeSignal {
  // Cancellation is never retryable
  if (isCancelledErrorMessage(error)) {
    return { outcomeCode: "CANCELLED", retryRecommended: false };
  }

  // Timeout is always retryable
  if (isTimeoutErrorMessage(error)) {
    return { outcomeCode: "TIMEOUT", retryRecommended: true };
  }

  // Classify pressure-related errors
  const pressure = classifyPressureError(error);
  if (pressure !== "other") {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  // Check for retryable entity-specific errors
  const statusCode = extractStatusCodeFromMessage(error);
  if (config && isRetryableEntityError(error, statusCode, config)) {
    return { outcomeCode: "RETRYABLE_FAILURE", retryRecommended: true };
  }

  // Default to non-retryable failure
  return { outcomeCode: "NONRETRYABLE_FAILURE", retryRecommended: false };
}

/**
 * エラー設定に基づき実行結果を解決する
 * @summary 実行結果を解決
 * @param error 不明なエラーオブジェクト
 * @param config エンティティ設定オプション
 * @returns 実行結果シグナル
 */
export function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, SUBAGENT_CONFIG);
}

/**
 * サブエージェント失敗時の結果解決
 * @summary 失敗結果を解決
 * @param error 不明なエラーオブジェクト
 * @returns 実行結果シグナル
 */
export function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, TEAM_MEMBER_CONFIG);
}

// ============================================================================
// Aggregate Outcome Resolution
// ============================================================================

/**
 * チーム失敗時の結果解決
 * @summary 失敗結果を解決
 * @param error 不明なエラーオブジェクト
 * @returns 実行結果シグナル
 */
export interface EntityResultItem {
  status: "completed" | "failed";
  error?: string;
  summary?: string;
  entityId: string;
}

/**
 * 集計結果解決
 * @summary 結果集計
 * @param results - 実行結果リスト
 * @param resolveEntityFailure - エンティティの失敗を解決する関数
 * @returns 失敗したエンティティIDを含む集計結果シグナル
 */
export function resolveAggregateOutcome<T extends EntityResultItem>(
  results: T[],
  resolveEntityFailure: (error: unknown) => RunOutcomeSignal,
): RunOutcomeSignal & { failedEntityIds: string[] } {
  const failed = results.filter((result) => result.status === "failed");

  if (failed.length === 0) {
    return {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
      failedEntityIds: [],
    };
  }

  const failedEntityIds = failed.map((result) => result.entityId);

  const retryableFailureCount = failed.filter((result) => {
    const failure = resolveEntityFailure(result.error || result.summary);
    return failure.retryRecommended;
  }).length;

  const hasAnySuccess = failed.length < results.length;

  // Partial success if some entities completed
  if (hasAnySuccess) {
    return {
      outcomeCode: "PARTIAL_SUCCESS",
      retryRecommended: retryableFailureCount > 0,
      failedEntityIds,
    };
  }

  // All failed - determine if retryable
  return retryableFailureCount > 0
    ? {
        outcomeCode: "RETRYABLE_FAILURE",
        retryRecommended: true,
        failedEntityIds,
      }
    : {
        outcomeCode: "NONRETRYABLE_FAILURE",
        retryRecommended: false,
        failedEntityIds,
      };
}

/**
 * サブエージェント並列結果解決
 * @summary 並列結果集計
 * @param results - サブエージェントの実行結果リスト
 * @returns 失敗したサブエージェントIDを含む集計結果シグナル
 */
export function resolveSubagentParallelOutcome(
  results: Array<{ runRecord: { status: "completed" | "failed"; error?: string; summary?: string; agentId: string } }>,
): RunOutcomeSignal & { failedSubagentIds: string[] } {
  const mappedResults: EntityResultItem[] = results.map((r) => ({
    status: r.runRecord.status,
    error: r.runRecord.error,
    summary: r.runRecord.summary,
    entityId: r.runRecord.agentId,
  }));

  const outcome = resolveAggregateOutcome(mappedResults, resolveSubagentFailureOutcome);
  return {
    ...outcome,
    failedSubagentIds: outcome.failedEntityIds,
  };
}

/**
 * チームメンバー集計結果解決
 * @summary チーム結果集計
 * @param memberResults - チームメンバーの実行結果リスト
 * @returns 失敗したメンバーIDを含む集計結果シグナル
 */
export function resolveTeamMemberAggregateOutcome(
  memberResults: Array<{ status: "completed" | "failed"; error?: string; summary?: string; memberId: string }>,
): RunOutcomeSignal & { failedMemberIds: string[] } {
  const mappedResults: EntityResultItem[] = memberResults.map((r) => ({
    status: r.status,
    error: r.error,
    summary: r.summary,
    entityId: r.memberId,
  }));

  const outcome = resolveAggregateOutcome(mappedResults, resolveTeamFailureOutcome);
  return {
    ...outcome,
    failedMemberIds: outcome.failedEntityIds,
  };
}

// ============================================================================
// Error Message Utilities
// ============================================================================

/**
 * エラーメッセージ整形
 * @summary メッセージ切り詰め
 * @param message - 元のエラーメッセージ
 * @param maxLength - 最大文字数
 * @returns 整形されたエラーメッセージ
 */
export function trimErrorMessage(message: string, maxLength = 200): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength - 3)}...`;
}

/**
 * 診断コンテキスト構築
 * @summary 診断コンテキスト生成
 * @param context.provider - プロバイダ名
 * @param context.model - モデル名
 * @param context.retries - リトライ回数
 * @param context.lastStatusCode - 最後のステータスコード
 * @param context.lastRetryMessage - 最後のリトライメッセージ
 * @param context.rateLimitWaitMs - レートリミット待機時間（ミリ秒）
 * @param context.rateLimitHits - レートリミットヒット数
 * @param context.gateWaitMs - ゲート待機時間（ミリ秒）
 * @param context.gateHits - ゲートヒット数
 * @returns 構築されたコンテキスト文字列
 */
export function buildDiagnosticContext(context: {
  provider?: string;
  model?: string;
  retries?: number;
  lastStatusCode?: number;
  lastRetryMessage?: string;
  rateLimitWaitMs?: number;
  rateLimitHits?: number;
  gateWaitMs?: number;
  gateHits?: number;
}): string {
  const parts: string[] = [];

  if (context.provider) parts.push(`provider=${context.provider}`);
  if (context.model) parts.push(`model=${context.model}`);
  if (context.retries !== undefined) parts.push(`retries=${context.retries}`);
  if (context.lastStatusCode !== undefined) parts.push(`last_status=${context.lastStatusCode}`);
  if (context.lastRetryMessage) parts.push(`last_retry_error=${trimErrorMessage(context.lastRetryMessage, 60)}`);
  if (context.rateLimitWaitMs && context.rateLimitWaitMs > 0) {
    parts.push(`last_gate_wait_ms=${context.rateLimitWaitMs}`);
  }
  if (context.rateLimitHits && context.rateLimitHits > 0) {
    parts.push(`last_gate_hits=${context.rateLimitHits}`);
  }
  if (context.gateWaitMs !== undefined) parts.push(`gate_wait_ms=${context.gateWaitMs}`);
  if (context.gateHits !== undefined) parts.push(`gate_hits=${context.gateHits}`);

  return parts.join(" ");
}

// ============================================================================
// Failure Classification & Retry Policy Standardization (P2)
// ============================================================================

/**
 * リトライ判定用の標準化された失敗分類
 * @summary 失敗分類型
 * @param {"rate_limit"} HTTP 429 - backoffで処理
 * @param {"capacity"} リソース枯渇 - backoffで処理
 * @returns 失敗分類の種類
 */
export type FailureClassification =
  | "rate_limit"   // HTTP 429 - backoffで処理
  | "capacity"     // リソース枯渇 - backoffで処理
  | "timeout"      // 実行タイムアウト - リトライ可
  | "quality"      // 空出力/低品質 - リトライ可
  | "transient"    // 一時的エラー - リトライ可
  | "permanent";   // 恒久的エラー - リトライ不可

/**
 * Retry policy configuration for each failure classification.
 * Defines whether retry is allowed and maximum retry rounds.
 */
export const RETRY_POLICY: Record<FailureClassification, {
  retryable: boolean;
  maxRounds?: number;
}> = {
  rate_limit:  { retryable: false },
  capacity:    { retryable: false },
  timeout:     { retryable: true, maxRounds: 2 },
  quality:     { retryable: true, maxRounds: 2 },
  transient:   { retryable: true, maxRounds: 2 },
  permanent:   { retryable: false },
};

/**
 * エラー情報を解析して失敗分類を決定
 * @summary 失敗分類決定
 * @param error 発生したエラー
 * @param statusCode HTTPステータスコード
 * @returns 失敗分類結果
 */
export function classifyFailureType(
  error: unknown,
  statusCode?: number,
): FailureClassification {
  const message = toErrorMessage(error).toLowerCase();

  // Rate limit (429)
  if (statusCode === 429 || /rate.?limit|too many requests/.test(message)) {
    return "rate_limit";
  }

  // Capacity
  if (/capacity.?exceeded|overloaded|resource.?unavailable/.test(message)) {
    return "capacity";
  }

  // Timeout
  if (/timeout|timed.?out/.test(message)) {
    return "timeout";
  }

  // Quality issues
  if (/empty.?output|low-substance|intent.?only/.test(message)) {
    return "quality";
  }

  // Transient
  if (/temporarily.?unavailable|try.?again|service.?unavailable/.test(message)) {
    return "transient";
  }

  return "permanent";
}

/**
 * 分類結果に基づきリトライ可否を判定
 * @summary リトライ可否判定
 * @param classification 失敗分類結果
 * @param currentRound 現在の試行回数
 * @returns リトライする場合はtrue
 */
export function shouldRetryByClassification(
  classification: FailureClassification,
  currentRound: number,
): boolean {
  const policy = RETRY_POLICY[classification];
  if (!policy.retryable) return false;
  if (policy.maxRounds === undefined) return true;
  return currentRound < policy.maxRounds;
}

// ============================================================================
// Tool Criticality-Based Partial Failure Tolerance (Error Rate Improvement)
// ============================================================================

/**
 * ツールの重要度レベル
 * @summary ツール重要度レベル
 */
export type ToolCriticalityLevel = "critical" | "non-critical" | "informational";

/**
 * クリティカルなツール（失敗するとAgent Run全体が失敗）
 * @summary クリティカルツール一覧
 */
const CRITICAL_TOOLS: ReadonlySet<string> = new Set([
  "write",
  "edit",
  "agent_team_run",
  "agent_team_run_parallel",
  "subagent_run",
  "subagent_run_parallel",
  "create_tool",
  "delete_dynamic_tool",
]);

/**
 * 情報取得ツール（失敗しても警告のみ）
 * @summary 情報取得ツール一覧
 */
const INFORMATIONAL_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "bash",
  "code_search",
  "file_candidates",
  "sym_find",
  "sym_index",
  "semantic_search",
  "gh_agent",
  "plan_list",
  "plan_show",
  "agent_usage_stats",
]);

/**
 * ツール名から重要度を判定
 * @summary ツール重要度判定
 * @param toolName ツール名（例: "core:bash", "unknown:code_search"）
 * @returns 重要度レベル
 */
export function getToolCriticality(toolName: string): ToolCriticalityLevel {
  // ツール名を正規化（プレフィックスを除去）
  const normalized = toolName.includes(":")
    ? toolName.split(":").pop() ?? toolName
    : toolName;

  if (CRITICAL_TOOLS.has(normalized)) {
    return "critical";
  }

  if (INFORMATIONAL_TOOLS.has(normalized)) {
    return "informational";
  }

  return "non-critical";
}

/**
 * ツール呼び出し結果
 * @summary ツール呼び出し結果
 */
export interface ToolCallResult {
  /** ツール名 */
  toolName: string;
  /** 実行状態 */
  status: "ok" | "error";
  /** エラーメッセージ（任意） */
  errorMessage?: string;
}

/**
 * Agent Run評価結果
 * @summary Agent Run評価結果
 */
export interface AgentRunEvaluation {
  /** 全体の状態 */
  status: "ok" | "warning" | "error";
  /** 失敗したツール数 */
  failedCount: number;
  /** クリティカルな失敗数 */
  criticalFailureCount: number;
  /** 警告数（非クリティカルな失敗） */
  warningCount: number;
  /** 総ツール呼び出し数 */
  totalCount: number;
  /** 評価メッセージ */
  message: string;
  /** Agent Run を失敗とすべきか */
  shouldFail: boolean;
}

/**
 * bash コマンドの exit code 1 が許容されるパターン
 * @summary exit code 1 許容パターン
 */
const BASH_EXIT_ONE_PATTERNS = [
  /^diff\s/,
  /^grep\s/,
  /^test\s/,
  /^\[\s+.*\s+\]$/,
  /^git\s+diff\s/,
  /^comm\s/,
  /^git\s+merge-base\s/,
];

/**
 * bash エラーが許容されるか判定
 * @summary bash エラー許容判定
 * @param errorMessage エラーメッセージ
 * @returns 許容される場合 true
 */
export function isBashErrorTolerated(errorMessage: string): boolean {
  const lowerMessage = errorMessage.toLowerCase();

  // exit code 1 は diff/grep 等では正常
  if (/exited with code 1|exit code 1/.test(lowerMessage)) {
    // 元のコマンドを推測して判定
    for (const pattern of BASH_EXIT_ONE_PATTERNS) {
      if (pattern.test(errorMessage)) {
        return true;
      }
    }
  }

  // npm audit の warning は無視
  if (/npm audit report|severity: moderate|severity: high/.test(lowerMessage)) {
    return true;
  }

  return false;
}

/**
 * 複数のツール呼び出し結果を評価して Agent Run 全体の状態を判定
 * @summary Agent Run 結果評価
 * @param results ツール呼び出し結果一覧
 * @param totalToolCalls 総ツール呼び出し数
 * @returns Agent Run 評価結果
 */
export function evaluateAgentRunOutcome(
  results: ToolCallResult[],
  totalToolCalls?: number,
): AgentRunEvaluation {
  const evaluated = results.map(r => {
    const criticality = getToolCriticality(r.toolName);
    const isError = r.status === "error";
    const isTolerated = isError && r.toolName.includes("bash") && r.errorMessage
      ? isBashErrorTolerated(r.errorMessage || "")
      : false;

    return {
      ...r,
      criticality,
      isError,
      isTolerated,
      isCriticalFailure: isError && criticality === "critical" && !isTolerated,
      isWarning: isError && criticality !== "critical" && !isTolerated,
    };
  });

  const failedCount = evaluated.filter(r => r.isError && !r.isTolerated).length;
  const criticalFailureCount = evaluated.filter(r => r.isCriticalFailure).length;
  const warningCount = evaluated.filter(r => r.isWarning).length;
  const toleratedCount = evaluated.filter(r => r.isTolerated).length;

  // クリティカルな失敗がある場合のみ Agent Run を失敗とする
  if (criticalFailureCount > 0) {
    return {
      status: "error",
      failedCount,
      criticalFailureCount,
      warningCount,
      totalCount: totalToolCalls ?? results.length,
      message: `${criticalFailureCount} critical tool(s) failed (${failedCount} total failures)`,
      shouldFail: true,
    };
  }

  // 警告のみ（非クリティカルな失敗）
  if (warningCount > 0 || toleratedCount > 0) {
    const parts: string[] = [];
    if (warningCount > 0) parts.push(`${warningCount} non-critical failure(s)`);
    if (toleratedCount > 0) parts.push(`${toleratedCount} tolerated`);
    return {
      status: "warning",
      failedCount,
      criticalFailureCount: 0,
      warningCount,
      totalCount: totalToolCalls ?? results.length,
      message: parts.join(", ") + " (ignored)",
      shouldFail: false,
    };
  }

  return {
    status: "ok",
    failedCount: 0,
    criticalFailureCount: 0,
    warningCount: 0,
    totalCount: totalToolCalls ?? results.length,
    message: "All tools completed successfully",
    shouldFail: false,
  };
}

/**
 * エラーメッセージから失敗したツール数を抽出
 * @summary 失敗ツール数抽出
 * @param errorMessage エラーメッセージ（例: "3/17 tool calls failed"）
 * @returns 失敗数と総数、または null
 */
export function parseToolFailureCount(errorMessage: string): { failed: number; total: number } | null {
  const match = errorMessage.match(/(\d+)\/(\d+)\s+tool\s+calls?\s+failed/i);
  if (match) {
    return {
      failed: parseInt(match[1], 10),
      total: parseInt(match[2], 10),
    };
  }
  return null;
}

/**
 * エラーメッセージに基づいて Agent Run の失敗を再評価
 * 現在の "X/Y tool calls failed" エラーをより詳細に分析
 * @summary Agent Run 失敗再評価
 * @param errorMessage エラーメッセージ
 * @returns 再評価結果
 */
export function reevaluateAgentRunFailure(errorMessage: string): {
  shouldDowngrade: boolean;
  originalFailure: { failed: number; total: number } | null;
  suggestedStatus: "ok" | "warning" | "error";
} {
  const parsed = parseToolFailureCount(errorMessage);

  if (!parsed) {
    return {
      shouldDowngrade: false,
      originalFailure: null,
      suggestedStatus: "error",
    };
  }

  const { failed, total } = parsed;
  const failureRate = failed / total;

  // 失敗率が10%以下なら警告に降格
  // bash の exit code 1 等の誤検知が多いケースを想定
  if (failureRate <= 0.1) {
    return {
      shouldDowngrade: true,
      originalFailure: parsed,
      suggestedStatus: "warning",
    };
  }

  // 失敗率が20%以下で、かつ失敗数が3以下なら警告に降格
  if (failureRate <= 0.2 && failed <= 3) {
    return {
      shouldDowngrade: true,
      originalFailure: parsed,
      suggestedStatus: "warning",
    };
  }

  return {
    shouldDowngrade: false,
    originalFailure: parsed,
    suggestedStatus: "error",
  };
}
