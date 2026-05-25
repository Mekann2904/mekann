import { describe, expect, it } from "vitest";
import { createDashboardPiComponent } from "./pi-component.js";
import type { DashboardData } from "./data.js";

const baseData: DashboardData = {
	vm: {
		profile: { ok: true as const, profile: { login: "Mekann2904", name: "Mekann", url: "https://github.com/Mekann2904" } },
		currentRepo: { ok: true as const, repoName: "mekann", branch: "main", changes: { staged: 0, unstaged: 0, untracked: 0 }, aheadBehind: { kind: "counts" as const, ahead: 0, behind: 0 }, latestCommit: { hash: "abc1234", subject: "add" } },
		contributionGraph: { status: "placeholder", message: "Contribution graph: coming next" },
		activitySummary: { status: "placeholder", message: "Activity summary: coming next" },
		codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
	},
	avatarResult: undefined,
	graphPath: undefined,
};

it("renders dashboard lines within the requested width", () => {
	const component = createDashboardPiComponent(baseData, () => {});
	const lines = component.render(80);
	const joined = lines.join("\n");
	expect(joined).toContain("@Mekann2904");
	expect(lines.length).toBeGreaterThan(0);
});

it("fills to terminal height", () => {
	const origRows = process.stdout.rows;
	Object.defineProperty(process.stdout, "rows", { value: 20, writable: true, configurable: true });
	try {
		const component = createDashboardPiComponent(baseData, () => {});
		const lines = component.render(80);
		expect(lines.length).toBeGreaterThanOrEqual(18);
	} finally {
		Object.defineProperty(process.stdout, "rows", { value: origRows, writable: true, configurable: true });
	}
});

it("reserves avatar placeholder lines when avatarResult is ok", () => {
	const data: DashboardData = {
		...baseData,
		avatarResult: { ok: true, path: "/tmp/fake-avatar.jpg", columns: 20, rows: 8 },
	};
	const component = createDashboardPiComponent(data, () => {});
	const lines = component.render(120);
	const loginIndex = lines.findIndex(l => l.includes("@Mekann2904"));
	expect(loginIndex).toBe(8); // 8 avatar lines(0-7) then login(8)
});

it("does not reserve avatar lines when avatarResult is undefined", () => {
	const component = createDashboardPiComponent(baseData, () => {});
	const lines = component.render(120);
	const loginIndex = lines.findIndex(l => l.includes("@Mekann2904"));
	expect(loginIndex).toBe(0); // login is first line
});

it("does not reserve avatar lines when avatarResult is error", () => {
	const data: DashboardData = {
		...baseData,
		avatarResult: { ok: false, error: "Kitty unavailable" },
	};
	const component = createDashboardPiComponent(data, () => {});
	const lines = component.render(120);
	const loginIndex = lines.findIndex(l => l.includes("@Mekann2904"));
	expect(loginIndex).toBe(0);
});

it("reserves graph placeholder lines when graphPath is set", () => {
	const data: DashboardData = {
		...baseData,
		graphPath: "/tmp/fake-graph.png",
	};
	const component = createDashboardPiComponent(data, () => {});
	const lines = component.render(120);
	const graphIdx = lines.findIndex(l => l.includes("Contribution graph"));
	expect(graphIdx).toBeGreaterThanOrEqual(0);
	for (let i = 1; i <= 10; i++) {
		expect(lines[graphIdx + i]?.trim()).toBe("");
	}
});

it("closes on q", () => {
	let closed = false;
	const data: DashboardData = {
		vm: {
			profile: { ok: false, error: "offline" },
			currentRepo: { ok: false, error: "not a repo" },
			contributionGraph: { status: "error", message: "offline" },
			activitySummary: { status: "error", message: "offline" },
			codexUsage: { status: "placeholder", message: "Codex usage summary: coming next" },
		},
		avatarResult: undefined,
		graphPath: undefined,
	};
	const component = createDashboardPiComponent(data, () => { closed = true; });
	component.handleInput?.("q");
	expect(closed).toBe(true);
});
