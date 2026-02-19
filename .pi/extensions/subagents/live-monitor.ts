/**
 * @abdd.meta
 * path: .pi/extensions/subagents/live-monitor.ts
 * role: サブエージェント実行のライブ監視UI描画および型定義の再エクスポート
 * why: メインのsubagents.tsから監視ロジックを分離し、保守性を高めるため
 * related: .pi/extensions/subagents.ts, ../../lib/subagent-types.ts, ../../lib/live-view-utils.ts, ../../lib/tui/tui-utils.ts
 * public_api: renderSubagentLiveView
 * invariants: itemsはSubagentLiveItemの配列である、cursorはitemsのインデックス範囲内に収まる
 * side_effects: なし（純粋な描画関数）
 * failure_modes: 不正なcursor値によるインデックスエラー、幅/高さの計算誤差による描画崩れ
 * @abdd.explain
 * overview: サブエージェントの実行状態をリストまたはストリームモードで可視化するTUIコンポーネントを提供する
 * what_it_does:
 *   - サブエージェントの状態（running, completed, failed）を集計し、ステータスバーを表示する
 *   - カーソル位置に基づいたウィンドウ計算を行い、アイテム一覧を描画する
 *   - ライブストリームビューおよびプレビューのフォーマットを行う
 *   - 必要な型定義を再エクスポートする
 * why_it_exists:
 *   - 実行中のサブエージェントの進捗と出力をリアルタイムに確認するため
 *   - コードベースのモジュール分割を行い、責任範囲を明確にするため
 * scope:
 *   in: SubagentLiveItem配列、現在のカーソル位置、表示モード、ビュー設定、テーマ
 *   out: TUI描画用の文字列配列
 */

// File: .pi/extensions/subagents/live-monitor.ts
// Description: Live monitoring UI for subagent execution.
// Why: Separates live monitoring logic from main subagents.ts for maintainability.
// Related: .pi/extensions/subagents.ts

import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

import {
  formatDurationMs,
  formatBytes,
  formatClockTime,
} from "../../lib/format-utils.js";
import {
  appendTail,
  countOccurrences,
  estimateLineCount,
  renderPreviewWithMarkdown,
} from "../../lib/tui/tui-utils.js";
import {
  toTailLines,
  looksLikeMarkdown,
} from "../../lib/live-view-utils.js";
import {
  computeLiveWindow,
} from "../../lib/agent-utils.js";
import {
  getLiveStatusGlyph,
  getLiveStatusColor,
  getActivityIndicator,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
} from "../../lib/live-view-utils.js";

// Import types from lib/subagent-types.ts
import {
  type SubagentLiveItem,
  type SubagentLiveMonitorController,
  type LiveStreamView,
  type LiveViewMode,
} from "../../lib/subagent-types.js";

// Re-export types for convenience
export type { SubagentLiveItem, SubagentLiveMonitorController, LiveStreamView, LiveViewMode };

// ============================================================================
// Constants
// ============================================================================

const LIVE_PREVIEW_LINE_LIMIT = 36;
const LIVE_LIST_WINDOW_SIZE = 20;

// ============================================================================
// Tree View Utilities
// ============================================================================

/**
 * サブエージェントのツリービューを描画
 * @summary ツリービュー描画
 */
