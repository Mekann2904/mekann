import { describe, expect, it, vi } from "vitest";
import { continueOrchestration, startOrchestration, type LaunchWorkPi } from "./lifecycle.js";
import type { OrchestrationDeps, ChildBrief } from "./collector.js";

function fakeDeps(map: Record<number, Partial<{ openBlockers: number[]; merged: boolean; prExists: boolean; hasWorktree: boolean; hasActiveWorkPi: boolean; readyForAgent: boolean }>>): OrchestrationDeps {
	return {
		async listSubIssues(): Promise<ChildBrief[]> {
			return Object.keys(map).map((n) => ({ number: Number(n), title: `#${n}`, url: `https://example/${n}` }));
		},
		async getDependencyStatus(n: number) {
			return { openBlockers: map[n]?.openBlockers ?? [] };
		},
		async getIssueLabels(n: number) {
			return map[n]?.readyForAgent === false ? [] : ["ready-for-agent"];
		},
		async getPrMergeStatus(n: number) {
			return { merged: map[n]?.merged ?? false, exists: map[n]?.prExists ?? false };
		},
		hasWorktree(n: number) {
			return map[n]?.hasWorktree ?? false;
		},
		async hasActiveWorkPi(n: number) {
			return map[n]?.hasActiveWorkPi ?? false;
		},
	};
}

const noLaunch: LaunchWorkPi = async () => {};

describe("startOrchestration", () => {
	it("returns no-children when the parent has no sub-issues", async () => {
		const deps = fakeDeps({});
		const outcome = await startOrchestration(66, "/repo", deps, noLaunch);
		expect(outcome.kind).toBe("no-children");
	});

	it("starts the lowest-numbered startable child", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: {}, 68: {}, 69: {} });
		const outcome = await startOrchestration(66, "/repo", deps, launch);
		expect(outcome.kind).toBe("started");
		if (outcome.kind !== "started") return;
		expect(outcome.childNumber).toBe(67);
		expect(launch).toHaveBeenCalledWith({ cwd: "/repo", title: "Issue #67", parent: 66, child: 67 });
	});

	it("skips merged, active, and blocked children; starts the first startable", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({
			67: { merged: true },
			68: { hasActiveWorkPi: true },
			69: { openBlockers: [100] },
			70: {},
		});
		const outcome = await startOrchestration(66, "/repo", deps, launch);
		expect(outcome.kind).toBe("started");
		if (outcome.kind !== "started") return;
		expect(outcome.childNumber).toBe(70);
		expect(outcome.summary.startable).toEqual([70]);
	});

	it("returns completed when all children are merged", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: true }, 68: { merged: true } });
		const outcome = await startOrchestration(66, "/repo", deps, launch);
		expect(outcome.kind).toBe("completed");
		expect(launch).not.toHaveBeenCalled();
	});

	it("returns waiting when remaining children are active/blocked", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { hasActiveWorkPi: true }, 68: { openBlockers: [67] } });
		const outcome = await startOrchestration(66, "/repo", deps, launch);
		expect(outcome.kind).toBe("waiting");
		expect(launch).not.toHaveBeenCalled();
	});

	it("does not launch children missing ready-for-agent", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { readyForAgent: false }, 68: { readyForAgent: false } });
		const outcome = await startOrchestration(66, "/repo", deps, launch);
		expect(outcome.kind).toBe("waiting");
		if (outcome.kind !== "waiting") return;
		expect(outcome.summary.notReady).toEqual([67, 68]);
		expect(launch).not.toHaveBeenCalled();
	});
});

describe("continueOrchestration (approval gate)", () => {
	it("starts next child when just-finished child is merged and another is startable", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: true }, 68: {} });
		const outcome = await continueOrchestration(66, 67, "/repo", deps, launch);
		expect(outcome.kind).toBe("started");
		if (outcome.kind !== "started") return;
		expect(outcome.childNumber).toBe(68);
		expect(launch).toHaveBeenCalledWith({ cwd: "/repo", title: "Issue #68", parent: 66, child: 68 });
	});

	it("returns completed when just-finished child is merged and all others are merged", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: true }, 68: { merged: true } });
		const outcome = await continueOrchestration(66, 68, "/repo", deps, launch);
		expect(outcome.kind).toBe("completed");
		expect(launch).not.toHaveBeenCalled();
	});

	it("returns not-merged when just-finished child PR is not merged (approval gate)", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: false, prExists: true }, 68: {} });
		const outcome = await continueOrchestration(66, 67, "/repo", deps, launch);
		expect(outcome.kind).toBe("not-merged");
		if (outcome.kind !== "not-merged") return;
		expect(outcome.childNumber).toBe(67);
		// Crucially does NOT launch #68 even though it is startable.
		expect(launch).not.toHaveBeenCalled();
	});

	it("does not launch when just-finished child not merged, even if others are startable", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: false }, 68: {}, 69: {} });
		const outcome = await continueOrchestration(66, 67, "/repo", deps, launch);
		expect(outcome.kind).toBe("not-merged");
		expect(launch).not.toHaveBeenCalled();
	});

	it("returns waiting when just-finished child merged but remaining are blocked", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: { merged: true }, 68: { openBlockers: [999] } });
		const outcome = await continueOrchestration(66, 67, "/repo", deps, launch);
		expect(outcome.kind).toBe("waiting");
		expect(launch).not.toHaveBeenCalled();
	});

	it("treats unknown just-finished child as not-merged (defensive)", async () => {
		const launch = vi.fn(noLaunch);
		const deps = fakeDeps({ 67: {} });
		const outcome = await continueOrchestration(66, 999, "/repo", deps, launch);
		expect(outcome.kind).toBe("not-merged");
		expect(launch).not.toHaveBeenCalled();
	});
});
