import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";
import { normalizeActualCacheUsage, type ActualUsageLog } from "./actualUsage.js";

type ParsedLog = CacheFriendlyRequestLog & { line: number };
type ParsedActualUsageLog = ActualUsageLog & { line: number };

type ProviderSummary = {
  requests: number;
  uniqueReuseKeys: number;
  uniqueStablePrefixHashes: number;
  latestReuseKey: string;
  latestStablePrefixHash: string;
  latestStablePrefixChars: number;
  latestProviderPrefixChars: number;
  latestTotalPromptChars: number;
};

type ActualProviderSummary = {
  requests: number;
  inputTotalTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheMissTokens: number;
  averageTokenHitRate: number | null;
  weightedTokenHitRate: number | null;
  averageCacheableReadRate: number | null;
  weightedCacheableReadRate: number | null;
};

type PercentileSummary = { p50: number | null; p90: number | null; p99: number | null };

type CacheFriendlySummary = {
  generatedAt: string;
  totalRequests: number;
  latest?: {
    timestamp: string;
    provider?: string;
    model?: string;
    stablePrefixHash: string;
    stablePrefixChars: number;
    totalPromptChars: number;
  };
  recentSameReuseKeyStreak: number;
  adjacentPrefixReuseRate: number | null;
  windowPrefixReuseRate: number | null;
  uniqueScopedReuseKeyRatio: number | null;
  /** @deprecated Use uniqueScopedReuseKeyRatio. */
  uniqueReuseKeyRatio: number | null;
  recentSameHashStreak: number;
  baseSystemHashChanges: number;
  stablePrefixHashChanges: number;
  featureCacheablePrefixHashChanges: number;
  providerPrefixHashChanges: number;
  providerModelSwitches: number;
  providerSwitches: number;
  modelSwitchesWithinProvider: number;
  dynamicTruncationCount: number;
  dynamicTruncationOriginalChars: number;
  dynamicTruncationRenderedChars: number;
  dynamicTruncationOmittedChars: number;
  warningCount: number;
  providers: Record<string, ProviderSummary>;
  actualRequestCount: number;
  actualTokenHitRateAvg: number | null;
  actualTokenHitRateWeighted: number | null;
  actualCacheableReadRateAvg: number | null;
  actualCacheableReadRateWeighted: number | null;
  actualCacheReadTokens: number;
  actualTokenHitRatePercentiles: PercentileSummary;
  actualMatchedRequestCount: number;
  actualMatchedTokenHitRateWeighted: number | null;
  actualMatchedTokenHitRatePercentiles: PercentileSummary;
  actualColdRequestCount: number;
  actualColdTokenHitRateWeighted: number | null;
  actualWarmRequestCount: number;
  actualWarmTokenHitRateWeighted: number | null;
  actualByWarmState: Record<string, ActualProviderSummary>;
  actualCacheWriteTokens: number;
  actualCacheMissTokens: number;
  actualInputTotalTokens: number;
  actualByProvider: Record<string, ActualProviderSummary>;
  actualByProviderModel: Record<string, ActualProviderSummary>;
  actualByRequestRole: Record<string, ActualProviderSummary>;
  actualByProviderPrefixHash: Record<string, ActualProviderSummary>;
  actualByBaseSystemHash: Record<string, ActualProviderSummary>;
};

const MAX_POINTS = 500;
const SVG_WIDTH = 960;
const SVG_HEIGHT = 360;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 42;

function providerKey(row: ParsedLog): string {
  return `${row.provider ?? "unknown"}/${row.model ?? "unknown"}`;
}

function requestRoleKey(row: ParsedLog): string {
  return row.requestRole ?? "unknown";
}

function actualProviderKey(row: ParsedActualUsageLog): string {
  return row.provider ?? "unknown";
}

function actualProviderModelKey(row: ParsedActualUsageLog): string {
  return `${row.provider ?? "unknown"}/${row.model ?? "unknown"}`;
}

function actualRequestRoleKey(row: ParsedActualUsageLog): string {
  return row.requestRole ?? "unknown";
}

function actualProviderPrefixHashKey(row: ParsedActualUsageLog): string {
  const hash = row.providerPrefixHash ?? row.featureCacheablePrefixHash ?? row.stablePrefixHash;
  return hash ? shortHash(hash) : "missing";
}

function actualBaseSystemHashKey(row: ParsedActualUsageLog): string {
  return row.baseSystemHash ? shortHash(row.baseSystemHash) : "missing";
}

