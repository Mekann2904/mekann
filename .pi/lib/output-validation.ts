/**
 * @abdd.meta
 * path: .pi/lib/output-validation.ts
 * role: 構造化された出力形式への準拠を検証するバリデーター
 * why: サブエージェントおよびチームメンバーの出力がフォーマット要件を満たしていることを保証するため
 * related: .pi/lib/output-schema.ts, .pi/lib/subagent-executor.ts, .pi/lib/team-executor.ts
 * public_api: hasNonEmptyResultSection, validateSubagentOutput, validateTeamMemberOutput, SubagentValidationOptions, TeamMemberValidationOptions
 * invariants: 必須ラベル（SUMMARY等）は大文字小文字を区別せず検出される
 * side_effects: スキーマ検証モードが有効な場合、違反記録関数（recordSchemaViolation）を呼び出す
 * failure_modes: 必須ラベル欠如、RESULTセクションの空欄、文字数不足、スキーマ違反
 * @abdd.explain
 * overview: サブエージェントとチームメンバーの出力テキストに対し、正規表現およびオプションでJSONスキーマを用いた構文検証を行うモジュール
 * what_it_does:
 *   - RESULTセクションの内容有無を確認する
 *   - 最小文字数および必須ラベルの存在を検証する
 *   - 機能フラグに基づきレガシー検証、デュアル検証、厳格検証を切り替える
 * why_it_exists:
 *   - エージェントの出力フォーマットを統一し、ダウンストリーム処理の安定性を確保する
 *   - スキーマ検証（P0-1改善）により構造的な整合性を強化する
 * scope:
 *   in: 検証対象の文字列（output）、検証オプション（minChars, requiredLabels）
 *   out: 検証結果（ok: boolean, reason: string）
 */

/**
 * Output validation utilities for subagent and team member outputs.
 * Provides consistent validation for structured output format compliance.
 *
 * Enhanced with schema validation support (P0-1 improvement).
 * Feature Flag: PI_OUTPUT_SCHEMA_MODE
 * - "legacy" (default): Use regex-based validation only
 * - "dual": Run both regex and schema validation, log differences
 * - "strict": Use schema validation only
 *
 * Related: output-schema.ts
 */

import {
  type SchemaValidationMode,
  type SchemaValidationResult,
  type SchemaViolation,
  getSchemaValidationMode,
  validateSubagentOutputWithSchema,
  validateTeamMemberOutputWithSchema,
  recordSchemaViolation,
} from "./output-schema.js";

/**
 * 結果セクションが空でないか判定
 * @summary 結果セクションを判定
 * @param output 検証対象の文字列
 * @returns 空でない場合はtrue
 */
export function hasNonEmptyResultSection(output: string): boolean {
  const lines = output.split(/\r?\n/);
  const resultIndex = lines.findIndex((line) => /^\s*RESULT\s*:/i.test(line));
  if (resultIndex < 0) return false;

  const sameLineContent = lines[resultIndex].replace(/^\s*RESULT\s*:/i, "").trim();
  if (sameLineContent.length > 0) return true;

  for (let index = resultIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*[A-Z_]+\s*:/.test(line)) break;
    if (line.trim().length > 0) return true;
  }

  return false;
}

/**
 * サブエージェント検証オプション
 * @summary 検証オプション定義
 * @interface
 */
export interface SubagentValidationOptions {
  minChars: number;
  requiredLabels: string[];
}

const SUBAGENT_DEFAULT_OPTIONS: SubagentValidationOptions = {
  minChars: 48,
  requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"],
};

/**
 * サブエージェント出力を検証する
 * @summary 出力を検証
 * @param output 検証対象の文字列
 * @param options 検証オプション（部分指定可）
 * @returns 検証結果と理由を含むオブジェクト
 */
export function validateSubagentOutput(
  output: string,
  options?: Partial<SubagentValidationOptions>,
): { ok: boolean; reason?: string } {
  const opts = { ...SUBAGENT_DEFAULT_OPTIONS, ...options };
  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty output" };
  }

  if (trimmed.length < opts.minChars) {
    return { ok: false, reason: `too short (${trimmed.length} chars)` };
  }

  const missingLabels = opts.requiredLabels.filter(
    (label) => !new RegExp(`^\\s*${label}`, "im").test(trimmed),
  );
  if (missingLabels.length > 0) {
    return { ok: false, reason: `missing labels: ${missingLabels.join(", ")}` };
  }

  if (!hasNonEmptyResultSection(trimmed)) {
    return { ok: false, reason: "empty RESULT section" };
  }

  return { ok: true };
}

/**
 * チームメンバー検証オプション
 * @summary 検証オプション定義
 * @interface
 */
export interface TeamMemberValidationOptions {
  minChars: number;
  requiredLabels: string[];
}

const TEAM_MEMBER_DEFAULT_OPTIONS: TeamMemberValidationOptions = {
  minChars: 80,
  requiredLabels: ["SUMMARY:", "CLAIM:", "EVIDENCE:", "RESULT:", "NEXT_STEP:"],
};

/**
 * チームメンバ出力の検証を行う
 * @summary 出力検証実行
 * @param output 検証対象の文字列
 * @param options 検証オプション
 * @returns 検証結果オブジェクト
 */
export function validateTeamMemberOutput(
  output: string,
  options?: Partial<TeamMemberValidationOptions>,
): { ok: boolean; reason?: string } {
  const opts = { ...TEAM_MEMBER_DEFAULT_OPTIONS, ...options };
  const trimmed = output.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty output" };
  }

  if (trimmed.length < opts.minChars) {
    return { ok: false, reason: `too short (${trimmed.length} chars)` };
  }

  const missingLabels = opts.requiredLabels.filter(
    (label) => !new RegExp(`^\\s*${label}`, "im").test(trimmed),
  );
  if (missingLabels.length > 0) {
    return { ok: false, reason: `missing labels: ${missingLabels.join(", ")}` };
  }

  return { ok: true };
}

