/**
 * @abdd.meta
 * path: .pi/lib/output-schema.ts
 * role: サブエージェントおよびチームメンバーの出力に対するJSON Schemaライクな検証機能を提供する
 * why: LLM出力の構造を保証し、パースエラーを削減して下流処理の信頼性を向上させるため
 * related: text-parsing.ts, output-validation.ts, agent-teams/judge.ts
 * public_api: SchemaValidationMode, SchemaValidationResult, SchemaViolation, ParsedStructuredOutput
 * invariants: SUMMARYは10〜500文字、RESULTは20〜10000文字の範囲内、SchemaValidationResult.violationsは失敗時に常に空配列以上を含む
 * side_effects: なし（純粋な検証・パース関数のみ）
 * failure_modes: パターン不一致でフィールド抽出失敗、文字数制限超過で検証不合格、不正な型で型エラー
 * @abdd.explain
 * overview: 構造化出力のスキーマ定義と検証機能を提供するモジュール
 * what_it_does:
 *   - 出力フィールドの必須/任意定義、型、文字数範囲、正規表現パターンによるスキーマ定義
 *   - テキスト抽出、信頼度パース・クランプ処理の呼び出し
 *   - legacy/dual/strictの3モードによる検証切り替え（PI_OUTPUT_SCHEMA_MODE）
 * why_it_exists:
 *   - 正規表現ベースのみの検証では不十分なケースに対応するため
 *   - サブエージェント出力の一貫性を強制し、後続処理の失敗を防ぐため
 * scope:
 *   in: サブエージェント/チームメンバーの生テキスト出力、スキーマ定義
 *   out: 検証結果、違反リスト(SchemaViolation)、パース済み構造化データ
 */

/**
 * Structured output schema definitions and validation.
 * Provides JSON Schema-like validation for subagent and team member outputs.
 *
 * Feature Flag: PI_OUTPUT_SCHEMA_MODE
 * - "legacy" (default): Use regex-based validation only
 * - "dual": Run both regex and schema validation, log differences
 * - "strict": Use schema validation only
 *
 * Related: output-validation.ts, agent-teams/judge.ts
 */

import {
  extractField,
  parseUnitInterval,
  clampConfidence,
} from "./text-parsing.js";

// ============================================================================
// Schema Types
// ============================================================================

 /**
  * 出力スキーマ検証モード
  * @type {"legacy" | "dual" | "strict"}
  */
export type SchemaValidationMode = "legacy" | "dual" | "strict";

/**
 * Schema field definition.
 */
interface SchemaField {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  type: "string" | "number" | "string[]";
}

/**
 * Schema definition for structured output.
 */
interface OutputSchema {
  [fieldName: string]: SchemaField;
}

 /**
  * スキーマ検証の結果を表します。
  * @param ok 検証が成功したかどうか
  * @param reason 失敗の理由
  * @param violations 違反のリスト
  * @param fallbackUsed フォールバックが使用されたかどうか
  * @param parsed パースされた構造化データ
  */
export interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
  violations: SchemaViolation[];
  fallbackUsed: boolean;
  parsed?: ParsedStructuredOutput;
}

 /**
  * 個別のスキーマ違反
  * @param field 違反が発生したフィールド名
  * @param violationType 違反の種類
  * @param expected 期待される値
  * @param actual 実際の値
  */
export interface SchemaViolation {
  field: string;
  violationType: "missing" | "too_short" | "too_long" | "pattern_mismatch" | "out_of_range" | "invalid_type";
  expected: string;
  actual?: string;
}

 /**
  * 構造化された出力データの解析結果
  * @param SUMMARY 概要
  * @param CLAIM 主張
  * @param EVIDENCE 証拠
  * @param CONFIDENCE 信頼度
  * @param DISCUSSION 議論
  * @param RESULT 結果
  * @param NEXT_STEP 次のステップ
  */
