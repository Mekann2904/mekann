import type { ContextScope as ContextMonitorScope, MessageBreakdownItem } from "./observation.js";
import { fmtBytes } from "./format.js";
import { currentContextScope, latestSampleWith, scopedContextSamples } from "./query.js";
import type { ContextMonitorSample } from "./state.js";

export interface Contributor {
  label: string;
  bytes: number;
  pct: number;
}

export interface Alert {
  level: "warn" | "info";
  text: string;
}

export interface ContextHealth {
  score: number;
  risk: "low" | "medium" | "high" | "critical";
  reasons: string[];
}

export interface ContextGrowthRate {
  tokensPerRequest: number;
  payloadBytesPerRequest: number;
}

export interface TopMessageItem {
  rank: number;
  type: string;
  source: string;
  bytes: number;
  estimatedTokens: number;
  policy: "KEEP" | "RETRIEVE" | "SUMMARIZE";
  reason: string;
}

export interface ContextAnalysis {
  scope: ContextMonitorScope;
  samples: ContextMonitorSample[];
  latest: ContextMonitorSample | null;
  contextWindow: number | null;
  growth: ContextGrowthRate;
  health: ContextHealth;
  alerts: Alert[];
  payloadBreakdown: Contributor[];
  toolOutputBreakdown: Contributor[];
  topMessages: TopMessageItem[];
}

function latestValue(samples: ContextMonitorSample[], key: string): unknown {
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i].summary?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function previousValue(samples: ContextMonitorSample[], key: string): unknown {
  let seen = false;
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i].summary?.[key];
    if (value !== undefined) {
      if (seen) return value;
      seen = true;
    }
  }
  return undefined;
}

export function latestVal(key: string, scope: ContextMonitorScope = currentContextScope()): unknown {
  return latestValue(scopedContextSamples(scope), key);
}

export function prevVal(key: string, scope: ContextMonitorScope = currentContextScope()): unknown {
  return previousValue(scopedContextSamples(scope), key);
}

export function numLatest(key: string, scope: ContextMonitorScope = currentContextScope()): number {
  const value = latestVal(key, scope);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function numPrev(key: string, scope: ContextMonitorScope = currentContextScope()): number {
  const value = prevVal(key, scope);
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function payloadBreakdown(scope: ContextMonitorScope = currentContextScope()): Contributor[] {
  const sys = numLatest("systemPromptBytes", scope);
  const msg = numLatest("messageBytes", scope);
  const payload = numLatest("payloadBytes", scope);
  const overhead = payload - sys - msg;
  const items: Contributor[] = [
    { label: "System prompt", bytes: sys, pct: 0 },
    { label: "Messages", bytes: msg, pct: 0 },
    { label: "Provider overhead", bytes: Math.max(0, overhead), pct: 0 },
  ].filter((item) => item.bytes > 0);
  const total = items.reduce((sum, item) => sum + item.bytes, 0) || 1;
  for (const item of items) item.pct = Math.round(item.bytes / total * 100);
  return items;
}

export function toolOutputBreakdown(scope: ContextMonitorScope = currentContextScope()): Contributor[] {
  const totals = new Map<string, number>();
  for (const sample of scopedContextSamples(scope)) {
    if (sample.phase !== "tool_end") continue;
    const name = String(sample.summary?.toolName ?? "?");
    const bytes = Number(sample.summary?.resultBytes ?? 0);
    totals.set(name, (totals.get(name) ?? 0) + bytes);
  }
  const items = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, bytes]) => ({ label, bytes, pct: 0 }));
  const total = items.reduce((sum, item) => sum + item.bytes, 0) || 1;
  for (const item of items) item.pct = Math.round(item.bytes / total * 100);
  return items;
}

function isMessageBreakdownItem(value: unknown): value is MessageBreakdownItem {
  return typeof value === "object" && value !== null && Number.isFinite(Number((value as { bytes?: unknown }).bytes));
}

export function latestMessageBreakdown(scope: ContextMonitorScope = currentContextScope()): MessageBreakdownItem[] {
  const sample = latestSampleWith("messageBreakdown", scope);
  const value = sample?.summary?.messageBreakdown;
  return Array.isArray(value) ? value.filter(isMessageBreakdownItem) : [];
}

