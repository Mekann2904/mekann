/**
 * @abdd.meta
 * path: .pi/lib/mediator-integration.ts
 * role: MediatorとLoopの統合レイヤー
 * why: ユーザータスクの実行前にMediatorによる明確化を行い、loop_runへ引き渡すタスク品質を担保するため
 * related: .pi/lib/mediator-types.ts, .pi/lib/intent-mediator.ts, .pi/lib/mediator-history.ts
 * public_api: MediatorLoopConfig, MediatorPhaseResult, executeMediatorPhase
 * invariants: MediatorPhaseResult.successがfalseの場合、clarifiedTaskは元のタスクを保持する
 * side_effects: appendFactおよびappendSummarySectionによる履歴ファイルの書き込み
 * failure_modes: LLM呼び出しの失敗、最大ラウンド超過による明確化打ち切り、履歴ディレクトリへのアクセスエラー
 * @abdd.explain
 * overview: loop_run開始前のMediatorフェーズ全体の制御、設定管理、および履歴との連携を行う
 * what_it_does:
 *   - MediatorLoopConfigの定義とデフォルト値の提供
 *   - ユーザーへの質問（QuestionTool）および回答収集プロセスの管理
 *   - mediate/mediateWithAnswersを使用した意図の解釈と明確化
 *   - 確定した事実の履歴ファイルへの保存と要約セクションの追加
 *   - MediatorPhaseResultとして処理結果の構築
 * why_it_exists:
 *   - Mediatorコア（intent-mediator）とシステム全体の実行フローを疎結合に保つため
 *   - 構造化された意図と事実を永続化し、セッションを跨いだ文脈を維持するため
 *   - 明確化プロセスの閾値やラウンド数等の挙動を設定可能にするため
 * scope:
 *   in: ユーザータスク文字列, MediatorLoopConfig, LLM呼び出し関数, QuestionTool
 *   out: MediatorPhaseResult(成功判定, 明確化済みタスク, 構造化意図)
 */

import {
  type MediatorInput,
  type MediatorOutput,
  type MediatorConfig,
  type StructuredIntent,
  type Message,
  type ConfirmedFact,
  type SessionId,
  type MediatorQuestion,
  DEFAULT_MEDIATOR_CONFIG,
  generateSessionId,
  getCurrentTimestamp,
  structuredIntentToPrompt,
} from "./mediator-types.js";
import {
  mediate,
  mediateWithAnswers,
  type LlmCallFunction,
} from "./intent-mediator.js";
import {
  loadConfirmedFacts,
  appendFact,
  appendSummarySection,
} from "./mediator-history.js";

// ============================================================================
// 型定義
// ============================================================================

/**
 * MediatorとLoopの統合設定
 * @summary loop_runでMediatorを使用するための設定
 */
export interface MediatorLoopConfig {
  /** Mediatorを有効化 */
  enableMediator: boolean;
  /** 明確化なしで進める信頼度閾値 */
  autoProceedThreshold: number;
  /** 最大明確化ラウンド数 */
  maxClarificationRounds: number;
  /** 履歴ディレクトリ */
  historyDir: string;
  /** デバッグモード */
  debugMode: boolean;
}

/**
 * デフォルトの統合設定
 */
export const DEFAULT_MEDIATOR_LOOP_CONFIG: MediatorLoopConfig = {
  enableMediator: true,
  autoProceedThreshold: 0.8,
  maxClarificationRounds: 2,
  historyDir: ".pi/memory",
  debugMode: false,
};

/**
 * Mediatorフェーズの結果
 * @summary loop_run開始前のMediator処理結果
 */
