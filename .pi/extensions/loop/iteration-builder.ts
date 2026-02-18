/**
 * @abdd.meta
 * path: .pi/extensions/loop/iteration-builder.ts
 * role: ループ拡張機能向けのプロンプト構築と契約パース処理
 * why: 自動品質改善ループにおいてLLMへ渡す指示を構築し、LLMから返却される構造化契約を解析するため
 * related: .pi/extensions/loop.ts, .pi/lib/agent-types.js, .pi/extensions/loop/reference-loader.ts
 * public_api: buildIterationPrompt, parseLoopContract, ParsedLoopContract, LoopStatus, LoopGoalStatus, LOOP_JSON_BLOCK_TAG, LOOP_RESULT_BLOCK_TAG
 * invariants:
 *   - 前回出力はmaxPreviousOutputChars(9000文字)で制限される
 *   - 検証フィードバックは最大4件、各180文字以内に制限される
 *   - 構造化ブロック(LOOP_JSON)が存在する場合、パース優先度は構造化ブロック > プレーンテキスト抽出の順
 * side_effects: なし(純粋関数として動作)
 * failure_modes:
 *   - LOOP_JSONブロックのJSONパース失敗時にparseErrorsへエラーメッセージを格納
 *   - 不正なstatus/goalStatus値はunknownへフォールバック
 * @abdd.explain
 * overview: 自律的品質改善ループの各イテレーションで使用するプロンプト生成と、LLM応答からの契約抽出を行う
 * what_it_does:
 *   - タスク、目標、検証コマンド、参照情報、前回出力を組み込んだプロンプトを構築
 *   - LLM応答から<LOOP_JSON>ブロックを検出しJSONとしてパース
 *   - パース結果としてstatus, goalStatus, citations, nextActions等を抽出
 *   - 構造化ブロック不在時はプレーンテキストから情報を抽出
 * why_it_exists:
 *   - ループ処理の各反復で一貫した形式のプロンプトを提供するため
 *   - LLM応答を機械可読な契約形式へ統一するため
 *   - イテレーション間の状態遷移を決定論的に処理するため
 * scope:
 *   in: タスク定義、目標、検証コマンド、参照情報、前回出力、検証フィードバック
 *   out: 構築済みプロンプト文字列、パース済み契約オブジェクト(ParsedLoopContract)
 */

// File: .pi/extensions/loop/iteration-builder.ts
// Description: Iteration prompt building and contract parsing for loop extension.
// Why: Handles building iteration prompts and parsing the machine-readable contract.
// Related: .pi/extensions/loop.ts

import { ThinkingLevel } from "../../lib/agent-types.js";
import type { LoopReference } from "./reference-loader";

// ============================================================================
// Constants
// ============================================================================

export const LOOP_JSON_BLOCK_TAG = "LOOP_JSON";
export const LOOP_RESULT_BLOCK_TAG = "RESULT";

const LIMITS = {
  maxPreviousOutputChars: 9_000,
  maxValidationFeedbackItems: 4,
  maxValidationFeedbackCharsPerItem: 180,
  stableRepeatThreshold: 1,
};

// ============================================================================
// Types
// ============================================================================

 /**
  * ループの状態を表す型
  */
export type LoopStatus = "continue" | "done" | "unknown";
 /**
  * ループの目標達成状態を表す型
  */
export type LoopGoalStatus = "met" | "not_met" | "unknown";

 /**
  * ループ処理の契約解析結果を表すインターフェース
  * @param status ループのステータス
  * @param goalStatus 目標の達成ステータス
  * @param goalEvidence 目標達成の根拠
  * @param citations 引用リスト
  * @param summary サマリー
  * @param nextActions 次のアクションリスト
  * @param parseErrors パースエラーのリスト
  * @param usedStructuredBlock 構造化ブロックを使用したかどうか
  */
export interface ParsedLoopContract {
  status: LoopStatus;
  goalStatus: LoopGoalStatus;
  goalEvidence: string;
  citations: string[];
  summary: string;
  nextActions: string[];
  parseErrors: string[];
  usedStructuredBlock: boolean;
}

