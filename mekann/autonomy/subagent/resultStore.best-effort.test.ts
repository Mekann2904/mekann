/**
 * Issue #146 acceptance tests: corrupt/unreadable stored results are no longer
 * silently dropped on scan — the failure is emitted to the structured
 * best-effort log sink and the corrupt file is quarantined to
 * `<path>.corrupt.<ts>` so a human can inspect it.
 *
 * These cover the three acceptance criteria at the most prominent call site
 * (resultStore `list()` / `scanAll`):
 *   1. error injection surfaces a log/metrics event,
 *   2. the corrupt file is moved aside to `.corrupt.<ts>`,
 *   3. scan converges on clean state (the corrupt entry is excluded, the rest
 *      remain visible).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SubagentResultStore } from "./resultStore.js";
import type { AgentMetadata, SubagentResultV1 } from "./types.js";
import {
	configureBestEffortLogging,
	__resetBestEffortLoggingForTests,
	type BestEffortLogEvent,
} from "../../utils/best-effort.js";

const agent: AgentMetadata = {
	agentId: "a1", sessionId: "s1", agentPath: "/root/task",
	status: "completed", createdAt: 1, updatedAt: 1, depth: 1,
	open: false, cancellationRequested: false,
	authority: { mode: "propose_patch", write_scope: ["src"], require_base_hash: false },
	authorityEnforced: true, workspaceCwd: process.cwd(),
};

function observation(): SubagentResultV1 {
	return {
		schema: "subagent.result.v1",
		outcome: "observation",
		summary: "test",
		findings: [{ target: { kind: "file", name: "a.ts" }, message: "found" }],
	} as any;
}

describe("SubagentResultStore: corrupt-entry scan is observable (issue #146)", () => {
	let events: BestEffortLogEvent[];
	let dir: string;

	beforeEach(() => {
		events = [];
		configureBestEffortLogging((e) => events.push(e));
		dir = mkdtempSync(path.join(tmpdir(), "srs-be-"));
	});

	afterEach(() => {
		__resetBestEffortLoggingForTests();
		rmSync(dir, { recursive: true, force: true });
	});

	it("emits a structured best-effort event when a corrupt JSON is scanned", async () => {
		const store = new SubagentResultStore(dir);
		const good = store.save(agent, observation());

		// Inject a corrupt sibling that cannot be parsed as JSON.
		const corruptId = "sar_corrupt_99";
		writeFileSync(path.join(store.dir, `${corruptId}.json`), "{ this is not json");

		const list = await store.list();

		// The valid entry is still visible; the corrupt one is excluded.
		expect(list.map((s) => s.result_id)).toEqual([good.result_id]);

		// A structured failure was emitted for the corrupt id.
		const ev = events.find((e) => e.label === `subagent-result-scan:${corruptId}`);
		expect(ev).toBeTruthy();
		expect(ev!.event).toBe("best-effort-failure");
	});

	it("quarantines the corrupt file to <path>.corrupt.<ts> and converges", async () => {
		const store = new SubagentResultStore(dir);
		const good = store.save(agent, observation());

		const corruptId = "sar_corrupt_42";
		const corruptPath = path.join(store.dir, `${corruptId}.json`);
		writeFileSync(corruptPath, "not-json-at-all");

		// First scan quarantines the corrupt file.
		await store.list();

		const entries = readdirSync(store.dir);
		const quarantined = entries.find((f) => f.startsWith(`${corruptId}.json.corrupt.`));
		expect(quarantined).toBeTruthy();
		// The original path is gone; the corrupt payload is preserved aside.
		expect(() => readFileSync(corruptPath, "utf8")).toThrow();
		expect(readFileSync(path.join(store.dir, quarantined!), "utf8")).toBe("not-json-at-all");

		// A second scan converges: no new event for the already-quarantined id,
		// and the good entry remains visible.
		const before = events.length;
		store["invalidate"](); // force a fresh directory scan
		const list2 = await store.list();
		expect(list2.map((s) => s.result_id)).toEqual([good.result_id]);
		expect(events.filter((e) => e.label === `subagent-result-scan:${corruptId}`).length).toBe(1);
		expect(events.length).toBe(before); // no duplicate quarantine
	});

	it("schema-invalid (but parseable) results are also surfaced and quarantined", async () => {
		const store = new SubagentResultStore(dir);
		store.save(agent, observation());

		const invalidId = "sar_invalid_7";
		const invalidPath = path.join(store.dir, `${invalidId}.json`);
		// Valid JSON object that fails stored-result validation (bad status).
		writeFileSync(invalidPath, JSON.stringify({ result_id: invalidId, status: "bogus" }));

		await store.list();

		expect(events.some((e) => e.label === `subagent-result-scan:${invalidId}`)).toBe(true);
		expect(readdirSync(store.dir).some((f) => f.startsWith(`${invalidId}.json.corrupt.`))).toBe(true);
	});
});
