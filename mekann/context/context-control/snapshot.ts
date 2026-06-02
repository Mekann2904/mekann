import { state } from "./state.js";
import type { ContextScope } from "./observation.js";
import { currentContextScope, latestCacheableContextSample, scopedContextSamples } from "./query.js";
import { getToolSchemaSnapshot } from "./tool-schemas.js";
import { computeAlerts, getContextIntelligenceReport, payloadBreakdown, toolOutputBreakdown } from "./report.js";

export { latestCacheableContextSample } from "./query.js";

export function getContextMonitorSnapshot(scope: ContextScope = currentContextScope()) {
  const samples = scopedContextSamples(scope);
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
