import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import contextLedgerExtension from "./index.js";
import { appendContextEvent, clearContext, contextDir } from "./store.js";

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
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "Build failed", summary: "TypeError in foo.ts", idGenerator: () => "ctx_ext_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "Update docs", summary: "Add README", idGenerator: () => "ctx_ext_2" });

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
		await appendContextEvent({ cwd, kind: "error", priority: 0, title: "E1", summary: "e", idGenerator: () => "ctx_kf_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 2, title: "T1", summary: "t", idGenerator: () => "ctx_kf_2" });

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
			await appendContextEvent({ cwd, kind: "task", priority: 2, title: `T${i}`, summary: `s${i}`, idGenerator: () => `ctx_cl_${i}` });
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
		await appendContextEvent({ cwd, kind: "task", priority: 0, title: "Critical", summary: "c", idGenerator: () => "ctx_pm_1" });
		await appendContextEvent({ cwd, kind: "task", priority: 3, title: "Low", summary: "l", idGenerator: () => "ctx_pm_2" });

		// priorityMax = 10 should clamp to 4 (include all)
		const result = await toolDef.execute("tc5", { priorityMax: 10 }, undefined, undefined, { cwd });
		expect(result.content[0].text).toContain("ctx_pm_1");
		expect(result.content[0].text).toContain("ctx_pm_2");
	});
});
