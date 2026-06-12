import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

describe("GitHub dashboard fallback", () => {
	beforeEach(() => {
		execFileMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses GH_TOKEN as a fallback when gh is unauthenticated", async () => {
		execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
			const error = new Error("Command failed: gh api graphql\nTo get started with GitHub CLI, please run: gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.");
			cb(error, "", "");
		});

		const fetchMock = vi.fn(async (_url, init: RequestInit) => {
			expect(init.headers).toMatchObject({ authorization: "Bearer gh-token" });
			return new Response(JSON.stringify({ data: { viewer: { login: "me", contributionsCollection: { contributionCalendar: { weeks: [] } } } } }), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const { collectGitHubDashboard } = await import("./github.js");
		const result = await collectGitHubDashboard({ GH_TOKEN: "gh-token" }, new Date("2026-05-31T00:00:00Z"));

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.profile.login).toBe("me");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("returns a short actionable auth error without echoing the GraphQL query", async () => {
		execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
			cb(new Error("Command failed: gh api graphql -f query=query { viewer { login contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } } } } }\nTo get started with GitHub CLI, please run: gh auth login"), "", "");
		});

		const { collectGitHubDashboard } = await import("./github.js");
		const result = await collectGitHubDashboard({}, new Date("2026-05-31T00:00:00Z"));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("gh failed: GitHub CLI is not authenticated; run gh auth login or set GITHUB_TOKEN/GH_TOKEN");
			expect(result.error).not.toContain("contributionCalendar");
		}
	});
});
