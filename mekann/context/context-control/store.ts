import { state } from "../context-tracker/state.js";
import type { ContextObservation, ContextScope, StoredContextObservation } from "./observation.js";
import { currentScope, scopedSamples } from "./scope.js";

export function recordContextObservation(input: ContextObservation): StoredContextObservation {
  const stored = { ...input, id: state.nextId++, at: input.at ?? Date.now() } as StoredContextObservation;
  state.samples.push(stored as any);
  if (state.samples.length > 500) state.samples.splice(0, state.samples.length - 500);
  return stored;
}

export function listContextObservations(scope: ContextScope = currentScope(state.samples as any)): StoredContextObservation[] {
  return scopedSamples(state.samples as any, scope);
}

export function latestContextObservation(scope: ContextScope = currentScope(state.samples as any)): StoredContextObservation | undefined {
  return listContextObservations(scope).at(-1);
}
