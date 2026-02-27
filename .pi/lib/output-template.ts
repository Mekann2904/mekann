/**
 * @abdd.meta
 * path: .pi/lib/output-template.ts
 * role: 出力構造の正規化モジュール
 * why: スキーマ検証失敗時の出力に対して、最小限の構造整合性を保証するため
 * related: .pi/lib/output-schema.ts, .pi/lib/task-execution.ts
 * public_api: NormalizedOutput, TemplateApplicationResult, DEFAULT_OUTPUT_VALUES, applyOutputTemplate
 * invariants: NormalizedOutputの必須フィールドSUMMARY, RESULT, NEXT_STEPは常に非null文字列、CONFIDENCEは常に数値
 * side_effects: なし
 * failure_modes: 不正な型のrawOutput入力、未定義のviolations参照
 * @abdd.explain
 * overview: スキーマ違反を含む生の出力文字列に対し、デフォルト値を適用してダウンストリーム処理に耐えられる構造へ変換する
 * what_it_does:
 *   - SchemaViolationリストから欠落フィールドを特定する
 *   - 空値または欠落している必須フィールドにDEFAULT_OUTPUT_VALUESを適用する
 *   - ParsedStructuredOutputを拡張したNormalizedOutputインターフェースを提供する
 *   - 適用履歴と補完されたフィールドの一覧を返す
 * why_it_exists:
 *   - LLM等の出力がスキーマに厳密に従わない場合でも処理を継続するため
 *   - プログラム的な補完処理により、人間による修正の手間を減らすため
 *   - アプリケーション実行時エラーを防ぐため
 * scope:
 *   in: 生の出力文字列、スキーマ違反リスト
 *   out: 正規化された出力オブジェクト、フォーマット済み文字列、補完メタデータ
 */

/**
 * Output Template Module - Layer 3 of Three-Layer Hybrid Strategy
 *
 * Provides mechanical template application for outputs that fail schema validation.
 * Ensures minimum structural integrity for downstream processing.
 *
 * Related: output-schema.ts, task-execution.ts
 */

import {
  type ParsedStructuredOutput,
  type SchemaViolation,
  parseStructuredOutput,
} from "./output-schema.js";
import { hasInternalModeStructure } from "./output-validation.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 正規化された出力構造
 * @summary 正規化出力インターフェース
 * @description ParsedStructuredOutputを拡張し、必須フィールドを保証する
 */
export interface NormalizedOutput extends ParsedStructuredOutput {
  /** 正規化された要約（常に非null） */
  SUMMARY: string;
  /** 正規化された結果（常に非null） */
  RESULT: string;
  /** 正規化された次のステップ（常に非null） */
  NEXT_STEP: string;
  /** 信頼度（デフォルト0.5） */
  CONFIDENCE: number;
}

/**
 * テンプレート適用結果
 * @summary テンプレート適用結果インターフェース
 */
