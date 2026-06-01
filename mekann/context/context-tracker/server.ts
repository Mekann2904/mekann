import http from "node:http";
import type { AddressInfo } from "node:net";

// ─── types ───────────────────────────────────────────────────────

export interface ToolSchemaRecord {
  name: string;
  schemaBytes: number;
  registeredAt: number;
}

export interface ContextMonitorSample {
  id: number;
  at: number;
  cwd?: string;
  sessionId?: string;
  phase: string;
  summary: Record<string, unknown>;
}

interface ContextMonitorState {
  server?: http.Server;
  port?: number;
  samples: ContextMonitorSample[];
  tools: Map<string, ToolSchemaRecord>;
  toolSchemaTotalBytes: number;
  nextId: number;
  compactionCount: number;
  lastCompactionAt?: number;
}

const KEY = Symbol.for("mekann.contextMonitor.server.v1");

function initState(): ContextMonitorState {
  return { samples: [], tools: new Map(), toolSchemaTotalBytes: 0, nextId: 1, compactionCount: 0 };
}

const state: ContextMonitorState = (globalThis as any)[KEY] ?? ((globalThis as any)[KEY] = initState());

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

function esc(v: unknown): string {
  return String(v ?? "—").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
}

// ─── data access ─────────────────────────────────────────────────

/** Walk backwards to find the most recent known value for key. */
function latestVal(key: string): unknown {
  for (let i = state.samples.length - 1; i >= 0; i--) {
    const v = state.samples[i].summary?.[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

function prevVal(key: string): unknown {
  let seen = false;
  for (let i = state.samples.length - 1; i >= 0; i--) {
    const v = state.samples[i].summary?.[key];
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
  for (const s of state.samples) {
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
  const last20 = state.samples.filter((s) => s.phase === "provider_request").slice(-20);
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

function renderDashboard(): string {
  const latest = state.samples.at(-1);
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
  const samples = state.samples.slice(-50).reverse();
  const totalTools = state.tools.size;
  const schemaTotal = state.toolSchemaTotalBytes;
  const compactions = state.compactionCount;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Context Monitor — Mekann</title><style>
:root{--bg:#1a1b26;--surface:#24283b;--border:#3b4261;--text:#c0caf5;--dim:#565f89;--accent:#7aa2f7;--cyan:#7dcfff;--green:#9ece6a;--red:#f7768e;--orange:#ff9e64;--purple:#bb9af7;--heading:#c0caf5}
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
.spacer{height:20px}
@media(max-width:900px){.grid2,.grid3,.grid4{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Context Monitor</h1>
<div class="sub">live context pressure — live update 2s — samples ${state.samples.length} — tools ${totalTools} — compactions ${compactions}</div>

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

<p class="sub" style="margin-top:20px">JSON: <a href="/snapshot">/snapshot</a> <a href="/events">/events</a> <a href="/tools">/tools</a> <a href="/health">/health</a></p>
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

export function getContextMonitorSnapshot() {
  return {
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    latest: state.samples.at(-1) ?? null,
    sampleCount: state.samples.length,
    tools: [...state.tools.values()],
    compactionCount: state.compactionCount,
    lastCompactionAt: state.lastCompactionAt ?? null,
    alerts: computeAlerts(),
    payloadBreakdown: payloadBreakdown(),
    toolOutputBreakdown: toolOutputBreakdown(),
  };
}

export async function ensureContextMonitorServer(preferredPort = 0): Promise<{ port: number; url: string; reused: boolean }> {
  if (state.server?.listening && state.port) return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: true };

  state.server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/" || url.pathname === "/dashboard") return html(res, renderDashboard());
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname === "/snapshot") return json(res, 200, getContextMonitorSnapshot());
    if (url.pathname === "/events") return json(res, 200, { samples: state.samples });
    if (url.pathname === "/tools") return json(res, 200, { tools: [...state.tools.values()], totalBytes: state.toolSchemaTotalBytes });
    return json(res, 404, { error: "not_found", endpoints: ["/", "/health", "/snapshot", "/events", "/tools"] });
  });
  state.server.unref();

  await new Promise<void>((resolve, reject) => {
    state.server!.once("error", reject);
    state.server!.listen(preferredPort, "127.0.0.1", () => resolve());
  });
  state.port = (state.server.address() as AddressInfo).port;
  return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: false };
}
