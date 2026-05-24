import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";

type ParsedLog = CacheFriendlyRequestLog & { line: number };

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
  recentSameHashStreak: number;
  stablePrefixHashChanges: number;
  featureCacheablePrefixHashChanges: number;
  providerPrefixHashChanges: number;
  warningCount: number;
  providers: Record<string, ProviderSummary>;
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

function reuseKey(row: ParsedLog): string {
  return row.providerPrefixHash ?? row.featureCacheablePrefixHash ?? row.stablePrefixHash ?? "";
}

function countChanges(rows: ParsedLog[], value: (row: ParsedLog) => string | undefined): number {
  let changes = 0;
  for (let i = 1; i < rows.length; i++) if ((value(rows[i]) ?? "") !== (value(rows[i - 1]) ?? "")) changes++;
  return changes;
}

function summarize(rows: ParsedLog[], generatedAt: string): CacheFriendlySummary {
  const latest = rows.at(-1);
  let streak = 0;
  const latestReuseKey = latest ? reuseKey(latest) : "";
  for (let i = rows.length - 1; i >= 0 && latest && reuseKey(rows[i]) === latestReuseKey; i--) streak++;
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
    recentSameHashStreak: stableHashStreak,
    stablePrefixHashChanges: countChanges(rows, (r) => r.stablePrefixHash),
    featureCacheablePrefixHashChanges: countChanges(rows, (r) => r.featureCacheablePrefixHash),
    providerPrefixHashChanges: countChanges(rows, (r) => r.providerPrefixHash),
    warningCount: rows.reduce((n, r) => n + (r.warnings?.length ?? 0), 0),
    providers,
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

function sampleRows(rows: ParsedLog[], maxPoints: number | "all"): ParsedLog[] {
  return maxPoints === "all" || rows.length <= maxPoints ? rows : rows.slice(-maxPoints);
}

function sampleLabel(sampled: ParsedLog[], maxPoints: number | "all"): string {
  return maxPoints === "all" ? `全 ${sampled.length} 件` : `最新 ${sampled.length} 件`;
}

function renderSvg(rows: ParsedLog[], maxPoints: number | "all" = MAX_POINTS): string {
  const sampled = sampleRows(rows, maxPoints);
  const stable = sampled.map((r) => r.stablePrefixChars ?? 0);
  const providerPrefix = sampled.map((r) => r.providerPrefixChars ?? r.featureCacheablePrefixChars ?? r.stablePrefixChars ?? 0);
  const total = sampled.map((r) => r.totalPromptChars ?? 0);
  const max = Math.max(1, ...stable, ...providerPrefix, ...total);
  const changeXs: number[] = [];
  for (let i = 1; i < sampled.length; i++) if (reuseKey(sampled[i]) !== reuseKey(sampled[i - 1])) changeXs.push(i);
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
  const reuseScore = sampled.map((r, i) => i > 0 && reuseKey(r) === reuseKey(sampled[i - 1]) ? 100 : 0);
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  const points = reuseScore.map((v, i) => {
    const x = xFor(i);
    const y = PAD_T + plotH - (v / 100) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const changeLines = sampled.map((r, i) => i > 0 && reuseKey(r) !== reuseKey(sampled[i - 1]) ? `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.35"/>` : "").filter(Boolean).join("\n  ");
  const latest = sampled.at(-1);
  const latestScore = reuseScore.at(-1) ?? 0;
  let streak = 0;
  const latestReuseKey = latest ? reuseKey(latest) : "";
  for (let i = sampled.length - 1; i >= 0 && latest && reuseKey(sampled[i]) === latestReuseKey; i--) streak++;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt キャッシュ再利用スコア（${sampleLabel(sampled, maxPoints)}）</text>
  <line x1="${PAD_L}" y1="${SVG_HEIGHT - PAD_B}" x2="${SVG_WIDTH - PAD_R}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <text x="14" y="${PAD_T + 5}" fill="#94a3b8" font-family="sans-serif" font-size="11">100%</text>
  <text x="22" y="${PAD_T + plotH / 2}" fill="#94a3b8" font-family="sans-serif" font-size="11">50%</text>
  <text x="28" y="${SVG_HEIGHT - PAD_B}" fill="#94a3b8" font-family="sans-serif" font-size="11">0%</text>
  <line x1="${PAD_L}" y1="${(PAD_T + plotH / 2).toFixed(1)}" x2="${SVG_WIDTH - PAD_R}" y2="${(PAD_T + plotH / 2).toFixed(1)}" stroke="#334155" stroke-dasharray="4 4"/>
  ${changeLines}
  <polyline fill="none" stroke="#a78bfa" stroke-width="2.8" points="${points}"/>
  <rect x="${SVG_WIDTH - 310}" y="28" width="280" height="118" rx="6" fill="#111827" stroke="#334155"/>
  <line x1="${SVG_WIDTH - 294}" y1="50" x2="${SVG_WIDTH - 254}" y2="50" stroke="#a78bfa" stroke-width="3"/><text x="${SVG_WIDTH - 246}" y="54" fill="#cbd5e1" font-family="sans-serif" font-size="12">reuse score</text>
  <text x="${SVG_WIDTH - 294}" y="78" fill="#ddd6fe" font-family="sans-serif" font-size="12">latest score: ${latestScore.toFixed(0)}%</text>
  <text x="${SVG_WIDTH - 294}" y="98" fill="#cbd5e1" font-family="sans-serif" font-size="12">provider prefix: ${latest?.providerPrefixChars ?? latest?.featureCacheablePrefixChars ?? latest?.stablePrefixChars ?? 0} chars</text>
  <text x="${SVG_WIDTH - 294}" y="118" fill="#cbd5e1" font-family="sans-serif" font-size="12">provider tokens: ${latest?.providerPrefixTokenEstimate ?? latest?.featureCacheablePrefixTokenEstimate ?? latest?.stablePrefixTokenEstimate ?? 0}</text>
  <text x="${SVG_WIDTH - 294}" y="138" fill="#fbbf24" font-family="sans-serif" font-size="12">streak: ${streak} requests</text>
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

function renderReport(summary: CacheFriendlySummary, rows: ParsedLog[]): string {
  const latest = summary.latest;
  const providerRows = Object.entries(summary.providers).sort((a, b) => b[1].requests - a[1].requests).map(([k, v]) => `| ${escapeHtml(k)} | ${v.requests} | ${v.uniqueReuseKeys} | \`${shortHash(v.latestReuseKey)}\` | ${v.latestProviderPrefixChars ?? v.latestStablePrefixChars} | ${v.latestStablePrefixChars} | ${v.latestTotalPromptChars} |`).join("\n");
  const changes = rows.map((row, index) => ({ row, prev: index > 0 ? rows[index - 1] : undefined })).filter((x): x is { row: ParsedLog; prev: ParsedLog } => Boolean(x.prev) && reuseKey(x.row) !== reuseKey(x.prev)).slice(-20).reverse();
  const changeRows = changes.map(({ row, prev }) => `| ${row.timestamp} | ${escapeHtml(providerKey(row))} | \`${shortHash(reuseKey(prev))}\` → \`${shortHash(reuseKey(row))}\` | ${row.providerPrefixChars ?? row.featureCacheablePrefixChars ?? row.stablePrefixChars ?? 0} | ${row.stablePrefixChars ?? 0} | ${row.totalPromptChars ?? 0} |`).join("\n") || "| なし |  |  |  |  | |";
  return `# cache-friendly-prompt レポート

最終更新: ${summary.generatedAt}

## サマリー

- 総リクエスト数: ${summary.totalRequests}
- 最新 provider/model: ${latest ? `${latest.provider ?? "unknown"}/${latest.model ?? "unknown"}` : "なし"}
- 最新 stablePrefixHash: ${latest ? `\`${shortHash(latest.stablePrefixHash)}\`` : "なし"}
- 最新 stable prefix: ${latest?.stablePrefixChars ?? 0} chars
- 最新 total prompt: ${latest?.totalPromptChars ?? 0} chars
- 直近同一 reuse key 継続: ${summary.recentSameReuseKeyStreak} requests
- stablePrefixHash 変化回数: ${summary.stablePrefixHashChanges}
- featureCacheablePrefixHash 変化回数: ${summary.featureCacheablePrefixHashChanges}
- providerPrefixHash 変化回数: ${summary.providerPrefixHashChanges}
- warning 件数: ${summary.warningCount}

## 用語

| 用語 | 説明 |
|---|---|
| stablePrefixHash | stable fragment だけから計算した分類診断用 hash。system prompt や semi-stable は含みません。 |
| featureCacheablePrefixHash | cache-friendly-prompt が制御する stable + semi-stable prefix の hash。 |
| providerPrefixHash | base system prompt + stable + semi-stable から計算した raw-ish hash。provider SDK の最終 serialization そのものではありませんが、実 cache usage との相関用です。 |
| stablePrefixChars | stable fragment 部分だけの文字数です。 |
| providerPrefixChars | providerPrefixHash の対象になる前方 prefix の文字数です。 |
| totalPromptChars | provider に送られるプロンプト全体の文字数。ユーザー発話、会話履歴、tool 結果、read 結果なども含まれ得ます。 |
| prefix reuse proxy | 前回と同じ reuse key なら 100%、変化した直後は 0% とする再利用 proxy です。reuse key は providerPrefixHash → featureCacheablePrefixHash → stablePrefixHash の順で選びます。providerPrefixHash / featureCacheablePrefixHash がない旧ログでは stablePrefixHash に fallback します。 |
| hash change | reuse key が前回から変わった地点。provider cache 再利用が効きにくくなる可能性があります。 |
| warning | cache-friendly-prompt が検出した注意点。例: stable prefix が短い、payload に不安定な構造がある、など。 |
| fragment | 各拡張が提供するプロンプト断片。stable / semi-stable / dynamic に分類されます。 |
| provider/model | リクエスト送信先の provider と model。例: \`openai-codex/gpt-5.5\`。 |

## キャッシュ可能性

![cache-friendly-prompt cacheability score latest 500](./cacheability-score.svg)

![cache-friendly-prompt cacheability score all](./cacheability-score-all.svg)

- 上: 最新最大 ${MAX_POINTS} 件、下: 全件の図です
- 紫線: prefix reuse proxy。前回と同じ reuse key なら \`100%\`、変化した直後は \`0%\` です
- reuse key は \`providerPrefixHash ?? featureCacheablePrefixHash ?? stablePrefixHash\` です
- 100% に張り付いているほど、provider cache に効き得る前方 prefix を継続して送れている可能性が高いことを示します
- オレンジの縦線は reuse key の変化点です
- provider prefix の大きさは右上の \`provider prefix\` / \`provider tokens\` に数値で表示します
- total prompt の大きさは、この図では考慮しません

## 拡張機能ごとのコンテキスト注入量

![cache-friendly-prompt fragments](./fragments.svg)

- 緑: stable。キャッシュ候補の先頭部分に入る拡張コンテキストです
- 水色: semi-stable。比較的変化しにくいセッション文脈です
- 紫: dynamic。毎ターン変わりやすく、末尾側に追加される文脈です
- 文字数は fragment 本文ベースです。古いログにはサイズ情報がないため、新しいリクエスト以降に表示されます

## 推移

![cache-friendly-prompt trend latest 500](./trend.svg)

![cache-friendly-prompt trend all](./trend-all.svg)

## provider/model 別

| provider/model | requests | unique reuse keys | latest reuse key | provider prefix chars | stable chars | total chars |
|---|---:|---:|---|---:|---:|---:|
${providerRows || "| なし | 0 | 0 |  | 0 | 0 | 0 |"}

## 最近の hash 変化

| timestamp | provider/model | reuse key | provider prefix chars | stable chars | total chars |
|---|---|---|---:|---:|---:|
${changeRows}
`;
}

export async function generateCacheFriendlyReport(dir: string): Promise<void> {
  try {
    const logPath = path.join(dir, "requests.jsonl");
    const rows = readRows(await fs.readFile(logPath, "utf8"));
    const generatedAt = new Date().toISOString();
    const summary = summarize(rows, generatedAt);
    await Promise.all([
      fs.writeFile(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8"),
      fs.writeFile(path.join(dir, "trend.svg"), renderSvg(rows, MAX_POINTS), "utf8"),
      fs.writeFile(path.join(dir, "trend-all.svg"), renderSvg(rows, "all"), "utf8"),
      fs.writeFile(path.join(dir, "cacheability-score.svg"), renderCacheabilitySvg(rows, MAX_POINTS), "utf8"),
      fs.writeFile(path.join(dir, "cacheability-score-all.svg"), renderCacheabilitySvg(rows, "all"), "utf8"),
      fs.writeFile(path.join(dir, "fragments.svg"), renderFragmentsSvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "report.md"), renderReport(summary, rows), "utf8"),
    ]);
  } catch { /* report generation must never break agent execution */ }
}
