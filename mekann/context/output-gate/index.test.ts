import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import outputGateExtension, { buildStoredOutputStub, extractTextContent, shouldGateOutput } from "./index.js";
import { searchToolOutputs } from "./search.js";

async function tmp(): Promise<string> { return fsp.mkdtemp(path.join(os.tmpdir(), "og-index-")); }

describe("output-gate extension helpers", () => {
	it("shouldGateOutput false for small text", () => {
		expect(shouldGateOutput("small", { maxInlineBytes: 10 })).toBe(false);
	});

	it("shouldGateOutput true for large text", () => {
		expect(shouldGateOutput("x".repeat(11), { maxInlineBytes: 10 })).toBe(true);
	});

	it("existing output-gate stub is not gated again", () => {
		expect(shouldGateOutput("[output-gate] Large bash output stored." + "x".repeat(100), { maxInlineBytes: 10 })).toBe(false);
	});

	it("extracts text content from Pi tool content", () => {
		expect(extractTextContent([{ type: "text", text: "a" }, { type: "image", data: "..." }, { type: "text", text: "b" }])).toBe("a\nb");
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
});
