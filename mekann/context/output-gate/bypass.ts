/**
 * Output-gate bypass tool registry (IC-273).
 *
 * Tools that aggregate or retrieve already-stored session context — search,
 * summarise, etc. — must opt out of output-gating. If their (potentially
 * large) results were gated and stored again, output-gate would chase its own
 * tail: save → search → save → …
 *
 * Historically `shouldGateOutput` hard-coded three tool names. Adding a fourth
 * search/aggregation tool silently reintroduced the cycle until someone
 * remembered to edit the block-list. This registry lets each tool declare its
 * bypass intent at its own registration site (next to `pi.registerTool`), so
 * the block-list no longer lives in the gating path. `shouldGateOutput` and
 * `OutputGateController` consult this registry instead of a duplicated
 * constant.
 *
 * The registry is process-global and append-only at runtime: every extension
 * re-declares its bypass tools when it loads, so the set is rebuilt on each
 * session start regardless of load order. `resetOutputGateBypassTools` exists
 * only to keep unit tests isolated.
 */

const bypassTools = new Set<string>();

/** Declare that `name`'s tool results must never be output-gated. */
export function registerOutputGateBypassTool(name: string): void {
	if (name) bypassTools.add(name);
}

/**
 * Bulk variant for ergonomic registration at extension load, e.g.
 * `registerOutputGateBypassTools(MY_TOOL_NAMES)` right next to the matching
 * `pi.registerTool` calls.
 */
export function registerOutputGateBypassTools(names: readonly string[]): void {
	for (const name of names) if (name) bypassTools.add(name);
}

/** True when `name` is registered as an output-gate bypass tool. */
export function isOutputGateBypassTool(name: string | undefined | null): boolean {
	return !!name && bypassTools.has(name);
}

/** Test-only: reset the registry to its empty state. */
export function resetOutputGateBypassTools(): void {
	bypassTools.clear();
}
