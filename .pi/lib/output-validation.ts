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
  * RESULTセクションが空でないか確認する
  * @param output - 検査対象の出力テキスト
  * @returns RESULTセクションに内容がある場合はtrue
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
  * サブエージェント出力の検証オプション。
  * @param minChars - 最小文字数
  * @param requiredLabels - 必須ラベルの配列
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
  * サブエージェントの出力を検証する
  * @param output - 検証対象の出力テキスト
  * @param options - 検証オプション（任意）
  * @returns 検証結果（okとreasonを含むオブジェクト）
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
  * チームメンバー出力の検証オプション
  * @param minChars - 最小文字数
  * @param requiredLabels - 必須ラベルのリスト
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
  * チームメンバーの出力を検証します。
  * @param output - 検証対象の出力テキスト
  * @param options - 検証オプション（任意）
  * @returns 検証結果（okとreasonを含むオブジェクト）
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
  * スキーマ情報を含む拡張検証結果
  * @param ok 検証が成功したか
  * @param reason 失敗の理由
  * @param mode スキーマ検証モード
  * @param legacyOk レガシー検証の成功判定
  * @param legacyReason レガシー検証の失敗理由
  * @param schemaOk スキーマ検証の成功判定
  * @param schemaReason スキーマ検証の失敗理由
  * @param schemaViolations スキーマ違反のリスト
  * @param fallbackUsed フォールバックが使用されたか
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
  * サブエージェント出力を検証
  * @param output - 検証対象の出力テキスト
  * @param options - 検証オプション（省略可）
  * @returns スキーマ詳細を含む拡張検証結果
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
  * 拡張スキーマ対応でチームメンバー出力を検証
  * @param output - 検証対象の出力テキスト
  * @param options - 検証オプション（任意）
  * @returns スキーマ詳細を含む拡張検証結果
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
