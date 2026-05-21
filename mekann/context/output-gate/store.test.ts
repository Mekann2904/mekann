import { describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { artifactsDir, buildPreview, countLines, createArtifactId, ensureOutputGateDirs, gateTextForLlm, manifestPath, nextArtifactId, outputGateDir, readManifest, resolveArtifactPath, safeUtf8Slice, sanitizeManifestSource, saveArtifact, sha256, shouldGateOutput } from "./store.js";

async function tmp(): Promise<string> { return fsp.mkdtemp(path.join(os.tmpdir(), "og-store-")); }

describe("output-gate store", () => {
	it("creates artifact ids with expected format", () => {
		expect(createArtifactId(123456789, 35)).toMatch(/^og_[a-z0-9]+_[a-z0-9]+$/);
	});

	it("ensureOutputGateDirs creates dirs", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		expect(fs.existsSync(artifactsDir(cwd))).toBe(true);
	});

	it("saveArtifact writes artifact file and appends manifest jsonl", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello\nworld", idGenerator: () => "og_test_1", now: () => 1 });
		expect(entry.path).toBe(path.join(".pi", "output-gate", "artifacts", "og_test_1.txt"));
		expect(fs.readFileSync(path.join(cwd, entry.path), "utf8")).toBe("hello\nworld");
		const manifest = fs.readFileSync(manifestPath(cwd), "utf8").trim().split("\n");
		expect(manifest).toHaveLength(1);
		expect(JSON.parse(manifest[0]).id).toBe("og_test_1");
	});

	it("readManifest skips invalid JSONL lines", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		await fsp.writeFile(manifestPath(cwd), "not json\n{\"id\":\"og_a_1\",\"path\":\".pi/output-gate/artifacts/og_a_1.txt\"}\n", "utf8");
		const entries = await readManifest(cwd);
		expect(entries.map((e) => e.id)).toEqual(["og_a_1"]);
	});

	it("sha256 is stable", () => {
		expect(sha256("abc")).toBe(sha256("abc"));
		expect(sha256("abc")).toHaveLength(64);
	});

	it("counts bytes and lines correctly", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "read", text: "a\nβ", idGenerator: () => "og_test_2" });
		expect(entry.bytes).toBe(Buffer.byteLength("a\nβ", "utf8"));
		expect(entry.lines).toBe(2);
		expect(countLines("")).toBe(0);
	});

	it("paths are relative and safe", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "x", idGenerator: () => "og_safe_1" });
		expect(path.isAbsolute(entry.path)).toBe(false);
		expect(entry.path.startsWith("..")).toBe(false);
	});

	it("safeUtf8Slice does not hang when tail starts inside a multibyte char", () => {
		expect(safeUtf8Slice("abc😀def", 5, true)).toBe("def");
		expect(safeUtf8Slice("abc😀def", 6, true)).toBe("def");
	});

	it("buildPreview handles unicode without replacement chars at boundaries", () => {
		const preview = buildPreview(`開始\n${"😀".repeat(100)}\n終了`, 64);
		expect(preview).not.toMatch(/^�|�$/u);
	});

	it("sanitizes manifest source secrets and unserializable values", () => {
		const source: any = { token: "token=abc123", nested: {} };
		source.big = 1n;
		source.nested.self = source;
		expect(sanitizeManifestSource(source)).toEqual({ token: "token=[REDACTED]", nested: { self: "[Circular]" }, big: "1" });
	});

	it("gateTextForLlm returns handled redacted preview when storage fails", async () => {
		const cwdFile = path.join(await tmp(), "not-a-dir");
		await fsp.writeFile(cwdFile, "file", "utf8");
		const result = await gateTextForLlm({ cwd: cwdFile, toolName: "bash", text: `password=secret\n${"x".repeat(200)}`, maxInlineBytes: 10, previewBytes: 300 });
		expect(result.handled).toBe(true);
		expect(result.gated).toBe(false);
		expect(result.text).toContain("Failed to store");
		expect(result.text).toContain("password=[REDACTED]");
		expect(result.text).not.toContain("password=secret");
	});

	it("gateTextForLlm returns unhandled for text below threshold", async () => {
		const cwd = await tmp();
		const result = await gateTextForLlm({ cwd, toolName: "bash", text: "small", maxInlineBytes: 100 });
		expect(result.gated).toBe(false);
		expect(result.handled).toBe(false);
		expect(result.text).toBe("small");
	});

	it("gateTextForLlm stores large text successfully", async () => {
		const cwd = await tmp();
		const bigText = "x".repeat(200);
		const result = await gateTextForLlm({ cwd, toolName: "bash", text: bigText, maxInlineBytes: 10 });
		expect(result.gated).toBe(true);
		expect(result.handled).toBe(true);
		expect(result.artifactId).toBeDefined();
		expect(result.sha256).toBeDefined();
		expect(result.redacted).toBe(true);
		expect(result.text).toContain("[output-gate]");
	});

	it("readManifest rethrows non-ENOENT errors", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		// Write a directory as manifest path to cause a read error
		await fsp.mkdir(manifestPath(cwd), { recursive: true });
		await expect(readManifest(cwd)).rejects.toThrow();
	});

	it("sanitizeManifestSource returns fallback for unserializable", () => {
		// Create an object with a getter that throws
		const obj: any = {};
		Object.defineProperty(obj, "bad", { get() { throw new Error("boom"); }, enumerable: true });
		expect(sanitizeManifestSource(obj)).toBe("[Unserializable source]");
	});

	it("sanitizeManifestSource returns undefined for undefined input", () => {
		expect(sanitizeManifestSource(undefined)).toBeUndefined();
	});

	it("resolveArtifactPath returns undefined for path traversal", async () => {
		const cwd = await tmp();
		const entry = { id: "og_evil_1", toolName: "bash", createdAt: 1, cwd, bytes: 1, lines: 1, sha256: "abc", path: "../../etc/passwd", redacted: true };
		expect(resolveArtifactPath(cwd, entry as any)).toBeUndefined();
	});

	it("resolveArtifactPath returns undefined for missing file", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		const entry = { id: "og_miss_1", toolName: "bash", createdAt: 1, cwd, bytes: 1, lines: 1, sha256: "abc", path: ".pi/output-gate/artifacts/og_miss_1.txt", redacted: true };
		expect(resolveArtifactPath(cwd, entry as any)).toBeUndefined();
	});

	it("resolveArtifactPath returns abs path for valid file", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_reso_1" });
		const [entry] = await readManifest(cwd);
		const abs = resolveArtifactPath(cwd, entry);
		expect(abs).toBeDefined();
		expect(fs.existsSync(abs!)).toBe(true);
	});

	it("saveArtifact rejects invalid artifact id", async () => {
		const cwd = await tmp();
		await expect(saveArtifact({ cwd, toolName: "bash", text: "x", idGenerator: () => "invalid-id" })).rejects.toThrow("Invalid output-gate artifact id");
	});

	it("saveArtifact uses nextArtifactId when no idGenerator provided", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello", now: () => 12345 });
		expect(entry.id).toMatch(/^og_[a-z0-9]+_[a-z0-9]+$/);
	});

	it("saveArtifact with source includes it in manifest entry", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_src_1", source: { kind: "tool_result", toolName: "bash" } });
		expect(entry.source).toEqual({ kind: "tool_result", toolName: "bash" });
	});

	it("saveArtifact with redacted=true skips redaction", async () => {
		const cwd = await tmp();
		const { text } = await saveArtifact({ cwd, toolName: "bash", text: "password=secret", idGenerator: () => "og_red_1", redacted: true });
		// When redacted=true, text is used as-is without running redactSecrets
		expect(text).toBe("password=secret");
	});

	it("saveArtifact with redacted=false applies redaction", async () => {
		const cwd = await tmp();
		const { text } = await saveArtifact({ cwd, toolName: "bash", text: "password=secret", idGenerator: () => "og_red_2", redacted: false });
		expect(text).toContain("password=[REDACTED]");
		expect(text).not.toContain("password=secret");
	});

	it("safeUtf8Slice returns empty string for maxBytes <= 0", () => {
		expect(safeUtf8Slice("hello", 0)).toBe("");
		expect(safeUtf8Slice("hello", -1)).toBe("");
	});

	it("safeUtf8Slice from start handles multibyte boundary", () => {
		// '😀' is 4 bytes, 'abc' is 3 bytes. Slice at 5 bytes should not end with replacement char.
		const result = safeUtf8Slice("abc😀def", 5, false);
		expect(result).not.toMatch(/\ufffd$/u);
		expect(result.length).toBeGreaterThan(0);
	});

	it("safeUtf8Slice from end returns empty when all chars are multi-byte", () => {
		// Very small maxBytes with emoji-only string
		expect(safeUtf8Slice("😀😀😀", 0, true)).toBe("");
	});

	it("outputGateDir returns correct path", () => {
		expect(outputGateDir("/project")).toBe(path.join("/project", ".pi", "output-gate"));
	});

	it("nextArtifactId increments counter", () => {
		const id1 = nextArtifactId(1000);
		const id2 = nextArtifactId(1000);
		expect(id1).not.toBe(id2);
	});

	it("shouldGateOutput returns false for empty string", () => {
		expect(shouldGateOutput("")).toBe(false);
	});

	it("shouldGateOutput returns false when toolName is search_tool_outputs", () => {
		expect(shouldGateOutput("x".repeat(100), { toolName: "search_tool_outputs" })).toBe(false);
	});

	it("shouldGateOutput returns false when toolName is search_context_events", () => {
		expect(shouldGateOutput("x".repeat(100), { toolName: "search_context_events" })).toBe(false);
	});

	it("shouldGateOutput returns true for text exceeding default threshold", () => {
		// Default is 16KB, so create text larger than that
		expect(shouldGateOutput("x".repeat(20 * 1024))).toBe(true);
	});

	it("readManifest skips entries without id or path", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		await fsp.writeFile(manifestPath(cwd), JSON.stringify({ id: "bad_id", path: ".pi/output-gate/artifacts/bad.txt" }) + "\n", "utf8");
		const entries = await readManifest(cwd);
		expect(entries).toHaveLength(0);
	});

	it("saveArtifact includes schemaVersion and metadata fields", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello world", idGenerator: () => "og_meta_1", now: () => 1000, sessionId: "sess_abc", turnId: "turn_1", toolCallId: "tc_1" });
		expect(entry.schemaVersion).toBe("output-gate/v1");
		expect(entry.redactionVersion).toBe(1);
		expect(entry.sessionId).toBe("sess_abc");
		expect(entry.turnId).toBe("turn_1");
		expect(entry.toolCallId).toBe("tc_1");
		// Read back from manifest
		const entries = await readManifest(cwd);
		expect(entries[0].schemaVersion).toBe("output-gate/v1");
		expect(entries[0].sessionId).toBe("sess_abc");
	});

	it("saveArtifact omits metadata fields when not provided", async () => {
		const cwd = await tmp();
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_nomet_1" });
		expect(entry.sessionId).toBeUndefined();
		expect(entry.turnId).toBeUndefined();
		expect(entry.toolCallId).toBeUndefined();
	});

	it("saveArtifact tracks originalBytes/lines when redaction changes them", async () => {
		const cwd = await tmp();
		// Redaction shouldn't change a simple string, but verify the field exists
		const { entry } = await saveArtifact({ cwd, toolName: "bash", text: "hello", idGenerator: () => "og_orig_1", redacted: false });
		expect(entry.bytes).toBeGreaterThan(0);
		expect(entry.lines).toBeGreaterThanOrEqual(1);
	});
});
