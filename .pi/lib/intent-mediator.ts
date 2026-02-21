/**
 * @abdd.meta
 * path: .pi/lib/intent-mediator.ts
 * role: Mediator層のメインロジックモジュール
 * why: 論文のMediator-Assistantアーキテクチャを実装し、意図推論と実行の分離を実現する
 * related: .pi/lib/mediator-types.ts, .pi/lib/mediator-history.ts, .pi/lib/mediator-prompt.ts
 * public_api: mediate, mediateWithAnswers, createMediatorSession, MediatorSession
 * invariants: training-free（パラメータ更新なし）、履歴はインコンテキストのみ使用
 * side_effects: 履歴ファイルへの読み書き、LLM APIの呼び出し
 * failure_modes: LLM APIエラー、履歴ファイルの破損、タイムアウト
 * @abdd.explain
 * overview: ユーザー入力を解釈・明確化し、構造化された指示を生成するMediatorのメインロジック
 * what_it_does:
 *   - ユーザー入力の意図を解釈（LLM使用）
 *   - 情報ギャップを検出
 *   - Questionツールで人間に確認
 *   - 構造化された指示を生成
 *   - 履歴の読み込み・保存
 * why_it_exists:
 *   - 論文のEquation (3)/(5)に基づき意図推論と実行を分離するため
 *   - LiC現象を防ぐための仲介層を提供するため
 * scope:
 *   in: ユーザー入力、会話履歴、確認済み事実
 *   out: MediatorOutput（解釈、ギャップ、質問、構造化指示）
 */

import { join } from "node:path";
import {
  type MediatorInput,
  type MediatorOutput,
  type MediatorConfig,
  type MediatorStatus,
  type MediatorQuestion,
  type StructuredIntent,
  type InformationGap,
  type Message,
  type ConfirmedFact,
  type SessionId,
  type Confidence,
  type ConversationHistory,
  DEFAULT_MEDIATOR_CONFIG,
  generateSessionId,
  getCurrentTimestamp,
  createEmptyStructuredIntent,
  structuredIntentToPrompt,
  isConfidenceAboveThreshold,
} from "./mediator-types.js";
import {
  loadConfirmedFacts,
  saveConfirmedFacts,
  appendFact,
  findFactByKey,
  getRecentFacts,
  loadConversationSummary,
  appendSummarySection,
} from "./mediator-history.js";
import {
  MEDIATOR_SYSTEM_PROMPT,
  buildInterpretationPrompt,
  buildClarificationPrompt,
  buildStructuringPrompt,
  buildLicDetectionPrompt,
  generateQuestion,
  calculateOverallConfidence,
  type InterpretationPromptInput,
  type ClarificationPromptInput,
  type StructuringPromptInput,
} from "./mediator-prompt.js";

// ============================================================================
// 型定義
// ============================================================================

/**
 * LLM呼び出し関数の型
 * @summary 外部から注入されるLLM呼び出し関数
 * @param systemPrompt システムプロンプト
 * @param userPrompt ユーザープロンプト
 * @param options オプション
 * @returns LLMの出力テキスト
 */
export type LlmCallFunction = (
  systemPrompt: string,
  userPrompt: string,
  options?: { timeoutMs?: number }
) => Promise<string>;

/**
 * Mediatorセッション
 * @summary 1つの仲介セッションの状態
 */
