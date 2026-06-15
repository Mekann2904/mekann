import { describe, expect, it } from "vitest";
import { judgeChild, type ChildState } from "./state.js";

function base(overrides: Partial<ChildState> = {}): ChildState {
	return {
		number: 67,
		title: "Sample",
		url: "https://example/67",
		prMerged: false,
		prExists: false,
		openBlockers: [],
		hasWorktree: false,
		hasActiveWorkPi: false,
		...overrides,
	};
}

describe("judgeChild", () => {
	it("returns done when PR is merged", () => {
		expect(judgeChild(base({ prMerged: true }))).toEqual({ kind: "done", reason: "PR merged" });
	});

	it("merged wins over active work pi (GitHub truth is authoritative)", () => {
		expect(judgeChild(base({ prMerged: true, hasActiveWorkPi: true }))).toEqual({ kind: "done", reason: "PR merged" });
	});

	it("merged wins over blockers", () => {
		expect(judgeChild(base({ prMerged: true, openBlockers: [99] }))).toEqual({ kind: "done", reason: "PR merged" });
	});

	it("returns active when a Work Pi is already open (double-launch prevention)", () => {
		expect(judgeChild(base({ hasActiveWorkPi: true }))).toEqual({ kind: "active", reason: "Work Pi already open" });
	});

	it("active beats blocked", () => {
		expect(judgeChild(base({ hasActiveWorkPi: true, openBlockers: [99] }))).toEqual({ kind: "active", reason: "Work Pi already open" });
	});

	it("active beats startable", () => {
		expect(judgeChild(base({ hasActiveWorkPi: true, hasWorktree: true }))).toEqual({ kind: "active", reason: "Work Pi already open" });
	});

	it("returns blocked when open blockers exist", () => {
		expect(judgeChild(base({ openBlockers: [101, 102] }))).toEqual({
			kind: "blocked",
			reason: "blocked by open issues",
			blockers: [101, 102],
		});
	});

	it("returns a copy of blockers (no mutation leakage)", () => {
		const blockers = [101];
		const verdict = judgeChild(base({ openBlockers: blockers }));
		if (verdict.kind !== "blocked") throw new Error("expected blocked");
		verdict.blockers.push(999);
		expect(blockers).toEqual([101]);
	});

	it("returns startable (fresh) when nothing blocks and no worktree", () => {
		expect(judgeChild(base())).toEqual({ kind: "startable", reason: "fresh start", resume: false });
	});

	it("returns startable (resume) when a worktree exists but Work Pi is closed", () => {
		expect(judgeChild(base({ hasWorktree: true }))).toEqual({ kind: "startable", reason: "worktree exists, resuming", resume: true });
	});
});

describe("judgeChild precedence ordering", () => {
	const cases: Array<{ name: string; state: Partial<ChildState>; expectedKind: ChildState extends never ? never : string }> = [
		{ name: "merged + active + blocked + worktree → done", state: { prMerged: true, hasActiveWorkPi: true, openBlockers: [9], hasWorktree: true }, expectedKind: "done" },
		{ name: "active + blocked + worktree → active", state: { hasActiveWorkPi: true, openBlockers: [9], hasWorktree: true }, expectedKind: "active" },
		{ name: "blocked + worktree → blocked", state: { openBlockers: [9], hasWorktree: true }, expectedKind: "blocked" },
		{ name: "worktree only → startable", state: { hasWorktree: true }, expectedKind: "startable" },
		{ name: "blocked + worktree → blocked (not resume)", state: { openBlockers: [9], hasWorktree: true }, expectedKind: "blocked" },
	];
	for (const c of cases) {
		it(c.name, () => {
			expect(judgeChild(base(c.state)).kind).toBe(c.expectedKind);
		});
	}
});
