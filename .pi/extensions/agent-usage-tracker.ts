/**
 * @abdd.meta
 * path: .pi/extensions/agent-usage-tracker.ts
 * role: エージェント活動に関する拡張機能別の特徴使用量、ツールエラー、平均コンテキスト占有率を追跡・永続化する統計モジュール
 * why: 各拡張機能の特徴がどの程度使用され、どの程度信頼性があるかを詳細かつ永続的な分析ビューとして提供するため
 * related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/usage-tracker.ts
 * public_api: FeatureMetrics, UsageEventRecord, UsageTrackerState, FeatureCatalog インターフェース群
 * invariants:
 *   - STATE_VERSION は常に 1
 *   - イベント履歴は MAX_EVENT_HISTORY(5000) を超えない
 *   - 各メトリクスの数値は非負整数または非負数
 * side_effects:
 *   - .pi/analytics ディレクトリへのファイル読み書き
 *   - 状態ファイルの作成・更新
 * failure_modes:
 *   - ストレージファイルの読み込み失敗時は初期状態で開始
 *   - ディスク書き込み失敗時はエラーログ出力
 * @abdd.explain
 * overview: エージェントの活動を拡張機能単位で追跡し、ツール呼び出し・エラー・コンテキスト使用率をメトリクスとして集計・永続化する
 * what_it_does:
 *   - ツール呼び出しとエージェント実行の開始・完了をイベントとして記録
 *   - 拡張機能・特徴タイプ・特徴名ごとに呼び出し回数とエラー回数を集計
 *   - コンテキストウィンドウの占有率をサンプリングし平均値を算出
 *   - 直近 DEFAULT_RECENT_LIMIT(20) 件のイベント履歴と上位 DEFAULT_TOP_LIMIT(20) 件の特徴を提供
 * why_it_exists:
 *   - どの拡張機能の特徴が頻繁に使用されているかを可視化するため
 *   - ツールの信頼性（エラー率）を定量化して改善の優先順位を決定するため
 *   - コンテキスト使用パターンを分析してリソース効率を最適化するため
 * scope:
 *   in: ツール呼び出しID、拡張機能名、特徴名、実行ステータス、コンテキストスナップショット
 *   out: 集計メトリクス、イベント履歴、特徴カタログ、永続化された状態ファイル
 */

// File: .pi/extensions/agent-usage-tracker.ts
// Description: Tracks per-extension feature usage, tool errors, and average context occupancy for agent activity.
// Why: Gives a detailed and persistent analytics view of which extension features are used and how reliable they are.
// Related: .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts, .pi/extensions/usage-tracker.ts

import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { ensureDir } from "../lib/fs-utils.js";
import { toFiniteNumber } from "../lib/validation-utils.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();

type FeatureType = "tool" | "agent_run";
type EventStatus = "ok" | "error";

interface ContextSnapshot {
  tokens?: number;
  contextWindow?: number;
  ratio?: number;
}

interface FeatureMetrics {
  extension: string;
  featureType: FeatureType;
  featureName: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  contextTokenSamples: number;
  contextTokenSum: number;
  lastUsedAt?: string;
  lastErrorAt?: string;
  lastErrorMessage?: string;
}

interface UsageEventRecord {
  id: string;
  timestamp: string;
  extension: string;
  featureType: FeatureType;
  featureName: string;
  status: EventStatus;
  durationMs?: number;
  toolCallId?: string;
  inputPreview?: string;
  contextRatio?: number;
  contextTokens?: number;
  contextWindow?: number;
  error?: string;
}

interface UsageTrackerState {
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: {
    toolCalls: number;
    toolErrors: number;
    agentRuns: number;
    agentRunErrors: number;
    contextSamples: number;
    contextRatioSum: number;
    contextTokenSamples: number;
    contextTokenSum: number;
  };
  features: Record<string, FeatureMetrics>;
  events: UsageEventRecord[];
}

interface FeatureCatalog {
  discoveredAt: string;
  toolToExtension: Record<string, string>;
  commandToExtension: Record<string, string>;
}