export interface ParsedStructuredOutput {
  SUMMARY: string;
  CLAIM?: string;
  EVIDENCE?: string;
  CONFIDENCE?: number;
  DISCUSSION?: string;
  RESULT: string;
  NEXT_STEP?: string;
}

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema for subagent output.
 * Required: SUMMARY, RESULT
 * Optional: NEXT_STEP
 */
const SUBAGENT_OUTPUT_SCHEMA: OutputSchema = {
  SUMMARY: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 500,
  },
  RESULT: {
    type: "string",
    required: true,
    minLength: 20,
    maxLength: 10000,
  },
  NEXT_STEP: {
    type: "string",
    required: false,
    maxLength: 500,
  },
};

/**
 * Schema for team member output.
 * Required: SUMMARY, CLAIM, EVIDENCE, RESULT, NEXT_STEP
 */
const TEAM_MEMBER_OUTPUT_SCHEMA: OutputSchema = {
  SUMMARY: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 300,
  },
  CLAIM: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 500,
  },
  EVIDENCE: {
    type: "string",
    required: true,
    minLength: 5,
    maxLength: 2000,
  },
  DISCUSSION: {
    type: "string",
    required: false,
    maxLength: 3000,
  },
  RESULT: {
    type: "string",
    required: true,
    minLength: 20,
    maxLength: 10000,
  },
  NEXT_STEP: {
    type: "string",
    required: true,
    maxLength: 500,
  },
};

// ============================================================================
// Feature Flag Management
// ============================================================================

/**
 * Communication ID mode for structured output processing.
 * - "legacy" (default): No structured claim/evidence IDs
 * - "structured": Enable claim and evidence ID tracking
 */
export type CommunicationIdMode = "legacy" | "structured";

/**
 * Cache for communication ID mode.
 */
let cachedCommunicationIdMode: CommunicationIdMode | undefined;

 /**
  * 現在のコミュニケーションIDモードを取得
  * @returns 現在のコミュニケーションIDモード
  */
export function getCommunicationIdMode(): CommunicationIdMode {
  if (cachedCommunicationIdMode !== undefined) {
    return cachedCommunicationIdMode;
  }

  const envMode = process.env.PI_COMMUNICATION_ID_MODE?.toLowerCase();
  if (envMode === "structured") {
    cachedCommunicationIdMode = "structured";
  } else {
    // Default: legacy mode for backward compatibility
    cachedCommunicationIdMode = "legacy";
  }

  return cachedCommunicationIdMode;
}

 /**
  * キャッシュされた通信IDモードをリセットする
  * @returns なし
  */
export function resetCommunicationIdModeCache(): void {
  cachedCommunicationIdMode = undefined;
}

 /**
  * 通信IDモードを設定する
  * @param mode 設定する通信IDモード
  * @returns なし
  */
export function setCommunicationIdMode(mode: CommunicationIdMode): void {
  cachedCommunicationIdMode = mode;
}

// ============================================================================
// Stance Classification Mode (P0-2: Structured Communication Context)
// ============================================================================

 /**
  * 態度分類モード
  * @param "disabled" 分類なし（デフォルト、互換性維持）
  * @param "heuristic" 正規表現ベースのパターンマッチング
  * @param "structured" 信頼度スコア付きの完全構造化分析
  */
export type StanceClassificationMode = "disabled" | "heuristic" | "structured";

/**
 * Cache for stance classification mode.
 */
let cachedStanceClassificationMode: StanceClassificationMode | undefined;

 /**
  * 現在のスタンス分類モードを取得する。
  * @returns 現在のスタンス分類モード（デフォルトは "disabled"）
  */
export function getStanceClassificationMode(): StanceClassificationMode {
  if (cachedStanceClassificationMode !== undefined) {
    return cachedStanceClassificationMode;
  }

  const mode = process.env.PI_STANCE_CLASSIFICATION_MODE || "disabled";
  if (["disabled", "heuristic", "structured"].includes(mode)) {
    cachedStanceClassificationMode = mode as StanceClassificationMode;
  } else {
    // Default: disabled for backward compatibility
    cachedStanceClassificationMode = "disabled";
  }

  return cachedStanceClassificationMode;
}

 /**
  * キャッシュされたスタンス分類モードをリセットする
  * @returns {void}
  */
