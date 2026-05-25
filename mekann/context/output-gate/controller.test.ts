import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	OutputGateController,
	type OutputGateControllerConfig,
	type OutputGateRecorder,
	extractTextContent,
} from "./controller.js";
import { saveArtifact, readManifest, manifestPath } from "./store.js";
import type { RecordToolOutputArtifactInput } from "../recording.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "og-ctrl-"));
}

function defaultConfig(): OutputGateControllerConfig {
	return {
		maxInlineBytes: 16 * 1024,
		previewBytes: 4 * 1024,
		artifactRetentionMaxFiles: 200,
	};
}

function createController(
	config?: Partial<OutputGateControllerConfig>,
	recorder?: OutputGateRecorder,
): OutputGateController {
	return new OutputGateController({
		config: { ...defaultConfig(), ...config },
		recorder,
	});
}

function bigText(size = 20 * 1024): string {
	return "x".repeat(size);
}

// ---------------------------------------------------------------------------
// extractTextContent
// ---------------------------------------------------------------------------

describe("extractTextContent", () => {
	it("returns string as-is", () => {
		expect(extractTextContent("hello")).toBe("hello");
	});

	it("joins text parts from array content", () => {
		expect(
			extractTextContent([
				{ type: "text", text: "a" },
				{ type: "image", data: "..." },
				{ type: "text", text: "b" },
			]),
		).toBe("a\nb");
	});

	it("returns empty for non-array non-string", () => {
		expect(extractTextContent(42 as any)).toBe("");
		expect(extractTextContent(null as any)).toBe("");
	});

	it("skips non-text parts", () => {
		expect(extractTextContent([{ type: "image", data: "x" }])).toBe("");
	});
});

// ---------------------------------------------------------------------------
// handleToolResult
// ---------------------------------------------------------------------------

describe("OutputGateController handleToolResult", () => {
	it("returns undefined for ignored tools", async () => {
		const controller = createController();
		for (const toolName of [
			"search_tool_outputs",
			"search_context_events",
			"summarize_session_context",
		]) {
			const result = await controller.handleToolResult({
				cwd: "/tmp",
				toolName,
				content: bigText(),
			});
			expect(result).toBeUndefined();
		}
	});

	it("returns undefined for small output", async () => {
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd: "/tmp",
			toolName: "bash",
			content: "small",
		});
		expect(result).toBeUndefined();
	});

	it("gates large output and returns stub with stored=true", async () => {
		const cwd = await tmp();
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: [{ type: "text", text: bigText() }],
		});

		expect(result).toBeDefined();
		expect(result!.content[0].text).toContain("[output-gate]");
		expect(result!.details.outputGate.stored).toBe(true);
		expect(result!.details.outputGate.artifactId).toBeDefined();
		expect(result!.details.outputGate.bytes).toBe(20 * 1024);
	});

	it("handles storage failure with stored=false and storageError", async () => {
		const cwdBase = await tmp();
		const cwdFile = path.join(cwdBase, "file");
		await fsp.writeFile(cwdFile, "x");

		const controller = createController();
		const result = await controller.handleToolResult({
			cwd: cwdFile,
			toolName: "bash",
			content: bigText(),
		});

		expect(result).toBeDefined();
		expect(result!.details.outputGate.stored).toBe(false);
		expect(result!.details.outputGate.storageError).toBeDefined();
	});

	it("preserves isError from input", async () => {
		const cwd = await tmp();
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
			isError: true,
		});

		expect(result).toBeDefined();
		expect(result!.isError).toBe(true);
	});

	it("omits isError when input does not provide it", async () => {
		const cwd = await tmp();
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
		});

		expect(result).toBeDefined();
		expect(result!.isError).toBeUndefined();
	});

	it("merges existing details with outputGate", async () => {
		const cwd = await tmp();
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
			details: { exitCode: 0 },
		});

		expect(result).toBeDefined();
		expect(result!.details.exitCode).toBe(0);
		expect(result!.details.outputGate).toBeDefined();
	});

	it("extracts text from string content", async () => {
		const cwd = await tmp();
		const controller = createController();
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
		});

		expect(result).toBeDefined();
		expect(result!.content[0].text).toContain("[output-gate]");
	});

	// --- recording seam ---

	it("calls recorder when artifact is stored successfully", async () => {
		const cwd = await tmp();
		const calls: RecordToolOutputArtifactInput[] = [];
		const recorder: OutputGateRecorder = {
			async recordToolOutputArtifact(input) {
				calls.push(input);
			},
		};

		const controller = createController(undefined, recorder);
		await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
			isError: false,
			sessionId: "sess_1",
			turnId: "turn_1",
			toolCallId: "tc_1",
			branchId: "br_1",
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].toolName).toBe("bash");
		expect(calls[0].artifactId).toMatch(/^og_/);
		expect(calls[0].originalBytes).toBe(20 * 1024);
		expect(calls[0].isError).toBe(false);
		expect(calls[0].sessionId).toBe("sess_1");
		expect(calls[0].turnId).toBe("turn_1");
		expect(calls[0].toolCallId).toBe("tc_1");
		expect(calls[0].branchId).toBe("br_1");
	});

	it("does not call recorder when storage fails", async () => {
		const cwdBase = await tmp();
		const cwdFile = path.join(cwdBase, "file");
		await fsp.writeFile(cwdFile, "x");

		const calls: RecordToolOutputArtifactInput[] = [];
		const recorder: OutputGateRecorder = {
			async recordToolOutputArtifact(input) {
				calls.push(input);
			},
		};

		const controller = createController(undefined, recorder);
		await controller.handleToolResult({
			cwd: cwdFile,
			toolName: "bash",
			content: bigText(),
		});

		expect(calls).toHaveLength(0);
	});

	it("swallows recorder errors (best-effort)", async () => {
		const cwd = await tmp();
		const recorder: OutputGateRecorder = {
			async recordToolOutputArtifact() {
				throw new Error("ledger down");
			},
		};

		const controller = createController(undefined, recorder);
		// Should not throw
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
		});

		expect(result).toBeDefined();
		expect(result!.details.outputGate.stored).toBe(true);
	});

	it("does not call recorder when not provided", async () => {
		const cwd = await tmp();
		const controller = createController(undefined, undefined);
		// Should not throw
		const result = await controller.handleToolResult({
			cwd,
			toolName: "bash",
			content: bigText(),
		});

		expect(result).toBeDefined();
		expect(result!.details.outputGate.stored).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe("OutputGateController status", () => {
	it("reports artifact count and total bytes", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "hello",
			idGenerator: () => "og_st_1",
		});

		const controller = createController();
		const text = await controller.status(cwd);

		expect(text).toContain("output-gate artifacts: 1");
		expect(text).toContain("total bytes: 5");
		expect(text).toContain("manifest:");
	});
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe("OutputGateController list", () => {
	it("returns No stored tool outputs when empty", async () => {
		const cwd = await tmp();
		const controller = createController();
		expect(await controller.list(cwd)).toBe("No stored tool outputs.");
	});

	it("lists artifacts sorted by newest first", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "aaa",
			idGenerator: () => "og_li_1",
			now: () => 1000,
		});
		await saveArtifact({
			cwd,
			toolName: "read",
			text: "bbb",
			idGenerator: () => "og_li_2",
			now: () => 2000,
		});

		const controller = createController();
		const text = await controller.list(cwd);

		expect(text).toContain("og_li_2");
		expect(text).toContain("og_li_1");
		// Newest first
		const idx2 = text.indexOf("og_li_2");
		const idx1 = text.indexOf("og_li_1");
		expect(idx2).toBeLessThan(idx1);
	});
});

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

