import type { ContextScope, StoredContextObservation } from "./observation.js";

export function currentScope(samples: StoredContextObservation[]): ContextScope {
  const latest = samples.at(-1);
  return { cwd: latest?.cwd, sessionId: latest?.sessionId, mode: "strict" };
}

export function matchesScope(sample: StoredContextObservation, scope: ContextScope): boolean {
  const mode = scope.mode ?? "strict";
  if (scope.cwd !== undefined) {
    const cwdMatches = sample.cwd === scope.cwd || (mode === "include-global" && sample.cwd === undefined);
    if (!cwdMatches) return false;
  }
  if (scope.sessionId !== undefined) {
    const sessionMatches = sample.sessionId === scope.sessionId || (mode === "include-global" && sample.sessionId === undefined);
    if (!sessionMatches) return false;
  }
  return true;
}

export function scopedSamples(samples: StoredContextObservation[], scope: ContextScope = currentScope(samples)): StoredContextObservation[] {
  return samples.filter((sample) => matchesScope(sample, scope));
}
