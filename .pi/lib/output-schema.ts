/**
 * @abdd.meta
 * path: .pi/lib/output-schema.ts
 * role: 出力スキーマ定義と検証ロジックの実装
 * why: サブエージェントおよびチームメンバーの出力に対し、JSON Schemaライクな構造チェックと制約検証を行うため
 * related: .pi/lib/text-parsing.ts, .pi/lib/output-validation.ts, .pi/lib/agent-teams/judge.ts
 * public_api: SchemaValidationMode, SchemaValidationResult, SchemaViolation, ParsedStructuredOutput
 * invariants: SchemaFieldのtypeは"string"|"number"|"string[]"のいずれかである
 * side_effects: なし
 * failure_modes: スキーマ定義と入力データの型不一致により検証例外が発生する
 * @abdd.explain
 * overview: 構造化出力のスキーマ定義およびその検証結果を表す型を提供するモジュール
 * what_it_does:
 *   - SchemaValidationModeで検証モードを定義する
 *   - SchemaFieldおよびOutputSchemaで検証ルールを定義する
 *   - SchemaValidationResultで検証成功/失敗の詳細を保持する
 *   - ParsedStructuredOutputで解析済みの出力データ構造を規定する
 * why_it_exists:
 *   - 正規表現検証に加え、フィールドの型や長さなどの構造的制約を適用するため
 *   - 検証結果とエラー理由を呼び出し元に明確に伝達するため
 *   - 機能フラグ（PI_OUTPUT_SCHEMA_MODE）によるモード切替を型システムでサポートするため
 * scope:
 *   in: text-parsing.tsからのユーティリティ関数、出力検証の設定
 *   out: スキーマ型定義、検証結果インターフェース、サブエージェント出力用スキーマ定数
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
 * スキーマ検証モード定義
 * @summary 検証モード
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
 * スキーマ検証の実行結果
 * @summary 検証結果インターフェース
 */
export interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
  violations: SchemaViolation[];
  fallbackUsed: boolean;
  parsed?: ParsedStructuredOutput;
}

/**
 * スキーマ違反の詳細情報
 * @summary 違反情報インターフェース
 */
export interface SchemaViolation {
  field: string;
  violationType: "missing" | "too_short" | "too_long" | "pattern_mismatch" | "out_of_range" | "invalid_type";
  expected: string;
  actual?: string;
}

/**
 * 構造化出力の解析結果
 * @summary 解析結果インターフェース
 */
