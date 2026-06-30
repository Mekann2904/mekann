import type { ContextScope, StoredContextObservation } from "./observation.js";

export function currentScope(samples: StoredContextObservation[]): ContextScope {
  const latest = samples.at(-1);
  return { cwd: latest?.cwd, sessionId: latest?.sessionId, mode: "strict" };
}

/**
 * Resolved scope mode. `scope.mode` defaults to `"strict"` when omitted.
 */
export type ScopeMode = NonNullable<ContextScope["mode"]>;

/**
 * Per-axis scope matcher.
 *
 * A scope axis is an independent, composable predicate that decides whether a
 * single observation field participates in a query scope. Each matcher owns
 * its own branching (including the strict/include-global distinction) and is
 * passed `mode` as a parameter, so that adding a new axis never perturbs the
 * existing axes — see {@link SCOPE_AXES} and the extension note below.
 *
 * A matcher returns `true` when its axis has no opinion for the given scope
 * (the scope does not request this axis) or when the sample satisfies the axis.
 */
export type ScopeAxisMatcher = (
  sample: StoredContextObservation,
  scope: ContextScope,
  mode: ScopeMode,
) => boolean;

/**
 * cwd axis (only engages when `scope.cwd` is requested).
 *
 * - exact match: `sample.cwd === scope.cwd`
 * - global fallback (include-global only): an observation carrying no cwd is
 *   treated as universally scoped and participates.
 */
export const cwdAxis: ScopeAxisMatcher = (sample, scope, mode) => {
  if (scope.cwd === undefined) return true; // axis not requested → no opinion
  if (sample.cwd === scope.cwd) return true; // exact project match
  return mode === "include-global" && sample.cwd === undefined; // global fallback
};

/**
 * sessionId axis (only engages when `scope.sessionId` is requested).
 *
 * A sample satisfies the session axis when any of:
 * - exact session match: `sample.sessionId === scope.sessionId`
 * - project-scoped: the observation is project-level for the requested project
 *   (`sample.cwd` equals `scope.cwd` with no `sample.sessionId`) — it applies to
 *   every session in that project.
 * - global fallback (include-global only): the observation carries neither cwd
 *   nor sessionId — it applies universally.
 */
export const sessionAxis: ScopeAxisMatcher = (sample, scope, mode) => {
  if (scope.sessionId === undefined) return true; // axis not requested → no opinion
  if (sample.sessionId === scope.sessionId) return true; // exact session match
  const projectScoped =
    sample.cwd !== undefined && sample.cwd === scope.cwd && sample.sessionId === undefined;
  if (projectScoped) return true; // project-level observation covers this session
  return mode === "include-global" && sample.cwd === undefined && sample.sessionId === undefined; // global fallback
};

/**
 * Compose independent per-axis matchers into a single scope predicate via
 * conjunction (logical AND). A sample matches a scope iff it satisfies every
 * requested axis; unrequested axes are no-ops (they return `true`).
 */
export function composeScopeMatchers(
  axes: readonly ScopeAxisMatcher[],
): (sample: StoredContextObservation, scope: ContextScope) => boolean {
  return (sample, scope) => {
    const mode = scope.mode ?? "strict";
    return axes.every((axis) => axis(sample, scope, mode));
  };
}

/**
 * Axis registry. To add a new scope axis, implement a {@link ScopeAxisMatcher}
 * and append it here — existing axes are left untouched. For example, a future
 * `branchId` axis would be added without modifying `cwdAxis`/`sessionAxis`:
 *
 * ```ts
 * export const branchIdAxis: ScopeAxisMatcher = (sample, scope, mode) => {
 *   if (scope.branchId === undefined) return true;
 *   if (sample.branchId === scope.branchId) return true;
 *   return mode === "include-global" && sample.branchId === undefined;
 * };
 * const SCOPE_AXES = [cwdAxis, sessionAxis, branchIdAxis] as const;
 * ```
 *
 * `ContextScope` (and `StoredContextObservation`) would gain the matching
 * optional `branchId` field; the rest of the system is unaffected.
 */
const SCOPE_AXES: readonly ScopeAxisMatcher[] = [cwdAxis, sessionAxis];

/**
 * A sample matches a scope iff it satisfies every axis the scope requests.
 * Reconstructed from independent per-axis matchers (see {@link SCOPE_AXES});
 * behavior is identical to the prior inline implementation — the property tests
 * in `scope.test.ts` pin this equivalence against a reference oracle.
 */
export const matchesScope = composeScopeMatchers(SCOPE_AXES);

export function scopedSamples(
  samples: StoredContextObservation[],
  scope: ContextScope = currentScope(samples),
): StoredContextObservation[] {
  return samples.filter((sample) => matchesScope(sample, scope));
}
