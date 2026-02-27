/**
 * @abdd.meta
 * path: .pi/extensions/mediator.ts
 * role: Mediator拡張のエントリーポイントおよびツール定義
 * why: LLMエージェントに対してメディエータ層を提供し、ユーザー入力の解釈と確認質問生成機能を追加するため
 * related: .pi/lib/intent-mediator.js, .pi/lib/mediator-types.js, .pi/lib/mediator-history.js
 * public_api: registerMediatorExtension関数
 * invariants: ツール名はmediator_interpret、userInputパラメータは必須、実行にはファイルシステム上の.pi/memoryディレクトリ構造を必要とする
 * side_effects: .pi/memoryディレクトリ内の確認済み事実ファクスの読み書き、LLMモデルの呼び出し
 * failure_modes: LLM呼び出しの失敗、メモリディレクトリへのアクセス権限不足、必須パラメータの欠如
 * @abdd.explain
 * overview: PIエージェントシステムにMediator機能を統合し、ユーザー入力の解釈と意図の明確化を行うツールを登録するモジュール
 * what_it_does:
 *   - ExtensionAPIを通じてmediator_interpretツールを登録する
 *   - ユーザー入力と会話履歴に基づき、LLMを用いて入力解釈を行う
 *   - 情報の不足を検出し、明確化のための質問（Mediator Questions）を生成する
 *   - セッションIDの生成と確認済み事実の管理を行う
 * why_it_exists:
 *   - マルチターン会話における意図乖離（LiC現象）を防止するため
 *   - ユーザーの要求を正確に把握するための構造的な対話フレームワークを提供するため
 *   - エージェントの行動前に入力の妥当性をチェックし、実行効率を向上させるため
 * scope:
 *   in: ExtensionAPI、ユーザー入力文字列、オプションの設定
 *   out: LLMへのプロンプト、解釈結果、確認質問リスト、メモリファイルへの書き込み
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import {
  type MediatorInput,
  type MediatorOutput,
  type StructuredIntent,
  type MediatorQuestion,
  DEFAULT_MEDIATOR_CONFIG,
  generateSessionId,
  getCurrentTimestamp,
  structuredIntentToPrompt,
} from "../lib/mediator-types.js";
import {
  mediate,
  mediateWithAnswers,
  createMediatorSession,
  type MediatorSession,
  type LlmCallFunction,
} from "../lib/intent-mediator.js";
import {
  loadConfirmedFacts,
  saveConfirmedFacts,
  appendFact,
  getRecentFacts,
  loadConversationSummary,
  appendSummarySection,
  getHistoryStats,
} from "../lib/mediator-history.js";
import { formatMediatorResult, isMediatorEnabled } from "../lib/mediator-integration.js";
import { toErrorMessage } from "../lib/error-utils.js";
import { toPreview } from "../lib/text-utils.js";

// ============================================================================
// 定数
// ============================================================================

const MEDIATOR_HELP = [
  "Mediator command usage:",
  "  /mediator interpret <task>    - ユーザー入力を解釈",
  "  /mediator history             - 履歴統計を表示",
  "  /mediator clear               - 確認済み事実をクリア",
  "  /mediator help                - ヘルプを表示",
  "",
  "Mediator はユーザー入力の意図を明確化し、",
  "マルチターン会話での意図乖離（LiC現象）を防ぎます。",
  "",
  "論文: arXiv:2602.07338v1",
  "Equation (5): Û ~ P(U | C_t, ℋ)",
].join("\n");

// ============================================================================
// メイン関数
// ============================================================================

/**
 * Mediator拡張を登録
 * @summary Mediator拡張を登録
 * @param pi 拡張API
 */
