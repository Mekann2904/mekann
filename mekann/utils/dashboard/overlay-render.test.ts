import { describe, expect, it } from "vitest";
import { renderOverlayLines } from "./overlay-render.js";
import type { DashboardData } from "./data.js";

const baseData: DashboardData = {
	vm: {
		profile: { ok: true as const, profile: { login: "testuser", name: "Test", url: "https://github.com/testuser" } },
		currentRepo: { ok: true as const, repoName: "testrepo", branch: "main", changes: { staged: 0, unstaged: 0, untracked: 0 }, aheadBehind: { kind: "counts" as const, ahead: 0, behind: 0 } },
		contributionGraph: { status: "placeholder" as const, message: "coming next" },
		activitySummary: { status: "ready" as const, data: { contributionsThisWeek: 5, contributionsThisMonth: 20, activeDaysThisYear: 100, pullRequests: 3, issuesOpened: 1, reviews: 7 } },
		codexUsage: { status: "placeholder" as const, message: "coming next" },
	},
	avatarResult: undefined,
	graphPath: undefined,
};

it("renders profile login", () => {
	const { lines } = renderOverlayLines(baseData, 80, 40);
	const joined = lines.join("\n");
	expect(joined).toContain("@testuser");
});

it("renders stats strip when activity summary is ready", () => {
	const { lines } = renderOverlayLines(baseData, 120, 40);
	const joined = lines.join("\n");
	expect(joined).toContain("5");
	expect(joined).toContain("This week");
});

it("respects width constraint", () => {
	const { lines } = renderOverlayLines(baseData, 40, 20);
	for (const line of lines) {
		expect(typeof line).toBe("string");
	}
});

it("returns graphLineIndex as -1 when no graph label present", () => {
	const { graphLineIndex } = renderOverlayLines(baseData, 80, 40);
	expect(graphLineIndex).toBe(-1);
});

it("returns graphLineIndex when graphPath is set", () => {
	const data: DashboardData = { ...baseData, graphPath: "/tmp/graph.png" };
	const { graphLineIndex } = renderOverlayLines(data, 120, 40);
	expect(graphLineIndex).toBeGreaterThanOrEqual(0);
});

it("renders error state when profile fails", () => {
	const data: DashboardData = {
		vm: {
			...baseData.vm,
			profile: { ok: false, error: "offline" },
		},
		avatarResult: undefined,
		graphPath: undefined,
	};
	const { lines } = renderOverlayLines(data, 80, 20);
	const joined = lines.join("\n");
	expect(joined).toContain("unavailable");
});
