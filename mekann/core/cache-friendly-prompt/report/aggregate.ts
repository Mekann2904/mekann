/**
 * cache-friendly-prompt/report/aggregate.ts — 集計・パース・統計。
 *
 * request log / actual usage log の行パース、prefix 再利用率や hash 変化回数などの
 * proxy 指標、actual usage の provider/model/role 別集計を行い {@link summarize} で
 * 1 つの CacheFriendlySummary にまとめる。描画 (svg/tables/document) のデータソース。
 * 共通 formatter ({@link "./format.js"}) の shortHash のみに依存する。
 */

import { normalizeActualCacheUsage } from "../actualUsage.js";
import type { ActualUsageLog } from "../actualUsage.js";
import type { ParsedLog, ParsedActualUsageLog, ProviderSummary, ActualProviderSummary, PercentileSummary, CacheFriendlySummary, RecentWindowSummary } from "../reportTypes.js";
import {
	hasDynamicFragmentTruncation,
	hasDynamicTailTruncation,
	hasDynamicTruncation,
} from "../reportDynamicTruncation.js";
import { computeWarningBreakdown, computeWarningCategories } from "../reportWarningAnalytics.js";
import { summarizeOutputGateSavings } from "../outputGateSavings.js";
import type { OutputGateLedgerEvent } from "../outputGateSavings.js";
import { shortHash } from "./format.js";

/** Recent window = most recent N requests. Deterministic across clock changes and code versions. */
const RECENT_WINDOW_REQUESTS = 1000;

/** Compute the recent-window metrics (most recent N requests) for proxy rows and actual rows. */
export function summarizeRecentWindow(rows: ParsedLog[], actualRows: ParsedActualUsageLog[]): RecentWindowSummary {
  const recentRows = rows.slice(-RECENT_WINDOW_REQUESTS);
  const recentActualRows = actualRows.slice(-RECENT_WINDOW_REQUESTS);
  const first = recentRows[0];
  const last = recentRows[recentRows.length - 1];
  return {
    windowCapacity: RECENT_WINDOW_REQUESTS,
    windowRequestCount: recentRows.length,
    windowStartTimestamp: first?.timestamp ?? null,
    windowEndTimestamp: last?.timestamp ?? null,
    warningCount: recentRows.reduce((n, r) => n + (r.warnings?.length ?? 0), 0),
    uniqueScopedReuseKeys: countUniqueScopedReuseKeys(recentRows),
    adjacentPrefixReuseRate: computeAdjacentPrefixReuseRate(recentRows),
    actualRequestCount: recentActualRows.length,
    actualTokenHitRateWeighted: summarizeActualGroup(recentActualRows).weightedTokenHitRate,
  };
}

export function providerKey(row: ParsedLog): string {
  return `${row.provider ?? "unknown"}/${row.model ?? "unknown"}`;
}

export function requestRoleKey(row: ParsedLog): string {
  return row.requestRole ?? "unknown";
}

export function actualProviderKey(row: ParsedActualUsageLog): string {
  return row.provider ?? "unknown";
}

export function actualProviderModelKey(row: ParsedActualUsageLog): string {
  return `${row.provider ?? "unknown"}/${row.model ?? "unknown"}`;
}

export function actualRequestRoleKey(row: ParsedActualUsageLog): string {
  return row.requestRole ?? "unknown";
}


export function actualProviderPrefixHashKey(row: ParsedActualUsageLog): string {
  const hash = row.providerPrefixHash ?? row.featureCacheablePrefixHash ?? row.stablePrefixHash;
  return hash ? shortHash(hash) : "missing";
}

export function actualToolSetHashKey(row: ParsedActualUsageLog): string {
  return row.toolSetHash ? shortHash(row.toolSetHash) : "missing";
}

export function actualToolOrderHashKey(row: ParsedActualUsageLog): string {
  return row.toolOrderHash ? shortHash(row.toolOrderHash) : "missing";
}

export function actualBaseSystemHashKey(row: ParsedActualUsageLog): string {
  return row.baseSystemHash ? shortHash(row.baseSystemHash) : "missing";
}


