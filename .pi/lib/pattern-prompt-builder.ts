/**
 * @abdd.meta
 * path: .pi/lib/pattern-prompt-builder.ts
 * role: プロンプト用パターン情報のフォーマットとセクション構築
 * why: 抽出されたパターン情報をLLMプロンプトで利用可能な形式に統一し、制約ではなく対話相手として扱う文脈を提供するため
 * related: .pi/lib/pattern-extraction.ts
 * public_api: RelevantPattern, PromptLanguage, toRelevantPattern, formatPatternForPrompt, buildPatternsPromptSection
 * invariants: 出力テキストはMAX_PATTERN_DESCRIPTION_LENGTH以内に切り詰められる, セクション見出しは「対話相手、制約ではない」ことを強調する
 * side_effects: なし
 * failure_modes: 入力配列がundefinedまたは空の場合は空文字列を返す
 * @abdd.explain
 * overview: 過去の実行パターンをプロンプトに埋め込むための文字列生成モジュール
 * what_it_does:
 *   - 抽出されたパターンをプロンプト用の簡易構造体(RelevantPattern)に変換する
 *   - パターン説明文を文字数制限に従って切り詰める
 *   - パターン種別ごとに分類し、プロンプトセクション文字列を構築する
 * why_it_exists:
 *   - パターン情報の表示形式を標準化し、プロンプト設計の一貫性を保つため
 *   - パターンをLLMへの「対話相手」として提示し、過度な制約として認識させないようにするため
 * scope:
 *   in: ExtractedPattern(またはRelevantPattern)配列, 言語設定
 *   out: プロンプト埋め込み用のフォーマット済み文字列
 */

/**
 * Pattern Prompt Builder Module.
 * Provides unified formatting for patterns in prompts.
 * Promotes "dialogue partners, not constraints" approach.
 */

import type { ExtractedPattern } from "./pattern-extraction.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 簡略化されたパターン情報（プロンプト用）
 */
export interface RelevantPattern {
  patternType: "success" | "failure" | "approach";
  taskType: string;
  description: string;
  agentOrTeam: string;
  confidence: number;
  keywords: string[];
}

/**
 * プロンプト言語設定
 */
export type PromptLanguage = "en" | "ja";

// ============================================================================
// Constants
// ============================================================================

const MAX_PATTERN_DESCRIPTION_LENGTH = 80;
const MAX_PATTERNS_PER_TYPE = 2;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * テキストを指定長で切り詰め
 * @summary テキスト切り詰め
 * @param text 元のテキスト
 * @param maxLength 最大長
 * @returns 切り詰められたテキスト
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * ExtractedPatternをRelevantPatternに変換
 * @summary パターン変換
 * @param pattern 元のパターン
 * @returns 簡略化されたパターン
 */
export function toRelevantPattern(pattern: ExtractedPattern): RelevantPattern {
  return {
    patternType: pattern.patternType,
    taskType: pattern.taskType,
    description: pattern.description,
    agentOrTeam: pattern.agentOrTeam,
    confidence: pattern.confidence,
    keywords: pattern.keywords,
  };
}

/**
 * 単一パターンをフォーマット
 * @summary パターンフォーマット
 * @param pattern パターン情報
 * @param language 言語設定
 * @returns フォーマットされた文字列
 */
export function formatPatternForPrompt(
  pattern: RelevantPattern,
  language: PromptLanguage = "en"
): string {
  const desc = truncateText(pattern.description, MAX_PATTERN_DESCRIPTION_LENGTH);
  const prefix = `[${pattern.agentOrTeam}]`;
  return `- ${prefix} ${desc}`;
}

// ============================================================================
// Main Builder Function
// ============================================================================

/**
 * パターンセクションを構築
 * @summary パターンセクション構築
 * @param patterns 関連パターン配列
 * @param language 言語設定（デフォルト: 英語）
 * @returns 構築されたプロンプトセクション（空の場合は空文字列）
 */
export function buildPatternsPromptSection(
  patterns: RelevantPattern[] | undefined,
  language: PromptLanguage = "en"
): string {
  if (!patterns || patterns.length === 0) {
    return "";
  }

  const lines: string[] = [];
  
  // Header - always emphasize "dialogue partners, not constraints"
  if (language === "ja") {
    lines.push("過去の実行パターン（対話相手、制約ではない）:");
  } else {
    lines.push("Patterns from past executions (dialogue partners, not constraints):");
  }

  // Separate by type
  const successPatterns = patterns.filter(p => p.patternType === "success");
  const failurePatterns = patterns.filter(p => p.patternType === "failure");
  const approachPatterns = patterns.filter(p => p.patternType === "approach");

  // Success patterns
  if (successPatterns.length > 0) {
    if (language === "ja") {
      lines.push("以前に成功したアプローチ:");
    } else {
      lines.push("Previously successful:");
    }
    for (const p of successPatterns.slice(0, MAX_PATTERNS_PER_TYPE)) {
      lines.push(formatPatternForPrompt(p, language));
    }
  }

  // Failure patterns
  if (failurePatterns.length > 0) {
    if (language === "ja") {
      lines.push("以前に課題があったアプローチ:");
    } else {
      lines.push("Previously challenging:");
    }
    for (const p of failurePatterns.slice(0, MAX_PATTERNS_PER_TYPE)) {
      lines.push(formatPatternForPrompt(p, language));
    }
  }

  // Approach patterns
  if (approachPatterns.length > 0) {
    if (language === "ja") {
      lines.push("関連するアプローチ:");
    } else {
      lines.push("Relevant approaches:");
    }
    for (const p of approachPatterns.slice(0, MAX_PATTERNS_PER_TYPE)) {
      lines.push(formatPatternForPrompt(p, language));
    }
  }

  // Closing question - promotes deterritorialization
  lines.push("");
  if (language === "ja") {
    lines.push("考慮事項: これらのパターンは今回のタスクに適用できるか？できない場合、なぜ？新しいアプローチが必要か？");
  } else {
    lines.push("Consider: Do these patterns apply to THIS task? If not, why? What NEW approach might be needed?");
  }

  return lines.join("\n");
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * 日本語でパターンセクションを構築
 * @summary 日本語パターンセクション
 * @param patterns 関連パターン配列
 * @returns 構築されたプロンプトセクション
 */
export function buildPatternsPromptSectionJa(
  patterns: RelevantPattern[] | undefined
): string {
  return buildPatternsPromptSection(patterns, "ja");
}

/**
 * 英語でパターンセクションを構築
 * @summary 英語パターンセクション
 * @param patterns 関連パターン配列
 * @returns 構築されたプロンプトセクション
 */
export function buildPatternsPromptSectionEn(
  patterns: RelevantPattern[] | undefined
): string {
  return buildPatternsPromptSection(patterns, "en");
}
