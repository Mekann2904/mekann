import { describe, expect, it } from "vitest";

import {
	createSelectionState,
	isMarked,
	issuesToOpen,
	selectionCount,
	toggleSelection,
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
