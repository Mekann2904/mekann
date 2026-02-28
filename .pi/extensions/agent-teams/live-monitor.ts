/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/live-monitor.ts
 * role: エージェントチームの実行状態を監視し、TUI（Terminal User Interface）でリアルタイムに可視化するモジュール
 * why: 監視ロジックをメインファイルから分離し、保守性と責任の分離を確保するため
 * related: .pi/extensions/agent-teams.ts, ../../lib/team-types.js, ../../lib/live-view-utils.js, ../../lib/agent-utils.js
 * public_api: TeamLivePhase, TeamLiveItem, TeamLiveViewMode, AgentTeamLiveMonitorController, LiveStreamView, TeamQueueStatus
 * invariants: イベント行のタイムスタンプは正規表現で厳密にパースされる、環境変数による設定値は数値範囲検証が行われる
 * side_effects: 標準出力へのTUI描画、標準エラー出力への環境変数無効時の警告出力、setIntervalによる定期的なUI更新スケジュール設定
 * failure_modes: 無効な環境変数によるデフォルト値へのフォールバック、タイムスタンプパース失敗によるnull返却
 * @abdd.explain
 * overview: エージェントチームのライブ実行データをTUIコンポーネントとして描画・制御する機能を提供する
 * what_it_does:
 *   - チーム実行のフェーズ、アイテム、キュー状態を管理する型定義の再エクスポート
 *   - ライブイベントの表示上限やポーリング間隔を環境変数またはデフォルト値で定数化
 *   - イベントログのタイムスタンプ "[hh:mm:ss]" をパースし、正規化して構造化データへ変換する
 *   - TUI描画に必要なツリービューユーティリティやウィンドウ計算ロジックの提供
 *   - アクティビティインジケーター（スピナー）のアニメーションフレーム定義
 * why_it_exists:
 *   - 複雑なTUI描画ロジックをチームの制御ロジックから分離し、コードの見通しを良くするため
 *   - リアルタイムフィードバックにより、ユーザーがエージェントの動作状況を直感的に把握できるようにするため
 * scope:
 *   in: 環境変数（PI_LIVE_EVENT_TAIL_LIMIT, PI_LIVE_POLL_INTERVAL_MS）、TeamLiveItemなどの状態データ
 *   out: 標準出力へのUI描画データ、コンソールへの警告ログ、スケジュールされたタイマーID
 */

// File: .pi/extensions/agent-teams/live-monitor.ts
// Description: Live monitoring UI for agent team execution.
// Why: Separates live monitoring logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts

import { Key, matchesKey } from "@mariozechner/pi-tui";

import type { Theme } from "../../lib/tui/types.js";
import type { TuiInstance, KeybindingMap, LiveMonitorContext } from "../../lib/tui-types.js";
import {
  formatDurationMs,
  formatBytes,
  formatClockTime,
  formatElapsedClock,
  normalizeForSingleLine,
} from "../../lib/core/format-utils.js";
import {
  appendTail,
  countOccurrences,
  estimateLineCount,
  pushWrappedLine,
  renderPreviewWithMarkdown,
} from "../../lib/tui/tui-utils.js";
import {
  toTailLines,
  looksLikeMarkdown,
  getLiveStatusGlyph,
  getLiveStatusColor,
  getActivityIndicator,
  isEnterInput,
  finalizeLiveLines,
} from "../../lib/agent/live-view-utils.js";
import {
  computeLiveWindow,
} from "../../lib/agent/agent-utils.js";
import {
  renderGanttView,
  type GanttItem,
} from "../../lib/tui/gantt-utils.js";

// Import team types from lib
import {
  type TeamLivePhase,
  type TeamLiveItem,
  type TeamLiveViewMode,
  type AgentTeamLiveMonitorController,
  type LiveStreamView,
  type TeamQueueStatus,
} from "../../lib/agent/team-types.js";
import type { StateTransition } from "../../lib/live-types-base.js";

// Re-export types for convenience
export type { TeamLivePhase, TeamLiveItem, TeamLiveViewMode, AgentTeamLiveMonitorController, LiveStreamView, TeamQueueStatus };

// ============================================================================
// Constants
// ============================================================================

