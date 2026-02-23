/**
 * @abdd.meta
 * path: .pi/lib/output-validation.ts
 * role: サブエージェントおよびチームメンバーの出力文字列に対する構造バリデーションを行うユーティリティ
 * why: 出力形式の一貫性を担保し、後続処理でのエラーを防止するため
 * related: .pi/lib/output-schema.ts
 * public_api: hasNonEmptyResultSection, validateSubagentOutput, validateTeamMemberOutput, SubagentValidationOptions, TeamMemberValidationOptions
 * invariants: 必須ラベルがすべて存在する場合にのみtrueを返す、RESULTセクションの内容が空の場合はfalseを返す
 * side_effects: なし（純粋な関数）
 * failure_modes: 必須ラベルの欠如、文字数不足、RESULTセクションの欠損または空欄
 * @abdd.explain
 * overview: 構造化された出力フォーマットへの準拠を確認する正規表現ベースのバリデータ
 * what_it_does:
 *   - RESULTセクションに空でない内容が含まれるか判定する
 *   - 文字数が最小要件を満たすか判定する
 *   - 事前に定義された必須ラベル（SUMMARY, RESULT等）の存在を正規表現で検証する
 *   - サブエージェントとチームメンバーで異なるバリデーションルールを適用する
 * why_it_exists:
 *   - エージェントの出力品質を保証する
 *   - 不正な形式によるパースエラーを回避する
 *   - PI_OUTPUT_SCHEMA_MODE機能フラグによる移行期間の運用をサポートする
 * scope:
 *   in: 検証対象の文字列、オプション設定（最小文字数、必須ラベルリスト）
 *   out: バリデーション結果（真偽値）と失敗理由の文字列
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
