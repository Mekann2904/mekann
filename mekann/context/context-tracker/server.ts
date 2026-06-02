import * as fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";
import type { CacheFriendlySummary, ActualProviderSummary } from "../../core/cache-friendly-prompt/reportTypes.js";
import { state, type ContextMonitorSample } from "./state.js";

// ─── helpers ─────────────────────────────────────────────────────

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

function html(res: http.ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function svg(res: http.ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtDelta(prev: number | undefined, cur: number): string {
  if (prev === undefined || !Number.isFinite(prev)) return "";
  const d = cur - prev;
  if (d === 0) return `<span class="dim">±0</span>`;
  const sign = d > 0 ? "+" : "";
  const cls = d > 0 ? "warn" : "ok";
  return `<span class="${cls}">${sign}${fmtBytes(d)}</span>`;
}

function fmtPct(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "n/a";
}

function esc(v: unknown): string {
  return String(v ?? "—").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
}

type ContextMonitorScope = { cwd?: string; sessionId?: string };

function currentScope(): ContextMonitorScope {
  const latest = state.samples.at(-1);
  return { cwd: latest?.cwd, sessionId: latest?.sessionId };
}

function scopedSamples(scope: ContextMonitorScope = currentScope()): ContextMonitorSample[] {
  return state.samples.filter((sample) => {
    if (scope.cwd && sample.cwd && sample.cwd !== scope.cwd) return false;
    if (scope.sessionId && sample.sessionId && sample.sessionId !== scope.sessionId) return false;
    return true;
  });
}

// ─── data access ─────────────────────────────────────────────────

/** Walk backwards to find the most recent known value for key. */
function latestVal(key: string): unknown {
  const samples = scopedSamples();
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i].summary?.[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

function prevVal(key: string): unknown {
  let seen = false;
  const samples = scopedSamples();
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i].summary?.[key];
    if (v !== undefined) {
      if (seen) return v;
      seen = true;
    }
  }
  return undefined;
}

function numLatest(key: string): number {
  const v = latestVal(key);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function numPrev(key: string): number {
  const v = prevVal(key);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// ─── contributors ────────────────────────────────────────────────

interface Contributor {
  label: string;
  bytes: number;
  pct: number;
}

function payloadBreakdown(): Contributor[] {
  const sys = numLatest("systemPromptBytes");
  const msg = numLatest("messageBytes");
  const lastResult = numLatest("resultBytes");
  const payload = numLatest("payloadBytes");
  const overhead = payload - sys - msg;
  const items: Contributor[] = [
    { label: "System prompt", bytes: sys, pct: 0 },
    { label: "Messages", bytes: msg, pct: 0 },
    { label: "Last tool result", bytes: lastResult, pct: 0 },
    { label: "Provider overhead", bytes: Math.max(0, overhead), pct: 0 },
  ].filter((c) => c.bytes > 0);
  const total = items.reduce((s, c) => s + c.bytes, 0) || 1;
  for (const c of items) c.pct = Math.round(c.bytes / total * 100);
  return items;
}

function toolOutputBreakdown(): Contributor[] {
  const map = new Map<string, number>();
  for (const s of scopedSamples()) {
    if (s.phase !== "tool_end") continue;
    const name = String(s.summary?.toolName ?? "?");
    const bytes = Number(s.summary?.resultBytes ?? 0);
    map.set(name, (map.get(name) ?? 0) + bytes);
  }
  const items: Contributor[] = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, bytes]) => ({ label, bytes, pct: 0 }));
  const total = items.reduce((s, c) => s + c.bytes, 0) || 1;
  for (const c of items) c.pct = Math.round(c.bytes / total * 100);
  return items;
}

// ─── alerts ──────────────────────────────────────────────────────

interface Alert {
  level: "warn" | "info";
  text: string;
}

interface OptimizationRecommendation {
  priority: "high" | "medium" | "low";
  action: string;
  expectedSavingsBytes: number;
  qualityRisk: "low" | "medium" | "high";
  reason: string;
}

function latestSampleWith(key: string): ContextMonitorSample | undefined {
  const samples = scopedSamples();
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].summary?.[key] !== undefined) return samples[i];
  }
  return undefined;
}

function contextWindowEstimate(): number | null {
  const tokens = Number(latestVal("contextTokens"));
  const percent = Number(latestVal("contextPercent"));
  if (!Number.isFinite(tokens) || !Number.isFinite(percent) || percent <= 0) return null;
  return Math.round(tokens / (percent / 100));
}

function growthRate() {
  const provider = scopedSamples().filter((s) => s.phase === "provider_request").slice(-8);
  if (provider.length < 2) return { tokensPerRequest: 0, payloadBytesPerRequest: 0 };
  const first = provider[0];
  const last = provider.at(-1)!;
  const n = provider.length - 1;
  return {
    tokensPerRequest: Math.round((Number(last.summary?.contextTokens ?? 0) - Number(first.summary?.contextTokens ?? 0)) / n),
    payloadBytesPerRequest: Math.round((Number(last.summary?.payloadBytes ?? 0) - Number(first.summary?.payloadBytes ?? 0)) / n),
  };
}

