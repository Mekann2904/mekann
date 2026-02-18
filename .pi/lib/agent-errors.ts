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
  * 拡張エラー分類コード
  */
export type ExtendedOutcomeCode =
  | RunOutcomeCode
  | "SCHEMA_VIOLATION"
  | "LOW_SUBSTANCE"
  | "EMPTY_OUTPUT"
  | "PARSE_ERROR";

 /**
  * 拡張された実行結果シグナル
  * @param outcomeCode - 拡張されたエラー分類コード
  * @param semanticError - セマンティックエラーメッセージ
  * @param schemaViolations - スキーマ違反の詳細
  * @param failedEntityIds - 失敗したエンティティID（集約結果向け）
  */
export interface ExtendedOutcomeSignal extends Omit<RunOutcomeSignal, 'outcomeCode'> {
  outcomeCode: ExtendedOutcomeCode;
  semanticError?: string;
  schemaViolations?: string[];
  /** Entity IDs that failed (for aggregate outcomes) */
  failedEntityIds?: string[];
}

 /**
  * 出力内容から意味論的なエラーを分類する
  * @param output - 解析対象の出力内容
  * @param error - 利用可能な場合のエラーオブジェクト
  * @returns 拡張エラーコードと詳細（任意）、エラーなしの場合はnull
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
  * 拡張失敗結果を解決して分類する
  * @param error 発生したエラー
  * @param output 利用可能な出力内容
  * @param config エンティティの設定
  * @returns 意味的分類を含む拡張結果シグナル
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
  * キャッシュされたリトライ可能パターンをリセット
  * @returns なし
  */
export function resetRetryablePatternsCache(): void {
  cachedRetryablePatterns = undefined;
}

 /**
  * 再試行パターンを実行時に追加する
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
  * エンティティ実行時のエラーが再試行可能か判定
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
  * チームメンバーのエラーがリトライ可能か判定
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
  * 失敗時の結果シグナルを解決する
  * @param error 発生したエラー
  * @param config エンティティ設定（省略可）
  * @returns コードとリトライ推奨度を含む結果シグナル
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
  * サブエージェントの失敗結果を解決する
  * @param error - 発生したエラー
  * @returns コードと再試行推奨を含む結果シグナル
  */
export function resolveSubagentFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, SUBAGENT_CONFIG);
}

 /**
  * チームメンバーの失敗結果を解決する
  * @param error - 発生したエラー
  * @returns コードと再試行推奨を含む結果シグナル
  */
export function resolveTeamFailureOutcome(error: unknown): RunOutcomeSignal {
  return resolveFailureOutcome(error, TEAM_MEMBER_CONFIG);
}

// ============================================================================
// Aggregate Outcome Resolution
// ============================================================================

 /**
  * 集約結果解決用の結果項目インターフェース
  * @param status - ステータス（"completed" または "failed"）
  * @param error - エラーメッセージ（任意）
  * @param summary - サマリー（任意）
  * @param entityId - エンティティID
  */
export interface EntityResultItem {
  status: "completed" | "failed";
  error?: string;
  summary?: string;
  entityId: string;
}

 /**
  * 複数の結果から集約された実行結果を解決する
  * @param results - エンティティの結果の配列
  * @param resolveEntityFailure - 個別のエンティティの失敗結果を解決する関数
  * @returns 失敗したエンティティIDを含む集約結果
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
 * Resolve aggregate outcome for subagent parallel execution.
 *
 * @param results - Array of subagent run results
 * @returns Aggregate outcome with failed subagent IDs
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
  * チームメンバーの実行結果を集約する
  * @param memberResults - チームメンバーの実行結果の配列
  * @returns 失敗したメンバーIDを含む集約結果
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
  * エラーメッセージを最大長に合わせて切り詰める
  * @param message - 切り詰める対象のエラーメッセージ
  * @param maxLength - 最大文字長（デフォルト: 200）
  * @returns 切り詰められたメッセージ
  */
export function trimErrorMessage(message: string, maxLength = 200): string {
  if (message.length <= maxLength) return message;
  return `${message.slice(0, maxLength - 3)}...`;
}

 /**
  * 診断コンテキスト文字列を構築します
  * @param context - 診断情報オブジェクト
  * @param context.provider - プロバイダ名
  * @param context.model - モデル名
  * @param context.retries - リトライ回数
  * @param context.lastStatusCode - 最後のステータスコード
  * @param context.lastRetryMessage - 最後のリトライメッセージ
  * @param context.rateLimitWaitMs - レートリミット待機時間（ミリ秒）
  * @param context.rateLimitHits - レートリヒット数
  * @param context.gateWaitMs - ゲート待機時間（ミリ秒）
  * @param context.gateHits - ゲートヒット数
  * @returns フォーマットされた診断文字列
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
  * @param rate_limit HTTP 429 - backoffで処理
  * @param capacity リソース枯渇 - backoffで処理
  * @param timeout 実行タイムアウト - リトライ可
  * @param quality 空出力/低品質 - リトライ可
  * @param transient 一時的エラー - リトライ可
  * @param permanent 恒久的エラー - リトライ不可
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
  * エラーをリトライ判定用の標準カテゴリに分類
  * @param error - 分類対象のエラー
  * @param statusCode - 文脈情報のためのHTTPステータスコード（省略可）
  * @returns 失敗分類カテゴリ
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
  * 失敗分類に基づきリトライ可否を判定
  * @param classification - 失敗分類
  * @param currentRound - 現在のリトライ回数（0始まり）
  * @returns リトライする場合はtrue、それ以外はfalse
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
