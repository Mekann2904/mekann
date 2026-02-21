/**
 * @abdd.meta
 * path: .pi/extensions/context-usage-dashboard.ts
 * role: コンテクスト使用量の可視化と分析を行う拡張機能
 * why: ツールごとの占有傾向と空き容量を把握し、拡張機能の取捨選択を支援するため
 * related: .pi/extensions/usage-tracker.ts, docs/extensions.md, README.md
 * public_api: なし (ExtensionAPI経由での実行のみ)
 * invariants: 週集計は過去7日間のデータに基づく, トークン数は整数値で扱う
 * side_effects: ファイルシステムからの読み取り (セッションディレクトリ)
 * failure_modes: セッションファイルの読み取りエラー, JSONパースエラー, 不正なトークン値の検出
 * @abdd.explain
 * overview: 現在のコンテクスト使用量と過去7日間の使用統計を集計し、ダッシュボード形式で出力する機能
 * what_it_does:
 *   - セッションディレクトリをスキャンし、直近7日間の使用トークン数とコストを集計する
 *   - 現在のスナップショットからツールごとの呼び出し回数とトークン使用量を計算する
 *   - モデル別、ツール別の統計情報を生成し、トップN項目を抽出する
 *   - 文字列や配列からのトークン数推定を行う補助計算を実行する
 * why_it_exists:
 *   - コンテクスト容量の制限下で、どのツールがリソースを消費しているかを明確にする
 *   - 過去の傾向を分析し、効率的な拡張機能の構成を判断する材料を提供する
 *   - コスト管理とパフォーマンスの最適化を支援する
 * scope:
 *   in: ExtensionAPI (コールバックトリガー), ファイルシステム (.pi/agent/sessions)
 *   out: なし (標準出力へ描画するのみ、状態は保持しない)
 */

// .pi/extensions/context-usage-dashboard.ts
// 現在のコンテクスト使用量と直近7日間の使用量・内訳を表示する拡張機能。
// ツールごとの占有傾向と空き容量を可視化し、拡張機能の取捨選択を助けるために存在する。
// Related: .pi/extensions/usage-tracker.ts, docs/extensions.md, README.md

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type {
  BranchSummaryEntry,
  CompactionEntry,
  ContextUsage,
  CustomMessageEntry,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";


import { toFiniteNumberWithDefault } from "../lib/validation-utils.js";

const SESSIONS_ROOT = join(homedir(), ".pi/agent/sessions");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_ROWS = 8;

// Type definitions for loosely-typed session data
interface SessionUsage {
  totalTokens?: number;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
}

interface SessionMessage {
  role?: string;
  content?: string | ContentBlock[];
  command?: string;
  output?: string;
  summary?: string;
  provider?: string;
  model?: string;
  usage?: SessionUsage;
}

interface SessionEntry {
  type?: string;
  message?: SessionMessage;
  timestamp?: string | number;
}

interface CurrentSnapshot {
  usage: ContextUsage | undefined;
  freeTokens: number | null;
  referenceTotalTokens: number;
  categoryTokens: {
    user: number;
    assistant: number;
    tools: number;
    other: number;
  };
  toolTokens: Map<string, number>;
  toolCalls: Map<string, number>;
}

interface ToolStats {
  calls: number;
  contextTokens: number;
  usageTokens: number;
}

interface WeeklySnapshot {
  startMs: number;
  endMs: number;
  files: number;
  totalUsageTokens: number;
  usageBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  totalCost: number;
  models: Map<string, number>;
  tools: Map<string, ToolStats>;
}

interface DashboardSnapshot {
  scopeLabel: string;
  current: CurrentSnapshot;
  week: WeeklySnapshot;
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  if (!Number.isFinite(value) || value === 0) return;
  map.set(key, (map.get(key) || 0) + value);
}

function getOrCreateToolStats(map: Map<string, ToolStats>, toolName: string): ToolStats {
  let stats = map.get(toolName);
  if (!stats) {
    stats = { calls: 0, contextTokens: 0, usageTokens: 0 };
    map.set(toolName, stats);
  }
  return stats;
}

function toTotalUsageTokens(usage: SessionUsage | undefined): number {
  if (!usage) return 0;
  const nativeTotal = toFiniteNumberWithDefault(usage.totalTokens);
  if (nativeTotal > 0) return nativeTotal;
  return (
    toFiniteNumberWithDefault(usage.input) +
    toFiniteNumberWithDefault(usage.output) +
    toFiniteNumberWithDefault(usage.cacheRead) +
    toFiniteNumberWithDefault(usage.cacheWrite)
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value ?? "");
  }
}

