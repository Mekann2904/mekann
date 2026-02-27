/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-reflection.ts
 * role: エージェントが自分自身の振り返りを行うための拡張機能
 * why: データ基盤を「気づき」に変換し、エージェントの自己認識と継続的改善を可能にするため
 * related: .pi/lib/self-improvement-data-platform.ts, .pi/skills/self-improvement/SKILL.md
 * public_api: self_reflect ツール, /self-reflect コマンド
 * invariants: 読み取り専用（データの変更は行わない）
 * side_effects: 洞察レポートファイルの作成（generate時のみ）
 * failure_modes: データソースへのアクセス失敗、分析エンジンのエラー
 * @abdd.explain
 * overview: 3層データ基盤（データ・分析・気づき）をエージェントに提供する拡張機能
 * what_it_does:
 *   - 統合データビューの構築と表示
 *   - 自動分析と哲学的考察の生成
 *   - アクション可能な洞察の提示
 *   - 定期的な振り返りを促すインターフェース
 * why_it_exists:
 *   - データは存在するが「気づき」に変換されていない問題を解決する
 *   - エージェントが自分自身を振り返るための具体的な手段を提供する
 * scope:
 *   in: 統合データビュー（実行履歴、パターン、使用統計）
 *   out: 洞察レポート、サマリー、哲学的考察
 */