export interface MediatorPhaseResult {
  /** 処理成功可否 */
  success: boolean;
  /** 元のタスク */
  originalTask: string;
  /** 明確化後のタスク（構造化指示を含む） */
  clarifiedTask: string;
  /** 構造化された意図 */
  structuredIntent?: StructuredIntent;
  /** Mediatorの出力 */
  mediatorOutput?: MediatorOutput;
  /** 明確化が必要か */
  needsClarification: boolean;
  /** エラーメッセージ */
  error?: string;
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
  /** 明確化の履歴 */
  clarificationHistory: Array<{
    round: number;
    questions: MediatorQuestion[];
    answers: Array<{ question: string; answer: string }>;
  }>;
}

/**
 * Question ツールの型定義
 * @summary piのquestionツールのインターフェース
 */
export interface QuestionTool {
  ask: (questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>) => Promise<Array<{ question: string; answer: string }>>;
}

/**
 * モデル情報
 * @summary LLM呼び出しに必要なモデル情報
 */
export interface ModelInfo {
  provider: string;
  id: string;
  thinkingLevel: string;
}

// ============================================================================
// メイン関数
// ============================================================================

/**
 * Mediatorフェーズを実行
 * @summary loop_run開始前にMediatorでタスクを明確化
 * @param task ユーザーのタスク
 * @param config 統合設定
 * @param llmCall LLM呼び出し関数
 * @param questionTool Question ツール（オプション）
 * @returns Mediatorフェーズの結果
 */
export async function runMediatorPhase(
  task: string,
  config: MediatorLoopConfig,
  llmCall: LlmCallFunction,
  questionTool?: QuestionTool
): Promise<MediatorPhaseResult> {
  const startTime = Date.now();
  const sessionId = generateSessionId();
  const clarificationHistory: MediatorPhaseResult["clarificationHistory"] = [];

  try {
    // 履歴を読み込み
    const factsStore = loadConfirmedFacts(config.historyDir);
    const confirmedFacts: ConfirmedFact[] = factsStore.facts;

    // 初回の仲介
    const mediatorInput: MediatorInput = {
      userMessage: task,
      conversationHistory: [],
      confirmedFacts,
      sessionId,
    };

    const mediatorConfig: Partial<MediatorConfig> = {
      enableQuestioning: config.enableMediator,
      confidenceThreshold: config.autoProceedThreshold,
      historyDir: config.historyDir,
      debugMode: config.debugMode,
    };

    let output = await mediate(mediatorInput, mediatorConfig, llmCall);

    if (config.debugMode) {
      console.log("[mediator-integration] Initial mediation:", {
        status: output.status,
        confidence: output.confidence,
        gapCount: output.gaps.length,
        questionCount: output.questions.length,
      });
    }

    // 明確化が必要な場合
    if (output.status === "needs_clarification" && questionTool && output.questions.length > 0) {
      let round = 0;
      let currentInterpretation = output.interpretation;

      while (round < config.maxClarificationRounds) {
        round++;

        // Questionツールで質問
        const answers = await questionTool.ask(
          output.questions.map(q => ({
            header: q.header,
            question: q.question,
            options: q.options,
            multiple: q.multiple,
            custom: q.custom,
          }))
        );

        // 履歴に記録
        clarificationHistory.push({
          round,
          questions: output.questions,
          answers,
        });

        // 回答を保存
        for (const { question, answer } of answers) {
          // 質問からキーを抽出
          const keyMatch = question.match(/「(.+?)」/);
          if (keyMatch) {
            appendFact(config.historyDir, {
              key: keyMatch[1],
              value: answer,
              context: question,
              sessionId,
            });
          }
        }

        // 回答を統合して再仲介
        output = await mediateWithAnswers(
          mediatorInput,
          currentInterpretation,
          answers,
          mediatorConfig,
          llmCall
        );

        if (config.debugMode) {
          console.log(`[mediator-integration] Round ${round} result:`, {
            status: output.status,
            confidence: output.confidence,
          });
        }

        // 明確化が完了したらループを抜ける
        if (output.status !== "needs_clarification") {
          break;
        }

        currentInterpretation = output.interpretation;
      }
    }

    // 結果を構築
    const processingTimeMs = Date.now() - startTime;
    const clarifiedTask = buildClarifiedTask(task, output);

    // セッション要約を保存
    appendSummarySection(config.historyDir, {
      title: `Session ${sessionId}`,
      content: [
        `**Task**: ${task}`,
        `**Interpretation**: ${output.interpretation}`,
        `**Confidence**: ${output.confidence.toFixed(2)}`,
        `**Status**: ${output.status}`,
        clarificationHistory.length > 0
          ? `**Clarifications**: ${clarificationHistory.length} round(s)`
          : "",
      ].filter(Boolean),
    });

    return {
      success: true,
      originalTask: task,
      clarifiedTask,
      structuredIntent: output.structuredIntent,
      mediatorOutput: output,
      needsClarification: output.status === "needs_clarification",
      processingTimeMs,
      clarificationHistory,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      originalTask: task,
      clarifiedTask: task, // エラー時は元のタスクを使用
      needsClarification: false,
      error: errorMessage,
      processingTimeMs,
      clarificationHistory,
    };
  }
}

