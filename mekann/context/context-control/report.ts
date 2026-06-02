import type { ContextScope as ContextMonitorScope } from "./observation.js";
import { currentScope as deriveCurrentScope, scopedSamples as filterScopedSamples } from "./scope.js";
import { state, type ContextMonitorSample } from "./state.js";

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function currentScope(): ContextMonitorScope {
  return deriveCurrentScope(state.samples);
}

function scopedSamples(scope: ContextMonitorScope = currentScope()): ContextMonitorSample[] {
  return filterScopedSamples(state.samples, { ...scope, mode: scope.mode ?? "strict" });
}

// ─── data access ─────────────────────────────────────────────────

/** Walk backwards to find the most recent known value for key. */
export function latestVal(key: string, scope: ContextMonitorScope = currentScope()): unknown {
  const samples = scopedSamples(scope);
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i].summary?.[key];
    if (v !== undefined) return v;
  }
  return undefined;
}

export function prevVal(key: string, scope: ContextMonitorScope = currentScope()): unknown {
  let seen = false;
  const samples = scopedSamples(scope);
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i].summary?.[key];
    if (v !== undefined) {
      if (seen) return v;
      seen = true;
    }
  }
  return undefined;
}

export function numLatest(key: string, scope: ContextMonitorScope = currentScope()): number {
  const v = latestVal(key, scope);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export function numPrev(key: string, scope: ContextMonitorScope = currentScope()): number {
  const v = prevVal(key, scope);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

// ─── contributors ────────────────────────────────────────────────

export interface Contributor {
  label: string;
  bytes: number;
  pct: number;
}

export function payloadBreakdown(scope: ContextMonitorScope = currentScope()): Contributor[] {
  const sys = numLatest("systemPromptBytes", scope);
  const msg = numLatest("messageBytes", scope);
  const payload = numLatest("payloadBytes", scope);
  const overhead = payload - sys - msg;
  const items: Contributor[] = [
    { label: "System prompt", bytes: sys, pct: 0 },
    { label: "Messages", bytes: msg, pct: 0 },
    { label: "Provider overhead", bytes: Math.max(0, overhead), pct: 0 },
  ].filter((c) => c.bytes > 0);
  const total = items.reduce((s, c) => s + c.bytes, 0) || 1;
  for (const c of items) c.pct = Math.round(c.bytes / total * 100);
  return items;
}

export function toolOutputBreakdown(scope: ContextMonitorScope = currentScope()): Contributor[] {
  const map = new Map<string, number>();
  for (const s of scopedSamples(scope)) {
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

export interface Alert {
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

function latestSampleWith(key: string, scope: ContextMonitorScope = currentScope()): ContextMonitorSample | undefined {
  const samples = scopedSamples(scope);
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].summary?.[key] !== undefined) return samples[i];
  }
  return undefined;
}

function contextWindowEstimate(scope: ContextMonitorScope = currentScope()): number | null {
  const tokens = Number(latestVal("contextTokens", scope));
  const percent = Number(latestVal("contextPercent", scope));
  if (!Number.isFinite(tokens) || !Number.isFinite(percent) || percent <= 0) return null;
  return Math.round(tokens / (percent / 100));
}

function growthRate(scope: ContextMonitorScope = currentScope()) {
  const provider = scopedSamples(scope).filter((s) => s.phase === "provider_request").slice(-8);
  if (provider.length < 2) return { tokensPerRequest: 0, payloadBytesPerRequest: 0 };
  const first = provider[0];
  const last = provider.at(-1)!;
  const n = provider.length - 1;
  return {
    tokensPerRequest: Math.round((Number(last.summary?.contextTokens ?? 0) - Number(first.summary?.contextTokens ?? 0)) / n),
    payloadBytesPerRequest: Math.round((Number(last.summary?.payloadBytes ?? 0) - Number(first.summary?.payloadBytes ?? 0)) / n),
  };
}

function topMessageItems(limit = 20, scope: ContextMonitorScope = currentScope()) {
  const sample = latestSampleWith("messageBreakdown", scope);
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

function topContributors(limit = 12, scope: ContextMonitorScope = currentScope()) {
  const payloadItems = payloadBreakdown(scope).map((c) => ({
    type: "payload_component",
    source: c.label,
    bytes: c.bytes,
    percent: c.pct,
    action: c.label === "Messages" && c.pct > 60 ? "classify_recent_messages_and_summarize_low_value_items" : c.label === "System prompt" && c.pct > 25 ? "audit_system_prompt_and_lazy_load_optional_guidance" : "watch",
  }));
  const toolItems = toolOutputBreakdown(scope).map((c) => ({
    type: "tool_output_cumulative",
    source: c.label,
    bytes: c.bytes,
    percent: c.pct,
    action: c.bytes > 48 * 1024 ? "store_raw_output_externally_and_retrieve_snippets" : "watch",
  }));
  const messageItems = topMessageItems(limit, scope).map((m) => ({
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

function computeHealthScore(scope: ContextMonitorScope = currentScope()): { score: number; risk: "low" | "medium" | "high" | "critical"; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];
  const percent = Number(latestVal("contextPercent", scope));
  const breakdown = payloadBreakdown(scope);
  const msgPct = breakdown.find((c) => c.label === "Messages")?.pct ?? 0;
  const sysPct = breakdown.find((c) => c.label === "System prompt")?.pct ?? 0;
  const growth = growthRate(scope);
  const lastResultBytes = numLatest("resultBytes", scope);

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

function recommendations(scope: ContextMonitorScope = currentScope()): OptimizationRecommendation[] {
  const recs: OptimizationRecommendation[] = [];
  const breakdown = payloadBreakdown(scope);
  const msg = breakdown.find((c) => c.label === "Messages");
  const sys = breakdown.find((c) => c.label === "System prompt");
  const largestMessage = topMessageItems(1, scope)[0];
  const toolTotal = toolOutputBreakdown(scope).reduce((s, c) => s + c.bytes, 0);
  const health = computeHealthScore(scope);

  if (largestMessage && largestMessage.bytes > 24 * 1024) recs.push({ priority: "high", action: "summarize_largest_message_item", expectedSavingsBytes: Math.round(largestMessage.bytes * 0.75), qualityRisk: "low", reason: `Largest message item is ${fmtBytes(largestMessage.bytes)}.` });
  if (msg && msg.pct > 65) recs.push({ priority: "medium", action: "classify_message_retention", expectedSavingsBytes: Math.round(msg.bytes * 0.25), qualityRisk: "medium", reason: `Messages are ${msg.pct}% of payload.` });
  if (toolTotal > 64 * 1024) recs.push({ priority: "medium", action: "externalize_tool_outputs", expectedSavingsBytes: Math.round(toolTotal * 0.5), qualityRisk: "low", reason: `Cumulative tool output is ${fmtBytes(toolTotal)}.` });
  if (sys && sys.pct > 25) recs.push({ priority: "low", action: "audit_system_prompt", expectedSavingsBytes: Math.round(sys.bytes * 0.15), qualityRisk: "medium", reason: `System prompt is ${sys.pct}% of payload.` });
  if (health.risk === "high" || health.risk === "critical") recs.push({ priority: "high", action: "trigger_targeted_compaction", expectedSavingsBytes: Math.round(numLatest("messageBytes", scope) * 0.45), qualityRisk: "medium", reason: `Health risk is ${health.risk}.` });
  if (recs.length === 0) recs.push({ priority: "low", action: "no_action_monitor_only", expectedSavingsBytes: 0, qualityRisk: "low", reason: "Context pressure is low; keep monitoring." });
  return recs;
}

export function getContextIntelligenceReport(action = "report", limit = 20, scope: ContextMonitorScope = currentScope()) {
  const latest = scopedSamples(scope).at(-1) ?? null;
  const health = computeHealthScore(scope);
  const growth = growthRate(scope);
  const base = {
    generatedAt: Date.now(),
    action,
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    health,
    context: {
      tokens: latestVal("contextTokens", scope) ?? null,
      window: contextWindowEstimate(scope),
      percent: latestVal("contextPercent", scope) ?? null,
      payloadBytes: numLatest("payloadBytes", scope),
      messageBytes: numLatest("messageBytes", scope),
      systemPromptBytes: numLatest("systemPromptBytes", scope),
    },
    growth,
    alerts: computeAlerts(scope),
    compactions: { count: state.compactionCount, lastAt: state.lastCompactionAt ?? null },
  };
  if (action === "health") return base;
  if (action === "top_contributors") return { ...base, topContributors: topContributors(limit, scope), topMessages: topMessageItems(limit, scope) };
  if (action === "timeline") return { ...base, timeline: scopedSamples(scope).slice(-limit) };
  if (action === "recommendations") return { ...base, recommendations: recommendations(scope) };
  if (action === "budget") return { ...base, budget: { systemPromptPctTarget: 15, recentMessagesPctTarget: 35, summariesPctTarget: 15, toolResultsPctTarget: 20, retrievedContextPctTarget: 10, reservePctTarget: 5 }, actualBreakdown: payloadBreakdown(scope) };
  return { ...base, topContributors: topContributors(limit, scope), recommendations: recommendations(scope), payloadBreakdown: payloadBreakdown(scope), toolOutputBreakdown: toolOutputBreakdown(scope), topMessages: topMessageItems(limit, scope) };
}

export function recordContextDecision(decision: unknown): void {
  state.decisions.push({ at: Date.now(), decision });
  if (state.decisions.length > 100) state.decisions.splice(0, state.decisions.length - 100);
}

export function computeAlerts(scope: ContextMonitorScope = currentScope()): Alert[] {
  const a: Alert[] = [];
  const tokens = numLatest("contextTokens", scope);
  const percent = Number(latestVal("contextPercent", scope));
  const prevTokens = numPrev("contextTokens", scope);
  const payload = numLatest("payloadBytes", scope);
  const prevPayload = numPrev("payloadBytes", scope);
  const resultBytes = numLatest("resultBytes", scope);
  const pendingResults = numLatest("pendingResults", scope);

  if (Number.isFinite(percent) && percent > 80) a.push({ level: "warn", text: `Tokens at ${percent}% of context window` });
  if (resultBytes > 50 * 1024) a.push({ level: "warn", text: `Last tool result ${fmtBytes(resultBytes)} exceeds 50 KB` });
  if (prevPayload > 0 && payload > prevPayload * 1.3) a.push({ level: "info", text: `Payload grew ${Math.round((payload / prevPayload - 1) * 100)}% this turn` });
  if (prevTokens > 0 && tokens > prevTokens * 1.2) a.push({ level: "info", text: `Token estimate grew ${Math.round((tokens / prevTokens - 1) * 100)}%` });
  if (pendingResults > 5) a.push({ level: "warn", text: `${pendingResults} pending subagent results` });

  return a;
}