describe("OutputGateController stats", () => {
	it("returns No stored tool outputs when empty", async () => {
		const cwd = await tmp();
		const controller = createController();
		expect(await controller.stats(cwd)).toBe("No stored tool outputs.");
	});

	it("reports stats with breakdown by tool", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "hello",
			idGenerator: () => "og_sa_1",
		});
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "world",
			idGenerator: () => "og_sa_2",
		});
		await saveArtifact({
			cwd,
			toolName: "read",
			text: "data",
			idGenerator: () => "og_sa_3",
		});

		const controller = createController();
		const text = await controller.stats(cwd);

		expect(text).toContain("output-gate stats");
		expect(text).toContain("artifacts: 3");
		expect(text).toContain("bash: 2");
		expect(text).toContain("read: 1");
		expect(text).toContain("retention max: 200");
	});
});

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

describe("OutputGateController show", () => {
	it("returns Artifact not found for unknown id", async () => {
		const cwd = await tmp();
		const controller = createController();
		expect(await controller.show(cwd, "og_missing_1")).toBe(
			"Artifact not found: og_missing_1",
		);
	});

	it("returns metadata for existing artifact", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "hello",
			idGenerator: () => "og_sh_1",
			now: () => 1000,
			sessionId: "sess_abc",
			turnId: "turn_1",
		});

		const controller = createController();
		const text = await controller.show(cwd, "og_sh_1");

		expect(text).toContain("id: og_sh_1");
		expect(text).toContain("tool: bash");
		expect(text).toContain("sha256:");
		expect(text).toContain("schemaVersion: output-gate/v1");
		expect(text).toContain("sessionId: sess_abc");
		expect(text).toContain("turnId: turn_1");
		expect(text).toContain("file exists: true");
	});
});

// ---------------------------------------------------------------------------
// purge
// ---------------------------------------------------------------------------

describe("OutputGateController purge", () => {
	it("does nothing when below keep threshold", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "hello",
			idGenerator: () => "og_pg_1",
		});

		const controller = createController();
		const text = await controller.purge(cwd, 10);

		expect(text).toContain("nothing to purge");
	});

	it("removes oldest artifacts and rewrites manifest", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "old",
			idGenerator: () => "og_pg_1",
			now: () => 1000,
		});
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "new",
			idGenerator: () => "og_pg_2",
			now: () => 2000,
		});

		const controller = createController();
		const text = await controller.purge(cwd, 1);

		expect(text).toContain("Purged 1 artifacts");
		expect(text).toContain("Kept 1 (most recent)");

		// Only newest should remain
		const remaining = await readManifest(cwd);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe("og_pg_2");
	});

	it("uses config default keep when not specified", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "hello",
			idGenerator: () => "og_pd_1",
		});

		const controller = createController({ artifactRetentionMaxFiles: 200 });
		const text = await controller.purge(cwd);

		expect(text).toContain("nothing to purge");
	});
});

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

describe("OutputGateController search", () => {
	it("delegates to searchToolOutputs", async () => {
		const cwd = await tmp();
		await saveArtifact({
			cwd,
			toolName: "bash",
			text: "needle in haystack",
			idGenerator: () => "og_se_1",
		});

		const controller = createController();
		const text = await controller.search({
			cwd,
			query: "needle",
			preferRg: false,
		});

		expect(text).toContain("og_se_1");
		expect(text).toContain("needle");
	});
});
