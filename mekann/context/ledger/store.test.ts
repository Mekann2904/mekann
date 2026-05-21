import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	appendContextEvent,
	readEvents,
	computeStats,
	clearContext,
	createEventId,
	eventsPath,
	contextDir,
} from "./store.js";

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "og-ledger-"));
}

describe("context ledger store", () => {
	it("creates event ids with expected format", () => {
		expect(createEventId(123456789, 35)).toMatch(/^ctx_[a-z0-9]+_[a-z0-9]+$/);
	});

	it("appendContextEvent creates directory and writes jsonl", async () => {
		const cwd = await tmp();
		const event = await appendContextEvent({
			cwd,
			kind: "task",
			priority: 2,
			title: "Fix login bug",
			summary: "User reports 500 on /login",
			idGenerator: () => "ctx_test_1",
			now: () => 1000,
		});
		expect(event.id).toBe("ctx_test_1");
		expect(event.schemaVersion).toBe("mekann-context/v1");
		expect(event.kind).toBe("task");
		expect(event.title).toBe("Fix login bug");
		expect(event.priority).toBe(2);

		// Verify file on disk
		const raw = await fsp.readFile(eventsPath(cwd), "utf8");
		expect(raw.trim()).toContain("ctx_test_1");
	});

	it("appendContextEvent includes optional fields", async () => {
		const cwd = await tmp();
		const event = await appendContextEvent({
			cwd,
			kind: "error",
			priority: 0,
			title: "Build failed",
			summary: "TypeError in foo.ts",
			sessionId: "sess_1",
			turnId: "turn_1",
			branchId: "br_1",
			refs: [{ type: "file", value: "foo.ts" }, { type: "artifact", value: "og_abc_1" }],
			idGenerator: () => "ctx_opt_1",
		});
		expect(event.sessionId).toBe("sess_1");
		expect(event.turnId).toBe("turn_1");
		expect(event.branchId).toBe("br_1");
		expect(event.refs).toHaveLength(2);
		expect(event.refs![0].type).toBe("file");
	});

	it("appendContextEvent omits empty refs", async () => {
		const cwd = await tmp();
		const event = await appendContextEvent({
			cwd,
			kind: "user_decision",
			priority: 3,
			title: "Use SQLite",
			summary: "Decided to use SQLite instead of JSONL",
			refs: [],
			idGenerator: () => "ctx_noref_1",
		});
		expect(event.refs).toBeUndefined();
	});

	it("readEvents reads back appended events", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "A", summary: "a", idGenerator: () => "ctx_rd_1", now: () => 1000 });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "B", summary: "b", idGenerator: () => "ctx_rd_2", now: () => 2000 });
		const events = await readEvents(cwd);
		expect(events).toHaveLength(2);
		expect(events[0].id).toBe("ctx_rd_1");
		expect(events[1].id).toBe("ctx_rd_2");
	});

	it("readEvents returns empty for nonexistent directory", async () => {
		const cwd = await tmp();
		const events = await readEvents(cwd);
		expect(events).toEqual([]);
	});

	it("readEvents skips corrupt jsonl lines", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Good", summary: "ok", idGenerator: () => "ctx_skip_1" });
		await fsp.appendFile(eventsPath(cwd), "not json\n", "utf8");
		await fsp.appendFile(eventsPath(cwd), `${JSON.stringify({ id: "bad_id", kind: "task" })}\n`, "utf8");
		const events = await readEvents(cwd);
		expect(events).toHaveLength(1);
		expect(events[0].id).toBe("ctx_skip_1");
	});

	it("appendContextEvent rejects invalid id", async () => {
		const cwd = await tmp();
		await expect(
			appendContextEvent({ cwd, kind: "task", priority: 2, title: "X", summary: "x", idGenerator: () => "invalid_id" })
		).rejects.toThrow("Invalid context event id");
	});

	it("computeStats returns correct aggregates", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "t1", idGenerator: () => "ctx_st_1", now: () => 1000 });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "e1", idGenerator: () => "ctx_st_2", now: () => 2000 });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T2", summary: "t2", idGenerator: () => "ctx_st_3", now: () => 3000 });
		const events = await readEvents(cwd);
		const stats = computeStats(events);
		expect(stats.totalEvents).toBe(3);
		expect(stats.byKind.task).toBe(2);
		expect(stats.byKind.error).toBe(1);
		expect(stats.byPriority[2]).toBe(2);
		expect(stats.byPriority[0]).toBe(1);
		expect(stats.oldest).toBe(new Date(1000).toISOString());
		expect(stats.newest).toBe(new Date(3000).toISOString());
	});

	it("computeStats handles empty events", () => {
		const stats = computeStats([]);
		expect(stats.totalEvents).toBe(0);
		expect(stats.byKind).toEqual({});
	});

	it("clearContext removes the context directory", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "X", summary: "x", idGenerator: () => "ctx_clr_1" });
		expect(fs.existsSync(contextDir(cwd))).toBe(true);
		await clearContext(cwd);
		expect(fs.existsSync(contextDir(cwd))).toBe(false);
	});
});
