/**
 * cache-friendly-prompt/report/document.ts — レポート文書の組み立てとファイル出力。
 *
 * renderReport で集計結果 (CacheFriendlySummary) から Markdown レポート本体を組み立て、
 * buildCacheFriendlyReportArtifacts で summary.json / 各種 SVG / report.md の成果物一式を
 * 生成し、generateCacheFriendlyReport でディスクへ書き出す。集計は
 * {@link "./aggregate.js"}、SVG は {@link "./svg.js"}、表行は {@link "./tables.js"}、
 * 共通フォーマッタは {@link "./format.js"} に委譲する。
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ParsedLog, ParsedActualUsageLog, CacheFriendlySummary } from "../reportTypes.js";
import { dynamicTruncationStage, hasDynamicTruncation } from "../reportDynamicTruncation.js";
import { WARNING_BREAKDOWN_TOP_N } from "../reportWarningAnalytics.js";
import { readOutputGateEvents } from "../outputGateSavings.js";
import type { OutputGateLedgerEvent } from "../outputGateSavings.js";
import { escapeHtml, formatBytes, formatPercentiles, formatPct, shortHash } from "./format.js";
import {
	summarize,
	readRows,
	readActualRows,
	providerKey,
	requestRoleKey,
	actualProviderKey,
	actualProviderModelKey,
	actualRequestRoleKey,
	scopedReuseKey,
	reuseKey,
	describeFragmentDiff,
} from "./aggregate.js";
import {
	renderSvg,
	renderCacheabilitySvg,
	renderActualHitRateSvg,
	renderFragmentsSvg,
	actualGraphSlug,
	MAX_POINTS,
} from "./svg.js";
import {
	renderLowHitRows,
	renderActualSummaryRows,
	renderMetricRows,
	renderRecentWindowComparison,
	renderWarningCategoryRows,
	renderWarningBreakdownRows,
	formatUnknownRoleNote,
} from "./tables.js";

export function renderReport(summary: CacheFriendlySummary, rows: ParsedLog[], actualRows: ParsedActualUsageLog[]): string {
  const latest = summary.latest;
  const latestProviderModel = latest ? `${latest.provider ?? "unknown"}/${latest.model ?? "unknown"}` : "なし";
  const providerRows = Object.entries(summary.providers).sort((a, b) => b[1].requests - a[1].requests).map(([k, v]) => `| ${escapeHtml(k)} | ${v.requests} | ${v.uniqueReuseKeys} | \`${shortHash(v.latestReuseKey)}\` | ${v.latestProviderPrefixChars ?? v.latestStablePrefixChars} | ${v.latestStablePrefixChars} | ${v.latestTotalPromptChars} |`).join("\n");
  const lowHitRows = renderLowHitRows(actualRows);
  const actualProviderRows = renderActualSummaryRows(summary.actualByProvider);
  const actualProviderModelRows = renderActualSummaryRows(summary.actualByProviderModel);
  const actualRequestRoleRows = renderActualSummaryRows(summary.actualByRequestRole);
  const actualUnknownRoleNote = formatUnknownRoleNote(summary.actualByRequestRole["unknown"]?.requests ?? 0, summary.actualRequestCount);
  const actualWarmStateRows = renderActualSummaryRows(summary.actualByWarmState);
  const actualProviderPrefixHashRows = renderActualSummaryRows(summary.actualByProviderPrefixHash);
  const actualBaseSystemHashRows = renderActualSummaryRows(summary.actualByBaseSystemHash);
  const actualProviderGraphRows = Object.keys(summary.actualByProvider).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-provider-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const actualProviderModelGraphRows = Object.keys(summary.actualByProviderModel).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const actualRequestRoleGraphRows = Object.keys(summary.actualByRequestRole).sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./actual-hit-rate-role-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptProviderGraphRows = [...new Set(rows.map((row) => row.provider ?? "unknown"))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-provider-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptProviderModelGraphRows = [...new Set(rows.map(providerKey))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptRoleGraphRows = [...new Set(rows.map(requestRoleKey))].sort().map((key) => `| ${escapeHtml(key)} | ![${escapeHtml(key)}](./trend-role-${actualGraphSlug(key)}.svg) |`).join("\n") || "| なし | n/a |";
  const promptUnknownRoleNote = formatUnknownRoleNote(rows.filter((row) => requestRoleKey(row) === "unknown").length, rows.length);
  const changes = rows.map((row, index) => ({ row, prev: index > 0 ? rows[index - 1] : undefined })).filter((x): x is { row: ParsedLog; prev: ParsedLog } => x.prev !== undefined && scopedReuseKey(x.row) !== scopedReuseKey(x.prev)).slice(-20).reverse();
  const changeRows = changes.map(({ row, prev }) => `| ${row.timestamp} | ${escapeHtml(providerKey(prev))} → ${escapeHtml(providerKey(row))} | \`${shortHash(reuseKey(prev))}\` → \`${shortHash(reuseKey(row))}\` | ${escapeHtml(describeFragmentDiff(prev, row))} | ${(row.providerPrefixChars ?? row.featureCacheablePrefixChars ?? row.stablePrefixChars ?? 0) - (prev.providerPrefixChars ?? prev.featureCacheablePrefixChars ?? prev.stablePrefixChars ?? 0)} | ${(row.totalPromptChars ?? 0) - (prev.totalPromptChars ?? 0)} | ${row.providerPrefixChars ?? row.featureCacheablePrefixChars ?? row.stablePrefixChars ?? 0} | ${row.stablePrefixChars ?? 0} | ${row.totalPromptChars ?? 0} |`).join("\n") || "| なし |  |  |  |  |  |  |  | |";
  const outputGate = summary.outputGateSavings;
  const outputGateByToolRows = Object.entries(outputGate.byTool)
    .sort((a, b) => b[1].bytes - a[1].bytes || b[1].count - a[1].count)
    .map(([tool, v]) => `| ${escapeHtml(tool)} | ${v.count} | ${formatBytes(v.bytes)} | ${formatPct(outputGate.totalBytes > 0 ? v.bytes / outputGate.totalBytes : null)} |`)
    .join("\n") || "| なし | 0 | 0 | n/a |";
  const overviewRows = renderMetricRows([
    ["requests in proxy log", summary.totalRequests],
    ["latest provider/model", latestProviderModel],
    ["最新 stablePrefixHash", latest ? `\`${shortHash(latest.stablePrefixHash)}\`` : "なし"],
    ["latest stable prefix chars", latest?.stablePrefixChars ?? 0],
    ["latest total prompt chars", latest?.totalPromptChars ?? 0],
    ["warnings", summary.warningCount],
    ["dynamic truncations (any stage)", summary.dynamicTruncationCount],
    ["dynamic tail truncations", summary.dynamicTailTruncationCount],
    ["dynamic fragment truncations", summary.dynamicFragmentTruncationCount],
    ["dynamic truncation omitted chars", summary.dynamicTruncationOmittedChars],
    ["output-gate externalized (count)", summary.outputGateSavings.count],
    ["output-gate externalized bytes", formatBytes(summary.outputGateSavings.totalBytes)],
    ["output-gate inline削減率", formatPct(summary.outputGateSavings.inlineReductionRate)],
    ["output-gate stub化率（閾値超過, 参考）", formatPct(summary.outputGateSavings.stubRate)],
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
  const dynamicTruncationRows = rows.filter(hasDynamicTruncation)
    .slice(-20)
    .reverse()
    .map((row) => `| ${row.timestamp} | ${escapeHtml(providerKey(row))} | ${dynamicTruncationStage(row)} | ${row.dynamicContextOriginalChars ?? 0} | ${row.dynamicContextRenderedChars ?? 0} | ${Math.max(0, (row.dynamicContextOriginalChars ?? 0) - (row.dynamicContextRenderedChars ?? 0))} | ${row.dynamicContextLimitChars ?? 0} | ${row.latestDynamicFragmentHashes?.map((f) => `${f.source}/${f.id}`).slice(0, 6).join(", ") ?? ""} |`)
    .join("\n") || "| なし |  |  |  |  |  |  |  |";
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

${renderRecentWindowComparison(summary, rows)}

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

${actualUnknownRoleNote}

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

${promptUnknownRoleNote}

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

Dynamic context is intentionally placed in the volatile tail, but very large dynamic tails still increase total input tokens and can lower request-level tokenHitRate. Dynamic context is bounded in two stages with distinct limits (see prompt-core/config.ts): a per-fragment render-side budget (DYNAMIC_FRAGMENT_BUDGET_CHARS) and a whole-tail snapshot-side cap (DYNAMIC_TAIL_MAX_CHARS). The **trim stage** column shows which stage(s) truncated each request so it is clear which limit applied.

| timestamp | provider/model | trim stage | original chars | rendered chars | omitted chars | limit chars | dynamic fragments |
|---|---|---|---:|---:|---:|---:|---|
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

## 11. Warning distribution

警告コード別分布と起因別集計です。直近窓（最新 ${summary.recentWindow.windowCapacity} リクエスト）を判断軸に、全期間を参考値として併記します。base system 起因（base system prompt 内の volatile signal / absolute path / available skills block）と fragment 起因（stable / semi-stable fragment 内の volatile value）を分離します。

### 11.1 By origin

| origin | recent window | all-time |
|---|---:|---:|
${renderWarningCategoryRows(summary.warningCategoriesRecent, summary.warningCategoriesAll)}

### 11.2 Top ${WARNING_BREAKDOWN_TOP_N} warning codes (recent window)

| code | severity | count |
|---|---|---:|
${renderWarningBreakdownRows(summary.warningBreakdownRecent)}

### 11.3 Top ${WARNING_BREAKDOWN_TOP_N} warning codes (all-time)

| code | severity | count |
|---|---|---:|
${renderWarningBreakdownRows(summary.warningBreakdownAll)}

## 12. Output-gate savings

output-gate は閾値（既定 48 KiB）を超える raw tool output を検索可能な artifact として外部化し、会話には小さな stub だけを残します。このセクションは context-ledger（\`.pi/mekann-context/events.v2.jsonl\`）の \`tool_result\` イベントから集計した削減量です。集計対象が 0 件の場合は output-gate が該当期間に稼働しなかったことを示します。

| metric | value |
|---|---:|
| 外部化件数 (count) | ${outputGate.count} |
| 外部化 bytes (total) | ${formatBytes(outputGate.totalBytes)} |
| 平均 bytes / 件 | ${outputGate.avgBytes === null ? "n/a" : formatBytes(outputGate.avgBytes)} |
| inline stub bytes (実測+推定) | ${formatBytes(outputGate.totalStubBytes)} |
| inline削減率（真の削減率） | ${formatPct(outputGate.inlineReductionRate)} |
| 実測 stub bytes / 件数 | ${formatBytes(outputGate.measuredStubBytes)} / ${outputGate.measuredStubEvents} |
| gate threshold (参考) | ${formatBytes(outputGate.thresholdBytes)} |
| stub化率（閾値超過削減率, 参考） | ${formatPct(outputGate.stubRate)} |
| 削減効果（閾値基準, 参考） | ${formatBytes(outputGate.savingsBeyondThresholdBytes)} |
| latest externalization | ${outputGate.latestTimestamp ?? "n/a"} |

**inline削減率** は外部化によって会話から実際に取り除かれた bytes の割合 \`(totalBytes - totalStubBytes) / totalBytes\` です。stub bytes はイベントに記録された実測値を使い、古いイベント（\`stub N bytes\` がないもの）は preview 既定値（\`${formatBytes(outputGate.fallbackStubBytes)}\`）で補完します。「実測 stub bytes / 件数」が件数に比べて少ないときは inline削減率が推定ベースになります。

**stub化率（閾値超過削減率）** は参考値です。\`(totalBytes - threshold×件数) / totalBytes\` で、閾値（\`${formatBytes(outputGate.thresholdBytes)}\`）起点の proxy です。外部化された出力の多くが閾値付近だと 0% に潰れるため、主指標としては inline削減率を参照してください。

### 12.1 By tool

| tool | externalized count | externalized bytes | share |
|---|---:|---:|---:|
${outputGateByToolRows}

## 13. Glossary

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
| output-gate savings | context-ledger の \`tool_result\` イベントから集計した、output-gate による tool output 外部化（stub 化）の件数・bytes です。 |
| inline削減率 | 外部化によって会話から取り除かれた bytes の割合 \`(totalBytes - totalStubBytes) / totalBytes\`。stub bytes は実測値を優先し、古いイベントは preview 既定値で補完。output-gate の主削減指標。 |
| stub化率（閾値超過削減率） | 参考値。\`(totalBytes - threshold×件数) / totalBytes\`。閾値起点の proxy で、閾値付近の出力が多いと 0% に潰れるため主指標ではない。 |
| totalPromptTokenEstimate | provider payload から抽出したテキスト（content/text/system 等）の文字数ベース token 推定。tool schema・JSON 構造・数値フィールドを含まず、provider 報告の inputTotalTokens より小さくなる。実 input tokens ではない。 |
`;
}

export async function readIfExists(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf8"); } catch { return ""; }
}

export type ReportArtifact = { fileName: string; content: string };

export function buildCacheFriendlyReportArtifacts(rows: ParsedLog[], actualRows: ParsedActualUsageLog[], generatedAt: string, outputGateEvents: OutputGateLedgerEvent[] = []): ReportArtifact[] {
  const summary = summarize(rows, actualRows, generatedAt, outputGateEvents);
  const artifacts: ReportArtifact[] = [
    { fileName: "summary.json", content: JSON.stringify(summary, null, 2) + "\n" },
    { fileName: "trend.svg", content: renderSvg(rows, MAX_POINTS) },
    { fileName: "trend-all.svg", content: renderSvg(rows, "all") },
    { fileName: "cacheability-score.svg", content: renderCacheabilitySvg(rows, MAX_POINTS) },
    { fileName: "cacheability-score-all.svg", content: renderCacheabilitySvg(rows, "all") },
    { fileName: "actual-hit-rate.svg", content: renderActualHitRateSvg(actualRows, MAX_POINTS, "actual provider cache hit rate: overall") },
    { fileName: "fragments.svg", content: renderFragmentsSvg(rows) },
    { fileName: "report.md", content: renderReport(summary, rows, actualRows) },
  ];
  for (const key of Object.keys(summary.actualByProvider)) {
    const groupRows = actualRows.filter((row) => actualProviderKey(row) === key);
    artifacts.push({ fileName: `actual-hit-rate-provider-${actualGraphSlug(key)}.svg`, content: renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate: ${key}`) });
  }
  for (const key of Object.keys(summary.actualByProviderModel)) {
    const groupRows = actualRows.filter((row) => actualProviderModelKey(row) === key);
    artifacts.push({ fileName: `actual-hit-rate-${actualGraphSlug(key)}.svg`, content: renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate: ${key}`) });
  }
  for (const key of Object.keys(summary.actualByRequestRole)) {
    const groupRows = actualRows.filter((row) => actualRequestRoleKey(row) === key);
    artifacts.push({ fileName: `actual-hit-rate-role-${actualGraphSlug(key)}.svg`, content: renderActualHitRateSvg(groupRows, MAX_POINTS, `actual provider cache hit rate by request role: ${key}`) });
  }
  for (const key of [...new Set(rows.map(requestRoleKey))]) {
    const groupRows = rows.filter((row) => requestRoleKey(row) === key);
    artifacts.push({ fileName: `trend-role-${actualGraphSlug(key)}.svg`, content: renderSvg(groupRows, MAX_POINTS) });
  }
  for (const key of [...new Set(rows.map((row) => row.provider ?? "unknown"))]) {
    const groupRows = rows.filter((row) => (row.provider ?? "unknown") === key);
    artifacts.push({ fileName: `trend-provider-${actualGraphSlug(key)}.svg`, content: renderSvg(groupRows, MAX_POINTS) });
  }
  for (const key of [...new Set(rows.map(providerKey))]) {
    const groupRows = rows.filter((row) => providerKey(row) === key);
    artifacts.push({ fileName: `trend-${actualGraphSlug(key)}.svg`, content: renderSvg(groupRows, MAX_POINTS) });
  }
  return artifacts;
}

export function buildCacheFriendlyReportArtifactsForTest(requestLogText: string, actualUsageLogText: string, generatedAt: string, outputGateEventsText = ""): ReportArtifact[] {
  return buildCacheFriendlyReportArtifacts(readRows(requestLogText), readActualRows(actualUsageLogText), generatedAt, readOutputGateEvents(outputGateEventsText));
}

export async function generateCacheFriendlyReport(dir: string): Promise<void> {
  try {
    const rows = readRows(await readIfExists(path.join(dir, "requests.jsonl")));
    const actualRows = readActualRows(await readIfExists(path.join(dir, "actual-usage.jsonl")));
    // dir is `<cwd>/.pi-cache-friendly`; the context-ledger lives under
    // `<cwd>/.pi/mekann-context/events.v2.jsonl`. Only the current generation is
    // read, matching how `requests.jsonl` is handled.
    const outputGateEvents = readOutputGateEvents(await readIfExists(path.join(path.dirname(dir), ".pi", "mekann-context", "events.v2.jsonl")));
    const artifacts = buildCacheFriendlyReportArtifacts(rows, actualRows, new Date().toISOString(), outputGateEvents);
    await Promise.all(artifacts.map((artifact) => fs.writeFile(path.join(dir, artifact.fileName), artifact.content, "utf8")));
  } catch { /* report generation must never break agent execution */ }
}