// ============================================================================
// Prompt Building
// ============================================================================

 /**
  * イテレーション用のプロンプトを構築する
  * @param input.task 実行するタスク
  * @param input.goal タスクの目標
  * @param input.verificationCommand 検証用コマンド
  * @param input.iteration 現在のイテレーション回数
  * @param input.maxIterations 最大イテレーション回数
  * @param input.references 参照情報の配列
  * @param input.previousOutput 前回の出力内容
  * @param input.validationFeedback 検証フィードバックの配列
  * @returns 構築されたプロンプト文字列
  */
export function buildIterationPrompt(input: {
  task: string;
  goal?: string;
  verificationCommand?: string;
  iteration: number;
  maxIterations: number;
  references: LoopReference[];
  previousOutput: string;
  validationFeedback: string[];
}): string {
  const lines: string[] = [];

  lines.push("You are executing an autonomous quality-improvement loop.");
  lines.push(`Iteration ${input.iteration} of ${input.maxIterations}.`);
  lines.push("");
  lines.push("Task:");
  lines.push(input.task);
  lines.push("");

  if (input.goal?.trim()) {
    lines.push("Completion goal:");
    lines.push(input.goal.trim());
    lines.push("");
  }

  if (input.verificationCommand?.trim()) {
    lines.push("Deterministic verification command (must pass before STATUS: done):");
    lines.push(input.verificationCommand.trim());
    lines.push("");
  }

  lines.push("Rules:");
  lines.push("- Improve correctness and clarity relative to previous attempts.");
  lines.push("- When references are provided, cite them inline as [R1], [R2], ...");
  lines.push("- Do not invent reference IDs.");
  lines.push("- Use STATUS: done only if the task is actually complete.");
  lines.push("- If a completion goal exists, mark STATUS: done only when GOAL_STATUS is met.");
  lines.push("- Return the machine-readable contract in <LOOP_JSON>...</LOOP_JSON>.");
  lines.push("");

  if (input.references.length > 0) {
    lines.push("Reference pack:");
    lines.push(buildReferencePack(input.references));
    lines.push("");
  }

  if (input.previousOutput.trim()) {
    lines.push("Previous iteration output:");
    lines.push(truncateText(input.previousOutput, LIMITS.maxPreviousOutputChars));
    lines.push("");
  }

  if (input.validationFeedback.length > 0) {
    lines.push("Fix these validation issues from the previous iteration:");
    for (const issue of input.validationFeedback) {
      lines.push(`- ${issue}`);
    }
    lines.push("");
  }

  lines.push("Output format (strict):");
  lines.push(`<${LOOP_JSON_BLOCK_TAG}>`);
  lines.push("{");
  lines.push('  "status": "continue|done",');
  lines.push('  "goal_status": "met|not_met|unknown",');
  lines.push('  "goal_evidence": "short objective evidence or none",');
  lines.push('  "summary": "1-3 lines",');
  lines.push('  "next_actions": ["specific next step or none"],');
  lines.push('  "citations": ["R1", "R2"]');
  lines.push("}");
  lines.push(`</${LOOP_JSON_BLOCK_TAG}>`);
  lines.push(`<${LOOP_RESULT_BLOCK_TAG}>`);
  lines.push("<main answer>");
  lines.push(`</${LOOP_RESULT_BLOCK_TAG}>`);

  return lines.join("\n");
}

 /**
  * 参照情報をパック形式の文字列に変換
  * @param references - 参照情報の配列
  * @returns フォーマットされたパック文字列
  */
export function buildReferencePack(references: LoopReference[]): string {
  const lines: string[] = [];
  for (const ref of references) {
    lines.push(`[${ref.id}] ${ref.title}`);
    lines.push(`Source: ${ref.source}`);
    lines.push(ref.content);
    lines.push("");
  }
  return lines.join("\n").trim();
}

 /**
  * 反復のフォーカス文字列を構築する
  * @param task - タスク内容
  * @param previousOutput - 前回の出力
  * @param validationFeedback - 検証フィードバックの配列
  * @returns 構築されたフォーカス文字列
  */