const LIVE_PREVIEW_LINE_LIMIT = 120;
const LIVE_LIST_WINDOW_SIZE = 22;
const LIVE_EVENT_TAIL_LIMIT = (() => {
  const envVal = process.env.PI_LIVE_EVENT_TAIL_LIMIT;
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed < 60) {
      console.warn(
        `[agent-teams/live-monitor] Invalid PI_LIVE_EVENT_TAIL_LIMIT="${envVal}", using default 120`
      );
      return 120;
    }
    return Math.max(60, parsed);
  }
  return 120;
})();
const LIVE_EVENT_INLINE_LINE_LIMIT = 8;
const LIVE_EVENT_DETAIL_LINE_LIMIT = 28;

// ポーリング間隔（ストリーミングがない期間もUIを更新して「動いている」ことを示す）
const LIVE_POLL_INTERVAL_MS = (() => {
  const envVal = process.env.PI_LIVE_POLL_INTERVAL_MS;
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    if (!Number.isFinite(parsed) || parsed < 100) {
      console.warn(
        `[agent-teams/live-monitor] Invalid PI_LIVE_POLL_INTERVAL_MS="${envVal}", using default 500`
      );
      return 500;
    }
    return Math.max(100, Math.min(5000, parsed));
  }
  return 500;
})();

// アクティビティアニメーション用のスピナー文字
const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function classifyActivityFromChunk(chunk: string): NonNullable<StateTransition["activity"]> {
  const text = chunk.toLowerCase();
  if (
    /apply_patch|\*\*\* begin patch|update file:|add file:|delete file:|move to:|diff --git|@@/.test(text)
  ) {
    return "EDIT";
  }
  if (
    /\b(rg|grep|cat|sed|ls|find|open|read|search|inspect|analyze|wc -l)\b/.test(text)
  ) {
    return "READ";
  }
  if (
    /\b(npm|pnpm|yarn|bun|node|python|pytest|vitest|cargo|go test|git|bash|zsh|shell|command|exec)\b/.test(text)
  ) {
    return "COMMAND";
  }
  if (/\[thinking\]|thinking|reasoning|analysis|claim:|evidence:|result:/.test(text)) {
    return "LLM";
  }
  return "OTHER";
}

function pushStateTransition(
  item: TeamLiveItem,
  state: StateTransition["state"],
  activity?: StateTransition["activity"],
): void {
  const now = Date.now();
  const timeline = (item.stateTimeline ??= []);
  const last = timeline[timeline.length - 1];
  const normalizedActivity = activity ?? "OTHER";

  const sameAsLast = Boolean(
    last
      && last.state === state
      && (last.activity ?? "OTHER") === normalizedActivity
      && !last.finishedAtMs,
  );
  if (sameAsLast) return;

  if (last && !last.finishedAtMs) {
    last.finishedAtMs = now;
  }

  timeline.push({
    startedAtMs: now,
    state,
    activity: normalizedActivity,
  });

  if (timeline.length > 256) {
    timeline.splice(0, timeline.length - 256);
  }
}

// ============================================================================
// Tree View Utilities
// ============================================================================

interface TreeNode {
  item: TeamLiveItem;
  level: number;
  children: string[]; // member IDs
}

/**
 * Parse "[hh:mm:ss] ..." style event lines.
 * Accepts h:mm:ss and hh:mm:ss(.SSS) and normalizes to hh:mm:ss.
 */
function parseEventTimeLine(
  eventLine: string,
): { time: string; timeMs: number; rest: string } | null {
  const match = eventLine.match(/^\[(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.+)$/);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3]);
  const msRaw = match[4] ? Number(match[4].padEnd(3, "0")) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss) || !Number.isFinite(msRaw)) {
    return null;
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59 || msRaw < 0 || msRaw > 999) {
    return null;
  }

  const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const timeMs = (((hh * 60) + mm) * 60 + ss) * 1000 + msRaw;
  return { time, timeMs, rest: match[5] };
}

/**
 * アイテムのツリーレベルを計算
 * @summary ツリーレベル計算
 * @param items アイテム配列
 * @returns アイテムID→レベルのマップ
 */