/**
 * Self-Improvement Reflection Extension
 * 
 * Provides tools and commands for agent self-reflection.
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  buildIntegratedDataView,
  generateInsightReport,
  saveInsightReport,
  loadLatestInsightReport,
  listInsightReports,
  formatInsightReportAsText,
  generatePlatformSummary,
  type InsightReport,
  type PlatformConfig,
  PHILOSOPHICAL_PERSPECTIVES,
  type PhilosophicalPerspective,
  DEFAULT_CONFIG,
} from "../lib/self-improvement-data-platform.js";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

// ============================================================================
// Constants
// ============================================================================

const COMMAND_NAME = "self-reflect";
const TOOL_NAME = "self_reflect";

type ReflectionAction = "summary" | "insights" | "generate" | "perspectives" | "history";

// ============================================================================
// Command Handler
// ============================================================================

async function handleSelfReflectCommand(
  args: string,
  ctx: ExtensionContext
): Promise<void> {
  const [subCommandRaw, ...rest] = args.trim().split(/\s+/).filter(Boolean);
  const subCommand = (subCommandRaw || "summary").toLowerCase() as ReflectionAction;

  switch (subCommand) {
    case "summary":
      await showSummary(ctx);
      break;
    case "insights":
      await showInsights(ctx);
      break;
    case "generate":
      await generateNewInsights(ctx);
      break;
    case "perspectives":
      await showPerspectives(ctx);
      break;
    case "history":
      await showHistory(ctx, rest[0]);
      break;
    default:
      ctx.ui.notify(
        `Unknown subcommand: ${subCommand}. Available: summary, insights, generate, perspectives, history`,
        "error"
      );
  }
}

async function showSummary(ctx: ExtensionContext): Promise<void> {
  const summary = generatePlatformSummary(ctx.cwd);
  ctx.ui.notify(summary, "info");
}

async function showInsights(ctx: ExtensionContext): Promise<void> {
  const report = loadLatestInsightReport(ctx.cwd);

  if (!report) {
    ctx.ui.notify(
      "No insight report found. Run '/self-reflect generate' to create one.",
      "info"
    );
    return;
  }

  const text = formatInsightReportAsText(report);
  ctx.ui.notify(text, "info");
}

async function generateNewInsights(ctx: ExtensionContext): Promise<void> {
  ctx.ui.notify("Generating insight report...", "info");

  try {
    const config: PlatformConfig = {
      ...DEFAULT_CONFIG,
      enableSemanticAnalysis: true,
      enablePatternAnalysis: true,
      enableUsageAnalysis: true,
      enablePhilosophicalReflection: true,
    };

    const report = generateInsightReport(ctx.cwd, config);
    const filepath = saveInsightReport(ctx.cwd, report);

    const text = formatInsightReportAsText(report);
    ctx.ui.notify(`${text}\n\nSaved to: ${filepath}`, "info");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to generate insight report: ${errorMessage}`, "error");
  }
}

async function showPerspectives(ctx: ExtensionContext): Promise<void> {
  const lines: string[] = ["# 7 Philosophical Perspectives for Self-Reflection", ""];

  for (const [key, value] of Object.entries(PHILOSOPHICAL_PERSPECTIVES)) {
    lines.push(`## ${value.name} (${key})`);
    lines.push(`- Core Question: ${value.coreQuestion}`);
    lines.push(`- Practice Guide: ${value.practiceGuide}`);
    lines.push("");
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

async function showHistory(ctx: ExtensionContext, limitRaw?: string): Promise<void> {
  const limit = parseInt(limitRaw || "10", 10) || 10;
  const reports = listInsightReports(ctx.cwd).slice(0, limit);

  if (reports.length === 0) {
    ctx.ui.notify("No insight reports found.", "info");
    return;
  }

  const lines: string[] = [`# Insight Report History (${reports.length})`, ""];

  for (const report of reports) {
    lines.push(`- ${report}`);
  }

  ctx.ui.notify(lines.join("\n"), "info");
}

// ============================================================================
// Tool Implementation
// ============================================================================

async function executeSelfReflectTool(
  _toolCallId: string,
  params: {
    action?: "summary" | "insights" | "generate" | "perspectives" | "analyze";
    perspective?: PhilosophicalPerspective;
    focus_area?: string;
    config?: Partial<PlatformConfig>;
  },
  _signal: AbortSignal,
  _onUpdate: (partialResult: { content: Array<{ type: "text"; text: string }> }) => void,
  ctx: ExtensionContext
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  details?: Record<string, unknown>;
}> {
  const operationId = logger.startOperation(
    "direct" as OperationType,
    `${TOOL_NAME}:${params.action || "summary"}`,
    {
      task: `自己振り返り: ${params.action || "summary"}`,
      params,
    }
  );

  try {
    const action = params.action || "summary";
    const config: PlatformConfig = {
      ...DEFAULT_CONFIG,
      ...params.config,
    };

    let result: string;
    let details: Record<string, unknown> = {};

    switch (action) {
      case "summary": {
        result = generatePlatformSummary(ctx.cwd);
        details = { action: "summary" };
        break;
      }

      case "insights": {
        const report = loadLatestInsightReport(ctx.cwd);
        if (!report) {
          result = "No insight report found. Use action='generate' to create one.";
          details = { action: "insights", found: false };
        } else {
          result = formatInsightReportAsText(report);
          details = {
            action: "insights",
            found: true,
            generatedAt: report.generatedAt,
            analysisCount: report.analyses.length,
            reflectionCount: report.philosophicalReflections.length,
          };
        }
        break;
      }

      case "generate": {
        const report = generateInsightReport(ctx.cwd, config);
        const filepath = saveInsightReport(ctx.cwd, report);
        result = formatInsightReportAsText(report);
        details = {
          action: "generate",
          savedTo: filepath,
          analysisCount: report.analyses.length,
          reflectionCount: report.philosophicalReflections.length,
          metrics: report.metrics,
        };
        break;
      }

      case "perspectives": {
        const lines: string[] = ["# 7 Philosophical Perspectives", ""];
        for (const [key, value] of Object.entries(PHILOSOPHICAL_PERSPECTIVES)) {
          lines.push(`## ${value.name}`);
          lines.push(`- Key: ${key}`);
          lines.push(`- Core Question: ${value.coreQuestion}`);
          lines.push(`- Practice: ${value.practiceGuide}`);
          lines.push("");
        }
        result = lines.join("\n");
        details = { action: "perspectives", count: 7 };
        break;
      }

      case "analyze": {
        // 特定の視座または領域に焦点を当てた分析
        const report = generateInsightReport(ctx.cwd, config);

        if (params.perspective) {
          // 特定の視座に絞ってフィルタリング
          const filteredReflections = report.philosophicalReflections.filter(
            (r) => r.perspective === params.perspective
          );
          const perspective = PHILOSOPHICAL_PERSPECTIVES[params.perspective];

          const lines: string[] = [
            `# Analysis: ${perspective.name}`,
            "",
            `## Core Question`,
            perspective.coreQuestion,
            "",
            `## Observations`,
          ];

          for (const r of filteredReflections) {
            lines.push(`- ${r.observation}`);
            if (r.suggestedAction) {
              lines.push(`  - Action: ${r.suggestedAction}`);
            }
          }

          result = lines.join("\n");
          details = {
            action: "analyze",
            perspective: params.perspective,
            reflectionCount: filteredReflections.length,
          };
        } else if (params.focus_area) {
          // 特定の領域に絞って分析をフィルタリング
          const focusArea = params.focus_area.toLowerCase();
          const relevantAnalyses = report.analyses.filter(
            (a) =>
              a.title.toLowerCase().includes(focusArea) ||
              a.description.toLowerCase().includes(focusArea) ||
              a.category.toLowerCase().includes(focusArea)
          );

          const lines: string[] = [
            `# Analysis: Focus on "${params.focus_area}"`,
            "",
            `## Findings (${relevantAnalyses.length})`,
          ];

          for (const a of relevantAnalyses) {
            lines.push(``);
            lines.push(`### [${a.severity}] ${a.title}`);
            lines.push(a.description);
            lines.push(`Confidence: ${(a.confidence * 100).toFixed(0)}%`);
          }

          result = lines.join("\n");
          details = {
            action: "analyze",
            focusArea: params.focus_area,
            analysisCount: relevantAnalyses.length,
          };
        } else {
          // 全体分析
          result = formatInsightReportAsText(report);
          details = {
            action: "analyze",
            analysisCount: report.analyses.length,
            reflectionCount: report.philosophicalReflections.length,
          };
        }

        // 生成したレポートを保存
        saveInsightReport(ctx.cwd, report);
        break;
      }

      default:
        result = `Unknown action: ${action}. Available: summary, insights, generate, perspectives, analyze`;
        details = { action, error: "unknown_action" };
    }

    logger.endOperation({
      status: "success",
      tokensUsed: 0,
      outputLength: result.length,
      childOperations: 0,
      toolCalls: 0,
    });

    return {
      content: [{ type: "text", text: result }],
      details,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.endOperation({
      status: "failure",
      tokensUsed: 0,
      outputLength: 0,
      childOperations: 0,
      toolCalls: 0,
      error: {
        type: error instanceof Error ? error.constructor.name : "UnknownError",
        message: errorMessage,
        stack: error instanceof Error ? error.stack || "" : "",
      },
    });

    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      details: { error: errorMessage },
    };
  }
}

// ============================================================================
// Extension Registration
// ============================================================================

/**
 * 自己改善の監視を登録
 * @summary 自己改善監視登録
 * @param pi 拡張API
 * @returns void
 */
