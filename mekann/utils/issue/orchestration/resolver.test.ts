import { describe, expect, it } from "vitest";
import { isComplete, pickNextChild } from "./resolver.js";
import type { ChildState } from "./state.js";

function child(n: number, overrides: Partial<ChildState> = {}): ChildState {
	return {
		number: n,
		title: `#${n}`,
		url: `https://example/${n}`,
		prMerged: false,
		prExists: false,
		openBlockers: [],
		hasWorktree: false,
		hasActiveWorkPi: false,
		...overrides,
	};
}

describe("pickNextChild", () => {
	it("picks the only startable child", () => {
		const result = pickNextChild([child(67), child(68, { prMerged: true })]);
		expect(result.next?.state.number).toBe(67);
		expect(result.summary).toEqual({ total: 2, done: [68], blocked: [], active: [], startable: [67] });
	});

	it("picks the lowest-numbered startable child (deterministic ordering)", () => {
		const result = pickNextChild([child(69), child(67), child(68)]);
		expect(result.next?.state.number).toBe(67);
		expect(result.summary.startable).toEqual([67, 68, 69]);
	});

	it("returns next undefined when all are done", () => {
		const result = pickNextChild([child(67, { prMerged: true }), child(68, { prMerged: true })]);
		expect(result.next).toBeUndefined();
		expect(isComplete(result.summary)).toBe(true);
	});

	it("returns next undefined when remaining are blocked/active (waiting)", () => {
		const result = pickNextChild([child(67, { hasActiveWorkPi: true }), child(68, { openBlockers: [67] })]);
		expect(result.next).toBeUndefined();
		expect(isComplete(result.summary)).toBe(false);
		expect(result.summary.active).toEqual([67]);
		expect(result.summary.blocked).toEqual([68]);
	});

	it("skips active children to prevent double-launch", () => {
		const result = pickNextChild([child(67, { hasActiveWorkPi: true }), child(68)]);
		expect(result.next?.state.number).toBe(68);
	});

	it("skips blocked children", () => {
		const result = pickNextChild([child(67, { openBlockers: [99] }), child(68)]);
		expect(result.next?.state.number).toBe(68);
	});

	it("prefers fresh start and resume equally (both startable), by number", () => {
		const result = pickNextChild([child(70, { hasWorktree: true }), child(68)]);
		expect(result.next?.state.number).toBe(68);
	});

	it("handles empty input", () => {
		const result = pickNextChild([]);
		expect(result.next).toBeUndefined();
		expect(isComplete(result.summary)).toBe(false);
		expect(result.summary.total).toBe(0);
	});

	it("preserves input order in judgements", () => {
		const input = [child(69), child(67), child(68)];
		const result = pickNextChild(input);
		expect(result.judgements.map((j) => j.state.number)).toEqual([69, 67, 68]);
	});
});

describe("isComplete", () => {
	it("false when total is 0", () => {
		expect(isComplete({ total: 0, done: [], blocked: [], active: [], startable: [] })).toBe(false);
	});
	it("true when all done", () => {
		expect(isComplete({ total: 2, done: [1, 2], blocked: [], active: [], startable: [] })).toBe(true);
	});
	it("false when some remain", () => {
		expect(isComplete({ total: 2, done: [1], blocked: [], active: [], startable: [2] })).toBe(false);
	});
});