function computeTreeLevels(items: TeamLiveItem[]): Map<string, number> {
  const levels = new Map<string, number>();
  const labelToItem = new Map(items.map(i => [i.label, i]));

  // partnersに基づいてレベルを計算
  // 誰にも依存しない = レベル0
  // AのpartnersにBがある = AはBより下（Bの完了を待つ可能性）

  const visited = new Set<string>();

  function getLevel(item: TeamLiveItem): number {
    if (levels.has(item.label)) {
      return levels.get(item.label)!;
    }

    // 循環参照防止
    if (visited.has(item.label)) {
      return 0;
    }
    visited.add(item.label);

    // partnersが空 = ルート
    if (!item.partners || item.partners.length === 0) {
      levels.set(item.label, 0);
      return 0;
    }

    // partnersの中で最も深いレベル + 1
    let maxPartnerLevel = -1;
    for (const partnerId of item.partners) {
      const partner = labelToItem.get(partnerId);
      if (partner) {
        const partnerLevel = getLevel(partner);
        maxPartnerLevel = Math.max(maxPartnerLevel, partnerLevel);
      }
    }

    const level = maxPartnerLevel >= 0 ? maxPartnerLevel + 1 : 0;
    levels.set(item.label, level);
    return level;
  }

  for (const item of items) {
    visited.clear();
    getLevel(item);
  }

  return levels;
}

/**
 * ツリーラインのプレフィックスを生成
 * @summary ツリープレフィックス生成
 * @param level レベル
 * @param isLast 同じレベルで最後か
 * @param parentContinues 親レベルが継続するか
 * @returns プレフィックス文字列
 */
function getTreePrefix(level: number, isLast: boolean, parentContinues: boolean[]): string {
  if (level === 0) {
    return "*── ";
  }

  const parts: string[] = [];

  // 親レベルの縦線
  for (let i = 0; i < level; i++) {
    if (i === level - 1) {
      // 現在のレベル
      parts.push(isLast ? "└── " : "├── ");
    } else if (parentContinues[i]) {
      parts.push("│   ");
    } else {
      parts.push("    ");
    }
  }

  return parts.join("");
}

/**
 * アクティビティスピナーを取得
 * @summary スピナー取得
 * @param isRunning 実行中かどうか
 * @returns スピナー文字
 */
function getActivitySpinner(isRunning: boolean): string {
  if (!isRunning) return "";
  const now = Date.now();
  const frameIndex = Math.floor(now / 200) % SPINNER_FRAMES.length;
  return SPINNER_FRAMES[frameIndex];
}

/**
 * ツリービューを描画
 * @summary ツリービュー描画
 */