export function resetStanceClassificationModeCache(): void {
  cachedStanceClassificationMode = undefined;
}

 /**
  * スタンス分類モードを設定する
  * @param mode 設定するスタンス分類モード
  * @returns なし
  */
export function setStanceClassificationMode(mode: StanceClassificationMode): void {
  cachedStanceClassificationMode = mode;
}

/**
 * Cache for schema validation mode.
 */
let cachedMode: SchemaValidationMode | undefined;

 /**
  * 現在のスキーマ検証モードを取得する
  * @returns 現在の検証モード
  */
export function getSchemaValidationMode(): SchemaValidationMode {
  if (cachedMode !== undefined) {
    return cachedMode;
  }

  const envMode = process.env.PI_OUTPUT_SCHEMA_MODE?.toLowerCase();
  if (envMode === "legacy") {
    cachedMode = "legacy";
  } else if (envMode === "dual") {
    cachedMode = "dual";
  } else {
    // Default: strict mode (migration complete)
    cachedMode = "strict";
  }

  return cachedMode;
}

 /**
  * キャッシュされたスキーマ検証モードをリセットする。
  * @returns なし
  */
export function resetSchemaValidationModeCache(): void {
  cachedMode = undefined;
}

 /**
  * 実行時にスキーマ検証モードを設定する（主にテスト用）。
  * @param mode 設定するスキーマ検証モード
  * @returns なし
  */
export function setSchemaValidationMode(mode: SchemaValidationMode): void {
  cachedMode = mode;
}

// ============================================================================
// Schema Validation
// ============================================================================

 /**
  * 構造化された出力テキストを解析する
  * @param output - 生の出力テキスト
  * @returns 解析された構造化出力
  */
export function parseStructuredOutput(output: string): ParsedStructuredOutput {
  const parsed: ParsedStructuredOutput = {
    SUMMARY: extractField(output, "SUMMARY") || "",
    RESULT: extractField(output, "RESULT") || "",
  };

  const claim = extractField(output, "CLAIM");
  if (claim) parsed.CLAIM = claim;

  const evidence = extractField(output, "EVIDENCE");
  if (evidence) parsed.EVIDENCE = evidence;

  const confidenceRaw = extractField(output, "CONFIDENCE");
  if (confidenceRaw) {
    parsed.CONFIDENCE = parseUnitInterval(confidenceRaw);
  }

  const discussion = extractField(output, "DISCUSSION");
  if (discussion) parsed.DISCUSSION = discussion;

  const nextStep = extractField(output, "NEXT_STEP");
  if (nextStep) parsed.NEXT_STEP = nextStep;

  return parsed;
}

/**
 * Validate a single field against its schema definition.
 *
 * @param fieldName - Field name
 * @param value - Field value
 * @param schema - Schema definition for the field
 * @returns Array of violations (empty if valid)
 */
function validateField(
  fieldName: string,
  value: unknown,
  schema: SchemaField,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  // Check required
  if (schema.required && (value === undefined || value === null || value === "")) {
    violations.push({
      field: fieldName,
      violationType: "missing",
      expected: "required field",
    });
    return violations;
  }

  // Skip further validation if optional and missing
  if (value === undefined || value === null || value === "") {
    return violations;
  }

  // Type validation
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      violations.push({
        field: fieldName,
        violationType: "invalid_type",
        expected: "number",
        actual: String(value),
      });
      return violations;
    }

    // Range validation
    if (schema.min !== undefined && value < schema.min) {
      violations.push({
        field: fieldName,
        violationType: "out_of_range",
        expected: `>= ${schema.min}`,
        actual: String(value),
      });
    }
    if (schema.max !== undefined && value > schema.max) {
      violations.push({
        field: fieldName,
        violationType: "out_of_range",
        expected: `<= ${schema.max}`,
        actual: String(value),
      });
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") {
      violations.push({
        field: fieldName,
        violationType: "invalid_type",
        expected: "string",
        actual: String(value),
      });
      return violations;
    }

    // Length validation
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      violations.push({
        field: fieldName,
        violationType: "too_short",
        expected: `min ${schema.minLength} chars`,
        actual: `${value.length} chars`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      violations.push({
        field: fieldName,
        violationType: "too_long",
        expected: `max ${schema.maxLength} chars`,
        actual: `${value.length} chars`,
      });
    }

    // Pattern validation
    if (schema.pattern && !schema.pattern.test(value)) {
      violations.push({
        field: fieldName,
        violationType: "pattern_mismatch",
        expected: `pattern ${schema.pattern}`,
        actual: value.slice(0, 50),
      });
    }
  }

  return violations;
}

