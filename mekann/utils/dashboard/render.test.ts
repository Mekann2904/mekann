import { describe, expect, it } from "vitest";
import { renderDashboardText } from "./render.js";

describe("renderDashboardText", () => {
	it("renders a boxed overview layout", () => {
		const text = renderDashboardText({
			vm: {
				profile: { ok: true, profile: { login: "Mekann2904", name: "Mekann", url: "https://github.com/Mekann2904" } },
				currentRepo: { ok: true, repoName: "mekann", branch: "main", changes: { staged: 0, unstaged: 6, untracked: 3 }, aheadBehind: { kind: "counts", ahead: 0, behind: 0 }, latestCommit: { hash: "5d327b4", subject: "add" } },
				contributionGraph: { status: "placeholder", message: "Contribution graph: coming next" },
				activitySummary: { status: "placeholder", message: "Activity summary: coming next" },
				codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
			},
			images: {},
		}, 100);
		expect(text).toContain("┌─ PROFILE");
		expect(text).toContain("┌─ CONTRIBUTION GRAPH");
		expect(text).toContain("┌─ CURRENT REPO");
		expect(text).toContain("┌─ ACTIVITY SUMMARY");
		expect(text).toContain("┌─ CODEX USAGE");
	});
});