interface ActiveToolCall {
  toolName: string;
  extension: string;
  featureKey: string;
  startedAtMs: number;
  inputPreview?: string;
  context?: ContextSnapshot;
}

interface ActiveAgentRun {
  featureKey: string;
  startedAtMs: number;
  toolCalls: number;
  toolErrors: number;
  startContext?: ContextSnapshot;
}

interface RuntimeState {
  cwd: string;
  storageFile: string;
  state: UsageTrackerState;
  catalog: FeatureCatalog;
  pendingTools: Map<string, ActiveToolCall>;
  activeAgentRun?: ActiveAgentRun;
}

const STATE_VERSION = 1;
const MAX_EVENT_HISTORY = 5000;
const DEFAULT_RECENT_LIMIT = 20;
const DEFAULT_TOP_LIMIT = 20;
const ANALYTICS_DIR = join(".pi", "analytics");
const STORAGE_FILE_NAME = "agent-usage-stats.json";

const BUILT_IN_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "list",
  "fetch",
  "view",
  "task",
  "question",
]);

let runtime: RuntimeState | undefined;

function nowIso(): string {
  return new Date().toISOString();
}

function getStorageFile(cwd: string): string {
  const analyticsDir = join(cwd, ANALYTICS_DIR);
  ensureDir(analyticsDir);
  return join(analyticsDir, STORAGE_FILE_NAME);
}

function createEmptyState(timestamp = nowIso()): UsageTrackerState {
  return {
    version: STATE_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    totals: {
      toolCalls: 0,
      toolErrors: 0,
      agentRuns: 0,
      agentRunErrors: 0,
      contextSamples: 0,
      contextRatioSum: 0,
      contextTokenSamples: 0,
      contextTokenSum: 0,
    },
    features: {},
    events: [],
  };
}

function loadState(storageFile: string): UsageTrackerState {
  if (!existsSync(storageFile)) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(storageFile, "utf-8")) as Partial<UsageTrackerState>;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.version === STATE_VERSION &&
      parsed.totals &&
      parsed.features &&
      Array.isArray(parsed.events)
    ) {
      return {
        version: STATE_VERSION,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : nowIso(),
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
        totals: {
          toolCalls: Number(parsed.totals.toolCalls) || 0,
          toolErrors: Number(parsed.totals.toolErrors) || 0,
          agentRuns: Number(parsed.totals.agentRuns) || 0,
          agentRunErrors: Number(parsed.totals.agentRunErrors) || 0,
          contextSamples: Number(parsed.totals.contextSamples) || 0,
          contextRatioSum: Number(parsed.totals.contextRatioSum) || 0,
          contextTokenSamples: Number(parsed.totals.contextTokenSamples) || 0,
          contextTokenSum: Number(parsed.totals.contextTokenSum) || 0,
        },
        features: parsed.features as Record<string, FeatureMetrics>,
        events: parsed.events.slice(-MAX_EVENT_HISTORY) as UsageEventRecord[],
      };
    }
  } catch {
    // noop
  }

  return createEmptyState();
}

function saveState(currentRuntime: RuntimeState): void {
  currentRuntime.state.updatedAt = nowIso();
  writeFileSync(currentRuntime.storageFile, JSON.stringify(currentRuntime.state, null, 2), "utf-8");
}

function ensureRuntime(ctx: ExtensionAPI["context"]): RuntimeState {
  if (runtime && runtime.cwd === ctx.cwd) {
    return runtime;
  }

  const storageFile = getStorageFile(ctx.cwd);
  runtime = {
    cwd: ctx.cwd,
    storageFile,
    state: loadState(storageFile),
    catalog: discoverFeatureCatalog(ctx.cwd),
    pendingTools: new Map<string, ActiveToolCall>(),
    activeAgentRun: undefined,
  };

  return runtime;
}