export function topMessageItems(limit = 20, scope: ContextMonitorScope = currentContextScope()): TopMessageItem[] {
  return latestMessageBreakdown(scope).slice(0, limit).map((item, index) => {
    const bytes = Number(item.bytes ?? 0);
    const policy = bytes > 24 * 1024 ? "SUMMARIZE" : bytes > 8 * 1024 ? "RETRIEVE" : "KEEP";
    return {
      rank: index + 1,
      type: item.role ?? "message",
      source: item.source ?? item.role ?? "message",
      bytes,
      estimatedTokens: Math.ceil(bytes / 4),
      policy,
      reason: policy === "SUMMARIZE" ? "Large message or tool result dominates live context" : "Within normal per-item budget",
    };
  });
}

export function contextWindowEstimate(scope: ContextMonitorScope = currentContextScope()): number | null {
  const tokens = Number(latestVal("contextTokens", scope));
  const percent = Number(latestVal("contextPercent", scope));
  if (!Number.isFinite(tokens) || !Number.isFinite(percent) || percent <= 0) return null;
  return Math.round(tokens / (percent / 100));
}

export function growthRate(scope: ContextMonitorScope = currentContextScope()): ContextGrowthRate {
  const provider = scopedContextSamples(scope).filter((sample) => sample.phase === "provider_request").slice(-8);
  if (provider.length < 2) return { tokensPerRequest: 0, payloadBytesPerRequest: 0 };
  const first = provider[0];
  const last = provider.at(-1)!;
  const count = provider.length - 1;
  return {
    tokensPerRequest: Math.round((Number(last.summary?.contextTokens ?? 0) - Number(first.summary?.contextTokens ?? 0)) / count),
    payloadBytesPerRequest: Math.round((Number(last.summary?.payloadBytes ?? 0) - Number(first.summary?.payloadBytes ?? 0)) / count),
  };
}

export function computeHealthScore(scope: ContextMonitorScope = currentContextScope()): ContextHealth {
  let score = 100;
  const reasons: string[] = [];
  const percent = Number(latestVal("contextPercent", scope));
  const breakdown = payloadBreakdown(scope);
  const msgPct = breakdown.find((item) => item.label === "Messages")?.pct ?? 0;
  const sysPct = breakdown.find((item) => item.label === "System prompt")?.pct ?? 0;
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

export function computeAlerts(scope: ContextMonitorScope = currentContextScope()): Alert[] {
  const alerts: Alert[] = [];
  const tokens = numLatest("contextTokens", scope);
  const percent = Number(latestVal("contextPercent", scope));
  const prevTokens = numPrev("contextTokens", scope);
  const payload = numLatest("payloadBytes", scope);
  const prevPayload = numPrev("payloadBytes", scope);
  const resultBytes = numLatest("resultBytes", scope);
  const pendingResults = numLatest("pendingResults", scope);

  if (Number.isFinite(percent) && percent > 80) alerts.push({ level: "warn", text: `Tokens at ${percent}% of context window` });
  if (resultBytes > 50 * 1024) alerts.push({ level: "warn", text: `Last tool result ${fmtBytes(resultBytes)} exceeds 50 KB` });
  if (prevPayload > 0 && payload > prevPayload * 1.3) alerts.push({ level: "info", text: `Payload grew ${Math.round((payload / prevPayload - 1) * 100)}% this turn` });
  if (prevTokens > 0 && tokens > prevTokens * 1.2) alerts.push({ level: "info", text: `Token estimate grew ${Math.round((tokens / prevTokens - 1) * 100)}%` });
  if (pendingResults > 5) alerts.push({ level: "warn", text: `${pendingResults} pending subagent results` });
  return alerts;
}

export function buildContextAnalysis(scope: ContextMonitorScope = currentContextScope(), topMessageLimit = 20): ContextAnalysis {
  const samples = scopedContextSamples(scope);
  return {
    scope,
    samples,
    latest: samples.at(-1) ?? null,
    contextWindow: contextWindowEstimate(scope),
    growth: growthRate(scope),
    health: computeHealthScore(scope),
    alerts: computeAlerts(scope),
    payloadBreakdown: payloadBreakdown(scope),
    toolOutputBreakdown: toolOutputBreakdown(scope),
    topMessages: topMessageItems(topMessageLimit, scope),
  };
}
