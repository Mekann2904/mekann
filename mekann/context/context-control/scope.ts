import type { ContextScope, StoredContextObservation } from "./observation.js";

export function currentScope(samples: StoredContextObservation[]): ContextScope {
  const latest = samples.at(-1);
  return { cwd: latest?.cwd, sessionId: latest?.sessionId, mode: "strict" };
}

export function matchesScope(sample: StoredContextObservation, scope: ContextScope): boolean {
  const mode = scope.mode ?? "strict";
  if (scope.cwd !== undefined) {
    if (mode === "include-global" && sample.cwd === undefined) return true;
    if (sample.cwd !== scope.cwd) return false;
  }
  if (scope.sessionId !== undefined) {
    if (mode === "include-global" && sample.sessionId === undefined) return true;
    if (sample.sessionId !== scope.sessionId) return false;
  }
  return true;
}

export function scopedSamples(samples: StoredContextObservation[], scope: ContextScope = currentScope(samples)): StoredContextObservation[] {
  return samples.filter((sample) => matchesScope(sample, scope));
}
