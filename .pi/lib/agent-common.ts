/**
 * @abdd.meta
 * path: .pi/lib/agent-common.ts
 * role: エージェント共通ユーティリティライブラリ
 * why: subagents.tsとagent-teams.ts間のコード重複を排除し、統一された実行時プロファイルと設定を提供するため
 * related: subagents.ts, agent-teams.ts, validation-utils.ts, error-utils.ts
 * public_api: STABLE_RUNTIME_PROFILE, ADAPTIVE_PARALLEL_MAX_PENALTY, ADAPTIVE_PARALLEL_DECAY_MS, STABLE_MAX_RETRIES, STABLE_INITIAL_DELAY_MS, STABLE_MAX_DELAY_MS, STABLE_MAX_RATE_LIMIT_RETRIES, STABLE_MAX_RATE_LIMIT_WAIT_MS, EntityType, EntityConfig, SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG
 * invariants: STABLE_RUNTIME_PROFILE=trueの場合、ADAPTIVE_PARALLEL_MAX_PENALTYは常に0、リトライ設定は固定値を使用
 * side_effects: なし（純粋な定数・型定義のみ）
 * failure_modes: なし（実行時処理を行わない）
 * @abdd.explain
 * overview: SubagentとTeam Memberの実行で使用する共通定数・型・設定オブジェクトを提供するLayer 1モジュール
 * what_it_does:
 *   - 安定した実行時プロファイル用のグローバルフラグと並列処理ペナルティ設定を定義
 *   - リトライ・バックオフ・レート制限用の固定パラメータを提供
 *   - EntityType（subagent/team-member）の型定義とEntityConfigインターフェースを定義
 *   - SUBAGENT_CONFIGとTEAM_MEMBER_CONFIGのデフォルト設定オブジェクトをエクスポート
 * why_it_exists:
 *   - subagents.tsとagent-teams.tsの設定値重複を一箇所に集約
 *   - 本番環境での予測可能な動作を保証する安定プロファイルの統一管理
 *   - エンティティ種別ごとの挙動差異を設定オブジェクトで抽象化
 * scope:
 *   in: validation-utils.ts（toFiniteNumberWithDefault）
 *   out: subagents.ts, agent-teams.ts
 */

/**
 * Shared agent common utilities.
 * Provides unified constants and functions for subagent and team member execution.
 * Eliminates code duplication between subagents.ts and agent-teams.ts.
 *
 * Layer: 1 (depends on Layer 0: error-utils, validation-utils, format-utils)
 */

import { toFiniteNumberWithDefault } from "./validation-utils.js";

// ============================================================================
// Stable Runtime Profile Constants
// ============================================================================

/**
 * Global stable runtime profile flag.
 * When true, enables deterministic behavior for production reliability:
 * - Disables ad-hoc retry tuning
 * - Uses fixed default retry/timeout parameters
 * - Prevents unpredictable fan-out behavior
 *
 * Both subagents.ts and agent-teams.ts should use this unified constant.
 */
export const STABLE_RUNTIME_PROFILE = true;

/**
 * Adaptive parallelism penalty configuration.
 * In stable mode (STABLE_RUNTIME_PROFILE = true), max penalty is 0 to ensure
 * predictable parallelism. In development mode, allows up to 3 penalty steps.
 */
export const ADAPTIVE_PARALLEL_MAX_PENALTY = STABLE_RUNTIME_PROFILE ? 0 : 3;

/**
 * Adaptive parallelism decay interval in milliseconds.
 * Penalties decay after this duration of successful operations.
 */
export const ADAPTIVE_PARALLEL_DECAY_MS = 8 * 60 * 1000; // 8 minutes

// ============================================================================
// Retry Configuration Constants (Stable Profile)
// ============================================================================

/**
 * Maximum retry attempts for stable runtime profile.
 * Reduced from 4 to 2 for faster failure detection and recovery.
 */
export const STABLE_MAX_RETRIES = 2;

/**
 * Initial delay for retry backoff in milliseconds.
 * Reduced from 1000ms for faster initial retry.
 */
export const STABLE_INITIAL_DELAY_MS = 800;

/**
 * Maximum delay for retry backoff in milliseconds.
 * Reduced from 30000ms (30s) to 10000ms (10s) for faster recovery.
 */