export interface MediatorSession {
  /** セッションID */
  sessionId: SessionId;
  /** 現在の状態 */
  status: "initialized" | "interpreting" | "clarifying" | "structuring" | "completed" | "error";
  /** 元のユーザー入力 */
  originalInput: string;
  /** 現在の解釈 */
  currentInterpretation: string;
  /** 検出された情報ギャップ */
  detectedGaps: InformationGap[];
  /** 明確化の回答 */
  clarifications: Array<{ question: string; answer: string }>;
  /** 最終的な構造化指示 */
  finalIntent?: StructuredIntent;
  /** 履歴 */
  messages: Message[];
  /** 開始時刻 */
  startedAt: string;
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * ユーザー入力を仲介
 * @summary Mediatorのメインエントリーポイント
 * @param input Mediator入力
 * @param config 設定
 * @param llmCall LLM呼び出し関数
 * @returns Mediator出力
 */
export async function mediate(
  input: MediatorInput,
  config: Partial<MediatorConfig> = {},
  llmCall: LlmCallFunction = defaultLlmCall
): Promise<MediatorOutput> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_MEDIATOR_CONFIG, ...config };

  try {
    // 1. 履歴の読み込み
    const confirmedFacts = loadConfirmedFacts(cfg.historyDir).facts;
    const enrichedInput = {
      ...input,
      confirmedFacts: [...confirmedFacts, ...input.confirmedFacts],
    };

    // 2. 意図の解釈（LLM）
    const interpretation = await interpretInput(enrichedInput, llmCall);

    // 3. 情報ギャップの検出
    const gaps = detectGaps(interpretation, enrichedInput);

    // 4. 信頼度の計算
    const confidence = calculateOverallConfidence(
      interpretation.text,
      gaps.length,
      enrichedInput.confirmedFacts.length
    );

    // 5. 状態の決定
    let status: MediatorStatus;
    let questions: MediatorQuestion[] = [];
    let structuredIntent: StructuredIntent | undefined;

    if (gaps.length > 0 && cfg.enableQuestioning) {
      // 明確化が必要
      status = "needs_clarification";
      questions = gaps.slice(0, cfg.maxQuestionsPerTurn).map(g => generateQuestion(g));
    } else if (isConfidenceAboveThreshold(confidence, cfg.confidenceThreshold)) {
      // 構造化指示を生成
      status = "ready";
      structuredIntent = await buildStructuredIntent(
        enrichedInput,
        interpretation.text,
        [],
        llmCall
      );
    } else {
      // 曖昧
      status = "ambiguous";
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      status,
      interpretation: interpretation.text,
      gaps,
      questions,
      structuredIntent,
      confidence,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    return {
      status: "error",
      interpretation: "",
      gaps: [],
      questions: [],
      confidence: 0,
      processingTimeMs,
    };
  }
}

/**
 * 明確化の回答を統合して再仲介
 * @summary ユーザーの回答を反映して構造化指示を生成
 * @param input 元の入力
 * @param interpretation 以前の解釈
 * @param answers 回答のリスト
 * @param config 設定
 * @param llmCall LLM呼び出し関数
 * @returns Mediator出力
 */