function estimateUnknownTokens(value: unknown): number {
  if (typeof value === "string") {
    return Math.ceil(value.length / 4);
  }
  if (Array.isArray(value)) {
    let chars = 0;
    for (const block of value) {
      if (block && typeof block === "object" && "type" in block) {
        const typedBlock = block as ContentBlock;
        if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
          chars += typedBlock.text.length;
          continue;
        }
        if (typedBlock.type === "image") {
          chars += 4800;
          continue;
        }
      }
      chars += safeStringify(block).length;
    }
    return Math.ceil(chars / 4);
  }
  if (value == null) return 0;
  return Math.ceil(safeStringify(value).length / 4);
}

function estimateMessageTokens(message: SessionMessage | undefined): number {
  if (!message || typeof message !== "object") return 0;

  const role = message.role;
  if (role === "user") {
    return estimateUnknownTokens(message.content);
  }
  if (role === "assistant") {
    const content = Array.isArray(message.content) ? message.content : [];
    let chars = 0;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        chars += block.text.length;
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        chars += block.thinking.length;
      } else if (block.type === "toolCall") {
        chars += String(block.name || "").length;
        chars += safeStringify(block.arguments).length;
      } else {
        chars += safeStringify(block).length;
      }
    }
    return Math.ceil(chars / 4);
  }
  if (role === "toolResult" || role === "custom") {
    return estimateUnknownTokens(message.content);
  }
  if (role === "bashExecution") {
    const commandChars = String(message.command || "").length;
    const outputChars = String(message.output || "").length;
    return Math.ceil((commandChars + outputChars) / 4);
  }
  if (role === "branchSummary" || role === "compactionSummary") {
    return Math.ceil(String(message.summary || "").length / 4);
  }
  return 0;
}

function extractToolCalls(message: SessionMessage | undefined): string[] {
  if (!message || !Array.isArray(message.content)) return [];
  const names: string[] = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    if (block.type !== "toolCall") continue;
    const name = String(block.name || "").trim();
    if (name) names.push(name);
  }
  return names;
}

function parseTimestampMs(entry: SessionEntry | undefined): number | undefined {
  const direct = entry?.timestamp;
  if (typeof direct === "string") {
    const parsed = Date.parse(direct);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct > 1_000_000_000_000 ? direct : direct * 1000;
  }

  const nested = entry?.message?.timestamp;
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested > 1_000_000_000_000 ? nested : nested * 1000;
  }
  if (typeof nested === "string") {
    const parsed = Date.parse(nested);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function getScopeDirFromSession(ctx: ExtensionAPI["context"]): string | undefined {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) return undefined;
  try {
    return dirname(sessionFile);
  } catch {
    return undefined;
  }
}

function listSessionFiles(scopeDir: string | undefined): string[] {
  const files: string[] = [];

  const collectFromDir = (targetDir: string) => {
    if (!existsSync(targetDir)) return;
    let names: string[] = [];
    try {
      names = readdirSync(targetDir);
    } catch {
      return;
    }

    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      files.push(join(targetDir, name));
    }
  };

  if (scopeDir) {
    collectFromDir(scopeDir);
    return files;
  }

  if (!existsSync(SESSIONS_ROOT)) return files;
  let dirs: string[] = [];
  try {
    dirs = readdirSync(SESSIONS_ROOT);
  } catch {
    return files;
  }
  for (const dirName of dirs) {
    collectFromDir(join(SESSIONS_ROOT, dirName));
  }
  return files;
}

