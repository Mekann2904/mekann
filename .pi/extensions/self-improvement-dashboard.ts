/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-dashboard.ts
 * role: 自己改善データを視覚的に確認するためのTUIダッシュボード
 * why: データを「監視」ではなく「観察」のツールとして提供し、エージェントが自由に探索できるようにするため
 * related: .pi/lib/self-improvement-data-platform.ts, .pi/extensions/self-improvement-reflection.ts
 * public_api: /self-dashboard コマンド
 * invariants: 読み取り専用（データの変更は行わない）
 * side_effects: なし（表示のみ）
 * failure_modes: データソースへのアクセス失敗、TUIレンダリングエラー
 * @abdd.explain
 * overview: 3層データ基盤のデータを視覚化するTUIダッシュボード
 * what_it_does:
 *   - データソースの概要を視覚的に表示
 *   - エラー率、コンテキスト使用率をグラフで表示
 *   - 成功/失敗パターンの分布を表示
 *   - 哲学的視座の探索を可能にする
 * why_it_exists:
 *   - データを「監視の道具」ではなく「観察の鏡」として提供する
 *   - エージェントが自由にデータを探索できるようにする
 * scope:
 *   in: 統合データビュー（実行履歴、パターン、使用統計）
 *   out: TUI画面の表示
 */

