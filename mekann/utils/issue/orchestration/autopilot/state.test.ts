import { describe, expect, it } from "vitest";
import { isReadyForAgent, isReadyForHuman, judgeAutopilotChild, type AutopilotChildState } from "./state.js";

function state(overrides: Partial<AutopilotChildState>): AutopilotChildState {
	return {
		number: 1,
		title: "#1",
		url: "https://example/1",
		labels: ["ready-for-agent"],
		prExists: false,
		openBlockers: [],
		hasWorktree: false,
		hasActiveWorkPi: false,
		...overrides,
	};
}

describe("label helpers", () => {
	it("detects ready-for-agent (case-insensitive)", () => {
		expect(isReadyForAgent(["ready-for-agent"])).toBe(true);
		expect(isReadyForAgent(["Ready-For-Agent"])).toBe(true);
		expect(isReadyForAgent(["needs-triage"])).toBe(false);
	});

	it("detects ready-for-human", () => {
		expect(isReadyForHuman(["ready-for-human"])).toBe(true);
		expect(isReadyForHuman(["ready-for-agent"])).toBe(false);
	});
});

describe("judgeAutopilotChild", () => {
	it("is done when a PR exists (created)", () => {
		expect(judgeAutopilotChild(state({ prExists: true })).kind).toBe("done");
	});

	it("is done when labeled ready-for-human (demoted)", () => {
		expect(judgeAutopilotChild(state({ labels: ["ready-for-human"] })).kind).toBe("done");
	});

	it("is active when a Work Pi pane is already open (beats blocked/startable)", () => {
		const verdict = judgeAutopilotChild(state({ hasActiveWorkPi: true, openBlockers: [99] }));
		expect(verdict.kind).toBe("active");
	});

	it("is blocked when it has open blockers", () => {
		const verdict = judgeAutopilotChild(state({ openBlockers: [10, 11] }));
		expect(verdict.kind).toBe("blocked");
		if (verdict.kind !== "blocked") return;
		expect(verdict.blockers).toEqual([10, 11]);
	});

	it("is startable for a fresh candidate", () => {
		const verdict = judgeAutopilotChild(state({}));
		expect(verdict.kind).toBe("startable");
		if (verdict.kind !== "startable") return;
		expect(verdict.resume).toBe(false);
	});

	it("is startable with resume=true when a worktree already exists", () => {
		const verdict = judgeAutopilotChild(state({ hasWorktree: true }));
		expect(verdict.kind).toBe("startable");
		if (verdict.kind !== "startable") return;
		expect(verdict.resume).toBe(true);
	});

	it("treats prExists as higher priority than ready-for-human and active", () => {
		expect(judgeAutopilotChild(state({ prExists: true, labels: ["ready-for-human"], hasActiveWorkPi: true })).kind).toBe("done");
	});
});
