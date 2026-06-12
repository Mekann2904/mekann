import { describe, expect, it } from "vitest";
import {
	assembleDashboardRenderModel,
	type DashboardAssemblyDeps,
} from "./view-model-assembler.js";

// ---------------------------------------------------------------------------
// Fake deps
// ---------------------------------------------------------------------------

function mkDeps(overrides: Partial<DashboardAssemblyDeps> = {}): DashboardAssemblyDeps {
	return {
		collectGitHubDashboard: async () => ({
			ok: true,
			data: {
				profile: {
					login: "testuser",
					name: "Test",
					avatarUrl: "https://example.com/avatar.png",
					url: "https://github.com/testuser",
				},
				contributionDays: [{ date: "2026-05-27", count: 5, level: 2 }],
				activity: {
					contributionsThisWeek: 10,
					contributionsThisMonth: 40,
					activeDaysThisYear: 100,
					pullRequests: 5,
					issuesOpened: 2,
					reviews: 8,
				},
			},
		}),
		collectCurrentRepo: async () => ({
			ok: true,
			repoName: "testrepo",
			branch: "main",
			changes: { staged: 0, unstaged: 0, untracked: 0 },
			aheadBehind: { kind: "counts" as const, ahead: 0, behind: 0 },
		}),
		prepareImages: async () => ({
			avatarResult: undefined,
			graphPath: undefined,
		}),
		codexUsageSource: {
			query: async () => ({
				ok: true,
				report: {
					source: "codex-app-server",
					capturedAt: 1,
					planType: "pro",
					snapshots: [{ limitId: "primary", primary: { usedPercent: 42 } }],
				},
			}),
		},
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assembleDashboardRenderModel", () => {
	it("assembles view-model from GitHub success + repo success", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp/project" },
			mkDeps(),
		);
		expect(model.vm.profile.ok).toBe(true);
		if (model.vm.profile.ok) {
			expect(model.vm.profile.profile.login).toBe("testuser");
		}
		expect(model.vm.currentRepo.ok).toBe(true);
		expect(model.vm.contributionGraph.status).toBe("ready");
		expect(model.vm.activitySummary.status).toBe("ready");
		expect(model.vm.codexUsage.status).toBe("ready");
	});

	it("produces error panels when GitHub fails", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp/project" },
			mkDeps({
				collectGitHubDashboard: async () => ({
					ok: false,
					error: "network error",
				}),
			}),
		);
		expect(model.vm.profile.ok).toBe(false);
		if (!model.vm.profile.ok) {
			expect(model.vm.profile.error).toBe("network error");
		}
		expect(model.vm.contributionGraph.status).toBe("error");
		expect(model.vm.activitySummary.status).toBe("error");
	});

	it("builds codex usage panel from adapter", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps(),
		);
		expect(model.vm.codexUsage.status).toBe("ready");
		if (model.vm.codexUsage.status === "ready") {
			expect(model.vm.codexUsage.data).toContain("42% used");
		}
	});

	it("renders codex usage adapter errors", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps({
				codexUsageSource: {
					query: async () => ({ ok: false, errors: [{ source: "codex-app-server", message: "no auth" }] }),
				},
			}),
		);
		expect(model.vm.codexUsage).toEqual({ status: "error", message: "no auth" });
	});

	it("returns empty images when images disabled", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp", images: false },
			mkDeps(),
		);
		expect(model.images.avatar).toBeUndefined();
		expect(model.images.contributionGraph).toBeUndefined();
	});

	it("creates avatar placement intent on image success", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps({
				prepareImages: async () => ({
					avatarResult: {
						ok: true,
						path: "/tmp/avatar.png",
						columns: 20,
						rows: 8,
					},
					graphPath: undefined,
				}),
			}),
		);
		expect(model.images.avatar).toBeDefined();
		expect(model.images.avatar?.kind).toBe("avatar");
		expect(model.images.avatar?.path).toBe("/tmp/avatar.png");
		expect(model.images.avatar?.columns).toBe(20);
		expect(model.images.avatar?.rows).toBe(8);
	});

	it("creates contributionGraph placement intent on graph success", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps({
				prepareImages: async () => ({
					avatarResult: undefined,
					graphPath: "/tmp/graph.png",
				}),
			}),
		);
		expect(model.images.contributionGraph).toBeDefined();
		expect(model.images.contributionGraph?.kind).toBe("contributionGraph");
		expect(model.images.contributionGraph?.path).toBe("/tmp/graph.png");
	});

	it("omits avatar placement when avatar result is error", async () => {
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps({
				prepareImages: async () => ({
					avatarResult: { ok: false, error: "Kitty unavailable" },
					graphPath: undefined,
				}),
			}),
		);
		expect(model.images.avatar).toBeUndefined();
	});

	it("accepts string cwd shorthand", async () => {
		const model = await assembleDashboardRenderModel(
			"/tmp/project",
			mkDeps(),
		);
		expect(model.vm.currentRepo.ok).toBe(true);
	});

	it("passes sized avatarUrl to image preparation", async () => {
		let receivedUrl: string | undefined;
		const model = await assembleDashboardRenderModel(
			{ cwd: "/tmp" },
			mkDeps({
				prepareImages: async (opts) => {
					receivedUrl = opts.avatarUrl;
					return { avatarResult: undefined, graphPath: undefined };
				},
			}),
		);
		expect(receivedUrl).toContain("?s=160");
	});
});