function topMessageItems(limit = 20) {
  const sample = latestSampleWith("messageBreakdown");
  const items = Array.isArray(sample?.summary?.messageBreakdown) ? sample!.summary.messageBreakdown as any[] : [];
  return items.slice(0, limit).map((m, index) => ({
    rank: index + 1,
    type: m.role ?? "message",
    source: m.source ?? m.role ?? "message",
    bytes: Number(m.bytes ?? 0),
    estimatedTokens: Math.ceil(Number(m.bytes ?? 0) / 4),
    policy: Number(m.bytes ?? 0) > 24 * 1024 ? "SUMMARIZE" : Number(m.bytes ?? 0) > 8 * 1024 ? "RETRIEVE" : "KEEP",
    reason: Number(m.bytes ?? 0) > 24 * 1024 ? "Large message or tool result dominates live context" : "Within normal per-item budget",
  }));
}

function topContributors(limit = 12) {
  const payloadItems = payloadBreakdown().map((c) => ({
    type: "payload_component",
    source: c.label,
    bytes: c.bytes,
    percent: c.pct,
    action: c.label === "Messages" && c.pct > 60 ? "classify_recent_messages_and_summarize_low_value_items" : c.label === "System prompt" && c.pct > 25 ? "audit_system_prompt_and_lazy_load_optional_guidance" : "watch",
  }));
  const toolItems = toolOutputBreakdown().map((c) => ({
    type: "tool_output_cumulative",
    source: c.label,
    bytes: c.bytes,
    percent: c.pct,
    action: c.bytes > 48 * 1024 ? "store_raw_output_externally_and_retrieve_snippets" : "watch",
  }));
  const messageItems = topMessageItems(limit).map((m) => ({
    type: "message_item",
    source: m.source,
    bytes: m.bytes,
    percent: 0,
    action: m.policy === "SUMMARIZE" ? "replace_with_summary_or_external_reference" : "watch",
  }));
  return [...payloadItems, ...toolItems, ...messageItems]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map((c, i) => ({ rank: i + 1, ...c }));
}

function computeHealthScore(): { score: number; risk: "low" | "medium" | "high" | "critical"; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];
  const percent = Number(latestVal("contextPercent"));
  const breakdown = payloadBreakdown();
  const msgPct = breakdown.find((c) => c.label === "Messages")?.pct ?? 0;
  const sysPct = breakdown.find((c) => c.label === "System prompt")?.pct ?? 0;
  const growth = growthRate();
  const lastResultBytes = numLatest("resultBytes");

  if (Number.isFinite(percent)) {
    if (percent > 85) { score -= 45; reasons.push("Context is near overflow."); }
    else if (percent > 70) { score -= 30; reasons.push("Context pressure is high."); }
    else if (percent > 45) { score -= 15; reasons.push("Context pressure is rising."); }
  }
  if (msgPct > 75) { score -= 12; reasons.push("Messages dominate payload; retention classification is recommended."); }
  if (sysPct > 30) { score -= 10; reasons.push("System prompt occupies a large share; audit always-on instructions."); }
  if (growth.tokensPerRequest > 5000 || growth.payloadBytesPerRequest > 24 * 1024) { score -= 12; reasons.push("Recent growth rate is high."); }
  if (lastResultBytes > 64 * 1024) { score -= 10; reasons.push("Last tool result is large and should be summarized or externalized."); }
  score = Math.max(0, Math.min(100, score));
  const risk = score < 35 ? "critical" : score < 55 ? "high" : score < 75 ? "medium" : "low";
  if (reasons.length === 0) reasons.push("No immediate context pressure detected.");
  return { score, risk, reasons };
}

function recommendations(): OptimizationRecommendation[] {
  const recs: OptimizationRecommendation[] = [];
  const breakdown = payloadBreakdown();
  const msg = breakdown.find((c) => c.label === "Messages");
  const sys = breakdown.find((c) => c.label === "System prompt");
  const largestMessage = topMessageItems(1)[0];
  const toolTotal = toolOutputBreakdown().reduce((s, c) => s + c.bytes, 0);
  const health = computeHealthScore();

  if (largestMessage && largestMessage.bytes > 24 * 1024) recs.push({ priority: "high", action: "summarize_largest_message_item", expectedSavingsBytes: Math.round(largestMessage.bytes * 0.75), qualityRisk: "low", reason: `Largest message item is ${fmtBytes(largestMessage.bytes)}.` });
  if (msg && msg.pct > 65) recs.push({ priority: "medium", action: "classify_message_retention", expectedSavingsBytes: Math.round(msg.bytes * 0.25), qualityRisk: "medium", reason: `Messages are ${msg.pct}% of payload.` });
  if (toolTotal > 64 * 1024) recs.push({ priority: "medium", action: "externalize_tool_outputs", expectedSavingsBytes: Math.round(toolTotal * 0.5), qualityRisk: "low", reason: `Cumulative tool output is ${fmtBytes(toolTotal)}.` });
  if (sys && sys.pct > 25) recs.push({ priority: "low", action: "audit_system_prompt", expectedSavingsBytes: Math.round(sys.bytes * 0.15), qualityRisk: "medium", reason: `System prompt is ${sys.pct}% of payload.` });
  if (health.risk === "high" || health.risk === "critical") recs.push({ priority: "high", action: "trigger_targeted_compaction", expectedSavingsBytes: Math.round(numLatest("messageBytes") * 0.45), qualityRisk: "medium", reason: `Health risk is ${health.risk}.` });
  if (recs.length === 0) recs.push({ priority: "low", action: "no_action_monitor_only", expectedSavingsBytes: 0, qualityRisk: "low", reason: "Context pressure is low; keep monitoring." });
  return recs;
}

