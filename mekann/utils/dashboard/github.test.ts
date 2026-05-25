import { describe, expect, it } from "vitest";
import { normalizeDashboardResponse, parseGitHubViewer } from "./github.js";

describe("parseGitHubViewer", () => {
	it("normalizes a GraphQL viewer object", () => {
		expect(parseGitHubViewer({ login: "yinyo02904", name: "Yin", bio: "Building", location: "Earth", url: "https://github.com/yinyo02904", avatarUrl: "https://example.test/avatar.png" })).toEqual({ login: "yinyo02904", name: "Yin", bio: "Building", location: "Earth", url: "https://github.com/yinyo02904", avatarUrl: "https://example.test/avatar.png" });
	});

	it("falls back to unknown login", () => {
		expect(parseGitHubViewer(null).login).toBe("unknown");
	});

	it("normalizes dashboard activity", () => {
		const data = normalizeDashboardResponse({ data: { viewer: { login: "me", contributionsCollection: { contributionCalendar: { weeks: [{ contributionDays: [{ date: "2026-05-25", contributionCount: 2, contributionLevel: "FIRST_QUARTILE" }] }] }, pullRequestContributionsByRepository: [{ contributions: { totalCount: 3 } }], issueContributionsByRepository: [{ contributions: { totalCount: 4 } }], pullRequestReviewContributionsByRepository: [{ contributions: { totalCount: 5 } }] } } } }, new Date("2026-05-25T12:00:00"));
		expect(data.activity.contributionsThisWeek).toBe(2);
		expect(data.activity.pullRequests).toBe(3);
		expect(data.activity.issuesOpened).toBe(4);
		expect(data.activity.reviews).toBe(5);
	});
});