export interface ParsedStructuredOutput {
  SUMMARY: string;
  CLAIM?: string;
  EVIDENCE?: string;
  CONFIDENCE?: number;
  COUNTER_EVIDENCE?: string;
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
 * Optional: COUNTER_EVIDENCE, DISCUSSION, CONFIDENCE
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
  COUNTER_EVIDENCE: {
    type: "string",
    required: false,
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
 * 通信IDモードの型定義
 * @summary 通信IDモード型
 */
export type CommunicationIdMode = "legacy" | "structured";

/**
 * Cache for communication ID mode.
 */
let cachedCommunicationIdMode: CommunicationIdMode | undefined;

/**
 * 通信IDモードを取得する
 * @summary 通信IDモード取得
 * @returns {CommunicationIdMode} 通信IDモード ("legacy" | "structured")
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
 * キャッシュをリセットする
 * @summary キャッシュリセット
 * @returns {void}
 */
export function resetCommunicationIdModeCache(): void {
  cachedCommunicationIdMode = undefined;
}

/**
 * モードを設定する
 * @summary モード設定
 * @param {CommunicationIdMode} mode モード
 * @returns {void}
 */
export function setCommunicationIdMode(mode: CommunicationIdMode): void {
  cachedCommunicationIdMode = mode;
}

// ============================================================================
// Stance Classification Mode (P0-2: Structured Communication Context)
// ============================================================================

/**
 * 分類モードの型定義
 * @summary 型定義
 */
export type StanceClassificationMode = "disabled" | "heuristic" | "structured";

/**
 * Cache for stance classification mode.
 */
let cachedStanceClassificationMode: StanceClassificationMode | undefined;

/**
 * 分類モードを取得する
 * @summary モード取得
 * @returns {StanceClassificationMode} 分類モード
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
 * キャッシュをリセットする
 * @summary キャッシュリセット
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
 * 現在の検証モードを取得
 * @summary 検証モード取得
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
 * キャッシュをリセット
 * @summary キャッシュをリセット
 * @returns なし
 */
export function resetSchemaValidationModeCache(): void {
  cachedMode = undefined;
}

/**
 * @summary スキーマ検証モードを設定
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
 * 構造化出力を解析
 * @summary 構造化出力を解析
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

  const counterEvidence = extractField(output, "COUNTER_EVIDENCE");
  if (counterEvidence) parsed.COUNTER_EVIDENCE = counterEvidence;

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
 * サブエージェント出力を検証
 * @summary 出力検証(サブ)
 * @param {string} output 検証対象の出力文字列
 * @param {SchemaValidationMode} mode 検証モード
 * @returns {SchemaValidationResult} 検証結果
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
 * チームメンバー出力を検証
 * @summary 出力検証(チーム)
 * @param {string} output 検証対象の出力文字列
 * @param {SchemaValidationMode} mode 検証モード
 * @returns {SchemaValidationResult} 検証結果
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
// Layer 1: Schema Enforcement with Regeneration (Three-Layer Hybrid Strategy)
// ============================================================================

/**
 * 再生成設定の構成
 * @summary 再生成設定インターフェース
 */
export interface RegenerationConfig {
  /** 最大再試行回数 */
  maxRetries: number;
  /** 再試行間のバックオフ時間（ミリ秒） */
  backoffMs: number;
  /** 再生成時のコールバック（ロギング用） */
  onRegenerate?: (attempt: number, violations: SchemaViolation[]) => void;
}

/** 再生成設定のデフォルト値 */
const DEFAULT_REGENERATION_CONFIG: RegenerationConfig = {
  maxRetries: 2,
  backoffMs: 100,
};

/**
 * スキーマ強制付き生成の結果
 * @summary 強制生成結果インターフェース
 */
export interface SchemaEnforcementResult {
  /** 最終的な出力文字列 */
  output: string;
  /** 試行回数（初期生成を含む） */
  attempts: number;
  /** 検出された違反のリスト */
  violations: SchemaViolation[];
  /** 解析済みの出力（成功時のみ） */
  parsed?: ParsedStructuredOutput;
}

/**
 * 指定時間待機する
 * @summary 待機ユーティリティ
 * @param ms 待機時間（ミリ秒）
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 違反情報からフィードバックメッセージを生成する
 * @summary フィードバック生成
 * @param violations 違反リスト
 * @returns フィードバックメッセージ
 */
function buildViolationFeedback(violations: SchemaViolation[]): string {
  const feedbackLines = violations.map((v) => {
    switch (v.violationType) {
      case "missing":
        return `- ${v.field}: 必須フィールドが欠落しています`;
      case "too_short":
        return `- ${v.field}: 文字数が不足しています（${v.actual}、期待: ${v.expected}）`;
      case "too_long":
        return `- ${v.field}: 文字数が超過しています（${v.actual}、期待: ${v.expected}）`;
      case "out_of_range":
        return `- ${v.field}: 値が範囲外です（${v.actual}、期待: ${v.expected}）`;
      case "pattern_mismatch":
        return `- ${v.field}: パターンに一致しません（${v.actual}）`;
      case "invalid_type":
        return `- ${v.field}: 型が不正です（${v.actual}、期待: ${v.expected}）`;
      default:
        return `- ${v.field}: ${v.violationType}`;
    }
  });
  return `以下の問題を修正してください:\n${feedbackLines.join("\n")}`;
}

/**
 * スキーマ検証に失敗した場合に再生成を試行する
 * @summary スキーマ強制生成
 * @param generateFn 出力生成関数
 * @param schema 検証に使用するスキーマ
 * @param config 再生成設定（部分指定可）
 * @returns 生成結果と試行回数を含む結果オブジェクト
 * @example
 * const result = await generateWithSchemaEnforcement(
 *   async () => await generateFromLLM(),
 *   SCHEMAS.subagent,
 *   { maxRetries: 2 }
 * );
 * console.log(`Attempts: ${result.attempts}, Violations: ${result.violations.length}`);
 */
export async function generateWithSchemaEnforcement(
  generateFn: () => Promise<string>,
  schema: OutputSchema,
  config?: Partial<RegenerationConfig>,
): Promise<SchemaEnforcementResult> {
  const cfg = { ...DEFAULT_REGENERATION_CONFIG, ...config };
  let attempts = 0;
  let lastViolations: SchemaViolation[] = [];
  let lastOutput = "";

  while (attempts <= cfg.maxRetries) {
    attempts += 1;

    try {
      const output = await generateFn();
      lastOutput = output;

      const parsed = parseStructuredOutput(output);
      const violations = validateAgainstSchema(parsed, schema);

      if (violations.length === 0) {
        return {
          output,
          attempts,
          violations: [],
          parsed,
        };
      }

      lastViolations = violations;

      // 再生成が必要な場合、コールバックを呼び出し
      if (cfg.onRegenerate) {
        cfg.onRegenerate(attempts, violations);
      }

      // 最大試行回数に達していない場合、バックオフ
      if (attempts <= cfg.maxRetries) {
        await sleep(cfg.backoffMs * attempts);
      }
    } catch (error) {
      // 生成関数がエラーを投げた場合、再試行を継続
      if (attempts > cfg.maxRetries) {
        throw error;
      }
      await sleep(cfg.backoffMs * attempts);
    }
  }

  // 再生成回数を超えた場合、最後の結果を返す
  return {
    output: lastOutput,
    attempts,
    violations: lastViolations,
    parsed: undefined,
  };
}

/**
 * 再生成用のフィードバック付きプロンプトを構築する
 * @summary フィードバック付きプロンプト構築
 * @param originalPrompt 元のプロンプト
 * @param violations 前回の違反リスト
 * @returns フィードバックを追加したプロンプト
 */
export function buildRegenerationPrompt(
  originalPrompt: string,
  violations: SchemaViolation[],
): string {
  const feedback = buildViolationFeedback(violations);
  return [
    originalPrompt,
    "",
    "---",
    "前回の出力に問題がありました。再生成してください。",
    feedback,
  ].join("\n");
}

// ============================================================================
// Violation Tracking (for analytics and debugging)
// ============================================================================

/** 上限エントリ数（防御的設定） */
const MAX_VIOLATION_STATS_ENTRIES = 100;

/**
 * Global violation counter for analytics.
 */
const violationStats: Map<string, number> = new Map();

/**
 * スキーマ違反を記録
 * @summary 違反を記録
 * @param {SchemaViolation} violation 違反情報
 * @returns {void}
 */
export function recordSchemaViolation(violation: SchemaViolation): void {
  const key = `${violation.field}:${violation.violationType}`;
  const current = violationStats.get(key) || 0;
  
  // 新規エントリの場合、上限チェック
  if (current === 0 && violationStats.size >= MAX_VIOLATION_STATS_ENTRIES) {
    // 最も古いエントリを削除
    const firstKey = violationStats.keys().next().value;
    if (firstKey !== undefined) {
      violationStats.delete(firstKey);
    }
  }
  
  violationStats.set(key, current + 1);
}

/**
 * 違反統計を取得
 * @summary 違反統計取得
 * @returns {Map<string, number>} 違反キーとカウントのマップ
 */
export function getSchemaViolationStats(): Map<string, number> {
  return new Map(violationStats);
}

/**
 * 違反統計をリセット
 * @summary 違反統計リセット
 * @returns {void}
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