/**
 * Self-Improvement Dashboard Extension
 * 
 * A TUI dashboard for visualizing self-improvement data.
 * Designed as an "observation mirror" rather than a "surveillance tool".
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";

import type { Theme } from "../lib/tui/types.js";
import {
  buildIntegratedDataView,
  generateInsightReport,
  loadLatestInsightReport,
  PHILOSOPHICAL_PERSPECTIVES,
  type PhilosophicalPerspective,
  type AnalysisResult,
  type PhilosophicalReflection,
  type IntegratedDataView,
  type InsightReport,
} from "../lib/self-improvement-data-platform.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

// ============================================================================
// Constants
// ============================================================================

const COMMAND_NAME = "self-dashboard";

type DashboardView =
  | "overview"
  | "analyses"
  | "reflections"
  | "patterns"
  | "usage"
  | "perspectives";

// ============================================================================
// Dashboard Rendering
// ============================================================================

interface DashboardState {
  view: DashboardView;
  dataView: IntegratedDataView | null;
  report: InsightReport | null;
  selectedIndex: number;
}

function renderDashboard(
  state: DashboardState,
  w: number,
  theme: Theme
): string[] {
  const lines: string[] = [];
  const safeWidth = Math.max(1, Number.isFinite(w) ? Math.trunc(w) : 80);
  const add = (s: string) => lines.push(truncateToWidth(s, safeWidth));

  // Header
  add(theme.bold(theme.fg("accent", "Self-Improvement Dashboard")));
  add(theme.fg("dim", `View: ${state.view} | [1-6] switch view | [r] refresh | [q] close`));
  add("");

  switch (state.view) {
    case "overview":
      renderOverview(state, add, theme);
      break;
    case "analyses":
      renderAnalyses(state, add, theme, safeWidth);
      break;
    case "reflections":
      renderReflections(state, add, theme, safeWidth);
      break;
    case "patterns":
      renderPatterns(state, add, theme);
      break;
    case "usage":
      renderUsage(state, add, theme, safeWidth);
      break;
    case "perspectives":
      renderPerspectives(state, add, theme, safeWidth);
      break;
  }

  return lines;
}

function renderOverview(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme
): void {
  const dv = state.dataView;
  if (!dv) {
    add(theme.fg("dim", "No data available. Press [r] to refresh."));
    return;
  }

  add(theme.bold("Data Sources"));
  add("");

  // Run Index
  if (dv.runIndex) {
    const runs = dv.runIndex.runs.length;
    const completed = dv.runIndex.runs.filter((r) => r.status === "completed").length;
    const failed = dv.runIndex.runs.filter((r) => r.status === "failed").length;
    add(`  Runs: ${runs} (${completed} completed, ${failed} failed)`);
  } else {
    add(`  Runs: No data`);
  }

  // Patterns
  if (dv.patterns) {
    const success = dv.patterns.patterns.filter((p) => p.patternType === "success").length;
    const failure = dv.patterns.patterns.filter((p) => p.patternType === "failure").length;
    const approach = dv.patterns.patterns.filter((p) => p.patternType === "approach").length;
    add(`  Patterns: ${dv.patterns.patterns.length} (${success} success, ${failure} failure, ${approach} approach)`);
  } else {
    add(`  Patterns: No data`);
  }

  // Semantic Memory
  if (dv.semanticMemory) {
    add(`  Embeddings: ${dv.semanticMemory.embeddings.length}`);
  } else {
    add(`  Embeddings: No data`);
  }

  // Usage Stats
  if (dv.usageStats) {
    const errorRate = (dv.usageStats.errorRate * 100).toFixed(2);
    const ctxRatio = dv.usageStats.avgContextRatio
      ? (dv.usageStats.avgContextRatio * 100).toFixed(1)
      : "N/A";
    add(`  Tool Calls: ${dv.usageStats.totalToolCalls}`);
    add(`  Error Rate: ${errorRate}%`);
    add(`  Avg Context Ratio: ${ctxRatio}%`);
  } else {
    add(`  Usage Stats: No data`);
  }

  add("");

  // Metrics
  if (state.report) {
    add(theme.bold("Report Metrics"));
    add(`  Data Quality: ${(state.report.metrics.dataQualityScore * 100).toFixed(0)}%`);
    add(`  Analysis Coverage: ${(state.report.metrics.analysisCoverage * 100).toFixed(0)}%`);
    add(`  Insight Actionability: ${(state.report.metrics.insightActionability * 100).toFixed(0)}%`);
  }

  add("");
  add(theme.fg("dim", "Note: This is an observation tool, not a surveillance tool."));
  add(theme.fg("dim", "Data shows phenomena, not judgments."));
}

function renderAnalyses(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme,
  width: number
): void {
  if (!state.report || state.report.analyses.length === 0) {
    add(theme.fg("dim", "No analyses available. Press [r] to generate a report."));
    return;
  }

  add(theme.bold(`Analyses (${state.report.analyses.length})`));
  add("");

  const severityColors: Record<string, any> = {
    critical: theme.fg("error", "CRITICAL"),
    high: theme.fg("warning", "HIGH"),
    medium: theme.fg("accent", "MEDIUM"),
    low: theme.fg("dim", "LOW"),
  };

  for (let i = 0; i < Math.min(state.report.analyses.length, 15); i++) {
    const a = state.report.analyses[i];
    const sevLabel = severityColors[a.severity] || theme.fg("dim", a.severity.toUpperCase());
    const marker = i === state.selectedIndex ? ">" : " ";
    add(`${marker} [${sevLabel}] ${a.title}`);
    if (i === state.selectedIndex) {
      add(`    ${theme.fg("dim", a.description.slice(0, width - 4))}`);
      add(`    ${theme.fg("dim", `Confidence: ${(a.confidence * 100).toFixed(0)}%`)}`);
    }
  }

  add("");
  add(theme.fg("dim", "[↑↓] navigate | [Enter] view details"));
}

function renderReflections(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme,
  width: number
): void {
  if (!state.report || state.report.philosophicalReflections.length === 0) {
    add(theme.fg("dim", "No reflections available. Press [r] to generate a report."));
    return;
  }

  add(theme.bold(`Philosophical Reflections (${state.report.philosophicalReflections.length})`));
  add("");

  for (let i = 0; i < state.report.philosophicalReflections.length; i++) {
    const r = state.report.philosophicalReflections[i];
    const perspective = PHILOSOPHICAL_PERSPECTIVES[r.perspective];
    const marker = i === state.selectedIndex ? ">" : " ";
    add(`${marker} ${theme.bold(perspective.name)}`);
    add(`    ${theme.fg("dim", `Q: ${r.question}`)}`);
    if (i === state.selectedIndex) {
      add(`    ${theme.fg("dim", `Observation: ${r.observation.slice(0, width - 10)}`)}`);
      if (r.suggestedAction) {
        add(`    ${theme.fg("accent", `→ ${r.suggestedAction.slice(0, width - 10)}`)}`);
      }
    }
    add("");
  }

  add(theme.fg("dim", "[↑↓] navigate | [Enter] view details"));
}

function renderPatterns(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme
): void {
  const dv = state.dataView;
  if (!dv || !dv.patterns || dv.patterns.patterns.length === 0) {
    add(theme.fg("dim", "No patterns available."));
    return;
  }

  const patterns = dv.patterns.patterns;
  add(theme.bold(`Patterns (${patterns.length})`));
  add("");

  // Group by type
  const success = patterns.filter((p) => p.patternType === "success").sort((a, b) => b.frequency - a.frequency);
  const failure = patterns.filter((p) => p.patternType === "failure").sort((a, b) => b.frequency - a.frequency);

  add(theme.fg("success", `Success Patterns (${success.length})`));
  for (const p of success.slice(0, 5)) {
    add(`  - ${p.taskType}: freq=${p.frequency}, conf=${(p.confidence * 100).toFixed(0)}%`);
  }

  add("");
  add(theme.fg("warning", `Failure Patterns (${failure.length})`));
  for (const p of failure.slice(0, 5)) {
    add(`  - ${p.taskType}: freq=${p.frequency}`);
  }

  add("");
  add(theme.fg("dim", "Note: These are observed patterns, not prescriptions."));
}

function renderUsage(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme,
  width: number
): void {
  const dv = state.dataView;
  if (!dv || !dv.usageStats) {
    add(theme.fg("dim", "No usage stats available."));
    return;
  }

  const stats = dv.usageStats;
  add(theme.bold("Usage Statistics"));
  add("");

  // Summary
  add(`Tool Calls: ${stats.totalToolCalls}`);
  add(`Errors: ${stats.totalErrors} (${(stats.errorRate * 100).toFixed(2)}%)`);
  if (stats.avgContextRatio !== null) {
    add(`Avg Context Ratio: ${(stats.avgContextRatio * 100).toFixed(1)}%`);
  }

  add("");
  add(theme.bold("Top Extensions"));

  for (const ext of stats.topExtensions.slice(0, 10)) {
    const barLen = Math.max(4, Math.min(30, width - 50));
    const pct = stats.totalToolCalls > 0 ? ext.calls / stats.totalToolCalls : 0;
    const filled = Math.round(pct * barLen);
    const bar = theme.fg("accent", "#".repeat(filled)) + theme.fg("dim", "-".repeat(barLen - filled));

    const errorIndicator = ext.errorRate > 0.1
      ? theme.fg("warning", ` (${(ext.errorRate * 100).toFixed(1)}% err)`)
      : "";

    add(`  ${ext.extension.padEnd(20)} ${bar} ${ext.calls}${errorIndicator}`);
  }

  add("");
  add(theme.fg("dim", "This shows usage patterns, not performance judgments."));
}

function renderPerspectives(
  state: DashboardState,
  add: (s: string) => void,
  theme: Theme,
  width: number
): void {
  add(theme.bold("7 Philosophical Perspectives"));
  add("");

  for (const [key, value] of Object.entries(PHILOSOPHICAL_PERSPECTIVES)) {
    add(theme.fg("accent", `## ${value.name}`));
    add(`  Core Question: ${value.coreQuestion}`);
    add(`  Practice: ${value.practiceGuide.slice(0, width - 10)}`);
    add("");
  }

  add(theme.fg("dim", "Use these perspectives to deepen your reflection."));
}

// ============================================================================
// Extension Registration
// ============================================================================

/**
 * ダッシュボード登録
 * @summary 登録処理実行
 * @param pi 拡張機能APIオブジェクト
 * @returns なし
 */
