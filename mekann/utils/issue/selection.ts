/**
 * Issue multi-selection state model — a pure deep module.
 *
 * Manages an ordered set of marked issue numbers. Has no dependency on the
 * OpenTUI/React UI layer, the Pi framework, git, or Kitty — so the decision
 * logic (which issues to open on confirm) is fully unit-testable in isolation.
 *
 * The mark-rejection policy for blocked issues (PRD #66 slice 2 / issue #69)
 * lives here in {@link toggleMark}. The model owns the *policy* (a blocked
 * issue can never enter the selection); the caller supplies the dependency
 * *facts* via an {@link IsBlocked} predicate, so this module stays free of any
 * dependency-check type and remains agnostic of where "blocked" comes from.
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
 *
 * Unrestricted toggle (slice 1, issue #67). Prefer {@link toggleMark} when a
 * blocked issue must be kept out of the selection; this primitive performs no
 * rejection and is the building block {@link toggleMark} falls back to for
 * every markable issue.
 */
export function toggleSelection(state: SelectionState, issueNumber: number): SelectionState {
	if (state.selected.includes(issueNumber)) {
		return { selected: state.selected.filter((number) => number !== issueNumber) };
	}
	return { selected: [...state.selected, issueNumber] };
}

/**
 * Predicate supplying the blocked status for an issue number. The selection
 * model owns the toggle-vs-reject *policy*; the caller supplies the dependency
 * *facts* (typically derived from each issue's `openBlockers`/`error`). Injecting
 * the predicate keeps this model free of dependency-check types and fully
 * unit-testable without a UI or `gh` round-trip.
 */
export type IsBlocked = (issueNumber: number) => boolean;

/**
 * Outcome of attempting to toggle an issue's mark. {@link rejected} is set when
 * a blocked issue could not be marked, carrying its number so the caller can
 * explain why the mark did not take effect.
 */
export interface ToggleMarkResult {
	readonly state: SelectionState;
	readonly rejected: boolean;
	/** Present only when {@link rejected} is true. */
	readonly rejectedNumber?: number;
}

/** Predicate that never blocks — use to verify slice-1 parity in tests. */
const NEVER_BLOCKED: IsBlocked = () => false;

/**
 * Attempt to toggle an issue's mark, rejecting blocked issues outright.
 *
 * Contract (PRD #66 slice 2 / issue #69):
 * - A blocked issue can never enter the selection, so a bulk confirm
 *   ({@link issuesToOpen}) can never carry a blocked issue. The model
 *   guarantees this directly — the bulk-launch route receives only markable
 *   issues by construction, independent of any caller-side defence.
 * - Removing an already-marked issue is never rejected. Because a blocked
 *   issue can never be marked, this branch only fires for markable issues,
 *   so it mirrors {@link toggleSelection} exactly.
 * - A non-blocked issue toggles exactly like {@link toggleSelection}, preserving
 *   slice-1 (#67) behaviour for every markable issue.
 *
 * The caller-supplied {@link isBlocked} predicate is consulted fresh on every
 * call, so a change in dependency status between toggles is honoured.
 */
export function toggleMark(
	state: SelectionState,
	issueNumber: number,
	isBlocked: IsBlocked = NEVER_BLOCKED,
): ToggleMarkResult {
	const alreadyMarked = state.selected.includes(issueNumber);
	if (isBlocked(issueNumber) && !alreadyMarked) {
		return { state, rejected: true, rejectedNumber: issueNumber };
	}
	return { state: toggleSelection(state, issueNumber), rejected: false };
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
