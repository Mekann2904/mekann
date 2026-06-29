import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import outputGateExtension, { buildStoredOutputStub, extractTextContent, shouldGateOutput } from "./index.js";
import { searchToolOutputs } from "./search.js";
import { saveArtifact, gateTextForLlm, readManifest } from "./store.js";
import { resetOutputGateBypassTools } from "./bypass.js";

async function tmp(): Promise<string> { return fsp.mkdtemp(path.join(os.tmpdir(), "og-index-")); }

describe("output-gate extension helpers", () => {
	beforeEach(() => resetOutputGateBypassTools());

	it("shouldGateOutput false for small text", () => {
		expect(shouldGateOutput("small", { maxInlineBytes: 10 })).toBe(false);
	});

	it("shouldGateOutput true for large text", () => {
		expect(shouldGateOutput("x".repeat(11), { maxInlineBytes: 10 })).toBe(true);
	});

	it("gates large output even when it starts with the [output-gate] prefix (IC-274)", () => {
		// Self-reference detection is metadata-based (details.outputGate.stored,
		// see OutputGateController), not a fragile text prefix: a legitimately
		// large output that happens to start with "[output-gate]" is still gated.
		expect(shouldGateOutput("[output-gate] Large bash output stored." + "x".repeat(100), { maxInlineBytes: 10 })).toBe(true);
	});

	it("extracts text content from Pi tool content", () => {
		expect(extractTextContent([{ type: "text", text: "a" }, { type: "image", data: "..." }, { type: "text", text: "b" }])).toBe("a\nb");
	});

	it("extractTextContent returns empty for non-array non-string", () => {
		expect(extractTextContent(42 as any)).toBe("");
		expect(extractTextContent(null as any)).toBe("");
		expect(extractTextContent(undefined as any)).toBe("");
	});

	it("extractTextContent returns string as-is", () => {
		expect(extractTextContent("hello")).toBe("hello");
	});

	it("extractTextContent skips non-text parts", () => {
		expect(extractTextContent([{ type: "image", data: "x" }])).toBe("");
	});

	it("build stub contains artifact id, bytes, lines, search_tool_outputs instruction", () => {
		const stub = buildStoredOutputStub({ id: "og_a_1", toolName: "bash", createdAt: 1, cwd: "/tmp", bytes: 20, lines: 2, sha256: "1234567890abcdef", path: ".pi/output-gate/artifacts/og_a_1.txt", redacted: true }, "preview");
		expect(stub).toContain("og_a_1");
		expect(stub).toContain("bytes: 20");
		expect(stub).toContain("lines: 2");
		expect(stub).toContain("search_tool_outputs");
	});

	it("search_tool_outputs returns No stored tool outputs if manifest missing", async () => {
		const cwd = await tmp();
		expect(await searchToolOutputs({ cwd, query: "x", preferRg: false })).toBe("No stored tool outputs.");
	});

	it("registers tool, command, and tool_result hook", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		expect(pi.registerTool.mock.calls[0][0].name).toBe("search_tool_outputs");
		expect(pi.registerCommand.mock.calls[0][0]).toBe("output-gate");
		expect(pi.on).toHaveBeenCalledWith("tool_result", expect.any(Function));
	});

	it("tool_result hook fails open when output-gate processing throws", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hook = pi.on.mock.calls.find(([event]: [string]) => event === "tool_result")![1];
		const throwingPart = {};
		Object.defineProperty(throwingPart, "type", {
			get() {
				throw new Error("bad content shape");
			},
		});

		await expect(hook({ toolName: "bash", content: [throwingPart] }, { cwd: "/tmp" })).resolves.toBeUndefined();
	});
});

describe("output-gate extension execute handler", () => {
	it("execute returns content from searchToolOutputs", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const toolDef = pi.registerTool.mock.calls[0][0];
		const cwd = await tmp();
		const result = await toolDef.execute("id1", { query: "test" }, undefined, undefined, { cwd });
		expect(result.content[0].type).toBe("text");
		expect(result.content[0].text).toBe("No stored tool outputs.");
		expect(result.details).toEqual({});
	});

	it("execute uses process.cwd() when ctx is missing", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const toolDef = pi.registerTool.mock.calls[0][0];
		const result = await toolDef.execute("id1", { query: "test" }, undefined, undefined, undefined);
		expect(result.content[0].type).toBe("text");
	});

	it("execute passes artifact, maxResults, contextLines params", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const toolDef = pi.registerTool.mock.calls[0][0];
		const cwd = await tmp();
		const result = await toolDef.execute("id1", { query: "test", artifact: "og_art_1", maxResults: 5, contextLines: 2 }, undefined, undefined, { cwd });
		expect(result).toBeDefined();
	});

	it("execute returns 'Query is required.' for an empty query", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const toolDef = pi.registerTool.mock.calls[0][0];
		const cwd = await tmp();
		// pi validates required fields, so `{}` cannot reach execute in production;
		// the realistic empty-input case is an empty query string, which the
		// controller turns into its graceful "Query is required." response.
		const result = await toolDef.execute("id1", { query: "" }, undefined, undefined, { cwd });
		expect(result.content[0].text).toBe("Query is required.");
	});
});