/**
 * Validate parsed output against a schema.
 *
 * @param parsed - Parsed output object
 * @param schema - Schema to validate against
 * @returns Array of violations (empty if valid)
 */
function validateAgainstSchema(
  parsed: ParsedStructuredOutput,
  schema: OutputSchema,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = (parsed as unknown as Record<string, unknown>)[fieldName];
    const fieldViolations = validateField(fieldName, value, fieldSchema);
    violations.push(...fieldViolations);
  }

  return violations;
}

 /**
  * サブエージェントの出力をスキーマ検証する
  * @param output - 生の出力テキスト
  * @param mode - 検証モード
  * @returns 検証結果
  */
export function validateSubagentOutputWithSchema(
  output: string,
  mode: SchemaValidationMode = getSchemaValidationMode(),
): SchemaValidationResult {
  const parsed = parseStructuredOutput(output);
  const violations = validateAgainstSchema(parsed, SUBAGENT_OUTPUT_SCHEMA);

  const ok = violations.length === 0;
  const reason = ok
    ? undefined
    : `schema violations: ${violations.map((v) => `${v.field}:${v.violationType}`).join(", ")}`;

  return {
    ok,
    reason,
    violations,
    fallbackUsed: false,
    parsed: ok ? parsed : undefined,
  };
}

 /**
  * チームメンバー出力のスキーマ検証
  * @param output - 生の出力テキスト
  * @param mode - 検証モード（デフォルトは現在の設定）
  * @returns 違反とフォールバックフラグを含む検証結果
  */
export function validateTeamMemberOutputWithSchema(
  output: string,
  mode: SchemaValidationMode = getSchemaValidationMode(),
): SchemaValidationResult {
  const parsed = parseStructuredOutput(output);
  const violations = validateAgainstSchema(parsed, TEAM_MEMBER_OUTPUT_SCHEMA);

  const ok = violations.length === 0;
  const reason = ok
    ? undefined
    : `schema violations: ${violations.map((v) => `${v.field}:${v.violationType}`).join(", ")}`;

  return {
    ok,
    reason,
    violations,
    fallbackUsed: false,
    parsed: ok ? parsed : undefined,
  };
}

// ============================================================================
// Violation Tracking (for analytics and debugging)
// ============================================================================

/**
 * Global violation counter for analytics.
 */
const violationStats: Map<string, number> = new Map();

 /**
  * スキーマ違反を記録する
  * @param violation - 記録する違反情報
  * @returns void
  */
export function recordSchemaViolation(violation: SchemaViolation): void {
  const key = `${violation.field}:${violation.violationType}`;
  const current = violationStats.get(key) || 0;
  violationStats.set(key, current + 1);
}

 /**
  * スキーマ違反の統計情報を取得
  * @returns 違反キーとカウントのマップ
  */
export function getSchemaViolationStats(): Map<string, number> {
  return new Map(violationStats);
}

 /**
  * スキーマ違反の統計情報をリセットする。
  */
export function resetSchemaViolationStats(): void {
  violationStats.clear();
}

// ============================================================================
// Exports
// ============================================================================

export const SCHEMAS = {
  subagent: SUBAGENT_OUTPUT_SCHEMA,
  teamMember: TEAM_MEMBER_OUTPUT_SCHEMA,
} as const;