export interface TemplateApplicationResult {
  /** 正規化された出力 */
  normalized: NormalizedOutput;
  /** 補完されたフィールドのリスト */
  filledFields: string[];
  /** 元の出力から取得できたフィールドのリスト */
  preservedFields: string[];
  /** 出力文字列表現 */
  formatted: string;
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * 各フィールドのデフォルト値定義
 * @summary デフォルト値定数
 */
export const DEFAULT_OUTPUT_VALUES: {
  SUMMARY: string;
  CLAIM: string;
  EVIDENCE: string;
  CONFIDENCE: number;
  COUNTER_EVIDENCE: string;
  DISCUSSION: string;
  RESULT: string;
  NEXT_STEP: string;
} = {
  SUMMARY: "（要約なし）",
  CLAIM: "",
  EVIDENCE: "",
  CONFIDENCE: 0.5,
  COUNTER_EVIDENCE: "",
  DISCUSSION: "",
  RESULT: "（結果なし）",
  NEXT_STEP: "none",
};

// ============================================================================
// Template Application
// ============================================================================

/**
 * フィールドが実質的に空かどうかを判定する
 * @summary 空フィールド判定
 * @param value 判定対象の値
 * @returns 空とみなされる場合true
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  return false;
}

/**
 * 違反から欠落フィールド名を抽出する
 * @summary 欠落フィールド抽出
 * @param violations 違反リスト
 * @returns 欠落フィールド名のセット
 */
function extractMissingFields(violations: SchemaViolation[]): Set<string> {
  const missing = new Set<string>();
  for (const v of violations) {
    if (v.violationType === "missing") {
      missing.add(v.field);
    }
  }
  return missing;
}

/**
 * 出力にテンプレートを適用し、デフォルト値で補完する
 * @summary テンプレート適用
 * @param rawOutput 生の出力文字列
 * @param violations 検出されたスキーマ違反のリスト
 * @returns 正規化された出力と適用結果
 * @example
 * const result = applyOutputTemplate("SUMMARY: Test\nRESULT: ", []);
 * console.log(result.normalized.SUMMARY); // "Test"
 * console.log(result.normalized.RESULT);  // "（結果なし）"（デフォルト値）
 */
export function applyOutputTemplate(
  rawOutput: string,
  violations: SchemaViolation[],
): TemplateApplicationResult {
  const trimmed = rawOutput.trim();

  // INTERNAL モード形式の場合は、そのまま返す（テンプレート適用しない）
  if (hasInternalModeStructure(trimmed)) {
    return {
      normalized: {
        SUMMARY: "[INTERNAL MODE]",
        RESULT: trimmed,
        NEXT_STEP: "none",
        CONFIDENCE: 0.5,
      },
      filledFields: [],
      preservedFields: ["INTERNAL_MODE_OUTPUT"],
      formatted: trimmed,
    };
  }

  const parsed = parseStructuredOutput(rawOutput);
  const missingFields = extractMissingFields(violations);
  const filledFields: string[] = [];
  const preservedFields: string[] = [];

  // 各フィールドを処理
  const normalized: NormalizedOutput = {
    SUMMARY: "",
    RESULT: "",
    NEXT_STEP: "",
    CONFIDENCE: DEFAULT_OUTPUT_VALUES.CONFIDENCE,
  };

  // SUMMARY（必須）
  if (isEmptyValue(parsed.SUMMARY)) {
    normalized.SUMMARY = DEFAULT_OUTPUT_VALUES.SUMMARY;
    filledFields.push("SUMMARY");
  } else {
    normalized.SUMMARY = parsed.SUMMARY;
    preservedFields.push("SUMMARY");
  }

  // RESULT（必須）
  if (isEmptyValue(parsed.RESULT)) {
    normalized.RESULT = DEFAULT_OUTPUT_VALUES.RESULT;
    filledFields.push("RESULT");
  } else {
    normalized.RESULT = parsed.RESULT;
    preservedFields.push("RESULT");
  }

  // NEXT_STEP（必須）
  if (isEmptyValue(parsed.NEXT_STEP)) {
    normalized.NEXT_STEP = DEFAULT_OUTPUT_VALUES.NEXT_STEP;
    filledFields.push("NEXT_STEP");
  } else {
    normalized.NEXT_STEP = parsed.NEXT_STEP ?? DEFAULT_OUTPUT_VALUES.NEXT_STEP;
    preservedFields.push("NEXT_STEP");
  }

  // 任意フィールド
  if (parsed.CLAIM && !isEmptyValue(parsed.CLAIM)) {
    normalized.CLAIM = parsed.CLAIM;
    preservedFields.push("CLAIM");
  }

  if (parsed.EVIDENCE && !isEmptyValue(parsed.EVIDENCE)) {
    normalized.EVIDENCE = parsed.EVIDENCE;
    preservedFields.push("EVIDENCE");
  }

  if (parsed.COUNTER_EVIDENCE && !isEmptyValue(parsed.COUNTER_EVIDENCE)) {
    normalized.COUNTER_EVIDENCE = parsed.COUNTER_EVIDENCE;
    preservedFields.push("COUNTER_EVIDENCE");
  }

  if (parsed.DISCUSSION && !isEmptyValue(parsed.DISCUSSION)) {
    normalized.DISCUSSION = parsed.DISCUSSION;
    preservedFields.push("DISCUSSION");
  }

  // CONFIDENCE（数値）
  if (
    parsed.CONFIDENCE !== undefined &&
    Number.isFinite(parsed.CONFIDENCE) &&
    parsed.CONFIDENCE >= 0 &&
    parsed.CONFIDENCE <= 1
  ) {
    normalized.CONFIDENCE = parsed.CONFIDENCE;
    preservedFields.push("CONFIDENCE");
  } else {
    filledFields.push("CONFIDENCE");
  }

  // 文字列表現を生成
  const formatted = formatNormalizedOutput(normalized);

  return {
    normalized,
    filledFields,
    preservedFields,
    formatted,
  };
}

/**
 * 正規化された出力を文字列形式に変換する
 * @summary 出力フォーマット変換
 * @param output 正規化された出力
 * @returns フォーマットされた文字列
 */
export function formatNormalizedOutput(output: NormalizedOutput): string {
  const lines: string[] = [];

  lines.push(`SUMMARY: ${output.SUMMARY}`);

  if (output.CLAIM) {
    lines.push(`CLAIM: ${output.CLAIM}`);
  }

  if (output.EVIDENCE) {
    lines.push(`EVIDENCE: ${output.EVIDENCE}`);
  }

  lines.push(`CONFIDENCE: ${output.CONFIDENCE.toFixed(2)}`);

  if (output.COUNTER_EVIDENCE) {
    lines.push(`COUNTER_EVIDENCE: ${output.COUNTER_EVIDENCE}`);
  }

  if (output.DISCUSSION) {
    lines.push(`DISCUSSION: ${output.DISCUSSION}`);
  }

  lines.push("");
  lines.push("RESULT:");
  lines.push(output.RESULT);
  lines.push("");
  lines.push(`NEXT_STEP: ${output.NEXT_STEP}`);

  return lines.join("\n");
}

/**
 * 生の出力が最小限の構造を持っているかを確認する
 * @summary 最小構造確認
 * @param rawOutput 生の出力文字列
 * @returns 最小構造を持つ場合true
 */
export function hasMinimumStructure(rawOutput: string): boolean {
  const parsed = parseStructuredOutput(rawOutput);
  return (
    !isEmptyValue(parsed.SUMMARY) &&
    !isEmptyValue(parsed.RESULT)
  );
}
