/**
 * @abdd.meta
 * path: .pi/lib/tui/gantt-utils.ts
 * role: Ganttチャート描画ユーティリティ
 * why: ライブモニタでタスクの実行状態を時間軸で可視化するため
 * related: ./live-monitor-base.ts, ../live-types-base.ts
 * public_api: renderGanttBar, renderTimeAxis, renderGanttView, calculateAdaptiveScale, GANTT_CHARS, GanttConfig
 * invariants: 時間軸は常に画面幅に収まる、スケールは自動調整される
 * side_effects: なし（純粋な描画関数）
 * failure_modes: アイテムがない場合は空行を返す
 * @abdd.explain
 * overview: タスクの実行状態（RUN/WAIT）を時間軸に沿ってGanttチャート形式で描画する
 * what_it_does:
 *   - 各タスクの開始・終了時刻から棒グラフを生成する
 *   - 自動スケールで時間軸を画面幅にフィットさせる
 *   - Unicodeブロック文字で状態を可視化する
 * why_it_exists:
 *   - 複数タスクの並列実行状況を直感的に把握するため
 *   - 時間軸表示でタスクの重なりや待機時間を可視化するため
 * scope:
 *   in: アイテム配列、画面幅、テーマ設定
 *   out: 描画用文字列配列
 */

/**
 * Gantt chart rendering utilities.
 * Visualizes task execution timeline with RUN/WAIT states.
 */

import type { Theme, ThemeColor } from "./types.js";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { formatClockTime } from "../format-utils.js";
import { pushWrappedLine } from "./tui-utils.js";
import type { BaseLiveSnapshot, StateTransition } from "../live-types-base.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Gantt chart configuration
 * @summary Gantt設定
 */
export interface GanttConfig {
  /** Time axis start (ms) */
  timeStart: number;
  /** Time axis end (ms) */
  timeEnd: number;
  /** Character width for time axis */
  axisWidth: number;
  /** Show system rows (KERNEL/ISR) */
  showSystemRows?: boolean;
}

/**
 * Gantt item with timeline support
 * @summary Ganttアイテム型
 */