export default function registerSelfImprovementDashboard(pi: ExtensionAPI) {
  pi.registerCommand(COMMAND_NAME, {
    description: "Visualize self-improvement data in a TUI dashboard",
    handler: async (_args, ctx) => {
      const operationId = logger.startOperation(
        "direct" as OperationType,
        "self_dashboard",
        { task: "自己改善データダッシュボードの表示", params: {} }
      );

      try {
        // Initial state
        let state: DashboardState = {
          view: "overview",
          dataView: buildIntegratedDataView(ctx.cwd),
          report: loadLatestInsightReport(ctx.cwd),
          selectedIndex: 0,
        };

        await ctx.ui.custom<void>((tui, theme, _kb, done) => {
          const t = theme as Theme;
          return {
          render: (w) => renderDashboard(state, w, t),

          invalidate: () => {},

          handleInput: (input) => {
            if (input === "q" || input === "escape") {
              logger.endOperation({
                status: "success",
                tokensUsed: 0,
                outputLength: 0,
                childOperations: 0,
                toolCalls: 0,
              });
              done();
              return;
            }

            if (input === "r") {
              // Refresh
              state = {
                ...state,
                dataView: buildIntegratedDataView(ctx.cwd),
                report: loadLatestInsightReport(ctx.cwd),
              };
              tui.requestRender();
              return;
            }

            if (input === "1") {
              state = { ...state, view: "overview", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "2") {
              state = { ...state, view: "analyses", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "3") {
              state = { ...state, view: "reflections", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "4") {
              state = { ...state, view: "patterns", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "5") {
              state = { ...state, view: "usage", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "6") {
              state = { ...state, view: "perspectives", selectedIndex: 0 };
              tui.requestRender();
              return;
            }

            if (input === "up" || input === "k") {
              const maxIdx = getMaxIndex(state);
              if (maxIdx > 0) {
                state = {
                  ...state,
                  selectedIndex: Math.max(0, state.selectedIndex - 1),
                };
                tui.requestRender();
              }
              return;
            }

            if (input === "down" || input === "j") {
              const maxIdx = getMaxIndex(state);
              if (state.selectedIndex < maxIdx - 1) {
                state = {
                  ...state,
                  selectedIndex: Math.min(maxIdx - 1, state.selectedIndex + 1),
                };
                tui.requestRender();
              }
              return;
            }
          },
        };
      });
      } catch (error: unknown) {
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: {
            type: error instanceof Error ? error.constructor.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack || "" : "",
          },
        });
      }
    },
  });

  console.log("[self-improvement-dashboard] Extension registered");
}

function getMaxIndex(state: DashboardState): number {
  if (!state.report) return 0;

  switch (state.view) {
    case "analyses":
      return state.report.analyses.length;
    case "reflections":
      return state.report.philosophicalReflections.length;
    default:
      return 0;
  }
}
