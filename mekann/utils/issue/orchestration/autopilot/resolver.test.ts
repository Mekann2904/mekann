import { describe, expect, it } from "vitest";
import { isAutopilotComplete, isAutopilotEmpty, pickNextAutopilot } from "./resolver.js";
import type { AutopilotChildState } from "./state.js";

function candidate(number: number, overrides: Partial<AutopilotChildState> = {}): AutopilotChildState {
	return {
		number,
		title: `#${number}`,
		url: `https://example/${number}`,
		labels: ["ready-for-agent"],
		prExists: false,
		openBlockers: [],
		hasWorktree: false,
		hasActiveWorkPi: false,
		...overrides,
	};
}

describe("pickNextAutopilot", () => {
	it("picks the lowest-numbered startable candidate", () => {
		const result = pickNextAutopilot([candidate(67), candidate(68), candidate(69)]);
		expect(result.next?.state.number).toBe(67);
		expect(result.summary.startable).toEqual([67, 68, 69]);
	});

	it("skips done/active/blocked and starts the first startable", () => {
		const result = pickNextAutopilot([
			candidate(67, { prExists: true }),
			candidate(68, { hasActiveWorkPi: true }),
			candidate(69, { openBlockers: [100] }),
			candidate(70),
		]);
		expect(result.next?.state.number).toBe(70);
		expect(result.summary.startable).toEqual([70]);
		expect(result.summary.done).toEqual([67]);
		expect(result.summary.active).toEqual([68]);
		expect(result.summary.blocked).toEqual([69]);
	});

	it("returns no next when none is startable", () => {
		const result = pickNextAutopilot([
			candidate(67, { hasActiveWorkPi: true }),
			candidate(68, { openBlockers: [67] }),
		]);
		expect(result.next).toBeUndefined();
		expect(result.summary.startable).toEqual([]);
	});

	it("treats ready-for-human as done", () => {
		const result = pickNextAutopilot([candidate(67, { labels: ["ready-for-human"] })]);
		expect(result.summary.done).toEqual([67]);
		expect(result.next).toBeUndefined();
	});
});

describe("completion predicates", () => {
	it("isAutopilotComplete only when all candidates are done", () => {
		expect(isAutopilotComplete({ total: 2, done: [1, 2], active: [], blocked: [], startable: [] })).toBe(true);
		expect(isAutopilotComplete({ total: 2, done: [1], active: [2], blocked: [], startable: [] })).toBe(false);
		expect(isAutopilotComplete({ total: 0, done: [], active: [], blocked: [], startable: [] })).toBe(false);
	});

	it("isAutopilotEmpty only when there are zero candidates", () => {
		expect(isAutopilotEmpty({ total: 0, done: [], active: [], blocked: [], startable: [] })).toBe(true);
		expect(isAutopilotEmpty({ total: 1, done: [1], active: [], blocked: [], startable: [] })).toBe(false);
	});
});
