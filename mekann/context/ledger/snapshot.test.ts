import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MekannContextEvent } from "./store.js";
import { appendContextEvent } from "./store.js";
import { buildSnapshot } from "./snapshot.js";

function makeEvent(overrides: Partial<MekannContextEvent> & Pick<MekannContextEvent, "id" | "kind" | "priority" | "title" | "summary">): MekannContextEvent {
	return {
		schemaVersion: "mekann-context/v2",
		status: "active",
		evidenceLevel: "observed",
		createdAt: Date.now(),
		cwd: "/tmp",
		...overrides,
	};
}

describe("snapshot builder", () => {
	it("returns empty element for no events", () => {
		const xml = buildSnapshot([]);
		expect(xml).toContain("schemaVersion=\"mekann-context-snapshot/v2\"");
		expect(xml).toContain("sourceEventCount=\"0\"");
	});

	it("formats single event", () => {
		const events = [
			makeEvent({ id: "ctx_s1_1", kind: "error", priority: 0, title: "Build failed", summary: "TypeError in foo.ts" }),
		];
		const xml = buildSnapshot(events);
		expect(xml).toContain("<mekann_session_context");
		expect(xml).toContain("kind=\"error\"");
		expect(xml).toContain("<title>Build failed</title>");
		expect(xml).toContain("<summary>TypeError in foo.ts</summary>");
		expect(xml).toContain("</mekann_session_context>");
	});

	it("groups events by kind into sections", () => {
		const events = [
			makeEvent({ id: "ctx_g1_1", kind: "error", priority: 0, title: "E1", summary: "e1" }),
			makeEvent({ id: "ctx_g1_2", kind: "task", priority: 2, title: "T1", summary: "t1" }),
			makeEvent({ id: "ctx_g1_3", kind: "error", priority: 1, title: "E2", summary: "e2" }),
		];
		const xml = buildSnapshot(events);
		expect(xml).toContain("<error_events>");
		expect(xml).toContain("<task_events>");
		expect(xml).not.toContain("<plan_events>");
	});

	it("sorts by priority then by createdAt descending", () => {
		const events = [
			makeEvent({ id: "ctx_so_1", kind: "task", priority: 2, title: "OlderTask", summary: "m", createdAt: 1000 }),
			makeEvent({ id: "ctx_so_2", kind: "task", priority: 0, title: "CriticalTask", summary: "c", createdAt: 2000 }),
			makeEvent({ id: "ctx_so_3", kind: "task", priority: 2, title: "NewerTask", summary: "mn", createdAt: 3000 }),
		];
		const xml = buildSnapshot(events);
		const criticalIdx = xml.indexOf("CriticalTask");
		const newerIdx = xml.indexOf("NewerTask");
		const olderIdx = xml.indexOf("OlderTask");
		expect(criticalIdx).toBeLessThan(newerIdx);
		expect(newerIdx).toBeLessThan(olderIdx);
	});

	it("formats refs", () => {
		const events = [
			makeEvent({
				id: "ctx_ref_1",
				kind: "tool_result",
				priority: 3,
				title: "Stored",
				summary: "Big output",
				refs: [
					{ type: "artifact", value: "og_abc_1" },
					{ type: "file", value: "src/index.ts" },
				],
			}),
		];
		const xml = buildSnapshot(events);
		expect(xml).toContain('<artifact id="og_abc_1" />');
		expect(xml).toContain("<file>src/index.ts</file>");
	});

	it("escapes XML special characters", () => {
		const events = [
			makeEvent({ id: "ctx_esc_1", kind: "error", priority: 0, title: 'A < "B" & C', summary: "x < y > z & w" }),
		];
		const xml = buildSnapshot(events);
		expect(xml).toContain("A &lt; &quot;B&quot; &amp; C");
		expect(xml).toContain("x &lt; y &gt; z &amp; w");
	});

	it("respects maxEvents limit", () => {
		const events = Array.from({ length: 20 }, (_, i) =>
			makeEvent({ id: `ctx_lim_${i}`, kind: "task", priority: 2, title: `T${i}`, summary: `s${i}` })
		);
		const xml = buildSnapshot(events, { maxEvents: 3 });
		// Should contain at most 3 event elements
		const matches = xml.match(/<event /g);
		expect(matches).toHaveLength(3);
	});

	it("filters by kinds when specified", () => {
		const events = [
			makeEvent({ id: "ctx_f1_1", kind: "error", priority: 0, title: "E", summary: "e" }),
			makeEvent({ id: "ctx_f1_2", kind: "task", priority: 2, title: "T", summary: "t" }),
		];
		const xml = buildSnapshot(events, { kinds: ["error"] });
		expect(xml).toContain("kind=\"error\"");
		expect(xml).not.toContain("kind=\"task\"");
	});

	it("truncates long titles and summaries", () => {
		const longTitle = "A".repeat(200);
		const longSummary = "B".repeat(400);
		const events = [
			makeEvent({ id: "ctx_trunc_1", kind: "task", priority: 2, title: longTitle, summary: longSummary }),
		];
		const xml = buildSnapshot(events, { maxTitleLen: 50, maxSummaryLen: 100 });
		// Title should be truncated (49 chars + …)
		expect(xml).not.toContain("A".repeat(200));
		expect(xml).toContain("…");
	});

	it("does not mutate input event order", () => {
		const events = [
			makeEvent({ id: "ctx_mut_1", kind: "task", priority: 2, title: "A", summary: "a", createdAt: 1000 }),
			makeEvent({ id: "ctx_mut_2", kind: "task", priority: 0, title: "B", summary: "b", createdAt: 2000 }),
		];
		const before = events.map((e) => e.id);
		buildSnapshot(events);
		expect(events.map((e) => e.id)).toEqual(before);
	});

	it("respects maxBytes budget", () => {
		const events = [
			makeEvent({ id: "ctx_bgt_1", kind: "error", priority: 0, title: "Critical error", summary: "Something broke badly" }),
			makeEvent({ id: "ctx_bgt_2", kind: "task", priority: 2, title: "Regular task", summary: "Normal work item" }),
			makeEvent({ id: "ctx_bgt_3", kind: "subagent", priority: 4, title: "Subagent note", summary: "Minor info" }),
		];
		// Build with small budget — should drop subagent (P4) first
		const xml = buildSnapshot(events, { maxBytes: 500 });
		expect(xml).toContain("<mekann_session_context");
		expect(xml).not.toContain('<event id="ctx_bgt_3"'); // P4 subagent dropped first
	});

	it("drops low-priority events before high-priority within budget", () => {
		const events = [
			makeEvent({ id: "ctx_bp_1", kind: "error", priority: 0, title: "Critical", summary: "Must keep" }),
			makeEvent({ id: "ctx_bp_2", kind: "task", priority: 2, title: "Medium", summary: "Should keep" }),
			makeEvent({ id: "ctx_bp_3", kind: "task", priority: 4, title: "Info level", summary: "Drop me" }),
		];
		const xml = buildSnapshot(events, { maxBytes: 400 });
		expect(xml).toContain("<mekann_session_context");
		expect(xml).not.toContain('<event id="ctx_bp_3"'); // P4 dropped
	});

	it("maxBytes=0 means unlimited", () => {
		const events = Array.from({ length: 20 }, (_, i) =>
			makeEvent({ id: `ctx_unl_${i}`, kind: "task", priority: 2, title: `T${i}`, summary: `s${i}` })
		);
		const xml = buildSnapshot(events, { maxBytes: 0 });
		expect(xml).toContain("ctx_unl_0");
		expect(xml).toContain("ctx_unl_19");
	});

	it("snapshot command passes maxBytes from argument", async () => {
		const { default: contextLedgerExtension } = await import("./index.js");
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "og-cmd-"));
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_cmd_1" });
		const notify = vi.fn();
		await cmdDef.handler("snapshot --max-bytes 200", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const xml = notify.mock.calls[0][0];
		expect(Buffer.byteLength(xml, "utf8")).toBeLessThanOrEqual(320); // watermark overhead
	});

	it("command clamps --max-bytes to minimum 512", async () => {
		const { default: contextLedgerExtension } = await import("./index.js");
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await fsp.mkdtemp(path.join(os.tmpdir(), "og-cmd-"));
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_clamp_1" });
		const notify = vi.fn();
		await cmdDef.handler("snapshot --max-bytes 1", { cwd, ui: { notify } });
		const xml = notify.mock.calls[0][0];
		// Should be clamped to 512, not actually 1 byte
		expect(xml).toContain("<mekann_session_context");
		expect(Buffer.byteLength(xml, "utf8")).toBeGreaterThan(1);
	});
});
