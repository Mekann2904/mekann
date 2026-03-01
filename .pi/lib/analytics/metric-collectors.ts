/**
 * @abdd.meta
 * path: .pi/lib/analytics/metric-collectors.ts
 * role: LLM行動メトリクスの収集関数
 * why: プロンプト・出力・品質のメトリクスを統一的に収集するため
 * related: .pi/lib/analytics/llm-behavior-types.ts, .pi/extensions/subagents/task-execution.ts
 * public_api: collectPromptMetrics, collectOutputMetrics, collectQualityMetrics, collectExecutionMetrics, extractExecutionContext
 * invariants: トークン見積は文字数/4で概算、スコアは0-1の範囲
 * side_effects: なし（純粋関数）
 * failure_modes: 不正な入力時はデフォルト値を返す
 * @abdd.explain
 * overview: LLM実行の各段階でメトリクスを収集するユーティリティ関数群
 * what_it_does:
 *   - collectPromptMetrics: プロンプトのサイズ、スキル数、制約数を計測
 *   - collectOutputMetrics: 出力のサイズ、Thinkingブロック、構造を計測
 *   - collectQualityMetrics: フォーマット遵守、CLAIM-RESULT整合性を評価
 *   - extractExecutionContext: タスクタイプ、エージェントロールを抽出
 * why_it_exists:
 *   - メトリクス収集ロジックを一元管理し、再利用可能にするため
 *   - 収集ロジックのテストを容易にするため
 * scope:
 *   in: プロンプト文字列、出力文字列、実行パラメータ
 *   out: PromptMetrics, OutputMetrics, QualityMetrics, ExecutionContext
 */

import type {
  PromptMetrics,
  OutputMetrics,
  QualityMetrics,
  ExecutionMetrics,
  ExecutionContext,
} from "./llm-behavior-types.js";
import type { RunOutcomeCode, ThinkingLevel } from "../agent/agent-types.js";

// ============================================================================
// Prompt Metrics
// ============================================================================

/**
 * プロンプトメトリクスを収集
 * @summary プロンプトサイズと構成を計測
 * @param prompt プロンプト文字列
 * @param params 追加パラメータ（スキル数など）
 * @returns プロンプトメトリクス
 */
export function collectPromptMetrics(
  prompt: string,
  params?: {
    skills?: string[];
    hasSystemPrompt?: boolean;
    hasExamples?: boolean;
  },
): PromptMetrics {
  const charCount = prompt?.length ?? 0;
  const estimatedTokens = Math.ceil(charCount / 4);

  return {
    charCount,
    estimatedTokens,
    skillCount: params?.skills?.length ?? 0,
    hasSystemPrompt: params?.hasSystemPrompt ?? containsSystemPrompt(prompt),
    hasExamples: params?.hasExamples ?? containsExamples(prompt),
    constraintCount: countConstraints(prompt),
  };
}

/**
 * システムプロンプト含有チェック
 */
function containsSystemPrompt(prompt: string): boolean {
  if (!prompt) return false;
  const markers = ["@abdd.meta", "SYSTEM PROMPT", "You are running as", "operating instructions"];
  return markers.some((marker) => prompt.includes(marker));
}

/**
 * 例示含有チェック
 */
function containsExamples(prompt: string): boolean {
  if (!prompt) return false;
  const markers = ["Example:", "例:", "For example:", "Sample output:"];
  return markers.some((marker) => prompt.includes(marker));
}

/**
 * 制約条件の数をカウント
 */