function collectCurrentSnapshot(ctx: ExtensionAPI["context"]): CurrentSnapshot {
  const usage = ctx.getContextUsage();
  const branchEntries = ctx.sessionManager.getBranch();

  let userTokens = 0;
  let assistantTokens = 0;
  let toolTokensRaw = 0;
  let otherTokens = 0;

  const toolTokensMapRaw = new Map<string, number>();
  const toolCallsMap = new Map<string, number>();

  for (const entry of branchEntries) {
    if (entry.type === "message") {
      const message = entry.message as SessionMessage;
      const estimated = estimateMessageTokens(message);

      if (message?.role === "user" || message?.role === "bashExecution") {
        userTokens += estimated;
      } else if (message?.role === "assistant") {
        assistantTokens += estimated;
        for (const toolName of extractToolCalls(message)) {
          addToMap(toolCallsMap, toolName, 1);
        }
      } else if (message?.role === "toolResult") {
        toolTokensRaw += estimated;
        const toolName = String(message.toolName || "unknown");
        addToMap(toolTokensMapRaw, toolName, estimated);
      } else {
        otherTokens += estimated;
      }
      continue;
    }

    if (entry.type === "custom_message") {
      otherTokens += estimateUnknownTokens((entry as CustomMessageEntry).content);
      continue;
    }
    if (entry.type === "compaction") {
      otherTokens += estimateUnknownTokens((entry as CompactionEntry).summary);
      continue;
    }
    if (entry.type === "branch_summary") {
      otherTokens += estimateUnknownTokens((entry as BranchSummaryEntry).summary);
      continue;
    }
  }

  const estimatedTotal = userTokens + assistantTokens + toolTokensRaw + otherTokens;
  const referenceTotal = usage?.tokens && usage.tokens > 0 ? usage.tokens : estimatedTotal;
  const scale = estimatedTotal > 0 ? referenceTotal / estimatedTotal : 1;

  const toolTokens = new Map<string, number>();
  for (const [toolName, tokens] of toolTokensMapRaw.entries()) {
    toolTokens.set(toolName, tokens * scale);
  }

  const usageTokens = usage?.tokens ?? 0;
  return {
    usage,
    freeTokens: usage ? Math.max(usage.contextWindow - usageTokens, 0) : null,
    referenceTotalTokens: referenceTotal,
    categoryTokens: {
      user: userTokens * scale,
      assistant: assistantTokens * scale,
      tools: toolTokensRaw * scale,
      other: otherTokens * scale,
    },
    toolTokens,
    toolCalls: toolCallsMap,
  };
}

function collectWeeklySnapshot(scopeDir: string | undefined): WeeklySnapshot {
  const endMs = Date.now();
  const startMs = endMs - WEEK_MS;

  const usageBreakdown = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  const models = new Map<string, number>();
  const tools = new Map<string, ToolStats>();

  let totalUsageTokens = 0;
  let totalCost = 0;
  const files = listSessionFiles(scopeDir);

  for (const filePath of files) {
    let content = "";
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const ts = parseTimestampMs(entry);
      if (!ts || ts < startMs || ts > endMs) continue;
      if (entry.type !== "message" || !entry.message) continue;

      const message = entry.message;
      if (message.role === "assistant") {
        const usage = message.usage;
        const usageTokens = toTotalUsageTokens(usage);
        totalUsageTokens += usageTokens;
        usageBreakdown.input += toFiniteNumberWithDefault(usage?.input);
        usageBreakdown.output += toFiniteNumberWithDefault(usage?.output);
        usageBreakdown.cacheRead += toFiniteNumberWithDefault(usage?.cacheRead);
        usageBreakdown.cacheWrite += toFiniteNumberWithDefault(usage?.cacheWrite);
        totalCost += toFiniteNumberWithDefault(usage?.cost?.total);

        const provider = String(message.provider || "unknown");
        const model = String(message.model || "unknown");
        addToMap(models, `${provider}/${model}`, usageTokens);

        const calls = extractToolCalls(message);
        for (const name of calls) {
          const tool = getOrCreateToolStats(tools, name);
          tool.calls += 1;
        }
        if (calls.length > 0 && usageTokens > 0) {
          const perCall = usageTokens / calls.length;
          for (const name of calls) {
            const tool = getOrCreateToolStats(tools, name);
            tool.usageTokens += perCall;
          }
        }
        continue;
      }

      if (message.role === "toolResult") {
        const toolName = String(message.toolName || "unknown");
        const tool = getOrCreateToolStats(tools, toolName);
        tool.contextTokens += estimateMessageTokens(message);
      }
    }
  }

  return {
    startMs,
    endMs,
    files: files.length,
    totalUsageTokens,
    usageBreakdown,
    totalCost,
    models,
    tools,
  };
}