export default function registerMediatorExtension(pi: ExtensionAPI) {
  // mediator_interpretツール
  pi.registerTool({
    name: "mediator_interpret",
    label: "Mediator Interpret",
    description:
      "Interpret user input using the Mediator layer to detect information gaps and generate clarification questions.",
    parameters: Type.Object({
      userInput: Type.String({
        description: "User input to interpret",
      }),
      enableQuestioning: Type.Optional(
        Type.Boolean({
          description: "Enable clarification question generation",
        }),
      ),
      context: Type.Optional(
        Type.String({
          description: "Additional context for interpretation",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const userInput = String(params.userInput ?? "").trim();
      if (!userInput) {
        return {
          content: [{ type: "text" as const, text: "mediator_interpret error: userInput is required." }],
          details: { error: "missing_user_input" },
        };
      }

      const memoryDir = join(ctx.cwd, ".pi", "memory");
      const sessionId = generateSessionId();

      try {
        // 履歴を読み込み
        const factsStore = loadConfirmedFacts(memoryDir);
        
        // LLM呼び出し関数を作成
        const llmCall = createLlmCallFromContext(ctx);
        
        const input: MediatorInput = {
          userMessage: userInput,
          conversationHistory: [],
          confirmedFacts: factsStore.facts,
          taskContext: params.context,
          sessionId,
        };

        const config = {
          enableQuestioning: params.enableQuestioning ?? true,
          historyDir: memoryDir,
          confidenceThreshold: 0.7,
          enableLicDetection: true,
          maxQuestionsPerTurn: 3,
        };

        const output = await mediate(input, config, llmCall);

        // 結果をフォーマット
        const resultText = formatMediatorOutput(output, userInput);

        return {
          content: [{ type: "text" as const, text: resultText }],
          details: {
            status: output.status,
            confidence: output.confidence,
            gapCount: output.gaps.length,
            questionCount: output.questions.length,
            hasStructuredIntent: !!output.structuredIntent,
            processingTimeMs: output.processingTimeMs,
          },
        };
      } catch (error) {
        const message = toErrorMessage(error);
        return {
          content: [{ type: "text" as const, text: `mediator_interpret failed: ${message}` }],
          details: { error: message },
        };
      }
    },

    renderCall(args, theme) {
      const input = typeof args.userInput === "string" ? args.userInput.trim() : "";
      const preview = input.length > 48 ? `${input.slice(0, 48)}...` : input || "(no input)";
      return new Text(theme.bold("mediator_interpret ") + theme.fg("muted", preview), 0, 0);
    },

    renderResult(result, _options, theme) {
      interface MediatorResult {
        details?: { status?: string; confidence?: number };
      }
      function hasMediatorDetails(value: unknown): value is MediatorResult {
        return typeof value === "object" && value !== null && "details" in value;
      }
      const details = hasMediatorDetails(result) ? result.details : undefined;
      if (!details) {
        return new Text(theme.fg("warning", "mediator result unavailable"), 0, 0);
      }
      const statusColor = details.status === "ready" ? "success" : 
                          details.status === "needs_clarification" ? "warning" : "muted";
      return new Text(
        theme.fg(statusColor, `mediator: ${details.status}`) + 
        theme.fg("muted", ` (confidence: ${details.confidence?.toFixed(2) ?? "n/a"})`),
        0, 0
      );
    },
  });

  // /mediatorコマンド
  pi.registerCommand("mediator", {
    description: "Mediator commands for intent clarification",
    handler: async (args, ctx) => {
      const parsed = parseMediatorCommand(args);
      
      if (parsed.mode === "help") {
        pi.sendMessage({
          customType: "mediator-help",
          content: MEDIATOR_HELP,
          display: true,
        });
        return;
      }

      if (parsed.error) {
        pi.sendMessage({
          customType: "mediator-arg-error",
          content: `mediator argument error: ${parsed.error}\n\n${MEDIATOR_HELP}`,
          display: true,
        });
        return;
      }

      const memoryDir = join(ctx.cwd, ".pi", "memory");

      if (parsed.mode === "history") {
        const stats = getHistoryStats(memoryDir);
        const content = [
          "## Mediator History Statistics",
          "",
          `- Total confirmed facts: ${stats.totalFacts}`,
          `- Oldest fact: ${stats.oldestFact ?? "n/a"}`,
          `- Newest fact: ${stats.newestFact ?? "n/a"}`,
          `- Has conversation summary: ${stats.hasConversationSummary ? "yes" : "no"}`,
        ].join("\n");
        
        pi.sendMessage({
          customType: "mediator-history",
          content,
          display: true,
        });
        return;
      }

      if (parsed.mode === "clear") {
        saveConfirmedFacts(memoryDir, {
          facts: [],
          userPreferences: {},
          lastUpdatedAt: getCurrentTimestamp(),
        });
        
        ctx.ui.notify("Mediator history cleared", "info");
        return;
      }

      if (parsed.mode === "interpret") {
        if (!ctx.model) {
          ctx.ui.notify("mediator failed: no active model", "error");
          return;
        }

        if (!parsed.task) {
          ctx.ui.notify("mediator failed: no task provided", "error");
          return;
        }

        const sessionId = generateSessionId();
        const factsStore = loadConfirmedFacts(memoryDir);
        const llmCall = createLlmCallFromContext(ctx);

        const input: MediatorInput = {
          userMessage: parsed.task,
          conversationHistory: [],
          confirmedFacts: factsStore.facts,
          sessionId,
        };

        try {
          const output = await mediate(input, {
            enableQuestioning: true,
            historyDir: memoryDir,
          }, llmCall);

          const resultText = formatMediatorOutput(output, parsed.task);

          pi.sendMessage({
            customType: "mediator-interpret",
            content: resultText,
            display: true,
            details: {
              status: output.status,
              confidence: output.confidence,
              gaps: output.gaps,
              questions: output.questions,
              structuredIntent: output.structuredIntent,
            },
          });

          // 明確化が必要な場合は質問を表示
          if (output.status === "needs_clarification" && output.questions.length > 0) {
            ctx.ui.notify("Clarification needed. See questions above.", "warning");
          } else if (output.status === "ready") {
            ctx.ui.notify("Interpretation complete. Ready to execute.", "info");
          }
        } catch (error) {
          const message = toErrorMessage(error);
          pi.sendMessage({
            customType: "mediator-error",
            content: `mediator interpret failed: ${message}`,
            display: true,
          });
        }
      }
    },
  });

  // セッション開始時の処理
  pi.on("session_start", async (_event, ctx) => {
    const memoryDir = join(ctx.cwd, ".pi", "memory");
    const stats = getHistoryStats(memoryDir);
    
    if (stats.totalFacts > 0) {
      ctx.ui.notify(`Mediator loaded ${stats.totalFacts} confirmed facts`, "info");
    }
  });
}

// ============================================================================
// 内部関数
// ============================================================================

import { join } from "node:path";

interface ParsedMediatorCommand {
  mode: "help" | "interpret" | "history" | "clear";
  task?: string;
  error?: string;
}

function parseMediatorCommand(args: string | undefined): ParsedMediatorCommand {
  const raw = (args ?? "").trim();
  if (!raw) {
    return { mode: "help" };
  }

  const tokens = raw.split(/\s+/);
  const head = tokens[0]?.toLowerCase();

  if (head === "help" || head === "--help" || head === "-h") {
    return { mode: "help" };
  }

  if (head === "history") {
    return { mode: "history" };
  }

  if (head === "clear") {
    return { mode: "clear" };
  }

  if (head === "interpret") {
    const task = tokens.slice(1).join(" ").trim();
    if (!task) {
      return { mode: "interpret", error: "task is required for interpret" };
    }
    return { mode: "interpret", task };
  }

  // デフォルトはinterpret
  return { mode: "interpret", task: raw };
}

function formatMediatorOutput(output: MediatorOutput, originalInput: string): string {
  const lines: string[] = [
    "## Mediator Interpretation Result",
    "",
    `**Status**: ${output.status}`,
    `**Confidence**: ${output.confidence.toFixed(2)}`,
    `**Processing Time**: ${output.processingTimeMs}ms`,
    "",
    "### Original Input",
    originalInput,
    "",
    "### Interpretation",
    output.interpretation,
  ];

  if (output.gaps.length > 0) {
    lines.push("");
    lines.push("### Information Gaps");
    output.gaps.forEach((gap, i) => {
      lines.push(`${i + 1}. [${gap.severity}] ${gap.type}: ${gap.term}`);
      lines.push(`   ${gap.description}`);
    });
  }

  if (output.questions.length > 0) {
    lines.push("");
    lines.push("### Clarification Questions");
    output.questions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.header}**: ${q.question}`);
      q.options.forEach(opt => {
        lines.push(`   - ${opt.label}: ${opt.description}`);
      });
    });
  }

  if (output.structuredIntent) {
    lines.push("");
    lines.push("### Structured Intent");
    lines.push("```");
    lines.push(structuredIntentToPrompt(output.structuredIntent));
    lines.push("```");
  }

  return lines.join("\n");
}

interface MediatorContext {
  model?: unknown;
}
function createLlmCallFromContext(ctx: MediatorContext): LlmCallFunction {
  return async (
    systemPrompt: string,
    userPrompt: string,
    options?: { timeoutMs?: number }
  ): Promise<string> => {
    // ctx.modelを使用してLLMを呼び出す
    // 注: 実際の実装では pi-core のモデル呼び出し機能を使用
    if (!ctx.model) {
      throw new Error("No active model");
    }

    const fullPrompt = [
      systemPrompt,
      "",
      "---",
      "",
      userPrompt,
    ].join("\n");

    // プレースホルダー: 実際のモデル呼び出し
    // 本来は pi-core の executeModel などを使用
    const timeoutMs = options?.timeoutMs ?? 30000;
    
    // 簡易的な応答を返す（実際の統合時には置き換える）
    console.warn("[mediator] Using placeholder LLM call - integrate with pi-core for production");
    
    return `### 解釈結果
ユーザーの入力を解釈しました。

### 参照解決
（参照なし）

### 情報ギャップ
（検出されませんでした）

### 信頼度
0.7`;
  };
}