export function getContextIntelligenceReport(action = "report", limit = 20, scope: ContextMonitorScope = currentScope()) {
  const latest = scopedSamples(scope).at(-1) ?? null;
  const health = computeHealthScore();
  const growth = growthRate();
  const base = {
    generatedAt: Date.now(),
    action,
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    health,
    context: {
      tokens: latestVal("contextTokens") ?? null,
      window: contextWindowEstimate(),
      percent: latestVal("contextPercent") ?? null,
      payloadBytes: numLatest("payloadBytes"),
      messageBytes: numLatest("messageBytes"),
      systemPromptBytes: numLatest("systemPromptBytes"),
    },
    growth,
    alerts: computeAlerts(),
    compactions: { count: state.compactionCount, lastAt: state.lastCompactionAt ?? null },
  };
  if (action === "health") return base;
  if (action === "top_contributors") return { ...base, topContributors: topContributors(limit), topMessages: topMessageItems(limit) };
  if (action === "timeline") return { ...base, timeline: scopedSamples(scope).slice(-limit) };
  if (action === "recommendations") return { ...base, recommendations: recommendations() };
  if (action === "budget") return { ...base, budget: { systemPromptPctTarget: 15, recentMessagesPctTarget: 35, summariesPctTarget: 15, toolResultsPctTarget: 20, retrievedContextPctTarget: 10, reservePctTarget: 5 }, actualBreakdown: payloadBreakdown() };
  return { ...base, topContributors: topContributors(limit), recommendations: recommendations(), payloadBreakdown: payloadBreakdown(), toolOutputBreakdown: toolOutputBreakdown(), topMessages: topMessageItems(limit) };
}

export function recordContextDecision(decision: unknown): void {
  state.decisions.push({ at: Date.now(), decision });
  if (state.decisions.length > 100) state.decisions.splice(0, state.decisions.length - 100);
}

function computeAlerts(): Alert[] {
  const a: Alert[] = [];
  const tokens = numLatest("contextTokens");
  const percent = Number(latestVal("contextPercent"));
  const prevTokens = numPrev("contextTokens");
  const payload = numLatest("payloadBytes");
  const prevPayload = numPrev("payloadBytes");
  const resultBytes = numLatest("resultBytes");
  const pendingResults = numLatest("pendingResults");

  if (Number.isFinite(percent) && percent > 80) a.push({ level: "warn", text: `Tokens at ${percent}% of context window` });
  if (resultBytes > 50 * 1024) a.push({ level: "warn", text: `Last tool result ${fmtBytes(resultBytes)} exceeds 50 KB` });
  if (prevPayload > 0 && payload > prevPayload * 1.3) a.push({ level: "info", text: `Payload grew ${Math.round((payload / prevPayload - 1) * 100)}% this turn` });
  if (prevTokens > 0 && tokens > prevTokens * 1.2) a.push({ level: "info", text: `Token estimate grew ${Math.round((tokens / prevTokens - 1) * 100)}%` });
  if (pendingResults > 5) a.push({ level: "warn", text: `${pendingResults} pending subagent results` });

  return a;
}

// ─── HTML dashboard ──────────────────────────────────────────────

function payloadTrendBars(): string {
  const last20 = scopedSamples().filter((s) => s.phase === "provider_request").slice(-20);
  if (last20.length === 0) return '<span class="dim">No data</span>';
  const max = Math.max(...last20.map((s) => Number(s.summary?.payloadBytes ?? 0)), 1);
  return last20
    .map((s) => {
      const b = Number(s.summary?.payloadBytes ?? 0);
      const h = Math.max(1, Math.round(b / max * 80));
      const pct = max > 0 ? Math.round(b / max * 100) : 0;
      return `<div class="trend-bar" title="${fmtBytes(b)}"><span style="height:${h}px"></span><small>${pct}%</small></div>`;
    })
    .join("");
}

function toolSchemaTable(): string {
  const tools = [...state.tools.values()].sort((a, b) => b.schemaBytes - a.schemaBytes).slice(0, 15);
  if (tools.length === 0) return '<span class="dim">No tool schemas recorded</span>';
  const max = Math.max(...tools.map((t) => t.schemaBytes), 1);
  return `<table><thead><tr><th>Tool</th><th>Schema bytes</th><th></th></tr></thead><tbody>${tools
    .map((t) => `<tr><td>${esc(t.name)}</td><td>${fmtBytes(t.schemaBytes)}</td><td><div class="bar flat"><span style="width:${Math.max(1, Math.round(t.schemaBytes / max * 100))}%"></span></div></td></tr>`)
    .join("")}</tbody></table>`;
}

function latestCacheableContextSample(): ContextMonitorSample | undefined {
  const samples = scopedSamples();
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].phase === "cacheable_context") return samples[i];
  }
  return undefined;
}