describe("output-gate command handler", () => {
	it("clear command deletes output-gate dir when confirmed", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		// Create the output-gate dir so we can confirm deletion
		await fsp.mkdir(path.join(cwd, ".pi", "output-gate"), { recursive: true });
		await fsp.writeFile(path.join(cwd, ".pi", "output-gate", "test.txt"), "data");
		const confirm = vi.fn().mockResolvedValue(true);
		const notify = vi.fn();
		await cmdDef.handler("clear", { cwd, ui: { confirm, notify } });
		expect(confirm).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("output-gate artifacts cleared", "info");
	});

	it("clear command aborts when user declines", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		// Create dir so we can check it still exists after decline
		await fsp.mkdir(path.join(cwd, ".pi", "output-gate"), { recursive: true });
		const confirm = vi.fn().mockResolvedValue(false);
		const notify = vi.fn();
		await cmdDef.handler("clear", { cwd, ui: { confirm, notify } });
		expect(confirm).toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
		// Dir should still exist
		expect(fs.existsSync(path.join(cwd, ".pi", "output-gate"))).toBe(true);
	});

	it("clear command refuses without confirm function", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await fsp.mkdir(path.join(cwd, ".pi", "output-gate"), { recursive: true });
		const notify = vi.fn();
		await cmdDef.handler("clear", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalledWith("clear requires interactive confirmation", "warning");
		// Dir should still exist
		expect(fs.existsSync(path.join(cwd, ".pi", "output-gate"))).toBe(true);
	});

	it("list command shows stored artifacts", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_lst_1", now: () => 1000 });
		const notify = vi.fn();
		await cmdDef.handler("list", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("og_lst_1");
		expect(msg).toContain("bash");
	});

	it("list command returns 'No stored' when empty", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		const notify = vi.fn();
		await cmdDef.handler("list", { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalledWith("No stored tool outputs.", "info");
	});

	it("status (default arg) shows manifest info", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_sts_1", now: () => 1000 });
		const notify = vi.fn();
		await cmdDef.handler(undefined, { cwd, ui: { notify } });
		expect(notify).toHaveBeenCalled();
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("output-gate artifacts: 1");
		expect(msg).toContain("total bytes");
	});

	it("getArgumentCompletions returns matching completions", () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		expect(cmdDef.getArgumentCompletions("li")).toEqual([{ value: "list", label: "list" }]);
		expect(cmdDef.getArgumentCompletions("")).toEqual([{ value: "list", label: "list" }, { value: "clear", label: "clear" }, { value: "stats", label: "stats" }, { value: "show", label: "show" }, { value: "purge", label: "purge" }, { value: "enable-tools", label: "enable-tools" }, { value: "disable-tools", label: "disable-tools" }]);
		expect(cmdDef.getArgumentCompletions("xyz")).toEqual([]);
	});

	it("stats command shows aggregate stats", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_stats_1", now: () => 1000 });
		await saveArtifact({ cwd, toolName: "read", text: "foo bar baz", idGenerator: () => "og_stats_2", now: () => 2000 });
		const notify = vi.fn();
		await cmdDef.handler("stats", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("artifacts: 2");
		expect(msg).toContain("total bytes");
		expect(msg).toContain("total lines");
		expect(msg).toContain("bash: 1");
		expect(msg).toContain("read: 1");
	});

	it("show command displays artifact details", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_show_1", now: () => 1000 });
		const notify = vi.fn();
		await cmdDef.handler("show og_show_1", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("id: og_show_1");
		expect(msg).toContain("tool: bash");
		expect(msg).toContain("bytes:");
		expect(msg).toContain("sha256:");
	});

	it("show command displays metadata fields when present", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_showm_1", now: () => 1000, sessionId: "sess_1", turnId: "turn_1", toolCallId: "tc_1" });
		const notify = vi.fn();
		await cmdDef.handler("show og_showm_1", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("sessionId: sess_1");
		expect(msg).toContain("turnId: turn_1");
		expect(msg).toContain("toolCallId: tc_1");
		expect(msg).toContain("schemaVersion: output-gate/v1");
	});

	it("show command reports missing artifact", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		const notify = vi.fn();
		await cmdDef.handler("show og_nonexistent", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("Artifact not found");
	});

	it("purge --keep 1 retains only most recent artifact", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "first", idGenerator: () => "og_prg_1", now: () => 1000 });
		await saveArtifact({ cwd, toolName: "read", text: "second", idGenerator: () => "og_prg_2", now: () => 2000 });
		await saveArtifact({ cwd, toolName: "bash", text: "third", idGenerator: () => "og_prg_3", now: () => 3000 });
		const notify = vi.fn();
		await cmdDef.handler("purge --keep 1", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("Purged 2");
		expect(msg).toContain("Kept 1");
		// Verify manifest was rewritten
		const remaining = await readManifest(cwd);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe("og_prg_3");
	});

	it("purge without --keep uses default retention", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const cmdDef = pi.registerCommand.mock.calls[0][1];
		const cwd = await tmp();
		// Create only 1 artifact - should not be purged
		await saveArtifact({ cwd, toolName: "bash", text: "only", idGenerator: () => "og_prgd_1", now: () => 1000 });
		const notify = vi.fn();
		await cmdDef.handler("purge", { cwd, ui: { notify } });
		const msg = notify.mock.calls[0][0];
		expect(msg).toContain("nothing to purge");
	});
});

