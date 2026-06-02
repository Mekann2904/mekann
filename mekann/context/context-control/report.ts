import type { ContextScope as ContextMonitorScope } from "./observation.js";
import { fmtBytes } from "./format.js";
import { currentContextScope, scopedContextSamples } from "./query.js";
import { state } from "./state.js";
import { buildContextBudgetPlan } from "./planner.js";
import {
  buildContextAnalysis,
  computeAlerts,
  latestVal,
  numLatest,
  payloadBreakdown,
  toolOutputBreakdown,
  topMessageItems,
  type Alert,
  type Contributor,
} from "./analysis.js";

export { computeAlerts, latestVal, numLatest, numPrev, payloadBreakdown, toolOutputBreakdown } from "./analysis.js";
export type { Alert, Contributor } from "./analysis.js";

interface OptimizationRecommendation {
  priority: "high" | "medium" | "low";
  action: string;
  expectedSavingsBytes: number;
  qualityRisk: "low" | "medium" | "high";
  reason: string;
}

function recommendations(scope: ContextMonitorScope = currentContextScope()): OptimizationRecommendation[] {
  const recs: OptimizationRecommendation[] = [];
  const breakdown = payloadBreakdown(scope);
  const msg = breakdown.find((item) => item.label === "Messages");
  const sys = breakdown.find((item) => item.label === "System prompt");
  const largestMessage = topMessageItems(1, scope)[0];
  const toolTotal = toolOutputBreakdown(scope).reduce((sum, item) => sum + item.bytes, 0);
  const health = buildContextAnalysis(scope, 1).health;

  if (largestMessage && largestMessage.bytes > 24 * 1024) recs.push({ priority: "high", action: "summarize_largest_message_item", expectedSavingsBytes: Math.round(largestMessage.bytes * 0.75), qualityRisk: "low", reason: `Largest message item is ${fmtBytes(largestMessage.bytes)}.` });
  if (msg && msg.pct > 65) recs.push({ priority: "medium", action: "classify_message_retention", expectedSavingsBytes: Math.round(msg.bytes * 0.25), qualityRisk: "medium", reason: `Messages are ${msg.pct}% of payload.` });
  if (toolTotal > 64 * 1024) recs.push({ priority: "medium", action: "externalize_tool_outputs", expectedSavingsBytes: Math.round(toolTotal * 0.5), qualityRisk: "low", reason: `Cumulative tool output is ${fmtBytes(toolTotal)}.` });
  if (sys && sys.pct > 25) recs.push({ priority: "low", action: "audit_system_prompt", expectedSavingsBytes: Math.round(sys.bytes * 0.15), qualityRisk: "medium", reason: `System prompt is ${sys.pct}% of payload.` });
  if (health.risk === "high" || health.risk === "critical") recs.push({ priority: "high", action: "trigger_targeted_compaction", expectedSavingsBytes: Math.round(numLatest("messageBytes", scope) * 0.45), qualityRisk: "medium", reason: `Health risk is ${health.risk}.` });
  if (recs.length === 0) recs.push({ priority: "low", action: "no_action_monitor_only", expectedSavingsBytes: 0, qualityRisk: "low", reason: "Context pressure is low; keep monitoring." });
  return recs;
}

function topContributors(limit = 12, scope: ContextMonitorScope = currentContextScope()) {
  const payloadItems = payloadBreakdown(scope).map((item) => ({
    type: "payload_component",
    source: item.label,
    bytes: item.bytes,
    percent: item.pct,
    action: item.label === "Messages" && item.pct > 60 ? "classify_recent_messages_and_summarize_low_value_items" : item.label === "System prompt" && item.pct > 25 ? "audit_system_prompt_and_lazy_load_optional_guidance" : "watch",
  }));
  const toolItems = toolOutputBreakdown(scope).map((item) => ({
    type: "tool_output_cumulative",
    source: item.label,
    bytes: item.bytes,
    percent: item.pct,
    action: item.bytes > 48 * 1024 ? "store_raw_output_externally_and_retrieve_snippets" : "watch",
  }));
  const messageItems = topMessageItems(limit, scope).map((item) => ({
    type: "message_item",
    source: item.source,
    bytes: item.bytes,
    percent: 0,
    action: item.policy === "SUMMARIZE" ? "replace_with_summary_or_external_reference" : "watch",
  }));
  return [...payloadItems, ...toolItems, ...messageItems]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit)
    .map((item, index) => ({ rank: index + 1, ...item }));
}

export function getContextIntelligenceReport(action = "report", limit = 20, scope: ContextMonitorScope = currentContextScope()) {
  const analysis = buildContextAnalysis(scope, limit);
  const planner = buildContextBudgetPlan(analysis.samples, scope);
  const base = {
    generatedAt: Date.now(),
    action,
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    health: analysis.health,
    context: {
      tokens: latestVal("contextTokens", scope) ?? null,
      window: analysis.contextWindow,
      percent: latestVal("contextPercent", scope) ?? null,
      payloadBytes: numLatest("payloadBytes", scope),
      messageBytes: numLatest("messageBytes", scope),
      systemPromptBytes: numLatest("systemPromptBytes", scope),
    },
    growth: analysis.growth,
    alerts: analysis.alerts,
    toolSurface: analysis.toolSurface,
    compactions: { count: state.compactionCount, lastAt: state.lastCompactionAt ?? null },
    planner,
  };
  if (action === "health") return base;
  if (action === "top_contributors") return { ...base, topContributors: topContributors(limit, scope), topMessages: analysis.topMessages };
  if (action === "timeline") return { ...base, timeline: scopedContextSamples(scope).slice(-limit) };
  if (action === "recommendations") return { ...base, recommendations: recommendations(scope) };
  if (action === "budget") return { ...base, budget: { systemPromptPctTarget: 15, recentMessagesPctTarget: 35, summariesPctTarget: 15, toolResultsPctTarget: 20, retrievedContextPctTarget: 10, reservePctTarget: 5, planner: planner.budget }, actualBreakdown: analysis.payloadBreakdown, decisions: planner.decisions };
  return { ...base, topContributors: topContributors(limit, scope), recommendations: recommendations(scope), payloadBreakdown: analysis.payloadBreakdown, toolOutputBreakdown: analysis.toolOutputBreakdown, topMessages: analysis.topMessages };
}

export function recordContextDecision(decision: unknown): void {
  state.decisions.push({ at: Date.now(), decision });
  if (state.decisions.length > 100) state.decisions.splice(0, state.decisions.length - 100);
}
