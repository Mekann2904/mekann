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
	searchEvents,
	formatSearchResult,
	projectContextEvents,
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
			summary: "User reports 500 on /login", evidenceLevel: "observed",
			idGenerator: () => "ctx_test_1",
			now: () => 1000,
		});
		expect(event.id).toBe("ctx_test_1");
		expect(event.schemaVersion).toBe("mekann-context/v2");
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
			summary: "TypeError in foo.ts", evidenceLevel: "observed",
			sessionId: "sess_1",
			turnId: "turn_1",
			branchId: "br_1",
			refs: [{ type: "file", value: "foo.ts" }, { type: "artifact", value: "og_abc_1" }],
			idGenerator: () => "ctx_opt_1",
		});
		expect(event.sessionId).toBe("sess_1");
		expect(event.turnId).toBe("turn_1");
		expect((event as any).branchId).toBeUndefined();
		expect(event.scope?.branchId).toBe("br_1");
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
			summary: "Decided to use SQLite instead of JSONL", evidenceLevel: "observed",
			refs: [],
			idGenerator: () => "ctx_noref_1",
		});
		expect(event.refs).toBeUndefined();
	});

	it("readEvents reads back appended events", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "A", summary: "a", evidenceLevel: "observed", idGenerator: () => "ctx_rd_1", now: () => 1000 });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "B", summary: "b", evidenceLevel: "observed", idGenerator: () => "ctx_rd_2", now: () => 2000 });
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
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Good", summary: "ok", evidenceLevel: "observed", idGenerator: () => "ctx_skip_1" });
		await fsp.appendFile(eventsPath(cwd), "not json\n", "utf8");
		await fsp.appendFile(eventsPath(cwd), `${JSON.stringify({ id: "bad_id", kind: "task" })}\n`, "utf8");
		const events = await readEvents(cwd);
		expect(events).toHaveLength(1);
		expect(events[0].id).toBe("ctx_skip_1");
	});

	it("appendContextEvent rejects invalid id", async () => {
		const cwd = await tmp();
		await expect(
			appendContextEvent({ cwd, kind: "task", priority: 2, title: "X", summary: "x", evidenceLevel: "observed", idGenerator: () => "invalid_id" })
		).rejects.toThrow("Invalid context event id");
	});

	it("computeStats returns correct aggregates", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "t1", evidenceLevel: "observed", idGenerator: () => "ctx_st_1", now: () => 1000 });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "e1", evidenceLevel: "observed", idGenerator: () => "ctx_st_2", now: () => 2000 });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T2", summary: "t2", evidenceLevel: "observed", idGenerator: () => "ctx_st_3", now: () => 3000 });
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

	it("projectContextEvents computes reverse relations and effective status priority", () => {
		const base = (id: string): any => ({
			schemaVersion: "mekann-context/v2",
			id,
			kind: "task",
			status: "active",
			priority: 2,
			title: id,
			summary: id,
			evidenceLevel: "observed",
			createdAt: 1000,
			cwd: "/tmp",
		});
		const projected = projectContextEvents([
			base("ctx_rel_1"),
			{ ...base("ctx_rel_2"), status: "resolved", resolves: ["ctx_rel_1"] },
			{ ...base("ctx_rel_3"), status: "active", supersedes: ["ctx_rel_1"] },
			{ ...base("ctx_rel_4"), status: "active", invalidates: ["ctx_rel_1"] },
		]);
		const target = projected.find((e) => e.id === "ctx_rel_1")!;
		expect(target.resolvedBy).toEqual(["ctx_rel_2"]);
		expect(target.supersededBy).toEqual(["ctx_rel_3"]);
		expect(target.invalidatedBy).toEqual(["ctx_rel_4"]);
		expect(target.effectiveStatus).toBe("invalidated");
	});

	it("projectContextEvents does not stale expired events", () => {
		const projected = projectContextEvents([{
			schemaVersion: "mekann-context/v2",
			id: "ctx_exp_1",
			kind: "constraint",
			status: "active",
			priority: 1,
			title: "Expired",
			summary: "Expired but projection does not change status",
			evidenceLevel: "agent_assumed",
			expiresAt: 1,
			createdAt: 1000,
			cwd: "/tmp",
		}]);
		expect(projected[0].effectiveStatus).toBe("active");
	});

	it("clearContext removes the context directory", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "X", summary: "x", evidenceLevel: "observed", idGenerator: () => "ctx_clr_1" });
		expect(fs.existsSync(contextDir(cwd))).toBe(true);
		await clearContext(cwd);
		expect(fs.existsSync(contextDir(cwd))).toBe(false);
	});

	// Search tests
	it("searchEvents returns all events when no filter", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s1", evidenceLevel: "observed", idGenerator: () => "ctx_se_1", now: () => 1000 });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "s2", evidenceLevel: "observed", idGenerator: () => "ctx_se_2", now: () => 2000 });
		const results = await searchEvents({ cwd });
		expect(results).toHaveLength(2);
		// Priority 0 first
		expect(results[0].id).toBe("ctx_se_2");
	});

	it("searchEvents filters by kind", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s1", evidenceLevel: "observed", idGenerator: () => "ctx_sk_1" });
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "s2", evidenceLevel: "observed", idGenerator: () => "ctx_sk_2" });
		const results = await searchEvents({ cwd, kind: "error" });
		expect(results).toHaveLength(1);
		expect(results[0].kind).toBe("error");
	});

	it("searchEvents filters by query matching title/summary/refs", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Fix login bug", summary: "User reports 500", evidenceLevel: "observed", idGenerator: () => "ctx_sq_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Update docs", summary: "Add README section", evidenceLevel: "observed", idGenerator: () => "ctx_sq_2" });
		const results = await searchEvents({ cwd, query: "login" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("ctx_sq_1");
	});

	it("searchEvents filters by priorityMax", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 0, title: "Critical", summary: "c", evidenceLevel: "observed", idGenerator: () => "ctx_sp_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 3, title: "Low", summary: "l", evidenceLevel: "observed", idGenerator: () => "ctx_sp_2" });
		const results = await searchEvents({ cwd, priorityMax: 1 });
		expect(results).toHaveLength(1);
		expect(results[0].title).toBe("Critical");
	});

	it("searchEvents respects maxResults", async () => {
		const cwd = await tmp();
		for (let i = 0; i < 5; i++) {
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `T${i}`, summary: `s${i}`, evidenceLevel: "observed", idGenerator: () => `ctx_sm_${i}` });
		}
		const results = await searchEvents({ cwd, maxResults: 2 });
		expect(results).toHaveLength(2);
	});

	it("searchEvents matches refs values", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "tool_result", priority: 3, title: "Stored", summary: "big output", evidenceLevel: "observed", refs: [{ type: "artifact", value: "og_abc_1" }], idGenerator: () => "ctx_sr_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Other", summary: "no ref", evidenceLevel: "observed", idGenerator: () => "ctx_sr_2" });
		const results = await searchEvents({ cwd, query: "og_abc" });
		expect(results).toHaveLength(1);
		expect(results[0].id).toBe("ctx_sr_1");
	});

	it("searchEvents returns empty for no matches", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s1", evidenceLevel: "observed", idGenerator: () => "ctx_sn_1" });
		const results = await searchEvents({ cwd, query: "nonexistent" });
		expect(results).toHaveLength(0);
	});

	it("searchEvents returns empty when no events", async () => {
		const cwd = await tmp();
		const results = await searchEvents({ cwd });
		expect(results).toEqual([]);
	});

	it("formatSearchResult formats events as text", async () => {
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "Build failed", summary: "TypeError in foo.ts", evidenceLevel: "observed", refs: [{ type: "file", value: "foo.ts" }], idGenerator: () => "ctx_fmt_1" });
		const events = await searchEvents({ cwd });
		const text = formatSearchResult(events);
		expect(text).toContain("ctx_fmt_1");
		expect(text).toContain("P0");
		expect(text).toContain("error");
		expect(text).toContain("Build failed");
		expect(text).toContain("file: foo.ts");
	});

	it("formatSearchResult handles empty events", () => {
		expect(formatSearchResult([])).toBe("No matching context events.");
	});

	it("formatSearchResult truncates long title, summary, and refs", () => {
		const longTitle = "t".repeat(200);
		const longSummary = "s".repeat(1000);
		const longRef = "r".repeat(300);
			const event = {
			schemaVersion: "mekann-context/v2" as const,
			id: "ctx_trunc_1",
			kind: "task" as const,
			status: "active" as const,
			effectiveStatus: "active" as const,
			priority: 2 as const,
			title: longTitle,
			summary: longSummary,
			evidenceLevel: "observed" as const,
			refs: [{ type: "artifact" as const, value: longRef }],
			createdAt: Date.now(),
			cwd: "/tmp",
		};
		const text = formatSearchResult([event]);
		// Title line should be truncated
		const titleLine = text.split("\n").find((l) => l.startsWith("###"))!;
		expect(titleLine.length).toBeLessThan(longTitle.length + 50);
		// Summary should be truncated
		const summaryLine = text.split("\n").find((l) => l.startsWith("summary:"))!;
		expect(summaryLine.length).toBeLessThan(longSummary.length);
		// Ref value should be truncated
		const refLine = text.split("\n").find((l) => l.includes("artifact:"))!;
		expect(refLine.length).toBeLessThan(longRef.length);
	});
});;