function cacheableContextTable(): string {
  const sample = latestCacheableContextSample();
  if (!sample) return '<span class="dim">No cacheable-context sample yet</span>';
  const s = sample.summary;
  const fragments = Array.isArray(s.fragments) ? s.fragments as any[] : [];
  return `<table><tbody>
<tr><td>Prefix</td><td class="accent">${fmtBytes(Number(s.prefixChars ?? 0))}</td></tr>
<tr><td>Mode</td><td>${esc(s.contextMode)} / ${esc(s.promptSurface)}</td></tr>
<tr><td>Fragments</td><td>${esc(s.fragmentCount)} (${esc(String(s.fragmentOrder ?? ""))})</td></tr>
<tr><td>Max prefix</td><td>${fmtBytes(Number(s.maxPrefixChars ?? 0))}</td></tr>
<tr><td>Hash</td><td class="dim">${esc(String(s.prefixHash ?? "").slice(0, 26))}${s.prefixHash ? "…" : ""}</td></tr>
</tbody></table>
${fragments.length === 0 ? "" : `<div class="spacer"></div><table><thead><tr><th>Fragment</th><th>Source</th><th>Size</th></tr></thead><tbody>${fragments.map((f) => `<tr><td>${esc(f.id)}</td><td class="dim">${esc(f.source)}</td><td>${fmtBytes(Number(f.chars ?? 0))}</td></tr>`).join("")}</tbody></table>`}`;
}

function dashboardStyle(): string {
  return `:root{--bg:#1a1b26;--surface:#24283b;--border:#3b4261;--text:#c0caf5;--dim:#565f89;--accent:#7aa2f7;--cyan:#7dcfff;--green:#9ece6a;--red:#f7768e;--orange:#ff9e64;--purple:#bb9af7;--heading:#c0caf5}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5}
main{max-width:1280px;margin:0 auto;padding:24px}
h1{font-size:20px;font-weight:600;color:var(--heading);margin-bottom:4px}
h2{font-size:14px;font-weight:600;color:var(--heading);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.sub{color:var(--dim);font-size:12px;margin-bottom:20px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:0;padding:16px}
.panel h2{margin-top:0}
.graph{width:100%;background:#0f172a;border:1px solid var(--border);display:block}
.metric{font-size:24px;font-weight:700;color:var(--accent)}
.metric .delta{font-size:12px;font-weight:400;margin-left:6px}
.label{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:12px}
td,th{padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--dim);font-weight:600;font-size:11px}
.bar{height:8px;background:#1e2030;border-radius:0;overflow:hidden;min-width:60px}
.bar span{display:block;height:100%;background:var(--accent)}
.trend-bar{display:inline-flex;flex-direction:column;align-items:center;width:18px;margin-right:2px;vertical-align:bottom}
.trend-bar span{display:block;width:12px;background:var(--accent)}
.trend-bar small{font-size:9px;color:var(--dim);margin-top:2px}
.legend{display:flex;gap:12px;margin-bottom:8px;font-size:11px}
.legend span{display:inline-flex;align-items:center;gap:4px}
.legend i{display:inline-block;width:10px;height:10px;border:1px solid var(--border)}
.tag{display:inline-block;border:1px solid var(--border);padding:2px 6px;margin:2px;font-size:11px;color:var(--text)}
.alert{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.alert:last-child{border-bottom:none}
.alert .icon{font-weight:700}
.alert.warn .icon{color:var(--orange)}
.alert.info .icon{color:var(--accent)}
.warn{color:var(--orange)}
.ok{color:var(--green)}
.dim{color:var(--dim)}
.accent{color:var(--accent)}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline}
.nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.nav a{border:1px solid var(--border);padding:6px 10px;background:var(--surface)}
.card-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.card-list .panel{display:block;color:var(--text)}
.card-list .panel strong{display:block;color:var(--heading);font-size:15px;margin-bottom:6px}
.spacer{height:20px}
@media(max-width:900px){.grid2,.grid3,.grid4{grid-template-columns:1fr}}`;
}

function cacheFriendlyDirForDashboard(scope: ContextMonitorScope = currentScope()): string {
  const cwd = scopedSamples(scope).at(-1)?.cwd ?? process.cwd();
  return path.join(cwd, ".pi-cache-friendly");
}

async function readCacheEfficiencySummary(scope: ContextMonitorScope = currentScope()): Promise<{ dir: string; summary: CacheFriendlySummary | null }> {
  const dir = cacheFriendlyDirForDashboard(scope);
  try {
    return { dir, summary: JSON.parse(await fs.readFile(path.join(dir, "summary.json"), "utf8")) as CacheFriendlySummary };
  } catch {
    return { dir, summary: null };
  }
}

async function readCacheEfficiencySvg(name: string, scope: ContextMonitorScope = currentScope()): Promise<string | null> {
  if (!/^[a-z0-9][a-z0-9-]*\.svg$/i.test(name)) return null;
  try { return await fs.readFile(path.join(cacheFriendlyDirForDashboard(scope), name), "utf8"); } catch { return null; }
}