export function buildIterationFocus(task: string, previousOutput: string, validationFeedback: string[]): string {
  if (validationFeedback.length > 0) {
    return `fix: ${validationFeedback[0]}`;
  }
/**
 * ループコマンドのプレビュー文字列を生成する
 *
 * @param model - モデル情報オブジェクト
 * @param model.provider - プロバイダー名
 * @param model.id - モデルID
 * @param model.thinkingLevel - 思考レベル
 * @returns 生成されたコマンドプレビュー文字列
 * @example
 * const preview = buildLoopCommandPreview({
 *   provider: "openai",
 *   id: "gpt-4",
 *   thinkingLevel: ThinkingLevel.Medium
 * });
 * // "pi -p --no-extensions --provider openai --model gpt-4"
 */

  const nextStep = extractNextStepLine(previousOutput);
/**
   * イテレーション失敗時の出力文字列を構築する
   *
   * 実行失敗を示す契約オブジェクトを作成し、JSONブロックタグでラップして返す。
   *
   * @param message - 失敗理由を示すメッセージ
   * @returns JSONブロックタグでラップされた失敗時の契約オブジェクトを含む文字列
   * @example
   * // 失敗出力の生成
   * const output = buildIterationFailureOutput("処理がタイムアウトしました");
   */
  if (nextStep && !/^none$/i.test(nextStep.trim())) {
    return `next: ${nextStep}`;
  }

  return task;
}

 /**
  * ループコマンドのプレビュー文字列を生成する
  * @param model プロバイダ、ID、思考レベルを含むモデル
  * @returns 生成されたプレビュー文字列
  */
export function buildLoopCommandPreview(model: {
  provider: string;
  id: string;
  thinkingLevel: ThinkingLevel;
}): string {
/**
   * /**
   * * ループ契約の出力文字列を解析して構造化データを返す
   * *
   * * 出力文字列からステータス、ゴール状態、証拠、引用、サマリー、次のアクション等を抽出し、
   * * ParsedLoopContractオブジェクトとして構造化します。
   * *
   * * @param output - 解析対象の出力文字列（ループ実行結果を
   */
  const parts = [
    "pi -p --no-extensions",
    `--provider ${model.provider}`,
    `--model ${model.id}`,
  ];

  if (model.thinkingLevel) {
    parts.push(`--thinking ${model.thinkingLevel}`);
  }

  return parts.join(" ");
}

 /**
  * イテレーション失敗時の出力を生成する
  * @param message エラーメッセージ
  * @returns 失敗情報を含む文字列
  */
export function buildIterationFailureOutput(message: string): string {
  const contract = {
    status: "continue",
    goal_status: "unknown",
    goal_evidence: "none",
    summary: "iteration execution failed",
    next_actions: ["retry with narrower scope"],
    citations: [],
  };
  return [
    `<${LOOP_JSON_BLOCK_TAG}>`,
    JSON.stringify(contract, null, 2),
    `</${LOOP_JSON_BLOCK_TAG}>`,
    `<${LOOP_RESULT_BLOCK_TAG}>`,
    message,
    `</${LOOP_RESULT_BLOCK_TAG}>`,
  ].join("\n");
}

// ============================================================================
// Contract Parsing
// ============================================================================

 /**
  * LLM出力からループ契約を解析する
  * @param output 解析対象の出力文字列
  * @param hasGoal 目標が設定されているかどうか
  * @returns 解析されたループ契約情報
  */
