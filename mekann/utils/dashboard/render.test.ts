import { describe, expect, it } from "vitest";
import { renderDashboardText } from "./render.js";
import { MEKANN_DASHBOARD_DEFAULTS, type MekannDashboardConfig } from "../../config.js";

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

	it("clamps narrow and wide terminals so the layout never breaks (IC-239)", () => {
		const source = {
			vm: {
				profile: { ok: true, profile: { login: "Mekann2904", name: "Mekann", url: "https://github.com/Mekann2904" } },
				currentRepo: { ok: true, repoName: "mekann", branch: "main", changes: { staged: 0, unstaged: 0, untracked: 0 }, aheadBehind: { kind: "counts", ahead: 0, behind: 0 }, latestCommit: { hash: "abc", subject: "x" } },
				contributionGraph: { status: "placeholder", message: "-" },
				activitySummary: { status: "placeholder", message: "-" },
				codexUsage: { status: "placeholder", message: "-" },
			},
			images: {},
		};
		// Extremely narrow input clamps up to widthMin so boxes still render.
		const narrow = renderDashboardText(source as never, 5);
		expect(narrow.split("\n").length).toBeGreaterThan(1);
		expect(Math.max(...narrow.split("\n").map((l) => l.length))).toBeGreaterThanOrEqual(MEKANN_DASHBOARD_DEFAULTS.widthMin);
		// Extremely wide input clamps down to widthMax (+1 char border) so there is
		// no excess gap, far below the 2000-char input.
		const wide = renderDashboardText(source as never, 2000);
		expect(Math.max(...wide.split("\n").map((l) => l.length))).toBeLessThanOrEqual(MEKANN_DASHBOARD_DEFAULTS.widthMax + 2);
		expect(Math.max(...wide.split("\n").map((l) => l.length))).toBeLessThan(200);
	});

	it("honors an overridden width clamp range (IC-239)", () => {
		const source = {
			vm: {
				profile: { ok: true, profile: { login: "x", url: "u" } },
				currentRepo: { ok: true, repoName: "r", branch: "b", changes: { staged: 0, unstaged: 0, untracked: 0 }, aheadBehind: { kind: "counts", ahead: 0, behind: 0 }, latestCommit: { hash: "h", subject: "s" } },
				contributionGraph: { status: "placeholder", message: "-" },
				activitySummary: { status: "placeholder", message: "-" },
				codexUsage: { status: "placeholder", message: "-" },
			},
			images: {},
		};
		const layout: MekannDashboardConfig = { ...MEKANN_DASHBOARD_DEFAULTS, widthMin: 40, widthMax: 60 };
		const narrow = renderDashboardText(source as never, 5, layout);
		expect(Math.max(...narrow.split("\n").map((l) => l.length))).toBeGreaterThanOrEqual(40);
		const wide = renderDashboardText(source as never, 500, layout);
		expect(Math.max(...wide.split("\n").map((l) => l.length))).toBeLessThanOrEqual(62);
	});
});
