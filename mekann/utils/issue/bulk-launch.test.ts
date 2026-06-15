import { describe, expect, it, vi } from "vitest";

import { bulkLaunchIssues } from "./bulk-launch.js";

describe("bulkLaunchIssues", () => {
	it("creates a worktree and launches Pi once per issue with no existing worktree", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: false }, { issueNumber: 68, hasWorktree: false }],
			deps,
		);

		expect(createWorktree).toHaveBeenCalledTimes(2);
		expect(createWorktree).toHaveBeenNthCalledWith(1, 67);
		expect(createWorktree).toHaveBeenNthCalledWith(2, 68);
		expect(launchPiSession).toHaveBeenCalledTimes(2);
		expect(launchPiSession).toHaveBeenNthCalledWith(1, 67, "/wt/issue-67");
		expect(launchPiSession).toHaveBeenNthCalledWith(2, 68, "/wt/issue-68");
	});

	it("reuses the existing worktree and only launches Pi for issues that already have one", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: true, worktreePath: "/existing/issue-67" }],
			deps,
		);

		expect(createWorktree).not.toHaveBeenCalled();
		expect(launchPiSession).toHaveBeenCalledTimes(1);
		expect(launchPiSession).toHaveBeenCalledWith(67, "/existing/issue-67");
	});

	it("mixes reuse and create correctly across a batch", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: true, worktreePath: "/existing/issue-67" },
				{ issueNumber: 68, hasWorktree: false },
				{ issueNumber: 69, hasWorktree: false },
			],
			deps,
		);

		// Only the two new worktrees are created; the existing one is reused.
		expect(createWorktree).toHaveBeenCalledTimes(2);
		expect(createWorktree).toHaveBeenCalledWith(68);
		expect(createWorktree).toHaveBeenCalledWith(69);
		expect(createWorktree).not.toHaveBeenCalledWith(67);

		// All three issues still launch a Pi session.
		expect(launchPiSession).toHaveBeenCalledTimes(3);
		expect(launchPiSession).toHaveBeenNthCalledWith(1, 67, "/existing/issue-67");
		expect(launchPiSession).toHaveBeenNthCalledWith(2, 68, "/wt/issue-68");
		expect(launchPiSession).toHaveBeenNthCalledWith(3, 69, "/wt/issue-69");
	});

	it("launches in order (serial)", async () => {
		const order: number[] = [];
		const createWorktree = vi.fn((n: number) => {
			order.push(`create-${n}`);
			return `/wt/issue-${n}`;
		});
		const launchPiSession = vi.fn(async (n: number) => {
			order.push(`launch-${n}`);
		});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: false }, { issueNumber: 68, hasWorktree: false }],
			deps,
		);

		// Each issue fully resolves before the next begins.
		expect(order).toEqual(["create-67", "launch-67", "create-68", "launch-68"]);
	});

	it("does nothing for an empty batch", async () => {
		const createWorktree = vi.fn();
		const launchPiSession = vi.fn();
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues([], deps);

		expect(createWorktree).not.toHaveBeenCalled();
		expect(launchPiSession).not.toHaveBeenCalled();
	});
});