/**
 * 明確化後のタスクを構築
 * @summary Mediatorの出力から実行用タスクを生成
 * @param originalTask 元のタスク
 * @param output Mediatorの出力
 * @returns 明確化後のタスク
 */
function buildClarifiedTask(originalTask: string, output: MediatorOutput): string {
  if (output.structuredIntent && output.confidence >= 0.7) {
    // 構造化指示がある場合はプロンプト形式に変換
    const intentPrompt = structuredIntentToPrompt(output.structuredIntent);
    return [
      `## 明確化されたタスク`,
      "",
      `### 元の入力`,
      originalTask,
      "",
      `### 解釈`,
      output.interpretation,
      "",
      intentPrompt,
    ].join("\n");
  }

  if (output.interpretation && output.confidence >= 0.5) {
    // 解釈がある場合は追加
    return [
      `## タスク`,
      "",
      `### 元の入力`,
      originalTask,
      "",
      `### 解釈`,
      output.interpretation,
      "",
      `元の入力に基づいて上記の解釈でタスクを実行してください。`,
    ].join("\n");
  }

  // 信頼度が低い場合は元のタスクをそのまま使用
  return originalTask;
}

// ============================================================================
// loop_run統合用ヘルパー
// ============================================================================

/**
 * loop_run用のパラメータ拡張
 * @summary loop_runのパラメータにMediator関連を追加
 */
export interface LoopRunParamsWithMediator {
  /** 元のタスク */
  task: string;
  /** 目標 */
  goal?: string;
  /** 検証コマンド */
  verifyCommand?: string;
  /** 参照 */
  references?: Array<{ id: string; title?: string; source: string }>;
  /** モデル情報 */
  model: ModelInfo;
  /** 作業ディレクトリ */
  cwd: string;
  /** Mediatorを有効化 */
  enableMediator?: boolean;
  /** 明確化なしで進める信頼度閾値 */
  mediatorAutoProceedThreshold?: number;
}

/**
 * loop_runにMediatorを統合
 * @summary loop_run実行前にMediatorフェーズを挿入
 * @param params パラメータ
 * @param llmCall LLM呼び出し関数
 * @param questionTool Question ツール
 * @returns 明確化されたパラメータとMediator結果
 */