export function readRows(text: string): ParsedLog[] {
  const rows: ParsedLog[] = [];
  for (const [i, line] of text.split(/\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push({ ...JSON.parse(line), line: i + 1 }); } catch { /* ignore broken historical lines */ }
  }
  return rows;
}

export function isActualUsageRow(row: any): row is ActualUsageLog {
  return row && typeof row === "object" && typeof row.inputTotalTokens === "number" && typeof row.outputTokens === "number" && typeof row.cacheReadTokens === "number";
}

export function readActualRows(text: string): ParsedActualUsageLog[] {
  const rows: ParsedActualUsageLog[] = [];
  for (const [i, line] of text.split(/\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (!isActualUsageRow(parsed)) continue;
      const normalized = parsed.rawUsage !== undefined ? normalizeActualCacheUsage(parsed.provider, parsed.rawUsage) : null;
      rows.push({ ...parsed, ...(normalized ?? {}), line: i + 1 });
    } catch { /* ignore broken historical lines */ }
  }
  return rows;
}

export function reuseKey(row: ParsedLog): string {
  return row.providerPrefixHash || row.featureCacheablePrefixHash || row.stablePrefixHash || "";
}

export function fragmentKey(f: { source: string; id: string; kind: string; stability: string }): string {
  return `${f.source}:${f.id}:${f.kind}:${f.stability}`;
}