function graphImg(name: string, alt: string): string {
  return `<img class="graph" src="/cache-efficiency/artifacts/${encodeURIComponent(name)}" alt="${esc(alt)}">`;
}

function webNav(): string {
  return `<nav class="nav"><a href="/">Home</a><a href="/dashboard">Context Monitor</a><a href="/cache-efficiency">Cache Efficiency</a><a href="/snapshot">Snapshot</a><a href="/events">Events</a><a href="/tools">Tools</a><a href="/llm/context-report">LLM Report</a><a href="/health">Health</a></nav>`;
}

function renderHome(): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mekann Web UI</title><style>${dashboardStyle()}</style></head><body><main>
${webNav()}
<h1>Mekann Web UI</h1>
<div class="sub">context control plane pages and JSON endpoints</div>
<div class="card-list">
<a class="panel" href="/dashboard"><strong>Context Monitor</strong><span class="dim">Live context pressure, prompt payload, tools, alerts, and recent events.</span></a>
<a class="panel" href="/cache-efficiency"><strong>Cache Efficiency</strong><span class="dim">Provider cache hit rate, prefix reuse, and cache-friendly prompt telemetry.</span></a>
<a class="panel" href="/snapshot"><strong>Snapshot JSON</strong><span class="dim">Current monitor state, alerts, context intelligence, and decisions.</span></a>
<a class="panel" href="/events"><strong>Events JSON</strong><span class="dim">Recorded context monitor samples.</span></a>
<a class="panel" href="/tools"><strong>Tools JSON</strong><span class="dim">Registered tool schema sizes and total tool schema weight.</span></a>
<a class="panel" href="/llm/context-report"><strong>LLM Context Report</strong><span class="dim">Context intelligence report endpoint for agents and humans.</span></a>
</div>
</main></body></html>`;
}

function actualRows(summaryByKey: Record<string, ActualProviderSummary> | undefined, limit = 10): string {
  const entries = Object.entries(summaryByKey ?? {}).sort((a, b) => b[1].inputTotalTokens - a[1].inputTotalTokens || b[1].requests - a[1].requests).slice(0, limit);
  if (entries.length === 0) return '<span class="dim">No actual usage data</span>';
  return `<table><thead><tr><th>Key</th><th>Req</th><th>Input</th><th>Read</th><th>Write</th><th>Miss</th><th>Hit</th><th>Cacheable read</th></tr></thead><tbody>${entries.map(([key, v]) => `<tr><td>${esc(key)}</td><td>${v.requests}</td><td>${esc(v.inputTotalTokens)}</td><td>${esc(v.cacheReadTokens)}</td><td>${esc(v.cacheWriteTokens)}</td><td>${esc(v.cacheMissTokens)}</td><td class="accent">${fmtPct(v.weightedTokenHitRate)}</td><td>${fmtPct(v.weightedCacheableReadRate)}</td></tr>`).join("")}</tbody></table>`;
}

async function renderCacheEfficiencyDashboard(scope: ContextMonitorScope = currentScope()): Promise<string> {
  const { dir, summary } = await readCacheEfficiencySummary(scope);
  if (!summary) {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cache Efficiency — Mekann</title><style>${dashboardStyle()}</style></head><body><main>${webNav()}<h1>Cache Efficiency</h1><div class="sub">actual provider cache hit rate — live update 5s</div><div class="panel"><h2>No data yet</h2><p class="dim">${esc(path.join(dir, "summary.json"))} がまだありません。cache-friendly-prompt telemetry が 1 回以上記録されると表示されます。</p></div></main></body></html>`;
  }
  const latest = summary.latest;
  const hit = summary.actualTokenHitRateWeighted;
  const warmHit = summary.actualWarmTokenHitRateWeighted;
  const coldHit = summary.actualColdTokenHitRateWeighted;
  const proxy = summary.windowPrefixReuseRate;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cache Efficiency — Mekann</title><style>${dashboardStyle()}</style></head><body><main>
