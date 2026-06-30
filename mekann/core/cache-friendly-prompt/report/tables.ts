/**
 * cache-friendly-prompt/report/tables.ts — Markdown 表・行レンダラ。
 *
 * overview / actual / proxy / warning / recent-window の各 table 行と、role 相関
 * 注記 (formatUnknownRoleNote) を生成する。数値フォーマット・エスケープ・短縮 hash は
 * {@link "./format.js"} から取り寄せる。文書全体の組み立ては {@link "./document.js"}。
 */

import type { ParsedLog, ParsedActualUsageLog, ActualProviderSummary, CacheFriendlySummary, WarningBreakdownEntry, WarningCategoryBreakdown } from "../reportTypes.js";
import { escapeHtml, formatPct, formatTimestamp, shortHash } from "./format.js";

/**
 * Render a role-correlation coverage note. Returns an empty string when there
 * is no data. Surface the residual "unknown" share so weak role signals stay
 * visible (see issue #90; target: < 10% unknown).
 */
export function formatUnknownRoleNote(unknownCount: number, total: number): string {
  if (total <= 0) return "";
  const pct = (unknownCount / total) * 100;
  const trimmed = pct.toFixed(1);
  const flag = pct >= 10 ? " ⚠️ above 10% target" : "";
  return `> **Role correlation note**: ${unknownCount} / ${total} requests (${trimmed}%) have an uncorrelated role ("unknown").${flag}`;
}


export function renderLowHitRows(rows: ParsedActualUsageLog[], limit = 20): string {
  return rows
    .filter((row) => typeof row.tokenHitRate === "number" && Number.isFinite(row.tokenHitRate) && row.tokenHitRate < 0.8)
    .slice(-limit)
    .reverse()
    .map((row) => `| ${row.timestamp} | ${escapeHtml(`${row.provider ?? "unknown"}/${row.model ?? "unknown"}`)} | ${row.requestRole ?? "unknown"} | ${formatPct(row.tokenHitRate)} | ${row.inputTotalTokens ?? 0} | \`${shortHash(row.baseSystemHash)}\` | \`${shortHash(row.providerPrefixHash)}\` | ${row.totalPromptChars ?? 0} | ${row.correlationConfidence ?? "missing"} |`)
    .join("\n") || "| なし |  |  |  |  |  |  |  | |";
}

export function renderActualSummaryRows(summaryByKey: Record<string, ActualProviderSummary>): string {
  return Object.entries(summaryByKey)
    .sort((a, b) => b[1].inputTotalTokens - a[1].inputTotalTokens || b[1].requests - a[1].requests)
    .map(([key, v]) => `| ${escapeHtml(key)} | ${v.requests} | ${v.inputTotalTokens} | ${v.outputTokens} | ${v.cacheReadTokens} | ${v.cacheWriteTokens} | ${v.cacheMissTokens} | ${formatPct(v.weightedTokenHitRate)} | ${formatPct(v.averageTokenHitRate)} | ${formatPct(v.weightedCacheableReadRate)} |`)
    .join("\n") || "| なし | 0 | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |";
}

export function renderMetricRows(rows: Array<[string, string | number]>): string {
  return rows.map(([name, value]) => `| ${escapeHtml(name)} | ${value} |`).join("\n");
}


export function renderRecentWindowComparison(summary: CacheFriendlySummary, rows: ParsedLog[]): string {
  const recent = summary.recentWindow;
  const allTimeStart = rows[0]?.timestamp ?? null;
  const allTimeEnd = summary.latest?.timestamp ?? rows.at(-1)?.timestamp ?? null;
  const allTimeUniqueKeys = summary.uniqueScopedReuseKeyCount;
  const recentSpan = recent.windowStartTimestamp && recent.windowEndTimestamp ? `${formatTimestamp(recent.windowStartTimestamp)} → ${formatTimestamp(recent.windowEndTimestamp)}` : "n/a";
  const allSpan = allTimeStart && allTimeEnd ? `${formatTimestamp(allTimeStart)} → ${formatTimestamp(allTimeEnd)}` : "n/a";
  const recentLabel = `最新 ${recent.windowCapacity} リクエスト`;
  return `### 1.1 Recent window vs all-time

直近窓（${recentLabel}）と全期間を分離集計します。actual usage 側は別系統で同 ${recent.windowCapacity} リクエスト上限を独立に適用します。複数コード版跨ぎの累積ノイズを避けるため、直近窓を現行コード実態の判断軸にしてください。

| metric | recent window (${recentLabel}) | all-time |
|---|---|---|
| requests | ${recent.windowRequestCount} | ${summary.totalRequests} |
| time span | ${recentSpan} | ${allSpan} |
| warnings | ${recent.warningCount} | ${summary.warningCount} |
| unique scoped reuse keys | ${recent.uniqueScopedReuseKeys} | ${allTimeUniqueKeys} |
| adjacent prefix reuse rate (proxy) | ${formatPct(recent.adjacentPrefixReuseRate)} | ${formatPct(summary.adjacentPrefixReuseRate)} |
| actual weighted tokenHitRate | ${formatPct(recent.actualTokenHitRateWeighted)} | ${formatPct(summary.actualTokenHitRateWeighted)} |`;
}

export function renderWarningCategoryRows(recent: WarningCategoryBreakdown, allTime: WarningCategoryBreakdown): string {
  const rows: Array<[string, number, number]> = [
    ["base system 起因 (BASE_SYSTEM_*)", recent.baseSystem, allTime.baseSystem],
    ["fragment 起因 (VOLATILE_VALUE_IN_*_FRAGMENT 等)", recent.fragment, allTime.fragment],
    ["other", recent.other, allTime.other],
    ["total", recent.total, allTime.total],
  ];
  return rows.map(([name, r, a]) => `| ${name} | ${r} | ${a} |`).join("\n");
}

export function renderWarningBreakdownRows(entries: WarningBreakdownEntry[]): string {
  return entries.map((e) => `| \`${escapeHtml(e.code)}\` | ${escapeHtml(e.severity)} | ${e.count} |`).join("\n") || "| _なし_ |  | 0 |";
}

