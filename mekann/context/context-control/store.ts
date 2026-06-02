import { state } from "./state.js";
import type { ContextObservation, ContextScope, StoredContextObservation } from "./observation.js";
import { currentScope, scopedSamples } from "./scope.js";

export type ContextObservationInput = ContextObservation | (Omit<StoredContextObservation, "id" | "at"> & { at?: number });

export function recordContextObservation(input: ContextObservationInput): StoredContextObservation {
  const stored: StoredContextObservation = { cwd: input.cwd, sessionId: input.sessionId, phase: input.phase, summary: input.summary as Record<string, unknown>, id: state.nextId++, at: input.at ?? Date.now() };
  state.samples.push(stored);
  if (state.samples.length > 500) state.samples.splice(0, state.samples.length - 500);
  return stored;
}

export function listContextObservations(scope: ContextScope = currentScope(state.samples)): StoredContextObservation[] {
  return scopedSamples(state.samples, scope);
}

export function latestContextObservation(scope: ContextScope = currentScope(state.samples)): StoredContextObservation | undefined {
  return listContextObservations(scope).at(-1);
}
