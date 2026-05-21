import { describe, expect, it, vi, beforeEach } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Goal } from "./state.js";
import {
	goalPriority,
	goalKind,
	goalTitle,
	goalSummary,
	recordGoalEvent,
	type GoalAction,
} from "./context-events.js";

function makeGoal(overrides: Partial<Goal> = {}): Goal {
	return {
		thread_id: "thread-1",
		goal_id: "g-001",
		objective: "Fix the login bug",
		status: "active",
		token_budget: 10000,
		tokens_used: 500,
		time_used_seconds: 30,
		created_at_ms: 1700000000000,
		updated_at_ms: 1700000001000,
		continuation_count: 1,
		max_continuations: 5,
		last_continued_at_ms: null,
		...overrides,
	};
}

describe("context-events helpers", () => {
	it("goalPriority returns correct priority for each action", () => {
		expect(goalPriority("set")).toBe(1);
		expect(goalPriority("resumed")).toBe(1);
		expect(goalPriority("updated")).toBe(1);
		expect(goalPriority("budget_exhausted")).toBe(1);
		expect(goalPriority("continuation_limit")).toBe(1);
		expect(goalPriority("paused")).toBe(2);
		expect(goalPriority("completed")).toBe(2);
		expect(goalPriority("cleared")).toBe(2);
	});

	it("goalKind returns error for budget/continuation, task otherwise", () => {
		expect(goalKind("budget_exhausted")).toBe("error");
		expect(goalKind("continuation_limit")).toBe("error");
		expect(goalKind("set")).toBe("task");
		expect(goalKind("completed")).toBe("task");
		expect(goalKind("cleared")).toBe("task");
	});

	it("goalTitle includes short objective", () => {
		const goal = makeGoal();
		expect(goalTitle("set", goal)).toContain("Goal set:");
		expect(goalTitle("set", goal)).toContain("Fix the login bug");
	});

	it("goalTitle truncates long objective", () => {
		const goal = makeGoal({ objective: "x".repeat(200) });
		const title = goalTitle("set", goal);
		expect(title.length).toBeLessThan(200);
		expect(title).toContain("…");
	});

	it("goalTitle works without goal", () => {
		expect(goalTitle("cleared")).toBe("Goal cleared");
	});

	it("goalSummary includes goal_id, status, objective", () => {
		const goal = makeGoal();
		const summary = goalSummary("set", goal);
		expect(summary).toContain("goal_id=g-001");
		expect(summary).toContain("status=active");
		expect(summary).toContain("objective=Fix the login bug");
	});

	it("goalSummary includes budget info when present", () => {
		const goal = makeGoal({ token_budget: 5000, tokens_used: 1000 });
		const summary = goalSummary("set", goal);
		expect(summary).toContain("budget=5000");
		expect(summary).toContain("used=1000");
	});

	it("goalSummary includes continuation count for continuation_limit", () => {
		const goal = makeGoal({ continuation_count: 5, max_continuations: 5 });
		const summary = goalSummary("continuation_limit", goal);
		expect(summary).toContain("continuations=5/5");
	});

	it("goalSummary works without goal", () => {
		expect(goalSummary("cleared")).toBe("Goal cleared");
	});
});

describe("recordGoalEvent", () => {
	it("writes context event to ledger when store is available", async () => {
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "goal-ctx-"));
		const eventsDir = path.join(cwd, ".pi", "mekann-context");
		await fsp.mkdir(eventsDir, { recursive: true });

		const goal = makeGoal();
		await recordGoalEvent({
			action: "set",
			goal,
			cwd,
			sessionId: "session-1",
			turnId: "turn-1",
		});

		const eventsFile = path.join(eventsDir, "events.jsonl");
		expect(fs.existsSync(eventsFile)).toBe(true);
		const content = await fsp.readFile(eventsFile, "utf8");
		const lines = content.trim().split("\n");
		expect(lines.length).toBe(1);
		const event = JSON.parse(lines[0]);
		expect(event.kind).toBe("task");
		expect(event.priority).toBe(1);
		expect(event.title).toContain("Goal set:");
		expect(event.summary).toContain("goal_id=g-001");
		expect(event.sessionId).toBe("session-1");
		expect(event.turnId).toBe("turn-1");
	});

	it("writes error event for budget_exhausted", async () => {
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "goal-ctx-"));
		const eventsDir = path.join(cwd, ".pi", "mekann-context");
		await fsp.mkdir(eventsDir, { recursive: true });

		await recordGoalEvent({
			action: "budget_exhausted",
			goal: makeGoal({ status: "budget_limited" }),
			cwd,
		});

		const eventsFile = path.join(eventsDir, "events.jsonl");
		const content = await fsp.readFile(eventsFile, "utf8");
		const event = JSON.parse(content.trim());
		expect(event.kind).toBe("error");
		expect(event.priority).toBe(1);
		expect(event.title).toContain("budget_exhausted");
	});

	it("writes P2 event for completed", async () => {
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "goal-ctx-"));
		const eventsDir = path.join(cwd, ".pi", "mekann-context");
		await fsp.mkdir(eventsDir, { recursive: true });

		await recordGoalEvent({
			action: "completed",
			goal: makeGoal({ status: "complete" }),
			cwd,
		});

		const eventsFile = path.join(eventsDir, "events.jsonl");
		const content = await fsp.readFile(eventsFile, "utf8");
		const event = JSON.parse(content.trim());
		expect(event.kind).toBe("task");
		expect(event.priority).toBe(2);
		expect(event.title).toContain("completed");
	});

	it("does not throw when ledger store import fails", async () => {
		// Use a path where ledger doesn't exist — recordGoalEvent should silently skip
		await expect(recordGoalEvent({
			action: "set",
			goal: null,
			cwd: "/nonexistent/path/that/does/not/exist",
		})).resolves.toBeUndefined();
	});

	it("records multiple events in order", async () => {
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "goal-ctx-"));
		const eventsDir = path.join(cwd, ".pi", "mekann-context");
		await fsp.mkdir(eventsDir, { recursive: true });

		await recordGoalEvent({ action: "set", goal: makeGoal(), cwd });
		await recordGoalEvent({ action: "paused", goal: makeGoal({ status: "paused" }), cwd });
		await recordGoalEvent({ action: "cleared", cwd });

		const eventsFile = path.join(eventsDir, "events.jsonl");
		const content = await fsp.readFile(eventsFile, "utf8");
		const lines = content.trim().split("\n");
		expect(lines.length).toBe(3);

		const events = lines.map((l) => JSON.parse(l));
		expect(events[0].title).toContain("Goal set:");
		expect(events[1].title).toContain("Goal paused");
		expect(events[2].title).toBe("Goal cleared");
	});
});
