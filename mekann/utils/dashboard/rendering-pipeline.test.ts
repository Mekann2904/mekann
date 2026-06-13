import { describe, expect, it } from "vitest";
import {
	renderOverlayPipeline,
	type DashboardPositionedImage,
} from "./rendering-pipeline.js";
import type { DashboardRenderModel } from "./view-model-assembler.js";
import { visibleWidth } from "./terminal.js";

// ── Helpers ───────────────────────────────────────────────────────────

const baseModel: DashboardRenderModel = {
	vm: {
		profile: {
			ok: true as const,
			profile: {
				login: "testuser",
				name: "Test",
				url: "https://github.com/testuser",
			},
		},
		currentRepo: {
			ok: true as const,
			repoName: "testrepo",
			branch: "main",
			changes: { staged: 0, unstaged: 0, untracked: 0 },
			aheadBehind: { kind: "counts" as const, ahead: 0, behind: 0 },
		},
		contributionGraph: { status: "placeholder" as const, message: "coming next" },
		activitySummary: {
			status: "ready" as const,
			data: {
				contributionsThisWeek: 5,
				contributionsThisMonth: 20,
				activeDaysThisYear: 100,
				pullRequests: 3,
				issuesOpened: 1,
				reviews: 7,
			},
		},
		codexUsage: { status: "placeholder" as const, message: "coming next" },
	},
	images: {},
};

// ── Text lines ────────────────────────────────────────────────────────

describe("renderOverlayPipeline — text lines", () => {
	it("produces lines matching the requested height", () => {
		const { lines } = renderOverlayPipeline(baseModel, 120, 25);
		expect(lines.length).toBe(25);
	});

	it("includes profile login", () => {
		const { lines } = renderOverlayPipeline(baseModel, 120, 40);
		expect(lines.join("\n")).toContain("@testuser");
	});

	it("includes stats strip when activity is ready", () => {
		const { lines } = renderOverlayPipeline(baseModel, 120, 40);
		const joined = lines.join("\n");
		expect(joined).toContain("This week");
		expect(joined).toContain("5");
	});

	it("truncates lines to the requested visible width", () => {
		const { lines } = renderOverlayPipeline(baseModel, 40, 20);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(40);
		}
	});

	it("renders error state when profile fails", () => {
		const model: DashboardRenderModel = {
			vm: {
				...baseModel.vm,
				profile: { ok: false, error: "offline" },
			},
			images: {},
		};
		const { lines } = renderOverlayPipeline(model, 80, 20);
		expect(lines.join("\n")).toContain("unavailable");
	});

	it("renders text fallback for contribution graph when no image", () => {
		const model: DashboardRenderModel = {
			vm: {
				...baseModel.vm,
				contributionGraph: {
					status: "ready",
					data: [{ date: "2026-06-01", count: 3, level: 2 }],
				},
			},
			images: {},
		};
		const { lines } = renderOverlayPipeline(model, 120, 40);
		expect(lines.join("\n")).toContain("CONTRIBUTION GRAPH");
	});
});

// ── Image placements ──────────────────────────────────────────────────

describe("renderOverlayPipeline — image placements", () => {
	it("returns no placements when model has no images", () => {
		const { imagePlacements } = renderOverlayPipeline(baseModel, 120, 40);
		expect(imagePlacements).toEqual([]);
	});

	it("places avatar at row 0 with correct dimensions", () => {
		const model: DashboardRenderModel = {
			...baseModel,
			images: {
				avatar: {
					kind: "avatar",
					path: "/tmp/avatar.png",
					columns: 20,
					rows: 8,
				},
			},
		};
		const { imagePlacements } = renderOverlayPipeline(model, 120, 40);
		expect(imagePlacements).toHaveLength(1);

		const avatar = imagePlacements.find((p) => p.kind === "avatar")!;
		expect(avatar).toBeDefined();
		expect(avatar.startRow).toBe(0);
		expect(avatar.startCol).toBe(1);
		expect(avatar.path).toBe("/tmp/avatar.png");
		expect(avatar.columns).toBe(20);
		expect(avatar.rows).toBe(8);
	});

	it("places contribution graph after the label line", () => {
		const model: DashboardRenderModel = {
			...baseModel,
			images: {
				contributionGraph: {
					kind: "contributionGraph",
					path: "/tmp/graph.png",
					columns: 140,
					rows: 10,
				},
			},
		};
		const { imagePlacements, lines } = renderOverlayPipeline(model, 120, 40);

		const graph = imagePlacements.find(
			(p) => p.kind === "contributionGraph",
		)!;
		expect(graph).toBeDefined();
		expect(graph.startCol).toBe(1);
		expect(graph.path).toBe("/tmp/graph.png");

		// The label "Contribution graph" should be one row above the image start
		const labelIdx = lines.findIndex((l) =>
			l.includes("Contribution graph"),
		);
		expect(labelIdx).toBe(graph.startRow - 1);
	});

	it("places both avatar and graph with correct positions", () => {
		const model: DashboardRenderModel = {
			...baseModel,
			images: {
				avatar: {
					kind: "avatar",
					path: "/tmp/avatar.png",
					columns: 20,
					rows: 8,
				},
				contributionGraph: {
					kind: "contributionGraph",
					path: "/tmp/graph.png",
					columns: 140,
					rows: 10,
				},
			},
		};
		const { imagePlacements } = renderOverlayPipeline(model, 120, 40);
		expect(imagePlacements).toHaveLength(2);

		const avatar = imagePlacements.find((p) => p.kind === "avatar")!;
		const graph = imagePlacements.find(
			(p) => p.kind === "contributionGraph",
		)!;
		expect(avatar.startRow).toBe(0);
		expect(graph.startRow).toBeGreaterThan(avatar.startRow + avatar.rows);
	});

	it("reserves blank lines matching image rows", () => {
		const model: DashboardRenderModel = {
			...baseModel,
			images: {
				avatar: {
					kind: "avatar",
					path: "/tmp/a.png",
					columns: 20,
					rows: 8,
				},
			},
		};
		const { lines } = renderOverlayPipeline(model, 120, 40);
		// First 8 lines should be blank (avatar placeholder)
		for (let i = 0; i < 8; i++) {
			expect(lines[i]!.trim()).toBe("");
		}
		// Line 8 should have the login
		expect(lines[8]).toContain("@testuser");
	});
});
