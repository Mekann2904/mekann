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

function renderEfficiencySvg(rows: ParsedLog[]): string {
  const sampled = rows.length > MAX_POINTS ? rows.slice(-MAX_POINTS) : rows;
  const ratios = sampled.map((r) => {
    const total = r.totalPromptChars ?? 0;
    return total > 0 ? Math.min(1, (r.stablePrefixChars ?? 0) / total) : 0;
  });
  const plotW = SVG_WIDTH - PAD_L - PAD_R;
  const plotH = SVG_HEIGHT - PAD_T - PAD_B;
  const xFor = (i: number) => PAD_L + (sampled.length === 1 ? 0 : (i / (sampled.length - 1)) * plotW);
  const points = ratios.map((v, i) => {
    const x = xFor(i);
    const y = PAD_T + plotH - v * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const changeLines = sampled.map((r, i) => i > 0 && r.stablePrefixHash !== sampled[i - 1]?.stablePrefixHash ? `<line x1="${xFor(i).toFixed(1)}" y1="${PAD_T}" x2="${xFor(i).toFixed(1)}" y2="${SVG_HEIGHT - PAD_B}" stroke="#f59e0b" stroke-opacity="0.32"/>` : "").filter(Boolean).join("\n  ");
  const latest = ratios.at(-1) ?? 0;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <text x="${PAD_L}" y="18" fill="#e5e7eb" font-family="sans-serif" font-size="14">cache-friendly-prompt キャッシュ効率（最新 ${sampled.length} 件）</text>
  <line x1="${PAD_L}" y1="${SVG_HEIGHT - PAD_B}" x2="${SVG_WIDTH - PAD_R}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${SVG_HEIGHT - PAD_B}" stroke="#475569"/>
  <text x="14" y="${PAD_T + 5}" fill="#94a3b8" font-family="sans-serif" font-size="11">100%</text>
  <text x="22" y="${PAD_T + plotH / 2}" fill="#94a3b8" font-family="sans-serif" font-size="11">50%</text>
  <text x="28" y="${SVG_HEIGHT - PAD_B}" fill="#94a3b8" font-family="sans-serif" font-size="11">0%</text>
  <line x1="${PAD_L}" y1="${(PAD_T + plotH / 2).toFixed(1)}" x2="${SVG_WIDTH - PAD_R}" y2="${(PAD_T + plotH / 2).toFixed(1)}" stroke="#334155" stroke-dasharray="4 4"/>
  ${changeLines}
  <polyline fill="none" stroke="#a78bfa" stroke-width="2.5" points="${points}"/>
  <text x="${SVG_WIDTH - 190}" y="42" fill="#ddd6fe" font-family="sans-serif" font-size="13">latest: ${(latest * 100).toFixed(1)}%</text>
  <text x="${SVG_WIDTH - 190}" y="62" fill="#fbbf24" font-family="sans-serif" font-size="12">orange: hash change</text>
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
| cache efficiency | \`stablePrefixChars / totalPromptChars\`。送信プロンプト全体のうち、安定プレフィックスが占める割合です。 |
| hash change | stablePrefixHash が前回から変わった地点。安定部分が変化したため、キャッシュ再利用が効きにくくなる可能性があります。 |
| warning | cache-friendly-prompt が検出した注意点。例: stable prefix が短い、payload に不安定な構造がある、など。 |
| fragment | 各拡張が提供するプロンプト断片。stable / semi-stable / dynamic に分類されます。 |
| provider/model | リクエスト送信先の provider と model。例: \`openai-codex/gpt-5.5\`。 |

## キャッシュ効率

![cache-friendly-prompt efficiency](./efficiency.svg)

- 線: \`stablePrefixChars / totalPromptChars\` の割合
- 高いほど、送信プロンプトのうち安定プレフィックスが占める割合が大きいことを示します
- オレンジの縦線は \`stablePrefixHash\` の変化点です

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
      fs.writeFile(path.join(dir, "efficiency.svg"), renderEfficiencySvg(rows), "utf8"),
      fs.writeFile(path.join(dir, "report.md"), renderReport(summary, rows), "utf8"),
    ]);
  } catch { /* report generation must never break agent execution */ }
}
