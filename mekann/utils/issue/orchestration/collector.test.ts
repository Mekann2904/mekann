import { describe, expect, it } from "vitest";
import { collectSnapshot, type ChildBrief, type OrchestrationDeps } from "./collector.js";

function deps(children: ChildBrief[], labels: Record<number, string[]>): OrchestrationDeps {
	return {
		async listSubIssues() {
			return children;
		},
		async getDependencyStatus(childNumber: number) {
			return { openBlockers: childNumber === 68 ? [67] : [] };
		},
		async getIssueLabels(childNumber: number) {
			return labels[childNumber] ?? [];
		},
		async getPrMergeStatus() {
			return { merged: false, exists: false };
		},
		hasWorktree() {
			return false;
		},
		async hasActiveWorkPi() {
			return false;
		},
	};
}

describe("collectSnapshot", () => {
	it("maps ready-for-agent labels into ChildState", async () => {
		const children = [
			{ number: 67, title: "Ready", url: "https://example/67" },
			{ number: 68, title: "Human", url: "https://example/68" },
		];

		const snapshot = await collectSnapshot(66, deps(children, { 67: ["ready-for-agent"], 68: ["ready-for-human"] }));

		expect(snapshot.map((child) => ({ number: child.number, readyForAgent: child.readyForAgent, openBlockers: child.openBlockers }))).toEqual([
			{ number: 67, readyForAgent: true, openBlockers: [] },
			{ number: 68, readyForAgent: false, openBlockers: [67] },
		]);
	});

	it("treats an empty label list as not ready", async () => {
		const snapshot = await collectSnapshot(66, deps([{ number: 67, title: "No labels", url: "https://example/67" }], {}));
		expect(snapshot[0]?.readyForAgent).toBe(false);
	});
});