export function parseLoopContract(output: string, hasGoal: boolean): ParsedLoopContract {
  const parseErrors: string[] = [];
  let status = parseLoopStatus(output);
  let goalStatus = parseLoopGoalStatus(output, hasGoal);
  let goalEvidence = extractGoalEvidence(output);
  let citations = extractCitations(output);
  let summary = extractSummaryLine(output);
  const legacyNextStep = normalizeOptionalText(extractNextStepLine(output));
  let nextActions = legacyNextStep ? [legacyNextStep] : [];
  let usedStructuredBlock = false;

  const structured = parseLoopJsonObject(output);
  if (structured) {
    usedStructuredBlock = true;

    const normalizedStatus = normalizeLoopStatus(structured.status);
    if (normalizedStatus === "unknown") {
      parseErrors.push("LOOP_JSON.status must be continue or done.");
    } else {
      status = normalizedStatus;
    }

    const structuredGoalStatus = parseStructuredLoopGoalStatus(structured.goal_status);
    if (!structuredGoalStatus.valid) {
      parseErrors.push("LOOP_JSON.goal_status must be met, not_met, or unknown.");
    }
    goalStatus = hasGoal ? structuredGoalStatus.status : "met";

    const structuredGoalEvidence = normalizeOptionalText(structured.goal_evidence);
    if (structuredGoalEvidence) {
      goalEvidence = structuredGoalEvidence;
    }

    const structuredSummary = normalizeOptionalText(structured.summary);
    if (!structuredSummary) {
      parseErrors.push("LOOP_JSON.summary is required.");
/**
     * ループ結果ブロックを抽出する
     *
     * タグ付きブロックが存在する場合はその内容を返し、存在しない場合は出力全体をトリムして返します。
     *
     * @param output - 処理対象の出力文字列
     * @returns 抽出されたブロック、またはトリムされた出力文字列
     * @example
     * // タグ付きブロックがある場合
     * const result = extractLoopResultBody("<loopResult>内容</loopResult>");
     */

    } else {
      summary = structuredSummary;
    }

    const structuredNextActions = normalizeStringArray(structured.next_actions);
    if (structuredNextActions.length === 0) {
      parseErrors.push("LOOP_JSON.next_actions must be a non-empty string array.");
    } else {
      nextActions = structuredNextActions;
    }

    const citationsValue = structured.citations;
    if (!Array.isArray(citationsValue)) {
      parseErrors.push("LOOP_JSON.citations must be a string array.");
    } else {
      const normalizedCitations = normalizeCitationList(citationsValue);
      if (normalizedCitations.length !== citationsValue.length) {
        parseErrors.push("LOOP_JSON.citations must contain only valid R# IDs.");
      }
      citations = normalizedCitations;
    }
  } else {
    parseErrors.push("Missing <LOOP_JSON> contract block.");
  }

  if (!summary) {
    parseErrors.push("Missing summary.");
  }

  if (nextActions.length === 0) {
    nextActions = ["none"];
  }

  return {
    status,
    goalStatus,
    goalEvidence,
    citations,
    summary,
    nextActions,
    parseErrors,
    usedStructuredBlock,
  };
}

 /**
  * ループ結果の本文を抽出する
  * @param output 出力文字列
  * @returns 抽出された本文、またはトリムされた出力
  */
export function extractLoopResultBody(output: string): string {
  const block = extractTaggedBlock(output, LOOP_RESULT_BLOCK_TAG);
  if (block) return block;
  return output.trim();
}

// ============================================================================
// Validation
// ============================================================================

 /**
  * イテレーションの入力値を検証し、エラーを返す
  * @param input - 検証対象の入力データ
  * @param input.status - ループの状態
  * @param input.goal - 目標（オプション）
  * @param input.goalStatus - 目標の状態
  * @param input.citations - 引用の配列
  * @param input.referenceCount - 参照回数
  * @param input.requireCitation - 引用が必要かどうか
  * @returns 検証で見つかったエラーメッセージの配列
  */
export function validateIteration(input: {
  status: LoopStatus;
  goal?: string;
  goalStatus: LoopGoalStatus;
  citations: string[];
  referenceCount: number;
  requireCitation: boolean;
}): string[] {
  const errors: string[] = [];

  if (input.goal) {
    if (input.goalStatus === "unknown") {
      errors.push("Missing GOAL_STATUS. Use GOAL_STATUS: met|not_met|unknown.");
    }
    if (input.status === "done" && input.goalStatus !== "met") {
      errors.push("STATUS is done but GOAL_STATUS is not met.");
    }
  }

  if (input.referenceCount > 0 && input.requireCitation && input.citations.length === 0) {
    errors.push("Missing citations. Add [R#] markers that map to the reference pack.");
  }

  const invalidIds = input.citations.filter((citation) => {
    const id = Number(citation.slice(1));
    return !Number.isFinite(id) || id < 1 || id > input.referenceCount;
  });

  if (invalidIds.length > 0) {
    errors.push(`Invalid citation IDs: ${invalidIds.join(", ")}.`);
  }

  return errors;
}

 /**
  * バリデーションエラーを正規化・整形する
  * @param errors エラーメッセージの配列
  * @returns 整形された一意のエラーリスト
  */