function shortHash(hash: string | undefined): string {
  return hash ? hash.slice(0, 8) : "";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

function readRows(text: string): ParsedLog[] {
  const rows: ParsedLog[] = [];
  for (const [i, line] of text.split(/\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push({ ...JSON.parse(line), line: i + 1 }); } catch { /* ignore broken historical lines */ }
  }
  return rows;
}

function isActualUsageRow(row: any): row is ActualUsageLog {
  return row && typeof row === "object" && typeof row.inputTotalTokens === "number" && typeof row.outputTokens === "number" && typeof row.cacheReadTokens === "number";
}

function readActualRows(text: string): ParsedActualUsageLog[] {
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

function reuseKey(row: ParsedLog): string {
  return row.providerPrefixHash || row.featureCacheablePrefixHash || row.stablePrefixHash || "";
}

function fragmentKey(f: { source: string; id: string; kind: string; stability: string }): string {
  return `${f.source}:${f.id}:${f.kind}:${f.stability}`;
}

function describeFragmentDiff(prev: ParsedLog, row: ParsedLog): string {
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

function scopedReuseKey(row: ParsedLog): string {
  const key = reuseKey(row);
  if (!key) return `uncacheable:${row.line}`;
  return `${row.provider ?? "unknown"}:${row.model ?? "unknown"}:${key}`;
}

function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function computeAdjacentPrefixReuseRate(rows: ParsedLog[]): number | null {
  if (rows.length < 2) return null;
  let hits = 0;
  for (let i = 1; i < rows.length; i++) if (scopedReuseKey(rows[i]) === scopedReuseKey(rows[i - 1])) hits++;
  return hits / (rows.length - 1);
}

function computeWindowPrefixReuseRate(rows: ParsedLog[], windowSize = 50): number | null {
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

function countChanges(rows: ParsedLog[], value: (row: ParsedLog) => string | undefined): number {
  let changes = 0;
  for (let i = 1; i < rows.length; i++) if ((value(rows[i]) ?? "") !== (value(rows[i - 1]) ?? "")) changes++;
  return changes;
}

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length > 0 ? nums.reduce((sum, v) => sum + v, 0) / nums.length : null;
}

function percentile(values: Array<number | null | undefined>, p: number): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const index = Math.ceil((p / 100) * nums.length) - 1;
  return nums[Math.max(0, Math.min(nums.length - 1, index))];
}

function percentiles(values: Array<number | null | undefined>): PercentileSummary {
  return { p50: percentile(values, 50), p90: percentile(values, 90), p99: percentile(values, 99) };
}

function summarizeActualGroup(rows: ParsedActualUsageLog[]): ActualProviderSummary {
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

function groupActualRows(rows: ParsedActualUsageLog[], keyOf: (row: ParsedActualUsageLog) => string): Record<string, ActualProviderSummary> {
  const groups = new Map<string, ParsedActualUsageLog[]>();
  for (const row of rows) groups.set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row]);
  return Object.fromEntries([...groups.entries()].map(([key, groupRows]) => [key, summarizeActualGroup(groupRows)]));
}

function actualWarmState(row: ParsedActualUsageLog, seen: Set<string>): "cold" | "warm" {
  const key = `${row.provider ?? "unknown"}/${row.model ?? "unknown"}/${row.providerPrefixHash ?? row.featureCacheablePrefixHash ?? row.stablePrefixHash ?? "uncacheable"}`;
  if (seen.has(key)) return "warm";
  seen.add(key);
  return "cold";
}

function summarizeActual(actualRows: ParsedActualUsageLog[]) {
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
    actualByBaseSystemHash: groupActualRows(actualRows, actualBaseSystemHashKey),
  };
}

function summarize(rows: ParsedLog[], actualRows: ParsedActualUsageLog[], generatedAt: string): CacheFriendlySummary {
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
  const uniqueScopedReuseKeyRatio = rate(new Set(rows.map(scopedReuseKey)).size, rows.length);
  const dynamicTruncatedRows = rows.filter((row) => row.dynamicContextTruncated === true);
  const dynamicTruncationOriginalChars = dynamicTruncatedRows.reduce((sum, row) => sum + (row.dynamicContextOriginalChars ?? 0), 0);
  const dynamicTruncationRenderedChars = dynamicTruncatedRows.reduce((sum, row) => sum + (row.dynamicContextRenderedChars ?? 0), 0);
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
    uniqueScopedReuseKeyRatio,
    uniqueReuseKeyRatio: uniqueScopedReuseKeyRatio,
    recentSameHashStreak: stableHashStreak,
    baseSystemHashChanges: countChanges(rows, (r) => r.baseSystemHash),
    stablePrefixHashChanges: countChanges(rows, (r) => r.stablePrefixHash),
    featureCacheablePrefixHashChanges: countChanges(rows, (r) => r.featureCacheablePrefixHash),
    providerPrefixHashChanges: countChanges(rows, (r) => r.providerPrefixHash),
    providerModelSwitches: countChanges(rows, providerKey),
    providerSwitches: countChanges(rows, (r) => r.provider),
    modelSwitchesWithinProvider: rows.reduce((n, row, i) => i > 0 && (row.provider ?? "") === (rows[i - 1].provider ?? "") && (row.model ?? "") !== (rows[i - 1].model ?? "") ? n + 1 : n, 0),
    dynamicTruncationCount: dynamicTruncatedRows.length,
    dynamicTruncationOriginalChars,
    dynamicTruncationRenderedChars,
    dynamicTruncationOmittedChars: Math.max(0, dynamicTruncationOriginalChars - dynamicTruncationRenderedChars),
    warningCount: rows.reduce((n, r) => n + (r.warnings?.length ?? 0), 0),
    providers,
    ...actual,
  };
}