export const STABLE_MAX_DELAY_MS = 10_000;

/**
 * Maximum retry attempts specifically for rate limit errors.
 * Reduced from 6 to 4 for faster fallback.
 */
export const STABLE_MAX_RATE_LIMIT_RETRIES = 4;

/**
 * Maximum wait time for rate limit gate in milliseconds.
 */
export const STABLE_MAX_RATE_LIMIT_WAIT_MS = 90_000;

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Entity type identifier for shared functions.
 * Used to distinguish between subagent and team member contexts.
 */
export type EntityType = "subagent" | "team-member";

 /**
  * エンティティ固有の挙動を設定します。
  * @param type エンティティの種類
  * @param label エンティティのラベル
  * @param emptyOutputMessage 出力が空の場合のメッセージ
  * @param defaultSummaryFallback デフォルトの要約フォールバック
  */
export interface EntityConfig {
  type: EntityType;
  label: string;
  emptyOutputMessage: string;
  defaultSummaryFallback: string;
}

/**
 * Default subagent configuration.
 */
export const SUBAGENT_CONFIG: EntityConfig = {
  type: "subagent",
  label: "subagent",
  emptyOutputMessage: "subagent returned empty output",
  defaultSummaryFallback: "回答を整形しました。",
};

/**
 * Default team member configuration.
 */
export const TEAM_MEMBER_CONFIG: EntityConfig = {
  type: "team-member",
  label: "team member",
  emptyOutputMessage: "agent team member returned empty output",
  defaultSummaryFallback: "情報を整理しました。",
};

// ============================================================================
// Normalized Output Types
// ============================================================================

 /**
  * エンティティ出力を正規化した結果
  * @param ok 成功したかどうか
  * @param output 出力文字列
  * @param degraded 品質が低下しているかどうか
  * @param reason 理由（オプション）
  */
export interface NormalizedEntityOutput {
  ok: boolean;
  output: string;
  degraded: boolean;
  reason?: string;
}

// ============================================================================
// Field Candidate Picker
// ============================================================================

 /**
  * pickFieldCandidate関数のオプション
  * @param maxLength 候補テキストの最大長
  * @param excludeLabels 除外対象のラベル（例: SUMMARY:, RESULT:）
  * @param fallback 有効な候補が見つからない場合の代替テキスト
  */
export interface PickFieldCandidateOptions {
  /** Maximum length for the candidate text */
  maxLength: number;
  /** Labels to exclude from consideration (e.g., SUMMARY:, RESULT:) */
  excludeLabels?: string[];
  /** Fallback text when no valid candidate found */
  fallback?: string;
}

 /**
  * テキストから候補となるフィールドを抽出する
  * @param text 抽出元の生テキスト
  * @param options 設定オプション
  * @returns 抽出された候補テキスト
  */