// ============================================================================
// Enhanced Validation with Schema Support (P0-1)
// ============================================================================

/**
 * スキーマ情報を含む拡張検証結果のインターフェース
 * @summary 拡張検証結果
 */
export interface ExtendedValidationResult {
  ok: boolean;
  reason?: string;
  mode: SchemaValidationMode;
  legacyOk: boolean;
  legacyReason?: string;
  schemaOk?: boolean;
  schemaReason?: string;
  schemaViolations?: SchemaViolation[];
  fallbackUsed: boolean;
}

/**
 * サブエージェント出力の拡張検証を行う
 * @summary サブエージェント検証
 * @param output 検証対象の文字列
 * @param options 検証オプション
 * @returns 拡張検証結果
 */
export function validateSubagentOutputEnhanced(
  output: string,
  options?: Partial<SubagentValidationOptions>,
): ExtendedValidationResult {
  const mode = getSchemaValidationMode();
  const trimmed = output.trim();

  // Legacy validation (reuse existing function for DRY compliance)
  const legacyResult = validateSubagentOutput(trimmed, options);

  // Schema validation (run in dual or strict mode)
  let schemaResult: SchemaValidationResult | undefined;
  if (mode === "dual" || mode === "strict") {
    schemaResult = validateSubagentOutputWithSchema(trimmed, mode);

    // Record violations for analytics
    for (const violation of schemaResult.violations) {
      recordSchemaViolation(violation);
    }
  }

  // Determine final result based on mode
  if (mode === "legacy") {
    return {
      ok: legacyResult.ok,
      reason: legacyResult.reason,
      mode,
      legacyOk: legacyResult.ok,
      legacyReason: legacyResult.reason,
      fallbackUsed: false,
    };
  }

  if (mode === "strict") {
    return {
      ok: schemaResult!.ok,
      reason: schemaResult!.reason,
      mode,
      legacyOk: legacyResult.ok,
      legacyReason: legacyResult.reason,
      schemaOk: schemaResult!.ok,
      schemaReason: schemaResult!.reason,
      schemaViolations: schemaResult!.violations,
      fallbackUsed: false,
    };
  }

  // Dual mode: use legacy for pass/fail, but report schema differences
  const hasDifference = schemaResult && legacyResult.ok !== schemaResult.ok;
  if (hasDifference) {
    // Log the difference for debugging (in production, this would go to a logger)
    // Note: Using console.warn is intentional for development visibility
    // TODO: Replace with proper logging when logger module is available
    console.warn(
      `[output-validation] Validation difference detected: legacy=${legacyResult.ok}, schema=${schemaResult!.ok}`,
    );
  }

  return {
    ok: legacyResult.ok,
    reason: legacyResult.reason,
    mode,
    legacyOk: legacyResult.ok,
    legacyReason: legacyResult.reason,
    schemaOk: schemaResult?.ok,
    schemaReason: schemaResult?.reason,
    schemaViolations: schemaResult?.violations,
    fallbackUsed: false,
  };
}

/**
 * チームメンバ出力の拡張検証を行う
 * @summary 拡張検証実行
 * @param output 検証対象の文字列
 * @param options 検証オプション
 * @returns 拡張検証結果
 */
export function validateTeamMemberOutputEnhanced(
  output: string,
  options?: Partial<TeamMemberValidationOptions>,
): ExtendedValidationResult {
  const mode = getSchemaValidationMode();
  const trimmed = output.trim();

  // Legacy validation (reuse existing function for DRY compliance)
  const legacyResult = validateTeamMemberOutput(trimmed, options);

  // Schema validation (run in dual or strict mode)
  let schemaResult: SchemaValidationResult | undefined;
  if (mode === "dual" || mode === "strict") {
    schemaResult = validateTeamMemberOutputWithSchema(trimmed, mode);

    // Record violations for analytics
    for (const violation of schemaResult.violations) {
      recordSchemaViolation(violation);
    }
  }

  // Determine final result based on mode
  if (mode === "legacy") {
    return {
      ok: legacyResult.ok,
      reason: legacyResult.reason,
      mode,
      legacyOk: legacyResult.ok,
      legacyReason: legacyResult.reason,
      fallbackUsed: false,
    };
  }

  if (mode === "strict") {
    return {
      ok: schemaResult!.ok,
      reason: schemaResult!.reason,
      mode,
      legacyOk: legacyResult.ok,
      legacyReason: legacyResult.reason,
      schemaOk: schemaResult!.ok,
      schemaReason: schemaResult!.reason,
      schemaViolations: schemaResult!.violations,
      fallbackUsed: false,
    };
  }

  // Dual mode: use legacy for pass/fail, but report schema differences
  const hasDifference = schemaResult && legacyResult.ok !== schemaResult.ok;
  if (hasDifference) {
    // Note: Using console.warn is intentional for development visibility
    // TODO: Replace with proper logging when logger module is available
    console.warn(
      `[output-validation] Validation difference detected: legacy=${legacyResult.ok}, schema=${schemaResult!.ok}`,
    );
  }

  return {
    ok: legacyResult.ok,
    reason: legacyResult.reason,
    mode,
    legacyOk: legacyResult.ok,
    legacyReason: legacyResult.reason,
    schemaOk: schemaResult?.ok,
    schemaReason: schemaResult?.reason,
    schemaViolations: schemaResult?.violations,
    fallbackUsed: false,
  };
}