function discoverFeatureCatalog(cwd: string): FeatureCatalog {
  const discoveredAt = nowIso();
  const toolToExtension: Record<string, string> = {};
  const commandToExtension: Record<string, string> = {};
  const extensionDir = join(cwd, ".pi", "extensions");
  const candidateFiles: string[] = [];

  if (existsSync(extensionDir)) {
    for (const fileName of readdirSync(extensionDir)) {
      if (!fileName.endsWith(".ts")) continue;
      candidateFiles.push(join(extensionDir, fileName));
    }
  }

  const rootPluginDev = join(cwd, "plugin-dev.ts");
  if (existsSync(rootPluginDev)) {
    candidateFiles.push(rootPluginDev);
  }

  for (const path of candidateFiles) {
    try {
      const source = readFileSync(path, "utf-8");
      const extensionName = basename(path, ".ts");

      const toolNames = extractRegisteredToolNames(source);
      for (const toolName of toolNames) {
        toolToExtension[toolName] = extensionName;
      }

      const commandNames = extractRegisteredCommandNames(source);
      for (const commandName of commandNames) {
        commandToExtension[commandName] = extensionName;
      }
    } catch {
      // noop
    }
  }

  return {
    discoveredAt,
    toolToExtension,
    commandToExtension,
  };
}

function extractRegisteredToolNames(source: string): string[] {
  const found: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("pi.registerTool", cursor);
    if (start < 0) break;

    const probe = source.slice(start, start + 1200);
    const match = probe.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
    if (match?.[1]) {
      found.push(match[1].trim());
    }

    cursor = start + "pi.registerTool".length;
  }

  return Array.from(new Set(found));
}

function extractRegisteredCommandNames(source: string): string[] {
  const found: string[] = [];
  const matcher = /pi\.registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null = matcher.exec(source);

  while (match) {
    found.push(match[1].trim());
    match = matcher.exec(source);
  }

  return Array.from(new Set(found));
}

function resolveExtensionForTool(toolName: string, catalog: FeatureCatalog): string {
  if (catalog.toolToExtension[toolName]) {
    return catalog.toolToExtension[toolName];
  }

  if (toolName.startsWith("subagent_")) return "subagents";
  if (toolName.startsWith("agent_team_")) return "agent-teams";
  if (toolName.startsWith("plan_")) return "plan";
  if (toolName === "loop_run") return "loop";
  if (toolName === "question") return "question";
  if (toolName === "abbr") return "abbr";
  if (BUILT_IN_TOOLS.has(toolName)) return "core";
  return "unknown";
}

function toFeatureKey(featureType: FeatureType, extension: string, featureName: string): string {
  return `${featureType}:${extension}:${featureName}`;
}

function getOrCreateFeature(
  state: UsageTrackerState,
  key: string,
  extension: string,
  featureType: FeatureType,
  featureName: string,
): FeatureMetrics {
  if (!state.features[key]) {
    state.features[key] = {
      extension,
      featureType,
      featureName,
      calls: 0,
      errors: 0,
      contextSamples: 0,
      contextRatioSum: 0,
      contextTokenSamples: 0,
      contextTokenSum: 0,
    };
  }
  return state.features[key];
}

function applyContextSample(
  state: UsageTrackerState,
  feature: FeatureMetrics,
  context: ContextSnapshot | undefined,
): void {
  if (!context) return;

  if (typeof context.ratio === "number" && Number.isFinite(context.ratio)) {
    feature.contextSamples += 1;
    feature.contextRatioSum += context.ratio;
    state.totals.contextSamples += 1;
    state.totals.contextRatioSum += context.ratio;
  }

  if (typeof context.tokens === "number" && Number.isFinite(context.tokens)) {
    feature.contextTokenSamples += 1;
    feature.contextTokenSum += context.tokens;
    state.totals.contextTokenSamples += 1;
    state.totals.contextTokenSum += context.tokens;
  }
}

function markFeatureCall(
  state: UsageTrackerState,
  input: {
    extension: string;
    featureType: FeatureType;
    featureName: string;
    at: string;
    context?: ContextSnapshot;
  },
): string {
  const key = toFeatureKey(input.featureType, input.extension, input.featureName);
  const feature = getOrCreateFeature(
    state,
    key,
    input.extension,
    input.featureType,
    input.featureName,
  );

  feature.calls += 1;
  feature.lastUsedAt = input.at;
  applyContextSample(state, feature, input.context);

  if (input.featureType === "tool") {
    state.totals.toolCalls += 1;
  } else {
    state.totals.agentRuns += 1;
  }

  return key;
}