export async function mediateWithAnswers(
  input: MediatorInput,
  interpretation: string,
  answers: Array<{ question: string; answer: string }>,
  config: Partial<MediatorConfig> = {},
  llmCall: LlmCallFunction = defaultLlmCall
): Promise<MediatorOutput> {
  const startTime = Date.now();
  const cfg = { ...DEFAULT_MEDIATOR_CONFIG, ...config };

  try {
    // 回答を確認済み事実として保存
    for (const { question, answer } of answers) {
      // 質問からキーを抽出（簡易実装）
      const keyMatch = question.match(/「(.+?)」/);
      if (keyMatch) {
        appendFact(cfg.historyDir, {
          key: keyMatch[1],
          value: answer,
          context: question,
          sessionId: input.sessionId,
        });
      }
    }

    // 更新された確認済み事実を読み込み
    const updatedFacts = loadConfirmedFacts(cfg.historyDir).facts;

    // 構造化指示を生成
    const structuredIntent = await buildStructuredIntent(
      { ...input, confirmedFacts: updatedFacts },
      interpretation,
      answers,
      llmCall
    );

    const processingTimeMs = Date.now() - startTime;

    return {
      status: "ready",
      interpretation,
      gaps: [],
      questions: [],
      structuredIntent,
      confidence: structuredIntent.confidence,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    return {
      status: "error",
      interpretation,
      gaps: [],
      questions: [],
      confidence: 0,
      processingTimeMs,
    };
  }
}

/**
 * 新しいMediatorセッションを作成
 * @summary セッションを初期化
 * @param userMessage ユーザー入力
 * @param memoryDir メモリディレクトリ
 * @returns Mediatorセッション
 */
export function createMediatorSession(
  userMessage: string,
  memoryDir: string
): MediatorSession {
  const sessionId = generateSessionId();

  return {
    sessionId,
    status: "initialized",
    originalInput: userMessage,
    currentInterpretation: "",
    detectedGaps: [],
    clarifications: [],
    messages: [{
      role: "user",
      content: userMessage,
      timestamp: getCurrentTimestamp(),
    }],
    startedAt: getCurrentTimestamp(),
    processingTimeMs: 0,
  };
}

// ============================================================================
// 内部関数
// ============================================================================

/**
 * 解釈結果
 */
interface InterpretationResult {
  text: string;
  references: Array<{ term: string; resolved?: string }>;
  gaps: InformationGap[];
  confidence: Confidence;
}

/**
 * ユーザー入力を解釈
 * @summary LLMを使用して意図を解釈
 * @param input 入力データ
 * @param llmCall LLM呼び出し関数
 * @returns 解釈結果
 */
async function interpretInput(
  input: MediatorInput,
  llmCall: LlmCallFunction
): Promise<InterpretationResult> {
  const prompt = buildInterpretationPrompt({
    userMessage: input.userMessage,
    conversationHistory: input.conversationHistory,
    confirmedFacts: input.confirmedFacts,
    taskContext: input.taskContext,
  });

  const response = await llmCall(MEDIATOR_SYSTEM_PROMPT, prompt, {
    timeoutMs: 30000,
  });

  // レスポンスをパース（簡易実装）
  return parseInterpretationResponse(response);
}

/**
 * 解釈レスポンスをパース
 * @summary LLM出力から解釈結果を抽出
 * @param response LLM出力
 * @returns 解釈結果
 */
function parseInterpretationResponse(response: string): InterpretationResult {
  // 簡易パーサー：セクションを抽出
  const sections = extractSections(response);

  const text = sections["解釈結果"] || sections["1. 解釈結果"] || response;
  
  // 参照解決の抽出
  const references: Array<{ term: string; resolved?: string }> = [];
  const refSection = sections["参照解決"] || sections["2. 参照解決"] || "";
  const refRegex = /[-*]\s*(?:「([^」]+)」|(.+?))[:：]\s*(.+)/g;
  let refMatch;
  while ((refMatch = refRegex.exec(refSection)) !== null) {
    references.push({
      term: refMatch[1] || refMatch[2],
      resolved: refMatch[3],
    });
  }

  // 情報ギャップの抽出（簡易）
  const gaps: InformationGap[] = [];
  const gapSection = sections["情報ギャップ"] || sections["3. 情報ギャップ"] || "";
  if (gapSection.includes("ambiguous_reference") || gapSection.includes("参照")) {
    gaps.push({
      type: "ambiguous_reference",
      term: "（検出）",
      description: "曖昧な参照が検出されました",
      severity: "medium",
    });
  }

  return {
    text,
    references,
    gaps,
    confidence: 0.7, // デフォルト
  };
}

/**
 * セクションを抽出
 * @summary マークダウン風のセクションを抽出
 * @param text テキスト
 * @returns セクション名→内容のマップ
 */
function extractSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = text.split("\n");
  let currentSection = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    const numberedMatch = line.match(/^###?\s*(\d+\.\s*.+)$/);
    
    if (headerMatch || numberedMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join("\n").trim();
      }
      currentSection = (headerMatch?.[1] || numberedMatch?.[1] || "").trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

/**
 * 情報ギャップを検出
 * @summary 解釈結果から情報不足を特定
 * @param interpretation 解釈結果
 * @param input 入力データ
 * @returns 情報ギャップのリスト
 */
function detectGaps(
  interpretation: InterpretationResult,
  input: MediatorInput
): InformationGap[] {
  const gaps: InformationGap[] = [];

  // LLMが検出したギャップを追加
  gaps.push(...interpretation.gaps);

  // 未解決の参照をチェック
  for (const ref of interpretation.references) {
    if (!ref.resolved) {
      // 確認済み事実で解決できるか確認（配列内で直接検索）
      const existingFact = input.confirmedFacts.find(f => f.key === ref.term);
      if (!existingFact) {
        gaps.push({
          type: "ambiguous_reference",
          term: ref.term,
          description: `「${ref.term}」の参照先が不明確です`,
          severity: "medium",
        });
      }
    }
  }

  // 重複を除去
  const uniqueGaps = gaps.filter((gap, index, self) => 
    index === self.findIndex(g => g.term === gap.term && g.type === gap.type)
  );

  // 重要度でソート
  return uniqueGaps.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * 構造化指示を生成
 * @summary LLMを使用して実行可能な指示を生成
 * @param input 入力データ
 * @param interpretation 解釈テキスト
 * @param clarifications 明確化の回答
 * @param llmCall LLM呼び出し関数
 * @returns 構造化指示
 */
async function buildStructuredIntent(
  input: MediatorInput,
  interpretation: string,
  clarifications: Array<{ question: string; answer: string }>,
  llmCall: LlmCallFunction
): Promise<StructuredIntent> {
  const prompt = buildStructuringPrompt({
    userMessage: input.userMessage,
    interpretation,
    clarifications,
    conversationHistory: input.conversationHistory,
    confirmedFacts: input.confirmedFacts,
  });

  const response = await llmCall(MEDIATOR_SYSTEM_PROMPT, prompt, {
    timeoutMs: 30000,
  });

  // JSONをパース
  return parseStructuredIntent(response, input.userMessage);
}

/**
 * 構造化指示JSONをパース
 * @summary LLM出力からStructuredIntentを抽出
 * @param response LLM出力
 * @param originalInput 元の入力
 * @returns 構造化指示
 */
function parseStructuredIntent(response: string, originalInput: string): StructuredIntent {
  // JSONブロックを探す
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    return createEmptyStructuredIntent(originalInput);
  }

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    
    return {
      target: parsed.target || { scope: "unknown" },
      action: parsed.action || { type: "unknown", description: "未確定" },
      constraints: parsed.constraints || {
        mustPreserve: [],
        mustSatisfy: [],
        avoid: [],
        assumptions: [],
      },
      successCriteria: parsed.successCriteria || { criteria: [] },
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      clarificationNeeded: parsed.clarificationNeeded ?? false,
      originalInput,
      interpretationBasis: parsed.interpretationBasis || [],
    };
  } catch {
    return createEmptyStructuredIntent(originalInput);
  }
}

// ============================================================================
// デフォルトLLM呼び出し関数
// ============================================================================

/**
 * デフォルトのLLM呼び出し関数
 * @summary プレースホルダー（実際の実装は外部から注入）
 * @param _systemPrompt システムプロンプト
 * @param userPrompt ユーザープロンプト
 * @returns プレースホルダー応答
 */
async function defaultLlmCall(
  _systemPrompt: string,
  userPrompt: string
): Promise<string> {
  // プレースホルダー実装
  // 実際の運用では pi-core の LLM 機能を使用
  console.warn("[intent-mediator] Using default LLM placeholder - inject actual LLM call");
  
  return `### 解釈結果
ユーザーの入力を解釈します。

${userPrompt.slice(0, 200)}...

### 参照解決
（参照なし）

### 情報ギャップ
（検出されませんでした）

### 信頼度
0.5`;
}

// エクスポートはファイル先頭のexportで完了
