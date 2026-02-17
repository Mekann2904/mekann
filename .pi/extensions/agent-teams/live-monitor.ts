// File: .pi/extensions/agent-teams/live-monitor.ts
// Description: Live monitoring UI for agent team execution.
// Why: Separates live monitoring logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts

import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

import {
  formatDurationMs,
  formatBytes,
  formatClockTime,
  normalizeForSingleLine,
} from "../../lib/format-utils.js";
import {
  appendTail,
  countOccurrences,
  estimateLineCount,
  renderPreviewWithMarkdown,
} from "../../lib/tui-utils.js";
import {
  toTailLines,
  looksLikeMarkdown,
  getLiveStatusGlyph,
  isEnterInput,
  finalizeLiveLines,
} from "../../lib/live-view-utils.js";
import {
  computeLiveWindow,
} from "../../lib/agent-utils.js";

// Import team types from lib
import {
  type TeamLivePhase,
  type TeamLiveItem,
  type TeamLiveViewMode,
  type AgentTeamLiveMonitorController,
  type LiveStreamView,
} from "../../lib/team-types.js";

// Re-export types for convenience
export type { TeamLivePhase, TeamLiveItem, TeamLiveViewMode, AgentTeamLiveMonitorController, LiveStreamView };

// ============================================================================
// Constants
// ============================================================================

const LIVE_PREVIEW_LINE_LIMIT = 120;
const LIVE_LIST_WINDOW_SIZE = 22;
const LIVE_EVENT_TAIL_LIMIT = Math.max(60, Number(process.env.PI_LIVE_EVENT_TAIL_LIMIT) || 120);
const LIVE_EVENT_INLINE_LINE_LIMIT = 8;
const LIVE_EVENT_DETAIL_LINE_LIMIT = 28;

// ============================================================================
// Utilities
// ============================================================================

function formatLivePhase(phase: TeamLivePhase, round?: number): string {
  if (phase === "communication") return round ? `comm#${round}` : "comm";
  if (phase === "initial") return "initial";
  if (phase === "judge") return "judge";
  if (phase === "finished") return "done";
  return "queued";
}

function pushLiveEvent(item: TeamLiveItem, rawEvent: string): void {
  const event = normalizeForSingleLine(rawEvent, 220);
  if (!event || event === "-") return;
  const now = Date.now();
  const line = `[${formatClockTime(now)}] ${event}`;
  item.events.push(line);
  if (item.events.length > LIVE_EVENT_TAIL_LIMIT) {
    item.events.splice(0, item.events.length - LIVE_EVENT_TAIL_LIMIT);
  }
  item.lastEvent = event;
  item.lastEventAtMs = now;
}

function toEventTailLines(events: string[], limit: number): string[] {
  if (events.length <= limit) return [...events];
  return events.slice(events.length - limit);
}

export function toTeamLiveItemKey(teamId: string, memberId: string): string {
  return `${teamId}/${memberId}`;
}

// ============================================================================
// Live View Rendering
// ============================================================================