${webNav()}
<h1>Cache Efficiency</h1>
<div class="sub">actual provider cache hit rate — live update 5s — ${esc(dir)} — generated ${esc(summary.generatedAt)}</div>
<h2>Realtime metrics</h2>
<div class="grid4">
<div class="panel"><div class="label">Weighted token hit rate</div><div class="metric">${fmtPct(hit)}</div><div class="sub">cacheReadTokens / inputTotalTokens</div></div>
<div class="panel"><div class="label">Warm hit rate</div><div class="metric">${fmtPct(warmHit)}</div><div class="sub">${summary.actualWarmRequestCount} warm requests</div></div>
<div class="panel"><div class="label">Cold hit rate</div><div class="metric">${fmtPct(coldHit)}</div><div class="sub">${summary.actualColdRequestCount} cold requests</div></div>
<div class="panel"><div class="label">Prefix reuse proxy</div><div class="metric">${fmtPct(proxy)}</div><div class="sub">latest 50 window</div></div>
</div>
<h2>Token totals</h2>
<div class="grid4">
<div class="panel"><div class="label">Actual requests</div><div class="metric">${summary.actualRequestCount}</div><div class="sub">correlated ${summary.actualMatchedRequestCount}</div></div>
<div class="panel"><div class="label">Input tokens</div><div class="metric">${summary.actualInputTotalTokens}</div><div class="sub">provider usage</div></div>
<div class="panel"><div class="label">Cache read</div><div class="metric">${summary.actualCacheReadTokens}</div><div class="sub">reused tokens</div></div>
<div class="panel"><div class="label">Cache miss/write</div><div class="metric">${summary.actualCacheMissTokens}</div><div class="sub">write ${summary.actualCacheWriteTokens}</div></div>
</div>
<div class="spacer"></div>
<div class="grid2">
<div class="panel"><h2>Latest prefix</h2><table><tbody><tr><td>Provider/model</td><td class="accent">${esc(`${latest?.provider ?? "unknown"}/${latest?.model ?? "unknown"}`)}</td></tr><tr><td>Stable prefix hash</td><td class="dim">${esc(String(latest?.stablePrefixHash ?? "").slice(0, 12))}</td></tr><tr><td>Stable chars</td><td>${esc(latest?.stablePrefixChars ?? 0)}</td></tr><tr><td>Total prompt chars</td><td>${esc(latest?.totalPromptChars ?? 0)}</td></tr></tbody></table></div>
<div class="panel"><h2>Proxy stability</h2><table><tbody><tr><td>Adjacent reuse rate</td><td class="accent">${fmtPct(summary.adjacentPrefixReuseRate)}</td></tr><tr><td>Same key streak</td><td>${summary.recentSameReuseKeyStreak} requests</td></tr><tr><td>Provider prefix hash changes</td><td>${summary.providerPrefixHashChanges}</td></tr><tr><td>Warnings</td><td>${summary.warningCount}</td></tr></tbody></table></div>
</div>
<div class="spacer"></div>
<h2>Actual provider cache hit rate</h2>
<div class="panel">${graphImg("actual-hit-rate.svg", "actual provider cache hit rate overall")}</div>
<div class="spacer"></div>
<h2>Prefix continuity proxy</h2>
<div class="panel">${graphImg("cacheability-score.svg", "prefix continuity proxy")}</div>
<div class="spacer"></div>
<h2>Prompt size trends</h2>
<div class="grid2"><div class="panel">${graphImg("trend.svg", "prompt size trend")}</div><div class="panel">${graphImg("fragments.svg", "fragment size chart")}</div></div>
<div class="spacer"></div>
<h2>By provider/model</h2><div class="panel">${actualRows(summary.actualByProviderModel)}</div>
<div class="spacer"></div>
<h2>By request role</h2><div class="panel">${actualRows(summary.actualByRequestRole)}</div>
<div class="spacer"></div>
<h2>By provider prefix hash</h2><div class="panel">${actualRows(summary.actualByProviderPrefixHash)}</div>
<p class="sub" style="margin-top:20px">JSON: <a href="/cache-efficiency/snapshot">/cache-efficiency/snapshot</a> / Existing report: <a href="/snapshot">/snapshot</a></p>
</main><script>(()=>{async function refresh(){try{const r=await fetch(location.pathname+'?partial=1',{cache:'no-store'});if(!r.ok)return;const h=await r.text();const d=new DOMParser().parseFromString(h,'text/html');const n=d.querySelector('main')?.innerHTML??'';const m=document.querySelector('main');if(n&&m&&n!==m.innerHTML){const y=scrollY;m.innerHTML=n;scrollTo({top:y,behavior:'instant'});}}catch{}}setInterval(refresh,5000);})();</script></body></html>`;
}

function renderDashboard(scope: ContextMonitorScope = currentScope()): string {
  const latest = scopedSamples(scope).at(-1);
  const tokens = latestVal("contextTokens");
  const percent = latestVal("contextPercent");
  const payload = numLatest("payloadBytes");
  const msgCount = latestVal("messageCount");
  const msgBytes = numLatest("messageBytes");
  const toolCount = latestVal("toolCount");
  const toolNames = latestVal("tools");
  const names: string[] = Array.isArray(toolNames) ? toolNames : [];
  const sysBytes = numLatest("systemPromptBytes");
  const breakdown = payloadBreakdown();
  const outputBreakdown = toolOutputBreakdown();
  const alerts = computeAlerts();
  const samples = scopedSamples().slice(-50).reverse();
  const totalTools = state.tools.size;
  const schemaTotal = state.toolSchemaTotalBytes;
  const compactions = state.compactionCount;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Context Monitor — Mekann</title><style>${dashboardStyle()}</style></head><body><main>
${webNav()}
<h1>Context Monitor</h1>
<div class="sub">live context pressure — live update 2s — samples ${scopedSamples().length} — tools ${totalTools} — compactions ${compactions}</div>

<h2>Realtime metrics</h2>
<div class="grid4">
<div class="panel"><div class="label">Context tokens</div><div class="metric">${esc(tokens ?? "—")}${fmtDelta(numPrev("contextTokens"), Number(tokens)) ? `<span class="delta">${fmtDelta(numPrev("contextTokens"), Number(tokens))}</span>` : ""}</div><div class="sub">${percent !== undefined ? `${esc(percent)}%` : "estimate"}</div></div>
<div class="panel"><div class="label">Payload size</div><div class="metric">${fmtBytes(payload)}${fmtDelta(numPrev("payloadBytes"), payload) ? `<span class="delta">${fmtDelta(numPrev("payloadBytes"), payload)}</span>` : ""}</div><div class="sub">latest provider request</div></div>
<div class="panel"><div class="label">Messages</div><div class="metric">${esc(msgCount ?? "—")}</div><div class="sub">${fmtBytes(msgBytes)} total</div></div>
<div class="panel"><div class="label">Active tools</div><div class="metric">${esc((toolCount ?? names.length) || "—")}</div><div class="sub">schema ${fmtBytes(schemaTotal)}</div></div>
</div>

<h2>Payload breakdown</h2>
<div class="grid2">
<div class="panel">
<div class="legend">${breakdown.map((c, i) => `<span><i style="background:${i === 0 ? "var(--accent)" : i === 1 ? "var(--green)" : i === 2 ? "var(--orange)" : "var(--dim)"}"></i>${esc(c.label)}</span>`).join("")}</div>
${breakdown.map((c, i) => {
    const color = i === 0 ? "var(--accent)" : i === 1 ? "var(--green)" : i === 2 ? "var(--orange)" : "var(--dim)";
    return `<div class="bar" style="margin-bottom:4px"><span style="width:${Math.max(1, c.pct)}%;background:${color}"></span></div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px"><span>${esc(c.label)}</span><span>${fmtBytes(c.bytes)} (${c.pct}%)</span></div>`;
  }).join("") || '<span class="dim">No data</span>'}