function renderSubagentTreeView(
  items: SubagentLiveItem[],
  cursor: number,
  width: number,
  theme: any,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  // シンプルな縦型ツリー（サブエージェントは依存関係がないため）
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isSelected = i === cursor;
    const isLast = i === items.length - 1;

    const glyph = getLiveStatusGlyph(item.status);
    const glyphColor = getLiveStatusColor(item.status);
    const elapsed = formatDurationMs(item);

    const hasOutput = item.stdoutBytes > 0;
    const hasError = item.stderrBytes > 0;
    const isRecent = item.lastChunkAtMs ? (Date.now() - item.lastChunkAtMs) < 2000 : false;
    const activity = getActivityIndicator(hasOutput, hasError, isRecent);

    // ツリープレフィックス
    const treeChar = isLast ? "└── " : "├── ";

    const coloredGlyph = theme.fg(glyphColor, glyph);
    const treeLine = `${treeChar}${coloredGlyph} ${item.name || item.id}`;
    const meta = activity ? `${elapsed}  ${activity}  ${formatBytes(item.stdoutBytes)}` : `${elapsed}  ${formatBytes(item.stdoutBytes)}`;

    // 選択行は全体を強調色で表示（プレフィックスなし）
    if (isSelected) {
      add(theme.fg("accent", theme.bold(`${treeLine} ${meta}`)));
    } else {
      add(`${treeLine} ${theme.fg("dim", meta)}`);
    }
  }

  return lines;
}

/**
 * サブエージェントのタイムラインビューを描画
 * @summary タイムライン描画
 */
function renderSubagentTimelineView(
  items: SubagentLiveItem[],
  width: number,
  theme: any,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  // イベント収集
  interface TimelineEvent {
    time: string;
    agent: string;
    type: "start" | "done" | "fail" | "output";
    content: string;
  }

  const allEvents: TimelineEvent[] = [];

  for (const item of items) {
    // 開始
    if (item.startedAtMs) {
      allEvents.push({
        time: formatClockTime(item.startedAtMs),
        agent: item.name || item.id,
        type: "start",
        content: "START",
      });
    }

    // 完了/失敗
    if (item.finishedAtMs && item.status !== "running") {
      allEvents.push({
        time: formatClockTime(item.finishedAtMs),
        agent: item.name || item.id,
        type: item.status === "failed" ? "fail" : "done",
        content: item.status === "failed" ? `FAIL: ${item.error || "error"}` : `DONE (${formatDurationMs(item)})`,
      });
    }
  }

  // 時間順ソート
  allEvents.sort((a, b) => a.time.localeCompare(b.time));

  // エージェントごとの色
  const agentColors = ["accent", "success", "warning", "info"];
  const agentColorMap = new Map<string, string>();
  items.forEach((item, i) => {
    agentColorMap.set(item.name || item.id, agentColors[i % agentColors.length]);
  });

  // タイムライン描画
  const displayEvents = allEvents.slice(-25);

  for (const ev of displayEvents) {
    const agentColor = agentColorMap.get(ev.agent) || "dim";
    const agentText = theme.fg(agentColor, ev.agent.padEnd(14));

    let icon: string;
    let contentColor = "dim";

    switch (ev.type) {
      case "start":
        icon = "START";
        break;
      case "done":
        icon = "DONE";
        contentColor = "success";
        break;
      case "fail":
        icon = "FAIL";
        contentColor = "error";
        break;
      default:
        icon = ">";
    }

    const iconText = theme.fg(contentColor, icon.padStart(5));
    add(`${ev.time}  ${agentText} ${iconText} ${theme.fg(contentColor, ev.content)}`);
  }

  // 現在の状態
  add("");
  add(theme.fg("dim", "─── CURRENT ───"));
  for (const item of items) {
    const glyph = getLiveStatusGlyph(item.status);
    const glyphColor = getLiveStatusColor(item.status);
    const line = `${theme.fg(glyphColor, glyph)} ${(item.name || item.id).padEnd(14)} ${theme.fg("dim", item.status)} ${formatDurationMs(item)}`;
    add(line);
  }

  return lines;
}

// ============================================================================
// Live View Rendering
// ============================================================================

/**
 * ライブビューを描画
 * @summary ライブビュー描画
 * @param input - 入力データ
 * @param input.title - ビューのタイトル
 * @param input.items - 表示するサブエージェントアイテムの配列
 * @param input.cursor - 現在のカーソル位置
 * @param input.mode - ライブビューの表示モード
 * @param input.stream - ライブストリームビューの設定
 * @param input.width - 幅
 * @param input.height - 高さ
 * @param input.theme - テーマ
 * @returns {string[]} 描画結果の文字列配列
 */
