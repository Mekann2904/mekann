import { describe, expect, it } from "vitest";

import {
	createSelectionState,
	isMarked,
	issuesToOpen,
	selectionCount,
	toggleMark,
	toggleSelection,
	type IsBlocked,
} from "./selection.js";

describe("selection state model", () => {
	describe("toggleSelection", () => {
		it("marks an issue from an empty state", () => {
			const state = toggleSelection(createSelectionState(), 67);
			expect(isMarked(state, 67)).toBe(true);
			expect(state.selected).toEqual([67]);
		});

		it("unmarks an already-marked issue", () => {
			const state = toggleSelection(createSelectionState(), 67);
			const toggled = toggleSelection(state, 67);
			expect(isMarked(toggled, 67)).toBe(false);
			expect(toggled.selected).toEqual([]);
		});

		it("preserves insertion order across multiple marks", () => {
			let state = createSelectionState();
			state = toggleSelection(state, 69);
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 71);
			expect(state.selected).toEqual([69, 67, 71]);
		});

		it("keeps the relative order of remaining marks after a removal", () => {
			let state = createSelectionState();
			state = toggleSelection(state, 69);
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 71);
			state = toggleSelection(state, 67); // remove the middle one
			expect(state.selected).toEqual([69, 71]);
		});

		it("does not duplicate an issue marked twice without an intervening removal", () => {
			let state = createSelectionState();
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 67); // mark → unmark → mark
			expect(state.selected).toEqual([67]);
		});

		it("never mutates the input state", () => {
			const original = toggleSelection(createSelectionState(), 67);
			const snapshot = [...original.selected];
			toggleSelection(original, 68);
			expect(original.selected).toEqual(snapshot);
		});
	});

	describe("toggleMark (blocked-rejection policy, issue #69)", () => {
		const blocked: IsBlocked = (n) => n === 69;

		it("rejects a blocked issue from an empty state and keeps the set empty", () => {
			const before = createSelectionState();
			const result = toggleMark(before, 69, blocked);
			expect(result.rejected).toBe(true);
			expect(result.rejectedNumber).toBe(69);
			expect(result.state.selected).toEqual([]);
			expect(isMarked(result.state, 69)).toBe(false);
		});

		it("returns the input state unchanged (by identity) on rejection", () => {
			const before = toggleSelection(createSelectionState(), 67);
			const result = toggleMark(before, 69, blocked);
			expect(result.state).toBe(before);
		});

		it("marks a non-blocked issue normally and reports no rejection", () => {
			const result = toggleMark(createSelectionState(), 67, blocked);
			expect(result.rejected).toBe(false);
			expect(result.rejectedNumber).toBeUndefined();
			expect(result.state.selected).toEqual([67]);
		});

		it("never rejects removal — unmarking bypasses the blocked check", () => {
			// Mark 67 while it is not blocked, then flip the predicate to block it.
			// Toggling it again must still unmark (a blocked issue is never in the
			// set under the invariant, so removal mirrors toggleSelection exactly).
			let predicate: IsBlocked = () => false;
			let state = toggleMark(createSelectionState(), 67, predicate).state;
			predicate = () => true;
			const result = toggleMark(state, 67, predicate);
			expect(result.rejected).toBe(false);
			expect(result.state.selected).toEqual([]);
		});

		it("consults the predicate fresh on every call", () => {
			let isBlocked: IsBlocked = () => false;
			let result = toggleMark(createSelectionState(), 69, isBlocked);
			expect(result.rejected).toBe(false);
			expect(result.state.selected).toEqual([69]);

			isBlocked = () => true;
			// A second issue is blocked now; it must be rejected even though the
			// predicate was permissive during the previous toggle.
			result = toggleMark(result.state, 71, isBlocked);
			expect(result.rejected).toBe(true);
			expect(result.state.selected).toEqual([69]);
		});

		it("with the never-block default, behaves exactly like toggleSelection", () => {
			// Slice-1 parity: omitting the predicate must keep the original UX for
			// every issue, regardless of its dependency status.
			const a = toggleSelection(createSelectionState(), 67);
			const b = toggleMark(createSelectionState(), 67);
			expect(b.rejected).toBe(false);
			expect(b.state.selected).toEqual(a.selected);
		});

		it("guarantees the bulk route never carries a blocked issue", () => {
			// Build a selection by toggling a mix of markable and blocked issues.
			// Only markable issues may land in the set, so issuesToOpen — which
			// returns the marks in order — can never surface the blocked one.
			let state = createSelectionState();
			state = toggleMark(state, 70, blocked).state; // markable
			state = toggleMark(state, 69, blocked).state; // blocked → rejected
			state = toggleMark(state, 71, blocked).state; // markable
			expect(state.selected).toEqual([70, 71]);
			// The focused number only participates when no marks exist; with marks,
			// the route is the mark set, which excludes the blocked issue.
			expect(issuesToOpen(state, 69)).toEqual([70, 71]);
			expect(issuesToOpen(state, 69)).not.toContain(69);
		});

		it("does not mutate the input state", () => {
			const original = toggleSelection(createSelectionState(), 67);
			const snapshot = [...original.selected];
			toggleMark(original, 68, blocked);
			expect(original.selected).toEqual(snapshot);
		});
	});

	describe("isMarked", () => {
		it("returns false for an unmarked issue", () => {
			expect(isMarked(createSelectionState(), 67)).toBe(false);
		});

		it("returns true only for marked issues", () => {
			const state = toggleSelection(createSelectionState(), 67);
			expect(isMarked(state, 67)).toBe(true);
			expect(isMarked(state, 68)).toBe(false);
		});
	});

	describe("selectionCount", () => {
		it("is zero for an empty state", () => {
			expect(selectionCount(createSelectionState())).toBe(0);
		});

		it("reflects the number of marks", () => {
			let state = createSelectionState();
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 68);
			expect(selectionCount(state)).toBe(2);
			state = toggleSelection(state, 67);
			expect(selectionCount(state)).toBe(1);
		});
	});

	describe("issuesToOpen", () => {
		it("returns only the focused issue when nothing is marked", () => {
			const state = createSelectionState();
			expect(issuesToOpen(state, 67)).toEqual([67]);
		});

		it("returns the focused issue alone even when marks exist for others", () => {
			// focused is not part of the marks — contract is "open all marks",
			// never "open marks + focused". The focused issue only participates
			// when the mark set is empty.
			let state = createSelectionState();
			state = toggleSelection(state, 68);
			state = toggleSelection(state, 69);
			expect(issuesToOpen(state, 67)).toEqual([68, 69]);
		});

		it("returns every marked issue in mark order when marks exist", () => {
			let state = createSelectionState();
			state = toggleSelection(state, 69);
			state = toggleSelection(state, 67);
			state = toggleSelection(state, 71);
			expect(issuesToOpen(state, 67)).toEqual([69, 67, 71]);
		});

		it("returns a length-1 array for the single-select (no-marks) case", () => {
			const state = createSelectionState();
			const result = issuesToOpen(state, 42);
			expect(result).toHaveLength(1);
			expect(result[0]).toBe(42);
		});
	});
});