function markFeatureError(
  state: UsageTrackerState,
  featureKey: string,
  at: string,
  errorMessage?: string,
): void {
  const feature = state.features[featureKey];
  if (!feature) return;

  feature.errors += 1;
  feature.lastErrorAt = at;
  feature.lastErrorMessage = errorMessage;

  if (feature.featureType === "tool") {
    state.totals.toolErrors += 1;
  } else {
    state.totals.agentRunErrors += 1;
  }
}

function appendEvent(state: UsageTrackerState, event: Omit<UsageEventRecord, "id">): void {
  state.events.push({
    id: `${Date.now()}-${randomBytes(3).toString("hex")}`,
    ...event,
  });

  if (state.events.length > MAX_EVENT_HISTORY) {
    state.events.splice(0, state.events.length - MAX_EVENT_HISTORY);
  }
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(raw[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeRatio(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const normalized = value > 1 && value <= 100 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
}

function readContextSnapshot(ctx: ExtensionAPI["context"]): ContextSnapshot | undefined {
  try {
    const raw = ctx.getContextUsage?.() as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") return undefined;

    const tokens = pickNumber(raw, [
      "tokens",
      "tokenCount",
      "usedTokens",
      "totalTokens",
      "promptTokens",
    ]);
    const contextWindow = pickNumber(raw, [
      "contextWindow",
      "maxTokens",
      "maxContextTokens",
      "windowTokens",
      "limit",
    ]);
    let ratio = normalizeRatio(
      pickNumber(raw, [
        "ratio",
        "usageRatio",
        "occupancy",
        "percent",
        "percentage",
      ]),
    );

    if (ratio === undefined && tokens !== undefined && contextWindow && contextWindow > 0) {
      ratio = Math.max(0, Math.min(1, tokens / contextWindow));
    }

    if (
      tokens === undefined &&
      contextWindow === undefined &&
      ratio === undefined
    ) {
      return undefined;
    }

    return { tokens, contextWindow, ratio };
  } catch {
    return undefined;
  }
}

function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function formatRate(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return "0.0%";
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function compactSingleLine(input: string, limit = 180): string {
  const oneLine = input.replace(/\s+/g, " ").trim();
  if (oneLine.length <= limit) return oneLine;
  return `${oneLine.slice(0, limit)}...`;
}

function previewInput(input: unknown): string | undefined {
  if (input === undefined) return undefined;

  try {
    if (typeof input === "string") {
      return compactSingleLine(input, 180);
    }
    return compactSingleLine(JSON.stringify(input), 180);
  } catch {
    return undefined;
  }
}

function extractToolErrorMessage(event: any): string | undefined {
  const detailsError = event?.details?.error;
  if (typeof detailsError === "string" && detailsError.trim()) {
    return compactSingleLine(detailsError.trim(), 200);
  }

  const firstContent = Array.isArray(event?.content) ? event.content[0] : undefined;
  const text = firstContent?.text;
  if (typeof text === "string" && text.trim()) {
    return compactSingleLine(text.trim(), 200);
  }

  return undefined;
}

function aggregateByExtension(features: FeatureMetrics[]): Array<{
  extension: string;
  calls: number;
  errors: number;
  contextSamples: number;
  contextRatioSum: number;
  featureCount: number;
}> {
  const map = new Map<string, {
    extension: string;
    calls: number;
    errors: number;
    contextSamples: number;
    contextRatioSum: number;
    featureCount: number;
  }>();

  for (const feature of features) {
    if (!map.has(feature.extension)) {
      map.set(feature.extension, {
        extension: feature.extension,
        calls: 0,
        errors: 0,
        contextSamples: 0,
        contextRatioSum: 0,
        featureCount: 0,
      });
    }
    const row = map.get(feature.extension)!;
    row.calls += feature.calls;
    row.errors += feature.errors;
    row.contextSamples += feature.contextSamples;
    row.contextRatioSum += feature.contextRatioSum;
    row.featureCount += 1;
  }

  return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
}

function buildSummaryReport(
  state: UsageTrackerState,
  catalog: FeatureCatalog,
  topLimit: number,
): string {
  const lines: string[] = [];
  const features = Object.values(state.features).sort((a, b) => b.calls - a.calls);
  const extensionRows = aggregateByExtension(features);
  const avgContextRatio =
    state.totals.contextSamples > 0
      ? state.totals.contextRatioSum / state.totals.contextSamples
      : undefined;
  const avgContextTokens =
    state.totals.contextTokenSamples > 0
      ? state.totals.contextTokenSum / state.totals.contextTokenSamples
      : undefined;

  lines.push("Agent Usage Tracker");
  lines.push(`Updated: ${state.updatedAt}`);
  lines.push("");
  lines.push(`Tool calls: ${state.totals.toolCalls}`);
  lines.push(`Tool errors: ${state.totals.toolErrors} (${formatRate(state.totals.toolErrors, state.totals.toolCalls)})`);
  lines.push(`Agent runs: ${state.totals.agentRuns}`);
  lines.push(`Agent run errors: ${state.totals.agentRunErrors} (${formatRate(state.totals.agentRunErrors, state.totals.agentRuns)})`);
  lines.push(`Average context occupancy: ${formatPercent(avgContextRatio)} (${state.totals.contextSamples} samples)`);
  lines.push(`Average context tokens: ${avgContextTokens ? avgContextTokens.toFixed(0) : "-"} (${state.totals.contextTokenSamples} samples)`);
  lines.push("");
  lines.push(`Discovered extension tools: ${Object.keys(catalog.toolToExtension).length}`);
  lines.push(`Discovered extension commands: ${Object.keys(catalog.commandToExtension).length}`);
  lines.push("");
  lines.push("By extension:");

  if (extensionRows.length === 0) {
    lines.push("- no data");
  } else {
    for (const row of extensionRows.slice(0, topLimit)) {
      const avgRatio =
        row.contextSamples > 0 ? row.contextRatioSum / row.contextSamples : undefined;
      lines.push(
        `- ${row.extension}: calls=${row.calls}, errors=${row.errors} (${formatRate(row.errors, row.calls)}), avg_ctx=${formatPercent(avgRatio)}, features=${row.featureCount}`,
      );
    }
  }

  lines.push("");
  lines.push("Top features:");
  if (features.length === 0) {
    lines.push("- no data");
  } else {
    for (const feature of features.slice(0, topLimit)) {
      const avgRatio =
        feature.contextSamples > 0
          ? feature.contextRatioSum / feature.contextSamples
          : undefined;
      lines.push(
        `- [${feature.featureType}] ${feature.extension}/${feature.featureName}: calls=${feature.calls}, errors=${feature.errors} (${formatRate(feature.errors, feature.calls)}), avg_ctx=${formatPercent(avgRatio)}`,
      );
    }
  }

  lines.push("");
  lines.push("Commands:");
  lines.push("- /agent-usage                summary");
  lines.push("- /agent-usage recent [n]     recent logs");
  lines.push("- /agent-usage reset          reset all stats");
  lines.push("- /agent-usage export [path]  write json snapshot");
  return lines.join("\n");
}

function buildRecentReport(state: UsageTrackerState, limit: number): string {
  const lines: string[] = [];
  const events = state.events.slice(-limit).reverse();
  lines.push(`Recent events (${events.length}/${limit}):`);

  if (events.length === 0) {
    lines.push("- no data");
    return lines.join("\n");
  }

  for (const event of events) {
    const parts = [
      event.timestamp,
      `[${event.featureType}]`,
      `${event.extension}/${event.featureName}`,
      event.status,
    ];
    if (typeof event.durationMs === "number") {
      parts.push(`${event.durationMs}ms`);
    }
    if (typeof event.contextRatio === "number") {
      parts.push(`ctx=${formatPercent(event.contextRatio)}`);
    }
    if (typeof event.contextTokens === "number") {
      parts.push(`tok=${Math.round(event.contextTokens)}`);
    }
    lines.push(`- ${parts.join(" | ")}`);
    if (event.inputPreview) {
      lines.push(`  input=${event.inputPreview}`);
    }
    if (event.error) {
      lines.push(`  error=${event.error}`);
    }
  }

  return lines.join("\n");
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.trunc(n));
}

function exportState(
  currentRuntime: RuntimeState,
  exportPathRaw: string | undefined,
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = join(currentRuntime.cwd, ANALYTICS_DIR, `agent-usage-export-${timestamp}.json`);
  const exportPath = exportPathRaw
    ? resolve(currentRuntime.cwd, exportPathRaw)
    : defaultPath;

  const payload = {
    exportedAt: nowIso(),
    cwd: currentRuntime.cwd,
    catalog: currentRuntime.catalog,
    state: currentRuntime.state,
  };

  const dir = dirname(exportPath);
  if (dir) ensureDir(dir);
  writeFileSync(exportPath, JSON.stringify(payload, null, 2), "utf-8");
  return exportPath;
}

function handleAgentUsageCommand(
  args: string,
  ctx: ExtensionAPI["context"],
): void {
  const currentRuntime = ensureRuntime(ctx);
  const [subCommandRaw, ...rest] = args.trim().split(/\s+/).filter(Boolean);
  const subCommand = (subCommandRaw || "summary").toLowerCase();

  if (subCommand === "reset") {
    currentRuntime.state = createEmptyState();
    currentRuntime.pendingTools.clear();
    currentRuntime.activeAgentRun = undefined;
    saveState(currentRuntime);
    ctx.ui.notify("Agent usage stats reset", "success");
    return;
  }

  if (subCommand === "recent") {
    const limit = parsePositiveInt(rest[0], DEFAULT_RECENT_LIMIT);
    ctx.ui.notify(buildRecentReport(currentRuntime.state, limit), "info");
    return;
  }

  if (subCommand === "export") {
    const exportPath = exportState(currentRuntime, rest[0]);
    ctx.ui.notify(`Exported: ${exportPath}`, "success");
    return;
  }

  if (subCommand === "summary") {
    const topLimit = parsePositiveInt(rest[0], DEFAULT_TOP_LIMIT);
    const report = buildSummaryReport(currentRuntime.state, currentRuntime.catalog, topLimit);
    ctx.ui.notify(report, "info");
    return;
  }

  const topLimit = parsePositiveInt(subCommandRaw, DEFAULT_TOP_LIMIT);
  const report = buildSummaryReport(currentRuntime.state, currentRuntime.catalog, topLimit);
  ctx.ui.notify(report, "info");
}

function recordToolCall(event: any, ctx: ExtensionAPI["context"]): void {
  const currentRuntime = ensureRuntime(ctx);
  const toolName = String(event?.toolName || "unknown_tool");
  const extension = resolveExtensionForTool(toolName, currentRuntime.catalog);
  const at = nowIso();
  const context = readContextSnapshot(ctx);

  const featureKey = markFeatureCall(currentRuntime.state, {
    extension,
    featureType: "tool",
    featureName: toolName,
    at,
    context,
  });

  if (currentRuntime.activeAgentRun) {
    currentRuntime.activeAgentRun.toolCalls += 1;
  }

  const toolCallId = String(event?.toolCallId || "").trim();
  if (toolCallId) {
    currentRuntime.pendingTools.set(toolCallId, {
      toolName,
      extension,
      featureKey,
      startedAtMs: Date.now(),
      inputPreview: previewInput(event?.input),
      context,
    });
  } else {
    // toolCallId がない場合でも記録は残す。
    appendEvent(currentRuntime.state, {
      timestamp: at,
      extension,
      featureType: "tool",
      featureName: toolName,
      status: "ok",
      inputPreview: previewInput(event?.input),
      contextRatio: context?.ratio,
      contextTokens: context?.tokens,
      contextWindow: context?.contextWindow,
    });
  }
}

function recordToolResult(event: any, ctx: ExtensionAPI["context"]): void {
  const currentRuntime = ensureRuntime(ctx);
  const toolCallId = String(event?.toolCallId || "").trim();
  const pending = toolCallId ? currentRuntime.pendingTools.get(toolCallId) : undefined;
  const toolName = pending?.toolName ?? String(event?.toolName || "unknown_tool");
  const extension =
    pending?.extension ??
    resolveExtensionForTool(toolName, currentRuntime.catalog);
  const featureKey =
    pending?.featureKey ??
    toFeatureKey("tool", extension, toolName);
  const status: EventStatus = event?.isError ? "error" : "ok";
  const at = nowIso();

  if (status === "error") {
    const errorMessage = extractToolErrorMessage(event);
    markFeatureError(currentRuntime.state, featureKey, at, errorMessage);
    if (currentRuntime.activeAgentRun) {
      currentRuntime.activeAgentRun.toolErrors += 1;
    }
  }

  const context = pending?.context ?? readContextSnapshot(ctx);
  appendEvent(currentRuntime.state, {
    timestamp: at,
    extension,
    featureType: "tool",
    featureName: toolName,
    status,
    toolCallId: toolCallId || undefined,
    durationMs: pending ? Date.now() - pending.startedAtMs : undefined,
    inputPreview: pending?.inputPreview,
    contextRatio: context?.ratio,
    contextTokens: context?.tokens,
    contextWindow: context?.contextWindow,
    error: status === "error" ? extractToolErrorMessage(event) : undefined,
  });

  if (toolCallId) {
    currentRuntime.pendingTools.delete(toolCallId);
  }

  saveState(currentRuntime);
}

function recordAgentStart(ctx: ExtensionAPI["context"]): void {
  const currentRuntime = ensureRuntime(ctx);
  const at = nowIso();
  const context = readContextSnapshot(ctx);
  const featureKey = markFeatureCall(currentRuntime.state, {
    extension: "core-agent",
    featureType: "agent_run",
    featureName: "default",
    at,
    context,
  });

  currentRuntime.activeAgentRun = {
    featureKey,
    startedAtMs: Date.now(),
    toolCalls: 0,
    toolErrors: 0,
    startContext: context,
  };
}

function recordAgentEnd(ctx: ExtensionAPI["context"]): void {
  const currentRuntime = ensureRuntime(ctx);
  const active = currentRuntime.activeAgentRun;
  if (!active) {
    saveState(currentRuntime);
    return;
  }

  const at = nowIso();
  const failed = active.toolErrors > 0;
  const errorMessage = failed
    ? `${active.toolErrors}/${Math.max(1, active.toolCalls)} tool calls failed`
    : undefined;

  if (failed) {
    markFeatureError(currentRuntime.state, active.featureKey, at, errorMessage);
  }

  appendEvent(currentRuntime.state, {
    timestamp: at,
    extension: "core-agent",
    featureType: "agent_run",
    featureName: "default",
    status: failed ? "error" : "ok",
    durationMs: Date.now() - active.startedAtMs,
    contextRatio: active.startContext?.ratio,
    contextTokens: active.startContext?.tokens,
    contextWindow: active.startContext?.contextWindow,
    error: errorMessage,
  });

  currentRuntime.activeAgentRun = undefined;
  saveState(currentRuntime);
}

 /**
  * エージェントの使用状況追跡を登録
  * @param pi - 拡張機能APIインターフェース
  * @returns なし
  */
export default function registerAgentUsageTracker(pi: ExtensionAPI) {
  // 起動時に初期化と通知を行う。
  pi.on("session_start", async (_event, ctx) => {
    const currentRuntime = ensureRuntime(ctx);
    saveState(currentRuntime);
    ctx.ui.notify("Agent usage tracker loaded (/agent-usage)", "info");
  });

  // ツール呼び出しの開始時点で使用回数とコンテクスト専有率を記録する。
  pi.on("tool_call", async (event, ctx) => {
    recordToolCall(event, ctx);
  });

  // ツール完了時にエラー率用の結果を確定させる。
  pi.on("tool_result", async (event, ctx) => {
    recordToolResult(event, ctx);
  });

  // エージェント実行単位でも成功/失敗率を集計する。
  pi.on("agent_start", async (_event, ctx) => {
    recordAgentStart(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    recordAgentEnd(ctx);
  });

  // セッション終了時に最終保存する。
  pi.on("session_shutdown", async (_event, ctx) => {
    const currentRuntime = ensureRuntime(ctx);
    saveState(currentRuntime);
  });

  pi.registerCommand("agent-usage", {
    description: "Show extension feature usage, error rate, and average context occupancy",
    handler: async (args, ctx) => {
      handleAgentUsageCommand(args ?? "", ctx);
    },
  });

  pi.registerTool({
    name: "agent_usage_stats",
    label: "Agent Usage Stats",
    description:
      "Read/reset/export extension usage stats including per-feature call count, error rate, and context occupancy averages.",
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("summary"),
          Type.Literal("recent"),
          Type.Literal("reset"),
          Type.Literal("export"),
        ]),
      ),
      limit: Type.Optional(Type.Number({ description: "Limit for summary/recent output" })),
      exportPath: Type.Optional(Type.String({ description: "Optional relative export path" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = (params.action ?? "summary") as "summary" | "recent" | "reset" | "export";
      const operationId = logger.startOperation("direct" as OperationType, `agent_usage_stats:${action}`, {
        task: `エージェント使用量統計: ${action}`,
        params: { action, limit: params.limit, exportPath: params.exportPath },
      });

      try {
        const currentRuntime = ensureRuntime(ctx);

        if (action === "reset") {
          currentRuntime.state = createEmptyState();
          currentRuntime.pendingTools.clear();
          currentRuntime.activeAgentRun = undefined;
          saveState(currentRuntime);
          const output = "Agent usage stats reset.";
          logger.endOperation({
            status: "success",
            tokensUsed: 0,
            outputLength: output.length,
            childOperations: 0,
            toolCalls: 0,
          });
          return {
            content: [{ type: "text" as const, text: output }],
            details: { ok: true, action },
          };
        }

        if (action === "export") {
          const exportPath = exportState(currentRuntime, params.exportPath);
          const output = `Exported: ${exportPath}`;
          logger.endOperation({
            status: "success",
            tokensUsed: 0,
            outputLength: output.length,
            outputFile: exportPath,
            childOperations: 0,
            toolCalls: 0,
          });
          return {
            content: [{ type: "text" as const, text: output }],
            details: { ok: true, action, exportPath },
          };
        }

        if (action === "recent") {
          const limit = parsePositiveInt(
            params.limit === undefined ? undefined : String(params.limit),
            DEFAULT_RECENT_LIMIT,
          );
          const report = buildRecentReport(currentRuntime.state, limit);
          logger.endOperation({
            status: "success",
            tokensUsed: 0,
            outputLength: report.length,
            childOperations: 0,
            toolCalls: 0,
          });
          return {
            content: [{ type: "text" as const, text: report }],
            details: {
              action,
              limit,
              events: currentRuntime.state.events.slice(-limit),
            },
          };
        }

        const limit = parsePositiveInt(
          params.limit === undefined ? undefined : String(params.limit),
          DEFAULT_TOP_LIMIT,
        );
        const report = buildSummaryReport(currentRuntime.state, currentRuntime.catalog, limit);
        logger.endOperation({
          status: "success",
          tokensUsed: 0,
          outputLength: report.length,
          childOperations: 0,
          toolCalls: 0,
        });
        return {
          content: [{ type: "text" as const, text: report }],
          details: {
            action,
            limit,
            totals: currentRuntime.state.totals,
            features: currentRuntime.state.features,
          },
        };
      } catch (error) {
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
          content: [{ type: "text" as const, text: `エラー: ${errorMessage}` }],
          details: { ok: false, error: errorMessage },
        };
      }
    },
  });
}