export function describeFragmentDiff(prev: ParsedLog, row: ParsedLog): string {
  const reasons: string[] = [];
  if ((prev.baseSystemHash ?? "") !== (row.baseSystemHash ?? "")) reasons.push("baseSystemHash");
  if ((prev.stablePrefixHash ?? "") !== (row.stablePrefixHash ?? "")) reasons.push("stablePrefixHash");
  if ((prev.semiStableHash ?? "") !== (row.semiStableHash ?? "")) reasons.push("semiStableHash");
  if ((prev.featureCacheablePrefixHash ?? "") !== (row.featureCacheablePrefixHash ?? "")) reasons.push("featureCacheablePrefixHash");
  if ((prev.providerPrefixHash ?? "") !== (row.providerPrefixHash ?? "")) reasons.push("providerPrefixHash");

  const prevFragments = new Map((prev.fragmentHashes ?? []).map((f) => [fragmentKey(f), f]));
  const nextFragments = new Map((row.fragmentHashes ?? []).map((f) => [fragmentKey(f), f]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [key, f] of nextFragments) {
    const prevF = prevFragments.get(key);
    if (!prevF) added.push(`${f.stability}:${f.source}/${f.id}`);
    else if (prevF.hash !== f.hash) changed.push(`${f.stability}:${f.source}/${f.id}`);
  }
  for (const [key, f] of prevFragments) if (!nextFragments.has(key)) removed.push(`${f.stability}:${f.source}/${f.id}`);

  const parts = [
    reasons.length ? `hashes: ${reasons.join(", ")}` : "hashes: scoped key only",
    changed.length ? `changed: ${changed.slice(0, 6).join(", ")}${changed.length > 6 ? ", …" : ""}` : "",
    added.length ? `added: ${added.slice(0, 4).join(", ")}${added.length > 4 ? ", …" : ""}` : "",
    removed.length ? `removed: ${removed.slice(0, 4).join(", ")}${removed.length > 4 ? ", …" : ""}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

export function scopedReuseKey(row: ParsedLog): string {
  const key = reuseKey(row);
  if (!key) return `uncacheable:${row.line}`;
  return `${row.provider ?? "unknown"}:${row.model ?? "unknown"}:${key}`;
}

/** Count distinct `provider/model/reuse key` prefixes — the cacheable-prefix churn metric. */
export function countUniqueScopedReuseKeys(rows: ParsedLog[]): number {
  return rows.length > 0 ? new Set(rows.map(scopedReuseKey)).size : 0;
}

export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function computeAdjacentPrefixReuseRate(rows: ParsedLog[]): number | null {
  if (rows.length < 2) return null;
  let hits = 0;
  for (let i = 1; i < rows.length; i++) if (scopedReuseKey(rows[i]) === scopedReuseKey(rows[i - 1])) hits++;
  return hits / (rows.length - 1);
}

export function computeWindowPrefixReuseRate(rows: ParsedLog[], windowSize = 50): number | null {
  if (rows.length === 0) return null;
  let hits = 0;
  const recent = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = scopedReuseKey(row);
    const prevIndex = recent.get(key);
    if (prevIndex !== undefined && index - prevIndex <= windowSize) hits++;
    recent.set(key, index);
  });
  return hits / rows.length;
}

export function countChanges(rows: ParsedLog[], value: (row: ParsedLog) => string | undefined): number {
  let changes = 0;
  for (let i = 1; i < rows.length; i++) if ((value(rows[i]) ?? "") !== (value(rows[i - 1]) ?? "")) changes++;
  return changes;
}

export function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length > 0 ? nums.reduce((sum, v) => sum + v, 0) / nums.length : null;
}

export function percentile(values: Array<number | null | undefined>, p: number): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const index = Math.ceil((p / 100) * nums.length) - 1;
  return nums[Math.max(0, Math.min(nums.length - 1, index))];
}

export function percentiles(values: Array<number | null | undefined>): PercentileSummary {
  return { p50: percentile(values, 50), p90: percentile(values, 90), p99: percentile(values, 99) };
}

export function summarizeActualGroup(rows: ParsedActualUsageLog[]): ActualProviderSummary {
  const inputTotalTokens = rows.reduce((sum, row) => sum + (row.inputTotalTokens ?? 0), 0);
  const outputTokens = rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0);
  const cacheReadTokens = rows.reduce((sum, row) => sum + (row.cacheReadTokens ?? 0), 0);
  const cacheWriteTokens = rows.reduce((sum, row) => sum + (row.cacheWriteTokens ?? 0), 0);
  const cacheMissTokens = rows.reduce((sum, row) => sum + (row.cacheMissTokens ?? 0), 0);
  const cacheableRows = rows.filter((row) => row.cacheWriteTokens !== undefined);
  const cacheableReadTokens = cacheableRows.reduce((sum, row) => sum + (row.cacheReadTokens ?? 0), 0);
  const cacheableWriteTokens = cacheableRows.reduce((sum, row) => sum + (row.cacheWriteTokens ?? 0), 0);
  return {
    requests: rows.length,
    inputTotalTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheMissTokens,
    averageTokenHitRate: mean(rows.map((r) => r.tokenHitRate)),
    weightedTokenHitRate: rate(cacheReadTokens, inputTotalTokens),
    averageCacheableReadRate: mean(rows.map((r) => r.cacheableReadRate)),
    weightedCacheableReadRate: cacheableRows.length > 0 ? rate(cacheableReadTokens, cacheableReadTokens + cacheableWriteTokens) : null,
  };
}

export function groupActualRows(rows: ParsedActualUsageLog[], keyOf: (row: ParsedActualUsageLog) => string): Record<string, ActualProviderSummary> {
  const groups = new Map<string, ParsedActualUsageLog[]>();
  for (const row of rows) groups.set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row]);
  return Object.fromEntries([...groups.entries()].map(([key, groupRows]) => [key, summarizeActualGroup(groupRows)]));
}

export function actualWarmState(row: ParsedActualUsageLog, seen: Set<string>): "cold" | "warm" {
  const key = `${row.provider ?? "unknown"}/${row.model ?? "unknown"}/${row.providerPrefixHash ?? row.featureCacheablePrefixHash ?? row.stablePrefixHash ?? "uncacheable"}`;
  if (seen.has(key)) return "warm";
  seen.add(key);
  return "cold";
}

export function summarizeActual(actualRows: ParsedActualUsageLog[]) {
  const actual = summarizeActualGroup(actualRows);
  const matchedRows = actualRows.filter((row) => row.correlationConfidence === "requestId_matched" || row.correlationConfidence === "providerModel_fifo");
  const matched = summarizeActualGroup(matchedRows);
  const seenWarmKeys = new Set<string>();
  const rowsWithWarmState = actualRows.map((row) => ({ row, warmState: actualWarmState(row, seenWarmKeys) }));
  const coldRows = rowsWithWarmState.filter((x) => x.warmState === "cold").map((x) => x.row);
  const warmRows = rowsWithWarmState.filter((x) => x.warmState === "warm").map((x) => x.row);
  return {
    actualRequestCount: actual.requests,
    actualTokenHitRateAvg: actual.averageTokenHitRate,
    actualTokenHitRateWeighted: actual.weightedTokenHitRate,
    actualTokenHitRatePercentiles: percentiles(actualRows.map((r) => r.tokenHitRate)),
    actualMatchedRequestCount: matched.requests,
    actualMatchedTokenHitRateWeighted: matched.weightedTokenHitRate,
    actualMatchedTokenHitRatePercentiles: percentiles(matchedRows.map((r) => r.tokenHitRate)),
    actualColdRequestCount: coldRows.length,
    actualColdTokenHitRateWeighted: summarizeActualGroup(coldRows).weightedTokenHitRate,
    actualWarmRequestCount: warmRows.length,
    actualWarmTokenHitRateWeighted: summarizeActualGroup(warmRows).weightedTokenHitRate,
    actualByWarmState: {
      cold: summarizeActualGroup(coldRows),
      warm: summarizeActualGroup(warmRows),
    },
    actualCacheableReadRateAvg: actual.averageCacheableReadRate,
    actualCacheableReadRateWeighted: actual.weightedCacheableReadRate,
    actualCacheReadTokens: actual.cacheReadTokens,
    actualCacheWriteTokens: actual.cacheWriteTokens,
    actualCacheMissTokens: actual.cacheMissTokens,
    actualInputTotalTokens: actual.inputTotalTokens,
    actualByProvider: groupActualRows(actualRows, actualProviderKey),
    actualByProviderModel: groupActualRows(actualRows, actualProviderModelKey),
    actualByRequestRole: groupActualRows(actualRows, actualRequestRoleKey),
    actualByProviderPrefixHash: groupActualRows(actualRows, actualProviderPrefixHashKey),
    actualByToolSetHash: groupActualRows(actualRows, actualToolSetHashKey),
    actualByToolOrderHash: groupActualRows(actualRows, actualToolOrderHashKey),
    actualByBaseSystemHash: groupActualRows(actualRows, actualBaseSystemHashKey),
  };
}

export function summarize(rows: ParsedLog[], actualRows: ParsedActualUsageLog[], generatedAt: string, outputGateEvents: OutputGateLedgerEvent[] = []): CacheFriendlySummary {
  const latest = rows.at(-1);
  let streak = 0;
  const latestReuseKey = latest ? scopedReuseKey(latest) : "";
  for (let i = rows.length - 1; i >= 0 && latest && scopedReuseKey(rows[i]) === latestReuseKey; i--) streak++;
  let stableHashStreak = 0;
  const latestStablePrefixHash = latest?.stablePrefixHash ?? "";
  for (let i = rows.length - 1; i >= 0 && latest && (rows[i]?.stablePrefixHash ?? "") === latestStablePrefixHash; i--) stableHashStreak++;
  const providers: Record<string, ProviderSummary> = {};
  const reuseKeysByProvider = new Map<string, Set<string>>();
  const stableHashesByProvider = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = providerKey(row);
    reuseKeysByProvider.set(key, reuseKeysByProvider.get(key) ?? new Set<string>());
    stableHashesByProvider.set(key, stableHashesByProvider.get(key) ?? new Set<string>());
    reuseKeysByProvider.get(key)?.add(reuseKey(row));
    stableHashesByProvider.get(key)?.add(row.stablePrefixHash ?? "");
    providers[key] = {
      requests: (providers[key]?.requests ?? 0) + 1,
      uniqueReuseKeys: reuseKeysByProvider.get(key)?.size ?? 0,
      uniqueStablePrefixHashes: stableHashesByProvider.get(key)?.size ?? 0,
      latestReuseKey: reuseKey(row),
      latestStablePrefixHash: row.stablePrefixHash,
      latestStablePrefixChars: row.stablePrefixChars ?? 0,
      latestProviderPrefixChars: row.providerPrefixChars ?? 0,
      latestTotalPromptChars: row.totalPromptChars ?? 0,
    };
  }
  const uniqueScopedReuseKeyCount = countUniqueScopedReuseKeys(rows);
  const uniqueScopedReuseKeyRatio = rate(uniqueScopedReuseKeyCount, rows.length);
  const dynamicTailTruncatedRows = rows.filter(hasDynamicTailTruncation);
  const dynamicFragmentTruncatedRows = rows.filter(hasDynamicFragmentTruncation);
  const dynamicTruncatedRows = rows.filter(hasDynamicTruncation);
  const dynamicTruncationOriginalChars = dynamicTailTruncatedRows.reduce((sum, row) => sum + (row.dynamicContextOriginalChars ?? 0), 0);
  const dynamicTruncationRenderedChars = dynamicTailTruncatedRows.reduce((sum, row) => sum + (row.dynamicContextRenderedChars ?? 0), 0);
  const actual = summarizeActual(actualRows);
  return {
    generatedAt,
    totalRequests: rows.length,
    latest: latest ? {
      timestamp: latest.timestamp,
      provider: latest.provider,
      model: latest.model,
      stablePrefixHash: latest.stablePrefixHash,
      stablePrefixChars: latest.stablePrefixChars ?? 0,
      totalPromptChars: latest.totalPromptChars ?? 0,
    } : undefined,
    recentSameReuseKeyStreak: streak,
    adjacentPrefixReuseRate: computeAdjacentPrefixReuseRate(rows),
    windowPrefixReuseRate: computeWindowPrefixReuseRate(rows),
    uniqueScopedReuseKeyCount,
    uniqueScopedReuseKeyRatio,
    uniqueReuseKeyRatio: uniqueScopedReuseKeyRatio,
    recentSameHashStreak: stableHashStreak,
    baseSystemHashChanges: countChanges(rows, (r) => r.baseSystemHash),
    stablePrefixHashChanges: countChanges(rows, (r) => r.stablePrefixHash),
    featureCacheablePrefixHashChanges: countChanges(rows, (r) => r.featureCacheablePrefixHash),
    providerPrefixHashChanges: countChanges(rows, (r) => r.providerPrefixHash),
    toolSetHashChanges: countChanges(rows, (r) => r.toolSetHash),
    toolOrderHashChanges: countChanges(rows, (r) => r.toolOrderHash),
    providerModelSwitches: countChanges(rows, providerKey),
    providerSwitches: countChanges(rows, (r) => r.provider),
    modelSwitchesWithinProvider: rows.reduce((n, row, i) => i > 0 && (row.provider ?? "") === (rows[i - 1].provider ?? "") && (row.model ?? "") !== (rows[i - 1].model ?? "") ? n + 1 : n, 0),
    dynamicTruncationCount: dynamicTruncatedRows.length,
    dynamicTailTruncationCount: dynamicTailTruncatedRows.length,
    dynamicFragmentTruncationCount: dynamicFragmentTruncatedRows.length,
    dynamicTruncationOriginalChars,
    dynamicTruncationRenderedChars,
    dynamicTruncationOmittedChars: Math.max(0, dynamicTruncationOriginalChars - dynamicTruncationRenderedChars),
    warningCount: rows.reduce((n, r) => n + (r.warnings?.length ?? 0), 0),
    warningBreakdownRecent: computeWarningBreakdown(rows.slice(-RECENT_WINDOW_REQUESTS)),
    warningBreakdownAll: computeWarningBreakdown(rows),
    warningCategoriesRecent: computeWarningCategories(rows.slice(-RECENT_WINDOW_REQUESTS)),
    warningCategoriesAll: computeWarningCategories(rows),
    recentWindow: summarizeRecentWindow(rows, actualRows),
    providers,
    ...actual,
    outputGateSavings: summarizeOutputGateSavings(outputGateEvents),
  };
}