</div>
<div class="panel">
<h2>System prompt detail</h2>
<table><tbody>
<tr><td>System prompt</td><td class="accent">${fmtBytes(sysBytes)}</td></tr>
<tr><td>Tool schemas</td><td>${fmtBytes(schemaTotal)} (${totalTools} tools)</td></tr>
<tr><td>Messages</td><td>${fmtBytes(msgBytes)} (${esc(msgCount ?? "?")} messages)</td></tr>
<tr><td>Payload total</td><td class="accent">${fmtBytes(payload)}</td></tr>
</tbody></table>
</div>
</div>

<h2>Cacheable context</h2>
<div class="panel">
${cacheableContextTable()}
</div>

<h2>Tool impact</h2>
<div class="grid2">
<div class="panel">
<h2>Schema weight</h2>
${toolSchemaTable()}
</div>
<div class="panel">
<h2>Output weight (cumulative)</h2>
${outputBreakdown.length === 0 ? '<span class="dim">No tool output data</span>' : `<table><thead><tr><th>Tool</th><th>Output</th><th></th></tr></thead><tbody>${outputBreakdown.map((c) => `<tr><td>${esc(c.label)}</td><td>${fmtBytes(c.bytes)}</td><td><div class="bar"><span style="width:${Math.max(1, c.pct)}%"></span></div></td></tr>`).join("")}</tbody></table>`}
</div>
</div>

<div class="spacer"></div>

<h2>Payload trend (last 20 provider requests)</h2>
<div class="panel">
<div style="display:flex;align-items:flex-end;height:90px;gap:1px;padding:4px 0">
${payloadTrendBars()}
</div>
</div>

<div class="spacer"></div>

<div class="grid2">
<div class="panel">
<h2>Alerts</h2>
${alerts.length === 0 ? '<span class="dim">All clear</span>' : alerts.map((a) => `<div class="alert ${a.level}"><span class="icon">${a.level === "warn" ? "!" : "i"}</span><span>${esc(a.text)}</span></div>`).join("")}
</div>
<div class="panel">
<h2>Active tools</h2>
${names.length === 0 ? '<span class="dim">No tool sample yet</span>' : names.map((n) => `<span class="tag">${esc(n)}</span>`).join(" ")}
</div>
</div>

<div class="spacer"></div>

<h2>Recent events</h2>
<div class="panel">
<table><thead><tr><th>Time</th><th>Phase</th><th>Tokens</th><th>Size</th><th>Detail</th></tr></thead><tbody>
${samples.map((s) => {
    const detail = s.phase === "tool_end" ? esc(s.summary?.toolName ?? "") : s.phase === "provider_request" ? fmtBytes(Number(s.summary?.payloadBytes ?? 0)) : s.phase === "context" ? `${esc(s.summary?.messageCount ?? "?")} msgs` : "";
    return `<tr><td>${new Date(s.at).toLocaleTimeString()}</td><td>${esc(s.phase)}</td><td>${esc(s.summary?.contextTokens ?? "—")}</td><td>${fmtBytes(Number(s.summary?.payloadBytes ?? s.summary?.messageBytes ?? s.summary?.systemPromptBytes ?? s.summary?.resultBytes ?? 0))}</td><td class="dim">${detail}</td></tr>`;
  }).join("")}
</tbody></table>
</div>

