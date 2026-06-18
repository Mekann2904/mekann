/**
 * cache-friendly-prompt/report/svg.ts — SVG レンダラ。
 *
 * prompt size 推移・cacheability score・actual hit rate・fragment 構成の各 SVG を生成。
 * 座標計算 (scalePoints / sampleRows / sampleLabel) もここに含む。
 * データは {@link "./aggregate.js"} の scopedReuseKey、表示用エスケープは
 * {@link "./format.js"} の escapeHtml に依存する。
 */

import type { ParsedLog, ParsedActualUsageLog } from "../reportTypes.js";
import { escapeHtml } from "./format.js";
import { scopedReuseKey } from "./aggregate.js";

export const MAX_POINTS = 500;
const SVG_WIDTH = 960;
const SVG_HEIGHT = 360;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 42;

export function scalePoints(values: number[], max: number): string {
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  if (values.length === 0) return "";
  return values.map((v, i) => {
    const x = PAD_L + (values.length === 1 ? 0 : (i / (values.length - 1)) * plotW);
    const y = PAD_T + plotH - (max === 0 ? 0 : (v / max) * plotH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function sampleRows<T>(rows: T[], maxPoints: number | "all"): T[] {
  return maxPoints === "all" || rows.length <= maxPoints ? rows : rows.slice(-maxPoints);
}

export function sampleLabel(sampled: unknown[], maxPoints: number | "all"): string {
  return maxPoints === "all" ? `全 ${sampled.length} 件` : `最新 ${sampled.length} 件`;
}

export function renderSvg(rows: ParsedLog[], maxPoints: number | "all" = MAX_POINTS): string {
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

export function renderCacheabilitySvg(rows: ParsedLog[], maxPoints: number | "all" = MAX_POINTS): string {
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

export function actualGraphSlug(key: string): string {
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "unknown";
}

export function renderActualHitRateSvg(rows: ParsedActualUsageLog[], maxPoints: number | "all" = MAX_POINTS, title = "actual provider cache hit rate"): string {
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

export function renderFragmentsSvg(rows: ParsedLog[]): string {
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

