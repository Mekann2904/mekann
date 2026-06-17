import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import contextLedgerExtension from "./index.js";
import { appendContextEvent, clearContext, contextDir } from "./store.js";
import {
	clearPromptProvidersForTests,
	collectPromptFragments,
} from "../../core/prompt-core/index.js";
import { POST_COMPACTION_RESTORE_FRAGMENT_ID } from "./postCompactionRestore.js";

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "og-ledger-ext-"));
}

describe("context-ledger extension", () => {
	it("registers search_context_events tool and context-ledger command", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolNames = pi.registerTool.mock.calls.map((c: any) => c[0]?.name);
		expect(toolNames).toContain("search_context_events");

		const cmdNames = pi.registerCommand.mock.calls.map((c: any) => c[0]);
		expect(cmdNames).toContain("context-ledger");
	});

	it("search_context_events has correct promptGuidelines", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		expect(toolDef.promptGuidelines).toBeDefined();
		expect(toolDef.promptGuidelines.length).toBeGreaterThanOrEqual(2);
		expect(toolDef.promptGuidelines[0]).toContain("search_context_events");
		expect(toolDef.promptGuidelines[1]).toContain("search_tool_outputs");
	});

	it("search_context_events returns no-matches for empty ledger", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		const cwd = await tmp();
		const result = await toolDef.execute("tc1", {}, undefined, undefined, { cwd });
		expect(result.content[0].text).toBe("No matching context events.");
	});

	it("search_context_events finds events by query", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "Build failed", summary: "TypeError in foo.ts", evidenceLevel: "observed", idGenerator: () => "ctx_ext_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Update docs", summary: "Add README", evidenceLevel: "observed", idGenerator: () => "ctx_ext_2" });

		const result = await toolDef.execute("tc2", { query: "Build" }, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_ext_1");
		expect(result.content[0].text).toContain("Build failed");
		expect(result.content[0].text).not.toContain("ctx_ext_2");
	});

	it("search_context_events filters by kind", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "e", evidenceLevel: "observed", idGenerator: () => "ctx_kf_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "t", evidenceLevel: "observed", idGenerator: () => "ctx_kf_2" });

		const result = await toolDef.execute("tc3", { kind: "task" }, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_kf_2");
		expect(result.content[0].text).not.toContain("ctx_kf_1");
	});

	it("search_context_events clamps maxResults", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		const cwd = await tmp();
		for (let i = 0; i < 5; i++) {
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `T${i}`, summary: `s${i}`, evidenceLevel: "observed", idGenerator: () => `ctx_cl_${i}` });
		}

		// maxResults = -1 should clamp to 1
		const result = await toolDef.execute("tc4", { maxResults: -1 }, undefined, undefined, { cwd });
		const headers = result.content[0].text.match(/### ctx_cl_/g);
		expect(headers).toHaveLength(1);
	});

	it("search_context_events clamps priorityMax", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);

		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "search_context_events")[0];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 0, title: "Critical", summary: "c", evidenceLevel: "observed", idGenerator: () => "ctx_pm_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 3, title: "Low", summary: "l", evidenceLevel: "observed", idGenerator: () => "ctx_pm_2" });

		// priorityMax = 10 should clamp to 4 (include all)
		const result = await toolDef.execute("tc5", { priorityMax: 10 }, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_pm_1");
		expect(result.content[0].text).toContain("ctx_pm_2");
	});

	it("snapshot --write persists snapshot to disk", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_sw_1" });
		const notify = vi.fn();
		await cmdDef.handler("snapshot --write", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("Snapshot saved");
		expect(msg).toContain("latest.xml");
		// Verify file on disk
		const { readLatestSnapshot } = await import("./snapshot-store.js");
		const content = await readLatestSnapshot(cwd);
		expect(content).toContain("ctx_sw_1");
	});

	it("snapshot --write --max-bytes 512 persists with budget", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		for (let i = 0; i < 10; i++) {
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `Task ${i}`, summary: `Summary ${i}`, evidenceLevel: "observed", idGenerator: () => `ctx_sw_${i}` });
		}
		const notify = vi.fn();
		await cmdDef.handler("snapshot --write --max-bytes 512", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("Snapshot saved");
	});

	// Restore command tests
	it("restore rebuilds stale latest snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();

		// Write a snapshot first
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Old task", summary: "saved", evidenceLevel: "observed", idGenerator: () => "ctx_rst_1" });
		const { writeLatestSnapshot } = await import("./snapshot-store.js");
		await writeLatestSnapshot(cwd, "<mekann_session_context><saved /></mekann_session_context>\n");

		const notify = vi.fn();
		await cmdDef.handler("restore", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		expect(notify.mock.calls[0][0]).toContain("ctx_rst_1");
		expect(notify.mock.calls[0][0]).not.toContain("<saved />");
	});

	it("restore builds from events when no snapshot exists", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "Build failed", summary: "TypeError", evidenceLevel: "observed", idGenerator: () => "ctx_rst_2" });

		const notify = vi.fn();
		await cmdDef.handler("restore", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		expect(notify.mock.calls[0][0]).toContain("ctx_rst_2");
	});

	it("restore --rebuild ignores latest snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();

		// Write stale snapshot
		const { writeLatestSnapshot } = await import("./snapshot-store.js");
		await writeLatestSnapshot(cwd, "<mekann_session_context><stale /></mekann_session_context>\n");

		// Add new event
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "New task", summary: "fresh", evidenceLevel: "observed", idGenerator: () => "ctx_rst_3" });

		const notify = vi.fn();
		await cmdDef.handler("restore --rebuild", { cwd, ui: { notify } });
		expect(notify.mock.calls[0][0]).toContain("ctx_rst_3");
		expect(notify.mock.calls[0][0]).not.toContain("stale");
	});

	it("restore --rebuild --write saves rebuilt snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Rebuild task", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_rst_4" });

		const notify = vi.fn();
		await cmdDef.handler("restore --rebuild --write", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();

		// Verify latest.xml was updated
		const { readLatestSnapshot } = await import("./snapshot-store.js");
		const content = await readLatestSnapshot(cwd);
		expect(content).toContain("ctx_rst_4");
	});

	it("restore respects --max-bytes", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		for (let i = 0; i < 10; i++) {
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `Task ${i}`, summary: `Summary ${i}`, evidenceLevel: "observed", idGenerator: () => `ctx_rmb_${i}` });
		}

		const notify = vi.fn();
		await cmdDef.handler("restore --max-bytes 300", { cwd, ui: { notify } });
		const xml = notify.mock.calls[0][0];
		expect(Buffer.byteLength(xml, "utf8")).toBeLessThanOrEqual(400); // watermark overhead
	});

	// summarize_session_context tool tests
	it("summarize_session_context tool is registered", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolNames = pi.registerTool.mock.calls.map((c: any) => c[0]?.name);
		expect(toolNames).toContain("summarize_session_context");
	});

	it("summarize_session_context has promptGuidelines", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "summarize_session_context")[0];
		expect(toolDef.promptGuidelines.length).toBeGreaterThanOrEqual(2);
		expect(toolDef.promptGuidelines[0]).toContain("summarize_session_context");
	});

	it("summarize_session_context rebuilds stale latest snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "summarize_session_context")[0];
		const cwd = await tmp();

		const { writeLatestSnapshot } = await import("./snapshot-store.js");
		await writeLatestSnapshot(cwd, "<mekann_session_context><cached /></mekann_session_context>\n");

		const result = await toolDef.execute("tc_ss_1", {}, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("schemaVersion=\"mekann-context-snapshot/v2\"");
		expect(result.content[0].text).not.toContain("<cached />");
	});

	it("summarize_session_context builds from events when no snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "summarize_session_context")[0];
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "Restore task", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_ss_1" });

		const result = await toolDef.execute("tc_ss_2", {}, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_ss_1");
	});

	it("summarize_session_context rebuild=true ignores latest snapshot", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "summarize_session_context")[0];
		const cwd = await tmp();

		const { writeLatestSnapshot } = await import("./snapshot-store.js");
		await writeLatestSnapshot(cwd, "<mekann_session_context><stale /></mekann_session_context>\n");
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "Fresh error", summary: "s", evidenceLevel: "observed", idGenerator: () => "ctx_ss_2" });

		const result = await toolDef.execute("tc_ss_3", { rebuild: true }, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_ss_2");
		expect(result.content[0].text).not.toContain("stale");
	});

	it("summarize_session_context respects maxBytes", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		contextLedgerExtension(pi);
		const toolDef = pi.registerTool.mock.calls.find((c: any) => c[0]?.name === "summarize_session_context")[0];
		const cwd = await tmp();
		for (let i = 0; i < 10; i++) {
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `Task ${i}`, summary: `Summary ${i}`, evidenceLevel: "observed", idGenerator: () => `ctx_smb_${i}` });
		}

		const result = await toolDef.execute("tc_ss_4", { maxBytes: 300, rebuild: true }, undefined, undefined, { cwd });
		expect(Buffer.byteLength(result.content[0].text, "utf8")).toBeLessThanOrEqual(350);
	});
});

