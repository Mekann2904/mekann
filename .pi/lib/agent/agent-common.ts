/**
 * @abdd.meta
 * path: .pi/lib/agent-common.ts
 * role: サブエージェントおよびチームメンバー実行のための共通定数・型定義・ユーティリティの提供
 * why: subagents.tsとagent-teams.ts間でコードを重複させず、実行プロファイルや設定を一元管理するため
 * related: .pi/lib/subagents.ts, .pi/lib/agent-teams.ts, .pi/lib/validation-utils.js
 * public_api: EntityType, EntityConfig, STABLE_RUNTIME_PROFILE, SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG, 各種定数
 * invariants: STABLE_RUNTIME_PROFILEがtrueの場合、ADAPTIVE_PARALLEL_MAX_PENALTYは0となる
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェント実行（サブエージェント/チームメンバー）に共通する定数設定、型定義、および実行プロファイルを管理するモジュール
 * what_it_does:
 *   - 安定した実行プロファイル（STABLE_RUNTIME_PROFILE）に基づくリトライ・並列処理パラメータの提供
 *   - エンティティ種別（EntityType）と設定（EntityConfig）の型定義
 *   - サブエージェントとチームメンバーのデフォルト設定定数のエクスポート
 * why_it_exists:
 *   - 実行時の挙動を決定する設定値を複数のファイルで重複定義することを避けるため
 *   - 本番環境での信頼性確保と開発モードでの挙動を切り替えるためのフラグ管理が必要なため
 *   - エンティティごとの設定差分を明確にし、型安全に取り扱うため
 * scope:
 *   in: validation-utils.js
 *   out: 定数、型定数、インターフェース定義
 */

/**
 * Shared agent common utilities.
 * Provides unified constants and functions for subagent and team member execution.
 * Eliminates code duplication between subagents.ts and agent-teams.ts.
 *
 * Layer: 1 (depends on Layer 0: error-utils, validation-utils, format-utils)
 */

import { toFiniteNumberWithDefault } from "../core/validation-utils.js";

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
 * エンティティの種別
 * @summary エンティティ種別
 * @returns {"subagent"|"team-member"} エンティティの種類
 */
export type EntityType = "subagent" | "team-member";

/**
 * エンティティ設定を定義
 * @summary エンティティ定義
 * @param type エンティティの種類
 * @param label 表示ラベル
 * @param emptyOutputMessage 出力がない場合のメッセージ
 * @param defaultSummaryFallback サマリーのフォールバック
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
 * 正規化エンティティ出力
 *
 * @summary 正規化エンティティ出力
 * @param ok 成功フラグ
 * @param output 出力文字列
 * @param degraded 劣化フラグ
 * @param reason 理由
 * @returns 出力オブジェクト
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
 * フィールド候補オプション
 *
 * @summary 候補選択オプション定義
 * @param maxLength 最大文字数
 * @param excludeLabels 除外ラベルリスト
 * @param fallback フォールバックテキスト
 * @returns オプションオブジェクト
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
 * フィールド候補を選択
 *
 * @summary フィールド候補を選択
 * @param text 入力テキスト
 * @param options オプション設定
 * @returns 選択されたテキスト
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
 * 概要候補を選択
 *
 * @summary 概要候補を選択
 * @param text 入力テキスト
 * @returns 選択された概要候補テキスト
 */
export function pickSummaryCandidate(text: string): string {
  return pickFieldCandidate(text, {
    maxLength: 90,
    excludeLabels: ["SUMMARY", "RESULT", "NEXT_STEP"],
    fallback: SUBAGENT_CONFIG.defaultSummaryFallback,
  });
}

/**
 * CLAIM候補を選択
 *
 * @summary CLAIM候補を選択
 * @param text 入力テキスト
 * @returns 選択されたCLAIM候補テキスト
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
 * 正規化オプション定義
 * @summary オプション定義
 * @param config エンティティ設定
 * @param validateFn 検証関数
 * @param requiredLabels 必須ラベル
 * @param pickSummary サマリー抽出関数
 * @param includeConfidence 信頼度を含むか
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
 * @summary 出力の正規化
 * @param output 生の出力文字列
 * @param options 正規化オプション
 * @returns 正規化された出力オブジェクト
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
 * 空出力による失敗か判定
 * @summary 空出力失敗判定
 * @param message チェック対象メッセージ
 * @param config エンティティ設定
 * @returns 空出力失敗の場合はtrue
 */
export function isEmptyOutputFailureMessage(
  message: string,
  config: EntityConfig,
): boolean {
  return message.toLowerCase().includes(config.emptyOutputMessage.toLowerCase());
}

/**
 * 失敗要約メッセージを構築
 * @summary 要約メッセージ構築
 * @param message エラーメッセージ
 * @returns 構築された要約メッセージ
 */
export function buildFailureSummary(message: string): string {
  const lowered = message.toLowerCase();
  if (lowered.includes("empty output")) return "(failed: empty output)";
  if (lowered.includes("timed out") || lowered.includes("timeout")) return "(failed: timeout)";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "(failed: rate limit)";
  return "(failed)";
}

/**
 * タイムアウト値を環境変数から取得
 * @summary タイムアウト値取得
 * @param defaultMs デフォルトのミリ秒
 * @param envKey 環境変数のキー名
 * @returns 適用されたタイムアウト時間（ミリ秒）
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