export function normalizeValidationFeedback(errors: string[]): string[] {
  const compact = errors
    .map((issue) => normalizeValidationIssue(issue))
    .filter((issue): issue is string => Boolean(issue));
  const unique = Array.from(new Set(compact));
  unique.sort((left, right) => validationIssuePriority(left) - validationIssuePriority(right));
  return unique
    .slice(0, LIMITS.maxValidationFeedbackItems)
    .map((issue, index) => `${index + 1}. ${toPreview(issue, LIMITS.maxValidationFeedbackCharsPerItem)}`);
}

 /**
  * 完了宣言のフィードバックを構築する
  * @param errors バリデーションエラーのリスト
  * @returns エラーメッセージを含むフィードバック配列
  */
export function buildDoneDeclarationFeedback(errors: string[]): string[] {
  return [
    "STATUS=done was rejected by system validation. Keep STATUS=continue until all gates pass.",
    ...errors,
  ];
}

// ============================================================================
// Internal Parsing Utilities
// ============================================================================

function parseLoopJsonObject(output: string): Record<string, unknown> | undefined {
  const block = extractTaggedBlock(output, LOOP_JSON_BLOCK_TAG);
  if (!block) return undefined;

  const trimmed = stripMarkdownCodeFence(block);
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractTaggedBlock(output: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i");
  const match = output.match(pattern);
  if (!match?.[1]) return undefined;
  return match[1].trim();
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
/**
 * 出力テキストから要約行を抽出する
 *
 * 構造化されたJSONオブジェクトのsummaryフィールドを優先的に取得し、
 * 見つからない場合は正規表現で"summary: ..."パターンを検索する。
 *
 * @param output - 解析対象の出力テキスト
 * @returns 抽出された要約行、見つからない場合は空文字列
 * @example
 * const summary = extractSummaryLine("summary: これは要約です");
 * // => "これは要約です"
 */
}

function parseLoopStatus(output: string): LoopStatus {
  const statusMatch = output.match(/^\s*status\s*:\s*(continue|done)\b/im);
  if (statusMatch?.[1]) {
    const value = statusMatch[1].toLowerCase();
    if (value === "continue" || value === "done") return value;
  }

  const stopMatch = output.match(/^\s*stop\s*:\s*(yes|true|done)\b/im);
  if (stopMatch) return "done";

  return "unknown";
}

function parseLoopGoalStatus(output: string, hasGoal: boolean): LoopGoalStatus {
  if (!hasGoal) return "met";

  const match = output.match(/^\s*goal[_\s-]*status\s*:\s*(met|not[_\s-]*met|unknown)\b/im);
  if (match?.[1]) {
    const normalized = match[1].toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "met") return "met";
    if (normalized === "not_met") return "not_met";
    return "unknown";
  }

  const passMatch = output.match(/^\s*(goal[_\s-]*met|criteria[_\s-]*met)\s*:\s*(yes|true)\b/im);
  if (passMatch) return "met";

  return "unknown";
}

function extractGoalEvidence(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const goalEvidence = normalizeOptionalText(structured.goal_evidence);
    if (goalEvidence) {
      return goalEvidence;
    }
  }

  const match = output.match(/^\s*goal[_\s-]*evidence\s*:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
}

