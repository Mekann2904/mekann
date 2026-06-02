import type { ContextScope } from "./observation.js";
import { latestMessageBreakdown, toolSurfaceAnalysis } from "./analysis.js";
import type { ContextMonitorSample } from "./state.js";

export type ContextPlannerDecisionKind = "inline" | "retrieve" | "summarize" | "externalize" | "omit" | "monitor";

export interface ContextPlannerDecision {
  kind: ContextPlannerDecisionKind;
  target: string;
  priority: "high" | "medium" | "low";
  expectedSavingsBytes: number;
  expectedSavingsTokens?: number;
  qualityRisk: "low" | "medium" | "high";
  reason: string;
}

export interface ContextCacheEfficiencySummary {
  actualWarmRequestCount?: number;
  actualWarmTokenHitRateWeighted?: number | null;
  actualMatchedRequestCount?: number;
  actualMatchedTokenHitRateWeighted?: number | null;
  providerPrefixHashChanges?: number;
  toolSetHashChanges?: number;
  toolOrderHashChanges?: number;
  providerModelSwitches?: number;
  dynamicTruncationCount?: number;
  dynamicTruncationOmittedChars?: number;
  recentSameReuseKeyStreak?: number;
}

export interface ContextBudgetPlan {
  scope: ContextScope;
  generatedAt: number;
  pressure: "low" | "medium" | "high" | "critical";
  contextPercent: number | null;
  budget: {
    dynamicTailMaxBytes: number;
    largestInlineMessageBytes: number;
    toolOutputInlineBytes: number;
  };
  decisions: ContextPlannerDecision[];
}

interface PlannerContext {
  samples: ContextMonitorSample[];
  scope: ContextScope;
  cacheSummary?: ContextCacheEfficiencySummary;
  pressure: ContextBudgetPlan["pressure"];
  budget: ContextBudgetPlan["budget"];
  latestValue(key: string): unknown;
}

type PlannerRule = (ctx: PlannerContext) => ContextPlannerDecision[];

