import { describe, expect, it, vi } from "vitest";

import { bulkLaunchIssues } from "./bulk-launch.js";

describe("bulkLaunchIssues", () => {
	it("creates a worktree and launches Pi once per issue with no existing worktree", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: false }, { issueNumber: 68, hasWorktree: false }],
			deps,
		);

		expect(createWorktree).toHaveBeenCalledTimes(2);
		expect(createWorktree).toHaveBeenNthCalledWith(1, 67);
		expect(createWorktree).toHaveBeenNthCalledWith(2, 68);
		expect(launchPiSession).toHaveBeenCalledTimes(2);
		expect(launchPiSession).toHaveBeenNthCalledWith(1, 67, "/wt/issue-67", []);
		expect(launchPiSession).toHaveBeenNthCalledWith(2, 68, "/wt/issue-68", []);
	});

	it("reuses the existing worktree and only launches Pi for issues that already have one", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: true, worktreePath: "/existing/issue-67" }],
			deps,
		);

		expect(createWorktree).not.toHaveBeenCalled();
		expect(launchPiSession).toHaveBeenCalledTimes(1);
		expect(launchPiSession).toHaveBeenCalledWith(67, "/existing/issue-67", []);
	});

	it("mixes reuse and create correctly across a batch", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
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
		expect(launchPiSession).toHaveBeenNthCalledWith(1, 67, "/existing/issue-67", []);
		expect(launchPiSession).toHaveBeenNthCalledWith(2, 68, "/wt/issue-68", []);
		expect(launchPiSession).toHaveBeenNthCalledWith(3, 69, "/wt/issue-69", []);
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

		const result = await bulkLaunchIssues([], deps);

		expect(createWorktree).not.toHaveBeenCalled();
		expect(launchPiSession).not.toHaveBeenCalled();
		expect(result.launched).toEqual([]);
		expect(result.skipped).toEqual([]);
	});

	it("forwards each issue's labels to the launcher so the session can branch into the Agreement phase (ADR-0025 slice E)", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: false, labels: ["ready-for-human"] },
				{ issueNumber: 68, hasWorktree: false, labels: ["ready-for-agent"] },
			],
			deps,
		);

		expect(launchPiSession).toHaveBeenNthCalledWith(1, 67, "/wt/issue-67", ["ready-for-human"]);
		expect(launchPiSession).toHaveBeenNthCalledWith(2, 68, "/wt/issue-68", ["ready-for-agent"]);
	});

	it("defaults labels to an empty array when an issue carries none", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		await bulkLaunchIssues([{ issueNumber: 67, hasWorktree: false }], deps);

		expect(launchPiSession).toHaveBeenCalledWith(67, "/wt/issue-67", []);
	});
});

describe("bulkLaunchIssues error continuation (issue #68)", () => {
	it("skips an issue whose worktree creation fails and continues the rest", async () => {
		const createWorktree = vi.fn((n: number) => {
			if (n === 68) throw new Error("path collision for issue-68");
			return `/wt/issue-${n}`;
		});
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: false },
				{ issueNumber: 68, hasWorktree: false },
				{ issueNumber: 69, hasWorktree: false },
			],
			deps,
		);

		// The failing issue is skipped; both neighbours still create + launch.
		expect(createWorktree).toHaveBeenCalledTimes(3);
		expect(launchPiSession).toHaveBeenCalledTimes(2);
		expect(launchPiSession).toHaveBeenCalledWith(67, "/wt/issue-67", []);
		expect(launchPiSession).toHaveBeenCalledWith(69, "/wt/issue-69", []);
		expect(launchPiSession).not.toHaveBeenCalledWith(68, expect.anything(), expect.anything());

		expect(result.launched).toEqual([67, 69]);
		expect(result.skipped).toEqual([
			{ issueNumber: 68, reason: "path collision for issue-68" },
		]);
	});

	it("skips an issue whose Pi session launch fails and continues the rest", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (n: number) => {
			if (n === 70) throw new Error("kitty remote control unavailable");
		});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 70, hasWorktree: false },
				{ issueNumber: 71, hasWorktree: false },
			],
			deps,
		);

		// Worktree is created for both; only the failing launch is skipped.
		expect(createWorktree).toHaveBeenCalledTimes(2);
		expect(launchPiSession).toHaveBeenCalledTimes(2);
		expect(result.launched).toEqual([71]);
		expect(result.skipped).toEqual([
			{ issueNumber: 70, reason: "kitty remote control unavailable" },
		]);
	});

	it("continues when the very first issue fails", async () => {
		const createWorktree = vi.fn((n: number) => {
			if (n === 67) throw new Error("branch already checked out elsewhere");
			return `/wt/issue-${n}`;
		});
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: false },
				{ issueNumber: 68, hasWorktree: false },
			],
			deps,
		);

		expect(launchPiSession).toHaveBeenCalledTimes(1);
		expect(launchPiSession).toHaveBeenCalledWith(68, "/wt/issue-68", []);
		expect(result.launched).toEqual([68]);
		expect(result.skipped).toEqual([
			{ issueNumber: 67, reason: "branch already checked out elsewhere" },
		]);
	});

	it("records every issue as skipped when all fail", async () => {
		const createWorktree = vi.fn(() => {
			throw new Error("git worktree add failed");
		});
		const launchPiSession = vi.fn(async () => {});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: false },
				{ issueNumber: 68, hasWorktree: false },
			],
			deps,
		);

		expect(createWorktree).toHaveBeenCalledTimes(2);
		expect(launchPiSession).not.toHaveBeenCalled();
		expect(result.launched).toEqual([]);
		expect(result.skipped).toEqual([
			{ issueNumber: 67, reason: "git worktree add failed" },
			{ issueNumber: 68, reason: "git worktree add failed" },
		]);
	});

	it("reports an empty skip list when every issue succeeds (slice-1 behaviour)", async () => {
		const createWorktree = vi.fn((n: number) => `/wt/issue-${n}`);
		const launchPiSession = vi.fn(async (_n: number, _path: string, _labels: string[]) => {});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: true, worktreePath: "/existing/issue-67" },
				{ issueNumber: 68, hasWorktree: false },
			],
			deps,
		);

		expect(result.launched).toEqual([67, 68]);
		expect(result.skipped).toEqual([]);
	});

	it("stringifies non-Error throw values as the skip reason", async () => {
		const createWorktree = vi.fn(() => {
			// eslint-disable-next-line no-throw-literal
			throw "unexpected non-error";
		});
		const launchPiSession = vi.fn(async () => {});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[{ issueNumber: 67, hasWorktree: false }],
			deps,
		);

		expect(result.launched).toEqual([]);
		expect(result.skipped).toEqual([
			{ issueNumber: 67, reason: "unexpected non-error" },
		]);
	});

	it("preserves issue order across a mix of launches and skips", async () => {
		const createWorktree = vi.fn((n: number) => {
			if (n === 68) throw new Error("boom");
			return `/wt/issue-${n}`;
		});
		const launchPiSession = vi.fn(async (n: number) => {
			if (n === 70) throw new Error("launch boom");
		});
		const deps = { createWorktree, launchPiSession };

		const result = await bulkLaunchIssues(
			[
				{ issueNumber: 67, hasWorktree: false },
				{ issueNumber: 68, hasWorktree: false },
				{ issueNumber: 69, hasWorktree: false },
				{ issueNumber: 70, hasWorktree: false },
			],
			deps,
		);

		expect(result.launched).toEqual([67, 69]);
		expect(result.skipped).toEqual([
			{ issueNumber: 68, reason: "boom" },
			{ issueNumber: 70, reason: "launch boom" },
		]);
	});
});