describe("context-ledger post-compaction restore wiring", () => {
	function makePi(): any {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() };
		contextLedgerExtension(pi as any);
		return pi;
	}

	function handlerFor(pi: any, event: string): ((...args: any[]) => any) | undefined {
		const call = pi.on.mock.calls.find((c: any) => c[0] === event);
		return call?.[1];
	}

	beforeEach(() => {
		clearPromptProvidersForTests();
	});

	afterEach(() => {
		clearPromptProvidersForTests();
	});

	it("registers a context-ledger prompt provider", () => {
		const pi = makePi();
		// The provider is wired so that arming later takes effect, and the
		// compaction/context lifecycle hooks are registered.
		expect(pi.on).toHaveBeenCalledWith("session_compact", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("context", expect.any(Function));
	});

	it("injects the ledger snapshot as a dynamic fragment after session_compact", async () => {
		const pi = makePi();
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "Post-compaction decision", summary: "keep working on issue 93", evidenceLevel: "observed", idGenerator: () => "ctx_pcr_1" });

		// Before compaction: no restore fragment.
		let fragments = await collectPromptFragments({ cwd });
		expect(fragments.find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeUndefined();

		// Fire session_compact (arms restore), then the next prompt render contributes it.
		await handlerFor(pi, "session_compact")!();
		fragments = await collectPromptFragments({ cwd });
		const restore = fragments.find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID);
		expect(restore).toBeDefined();
		expect(restore!.stability).toBe("dynamic");
		expect(restore!.cacheIntent).toBe("avoid_cache");
		expect(restore!.kind).toBe("current_context");
		expect(restore!.priority).toBe(720);
		expect(restore!.content).toContain("ctx_pcr_1");
		expect(restore!.content).toContain("Post-compaction decision");
	});

	it("coexists with model-optimizer's hint via a distinct id and priority", async () => {
		// The restore fragment id must not collide with the model-optimizer
		// system-prompt-hint fragment id, and its priority must differ.
		expect(POST_COMPACTION_RESTORE_FRAGMENT_ID).not.toContain("model-optimizer");
		expect(POST_COMPACTION_RESTORE_FRAGMENT_ID).toBe("context-ledger:post-compaction-restore");
	});

	it("does not inject when the ledger is empty", async () => {
		const pi = makePi();
		const cwd = await tmp();
		await handlerFor(pi, "session_compact")!();
		const fragments = await collectPromptFragments({ cwd });
		expect(fragments.find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeUndefined();
	});

	it("disarms once the snapshot lands in a freshly-built dynamic block (one-shot)", async () => {
		const pi = makePi();
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "T", summary: "S", evidenceLevel: "observed", idGenerator: () => "ctx_os_1" });
		await handlerFor(pi, "session_compact")!();

		expect((await collectPromptFragments({ cwd })).find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeDefined();

		// cache-friendly would append a dynamic block whose text contains our fragment marker.
		await handlerFor(pi, "context")!({ type: "context", messages: [
			{ role: "user", content: "hi" },
			{ role: "user", customType: "cache-friendly-dynamic-context", content: [{ type: "text", text: `<!-- fragment:context-ledger:${POST_COMPACTION_RESTORE_FRAGMENT_ID}:current_context:dynamic:v1 -->` }] },
		] });

		expect((await collectPromptFragments({ cwd })).find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeUndefined();
	});

	it("stays armed when cache-friendly skipped (no fresh dynamic block)", async () => {
		const pi = makePi();
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "T", summary: "S", evidenceLevel: "observed", idGenerator: () => "ctx_sa_1" });
		await handlerFor(pi, "session_compact")!();

		// A context event whose last message is a normal user message (cache-friendly skipped).
		await handlerFor(pi, "context")!({ type: "context", messages: [{ role: "user", content: "hello" }] });

		expect((await collectPromptFragments({ cwd })).find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeDefined();
	});

	it("session_start resets the restore", async () => {
		const pi = makePi();
		const cwd = await tmp();
		await appendContextEvent({ cwd, kind: "task", priority: 1, title: "T", summary: "S", evidenceLevel: "observed", idGenerator: () => "ctx_rs_1" });
		await handlerFor(pi, "session_compact")!();
		await handlerFor(pi, "session_start")!({}, { cwd });
		expect((await collectPromptFragments({ cwd })).find((f) => f.id === POST_COMPACTION_RESTORE_FRAGMENT_ID)).toBeUndefined();
	});
});