describe("output-gate tool_result hook", () => {
	it("returns undefined for search_tool_outputs tool", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const result = await hookFn({ toolName: "search_tool_outputs", content: [{ type: "text", text: "x".repeat(100) }] }, { cwd: "/tmp" });
		expect(result).toBeUndefined();
	});

	it("returns undefined for small tool output", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: "small" }] }, { cwd: "/tmp" });
		expect(result).toBeUndefined();
	});

	it("gates large tool output and returns stub", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }] }, { cwd });
		expect(result).toBeDefined();
		expect(result.content[0].text).toContain("[output-gate]");
		expect(result.details.outputGate.stored).toBe(true);
		expect(result.details.outputGate.bytes).toBe(64 * 1024);
	});

	it("preserves isError from original event", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }], isError: true }, { cwd });
		expect(result.isError).toBe(true);
	});

	it("omits isError when original event has no isError", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }] }, { cwd });
		expect(result.isError).toBeUndefined();
	});

	it("handles event with name instead of toolName", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ name: "bash", content: [{ type: "text", text: bigText }] }, { cwd });
		expect(result).toBeDefined();
		expect(result.content[0].text).toContain("[output-gate]");
	});

	it("merges existing event.details into result", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }], details: { extra: 42 } }, { cwd });
		expect(result.details.extra).toBe(42);
		expect(result.details.outputGate).toBeDefined();
	});

	it("uses event.cwd over ctx.cwd", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }], cwd }, { cwd: "/nonexistent" });
		expect(result).toBeDefined();
		expect(result.details.outputGate.stored).toBe(true);
	});

	it("handles storage failure gracefully", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		// Use a file as cwd to trigger mkdir failure
		const cwdBase = await tmp();
		const cwdFile = path.join(cwdBase, "file");
		await fsp.writeFile(cwdFile, "x");
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }], cwd: cwdFile }, {});
		expect(result).toBeDefined();
		expect(result.details.outputGate.stored).toBe(false);
		expect(result.details.outputGate.storageError).toBeDefined();
	});

	it("extracts text from string content", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		const result = await hookFn({ toolName: "bash", content: bigText }, { cwd });
		expect(result).toBeDefined();
		expect(result.content[0].text).toContain("[output-gate]");
	});

	it("records gated output in context ledger", async () => {
		const pi = { registerTool: vi.fn(), registerCommand: vi.fn(), on: vi.fn() } as any;
		outputGateExtension(pi);
		const hookFn = pi.on.mock.calls[0][1];
		const cwd = await tmp();
		const bigText = "x".repeat(64 * 1024);
		await hookFn({ toolName: "bash", content: [{ type: "text", text: bigText }] }, { cwd });

		// Check that the context ledger has a tool_result event
		const { readEvents } = await import("../ledger/store.js");
		const events = await readEvents(cwd);
		expect(events.length).toBeGreaterThanOrEqual(1);
		const ledgerEvent = events.find((e: any) => e.kind === "tool_result");
		expect(ledgerEvent).toBeDefined();
		expect(ledgerEvent!.title).toContain("bash");
		expect(ledgerEvent!.title).toContain("stored");
		expect(ledgerEvent!.refs).toBeDefined();
		expect(ledgerEvent!.refs![0].type).toBe("artifact");
	});
});