export default function registerSelfImprovementReflection(pi: ExtensionAPI) {
  // セッション開始時にデータ基盤を初期化
  pi.on("session_start", async (_event, ctx) => {
    const dataView = buildIntegratedDataView(ctx.cwd);

    const hasData =
      dataView.runIndex?.runs.length ||
      dataView.patterns?.patterns.length ||
      dataView.semanticMemory?.embeddings.length ||
      dataView.usageStats;

    if (hasData) {
      // 監視的な通知ではなく、気づきを促す穏やかなメッセージ
      ctx.ui.notify(
        `Self-improvement data available. Use '/self-reflect' or '/self-dashboard' when curious.`,
        "info"
      );
    }
  });

  // ツール実行回数に基づく気づきの機会（強制ではなく提案）
  let toolCallCount = 0;
  const REFLECTION_SUGGESTION_THRESHOLD = 100;

  pi.on("tool_result", async (_event, ctx) => {
    toolCallCount++;

    // 閾値に達したら気づきを促す（ただし強制しない）
    if (toolCallCount === REFLECTION_SUGGESTION_THRESHOLD) {
      ctx.ui.notify(
        `${toolCallCount} tool calls completed. Consider '/self-reflect' when ready for a pause.`,
        "info"
      );
    }
  });

  // コマンド登録
  pi.registerCommand(COMMAND_NAME, {
    description:
      "Self-reflection tools for agent improvement (summary, insights, generate, perspectives, history)",
    handler: async (args, ctx) => {
      await handleSelfReflectCommand(args ?? "", ctx);
    },
  });

  // ツール登録
  pi.registerTool({
    name: TOOL_NAME,
    label: "Self-Reflect",
    description: `Perform self-reflection and analysis using the self-improvement data platform.
    
Actions:
- summary: Show data platform summary (data sources, counts)
- insights: Show latest insight report
- generate: Generate a new insight report
- perspectives: List all philosophical perspectives for reflection
- analyze: Deep analysis with optional focus on a specific perspective or area

The platform integrates:
- Run history (subagent and team executions)
- Success/failure patterns
- Usage statistics (tool calls, errors, context usage)
- Semantic memory (embeddings)

Use this tool regularly to maintain awareness of your own behavior and improve continuously.`,
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("summary"),
          Type.Literal("insights"),
          Type.Literal("generate"),
          Type.Literal("perspectives"),
          Type.Literal("analyze"),
        ])
      ),
      perspective: Type.Optional(
        Type.String({
          description:
            "Specific philosophical perspective for analysis (deconstruction, schizoanalysis, eudaimonia, utopia_dystopia, philosophy_of_thought, taxonomy_of_thought, logic)",
        })
      ),
      focus_area: Type.Optional(
        Type.String({
          description:
            "Focus area for analysis (e.g., 'error', 'performance', 'context', 'pattern')",
        })
      ),
      config: Type.Optional(
        Type.Object({
          enableSemanticAnalysis: Type.Optional(Type.Boolean()),
          enablePatternAnalysis: Type.Optional(Type.Boolean()),
          enableUsageAnalysis: Type.Optional(Type.Boolean()),
          enablePhilosophicalReflection: Type.Optional(Type.Boolean()),
          maxInsightsPerReport: Type.Optional(Type.Number()),
        })
      ),
    }),
    // @ts-expect-error - Type inference issue with execute signature
    execute: async (_toolCallId: string, params: SelfReflectParams, _signal: AbortSignal, _onUpdate: (partialResult: { content: Array<{ type: "text"; text: string }> }) => void, ctx: ExtensionContext) => {
      return executeSelfReflectTool(_toolCallId, params, _signal, _onUpdate, ctx);
    },
  });

  // ログ
  console.error("[self-improvement-reflection] Extension registered");
}