export interface GanttItem extends BaseLiveSnapshot {
  id: string;
  name?: string;
  stateTimeline?: StateTransition[];
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Unicode block characters for Gantt bars
 */
export const GANTT_CHARS = {
  /** Full block for RUN state */
  RUN: "\u2588",
  /** Light shade for WAIT state */
  WAIT: "\u2591",
  /** Empty space */
  EMPTY: " ",
  /** Vertical line for axis tick */
  AXIS_TICK: "\u2502",
  /** Horizontal line for axis */
  AXIS_HORIZ: "\u2500",
  /** Left tee */
  TEE_LEFT: "\u251c",
  /** Right tee */
  TEE_RIGHT: "\u2524",
  /** Top left corner */
  CORNER_TL: "\u250c",
  /** Bottom left corner */
  CORNER_BL: "\u2514",
  /** Top right corner */
  CORNER_TR: "\u2510",
  /** Bottom right corner */
  CORNER_BR: "\u2518",
} as const;

function getActivityStyle(activity: StateTransition["activity"]): { color: ThemeColor; glyph: string } {
  const kind = activity ?? "OTHER";
  // Dense block fill looks noisy in long-running rows.
  // Keep bars lightweight with thin glyphs and color cues.
  if (kind === "LLM") return { color: "accent", glyph: "·" };
  if (kind === "EDIT") return { color: "success", glyph: "=" };
  if (kind === "COMMAND") return { color: "warning", glyph: "~" };
  if (kind === "READ") return { color: "dim", glyph: ":" };
  if (kind === "THINK") return { color: "dim", glyph: "." };
  return { color: "dim", glyph: "·" };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format seconds to human-readable string
 * @summary 秒をフォーマット
 * @param seconds 秒数
 * @returns フォーマットされた文字列
 */
function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    const rounded = Math.round(seconds * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}s` : `${rounded.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m${secs}s`;
}

/**
 * Get state at a specific timestamp
 * @summary 指定時刻の状態を取得
 * @param timeline 状態タイムライン
 * @param timeMs 時刻（ミリ秒）
 * @returns 状態（RUN/WAIT）またはnull
 */
function getStateAtTime(
  timeline: StateTransition[],
  timeMs: number,
): StateTransition | null {
  for (const transition of timeline) {
    const end = transition.finishedAtMs ?? Date.now();
    if (timeMs >= transition.startedAtMs && timeMs < end) {
      return transition;
    }
  }
  return null;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Calculate optimal time scale to fit within width
 * @summary 自動スケール計算
 * @param items アイテム配列
 * @param availableWidth 利用可能な幅
 * @param minBarWidth 最小バー幅（デフォルト2）
 * @returns 時間範囲
 */
export function calculateAdaptiveScale(
  items: GanttItem[],
  availableWidth: number,
  minBarWidth: number = 2,
): { timeStart: number; timeEnd: number } {
  const runningItems = items.filter((i) => i.startedAtMs);
  if (runningItems.length === 0) {
    const now = Date.now();
    return { timeStart: now, timeEnd: now };
  }

  const earliestStart = Math.min(...runningItems.map((i) => i.startedAtMs!));
  const latestEnd = Math.max(
    ...runningItems.map((i) => i.finishedAtMs ?? Date.now()),
  );

  // Fit all data exactly.
  // Keep left edge pinned to first start and right edge pinned to latest end
  // so bar start/end and axis range stay visually consistent.
  const duration = latestEnd - earliestStart;
  if (duration <= 0) {
    const minDurationMs = Math.max(10_000, minBarWidth * 1_000);
    return {
      timeStart: earliestStart,
      timeEnd: earliestStart + minDurationMs,
    };
  }

  return {
    timeStart: earliestStart,
    timeEnd: latestEnd,
  };
}

/**
 * Render a single Gantt bar for an item
 * @summary Ganttバー描画
 * @param item アイテム
 * @param config Gantt設定
 * @returns 描画されたバー文字列
 */
export function renderGanttBar(
  item: GanttItem,
  config: GanttConfig,
  theme: Theme,
): string {
  const { timeStart, timeEnd, axisWidth } = config;
  const totalDuration = timeEnd - timeStart;

  if (!item.startedAtMs) {
    return GANTT_CHARS.EMPTY.repeat(axisWidth);
  }

  // Build timeline from stateTimeline or use default single RUN state
  const timeline: StateTransition[] = item.stateTimeline && item.stateTimeline.length > 0
    ? item.stateTimeline
    : [{ startedAtMs: item.startedAtMs, state: "RUN" as const }];

  let bar = "";
  const denom = Math.max(1, axisWidth - 1);

  for (let i = 0; i < axisWidth; i++) {
    const charTime = timeStart + (i / denom) * totalDuration;
    const transition = getStateAtTime(timeline, charTime);

    if (!transition) {
      bar += GANTT_CHARS.EMPTY;
    } else if (transition.state === "RUN") {
      const style = getActivityStyle(transition.activity);
      bar += theme.fg(style.color, style.glyph);
    } else {
      bar += theme.fg("dim", GANTT_CHARS.WAIT);
    }
  }

  return bar;
}

/**
 * Render time axis header
 * @summary 時間軸描画
 * @param config Gantt設定
 * @param theme テーマ
 * @returns 描画された行配列
 */
export function renderTimeAxis(
  config: GanttConfig,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const { timeStart, timeEnd, axisWidth } = config;

  const totalSeconds = (timeEnd - timeStart) / 1000;
  const tickCount = Math.max(1, Math.min(5, Math.floor(axisWidth / 12)));
  const tickInterval = totalSeconds / tickCount;

  // Axis line with ticks (no "Time " prefix - will be aligned by caller)
  const tickPositions: number[] = [];

  for (let i = 0; i <= tickCount; i++) {
    const pos = Math.round((i / tickCount) * (axisWidth - 1));
    tickPositions.push(Math.min(pos, axisWidth - 1));
  }

  // Build axis line character by character
  const axisChars: string[] = [];
  const tickSet = new Set(tickPositions);
  for (let i = 0; i < axisWidth; i++) {
    if (tickSet.has(i)) {
      axisChars.push(GANTT_CHARS.AXIS_TICK);
    } else {
      axisChars.push(GANTT_CHARS.AXIS_HORIZ);
    }
  }

  lines.push(theme.fg("dim", axisChars.join("")));

  // Tick labels
  const labelChars: string[] = Array(axisWidth).fill(" ");

  for (let i = 0; i <= tickCount; i++) {
    const pos = tickPositions[i];
    const seconds = i * tickInterval;
    const label = formatSeconds(seconds);

    // Keep labels centered on tick and clamped to axis bounds.
    const idealStart = pos - Math.floor(label.length / 2);
    const start = Math.max(0, Math.min(axisWidth - label.length, idealStart));
    for (let j = 0; j < label.length; j++) {
      const idx = start + j;
      if (idx >= 0 && idx < axisWidth) {
        labelChars[idx] = label[j];
      }
    }
  }

  const labelLine = labelChars.join("").trimEnd();
  lines.push(theme.fg("dim", labelLine));

  // Scale indicator
  const scaleText = `Scale: ${totalSeconds.toFixed(1)}s / ${axisWidth} chars = ${(totalSeconds / axisWidth).toFixed(2)}s/char`;
  lines.push(theme.fg("dim", scaleText));

  return lines;
}

/**
 * Render complete Gantt view
 * @summary Ganttビュー描画
 * @param items アイテム配列
 * @param width 画面幅
 * @param height 画面高さ
 * @param theme テーマ
 * @param showSystemRows システム行を表示するか
 * @returns 描画された行配列
 */
export function renderGanttView(
  items: GanttItem[],
  width: number,
  height: number,
  theme: Theme,
  showSystemRows: boolean = false,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => pushWrappedLine(lines, line, width);

  // Calculate time bounds
  const runningItems = items.filter((i) => i.startedAtMs);
  if (runningItems.length === 0) {
    add(theme.fg("dim", "No tasks started yet"));
    return lines;
  }

  const labelWidth = 14;
  const barWidth = Math.max(20, width - labelWidth - 5);

  const { timeStart, timeEnd } = calculateAdaptiveScale(items, barWidth);

  const config: GanttConfig = {
    timeStart,
    timeEnd,
    axisWidth: barWidth,
    showSystemRows,
  };

  // Minimal header
  add(theme.bold(theme.fg("accent", "Gantt Chart View")));
  add("");

  // Time axis - align with bar start position
  const axisPrefix = " ".repeat(labelWidth + 2); // +2 for status char and space
  const axisLines = renderTimeAxis(config, theme);
  for (const line of axisLines) {
    // Add prefix to align time axis with bar positions
    add(axisPrefix + line);
  }
  // Task rows
  for (const item of items) {
    const label = truncateToWidth(item.name ?? item.id, labelWidth - 1);
    const paddedLabel = label.padEnd(labelWidth);
    const bar = renderGanttBar(item, config, theme);
    const isRunning = item.status === "running";
    const status = isRunning ? theme.fg("accent", "*") : " ";

    const line = `${status}${paddedLabel} ${bar}`;
    add(line);
  }

  add("");
  add(
    theme.fg("dim", "Legend:")
      + ` ${theme.fg("accent", "·")}LLM`
      + ` ${theme.fg("success", "=")}EDIT`
      + ` ${theme.fg("warning", "~")}CMD`
      + ` ${theme.fg("dim", ":")}READ`
      + ` ${theme.fg("dim", ".")}THINK`
      + ` ${theme.fg("dim", " ")}WAIT`,
  );

  // System rows (optional)
  if (showSystemRows) {
    add("");
    add(theme.fg("dim", "--- System ---"));
    add(`KERNEL      ${GANTT_CHARS.WAIT.repeat(barWidth)}`);
    add(`ISR         ${GANTT_CHARS.EMPTY.repeat(barWidth)}`);
  }

  // Footer with current time and controls
  const now = formatClockTime(Date.now());
  add("");
  add(theme.fg("dim", `Current: ${now} | [v] toggle  [q] quit`));

  return lines;
}
