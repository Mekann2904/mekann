import { describe, it, expect, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

/**
 * Track peak in-flight invocations by incrementing a counter on enter and
 * decrementing on exit, recording the high-water mark.
 */
function makeTracker() {
	let inFlight = 0;
	let peak = 0;
	const seen: number[] = [];
	const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	return {
		peak: () => peak,
		seen: () => seen,
		mapper: vi.fn(async (item: number, index: number): Promise<number> => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			seen.push(index);
			// Stagger so concurrency is observable: later items resolve sooner.
			await delay(10 - (item % 5));
			inFlight--;
			return item * 10;
		}),
	};
}

describe("mapWithConcurrency", () => {
	it("preserves input order regardless of completion order", async () => {
		const t = makeTracker();
		const items = [4, 1, 3, 0, 2]; // mixed completion order
		const out = await mapWithConcurrency(items, 2, t.mapper);
		// Output is positional, not completion order.
		expect(out).toEqual([40, 10, 30, 0, 20]);
	});

	it("never exceeds the concurrency cap", async () => {
		const t = makeTracker();
		await mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7], 3, t.mapper);
		expect(t.peak()).toBeLessThanOrEqual(3);
	});

	it("caps concurrency at 1 when given an invalid value (clamped ≥1)", async () => {
		const t = makeTracker();
		await mapWithConcurrency([0, 1, 2, 3], 0, t.mapper);
		expect(t.peak()).toBe(1);
		// Serial execution => strictly ascending source indices.
		expect(t.seen()).toEqual([0, 1, 2, 3]);
	});

	it("handles NaN / negative concurrency by clamping to 1", async () => {
		const t = makeTracker();
		const out = await mapWithConcurrency([0, 1, 2], Number.NaN, t.mapper);
		expect(out).toEqual([0, 10, 20]);
		expect(t.peak()).toBe(1);
	});

	it("maps all items when concurrency exceeds the array length", async () => {
		const t = makeTracker();
		const out = await mapWithConcurrency([0, 1, 2], 10, t.mapper);
		expect(out).toEqual([0, 10, 20]);
		// Only 3 items, so peak can't exceed 3 even with cap 10.
		expect(t.peak()).toBe(3);
	});

	it("returns an empty array for empty input without calling the mapper", async () => {
		const t = makeTracker();
		const out = await mapWithConcurrency([], 5, t.mapper);
		expect(out).toEqual([]);
		expect(t.mapper).not.toHaveBeenCalled();
	});

	it("passes the source index to the mapper (not the batch offset)", async () => {
		const indices: number[] = [];
		await mapWithConcurrency(["a", "b", "c", "d", "e"], 2, async (_item, index) => {
			indices.push(index);
			return _item;
		});
		expect(indices).toEqual([0, 1, 2, 3, 4]);
	});
});
