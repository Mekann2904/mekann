import { describe, expect, it } from "vitest";
import { normalizeDashboardResponse, parseGitHubViewer, message } from "./github.js";

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

describe("message (IC-243 secret masking)", () => {
	it("returns the auth hint for unauthenticated gh errors", () => {
		expect(message(new Error("To get started with GitHub CLI"))).toBe("GitHub CLI is not authenticated");
	});

	it("masks Bearer tokens in the error text", () => {
		const out = message(new Error("Authorization: Bearer eyJhbGc.leaky.token"));
		expect(out).not.toContain("eyJhbGc.leaky.token");
		expect(out).toContain("[REDACTED]");
	});

	it("masks OpenAI/GitHub keys and api_key values", () => {
		const out = message(new Error("failed with ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd and sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"));
		expect(out).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcd");
		expect(out).not.toContain("sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456");
		expect(out).toContain("[REDACTED_GITHUB_TOKEN]");
		expect(out).toContain("[REDACTED_OPENAI_KEY]");
	});

	it("truncates long messages to 300 chars after masking", () => {
		const out = message(new Error("x".repeat(500)));
		expect(out.length).toBeLessThanOrEqual(300);
	});
});