export function pickFieldCandidate(
  text: string,
  options: PickFieldCandidateOptions,
): string {
  const { maxLength, excludeLabels = [], fallback = "Processed." } = options;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return fallback;
  }

  // Build regex pattern for excluded labels
  const labelPattern = excludeLabels.length > 0
    ? new RegExp(`^(${excludeLabels.join("|")})\\s*:`, "i")
    : null;

  // Find first line that doesn't match excluded labels
  const first =
    labelPattern
      ? lines.find((line) => !labelPattern.test(line)) ?? lines[0]
      : lines[0];

  // Clean markdown and formatting
  const compact = first
    .replace(/^[-*]\s+/, "")           // Remove list markers
    .replace(/^#{1,6}\s+/, "")         // Remove heading markers
    .replace(/\s+/g, " ")              // Normalize whitespace
    .trim();

  if (!compact) {
    return fallback;
  }

  // Truncate if needed
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength)}...`;
}

 /**
  * SUMMARYフィールドの候補テキストを選択する
  * @param text - 生の出力テキスト
  * @returns 抽出された要約の候補
  */
export function pickSummaryCandidate(text: string): string {
  return pickFieldCandidate(text, {
    maxLength: 90,
    excludeLabels: ["SUMMARY", "RESULT", "NEXT_STEP"],
    fallback: SUBAGENT_CONFIG.defaultSummaryFallback,
  });
}

/**
 * Pick candidate text for CLAIM field.
 * Convenience wrapper with team-member-specific defaults.
 *
 * @param text - Raw output text
 * @returns Extracted claim candidate
 */
export function pickClaimCandidate(text: string): string {
  return pickFieldCandidate(text, {
    maxLength: 120,
    excludeLabels: ["SUMMARY", "CLAIM", "EVIDENCE", "CONFIDENCE", "RESULT", "NEXT_STEP"],
    fallback: "主張を特定できませんでした。",
  });
}

// ============================================================================
// Entity Output Normalization
// ============================================================================

 /**
  * normalizeEntityOutput関数のオプション
  * @param config コンテキスト依存の動作のためのエンティティ設定
  * @param validateFn 出力形式をチェックするバリデーション関数
  * @param requiredLabels 構造化出力に必要なラベル
  * @param pickSummary フィールド候補を抽出する関数
  * @param includeConfidence CONFIDENCEフィールドを含めるかどうか（チームメンバーのみ）
  * @param formatAdditionalFields 追加フィールド用のカスタムフォーマッタ
  */
export interface NormalizeEntityOutputOptions {
  /** Entity configuration for context-specific behavior */
  config: EntityConfig;
  /** Validation function to check output format */
  validateFn: (output: string) => { ok: boolean; reason?: string };
  /** Required labels for structured output */
  requiredLabels: string[];
  /** Function to extract field candidates */
  pickSummary?: (text: string) => string;
  /** Whether to include CONFIDENCE field (team member only) */
  includeConfidence?: boolean;
  /** Custom formatter for additional fields */
  formatAdditionalFields?: (text: string) => string[];
}

 /**
  * エンティティ出力を正規化
  * @param output - 生の出力テキスト
  * @param options - 正規化オプション
  * @returns 正規化された出力結果
  */
export function normalizeEntityOutput(
  output: string,
  options: NormalizeEntityOutputOptions,
): NormalizedEntityOutput {
  const {
    config,
    validateFn,
    requiredLabels,
    pickSummary = pickSummaryCandidate,
    includeConfidence = false,
    formatAdditionalFields,
  } = options;

  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, output: "", degraded: false, reason: "empty output" };
  }

  // Check if output already conforms to required format
  const quality = validateFn(trimmed);
  if (quality.ok) {
    return { ok: true, output: trimmed, degraded: false };
  }

  // Attempt to restructure output
  const summary = pickSummary(trimmed);

  const lines: string[] = [
    `SUMMARY: ${summary}`,
  ];

  // Add additional fields for team member format
  if (includeConfidence) {
    const claim = pickClaimCandidate(trimmed);
    lines.push(`CLAIM: ${claim}`);
    lines.push("EVIDENCE: not-provided");
  }

  // Add custom fields if provided
  if (formatAdditionalFields) {
    lines.push(...formatAdditionalFields(trimmed));
  }

  // Add RESULT section
  lines.push("RESULT:");
  lines.push(trimmed);

  // Add NEXT_STEP
  lines.push("NEXT_STEP: none");

  const structured = lines.join("\n");

  // Validate restructured output
  const structuredQuality = validateFn(structured);
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
// Utility Functions
// ============================================================================

 /**
  * 出力が空であることを示すエラーメッセージか判定する
  * @param message - チェック対象のエラーメッセージ
  * @param config - エンティティ設定
  * @returns メッセージが空出力を示す場合はtrue
  */
export function isEmptyOutputFailureMessage(
  message: string,
  config: EntityConfig,
): boolean {
  return message.toLowerCase().includes(config.emptyOutputMessage.toLowerCase());
}

 /**
  * エラーの要約を作成する
  * @param message - エラーメッセージ
  * @returns 失敗の要約文字列
  */
export function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

 /**
  * 環境変数で上書き可能なタイムアウトを解決
  * @param defaultMs - デフォルトのタイムアウト（ミリ秒）
  * @param envKey - 確認する環境変数のキー
  * @returns 解決されたタイムアウト値
  */
export function resolveTimeoutWithEnv(
  defaultMs: number,
  envKey: string,
): number {
  const envValue = process.env[envKey];
  if (!envValue) return defaultMs;

  const parsed = toFiniteNumberWithDefault(envValue, defaultMs);
  return Math.max(0, Math.trunc(parsed));
}