export function renderSubagentLiveView(input: {
  title: string;
  items: SubagentLiveItem[];
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  width: number;
  height?: number;
  theme: any;
}): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, input.width));
  const theme = input.theme;
  const items = input.items;
  const running = items.filter((item) => item.status === "running").length;
  const completed = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;

  // コンパクトなヘッダー
  add(theme.bold(theme.fg("accent", `${input.title} [${input.mode}]`)));
  const runText = running > 0 ? theme.fg("accent", `Run:${running}`) : `Run:${running}`;
  const doneText = completed > 0 ? theme.fg("success", `Done:${completed}`) : `Done:${completed}`;
  const failText = failed > 0 ? theme.fg("error", `Fail:${failed}`) : `Fail:${failed}`;
  add(`${runText}  ${doneText}  ${failText}`);

  if (items.length === 0) {
    add(theme.fg("dim", "[q] quit"));
    add("");
    add(theme.fg("dim", "no running subagents"));
    return finalizeLiveLines(lines, input.height);
  }

  const clampedCursor = Math.max(0, Math.min(items.length - 1, input.cursor));
  const selected = items[clampedCursor];
  const selectedOutLines = estimateLineCount(
    selected.stdoutBytes,
    selected.stdoutNewlineCount,
    selected.stdoutEndsWithNewline,
  );
  const selectedErrLines = estimateLineCount(
    selected.stderrBytes,
    selected.stderrNewlineCount,
    selected.stderrEndsWithNewline,
  );

  if (input.mode === "list") {
    // ツリービューのキーボードヒント
    add(theme.fg("dim", "[j/k] nav  [ret] detail  [t] time  [q] quit"));
    add("");

    // ツリー形式でメンバーを描画
    const treeLines = renderSubagentTreeView(items, clampedCursor, input.width, theme);
    for (const line of treeLines) {
      add(line);
    }

    add("");
    // コンパクトな選択アイテム情報
    const statusColor = selected.status === "failed" ? "error" : selected.status === "completed" ? "success" : "dim";
    add(theme.fg("dim", `${selected.name} | ${theme.fg(statusColor, selected.status)} | ${formatDurationMs(selected)}`));

    const inlineMetadataLines = 3;
    const inlineMinPreviewLines = 3;
    const height = input.height ?? 0;
    const remaining = height > 0 ? height - lines.length : 0;
    const canShowInline = height > 0 && remaining >= inlineMetadataLines + inlineMinPreviewLines;

    if (!canShowInline) {
      add(theme.fg("dim", "[ret] open detail"));
      return finalizeLiveLines(lines, input.height);
    }

    const previewStream: LiveStreamView =
      selected.status === "failed" &&
      input.stream === "stdout" &&
      selected.stdoutBytes === 0 &&
      selected.stderrBytes > 0
        ? "stderr"
        : input.stream;
    const selectedTail = previewStream === "stdout" ? selected.stdoutTail : selected.stderrTail;
    const inlinePreviewLimit = Math.max(
      inlineMinPreviewLines,
      Math.min(
        LIVE_PREVIEW_LINE_LIMIT,
        Math.max(1, height - lines.length - inlineMetadataLines),
      ),
    );
    const inlinePreview = renderPreviewWithMarkdown(selectedTail, input.width, inlinePreviewLimit);
    const summaryText = selected.summary || "-";
    const errorText = selected.error || "-";
    add(theme.fg("dim", `inline detail (${previewStream}) | [tab] switch stream`));
    add(theme.fg("dim", `summary: ${summaryText}`));
    add(theme.fg(selected.error ? "error" : "dim", `error: ${errorText}`));
    add(theme.fg("dim", `render mode: ${inlinePreview.renderedAsMarkdown ? "markdown" : "raw"}`));
    if (inlinePreview.lines.length === 0) {
      add(theme.fg("dim", "(no output yet)"));
    } else {
      for (const line of inlinePreview.lines) {
        add(line);
      }
    }
    return finalizeLiveLines(lines, input.height);
  }

  // Timeline mode
  if (input.mode === "timeline") {
    add(theme.fg("dim", "[b] back  [q] quit"));
    add("");

    const timelineLines = renderSubagentTimelineView(items, input.width, theme);
    for (const line of timelineLines) {
      add(line);
    }

    return finalizeLiveLines(lines, input.height);
  }

  // コンパクトな詳細モード
  add(theme.fg("dim", "[tab] stream  [t] time  [b] back  [q] quit"));
  add("");
  add(theme.bold(theme.fg("accent", `${selected.name}`)));
  const statusColor = selected.status === "failed" ? "error" : selected.status === "completed" ? "success" : "accent";
  add(theme.fg("dim", `status:${theme.fg(statusColor, selected.status)} | elapsed:${formatDurationMs(selected)}`));
  add(theme.fg("dim", `out:${formatBytes(selected.stdoutBytes)}/${selectedOutLines}L | err:${formatBytes(selected.stderrBytes)}/${selectedErrLines}L`));
  if (selected.summary) {
    add(theme.fg("dim", `summary: ${selected.summary}`));
  }
  if (selected.error) {
    add(theme.fg(selected.status === "failed" ? "error" : "dim", `error: ${selected.error}`));
  }
  add("");
  const previewStream: LiveStreamView =
    selected.status === "failed" &&
    input.stream === "stdout" &&
    selected.stdoutBytes === 0 &&
    selected.stderrBytes > 0
      ? "stderr"
      : input.stream;
  const selectedTail = previewStream === "stdout" ? selected.stdoutTail : selected.stderrTail;
  const selectedStreamBytes = previewStream === "stdout" ? selected.stdoutBytes : selected.stderrBytes;
  const selectedStreamLines = previewStream === "stdout" ? selectedOutLines : selectedErrLines;
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.id}] ${previewStream} tail (last ${LIVE_PREVIEW_LINE_LIMIT} lines | total ${formatBytes(
          selectedStreamBytes,
        )}, ${selectedStreamLines} lines)`,
      ),
    ),
  );
  const detailPreviewLimit =
    input.height && input.height > 0
      ? Math.max(1, Math.min(LIVE_PREVIEW_LINE_LIMIT, input.height - lines.length - 1))
      : LIVE_PREVIEW_LINE_LIMIT;
  const preview = renderPreviewWithMarkdown(selectedTail, input.width, detailPreviewLimit);
  add(theme.fg("dim", `render mode: ${preview.renderedAsMarkdown ? "markdown" : "raw"}`));
  const previewLines = preview.lines;
  if (previewLines.length === 0) {
    add(theme.fg("dim", "(no output yet)"));
  } else {
    for (const line of previewLines) {
      add(line);
    }
  }
  return finalizeLiveLines(lines, input.height);
}

// ============================================================================
// Live Monitor Controller
// ============================================================================

/**
 * ライブ監視コントローラ作成
 * @summary 監視コントローラ作成
 * @param ctx - コンテキスト
 * @param input - 入力データ
 * @param input.title - タイトル
 * @param input.items - アイテム配列
 * @returns {SubagentLiveMonitorController | undefined} ライブ監視コントローラ
 */
export function createSubagentLiveMonitor(
  ctx: any,
  input: {
    title: string;
    items: Array<{ id: string; name: string }>;
  },
): SubagentLiveMonitorController | undefined {
  if (!ctx?.hasUI || !ctx?.ui?.custom) {
    return undefined;
  }

  const items: SubagentLiveItem[] = input.items.map((item) => ({
    id: item.id,
    name: item.name,
    status: "pending",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
  }));
  const byId = new Map(items.map((item) => [item.id, item]));
  let cursor = 0;
  let mode: LiveViewMode = "list";
  let stream: LiveStreamView = "stdout";
  let requestRender: (() => void) | undefined;
  let doneUi: (() => void) | undefined;
  let closed = false;
  let renderTimer: NodeJS.Timeout | undefined;

  const clearRenderTimer = () => {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = undefined;
    }
  };

  const queueRender = () => {
    if (closed || !requestRender) return;
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      if (!closed) {
        requestRender?.();
      }
    }, 60);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    clearRenderTimer();
    doneUi?.();
  };

  const uiPromise = ctx.ui
    .custom<void>((tui: any, theme: any, _keybindings: any, done: () => void) => {
      doneUi = done;
      requestRender = () => {
        if (!closed) {
          tui.requestRender();
        }
      };

      return {
        render: (width: number) =>
          renderSubagentLiveView({
            title: input.title,
            items,
            cursor,
            mode,
            stream,
            width,
            height: tui.terminal.rows,
            theme,
          }),
        invalidate: () => {},
        handleInput: (rawInput: string) => {
          if (matchesKey(rawInput, "q")) {
            close();
            return;
          }

          if (matchesKey(rawInput, Key.escape)) {
            if (mode === "detail" || mode === "timeline") {
              mode = "list";
              queueRender();
              return;
            }
            close();
            return;
          }

          if (rawInput === "j" || matchesKey(rawInput, Key.down)) {
            cursor = Math.min(items.length - 1, cursor + 1);
            queueRender();
            return;
          }

          if (rawInput === "k" || matchesKey(rawInput, Key.up)) {
            cursor = Math.max(0, cursor - 1);
            queueRender();
            return;
          }

          if (rawInput === "g") {
            cursor = 0;
            queueRender();
            return;
          }

          if (rawInput === "G") {
            cursor = Math.max(0, items.length - 1);
            queueRender();
            return;
          }

          if (mode === "list" && isEnterInput(rawInput)) {
            mode = "detail";
            queueRender();
            return;
          }

          if ((mode === "list" || mode === "detail") && (rawInput === "t" || rawInput === "T")) {
            mode = "timeline";
            queueRender();
            return;
          }

          if (mode === "timeline" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if (mode === "detail" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if (mode === "timeline" && matchesKey(rawInput, Key.escape)) {
            mode = "list";
            queueRender();
            return;
          }

          if (rawInput === "\t" || rawInput === "tab") {
            stream = stream === "stdout" ? "stderr" : "stdout";
            queueRender();
            return;
          }
        },
      };
    }, {
      overlay: true,
      overlayOptions: () => ({
        width: "100%",
        maxHeight: "100%",
        row: 0,
        col: 0,
        margin: 0,
      }),
    })
    .catch(() => undefined)
    .finally(() => {
      closed = true;
      clearRenderTimer();
    });

  return {
    markStarted: (agentId: string) => {
      const item = byId.get(agentId);
      if (!item || closed) return;
      item.status = "running";
      item.startedAtMs = Date.now();
      queueRender();
    },
    appendChunk: (agentId: string, targetStream: LiveStreamView, chunk: string) => {
      const item = byId.get(agentId);
      if (!item || closed) return;
      if (targetStream === "stdout") {
        item.stdoutTail = appendTail(item.stdoutTail, chunk);
        item.stdoutBytes += Buffer.byteLength(chunk, "utf-8");
        item.stdoutNewlineCount += countOccurrences(chunk, "\n");
        item.stdoutEndsWithNewline = chunk.endsWith("\n");
      } else {
        item.stderrTail = appendTail(item.stderrTail, chunk);
        item.stderrBytes += Buffer.byteLength(chunk, "utf-8");
        item.stderrNewlineCount += countOccurrences(chunk, "\n");
        item.stderrEndsWithNewline = chunk.endsWith("\n");
      }
      item.lastChunkAtMs = Date.now();
      queueRender();
    },
    markFinished: (agentId: string, status: "completed" | "failed", summary: string, error?: string) => {
      const item = byId.get(agentId);
      if (!item || closed) return;
      item.status = status;
      item.summary = summary;
      item.error = error;
      item.finishedAtMs = Date.now();
      queueRender();
    },
    close,
    wait: async () => {
      await uiPromise;
    },
  };
}