function countConstraints(prompt: string): number {
  if (!prompt) return 0;

  // MANDATORY, REQUIRED, MUST, PROHIBITED などの制約キーワード
  const constraintPatterns = [
    /MANDATORY/gi,
    /REQUIRED/gi,
    /MUST/gi,
    /PROHIBITED/gi,
    /CRITICAL/gi,
    /必須/g,
    /禁止/g,
  ];

  let count = 0;
  for (const pattern of constraintPatterns) {
    const matches = prompt.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

// ============================================================================
// Output Metrics
// ============================================================================

/**
 * 出力メトリクスを収集
 * @summary 出力サイズと構造を計測
 * @param output 出力文字列
 * @returns 出力メトリクス
 */
export function collectOutputMetrics(output: string): OutputMetrics {
  const charCount = output?.length ?? 0;
  const estimatedTokens = Math.ceil(charCount / 4);

  // Thinkingブロック検出
  const thinkingPatterns = [
    /<thinking>[\s\S]*?<\/thinking>/gi,
    /\[Thinking\][\s\S]*?(?=\[CLAIM\]|$)/gi,
    /```thinking[\s\S]*?```/gi,
  ];

  let thinkingBlockChars = 0;
  for (const pattern of thinkingPatterns) {
    const matches = output?.match(pattern) || [];
    for (const match of matches) {
      thinkingBlockChars += match.length;
    }
  }

  const thinkingBlockPresent = thinkingBlockChars > 0;
  const thinkingBlockTokens = Math.ceil(thinkingBlockChars / 4);

  // 構造タイプ検出
  const structureType = detectStructureType(output);

  return {
    charCount,
    estimatedTokens,
    thinkingBlockPresent,
    thinkingBlockChars,
    thinkingBlockTokens,
    structureType,
  };
}

/**
 * 出力の構造タイプを検出
 */
function detectStructureType(output: string): "internal" | "external" | "mixed" | "unstructured" {
  if (!output) return "unstructured";

  const hasInternalMarkers =
    /\[CLAIM\]/i.test(output) &&
    /\[EVIDENCE\]/i.test(output) &&
    /\[CONFIDENCE\]/i.test(output);

  const hasExternalMarkers =
    /SUMMARY:/i.test(output) ||
    /##\s/.test(output) ||
    /```/.test(output);

  if (hasInternalMarkers && hasExternalMarkers) {
    return "mixed";
  }
  if (hasInternalMarkers) {
    return "internal";
  }
  if (hasExternalMarkers) {
    return "external";
  }
  return "unstructured";
}

// ============================================================================
// Quality Metrics
// ============================================================================

/**
 * 品質メトリクスを収集
 * @summary 出力品質を評価
 * @param output 出力文字列
 * @param params 追加パラメータ
 * @returns 品質メトリクス
 */
export function collectQualityMetrics(
  output: string,
  params?: {
    isValid?: boolean;
  },
): QualityMetrics {
  const hasRequiredLabels = checkRequiredLabels(output);
  const formatComplianceScore = hasRequiredLabels ? 1.0 : 0.5;
  const claimResultConsistency = calculateClaimResultConsistency(output);
  const evidenceCount = countEvidenceItems(output);
  const resultCompleteness = calculateResultCompleteness(output);

  return {
    formatComplianceScore: params?.isValid !== undefined ? (params.isValid ? 1.0 : 0.0) : formatComplianceScore,
    claimResultConsistency,
    hasRequiredLabels,
    evidenceCount,
    resultCompleteness,
  };
}

/**
 * 必須ラベルの存在チェック
 */
function checkRequiredLabels(output: string): boolean {
  if (!output) return false;

  // INTERNALモードの必須ラベル
  const hasInternalLabels =
    /\[CLAIM\]/i.test(output) &&
    /\[EVIDENCE\]/i.test(output) &&
    /\[CONFIDENCE\]/i.test(output);

  // USER-FACINGモードの必須ラベル
  const hasUserFacingLabels =
    /SUMMARY:/i.test(output) &&
    /RESULT:/i.test(output);

  return hasInternalLabels || hasUserFacingLabels;
}

/**
 * CLAIM-RESULT整合性を計算
 */
function calculateClaimResultConsistency(output: string): number {
  if (!output) return 0.0;

  // [CLAIM] と [RESULT] または SUMMARY: と RESULT: の整合性をチェック
  const claimMatch = output.match(/\[CLAIM\]\s*(.+?)(?=\[EVIDENCE\]|\n\n)/is);
  const resultMatch = output.match(/\[RESULT\]([\s\S]*?)(?=\[CONFIDENCE\]|$)/is);

  if (!claimMatch || !resultMatch) {
    // USER-FACINGモードの場合
    const summaryMatch = output.match(/SUMMARY:\s*(.+?)(?=\n\n|RESULT:)/is);
    const resultMatch2 = output.match(/RESULT:\s*(.+?)(?=\n\n|NEXT_STEP:|$)/is);

    if (!summaryMatch || !resultMatch2) return 0.5;
    return calculateTermOverlap(summaryMatch[1], resultMatch2[1]);
  }

  return calculateTermOverlap(claimMatch[1], resultMatch[1]);
}

/**
 * 用語のオーバーラップを計算
 */
function calculateTermOverlap(text1: string, text2: string): number {
  const terms1 = extractKeyTerms(text1);
  const terms2 = extractKeyTerms(text2);

  if (terms1.length === 0) return 0.0;

  const overlap = terms1.filter((t) => terms2.includes(t)).length;
  return Math.min(1.0, (overlap / terms1.length) * 1.5);
}

/**
 * キー用語を抽出
 */
function extractKeyTerms(text: string): string[] {
  // 日本語と英語の単語を抽出
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  // ストップワードを除外
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall",
    "を", "に", "が", "は", "の", "で", "と", "から", "まで",
    "し", "て", "た", "です", "ます", "した", "された",
  ]);

  return words.filter((w) => w.length > 1 && !stopWords.has(w));
}

/**
 * 証拠項目数をカウント
 */
function countEvidenceItems(output: string): number {
  if (!output) return 0;

  // [EVIDENCE] セクションの箇条書きをカウント
  const evidenceSection = output.match(/\[EVIDENCE\]([\s\S]*?)(?=\[CONFIDENCE\]|$)/i);
  if (evidenceSection) {
    const bullets = evidenceSection[1].match(/^[\s]*[-*]\s+/gm) || [];
    return bullets.length;
  }

  // ファイルパス参照をカウント
  const fileRefs = output.match(/[a-zA-Z0-9_/.-]+\.ts:[0-9]+/g) || [];
  return fileRefs.length;
}

/**
 * 結果完全性を計算
 */
function calculateResultCompleteness(output: string): number {
  if (!output) return 0.0;

  let score = 0.0;

  // SUMMARY または CLAIM 存在
  if (/SUMMARY:|\[CLAIM\]/i.test(output)) score += 0.25;

  // EVIDENCE 存在
  if (/\[EVIDENCE\]|EVIDENCE:/i.test(output)) score += 0.25;

  // RESULT 存在
  if (/RESULT:|\[RESULT\]/i.test(output)) score += 0.25;

  // CONFIDENCE または NEXT_STEP 存在
  if (/\[CONFIDENCE\]|CONFIDENCE:|NEXT_STEP:/i.test(output)) score += 0.25;

  return score;
}

// ============================================================================
// Execution Metrics
// ============================================================================

/**
 * 実行メトリクスを収集
 * @summary 実行時間とリソース使用を記録
 * @param params 実行パラメータ
 * @returns 実行メトリクス
 */
export function collectExecutionMetrics(params: {
  durationMs: number;
  retryCount: number;
  outcomeCode: RunOutcomeCode | string;
  modelUsed: string;
  thinkingLevel: ThinkingLevel | string;
}): ExecutionMetrics {
  return {
    durationMs: params.durationMs,
    retryCount: params.retryCount,
    outcomeCode: params.outcomeCode,
    modelUsed: params.modelUsed,
    thinkingLevel: params.thinkingLevel,
  };
}

// ============================================================================
// Context Extraction
// ============================================================================

/**
 * 実行コンテキストを抽出
 * @summary タスクの種類と関連情報を特定
 * @param task タスク文字列
 * @param agentId エージェントID
 * @param parentRunId 親実行ID（オプション）
 * @returns 実行コンテキスト
 */
export function extractExecutionContext(
  task: string,
  agentId: string,
  parentRunId?: string,
): ExecutionContext {
  const taskType = detectTaskType(task);
  const agentRole = detectAgentRole(agentId);
  const filePatterns = extractFilePatterns(task);

  return {
    taskType,
    agentRole,
    parentRunId,
    filePatterns,
  };
}

/**
 * タスクタイプを検出
 */
function detectTaskType(task: string): "research" | "implementation" | "review" | "planning" | "other" {
  if (!task) return "other";

  const taskLower = task.toLowerCase();

  if (
    taskLower.includes("research") ||
    taskLower.includes("調査") ||
    taskLower.includes("investigate") ||
    taskLower.includes("分析")
  ) {
    return "research";
  }

  if (
    taskLower.includes("implement") ||
    taskLower.includes("実装") ||
    taskLower.includes("create") ||
    taskLower.includes("作成") ||
    taskLower.includes("fix") ||
    taskLower.includes("修正")
  ) {
    return "implementation";
  }

  if (
    taskLower.includes("review") ||
    taskLower.includes("レビュー") ||
    taskLower.includes("check") ||
    taskLower.includes("確認")
  ) {
    return "review";
  }

  if (
    taskLower.includes("plan") ||
    taskLower.includes("計画") ||
    taskLower.includes("design") ||
    taskLower.includes("設計")
  ) {
    return "planning";
  }

  return "other";
}

/**
 * エージェントロールを検出
 */
function detectAgentRole(agentId: string): string {
  const roleMap: Record<string, string> = {
    researcher: "researcher",
    architect: "architect",
    implementer: "implementer",
    tester: "tester",
    reviewer: "reviewer",
    coordinator: "coordinator",
  };

  return roleMap[agentId] || agentId;
}

/**
 * ファイルパターンを抽出
 */
function extractFilePatterns(task: string): string[] {
  if (!task) return [];

  // ファイルパスパターンを抽出
  const patterns: string[] = [];

  // .ts, .js, .md などのファイルパス
  const filePaths = task.match(/[a-zA-Z0-9_/.-]+\.(ts|js|md|json|yaml|yml)/g) || [];
  patterns.push(...filePaths);

  // ディレクトリパス
  const dirPaths = task.match(/[a-zA-Z0-9_/.-]+\/[a-zA-Z0-9_/.-]+/g) || [];
  patterns.push(...dirPaths.slice(0, 5)); // 最大5個

  return [...new Set(patterns)].slice(0, 10);
}
