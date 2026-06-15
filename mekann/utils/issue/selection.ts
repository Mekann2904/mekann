/**
 * Issue multi-selection state model — a pure deep module.
 *
 * Manages an ordered set of marked issue numbers. Has no dependency on the
 * OpenTUI/React UI layer, the Pi framework, git, or Kitty — so the decision
 * logic (which issues to open on confirm) is fully unit-testable in isolation.
 *
 * Out of scope for this slice (PRD #66, slice 1 / issue #67): rejecting marks
 * on blocked issues. Blocked-rejection is handled in a later slice; this module
 * is deliberately agnostic of dependency status and trusts its caller's input.
 */

/**
 * Immutable selection state. `selected` preserves insertion order so the bulk
 * launch sequence matches the order the user marked issues in.
 */
export interface SelectionState {
	readonly selected: readonly number[];
}

/** Empty selection — the initial state when the list opens. */
export function createSelectionState(): SelectionState {
	return { selected: [] };
}

/**
 * Toggle an issue's mark. Adding appends to the end (preserving order);
 * removing keeps the relative order of the remaining marks intact.
 * Returns a new state — the input is never mutated.
 */
export function toggleSelection(state: SelectionState, issueNumber: number): SelectionState {
	if (state.selected.includes(issueNumber)) {
		return { selected: state.selected.filter((number) => number !== issueNumber) };
	}
	return { selected: [...state.selected, issueNumber] };
}

/** Whether the given issue number is currently marked. */
export function isMarked(state: SelectionState, issueNumber: number): boolean {
	return state.selected.includes(issueNumber);
}

/** Number of issues currently marked. */
export function selectionCount(state: SelectionState): number {
	return state.selected.length;
}

/**
 * Decide which issue numbers to open on confirm.
 *
 * Mirrors the core UX contract of the multi-select list (issue #67):
 * - No marks → open only the focused issue (preserves the legacy single-select
 *   workflow exactly).
 * - One or more marks → open every marked issue, in mark order.
 *
 * The focused number is required so the "no marks" case can fall back to it.
 */
export function issuesToOpen(state: SelectionState, focusedIssueNumber: number): number[] {
	if (state.selected.length === 0) return [focusedIssueNumber];
	return [...state.selected];
}