function renderTreeView(
  items: TeamLiveItem[],
  cursor: number,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => pushWrappedLine(lines, line, width);

  // レベル計算
  const levels = computeTreeLevels(items);

  // レベル順にソート（同じレベルは元の順序）
  const sortedItems = [...items].sort((a, b) => {
    const levelA = levels.get(a.label) || 0;
    const levelB = levels.get(b.label) || 0;
    return levelA - levelB;
  });

  // 各レベルにアイテムがあるか追跡
  const levelHasMore = new Map<number, boolean>();
  const itemsByLevel = new Map<number, number>();

  for (const item of sortedItems) {
    const level = levels.get(item.label) || 0;
    itemsByLevel.set(level, (itemsByLevel.get(level) || 0) + 1);
  }

  const drawnByLevel = new Map<number, number>();

  // ツリー描画
  for (let idx = 0; idx < sortedItems.length; idx++) {
    const item = sortedItems[idx];
    const level = levels.get(item.label) || 0;
    const originalIndex = items.findIndex(i => i.label === item.label);
    const isSelected = originalIndex === cursor;
    const isRunning = item.status === "running";

    // このレベルで何番目か
    const drawn = drawnByLevel.get(level) || 0;
    drawnByLevel.set(level, drawn + 1);
    const totalAtLevel = itemsByLevel.get(level) || 1;
    const isLast = drawn >= totalAtLevel - 1;

    // 親レベルが継続するか
    const parentContinues: boolean[] = [];
    for (let l = 0; l < level; l++) {
      const drawnAtL = drawnByLevel.get(l) || 0;
      const totalAtL = itemsByLevel.get(l) || 0;
      parentContinues.push(drawnAtL < totalAtL);
    }

    const prefix = getTreePrefix(level, isLast, parentContinues);
    const glyph = getLiveStatusGlyph(item.status);
    const glyphColor = getLiveStatusColor(item.status);
    const elapsed = formatElapsedClock(item);

    // アクティビティ（スピナー付き）
    const hasOutput = item.stdoutBytes > 0;
    const isRecent = item.lastChunkAtMs ? (Date.now() - item.lastChunkAtMs) < 2000 : false;
    // stderr is often used for warnings/noise; keep err! for actual failures or recent stderr activity.
    const hasError = item.status === "failed" || (item.stderrBytes > 0 && isRecent);
    const activityBase = getActivityIndicator(hasOutput, hasError, isRecent);
    const spinner = getActivitySpinner(isRunning);
    
    // 実行中で出力がない場合は「waiting...」を表示
    let activity: string;
    if (isRunning && !hasOutput && !activityBase) {
      activity = spinner ? `${spinner} waiting...` : "waiting...";
    } else if (spinner && activityBase) {
      activity = `${spinner} ${activityBase}`;
    } else {
      activity = activityBase || (spinner ? spinner : "");
    }

    const coloredGlyph = theme.fg(glyphColor, glyph);
    const treeLine = `${prefix}${coloredGlyph} ${item.label}`;
    const meta = activity
      ? `${elapsed}  ${activity}  ${formatBytes(item.stdoutBytes)}`
      : `${elapsed}  ${formatBytes(item.stdoutBytes)}`;

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
 * 通信イベントを描画（連携可視化を含む）
 * @summary 通信イベント描画
 */
function renderCommunicationEvents(
  items: TeamLiveItem[],
  limit: number,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => pushWrappedLine(lines, line, width);

  // 全アイテムから最近のイベントを収集
  const allEvents: { time: string; from: string; to: string; msg: string }[] = [];

  for (const item of items) {
    // イベント履歴から通信を抽出
    const recentEvents = item.events.slice(-5);
    for (const event of recentEvents) {
      const parsed = parseEventTimeLine(event);
      if (parsed) {
        allEvents.push({
          time: parsed.time,
          from: item.label,
          to: item.partners[0] || "team",
          msg: parsed.rest.substring(0, 40),
        });
      }
    }
  }

  // 最新N件を表示（制限を10に増加）
  const effectiveLimit = Math.max(limit, 10);
  const recent = allEvents.slice(-effectiveLimit);
  if (recent.length > 0) {
    add("");
    add(theme.fg("dim", "COMMUNICATION:"));
    for (const ev of recent) {
      add(theme.fg("dim", `  ${ev.time}  ${ev.from} → ${ev.to}: ${ev.msg}`));
    }
  }

  // 連携可視化: DISCUSSIONセクションからの参照抽出
  const referenceSummary: string[] = [];
  for (const item of items) {
    if (!item.discussionTail || item.discussionTail.length === 0) continue;
    
    // パートナーIDを抽出（partnersは "teamId/memberId" 形式）
    const partnerLabels = item.partners;
    if (partnerLabels.length === 0) continue;
    
    // DISCUSSION内で参照されているパートナーを検出
    const referencedPartners: string[] = [];
    const discussionLower = item.discussionTail.toLowerCase();
    
    for (const partnerLabel of partnerLabels) {
      // パートナーのロール名やIDを検索
      const partnerId = partnerLabel.split("/").pop() || partnerLabel;
      if (discussionLower.includes(partnerId.toLowerCase()) || 
          discussionLower.includes(partnerLabel.toLowerCase())) {
        referencedPartners.push(partnerLabel);
      }
    }
    
    // 「合意」パターンも検出
    const hasAgreement = /合意|agreement|consensus|一致/.test(item.discussionTail);
    const hasDisagreement = /不同意|disagree|矛盾|conflict/.test(item.discussionTail);
    
    if (referencedPartners.length > 0) {
      const status = hasAgreement ? "[合意]" : hasDisagreement ? "[検討中]" : "";
      referenceSummary.push(`${item.label} → ${referencedPartners.join(", ")} ${status}`);
    }
  }
  
  if (referenceSummary.length > 0) {
    add("");
    add(theme.fg("accent", "COLLABORATION STATUS:"));
    for (const ref of referenceSummary) {
      add(theme.fg("success", `  ${ref}`));
    }
  }

  return lines;
}

/**
 * タイムラインビューを描画
 * @summary タイムライン描画
 */
function renderTimelineView(
  items: TeamLiveItem[],
  globalEvents: string[],
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => pushWrappedLine(lines, line, width);

  // 全イベントを収集してソート
  interface TimelineEvent {
    time: string;
    timeMs: number;
    type: "start" | "done" | "fail" | "msg" | "event";
    agent: string;
    target?: string;
    content: string;
  }

  const allEvents: TimelineEvent[] = [];

  // グローバルイベントを追加
  for (const event of globalEvents) {
    const parsed = parseEventTimeLine(event);
    if (parsed) {
      allEvents.push({
        time: parsed.time,
        timeMs: parsed.timeMs,
        type: "event",
        agent: "team",
        content: parsed.rest.substring(0, 50),
      });
    }
  }

  // 各エージェントのイベントを追加
  for (const item of items) {
    // 開始イベント
    if (item.startedAtMs) {
      allEvents.push({
        time: formatClockTime(item.startedAtMs),
        timeMs: item.startedAtMs,
        type: "start",
        agent: item.label,
        content: "START",
      });
    }

    // イベント履歴
    for (const event of item.events) {
      const parsed = parseEventTimeLine(event);
      if (parsed) {
        const content = parsed.rest;
        let type: TimelineEvent["type"] = "msg";
        if (content.includes("DONE") || content.includes("completed")) {
          type = "done";
        } else if (content.includes("FAIL") || content.includes("error")) {
          type = "fail";
        }
        allEvents.push({
          time: parsed.time,
          timeMs: parsed.timeMs,
          type,
          agent: item.label,
          target: item.partners[0],
          content: content.substring(0, 45),
        });
      }
    }

    // 完了イベント
    if (item.finishedAtMs && item.status !== "running") {
      allEvents.push({
        time: formatClockTime(item.finishedAtMs),
        timeMs: item.finishedAtMs,
        type: item.status === "failed" ? "fail" : "done",
        agent: item.label,
        content: item.status === "failed" ? `FAIL: ${item.error || "error"}` : "DONE",
      });
    }
  }

  // 時間順にソート（簡易的）
  allEvents.sort((a, b) => {
    if (a.timeMs && b.timeMs) return a.timeMs - b.timeMs;
    return a.time.localeCompare(b.time);
  });

  // エージェントごとの色
  const agentColors: import("@mariozechner/pi-coding-agent").ThemeColor[] = ["accent", "success", "warning", "accent"];
  const agentColorMap = new Map<string, import("@mariozechner/pi-coding-agent").ThemeColor>();
  items.forEach((item, i) => {
    agentColorMap.set(item.label, agentColors[i % agentColors.length]);
  });

  // アクティブなエージェントを追跡
  const activeAgents = new Set<string>();

  // タイムライン描画
  const displayEvents = allEvents.slice(-30); // 最新30件

  for (const ev of displayEvents) {
    const agentColor = agentColorMap.get(ev.agent) || "dim";
    const agentPrefix = theme.fg(agentColor, ev.agent.padEnd(12));

    // イベントタイプに応じたアイコンと形式
    let icon: string;
    let content: string;
    let contentColor: import("@mariozechner/pi-coding-agent").ThemeColor = "dim";

    switch (ev.type) {
      case "start":
        icon = "START";
        content = ev.content;
        activeAgents.add(ev.agent);
        break;
      case "done":
        icon = "DONE";
        content = ev.content;
        contentColor = "success";
        activeAgents.delete(ev.agent);
        break;
      case "fail":
        icon = "FAIL";
        content = ev.content;
        contentColor = "error";
        activeAgents.delete(ev.agent);
        break;
      case "msg":
        icon = ">";
        content = ev.target ? `→ ${ev.target}: ${ev.content}` : ev.content;
        break;
      default:
        icon = "*";
        content = ev.content;
    }

    const iconText = theme.fg(contentColor === "success" ? "success" : contentColor === "error" ? "error" : "dim", icon.padStart(5));
    add(`${ev.time}  ${agentPrefix} ${iconText} ${theme.fg(contentColor, content)}`);
  }

  // 現在の状態
  add("");
  add(theme.fg("dim", "─── CURRENT STATE ───"));
  for (const item of items) {
    const isActive = activeAgents.has(item.label) || item.status === "running";
    const glyph = getLiveStatusGlyph(item.status);
    const glyphColor = getLiveStatusColor(item.status);
    const status = isActive ? "active" : "idle";
    const line = `${theme.fg(glyphColor, glyph)} ${item.label.padEnd(12)} ${theme.fg("dim", status)} ${formatDurationMs(item)}`;
    add(line);
  }

  return lines;
}

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

/**
 * チームIDとメンバーIDからキー生成
 * @summary キーを生成
 * @param teamId チームID
 * @param memberId メンバーID
 * @returns 生成されたキー文字列
 */
export function toTeamLiveItemKey(teamId: string, memberId: string): string {
  return `${teamId}/${memberId}`;
}

// ============================================================================
// Live View Rendering
// ============================================================================

/**
 * ライブビューを描画
 * @summary ライブビューを描画
 * @param input - 描画用パラメータ
 * @returns {string[]} 描画結果の文字列配列
 */
export function renderAgentTeamLiveView(input: {
  title: string;
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  mode: TeamLiveViewMode;
  stream: LiveStreamView;
  width: number;
  height?: number;
  theme: Theme;
  /** 待機状態情報（オプション） */
  queueStatus?: {
    isWaiting: boolean;
    waitedMs?: number;
    queuePosition?: number;
    queuedAhead?: number;
    estimatedWaitMs?: number;
  };
}): string[] {
  const lines: string[] = [];
  const add = (line = "") => pushWrappedLine(lines, line, input.width);
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
  
  // 待機状態表示
  const queue = input.queueStatus;
  if (queue?.isWaiting) {
    const waitParts: string[] = [];
    if (queue.queuePosition !== undefined) {
      waitParts.push(`pos:${queue.queuePosition}`);
    }
    if (queue.waitedMs !== undefined) {
      waitParts.push(`wait:${formatDurationMs({ startedAtMs: Date.now() - queue.waitedMs })}`);
    }
    if (queue.queuedAhead !== undefined && queue.queuedAhead > 0) {
      waitParts.push(`ahead:${queue.queuedAhead}`);
    }
    if (waitParts.length > 0) {
      add(theme.fg("warning", `QUEUE: ${waitParts.join(" | ")}`));
    }
  }
  
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
    add(theme.fg("dim", "[q] quit"));
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
    // ツリービューのキーボードヒント
    add(theme.fg("dim", "[j/k] nav  [ret] detail  [v] gantt  [d] disc  [t] time  [q] quit"));
    add("");

    // ツリー形式でメンバーを描画
    const treeLines = renderTreeView(items, clampedCursor, input.width, theme);
    for (const line of treeLines) {
      add(line);
    }

    // 通信イベント表示
    const commLines = renderCommunicationEvents(items, 5, input.width, theme);
    for (const line of commLines) {
      add(line);
    }

    add("");
    // 選択アイテム情報
    const statusColor = selected.status === "failed" ? "error" : selected.status === "completed" ? "success" : "dim";
    add(theme.fg("dim", `${selected.label} | ${theme.fg(statusColor, selected.status)} | ${formatLivePhase(selected.phase, selected.phaseRound)} | ${formatDurationMs(selected)}`));

    const inlineMinPreviewLines = 3;
    const height = input.height ?? 0;
    const remaining = height > 0 ? height - lines.length : 0;
    const canShowInline = height > 0 && remaining >= inlineMinPreviewLines + 2;

    if (!canShowInline) {
      add(theme.fg("dim", "[ret] open detail"));
      return finalizeLiveLines(lines, input.height);
    }

    // 簡易プレビュー
    const selectedTail = input.stream === "stdout" ? selected.stdoutTail : selected.stderrTail;
    const inlinePreviewLimit = Math.max(inlineMinPreviewLines, Math.min(LIVE_PREVIEW_LINE_LIMIT, remaining - 2));
    const inlinePreview = renderPreviewWithMarkdown(selectedTail, input.width, inlinePreviewLimit);

    add(theme.fg("dim", `[${input.stream}] [tab] switch`));
    if (inlinePreview.lines.length === 0) {
      add(theme.fg("dim", "(no output)"));
    } else {
      for (const line of inlinePreview.lines) {
        add(line);
      }
    }
    return finalizeLiveLines(lines, input.height);
  }

  if (input.mode === "discussion") {
    // コンパクトなキーボードヒント
    add(theme.fg("dim", "[t] timeline  [b] back  [q] quit"));
    add("");
    add(theme.bold(theme.fg("accent", `DISCUSSION (${clampedCursor + 1}/${items.length})`)));
    const statusColor = selected.status === "failed" ? "error" : selected.status === "completed" ? "success" : "dim";
    add(theme.fg("dim", `${selected.label} | ${theme.fg(statusColor, selected.status)} | ${formatLivePhase(selected.phase, selected.phaseRound)}`));
    add("");

    // Discussion tail display for selected member
    add(theme.bold(theme.fg("accent", `[${selected.label}] DISCUSSION`)));

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
    add(theme.bold(theme.fg("accent", "Team Summary")));
    for (const item of items) {
      const hasDiscussion = (item.discussionTail || "").trim().length > 0;
      const prefix = item === selected ? "> " : "  ";
      const statusMarker = hasDiscussion ? "+" : "-";
      add(
        theme.fg(
          item === selected ? "accent" : "dim",
          `${prefix}[${statusMarker}] ${item.label} (${formatBytes(item.discussionBytes)}/${item.discussionNewlineCount}L)`,
        ),
      );
    }

    return finalizeLiveLines(lines, input.height);
  }

  // Timeline mode
  if (input.mode === "timeline") {
    add(theme.fg("dim", "[d] disc  [v] gantt  [b] back  [q] quit"));
    add("");

    const timelineLines = renderTimelineView(items, input.globalEvents, input.width, theme);
    for (const line of timelineLines) {
      add(line);
    }

    return finalizeLiveLines(lines, input.height);
  }

  // Gantt mode
  if (input.mode === "gantt") {
    add(theme.fg("dim", "[t] time  [b] back  [q] quit"));
    add("");

    // Convert TeamLiveItem to GanttItem
    const ganttItems: GanttItem[] = items.map((item) => ({
      id: item.key,
      name: item.label,
      status: item.status,
      startedAtMs: item.startedAtMs,
      finishedAtMs: item.finishedAtMs,
      lastChunkAtMs: item.lastChunkAtMs,
      stdoutTail: item.stdoutTail,
      stderrTail: item.stderrTail,
      stdoutBytes: item.stdoutBytes,
      stderrBytes: item.stderrBytes,
      stdoutNewlineCount: item.stdoutNewlineCount,
      stderrNewlineCount: item.stderrNewlineCount,
      stdoutEndsWithNewline: item.stdoutEndsWithNewline,
      stderrEndsWithNewline: item.stderrEndsWithNewline,
      stateTimeline: item.stateTimeline,
    }));

    const ganttLines = renderGanttView(ganttItems, input.width, input.height ?? 0, theme);
    for (const line of ganttLines) {
      add(line);
    }

    return finalizeLiveLines(lines, input.height);
  }

  // Detail mode
  add(theme.fg("dim", "[tab] stream  [d] disc  [t] timeline  [b] back  [q] quit"));
  add("");
  add(theme.bold(theme.fg("accent", `${selected.label}`)));
  add(
    theme.fg(
      "dim",
      `status:${selected.status} | elapsed:${formatDurationMs(selected)} | started:${formatClockTime(selected.startedAtMs)} | last:${formatClockTime(selected.lastChunkAtMs)} | finished:${formatClockTime(selected.finishedAtMs)}`,
    ),
  );
  const statusColor = selected.status === "failed" ? "error" : selected.status === "completed" ? "success" : "accent";
  add(theme.fg("dim", `${theme.fg(statusColor, selected.status)} | ${formatLivePhase(selected.phase, selected.phaseRound)} | ${formatDurationMs(selected)}`));
  add(theme.fg("dim", `out:${formatBytes(selected.stdoutBytes)}/${selectedOutLines}L | err:${formatBytes(selected.stderrBytes)}/${selectedErrLines}L`));
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

/**
 * ライブ監視を生成
 * @summary ライブ監視を生成
 * @param ctx - コンテキスト情報
 * @param input - 入力データ（タイトル、アイテムリスト）
 * @returns {AgentTeamLiveMonitorController | undefined} コントローラインスタンス
 */
export function createAgentTeamLiveMonitor(
  ctx: LiveMonitorContext,
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
  let mode: TeamLiveViewMode = "gantt";
  let stream: LiveStreamView = "stdout";
  let requestRender: (() => void) | undefined;
  let doneUi: (() => void) | undefined;
  let closed = false;
  let renderTimer: NodeJS.Timeout | undefined;
  let pollTimer: NodeJS.Timeout | undefined;

  const clearRenderTimer = () => {
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = undefined;
    }
  };

  const clearPollTimer = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  };

  /**
   * 実行中のアイテムがあるかチェック
   */
  const hasRunningItems = (): boolean => {
    return items.some((item) => item.status === "running");
  };

  /**
   * 動的更新が必要な状態かを判定する。
   * - 実行中メンバーがいる
   * - キュー待機中で待機表示を更新したい
   */
  const hasDynamicState = (): boolean => {
    return hasRunningItems() || Boolean(queueStatus?.isWaiting);
  };

  /**
   * 定期ポーリングを開始（ストリーミングがない期間もUIを更新）
   */
  const startPolling = () => {
    if (pollTimer || closed) return;
    pollTimer = setInterval(() => {
      if (closed) {
        clearPollTimer();
        return;
      }
      // 動的状態（実行中 / 待機中）の場合のみ更新
      if (hasDynamicState()) {
        queueRender();
      } else {
        // 動的状態がなくなったらポーリング停止
        clearPollTimer();
      }
    }, LIVE_POLL_INTERVAL_MS);
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
    clearPollTimer();
    doneUi?.();
  };

  const uiPromise = ctx.ui
    .custom((tui: TuiInstance, theme: Theme, _keybindings: KeybindingMap, done: () => void) => {
      doneUi = done;
      requestRender = () => {
        if (!closed) {
          tui.requestRender();
        }
      };

      // 初期レンダリングとポーリング開始を即座に行う
      // UIセットアップ完了後、メンバー実行開始を待たずにポーリングを開始
      // これにより経過時間の秒数更新や状態表示が遅延なく行われる
      setTimeout(() => {
        if (!closed) {
          queueRender();
          startPolling();
        }
      }, 0);

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
            queueStatus,
          }),
        invalidate: () => {},
        handleInput: (rawInput: string) => {
          if (matchesKey(rawInput, "q")) {
            close();
            return;
          }

          if (matchesKey(rawInput, Key.escape)) {
            if (mode === "detail" || mode === "discussion" || mode === "timeline") {
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

          if ((mode === "list" || mode === "detail" || mode === "discussion") && (rawInput === "t" || rawInput === "T")) {
            mode = "timeline";
            queueRender();
            return;
          }

          if ((mode === "list" || mode === "detail" || mode === "discussion" || mode === "timeline") && (rawInput === "v" || rawInput === "V")) {
            mode = "gantt";
            queueRender();
            return;
          }

          if (mode === "timeline" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if (mode === "timeline" && (rawInput === "d" || rawInput === "D")) {
            mode = "discussion";
            queueRender();
            return;
          }

          if (mode === "timeline" && matchesKey(rawInput, Key.escape)) {
            mode = "list";
            queueRender();
            return;
          }

          if (mode === "gantt" && (rawInput === "b" || rawInput === "B")) {
            mode = "list";
            queueRender();
            return;
          }

          if (mode === "gantt" && (rawInput === "t" || rawInput === "T")) {
            mode = "timeline";
            queueRender();
            return;
          }

          if (mode === "gantt" && matchesKey(rawInput, Key.escape)) {
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
      clearPollTimer();
    });

  // 待機状態（内部変数）
  let queueStatus: {
    isWaiting: boolean;
    waitedMs?: number;
    queuePosition?: number;
    queuedAhead?: number;
  } | undefined;

  return {
    markStarted: (itemKey: string) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.status = "running";
      // 再実行時に古い完了状態が残ると経過時間が停止して見えるため初期化する
      item.finishedAtMs = undefined;
      item.summary = undefined;
      item.error = undefined;
      if (item.phase === "queued") {
        item.phase = "initial";
      }
      item.startedAtMs = Date.now();
      pushStateTransition(item, "RUN", "OTHER");
      pushLiveEvent(item, "member process started");
      // 実行中アイテムが増えたのでポーリング開始
      startPolling();
      queueRender();
    },
    markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => {
      const item = byKey.get(itemKey);
      if (!item || closed) return;
      item.phase = phase;
      item.phaseRound = round;
      if (phase === "queued") {
        // 次フェーズ待機時は再開待ち状態として表示をリセットする
        item.status = "pending";
        item.startedAtMs = undefined;
        item.finishedAtMs = undefined;
        item.summary = undefined;
        item.error = undefined;
        pushStateTransition(item, "WAIT", "OTHER");
      } else if (phase === "communication") {
        pushStateTransition(item, "RUN", "LLM");
      } else if (phase === "judge") {
        pushStateTransition(item, "RUN", "THINK");
      } else if (phase === "initial") {
        pushStateTransition(item, "RUN", "OTHER");
      }
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
      pushStateTransition(item, "RUN", classifyActivityFromChunk(chunk));
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
      if (item.stateTimeline && item.stateTimeline.length > 0) {
        const last = item.stateTimeline[item.stateTimeline.length - 1];
        if (!last.finishedAtMs) {
          last.finishedAtMs = item.finishedAtMs;
        }
      }
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
    /** 待機状態を更新 */
    updateQueueStatus: (status: {
      isWaiting: boolean;
      waitedMs?: number;
      queuePosition?: number;
      queuedAhead?: number;
    }) => {
      if (closed) return;
      queueStatus = status;
      if (status.isWaiting) {
        startPolling();
      } else if (!hasRunningItems()) {
        clearPollTimer();
      }
      queueRender();
    },
    close,
    wait: async () => {
      await uiPromise;
    },
  };
}
