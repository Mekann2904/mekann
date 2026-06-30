import { describe, expect, it } from "vitest";
import { sortByPriorityThenNewest } from "./query.js";

describe("sortByPriorityThenNewest (IC-192 non-destructive)", () => {
	it("returns a new array ordered by priority asc, then createdAt desc", () => {
		const base = 1000;
		const events = [
			{ priority: 2, createdAt: base + 10 },
			{ priority: 1, createdAt: base },
			{ priority: 1, createdAt: base + 5 },
		];
		const sorted = sortByPriorityThenNewest(events);
		// priority 1 first (newer of the two first), then priority 2.
		expect(sorted.map((e) => e.createdAt)).toEqual([base + 5, base, base + 10]);
	});

	it("does not mutate the input array", () => {
		const events = [
			{ priority: 3, createdAt: 3 },
			{ priority: 1, createdAt: 1 },
			{ priority: 2, createdAt: 2 },
		];
		const snapshot = events.map((e) => ({ ...e }));
		const sorted = sortByPriorityThenNewest(events);

		// Input order and element identity are preserved.
		expect(events.map((e) => e.createdAt)).toEqual(snapshot.map((e) => e.createdAt));
		// A fresh array is returned.
		expect(sorted).not.toBe(events);
	});

	it("returns a distinct reference even when already sorted", () => {
		const events = [
			{ priority: 1, createdAt: 1 },
			{ priority: 2, createdAt: 2 },
		];
		const sorted = sortByPriorityThenNewest(events);
		expect(sorted).not.toBe(events);
		expect(sorted.map((e) => e.createdAt)).toEqual([1, 2]);
	});

	it("leaves the input untouched across many shuffled permutations", () => {
		// Deterministic property-style check: for several input orderings, the
		// original array must remain element-identical after sorting.
		const base = [1, 2, 3, 4, 5].map((i) => ({ priority: i, createdAt: i * 10 }));
		const permutations = [
			[0, 1, 2, 3, 4],
			[4, 3, 2, 1, 0],
			[2, 0, 4, 1, 3],
			[3, 1, 4, 0, 2],
		];
		for (const order of permutations) {
			const input = order.map((i) => ({ ...base[i]! }));
			const before = input.map((e) => ({ ...e }));
			sortByPriorityThenNewest(input);
			expect(input).toEqual(before);
		}
	});
});