export function renderAgentTeamLiveView(input: {
  title: string;
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  mode: TeamLiveViewMode;
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

  add(theme.bold(theme.fg("accent", `${input.title} [${input.mode}]`)));
  add(theme.fg("dim", `running ${running}/${items.length} | completed ${completed} | failed ${failed} | updated ${formatClockTime(Date.now())}`));
  const globalEventLimit = input.mode === "detail" ? 8 : 4;
  const recentGlobalEvents = toEventTailLines(input.globalEvents, globalEventLimit);
  if (recentGlobalEvents.length > 0) {
    add(theme.fg("dim", `team events (${input.globalEvents.length})`));
    for (const eventLine of recentGlobalEvents) {
      add(theme.fg("dim", `  ${eventLine}`));
    }
    add("");
  }

  if (items.length === 0) {
    add(theme.fg("dim", "[q] close"));
    add("");
    add(theme.fg("dim", "no running team members"));
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
    add(theme.fg("dim", "[j/k] move  [up/down] move  [g/G] jump  [enter] detail  [d] discussion  [tab] stream  [q] close"));
    add("");
    const range = computeLiveWindow(clampedCursor, items.length, LIVE_LIST_WINDOW_SIZE);
    if (range.start > 0) {
      add(theme.fg("dim", `... ${range.start} above ...`));
    }

    for (let index = range.start; index < range.end; index += 1) {
      const item = items[index];
      const isSelected = index === clampedCursor;
      const prefix = isSelected ? ">" : " ";
      const glyph = getLiveStatusGlyph(item.status);
      const statusText = item.status.padEnd(9, " ");
      const base = `${prefix} [${glyph}] ${item.label}`;
      const outLines = estimateLineCount(item.stdoutBytes, item.stdoutNewlineCount, item.stdoutEndsWithNewline);
      const errLines = estimateLineCount(item.stderrBytes, item.stderrNewlineCount, item.stderrEndsWithNewline);
      const partnerPreview =
        item.partners.length > 0
          ? item.partners
              .map((partner) => partner.split("/").pop() || partner)
              .slice(0, 2)
              .join(",")
          : "-";
      const partnerOverflow = item.partners.length > 2 ? `+${item.partners.length - 2}` : "";
      const phaseText = formatLivePhase(item.phase, item.phaseRound);
      const eventText = normalizeForSingleLine(item.lastEvent || "-", 42);
      const meta = `${statusText} ${formatDurationMs(item)} phase:${phaseText} out:${formatBytes(item.stdoutBytes)}/${outLines}l err:${formatBytes(item.stderrBytes)}/${errLines}l link:${partnerPreview}${partnerOverflow} evt:${eventText}`;
      add(`${isSelected ? theme.fg("accent", base) : base} ${theme.fg("dim", meta)}`);
    }

    if (range.end < items.length) {
      add(theme.fg("dim", `... ${items.length - range.end} below ...`));
    }

    add("");
    add(
      theme.fg(
        "dim",
        `selected ${clampedCursor + 1}/${items.length}: ${selected.label} | status:${selected.status} | phase:${formatLivePhase(selected.phase, selected.phaseRound)} | elapsed:${formatDurationMs(selected)} | last_event:${formatClockTime(selected.lastEventAtMs)}`,
      ),
    );

    const inlineMetadataLines = 8;
    const inlineMinEventLines = 2;
    const inlineMinPreviewLines = 3;
    const height = input.height ?? 0;
    const remaining = height > 0 ? height - lines.length : 0;
    const canShowInline =
      height > 0 && remaining >= inlineMetadataLines + inlineMinEventLines + inlineMinPreviewLines;

    if (!canShowInline) {
      add(theme.fg("dim", "press [enter] to open detailed output view"));
      return finalizeLiveLines(lines, input.height);
    }

    const selectedTail = input.stream === "stdout" ? selected.stdoutTail : selected.stderrTail;
    const availableAfterMetadata = Math.max(1, height - lines.length - inlineMetadataLines);
    let inlineEventLimit = Math.max(
      inlineMinEventLines,
      Math.min(LIVE_EVENT_INLINE_LINE_LIMIT, Math.floor(availableAfterMetadata / 3)),
    );
    let inlinePreviewLimit = availableAfterMetadata - inlineEventLimit;
    if (inlinePreviewLimit < inlineMinPreviewLines) {
      const needed = inlineMinPreviewLines - inlinePreviewLimit;
      inlineEventLimit = Math.max(inlineMinEventLines, inlineEventLimit - needed);
      inlinePreviewLimit = availableAfterMetadata - inlineEventLimit;
    }
    inlinePreviewLimit = Math.max(
      inlineMinPreviewLines,
      Math.min(LIVE_PREVIEW_LINE_LIMIT, inlinePreviewLimit),
    );
    const inlinePreview = renderPreviewWithMarkdown(selectedTail, input.width, inlinePreviewLimit);
    const inlineEventLines = toEventTailLines(selected.events, inlineEventLimit);
    const summaryText = selected.summary || "-";
    const errorText = selected.error || "-";
    const linksText = selected.partners.length > 0 ? selected.partners.join(", ") : "-";
    add(theme.fg("dim", `inline detail (${input.stream}) | [tab] switch stream`));
    add(
      theme.fg(
        "dim",
        `phase: ${formatLivePhase(selected.phase, selected.phaseRound)} | last_event: ${formatClockTime(selected.lastEventAtMs)}`,
      ),
    );
    add(theme.fg("dim", `links: ${linksText}`));
    add(theme.fg("dim", `summary: ${summaryText}`));
    add(theme.fg(selected.error ? "error" : "dim", `error: ${errorText}`));
    add(theme.fg("dim", `render mode: ${inlinePreview.renderedAsMarkdown ? "markdown" : "raw"}`));
    add(theme.fg("dim", `trace tail (${inlineEventLines.length}/${selected.events.length})`));
    if (inlineEventLines.length === 0) {
      add(theme.fg("dim", "(no events yet)"));
    } else {
      for (const eventLine of inlineEventLines) {
        add(theme.fg("dim", eventLine));
      }
    }
    add(theme.fg("dim", `output tail (${input.stream})`));
    if (inlinePreview.lines.length === 0) {
      add(theme.fg("dim", "(no output yet)"));
    } else {
      for (const line of inlinePreview.lines) {
        add(line);
      }
    }
    return finalizeLiveLines(lines, input.height);
  }

  if (input.mode === "discussion") {
    add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [b|esc] back  [q] close"));
    add("");
    add(theme.bold(theme.fg("accent", `DISCUSSION VIEW (${clampedCursor + 1}/${items.length})`)));
    add(
      theme.fg(
        "dim",
        `status:${selected.status} | phase:${formatLivePhase(selected.phase, selected.phaseRound)} | elapsed:${formatDurationMs(selected)}`,
      ),
    );
    add("");

    // Discussion tail display for selected member
    add(
      theme.bold(
        theme.fg(
          "accent",
          `[${selected.label}] DISCUSSION section`,
        ),
      ),
    );

    const discussionLines = toTailLines(selected.discussionTail || "", LIVE_PREVIEW_LINE_LIMIT);
    if (discussionLines.length === 0) {
      add(theme.fg("dim", "(no discussion content yet)"));
    } else {
      for (const line of discussionLines) {
        add(line);
      }
    }
    add("");

    // Show discussion summary for all members
    add(theme.bold(theme.fg("accent", "Team Discussion Summary")));
    for (const item of items) {
      const hasDiscussion = (item.discussionTail || "").trim().length > 0;
      const prefix = item === selected ? "> " : "  ";
      const statusMarker = hasDiscussion ? "+" : "-";
      add(
        theme.fg(
          item === selected ? "accent" : "dim",
          `${prefix}[${statusMarker}] ${item.label} (${formatBytes(item.discussionBytes)}B, ${item.discussionNewlineCount} lines)`,
        ),
      );
    }

    return finalizeLiveLines(lines, input.height);
  }

  // Detail mode
  add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [tab] stdout/stderr  [d] discussion  [b|esc] back  [q] close"));
  add("");
  add(theme.bold(theme.fg("accent", `selected ${clampedCursor + 1}/${items.length}: ${selected.label}`)));
  add(
    theme.fg(
      "dim",
      `status:${selected.status} | elapsed:${formatDurationMs(selected)} | started:${formatClockTime(selected.startedAtMs)} | last:${formatClockTime(selected.lastChunkAtMs)} | finished:${formatClockTime(selected.finishedAtMs)}`,
    ),
  );
  add(
    theme.fg(
      "dim",
      `phase:${formatLivePhase(selected.phase, selected.phaseRound)} | last_event:${formatClockTime(selected.lastEventAtMs)} | last_message:${normalizeForSingleLine(selected.lastEvent || "-", 72)}`,
    ),
  );
  add(theme.fg("dim", `stdout ${formatBytes(selected.stdoutBytes)} (${selectedOutLines} lines)`));
  add(theme.fg("dim", `stderr ${formatBytes(selected.stderrBytes)} (${selectedErrLines} lines)`));
  add(theme.fg("dim", `links: ${selected.partners.length > 0 ? selected.partners.join(", ") : "-"}`));
  if (selected.summary) {
    add(theme.fg("dim", `summary: ${selected.summary}`));
  }
  if (selected.error) {
    add(theme.fg(selected.status === "failed" ? "error" : "dim", `error: ${selected.error}`));
  }
  add("");
  const detailHeight = input.height && input.height > 0 ? input.height : undefined;
  let detailEventLimit = Math.min(LIVE_EVENT_DETAIL_LINE_LIMIT, Math.max(1, selected.events.length));
  if (detailHeight) {
    const reservedForOutputSection = 11;
    const availableForEvents = Math.max(1, detailHeight - lines.length - reservedForOutputSection);
    detailEventLimit = Math.max(1, Math.min(detailEventLimit, availableForEvents));
  }
  const detailEventLines = toEventTailLines(selected.events, detailEventLimit);
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.label}] execution trace (last ${detailEventLines.length} entries | total ${selected.events.length})`,
      ),
    ),
  );
  if (detailEventLines.length === 0) {
    add(theme.fg("dim", "(no events yet)"));
  } else {
    for (const eventLine of detailEventLines) {
      add(theme.fg("dim", eventLine));
    }
    if (selected.events.length > detailEventLines.length) {
      add(theme.fg("dim", `... ${selected.events.length - detailEventLines.length} older events ...`));
    }
  }
  add("");
  const selectedTail = input.stream === "stdout" ? selected.stdoutTail : selected.stderrTail;
  const selectedStreamBytes = input.stream === "stdout" ? selected.stdoutBytes : selected.stderrBytes;
  const selectedStreamLines = input.stream === "stdout" ? selectedOutLines : selectedErrLines;
  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${selected.label}] ${input.stream} tail (last ${LIVE_PREVIEW_LINE_LIMIT} lines | total ${formatBytes(
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

export function createAgentTeamLiveMonitor(
  ctx: any,
  input: {
    title: string;
    items: Array<{ key: string; label: string; partners?: string[] }>;
  },
): AgentTeamLiveMonitorController | undefined {
  if (!ctx?.hasUI || !ctx?.ui?.custom) {
    return undefined;
  }

  const items: TeamLiveItem[] = input.items.map((item) => ({
    key: item.key,
    label: item.label,
    partners: item.partners ?? [],
    status: "pending",
    phase: "queued",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
    events: [],
    discussionTail: "",
    discussionBytes: 0,
    discussionNewlineCount: 0,
    discussionEndsWithNewline: false,
  }));
  const byKey = new Map(items.map((item) => [item.key, item]));
  const globalEvents: string[] = [];
  let cursor = 0;
  let mode: TeamLiveViewMode = "list";
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
          renderAgentTeamLiveView({
            title: input.title,
            items,
            globalEvents,
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
            if (mode === "detail" || mode === "discussion") {
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

          if ((mode === "detail" || mode === "discussion") && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if ((mode === "list" || mode === "detail") && (rawInput === "d" || rawInput === "D")) {
            mode = "discussion";
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
    markStarted: (itemKey: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.status = "running";
      if (item.phase === "queued") {
        item.phase = "initial";
      }
      item.startedAtMs = Date.now();
      pushLiveEvent(item, "member process started");
      queueRender();
    },
    markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.phase = phase;
      item.phaseRound = round;
      pushLiveEvent(item, `phase=${formatLivePhase(phase, round)}`);
      queueRender();
    },
    appendEvent: (itemKey: string, event: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      pushLiveEvent(item, event);
      queueRender();
    },
    appendBroadcastEvent: (event: string) => {
      if (closed) return;
      const now = Date.now();
      globalEvents.push(`[${formatClockTime(now)}] ${normalizeForSingleLine(event, 220)}`);
      if (globalEvents.length > LIVE_EVENT_TAIL_LIMIT) {
        globalEvents.splice(0, globalEvents.length - LIVE_EVENT_TAIL_LIMIT);
      }
      for (const item of items) {
        pushLiveEvent(item, event);
      }
      queueRender();
    },
    appendChunk: (itemKey: string, targetStream: LiveStreamView, chunk: string) => {
      const item = byKey.get(itemKey);
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
    markFinished: (itemKey: string, status: "completed" | "failed", summary: string, error?: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.status = status;
      item.phase = "finished";
      item.summary = summary;
      item.error = error;
      item.finishedAtMs = Date.now();
      pushLiveEvent(item, `member ${status}: ${summary}${error ? ` | error=${normalizeForSingleLine(error, 120)}` : ""}`);
      queueRender();
    },
    appendDiscussion: (itemKey: string, discussion: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.discussionTail = appendTail(item.discussionTail, discussion);
      item.discussionBytes += Buffer.byteLength(discussion, "utf-8");
      item.discussionNewlineCount += countOccurrences(discussion, "\n");
      item.discussionEndsWithNewline = discussion.endsWith("\n");
      queueRender();
    },
    close,
    wait: async () => {
      await uiPromise;
    },
  };
}
