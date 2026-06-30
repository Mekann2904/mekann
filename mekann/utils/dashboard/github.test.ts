import { describe, expect, it } from "vitest";
import { DASHBOARD_QUERY, maskSecrets, normalizeDashboardResponse, parseGitHubViewer } from "./github.js";

describe("DASHBOARD_QUERY", () => {
	it("passes from/to via GraphQL variables, not string interpolation", () => {
		expect(DASHBOARD_QUERY).toContain("$from: DateTime!");
		expect(DASHBOARD_QUERY).toContain("$to: DateTime!");
		expect(DASHBOARD_QUERY).toContain("from: $from");
		expect(DASHBOARD_QUERY).toContain("to: $to");
		// No raw date interpolation markers that would enable GraphQL injection.
		expect(DASHBOARD_QUERY).not.toContain('"${');
		expect(DASHBOARD_QUERY).not.toMatch(/contributionsCollection\(from: "/);
	});
});

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

describe("maskSecrets", () => {
	it("strips configured GitHub token values from arbitrary text", () => {
		const token = "ghp_abcdef1234567890tokenvalue";
		const env = { GITHUB_TOKEN: token };
		const text = `auth header was Bearer ${token} and something else`;
		expect(maskSecrets(text, env)).toBe("auth header was Bearer [REDACTED] and something else");
		expect(maskSecrets(text, env)).not.toContain(token);
	});

	it("ignores short secrets to avoid redacting common substrings", () => {
		expect(maskSecrets("abc", { GITHUB_TOKEN: "abc" })).toBe("abc");
	});

	it("redacts both GITHUB_TOKEN and GH_TOKEN", () => {
		const env = { GITHUB_TOKEN: "ghp_longtokenvalue123", GH_TOKEN: "ghp_othertokenvalue456" };
		const out = maskSecrets("first ghp_longtokenvalue123 second ghp_othertokenvalue456", env);
		expect(out).toBe("first [REDACTED] second [REDACTED]");
	});
});