function collectDashboardSnapshot(ctx: ExtensionAPI["context"]): DashboardSnapshot {
  const scopeDir = getScopeDirFromSession(ctx);
  return {
    scopeLabel: scopeDir ? `current workspace (${scopeDir})` : "all workspaces",
    current: collectCurrentSnapshot(ctx),
    week: collectWeeklySnapshot(scopeDir),
  };
}

function formatTokens(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatCost(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function crop(value: string, width: number): string {
  if (width <= 1) return value.slice(0, Math.max(0, width));
  if (value.length <= width) return value;
  return `${value.slice(0, width - 1)}…`;
}

function renderDashboard(theme: any, snapshot: DashboardSnapshot, width: number): string[] {
  const lines: string[] = [];
  const safeWidth = Math.max(1, width);
  const add = (line = "") => lines.push(truncateToWidth(line, safeWidth));

  add(theme.bold(theme.fg("accent", "Context Usage Dashboard")));
  add(theme.fg("dim", `scope: ${snapshot.scopeLabel}`));
  add("");

  const current = snapshot.current;
  add(theme.bold(theme.fg("accent", "Current Context")));
  if (current.usage) {
    const usedTokens = current.usage.tokens ?? 0;
    const usedPercent = current.usage.percent ?? 0;
    const usageTokenMetric = current.usage.usageTokens ?? 0;
    const trailingTokenMetric = current.usage.trailingTokens ?? 0;
    add(
      `${theme.fg("text", "used")} ${theme.fg("success", formatTokens(usedTokens))} / ${formatTokens(
        current.usage.contextWindow,
      )} (${formatPercent(usedPercent)})`,
    );
    add(
      `${theme.fg("text", "free")} ${theme.fg("success", formatTokens(current.freeTokens || 0))} tokens`,
    );
    add(
      theme.fg(
        "dim",
        `usage=${formatTokens(usageTokenMetric)} trailing=${formatTokens(trailingTokenMetric)}`,
      ),
    );
  } else {
    add(theme.fg("dim", "active model has no contextWindow metadata"));
  }

  const categoryTotal = current.referenceTotalTokens || 1;
  const cat = current.categoryTokens;
  add(
    theme.fg(
      "dim",
      `estimate: user ${formatPercent((cat.user / categoryTotal) * 100)} | assistant ${formatPercent(
        (cat.assistant / categoryTotal) * 100,
      )} | tools ${formatPercent((cat.tools / categoryTotal) * 100)} | other ${formatPercent(
        (cat.other / categoryTotal) * 100,
      )}`,
    ),
  );
  add("");

  add(theme.bold(theme.fg("accent", "Current Tool Occupancy (estimate)")));
  const currentTools = Array.from(current.toolTokens.entries()).sort((a, b) => b[1] - a[1]);
  if (currentTools.length === 0) {
    add(theme.fg("dim", "no toolResult messages in current branch"));
  } else {
    add(theme.fg("dim", "tool                       tokens    share   calls"));
    for (const [name, tokens] of currentTools.slice(0, TOP_ROWS)) {
      const share = current.referenceTotalTokens > 0 ? (tokens / current.referenceTotalTokens) * 100 : 0;
      const calls = Math.round(current.toolCalls.get(name) || 0);
      const row =
        `${crop(name, 24).padEnd(24)} ` +
        `${formatTokens(tokens).padStart(9)} ` +
        `${formatPercent(share).padStart(7)} ` +
        `${String(calls).padStart(6)}`;
      add(row);
    }
  }
  add("");

  const week = snapshot.week;
  add(theme.bold(theme.fg("accent", "Last 7 Days")));
  add(theme.fg("dim", `${formatDate(week.startMs)} .. ${formatDate(week.endMs)} | files=${week.files}`));
  add(theme.fg("text", "usage tokens  ") + theme.fg("success", formatTokens(week.totalUsageTokens)));
  add(
    theme.fg("dim", `input ${formatTokens(week.usageBreakdown.input)} | output ${formatTokens(week.usageBreakdown.output)}`),
  );
  add(
    theme.fg(
      "dim",
      `cacheRead ${formatTokens(week.usageBreakdown.cacheRead)} | cacheWrite ${formatTokens(week.usageBreakdown.cacheWrite)}`,
    ),
  );
  add(theme.fg("dim", `cost ${formatCost(week.totalCost)}`));
  add("");

  add(theme.bold(theme.fg("accent", "Weekly Model Breakdown")));
  const models = Array.from(week.models.entries()).sort((a, b) => b[1] - a[1]);
  if (models.length === 0) {
    add(theme.fg("dim", "no model usage data in this range"));
  } else {
    add(theme.fg("dim", "model                                usage tokens   share"));
    for (const [model, tokens] of models.slice(0, TOP_ROWS)) {
      const share = week.totalUsageTokens > 0 ? (tokens / week.totalUsageTokens) * 100 : 0;
      add(`${crop(model, 36).padEnd(36)} ${formatTokens(tokens).padStart(12)} ${formatPercent(share).padStart(7)}`);
    }
  }
  add("");

  add(theme.bold(theme.fg("accent", "Weekly Tool Breakdown")));
  const tools = Array.from(week.tools.entries()).sort((a, b) => {
    const scoreA = a[1].contextTokens + a[1].usageTokens;
    const scoreB = b[1].contextTokens + b[1].usageTokens;
    return scoreB - scoreA;
  });
  if (tools.length === 0) {
    add(theme.fg("dim", "no tool calls in this range"));
  } else {
    add(theme.fg("dim", "tool                       calls  context(est)  usage(est)"));
    for (const [toolName, stats] of tools.slice(0, TOP_ROWS)) {
      const line =
        `${crop(toolName, 24).padEnd(24)} ` +
        `${String(Math.round(stats.calls)).padStart(5)} ` +
        `${formatTokens(stats.contextTokens).padStart(13)} ` +
        `${formatTokens(stats.usageTokens).padStart(11)}`;
      add(line);
    }
  }

  add("");
  add(theme.fg("dim", "context(est): toolResult payload size estimate"));
  add(theme.fg("dim", "usage(est): assistant usage tokens distributed across called tools"));
  add(theme.fg("dim", "estimation uses chars/4 + fixed image budget"));
  add("");
  add(theme.fg("dim", "[r] refresh  [q] close"));

  return lines;
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("context-usage", {
    description: "Show current context usage and weekly breakdown by tool/model",
    handler: async (_args, ctx) => {
      let snapshot = collectDashboardSnapshot(ctx);

      await ctx.ui.custom<void>((tui, theme, _keybindings, done) => ({
        render: (w) => renderDashboard(theme, snapshot, w),
        invalidate: () => {},
        handleInput: (input) => {
          if (input === "q" || input === "escape") {
            done();
            return;
          }
          if (input === "r") {
            snapshot = collectDashboardSnapshot(ctx);
            tui.requestRender();
          }
        },
      }));
    },
  });
}