export async function integrateWithLoopRun(
  params: LoopRunParamsWithMediator,
  llmCall: LlmCallFunction,
  questionTool?: QuestionTool
): Promise<{
  clarifiedTask: string;
  mediatorResult?: MediatorPhaseResult;
  shouldProceed: boolean;
}> {
  // Mediatorが無効の場合はそのまま進む
  if (!params.enableMediator) {
    return {
      clarifiedTask: params.task,
      shouldProceed: true,
    };
  }

  const config: MediatorLoopConfig = {
    ...DEFAULT_MEDIATOR_LOOP_CONFIG,
    autoProceedThreshold: params.mediatorAutoProceedThreshold ?? 0.8,
  };

  const result = await runMediatorPhase(params.task, config, llmCall, questionTool);

  // エラー時も続行（元のタスクで）
  if (!result.success) {
    console.warn("[mediator-integration] Mediator phase failed, proceeding with original task");
    return {
      clarifiedTask: params.task,
      mediatorResult: result,
      shouldProceed: true,
    };
  }

  // 明確化が必要だがQuestionツールがない場合は警告して続行
  if (result.needsClarification && !questionTool) {
    console.warn("[mediator-integration] Clarification needed but no question tool available");
    return {
      clarifiedTask: result.clarifiedTask,
      mediatorResult: result,
      shouldProceed: true,
    };
  }

  return {
    clarifiedTask: result.clarifiedTask,
    mediatorResult: result,
    shouldProceed: true,
  };
}

/**
 * LLM呼び出し関数を作成
 * @summary loop_runのモデル呼び出しを使ってMediator用のLLM関数を作成
 * @param callModel モデル呼び出し関数
 * @returns Mediator用のLLM呼び出し関数
 */
export function createLlmCallFunction(
  callModel: (prompt: string, timeoutMs: number) => Promise<string>
): LlmCallFunction {
  return async (
    systemPrompt: string,
    userPrompt: string,
    options?: { timeoutMs?: number }
  ): Promise<string> => {
    // システムプロンプトとユーザープロンプトを結合
    const fullPrompt = [
      systemPrompt,
      "",
      "---",
      "",
      userPrompt,
    ].join("\n");

    const timeoutMs = options?.timeoutMs ?? 30000;
    return callModel(fullPrompt, timeoutMs);
  };
}

/**
 * Mediatorの結果をログ用にフォーマット
 * @summary Mediator結果を人間が読める形式に変換
 * @param result Mediatorフェーズの結果
 * @returns フォーマットされたテキスト
 */
export function formatMediatorResult(result: MediatorPhaseResult): string {
  const lines: string[] = [
    "## Mediator Phase Result",
    "",
    `- **Status**: ${result.success ? "success" : "failed"}`,
    `- **Original Task**: ${result.originalTask.slice(0, 100)}...`,
    `- **Clarified Task**: ${result.clarifiedTask.slice(0, 100)}...`,
    `- **Processing Time**: ${result.processingTimeMs}ms`,
  ];

  if (result.mediatorOutput) {
    lines.push(`- **Interpretation Confidence**: ${result.mediatorOutput.confidence.toFixed(2)}`);
    lines.push(`- **Gaps Detected**: ${result.mediatorOutput.gaps.length}`);
    lines.push(`- **Questions Generated**: ${result.mediatorOutput.questions.length}`);
  }

  if (result.clarificationHistory.length > 0) {
    lines.push("");
    lines.push("### Clarification History");
    for (const round of result.clarificationHistory) {
      lines.push(``);
      lines.push(`#### Round ${round.round}`);
      for (const q of round.questions) {
        lines.push(`- Q: ${q.question}`);
      }
      for (const a of round.answers) {
        lines.push(`- A: ${a.answer}`);
      }
    }
  }

  if (result.error) {
    lines.push("");
    lines.push(`### Error`);
    lines.push(result.error);
  }

  return lines.join("\n");
}

/**
 * Mediator統合が有効かどうかを判定
 * @summary 環境変数と設定からMediatorの有効/無効を判定
 * @param explicitConfig 明示的な設定
 * @returns Mediatorが有効かどうか
 */
export function isMediatorEnabled(explicitConfig?: {
  enableMediator?: boolean;
}): boolean {
  // 明示的に指定されている場合はそれに従う
  if (explicitConfig?.enableMediator !== undefined) {
    return explicitConfig.enableMediator;
  }

  // 環境変数で制御可能
  const envValue = process.env.PI_MEDIATOR_ENABLED;
  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }

  // デフォルトは有効
  return true;
}