function extractCitations(output: string): string[] {
  const structured = parseLoopJsonObject(output);
  if (structured && Array.isArray(structured.citations)) {
    return normalizeCitationList(structured.citations);
  }

  const ids = new Set<number>();
  const matcher = /\[R(\d+)\]/gi;
  let match: RegExpExecArray | null = null;

  while (true) {
    match = matcher.exec(output);
    if (!match?.[1]) break;
    ids.add(Number(match[1]));
  }

  return Array.from(ids)
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b)
    .map((id) => `R${id}`);
}

 /**
  * 次のステップ行を抽出する
  * @param output 出力文字列
  * @returns 抽出された次のステップ
  */
export function extractNextStepLine(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const nextActions = normalizeStringArray(structured.next_actions);
    if (nextActions.length > 0) {
      return nextActions[0] ?? "";
    }
  }
  const match = output.match(/^\s*next[_\s-]*step\s*:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
}

 /**
  * 出力からサマリー行を抽出する
  * @param output 出力文字列
  * @returns 抽出されたサマリー
  */
export function extractSummaryLine(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const summary = normalizeOptionalText(structured.summary);
    if (summary) {
      return summary;
    }
  }

  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] ?? "";
}

// ============================================================================
// Normalization Utilities
// ============================================================================

function normalizeLoopStatus(value: unknown): LoopStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "continue" || normalized === "done") {
    return normalized;
  }
  return "unknown";
}

function normalizeLoopGoalStatus(value: unknown): LoopGoalStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "met") return "met";
  if (normalized === "not_met") return "not_met";
  if (normalized === "unknown") return "unknown";
  return "unknown";
}

function parseStructuredLoopGoalStatus(
  value: unknown,
): { status: LoopGoalStatus; valid: boolean } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { status: "unknown", valid: false };
  }

  const normalized = normalizeLoopGoalStatus(raw);
  if (normalized === "met" || normalized === "not_met" || normalized === "unknown") {
    const valid =
      normalized === "unknown"
        ? /^unknown$/i.test(raw.trim())
        : true;
    return { status: normalized, valid };
  }

  return { status: "unknown", valid: false };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(normalized));
}

function normalizeCitationId(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const match = raw.match(/^\[?R(\d+)\]?$/i);
  if (!match?.[1]) return undefined;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id < 1) return undefined;
  return `R${id}`;
}

function normalizeCitationList(values: unknown[]): string[] {
  const normalizedIds = values
    .map((value) => normalizeCitationId(value))
    .filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(normalizedIds));
  unique.sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  return unique;
}

function normalizeValidationIssue(issue: string): string {
  const compact = String(issue ?? "")
    .replace(/^\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";

  if (/missing <loop_json>|contract block/i.test(compact)) {
    return "Return <LOOP_JSON> with the required JSON object Contract.";
  }
  if (/loop_json\.status/i.test(compact)) {
    return 'Set "status" to "continue" or "done" in <LOOP_JSON>.';
  }
  if (/status is done but goal_status is not met/i.test(compact)) {
    return "Do not set status=done until goal_status is met.";
  }
  if (/loop_json\.goal_status|goal_status/i.test(compact)) {
    return 'Set "goal_status" to "met", "not_met", or "unknown" in <LOOP_JSON>.';
  }
  if (/loop_json\.summary|missing summary/i.test(compact)) {
    return 'Provide a short "summary" field in <LOOP_JSON>.';
  }
  if (/loop_json\.next_actions/i.test(compact)) {
    return 'Provide "next_actions" as a non-empty string array in <LOOP_JSON>.';
  }
  if (/loop_json\.citations|missing citations|invalid citation ids/i.test(compact)) {
    return 'Fix citations: use valid ["R#"] IDs that exist in the reference pack.';
  }
  if (/verification command failed/i.test(compact)) {
    return "Fix failing verification command before declaring done.";
  }
  return compact;
}

function validationIssuePriority(issue: string): number {
  if (/status=done|status is done|do not set status=done/i.test(issue)) return 0;
  if (/verification|command/i.test(issue)) return 1;
  if (/goal_status|goal/i.test(issue)) return 2;
  if (/citation|reference/i.test(issue)) return 3;
  return 4;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function toPreview(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

 /**
  * ループ出力を正規化する
  * @param value 入力文字列
  * @returns 正規化された文字列
  */
export function normalizeLoopOutput(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
