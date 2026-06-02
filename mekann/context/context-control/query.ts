import { state, type ContextMonitorSample } from "./state.js";
import type { ContextScope } from "./observation.js";
import { currentScope as deriveCurrentScope, scopedSamples as filterScopedSamples } from "./scope.js";

export function currentContextScope(): ContextScope {
  return deriveCurrentScope(state.samples);
}

export function scopedContextSamples(scope: ContextScope = currentContextScope()): ContextMonitorSample[] {
  return filterScopedSamples(state.samples, { ...scope, mode: scope.mode ?? "strict" });
}

export function latestSampleWith(key: string, scope: ContextScope = currentContextScope()): ContextMonitorSample | undefined {
  const samples = scopedContextSamples(scope);
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].summary?.[key] !== undefined) return samples[i];
  }
  return undefined;
}

export function latestCacheableContextSample(scope: ContextScope = currentContextScope()): ContextMonitorSample | undefined {
  const samples = scopedContextSamples(scope);
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].phase === "cacheable_context") return samples[i];
  }
  return undefined;
}