<p class="sub" style="margin-top:20px">Pages: <a href="/cache-efficiency">/cache-efficiency</a> / JSON: <a href="/snapshot">/snapshot</a> <a href="/events">/events</a> <a href="/tools">/tools</a> <a href="/health">/health</a></p>
</main><script>
(() => {
  let last = document.querySelector('main')?.innerHTML ?? '';
  async function refresh() {
    try {
      const res = await fetch(location.pathname + '?partial=1', { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.querySelector('main')?.innerHTML ?? '';
      if (next && next !== last) {
        const y = window.scrollY;
        const main = document.querySelector('main');
        if (main) main.innerHTML = next;
        window.scrollTo({ top: y, behavior: 'instant' });
        last = next;
      }
    } catch {}
  }
  setInterval(refresh, 2000);
})();
</script></body></html>`;
}

// ─── public api ──────────────────────────────────────────────────

export function recordContextMonitorSample(sample: Omit<ContextMonitorSample, "id" | "at"> & { at?: number }): ContextMonitorSample {
  const stored: ContextMonitorSample = { id: state.nextId++, at: sample.at ?? Date.now(), cwd: sample.cwd, sessionId: sample.sessionId, phase: sample.phase, summary: sample.summary };
  state.samples.push(stored);
  if (state.samples.length > 500) state.samples.splice(0, state.samples.length - 500);
  return stored;
}

export function recordToolSchema(name: string, schemaBytes: number): void {
  if (state.tools.has(name)) return; // first registration wins
  state.tools.set(name, { name, schemaBytes, registeredAt: Date.now() });
  state.toolSchemaTotalBytes += schemaBytes;
}

export function recordCompaction(): void {
  state.compactionCount++;
  state.lastCompactionAt = Date.now();
}

export function getContextMonitorSnapshot(scope: ContextMonitorScope = currentScope()) {
  return {
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    latest: scopedSamples(scope).at(-1) ?? null,
    cacheableContext: latestCacheableContextSample()?.summary ?? null,
    sampleCount: scopedSamples(scope).length,
    tools: [...state.tools.values()],
    compactionCount: state.compactionCount,
    lastCompactionAt: state.lastCompactionAt ?? null,
    alerts: computeAlerts(),
    payloadBreakdown: payloadBreakdown(),
    toolOutputBreakdown: toolOutputBreakdown(),
    contextIntelligence: getContextIntelligenceReport("report", 10, scope),
    decisions: state.decisions.slice(-20),
  };
}

export async function ensureContextMonitorServer(preferredPort = 0): Promise<{ port: number; url: string; reused: boolean }> {
  if (state.server?.listening && state.port) return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: true };

  state.server = http.createServer((req, res) => {
    void (async () => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const scope = currentScope();
    if (url.pathname === "/") return html(res, renderHome());
    if (url.pathname === "/dashboard") return html(res, renderDashboard(scope));
    if (url.pathname === "/cache-efficiency") return html(res, await renderCacheEfficiencyDashboard(scope));
    if (url.pathname === "/cache-efficiency/snapshot") return json(res, 200, await readCacheEfficiencySummary(scope));
    if (url.pathname.startsWith("/cache-efficiency/artifacts/")) {
      const name = decodeURIComponent(url.pathname.slice("/cache-efficiency/artifacts/".length));
      const body = await readCacheEfficiencySvg(name, scope);
      if (body !== null) return svg(res, body);
      return json(res, 404, { error: "not_found" });
    }
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname === "/snapshot") return json(res, 200, getContextMonitorSnapshot(scope));
    if (url.pathname === "/events") return json(res, 200, { samples: scopedSamples(scope) });
    if (url.pathname === "/tools") return json(res, 200, { tools: [...state.tools.values()], totalBytes: state.toolSchemaTotalBytes });
    if (url.pathname === "/llm/context-report") return json(res, 200, getContextIntelligenceReport(String(url.searchParams.get("action") ?? "report"), Number(url.searchParams.get("limit") ?? 20), scope));
    if (url.pathname === "/llm/context-health") return json(res, 200, getContextIntelligenceReport("health", 20, scope));
    if (url.pathname === "/llm/context-top-contributors") return json(res, 200, getContextIntelligenceReport("top_contributors", Number(url.searchParams.get("limit") ?? 20), scope));
    if (url.pathname === "/llm/context-timeline") return json(res, 200, getContextIntelligenceReport("timeline", Number(url.searchParams.get("limit") ?? 50), scope));
    if (url.pathname === "/llm/context-recommendations") return json(res, 200, getContextIntelligenceReport("recommendations", 20, scope));
    if (url.pathname === "/llm/context-budget") return json(res, 200, getContextIntelligenceReport("budget", 20, scope));
    if (url.pathname === "/llm/context-decision" && req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body: unknown = text;
        try { body = JSON.parse(text); } catch {}
        recordContextDecision(body);
        json(res, 200, { ok: true });
      });
      return;
    }
    return json(res, 404, { error: "not_found", endpoints: ["/", "/dashboard", "/cache-efficiency", "/cache-efficiency/snapshot", "/health", "/snapshot", "/events", "/tools", "/llm/context-report", "/llm/context-recommendations"] });
    })().catch((error) => json(res, 500, { error: "internal_error", message: String(error?.message ?? error) }));
  });
  state.server.unref();

  await new Promise<void>((resolve, reject) => {
    state.server!.once("error", reject);
    state.server!.listen(preferredPort, "127.0.0.1", () => resolve());
  });
  state.port = (state.server.address() as AddressInfo).port;
  return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: false };
}
