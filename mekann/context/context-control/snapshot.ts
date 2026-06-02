import { state, type ContextMonitorSample } from "./state.js";
import type { ContextScope } from "./observation.js";
import { currentScope, scopedSamples } from "./scope.js";
import { getToolSchemaSnapshot } from "./tool-schemas.js";
import { computeAlerts, getContextIntelligenceReport, payloadBreakdown, toolOutputBreakdown } from "./report.js";

export function latestCacheableContextSample(scope: ContextScope = currentScope(state.samples)): ContextMonitorSample | undefined {
  const samples = scopedSamples(state.samples, { ...scope, mode: scope.mode ?? "strict" });
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].phase === "cacheable_context") return samples[i];
  }
  return undefined;
}

export function getContextMonitorSnapshot(scope: ContextScope = currentScope(state.samples)) {
  const samples = scopedSamples(state.samples, { ...scope, mode: scope.mode ?? "strict" });
  return {
    scope,
    server: { port: state.port, url: state.port ? `http://127.0.0.1:${state.port}` : undefined },
    latest: samples.at(-1) ?? null,
    cacheableContext: latestCacheableContextSample(scope)?.summary ?? null,
    sampleCount: samples.length,
    tools: getToolSchemaSnapshot().tools,
    compactionCount: state.compactionCount,
    lastCompactionAt: state.lastCompactionAt ?? null,
    alerts: computeAlerts(scope),
    payloadBreakdown: payloadBreakdown(scope),
    toolOutputBreakdown: toolOutputBreakdown(scope),
    contextIntelligence: getContextIntelligenceReport("report", 10, scope),
    decisions: state.decisions.slice(-20),
  };
}