function latestValue(samples: ContextMonitorSample[], key: string): unknown {
  for (let i = samples.length - 1; i >= 0; i--) {
    const value = samples[i].summary?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function pressureFrom(percent: number | null): ContextBudgetPlan["pressure"] {
  if (percent == null) return "low";
  if (percent >= 85) return "critical";
  if (percent >= 70) return "high";
  if (percent >= 45) return "medium";
  return "low";
}

function pressureBudget(pressure: ContextBudgetPlan["pressure"]): ContextBudgetPlan["budget"] {
  return {
    dynamicTailMaxBytes: pressure === "critical" ? 4 * 1024 : pressure === "high" ? 8 * 1024 : pressure === "medium" ? 12 * 1024 : 16 * 1024,
    largestInlineMessageBytes: pressure === "critical" ? 8 * 1024 : pressure === "high" ? 16 * 1024 : 24 * 1024,
    toolOutputInlineBytes: pressure === "critical" ? 8 * 1024 : pressure === "high" ? 16 * 1024 : 32 * 1024,
  };
}

function outputGateArtifactId(text: string): string | undefined {
  return text.match(/\bog_[a-z0-9]+_[a-z0-9]+\b/)?.[0];
}

function withTokenEstimate(decision: ContextPlannerDecision): ContextPlannerDecision {
  return { ...decision, expectedSavingsTokens: decision.expectedSavingsTokens ?? Math.ceil(decision.expectedSavingsBytes / 4) };
}

function uniqueDecisions(decisions: ContextPlannerDecision[]): ContextPlannerDecision[] {
  const seen = new Set<string>();
  return decisions.map(withTokenEstimate).filter((decision) => {
    const key = `${decision.kind}:${decision.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const messageInlineBudgetRule: PlannerRule = (ctx) => {
  const decisions: ContextPlannerDecision[] = [];
  for (const item of latestMessageBreakdown(ctx.scope)) {
    const bytes = Number(item.bytes ?? 0);
    const target = item.source ?? item.role ?? `message:${item.index ?? "unknown"}`;
    const artifactId = outputGateArtifactId(String(target));
    if (artifactId || String(target).includes("[output-gate]")) {
      decisions.push({ kind: "retrieve", target: artifactId ? `output-gate:${artifactId}` : "output-gate:artifact", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: "Raw evidence is already externalized; retrieve focused snippets instead of expanding the full artifact inline." });
    }
    if (bytes > ctx.budget.largestInlineMessageBytes * 2) {
      decisions.push({ kind: "summarize", target, priority: "high", expectedSavingsBytes: Math.round(bytes * 0.75), qualityRisk: "medium", reason: `Message item exceeds live inline budget (${bytes} > ${ctx.budget.largestInlineMessageBytes}).` });
    } else if (bytes > ctx.budget.largestInlineMessageBytes) {
      decisions.push({ kind: "retrieve", target, priority: "medium", expectedSavingsBytes: Math.round(bytes * 0.5), qualityRisk: "low", reason: `Message item should move behind targeted retrieval (${bytes} > ${ctx.budget.largestInlineMessageBytes}).` });
    }
  }
  return decisions;
};

const toolOutputBudgetRule: PlannerRule = (ctx) => {
  const totals = new Map<string, number>();
  for (const sample of ctx.samples) {
    if (sample.phase !== "tool_end") continue;
    const name = String(sample.summary?.toolName ?? "?");
    const bytes = Number(sample.summary?.resultBytes ?? 0);
    if (Number.isFinite(bytes)) totals.set(name, (totals.get(name) ?? 0) + bytes);
  }
  return [...totals.entries()].flatMap(([name, bytes]) => bytes > ctx.budget.toolOutputInlineBytes
    ? [{ kind: "externalize", target: `tool:${name}`, priority: bytes > ctx.budget.toolOutputInlineBytes * 3 ? "high" : "medium", expectedSavingsBytes: Math.round(bytes * 0.6), qualityRisk: "low", reason: `Tool output exceeds inline evidence budget (${bytes} > ${ctx.budget.toolOutputInlineBytes}).` } satisfies ContextPlannerDecision]
    : []);
};

const pressureRule: PlannerRule = (ctx) => ctx.pressure === "critical" || ctx.pressure === "high"
  ? [{ kind: "omit", target: "dynamic-tail:low-priority-fragments", priority: ctx.pressure === "critical" ? "high" : "medium", expectedSavingsBytes: ctx.pressure === "critical" ? 12 * 1024 : 8 * 1024, qualityRisk: "medium", reason: `Context pressure is ${ctx.pressure}; keep only task-critical dynamic fragments in the volatile tail.` }]
  : [];

const cacheableContextRule: PlannerRule = (ctx) => {
  const prefixChars = Number(ctx.latestValue("prefixChars") ?? 0);
  const maxPrefixChars = Number(ctx.latestValue("maxPrefixChars") ?? 0);
  const promptSurface = String(ctx.latestValue("promptSurface") ?? "");
  const decisions: ContextPlannerDecision[] = [];
  if (maxPrefixChars > 0 && prefixChars / maxPrefixChars > 0.9) {
    decisions.push({ kind: "retrieve", target: "cacheable-context:overflow-fragments", priority: "medium", expectedSavingsBytes: Math.round(prefixChars * 0.2), qualityRisk: "low", reason: "Cacheable context prefix is close to maxPrefixChars; keep locator inline and retrieve optional fragments on demand." });
  }
  if (promptSurface === "full" && prefixChars > 16 * 1024) {
    decisions.push({ kind: "retrieve", target: "cacheable-context:full-surface", priority: "medium", expectedSavingsBytes: Math.round(prefixChars * 0.75), qualityRisk: "medium", reason: "Full cacheable-context is large for normal tasks; prefer locator mode and targeted retrieval unless this task explicitly needs all domain docs inline." });
  }
  return decisions;
};

const systemPromptRule: PlannerRule = (ctx) => {
  const systemPromptBytes = Number(ctx.latestValue("systemPromptBytes") ?? 0);
  const payloadBytes = Number(ctx.latestValue("payloadBytes") ?? 0);
  return payloadBytes > 0 && systemPromptBytes / payloadBytes > 0.3
    ? [{ kind: "retrieve", target: "system-prompt:optional-guidance", priority: "low", expectedSavingsBytes: Math.round(systemPromptBytes * 0.15), qualityRisk: "medium", reason: "System prompt is more than 30% of provider payload; lazy-load optional guidance." }]
    : [];
};

const toolSurfaceCacheRule: PlannerRule = (ctx) => {
  const toolSurface = toolSurfaceAnalysis(ctx.scope);
  const decisions: ContextPlannerDecision[] = [];
  if (toolSurface.toolSetHashChanges > 0) {
    decisions.push({ kind: "monitor", target: "tools:selected-tool-set", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: `Selected tool set changed ${toolSurface.toolSetHashChanges} times in scoped prompt samples; keep normal-task tool surfaces stable or split rarely used tools behind on-demand workflows.` });
  }
  if (toolSurface.toolOrderHashChanges > toolSurface.toolSetHashChanges) {
    decisions.push({ kind: "monitor", target: "tools:canonical-order", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: "Tool order changed more often than the selected tool set; canonical tool ordering would preserve provider prefix cache hits." });
  }
  if (toolSurface.schemaTotalBytes > 48 * 1024) {
    decisions.push({ kind: "retrieve", target: "tools:large-schema-surface", priority: "medium", expectedSavingsBytes: Math.round(toolSurface.schemaTotalBytes * 0.25), qualityRisk: "medium", reason: `Tool schema surface is large (${toolSurface.schemaTotalBytes} bytes); move rare capabilities to narrower/on-demand tools or shorten schemas.` });
  }
  return decisions;
};

const cacheEfficiencyRule: PlannerRule = ({ cacheSummary }) => {
  if (!cacheSummary) return [];
  const decisions: ContextPlannerDecision[] = [];
  const warmHitRate = typeof cacheSummary.actualWarmTokenHitRateWeighted === "number" ? cacheSummary.actualWarmTokenHitRateWeighted : null;
  if ((cacheSummary.actualWarmRequestCount ?? 0) >= 2 && warmHitRate !== null && warmHitRate < 0.35) {
    decisions.push({ kind: "retrieve", target: "cache-friendly-prompt:prefix-churn", priority: "high", expectedSavingsBytes: 0, qualityRisk: "medium", reason: `Warm provider cache hit rate is low (${Math.round(warmHitRate * 100)}%); inspect providerPrefixHash churn before adding inline context.` });
  }
  if ((cacheSummary.providerPrefixHashChanges ?? 0) > 3) {
    decisions.push({ kind: "monitor", target: "cache-friendly-prompt:provider-prefix-hash", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: `Provider prefix hash changed ${cacheSummary.providerPrefixHashChanges} times; group analysis by providerPrefixHash and requestRole.` });
  }
  if ((cacheSummary.toolSetHashChanges ?? 0) > 0) {
    decisions.push({ kind: "monitor", target: "cache-friendly-prompt:tool-set-hash", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: `Selected tool set hash changed ${cacheSummary.toolSetHashChanges} times; keep normal-task tool surfaces stable for provider prefix cache reuse.` });
  }
  if ((cacheSummary.toolOrderHashChanges ?? 0) > (cacheSummary.toolSetHashChanges ?? 0)) {
    decisions.push({ kind: "monitor", target: "cache-friendly-prompt:tool-order-hash", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: `Tool order hash changed ${cacheSummary.toolOrderHashChanges} times; canonical ordering would reduce cache churn without changing behavior.` });
  }
  if ((cacheSummary.providerModelSwitches ?? 0) > 3) {
    decisions.push({ kind: "monitor", target: "provider-model-routing", priority: "medium", expectedSavingsBytes: 0, qualityRisk: "low", reason: `Provider/model switched ${cacheSummary.providerModelSwitches} times; cache reuse may be healthy per model but poor globally.` });
  }
  if ((cacheSummary.dynamicTruncationCount ?? 0) > 0) {
    decisions.push({ kind: "summarize", target: "dynamic-tail:truncated-fragments", priority: "medium", expectedSavingsBytes: Number(cacheSummary.dynamicTruncationOmittedChars ?? 0), qualityRisk: "medium", reason: `Dynamic context was truncated ${cacheSummary.dynamicTruncationCount} times; summarize low-value dynamic fragments before injection.` });
  }
  return decisions;
};

const plannerRules: PlannerRule[] = [messageInlineBudgetRule, toolOutputBudgetRule, pressureRule, cacheableContextRule, systemPromptRule, toolSurfaceCacheRule, cacheEfficiencyRule];

export function buildContextBudgetPlan(samples: ContextMonitorSample[], scope: ContextScope = {}, cacheSummary?: ContextCacheEfficiencySummary): ContextBudgetPlan {
  const rawPercent = Number(latestValue(samples, "contextPercent"));
  const contextPercent = Number.isFinite(rawPercent) ? rawPercent : null;
  const pressure = pressureFrom(contextPercent);
  const budget = pressureBudget(pressure);
  const ctx: PlannerContext = { samples, scope, cacheSummary, pressure, budget, latestValue: (key) => latestValue(samples, key) };
  const decisions = uniqueDecisions(plannerRules.flatMap((rule) => rule(ctx)));

  if (decisions.length === 0) {
    decisions.push({ kind: "monitor", target: "context-window", priority: "low", expectedSavingsBytes: 0, qualityRisk: "low", reason: "No context pressure requiring a control-plane action." });
  }

  const priorityRank = { high: 0, medium: 1, low: 2 } as const;
  decisions.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.expectedSavingsBytes - a.expectedSavingsBytes);
  return { scope, generatedAt: Date.now(), pressure, contextPercent, budget, decisions };
}
