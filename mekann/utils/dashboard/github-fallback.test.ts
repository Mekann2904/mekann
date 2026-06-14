import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("GitHub dashboard fallback", () => {
	const originalFetch = globalThis.fetch;
	const originalPath = process.env.PATH;
	let tempDir: string | undefined;

	beforeEach(() => {
		globalThis.fetch = originalFetch;
		tempDir = mkdtempSync(join(tmpdir(), "mekann-gh-test-"));
		process.env.PATH = `${tempDir}:${originalPath ?? ""}`;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env.PATH = originalPath;
		if (tempDir) rmSync(tempDir, { recursive: true, force: true });
		tempDir = undefined;
	});

	function writeFailingGh(stderr: string): void {
		if (!tempDir) throw new Error("tempDir not initialized");
		const path = join(tempDir, "gh");
		writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(stderr)} >&2\nexit 1\n`);
		chmodSync(path, 0o755);
	}

	it("uses GH_TOKEN as a fallback when gh is unauthenticated", async () => {
		writeFailingGh("Command failed: gh api graphql\nTo get started with GitHub CLI, please run: gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.");

		const fetchMock = vi.fn(async (_url, init: RequestInit) => {
			expect(init.headers).toMatchObject({ authorization: "Bearer gh-token" });
			return new Response(JSON.stringify({ data: { viewer: { login: "me", contributionsCollection: { contributionCalendar: { weeks: [] } } } } }), { status: 200 });
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const { collectGitHubDashboard } = await import("./github.js");
		const result = await collectGitHubDashboard({ GH_TOKEN: "gh-token" }, new Date("2026-05-31T00:00:00Z"));

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.profile.login).toBe("me");
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it("returns a short actionable auth error without echoing the GraphQL query", async () => {
		writeFailingGh("Command failed: gh api graphql -f query=query { viewer { login contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } } } } }\nTo get started with GitHub CLI, please run: gh auth login");

		const { collectGitHubDashboard } = await import("./github.js");
		const result = await collectGitHubDashboard({}, new Date("2026-05-31T00:00:00Z"));

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe("gh failed: GitHub CLI is not authenticated; run gh auth login or set GITHUB_TOKEN/GH_TOKEN");
			expect(result.error).not.toContain("contributionCalendar");
		}
	});
});
