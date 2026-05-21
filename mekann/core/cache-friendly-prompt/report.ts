import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CacheFriendlyRequestLog } from "../prompt-core/index.js";

type ParsedLog = CacheFriendlyRequestLog & { line: number };

type ProviderSummary = {
  requests: number;
  uniqueStablePrefixHashes: number;
  latestStablePrefixHash: string;
  latestStablePrefixChars: number;
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
  recentSameHashStreak: number;
  stablePrefixHashChanges: number;
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

function summarize(rows: ParsedLog[], generatedAt: string): CacheFriendlySummary {
  const latest = rows.at(-1);
  let changes = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i]?.stablePrefixHash !== rows[i - 1]?.stablePrefixHash) changes++;
  let streak = 0;
  for (let i = rows.length - 1; i >= 0 && latest && rows[i]?.stablePrefixHash === latest.stablePrefixHash; i--) streak++;
  const providers: Record<string, ProviderSummary> = {};
  const hashesByProvider = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = providerKey(row);
    hashesByProvider.set(key, hashesByProvider.get(key) ?? new Set<string>());
    hashesByProvider.get(key)?.add(row.stablePrefixHash);
    providers[key] = {
      requests: (providers[key]?.requests ?? 0) + 1,
      uniqueStablePrefixHashes: hashesByProvider.get(key)?.size ?? 0,
      latestStablePrefixHash: row.stablePrefixHash,
      latestStablePrefixChars: row.stablePrefixChars ?? 0,
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
    recentSameHashStreak: streak,
    stablePrefixHashChanges: changes,
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

function renderSvg(rows: ParsedLog[]): string {
  const sampled = rows.length > MAX_POINTS ? rows.slice(-MAX_POINTS) : rows;
  const stable = sampled.map((r) => r.stablePrefixChars ?? 0);
  const total = sampled.map((r) => r.totalPromptChars ?? 0);
  const max = Math.max(1, ...stable, ...total);
  const changeXs: number[] = [];
  for (let i = 1; i < sampled.length; i++) if (sampled[i]?.stablePrefixHash !== sampled[i - 1]?.stablePrefixHash) changeXs.push(i);
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt 推移（最新 ${sampled.length} 件）</text>
  <line x1="${PAD_L}" y1="${SVG_HEIGHT - PAD_B}" x2="${SVG_WIDTH - PAD_R}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <text x="8" y="${PAD_T + 10}" fill="#94a3b8" font-family="sans-serif" font-size="11">${max}</text>
  <text x="20" y="${SVG_HEIGHT - PAD_B}" fill="#94a3b8" font-family="sans-serif" font-size="11">0</text>
  ${changeXs.map((i) => `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.28"/>`).join("\n  ")}
  <polyline fill="none" stroke="#38bdf8" stroke-width="2" points="${scalePoints(total, max)}"/>
  <polyline fill="none" stroke="#22c55e" stroke-width="2" points="${scalePoints(stable, max)}"/>
  ${sampled.map((r, i) => (r.warnings?.length ?? 0) > 0 ? `<circle cx="${xFor(i).toFixed(1)}" cy="${PAD_T + 8}" r="3" fill="#ef4444"/>` : "").filter(Boolean).join("\n  ")}
  <rect x="${SVG_WIDTH - 250}" y="28" width="220" height="62" rx="6" fill="#111827" stroke="#334155"/>
  <line x1="${SVG_WIDTH - 236}" y1="48" x2="${SVG_WIDTH - 196}" y2="48" stroke="#38bdf8" stroke-width="3"/><text x="${SVG_WIDTH - 188}" y="52" fill="#cbd5e1" font-family="sans-serif" font-size="12">totalPromptChars</text>
  <line x1="${SVG_WIDTH - 236}" y1="68" x2="${SVG_WIDTH - 196}" y2="68" stroke="#22c55e" stroke-width="3"/><text x="${SVG_WIDTH - 188}" y="72" fill="#cbd5e1" font-family="sans-serif" font-size="12">stablePrefixChars</text>
</svg>
`;
}

function renderCacheabilitySvg(rows: ParsedLog[]): string {
  const sampled = rows.length > MAX_POINTS ? rows.slice(-MAX_POINTS) : rows;
  const reuseScore = sampled.map((r, i) => i > 0 && r.stablePrefixHash === sampled[i - 1]?.stablePrefixHash ? 100 : 0);
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  const points = reuseScore.map((v, i) => {
    const x = xFor(i);
    const y = PAD_T + plotH - (v / 100) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const changeLines = sampled.map((r, i) => i > 0 && r.stablePrefixHash !== sampled[i - 1]?.stablePrefixHash ? `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.35"/>` : "").filter(Boolean).join("\n  ");
  const latest = sampled.at(-1);
  const latestScore = reuseScore.at(-1) ?? 0;
  let streak = 0;
  for (let i = sampled.length - 1; i >= 0 && latest && sampled[i]?.stablePrefixHash === latest.stablePrefixHash; i--) streak++;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt キャッシュ再利用スコア（最新 ${sampled.length} 件）</text>
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
  <text x="${SVG_WIDTH - 294}" y="98" fill="#cbd5e1" font-family="sans-serif" font-size="12">stable prefix: ${latest?.stablePrefixChars ?? 0} chars</text>
  <text x="${SVG_WIDTH - 294}" y="118" fill="#cbd5e1" font-family="sans-serif" font-size="12">stable tokens: ${latest?.stablePrefixTokenEstimate ?? 0}</text>
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
  const providerRows = Object.entries(summary.providers).sort((a, b) => b[1].requests - a[1].requests).map(([k, v]) => `| ${escapeHtml(k)} | ${v.requests} | ${v.uniqueStablePrefixHashes} | \`${shortHash(v.latestStablePrefixHash)}\` | ${v.latestStablePrefixChars} | ${v.latestTotalPromptChars} |`).join("\n");
  const changes = rows.filter((r, i) => i > 0 && r.stablePrefixHash !== rows[i - 1]?.stablePrefixHash).slice(-20).reverse();
  const changeRows = changes.map((r) => `| ${r.timestamp} | ${escapeHtml(providerKey(r))} | \`${shortHash(rows[r.line - 2]?.stablePrefixHash)}\` → \`${shortHash(r.stablePrefixHash)}\` | ${r.stablePrefixChars ?? 0} | ${r.totalPromptChars ?? 0} |`).join("\n") || "| なし |  |  |  |  |";
  return `# cache-friendly-prompt レポート

最終更新: ${summary.generatedAt}

## サマリー

- 総リクエスト数: ${summary.totalRequests}
- 最新 provider/model: ${latest ? `${latest.provider ?? "unknown"}/${latest.model ?? "unknown"}` : "なし"}
- 最新 stablePrefixHash: ${latest ? `\`${shortHash(latest.stablePrefixHash)}\`` : "なし"}
- 最新 stable prefix: ${latest?.stablePrefixChars ?? 0} chars
- 最新 total prompt: ${latest?.totalPromptChars ?? 0} chars
- 直近同一 hash 継続: ${summary.recentSameHashStreak} requests
- stablePrefixHash 変化回数: ${summary.stablePrefixHashChanges}
- warning 件数: ${summary.warningCount}

## 用語

| 用語 | 説明 |
|---|---|
| stable prefix | provider に送るプロンプトの先頭に置かれる、変化しにくい部分。system prompt や stable fragment を含みます。 |
| stablePrefixHash | stable prefix の内容から計算した hash。同じ値が続くほど、安定部分が変わっていないことを示します。 |
| stablePrefixChars | stable prefix の文字数。キャッシュ候補になり得る先頭部分の大きさです。 |
| totalPromptChars | provider に送られるプロンプト全体の文字数。ユーザー発話、会話履歴、tool 結果、read 結果なども含まれ得ます。 |
| cacheability | 前回と同じ stablePrefixHash なら 100%、変化した直後は 0% とするキャッシュ再利用スコアです。 |
| hash change | stablePrefixHash が前回から変わった地点。安定部分が変化したため、キャッシュ再利用が効きにくくなる可能性があります。 |
| warning | cache-friendly-prompt が検出した注意点。例: stable prefix が短い、payload に不安定な構造がある、など。 |
| fragment | 各拡張が提供するプロンプト断片。stable / semi-stable / dynamic に分類されます。 |
| provider/model | リクエスト送信先の provider と model。例: \`openai-codex/gpt-5.5\`。 |

## キャッシュ可能性

![cache-friendly-prompt cacheability score](./cacheability-score.svg)

- 紫線: reuse score。前回と同じ \`stablePrefixHash\` なら \`100%\`、変化した直後は \`0%\` です
- 100% に張り付いているほど、同じ stable prefix を継続して送れていることを示します
- オレンジの縦線は \`stablePrefixHash\` の変化点です
- stable prefix の大きさは右上の \`stable prefix\` / \`stable tokens\` に数値で表示します
- total prompt の大きさは、この図では考慮しません

## 拡張機能ごとのコンテキスト注入量

![cache-friendly-prompt fragments](./fragments.svg)

- 緑: stable。キャッシュ候補の先頭部分に入る拡張コンテキストです
- 水色: semi-stable。比較的変化しにくいセッション文脈です
- 紫: dynamic。毎ターン変わりやすく、末尾側に追加される文脈です
- 文字数は fragment 本文ベースです。古いログにはサイズ情報がないため、新しいリクエスト以降に表示されます

## 推移

![cache-friendly-prompt trend](./trend.svg)

## provider/model 別

| provider/model | requests | unique hashes | latest hash | stable chars | total chars |
|---|---:|---:|---|---:|---:|
${providerRows || "| なし | 0 | 0 |  | 0 | 0 |"}

## 最近の hash 変化

| timestamp | provider/model | hash | stable chars | total chars |
|---|---|---|---:|---:|
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
      fs.writeFile(path.join(dir, "trend.svg"), renderSvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "cacheability-score.svg"), renderCacheabilitySvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "fragments.svg"), renderFragmentsSvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "report.md"), renderReport(summary, rows), "utf8"),
    ]);
  } catch { /* report generation must never break agent execution */ }
}