function scalePoints(values: number[], max: number): string {
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  if (values.length === 0) return "";
  return values.map((v, i) => {
    const x = PAD_L + (values.length === 1 ? 0 : (i / (values.length - 1)) * plotW);
    const y = PAD_T + plotH - (max === 0 ? 0 : (v / max) * plotH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function sampleRows<T>(rows: T[], maxPoints: number | "all"): T[] {
  return maxPoints === "all" || rows.length <= maxPoints ? rows : rows.slice(-maxPoints);
}

function sampleLabel(sampled: unknown[], maxPoints: number | "all"): string {
  return maxPoints === "all" ? `全 ${sampled.length} 件` : `最新 ${sampled.length} 件`;
}

function renderSvg(rows: ParsedLog[], maxPoints: number | "all" = MAX_POINTS): string {
  const sampled = sampleRows(rows, maxPoints);
  const stable = sampled.map((r) => r.stablePrefixChars ?? 0);
  const providerPrefix = sampled.map((r) => r.providerPrefixChars ?? r.featureCacheablePrefixChars ?? r.stablePrefixChars ?? 0);
  const total = sampled.map((r) => r.totalPromptChars ?? 0);
  const max = Math.max(1, ...stable, ...providerPrefix, ...total);
  const changeXs: number[] = [];
  for (let i = 1; i < sampled.length; i++) if (scopedReuseKey(sampled[i]) !== scopedReuseKey(sampled[i - 1])) changeXs.push(i);
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt 推移（${sampleLabel(sampled, maxPoints)}）</text>
  <line x1="${PAD_L}" y1="${SVG_HEIGHT - PAD_B}" x2="${SVG_WIDTH - PAD_R}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <text x="8" y="${PAD_T + 10}" fill="#94a3b8" font-family="sans-serif" font-size="11">${max}</text>
  <text x="20" y="${SVG_HEIGHT - PAD_B}" fill="#94a3b8" font-family="sans-serif" font-size="11">0</text>
  ${changeXs.map((i) => `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.28"/>`).join("\n  ")}
  <polyline fill="none" stroke="#38bdf8" stroke-width="2" points="${scalePoints(total, max)}"/>
  <polyline fill="none" stroke="#fbbf24" stroke-width="2" points="${scalePoints(providerPrefix, max)}"/>
  <polyline fill="none" stroke="#22c55e" stroke-width="2" points="${scalePoints(stable, max)}"/>
  ${sampled.map((r, i) => (r.warnings?.length ?? 0) > 0 ? `<circle cx="${xFor(i).toFixed(1)}" cy="${PAD_T + 8}" r="3" fill="#ef4444"/>` : "").filter(Boolean).join("\n  ")}
  <rect x="${SVG_WIDTH - 280}" y="28" width="250" height="82" rx="6" fill="#111827" stroke="#334155"/>
  <line x1="${SVG_WIDTH - 266}" y1="48" x2="${SVG_WIDTH - 226}" y2="48" stroke="#38bdf8" stroke-width="3"/><text x="${SVG_WIDTH - 218}" y="52" fill="#cbd5e1" font-family="sans-serif" font-size="12">totalPromptChars</text>
  <line x1="${SVG_WIDTH - 266}" y1="68" x2="${SVG_WIDTH - 226}" y2="68" stroke="#fbbf24" stroke-width="3"/><text x="${SVG_WIDTH - 218}" y="72" fill="#cbd5e1" font-family="sans-serif" font-size="12">providerPrefixChars</text>
  <line x1="${SVG_WIDTH - 266}" y1="88" x2="${SVG_WIDTH - 226}" y2="88" stroke="#22c55e" stroke-width="3"/><text x="${SVG_WIDTH - 218}" y="92" fill="#cbd5e1" font-family="sans-serif" font-size="12">stablePrefixChars</text>
</svg>
`;
}

function renderCacheabilitySvg(rows: ParsedLog[], maxPoints: number | "all" = MAX_POINTS): string {
  const sampled = sampleRows(rows, maxPoints);
  const adjacentPrefixContinuityScore = sampled.map((r, i) => i > 0 && scopedReuseKey(r) === scopedReuseKey(sampled[i - 1]) ? 100 : 0);
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  const points = adjacentPrefixContinuityScore.map((v, i) => {
    const x = xFor(i);
    const y = PAD_T + plotH - (v / 100) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const changeLines = sampled.map((r, i) => i > 0 && scopedReuseKey(r) !== scopedReuseKey(sampled[i - 1]) ? `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.35"/>` : "").filter(Boolean).join("\n  ");
  const latest = sampled.at(-1);
  const latestScore = adjacentPrefixContinuityScore.at(-1) ?? 0;
  let streak = 0;
  const latestReuseKey = latest ? scopedReuseKey(latest) : "";
  for (let i = sampled.length - 1; i >= 0 && latest && scopedReuseKey(sampled[i]) === latestReuseKey; i--) streak++;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt 隣接prefix継続proxy（${sampleLabel(sampled, maxPoints)}）</text>
  <line x1="${PAD_L}" y1="${SVG_HEIGHT - PAD_B}" x2="${SVG_WIDTH - PAD_R}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <text x="14" y="${PAD_T + 5}" fill="#94a3b8" font-family="sans-serif" font-size="11">100%</text>
  <text x="22" y="${PAD_T + plotH / 2}" fill="#94a3b8" font-family="sans-serif" font-size="11">50%</text>
  <text x="28" y="${SVG_HEIGHT - PAD_B}" fill="#94a3b8" font-family="sans-serif" font-size="11">0%</text>
  <line x1="${PAD_L}" y1="${(PAD_T + plotH / 2).toFixed(1)}" x2="${SVG_WIDTH - PAD_R}" y2="${(PAD_T + plotH / 2).toFixed(1)}" stroke="#334155" stroke-dasharray="4 4"/>
  ${changeLines}
  <polyline fill="none" stroke="#a78bfa" stroke-width="2.8" points="${points}"/>
  <rect x="${SVG_WIDTH - 310}" y="28" width="280" height="118" rx="6" fill="#111827" stroke="#334155"/>
  <line x1="${SVG_WIDTH - 294}" y1="50" x2="${SVG_WIDTH - 254}" y2="50" stroke="#a78bfa" stroke-width="3"/><text x="${SVG_WIDTH - 246}" y="54" fill="#cbd5e1" font-family="sans-serif" font-size="12">adjacent prefix proxy</text>
  <text x="${SVG_WIDTH - 294}" y="78" fill="#ddd6fe" font-family="sans-serif" font-size="12">latest proxy: ${latestScore.toFixed(0)}%</text>
  <text x="${SVG_WIDTH - 294}" y="98" fill="#cbd5e1" font-family="sans-serif" font-size="12">provider prefix: ${latest?.providerPrefixChars ?? latest?.featureCacheablePrefixChars ?? latest?.stablePrefixChars ?? 0} chars</text>
  <text x="${SVG_WIDTH - 294}" y="118" fill="#cbd5e1" font-family="sans-serif" font-size="12">provider tokens: ${latest?.providerPrefixTokenEstimate ?? latest?.featureCacheablePrefixTokenEstimate ?? latest?.stablePrefixTokenEstimate ?? 0}</text>
  <text x="${SVG_WIDTH - 294}" y="138" fill="#fbbf24" font-family="sans-serif" font-size="12">streak: ${streak} requests</text>
</svg>
`;
}

function actualGraphSlug(key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "unknown";
}

function renderActualHitRateSvg(rows: ParsedActualUsageLog[], maxPoints: number | "all" = MAX_POINTS, title = "actual provider cache hit rate"): string {
  const sampled = sampleRows(rows, maxPoints);
  const height = 430;
  const padT = 40;
  const padB = 112;
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = height - padT - padB;
  const axisBottom = height - padB;
  const legendY = axisBottom + 34;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / Math.max(1, sampled.length - 1)) * plotW);
  const yFor = (v: number) => padT + plotH - (v * plotH);
  const lineSegments = (valueOf: (row: ParsedActualUsageLog) => number | null | undefined) => {
    const segments: string[] = [];
    let current: string[] = [];
    sampled.forEach((row, i) => {
      const value = valueOf(row);
      if (value === null || value === undefined || !Number.isFinite(value)) {
        if (current.length > 0) segments.push(current.join(" "));
        current = [];
        return;
      }
      current.push(`${xFor(i).toFixed(1)},${yFor(Math.max(0, Math.min(1, value))).toFixed(1)}`);
    });
    if (current.length > 0) segments.push(current.join(" "));
    return segments;
  };
  const tokenHitRateSegments = lineSegments((row) => row.tokenHitRate);
  const cacheableReadRateSegments = lineSegments((row) => row.cacheableReadRate);
  const nullMarkers = sampled.map((row, i) => row.tokenHitRate === null ? `<circle cx="${xFor(i).toFixed(1)}" cy="${axisBottom}" r="3" fill="#64748b"/>` : "").filter(Boolean).join("\n  ");
  const latest = sampled.at(-1);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="22" fill="#e5e7eb" font-family="sans-serif" font-size="14">${escapeHtml(title)}（${sampleLabel(sampled, maxPoints)}）</text>
  <line x1="${PAD_L}" y1="${axisBottom}" x2="${SVG_WIDTH - PAD_R}" y2="${axisBottom}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${padT}" x2="${PAD_L}" y2="${axisBottom}" stroke="#475569"/>
  <text x="14" y="${padT + 5}" fill="#94a3b8" font-family="sans-serif" font-size="11">100%</text>
  <text x="22" y="${padT + plotH / 2}" fill="#94a3b8" font-family="sans-serif" font-size="11">50%</text>
  <text x="28" y="${axisBottom}" fill="#94a3b8" font-family="sans-serif" font-size="11">0%</text>
  <line x1="${PAD_L}" y1="${(padT + plotH / 2).toFixed(1)}" x2="${SVG_WIDTH - PAD_R}" y2="${(padT + plotH / 2).toFixed(1)}" stroke="#334155" stroke-dasharray="4 4"/>
  ${tokenHitRateSegments.map((points) => `<polyline fill="none" stroke="#22c55e" stroke-width="2.8" points="${points}"/>`).join("\n  ")}
  ${cacheableReadRateSegments.map((points) => `<polyline fill="none" stroke="#38bdf8" stroke-width="2.2" points="${points}"/>`).join("\n  ")}
  ${nullMarkers}
  <rect x="${PAD_L}" y="${axisBottom + 16}" width="${plotW}" height="78" rx="6" fill="#111827" stroke="#334155"/>
  <line x1="${PAD_L + 18}" y1="${legendY}" x2="${PAD_L + 58}" y2="${legendY}" stroke="#22c55e" stroke-width="3"/><text x="${PAD_L + 68}" y="${legendY + 4}" fill="#cbd5e1" font-family="sans-serif" font-size="12">tokenHitRate</text>
  <line x1="${PAD_L + 190}" y1="${legendY}" x2="${PAD_L + 230}" y2="${legendY}" stroke="#38bdf8" stroke-width="3"/><text x="${PAD_L + 240}" y="${legendY + 4}" fill="#cbd5e1" font-family="sans-serif" font-size="12">cacheableReadRate</text>
  <circle cx="${PAD_L + 390}" cy="${legendY}" r="3" fill="#64748b"/><text x="${PAD_L + 402}" y="${legendY + 4}" fill="#cbd5e1" font-family="sans-serif" font-size="12">n/a</text>
  <text x="${PAD_L + 18}" y="${legendY + 28}" fill="#ddd6fe" font-family="sans-serif" font-size="12">latest: ${latest?.tokenHitRate === null || latest?.tokenHitRate === undefined ? "n/a" : `${(latest.tokenHitRate * 100).toFixed(1)}%`}</text>
  <text x="${PAD_L + 160}" y="${legendY + 28}" fill="#cbd5e1" font-family="sans-serif" font-size="12">read/input: ${latest?.cacheReadTokens ?? 0}/${latest?.inputTotalTokens ?? 0}</text>
  <text x="${PAD_L + 420}" y="${legendY + 28}" fill="#94a3b8" font-family="sans-serif" font-size="12">provider usage tokens, not proxy</text>
</svg>
`;
}

function renderFragmentsSvg(rows: ParsedLog[]): string {
  const latest = [...rows].reverse().find((r) => (r.fragmentHashes ?? []).some((f) => typeof f.chars === "number"));
  const items = new Map<string, { stable: number; semi_stable: number; dynamic: number }>();
  for (const f of latest?.fragmentHashes ?? []) {
    const cur = items.get(f.source) ?? { stable: 0, semi_stable: 0, dynamic: 0 };
    cur[f.stability] += f.chars ?? 0;
    items.set(f.source, cur);
  }
  const rowsData = [...items.entries()].sort((a, b) => (b[1].stable + b[1].semi_stable + b[1].dynamic) - (a[1].stable + a[1].semi_stable + a[1].dynamic));
  const max = Math.max(1, ...rowsData.map(([, v]) => v.stable + v.semi_stable + v.dynamic));
  const barX = 190;
  const barW = SVG_WIDTH - barX - 36;
  const rowH = 32;
  const height = Math.max(220, 86 + rowsData.length * rowH);
  const bars = rowsData.map(([source, v], i) => {
    const y = 72 + i * rowH;
    const stableW = (v.stable / max) * barW;
    const semiW = (v.semi_stable / max) * barW;
    const dynW = (v.dynamic / max) * barW;
    const total = v.stable + v.semi_stable + v.dynamic;
    return `<text x="20" y="${y + 15}" fill="#cbd5e1" font-family="sans-serif" font-size="12">${escapeHtml(source)}</text>
  <rect x="${barX}" y="${y}" width="${barW}" height="18" fill="#1e293b" rx="3"/>
  <rect x="${barX}" y="${y}" width="${stableW.toFixed(1)}" height="18" fill="#22c55e" rx="3"/>
  <rect x="${(barX + stableW).toFixed(1)}" y="${y}" width="${semiW.toFixed(1)}" height="18" fill="#38bdf8"/>
  <rect x="${(barX + stableW + semiW).toFixed(1)}" y="${y}" width="${dynW.toFixed(1)}" height="18" fill="#a78bfa"/>
  <text x="${barX + barW - 4}" y="${y + 14}" fill="#e5e7eb" font-family="sans-serif" font-size="11" text-anchor="end">${total} chars</text>`;
  }).join("\n  ");
  const empty = rowsData.length === 0 ? `<text x="20" y="90" fill="#cbd5e1" font-family="sans-serif" font-size="13">fragment chars は新しいログから記録されます。次回リクエスト後に表示されます。</text>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="20" y="26" fill="#e5e7eb" font-family="sans-serif" font-size="15">拡張機能ごとのコンテキスト注入量</text>
  <text x="20" y="48" fill="#94a3b8" font-family="sans-serif" font-size="12">latest: ${latest?.timestamp ?? "no fragment size data"}</text>
  <rect x="610" y="18" width="300" height="34" rx="6" fill="#111827" stroke="#334155"/>
  <rect x="626" y="30" width="18" height="8" fill="#22c55e"/><text x="650" y="38" fill="#cbd5e1" font-family="sans-serif" font-size="11">stable</text>
  <rect x="704" y="30" width="18" height="8" fill="#38bdf8"/><text x="728" y="38" fill="#cbd5e1" font-family="sans-serif" font-size="11">semi-stable</text>
  <rect x="820" y="30" width="18" height="8" fill="#a78bfa"/><text x="844" y="38" fill="#cbd5e1" font-family="sans-serif" font-size="11">dynamic</text>
  ${empty}
  ${bars}
</svg>
`;
}

function formatPercentiles(value: PercentileSummary): string {
  return `p50 ${formatPct(value.p50)} / p90 ${formatPct(value.p90)} / p99 ${formatPct(value.p99)}`;
}

function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function renderLowHitRows(rows: ParsedActualUsageLog[], limit = 20): string {
  return rows
    .filter((row) => typeof row.tokenHitRate === "number" && Number.isFinite(row.tokenHitRate) && row.tokenHitRate < 0.8)
    .slice(-limit)
    .reverse()
    .map((row) => `| ${row.timestamp} | ${escapeHtml(`${row.provider ?? "unknown"}/${row.model ?? "unknown"}`)} | ${row.requestRole ?? "unknown"} | ${formatPct(row.tokenHitRate)} | ${row.inputTotalTokens ?? 0} | \`${shortHash(row.baseSystemHash)}\` | \`${shortHash(row.providerPrefixHash)}\` | ${row.totalPromptChars ?? 0} | ${row.correlationConfidence ?? "missing"} |`)
    .join("\n") || "| なし |  |  |  |  |  |  |  | |";
}

function renderActualSummaryRows(summaryByKey: Record<string, ActualProviderSummary>): string {
  return Object.entries(summaryByKey)
    .sort((a, b) => b[1].inputTotalTokens - a[1].inputTotalTokens || b[1].requests - a[1].requests)
    .map(([key, v]) => `| ${escapeHtml(key)} | ${v.requests} | ${v.inputTotalTokens} | ${v.outputTokens} | ${v.cacheReadTokens} | ${v.cacheWriteTokens} | ${v.cacheMissTokens} | ${formatPct(v.weightedTokenHitRate)} | ${formatPct(v.averageTokenHitRate)} | ${formatPct(v.weightedCacheableReadRate)} |`)
    .join("\n") || "| なし | 0 | 0 | 0 | 0 | 0 | 0 | n/a | n/a | n/a |";
}

function renderMetricRows(rows: Array<[string, string | number]>): string {
  return rows.map(([name, value]) => `| ${escapeHtml(name)} | ${value} |`).join("\n");
}

function renderReport(summary: CacheFriendlySummary, rows: ParsedLog[], actualRows: ParsedActualUsageLog[]): string {
  const latest = summary.latest;
  const latestProviderModel = latest ? `${latest.provider ?? "unknown"}/${latest.model ?? "unknown"}` : "なし";
  const providerRows = Object.entries(summary.providers).sort((a, b) => b[1].requests - a[1].requests).map(([k, v]) => `| ${escapeHtml(k)} | ${v.requests} | ${v.uniqueReuseKeys} | \`${shortHash(v.latestReuseKey)}\` | ${v.latestProviderPrefixChars ?? v.latestStablePrefixChars} | ${v.latestStablePrefixChars} | ${v.latestTotalPromptChars} |`).join("\n");
  const lowHitRows = renderLowHitRows(actualRows);
  const actualProviderRows = renderActualSummaryRows(summary.actualByProvider);
  const actualProviderModelRows = renderActualSummaryRows(summary.actualByProviderModel);
  const actualRequestRoleRows = renderActualSummaryRows(summary.actualByRequestRole);
  const actualWarmStateRows = renderActualSummaryRows(summary.actualByWarmState);
  const actualProviderPrefixHashRows = renderActualSummaryRows(summary.actualByProviderPrefixHash);
  const actualBaseSystemHashRows = renderActualSummaryRows(summary.actualByBaseSystemHash);
  const actualProviderGraphRows = Object.keys(summary.actualByProvider).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-provider-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const actualProviderModelGraphRows = Object.keys(summary.actualByProviderModel).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const actualRequestRoleGraphRows = Object.keys(summary.actualByRequestRole).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-role-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptProviderGraphRows = [...new Set(rows.map((row) => row.provider ?? "unknown"))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-provider-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptProviderModelGraphRows = [...new Set(rows.map(providerKey))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptRoleGraphRows = [...new Set(rows.map(requestRoleKey))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-role-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const changes = rows.map((row, index) => ({ row, prev: index > 0 ? rows[index - 1] : undefined })).filter((x): x is { row: ParsedLog; prev: ParsedLog } => x.prev !== undefined && scopedReuseKey(x.row) !== scopedReuseKey(x.prev)).slice(-20).reverse();
  const changeRows = changes.map(({ row, prev }) => `| ${row.timestamp} | ${escapeHtml(providerKey(prev))} → ${escapeHtml(providerKey(row))} | \`${shortHash(reuseKey(prev))}\` → \`${shortHash(reuseKey(row))}\` | ${escapeHtml(describeFragmentDiff(prev, row))} | ${(row.providerPrefixChars ?? row.featureCacheablePrefixChars ?? row.stablePrefixChars ?? 0) - (prev.providerPrefixChars ?? prev.featureCacheablePrefixChars ?? prev.stablePrefixChars ?? 0)} | ${(row.totalPromptChars ?? 0) - (prev.totalPromptChars ?? 0)} | ${row.providerPrefixChars ?? row.featureCacheablePrefixChars ?? row.stablePrefixChars ?? 0} | ${row.stablePrefixChars ?? 0} | ${row.totalPromptChars ?? 0} |`).join("\n") || "| なし |  |  |  |  |  |  |  | |";
  const overviewRows = renderMetricRows([
    ["requests in proxy log", summary.totalRequests],
    ["latest provider/model", latestProviderModel],
    ["最新 stablePrefixHash", latest ? `\`${shortHash(latest.stablePrefixHash)}\`` : "なし"],
    ["latest stable prefix chars", latest?.stablePrefixChars ?? 0],
    ["latest total prompt chars", latest?.totalPromptChars ?? 0],
    ["warnings", summary.warningCount],
    ["dynamic truncations", summary.dynamicTruncationCount],
    ["dynamic truncation omitted chars", summary.dynamicTruncationOmittedChars],
  ]);
  const actualMetricRows = renderMetricRows([
    ["actual usage requests", summary.actualRequestCount],
    ["weighted tokenHitRate", formatPct(summary.actualTokenHitRateWeighted)],
    ["average tokenHitRate", formatPct(summary.actualTokenHitRateAvg)],
    ["request-level tokenHitRate percentiles", formatPercentiles(summary.actualTokenHitRatePercentiles)],
    ["correlated usage requests", summary.actualMatchedRequestCount],
    ["correlated weighted tokenHitRate", formatPct(summary.actualMatchedTokenHitRateWeighted)],
    ["correlated tokenHitRate percentiles", formatPercentiles(summary.actualMatchedTokenHitRatePercentiles)],
    ["cold usage requests", summary.actualColdRequestCount],
    ["cold weighted tokenHitRate", formatPct(summary.actualColdTokenHitRateWeighted)],
    ["warm usage requests", summary.actualWarmRequestCount],
    ["warm weighted tokenHitRate", formatPct(summary.actualWarmTokenHitRateWeighted)],
    ["cacheReadTokens", summary.actualCacheReadTokens],
    ["inputTotalTokens", summary.actualInputTotalTokens],
    ["outputTokens", Object.values(summary.actualByProvider).reduce((sum, v) => sum + v.outputTokens, 0)],
    ["cacheMissTokens", summary.actualCacheMissTokens],
    ["weighted cacheableReadRate", formatPct(summary.actualCacheableReadRateWeighted)],
  ]);
  const dynamicTruncationRows = rows.filter((row) => row.dynamicContextTruncated === true)
    .slice(-20)
    .reverse()
    .map((row) => `| ${row.timestamp} | ${escapeHtml(providerKey(row))} | ${row.dynamicContextOriginalChars ?? 0} | ${row.dynamicContextRenderedChars ?? 0} | ${Math.max(0, (row.dynamicContextOriginalChars ?? 0) - (row.dynamicContextRenderedChars ?? 0))} | ${row.dynamicContextLimitChars ?? 0} | ${row.latestDynamicFragmentHashes?.map((f) => `${f.source}/${f.id}`).slice(0, 6).join(", ") ?? ""} |`)
    .join("\n") || "| なし |  |  |  |  |  | |";
  const providerModelSwitchRows = rows.map((row, index) => ({ row, prev: index > 0 ? rows[index - 1] : undefined }))
    .filter((x): x is { row: ParsedLog; prev: ParsedLog } => x.prev !== undefined && providerKey(x.row) !== providerKey(x.prev))
    .slice(-20)
    .reverse()
    .map(({ row, prev }) => `| ${row.timestamp} | ${escapeHtml(providerKey(prev))} → ${escapeHtml(providerKey(row))} | \`${shortHash(reuseKey(prev))}\` → \`${shortHash(reuseKey(row))}\` | ${row.provider === prev.provider ? "model" : "provider"} | ${row.providerPrefixChars ?? 0} | ${row.totalPromptChars ?? 0} |`)
    .join("\n") || "| なし |  |  |  |  | |";
  const baseSystemRows = rows.map((row, index) => ({ row, prev: index > 0 ? rows[index - 1] : undefined }))
    .filter((x): x is { row: ParsedLog; prev: ParsedLog } => x.prev !== undefined && (x.row.baseSystemHash ?? "") !== (x.prev.baseSystemHash ?? ""))
    .slice(-20)
    .reverse()
    .map(({ row, prev }) => `| ${row.timestamp} | ${escapeHtml(providerKey(prev))} → ${escapeHtml(providerKey(row))} | \`${shortHash(prev.baseSystemHash)}\` → \`${shortHash(row.baseSystemHash)}\` | \`${shortHash(prev.providerPrefixHash)}\` → \`${shortHash(row.providerPrefixHash)}\` | ${(row.providerPrefixChars ?? 0) - (prev.providerPrefixChars ?? 0)} | ${row.providerPrefixChars ?? 0} |`)
    .join("\n") || "| なし |  |  |  |  | |";
  const proxyRows = renderMetricRows([
    ["adjacentPrefixReuseRate", formatPct(summary.adjacentPrefixReuseRate)],
    ["windowPrefixReuseRate (latest 50)", formatPct(summary.windowPrefixReuseRate)],
    ["uniqueScopedReuseKeyRatio", formatPct(summary.uniqueScopedReuseKeyRatio)],
    ["recentSameReuseKeyStreak", `${summary.recentSameReuseKeyStreak} requests`],
    ["baseSystemHashChanges", summary.baseSystemHashChanges],
    ["stablePrefixHashChanges", summary.stablePrefixHashChanges],
    ["featureCacheablePrefixHashChanges", summary.featureCacheablePrefixHashChanges],
    ["providerPrefixHashChanges", summary.providerPrefixHashChanges],
    ["provider/model switches", summary.providerModelSwitches],
    ["provider switches", summary.providerSwitches],
    ["model switches within provider", summary.modelSwitchesWithinProvider],
  ]);
  return `# cache-friendly-prompt レポート

最終更新: ${summary.generatedAt}

## 1. Overview

このレポートは、ログから直接計算できる値だけを表示します。推測の評価文や良し悪しの判定は載せません。

| metric | value |
|---|---:|
${overviewRows}

## 2. Actual provider cache hit rate

This section is based on provider usage tokens, not prefix continuity proxy.

### 2.1 Overall

| metric | value |
|---|---:|
${actualMetricRows}

### 2.2 By provider/model

| provider/model | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualProviderModelRows}

### 2.3 By provider

| provider | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualProviderRows}

### 2.4 By request role

| request role | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualRequestRoleRows}

### 2.5 By provider prefix hash

This table is useful when a small set of provider prefix hashes has different actual hit rates.

| providerPrefixHash | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualProviderPrefixHashRows}

### 2.6 By base system hash

This table helps distinguish extension fragment stability from base system prompt differences between main and subagent runtimes.

| baseSystemHash | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualBaseSystemHashRows}

### 2.7 Cold vs warm

Cold means first actual usage row for a provider/model/prefix hash key in the current log. Warm means later rows with the same key.

| warm state | requests | input tokens | output tokens | cache read tokens | cache write tokens | cache miss tokens | weighted tokenHitRate | avg tokenHitRate | weighted cacheableReadRate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${actualWarmStateRows}

### 2.8 Actual graphs

#### Overall

![actual provider cache hit rate overall](./actual-hit-rate.svg)

#### By request role

| request role | graph |
|---|---|
${actualRequestRoleGraphRows}

#### By provider

| provider | graph |
|---|---|
${actualProviderGraphRows}

#### By provider/model

| provider/model | graph |
|---|---|
${actualProviderModelGraphRows}

### 2.9 Recent low-hit actual rows

Rows with request-level \`tokenHitRate < 80%\`.

| timestamp | provider/model | role | tokenHitRate | input tokens | baseSystemHash | providerPrefixHash | total chars | correlation |
|---|---|---|---:|---:|---|---|---:|---|
${lowHitRows}

## 3. Prefix continuity proxy

This is not actual provider cache hit rate.

| metric | value |
|---|---:|
${proxyRows}

![cache-friendly-prompt cacheability score latest 500](./cacheability-score.svg)

![cache-friendly-prompt cacheability score all](./cacheability-score-all.svg)

## 4. Prompt size trends

This section is based on proxy request logs. It can include providers/models that do not have actual usage rows.

### 4.1 Overall

![cache-friendly-prompt trend latest 500](./trend.svg)

![cache-friendly-prompt trend all](./trend-all.svg)

### 4.2 By request role

| request role | graph |
|---|---|
${promptRoleGraphRows}

### 4.3 By provider

| provider | graph |
|---|---|
${promptProviderGraphRows}

### 4.4 By provider/model

| provider/model | graph |
|---|---|
${promptProviderModelGraphRows}

## 5. Prompt fragments

![cache-friendly-prompt fragments](./fragments.svg)

## 6. Provider/model proxy details

| provider/model | requests | unique reuse keys | latest reuse key | provider prefix chars | stable chars | total chars |
|---|---:|---:|---|---:|---:|---:|
${providerRows || "| なし | 0 | 0 |  | 0 | 0 | 0 |"}

## 7. Dynamic tail size / truncation

Dynamic context is intentionally placed in the volatile tail, but very large dynamic tails still increase total input tokens and can lower request-level tokenHitRate. This table shows recent dynamic truncations.

| timestamp | provider/model | original chars | rendered chars | omitted chars | limit chars | dynamic fragments |
|---|---|---:|---:|---:|---:|---|
${dynamicTruncationRows}

## 8. Provider/model switching

Provider cache is usually scoped by provider/model. Frequent switching can lower global hit rate even when each provider/model is healthy.

| timestamp | provider/model switch | reuse key | switch type | provider prefix chars | total chars |
|---|---|---|---|---:|---:|
${providerModelSwitchRows}

## 9. Base system prompt stability

\`stablePrefixHash\` が安定しているのに \`providerPrefixHash\` が変わる場合、base system prompt 側が揺れている可能性があります。この表は base system prompt hash の変化だけを抜き出します。

| timestamp | provider/model | baseSystemHash | providerPrefixHash | provider prefix Δchars | provider prefix chars |
|---|---|---|---|---:|---:|
${baseSystemRows}

## 10. 最近の scoped reuse key 変化 / Recent scoped reuse key changes

| timestamp | provider/model | reuse key | likely change reason | provider prefix Δchars | total Δchars | provider prefix chars | stable chars | total chars |
|---|---|---|---|---:|---:|---:|---:|---:|
${changeRows}

## 11. Glossary

| term | meaning |
|---|---|
| actual provider cache hit rate | provider usage token 由来の実 cache read 率です。prefix continuity proxy とは別系統です。 |
| tokenHitRate | \`cacheReadTokens / inputTotalTokens\`。全入力 token のうち cache read された割合です。 |
| cacheableReadRate | \`cacheReadTokens / (cacheReadTokens + cacheWriteTokens)\`。write token が分かる provider で、cache 対象領域のうち read できた割合です。 |
| prefix continuity proxy | 同じ scoped reuse key が継続しているかを示す proxy 指標です。actual provider cache hit rate ではありません。 |
| scoped reuse key | \`provider/model/reuse key\` の組です。reuse key は providerPrefixHash → featureCacheablePrefixHash → stablePrefixHash の順で選びます。 |
| stablePrefixHash | stable fragment だけから計算した分類診断用 hash。system prompt や semi-stable は含みません。 |
| featureCacheablePrefixHash | cache-friendly-prompt が制御する stable + semi-stable prefix の hash。 |
| providerPrefixHash | base system prompt + stable + semi-stable から計算した raw-ish hash。provider SDK の最終 serialization そのものではありません。 |
| hash change | reuse key が前回から変わった地点です。 |
| fragment | 各拡張が提供するプロンプト断片。stable / semi-stable / dynamic に分類されます。 |
`;
}

async function readIfExists(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf8"); } catch { return ""; }
}

export async function generateCacheFriendlyReport(dir: string): Promise<void> {
  try {
    const rows = readRows(await readIfExists(path.join(dir, "requests.jsonl")));
    const actualRows = readActualRows(await readIfExists(path.join(dir, "actual-usage.jsonl")));
    const generatedAt = new Date().toISOString();
    const summary = summarize(rows, actualRows, generatedAt);
    const actualProviderGraphWrites = Object.keys(summary.actualByProvider).map((key) => {
      const groupRows = actualRows.filter((row) => actualProviderKey(row) === key);
      return fs.writeFile(path.join(dir, `actual-hit-rate-provider-${actualGraphSlug(key)}.svg`), renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate: ${key}`), "utf8");
    });
    const actualGraphWrites = Object.keys(summary.actualByProviderModel).map((key) => {
      const groupRows = actualRows.filter((row) => actualProviderModelKey(row) === key);
      return fs.writeFile(path.join(dir, `actual-hit-rate-${actualGraphSlug(key)}.svg`), renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate: ${key}`), "utf8");
    });
    const actualRequestRoleGraphWrites = Object.keys(summary.actualByRequestRole).map((key) => {
      const groupRows = actualRows.filter((row) => actualRequestRoleKey(row) === key);
      return fs.writeFile(path.join(dir, `actual-hit-rate-role-${actualGraphSlug(key)}.svg`), renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate by request role: ${key}`), "utf8");
    });
    const promptRoleGraphWrites = [...new Set(rows.map(requestRoleKey))].map((key) => {
      const groupRows = rows.filter((row) => requestRoleKey(row) === key);
      return fs.writeFile(path.join(dir, `trend-role-${actualGraphSlug(key)}.svg`), renderSvg(groupRows, MAX_POINTS), "utf8");
    });
    const promptProviderGraphWrites = [...new Set(rows.map((row) => row.provider ?? "unknown"))].map((key) => {
      const groupRows = rows.filter((row) => (row.provider ?? "unknown") === key);
      return fs.writeFile(path.join(dir, `trend-provider-${actualGraphSlug(key)}.svg`), renderSvg(groupRows, MAX_POINTS), "utf8");
    });
    const promptProviderModelGraphWrites = [...new Set(rows.map(providerKey))].map((key) => {
      const groupRows = rows.filter((row) => providerKey(row) === key);
      return fs.writeFile(path.join(dir, `trend-${actualGraphSlug(key)}.svg`), renderSvg(groupRows, MAX_POINTS), "utf8");
    });
    await Promise.all([
      fs.writeFile(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8"),
      fs.writeFile(path.join(dir, "trend.svg"), renderSvg(rows, MAX_POINTS), "utf8"),
      fs.writeFile(path.join(dir, "trend-all.svg"), renderSvg(rows, "all"), "utf8"),
      fs.writeFile(path.join(dir, "cacheability-score.svg"), renderCacheabilitySvg(rows, MAX_POINTS), "utf8"),
      fs.writeFile(path.join(dir, "cacheability-score-all.svg"), renderCacheabilitySvg(rows, "all"), "utf8"),
      fs.writeFile(path.join(dir, "actual-hit-rate.svg"), renderActualHitRateSvg(actualRows, MAX_POINTS, "actual provider cache hit rate: overall"), "utf8"),
      ...actualProviderGraphWrites,
      ...actualGraphWrites,
      ...actualRequestRoleGraphWrites,
      ...promptRoleGraphWrites,
      ...promptProviderGraphWrites,
      ...promptProviderModelGraphWrites,
      fs.writeFile(path.join(dir, "fragments.svg"), renderFragmentsSvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "report.md"), renderReport(summary, rows, actualRows), "utf8"),
    ]);
  } catch { /* report generation must never break agent execution */ }
}
