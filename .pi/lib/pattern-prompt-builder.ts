/**
 * @abdd.meta
 * path: .pi/lib/pattern-prompt-builder.ts
 * role: パターン参照をプロンプトに組み込むための共通ビルダー関数
 * why: loop.ts, agent-teams, subagentsでの重複コードを削減し、一貫性を確保するため
 * related: .pi/lib/pattern-extraction.ts, .pi/extensions/loop/iteration-builder.ts
 * public_api: buildPatternsPromptSection, formatPatternForPrompt, RelevantPattern
 * invariants: パターンは常に「対話相手」として提示され、「制約」として提示されない
 * side_effects: なし（純粋な関数）
 * failure_modes: 空のパターン配列の場合は空文字列を返す
 * @abdd.explain
 * overview: 過去の実行パターンをプロンプトに組み込むための統一的なフォーマッタ
 * what_it_does:
 *   - パターンを成功/失敗/アプローチに分類して整形
 *   - 日本語/英語の両方に対応
 *   - 脱構築的アプローチ（対話相手としての提示）を適用
 * why_it_exists:
 *   - 3つの実行パス（loop, agent-teams, subagents）でのコード重複を削減
 *   - パターン提示の一貫性を確保
 *   - 「制約」ではなく「対話相手」という設計思想を統一
 * scope:
 *   in: ExtractedPattern配列、言語設定
 *   out: 整形されたプロンプト文字列
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
