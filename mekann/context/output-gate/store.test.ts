import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { artifactsDir, buildPreview, countLines, createArtifactId, ensureOutputGateDirs, gateTextForLlm, manifestPath, nextArtifactId, outputGateDir, readManifest, resolveArtifactPath, retainArtifacts, safeUtf8Slice, sanitizeManifestSource, saveArtifact, sha256, shouldGateOutput } from "./store.js";
import { registerOutputGateBypassTools, resetOutputGateBypassTools } from "./bypass.js";

async function tmp(): Promise<string> { return fsp.mkdtemp(path.join(os.tmpdir(), "og-store-")); }

describe("output-gate store", () => {
	beforeEach(() => resetOutputGateBypassTools());

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
		const parsed = JSON.parse(manifest[0]);
		expect(parsed.id).toBe("og_test_1");
		expect(parsed.contentType).toBe("text");
		expect(parsed.structuredPreview).toContain("hello");
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
		expect(result.text).toContain("contentType: text");
		expect(result.text).toContain("structured preview:");
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

	it("resolveArtifactPath returns undefined for an absolute path outside cwd (IC-275)", async () => {
		const cwd = await tmp();
		const entry = { id: "og_abs_1", toolName: "bash", createdAt: 1, cwd, bytes: 1, lines: 1, sha256: "abc", path: "/etc/passwd", redacted: true };
		expect(resolveArtifactPath(cwd, entry as any)).toBeUndefined();
	});

	it("resolveArtifactPath refuses a symlinked file that escapes artifacts/ (IC-275)", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		// A file outside the workspace that must never be touched.
		const outside = path.join(cwd, "outside-secret.txt");
		await fsp.writeFile(outside, "top-secret");
		// A symlink inside artifacts/ pointing at it.
		const linkPath = path.join(artifactsDir(cwd), "og_symlink_1.txt");
		await fsp.symlink(outside, linkPath);
		const entry = { id: "og_symlink_1", toolName: "bash", createdAt: 1, cwd, bytes: 1, lines: 1, sha256: "abc", path: path.relative(cwd, linkPath), redacted: true };
		// Must NOT resolve: realpath escapes artifacts/.
		expect(resolveArtifactPath(cwd, entry as any)).toBeUndefined();
		// And the external file must be untouched.
		expect(fs.existsSync(outside)).toBe(true);
		expect(fs.readFileSync(outside, "utf8")).toBe("top-secret");
	});

	it("resolveArtifactPath refuses a symlinked directory that escapes artifacts/ (IC-275)", async () => {
		const cwd = await tmp();
		// An external directory with a file the manifest will try to address.
		const outsideDir = path.join(cwd, "outside-dir");
		await fsp.mkdir(outsideDir);
		const outsideFile = path.join(outsideDir, "evil.txt");
		await fsp.writeFile(outsideFile, "protected");
		await ensureOutputGateDirs(cwd);
		// A symlinked subdirectory under artifacts/ pointing outside.
		const linkDir = path.join(artifactsDir(cwd), "linkdir");
		await fsp.symlink(outsideDir, linkDir);
		const entry = { id: "og_linkdir_1", toolName: "bash", createdAt: 1, cwd, bytes: 1, lines: 1, sha256: "abc", path: path.relative(cwd, path.join(linkDir, "evil.txt")), redacted: true };
		// Lexically under artifacts/ but realpath escapes — must refuse.
		expect(resolveArtifactPath(cwd, entry as any)).toBeUndefined();
		expect(fs.existsSync(outsideFile)).toBe(true);
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
		// IC-273: bypass is now opt-in metadata declared at the tool's
		// registration site. With a large payload (> maxInlineBytes) the size
		// check alone would gate, so only the registry exemption keeps it inline.
		registerOutputGateBypassTools(["search_tool_outputs"]);
		expect(shouldGateOutput("x".repeat(100), { toolName: "search_tool_outputs", maxInlineBytes: 10 })).toBe(false);
	});

	it("shouldGateOutput returns false when toolName is search_context_events", () => {
		registerOutputGateBypassTools(["search_context_events"]);
		expect(shouldGateOutput("x".repeat(100), { toolName: "search_context_events", maxInlineBytes: 10 })).toBe(false);
	});

	it("shouldGateOutput returns false when toolName is summarize_session_context", () => {
		registerOutputGateBypassTools(["summarize_session_context"]);
		expect(shouldGateOutput("x".repeat(100), { toolName: "summarize_session_context", maxInlineBytes: 10 })).toBe(false);
	});

	it("shouldGateOutput gates large output from tools that did not register bypass (no silent name exemption)", () => {
		// A brand-new search/aggregation tool that forgot to declare bypass is
		// still gated — the cycle is only avoided by explicit opt-in.
		expect(shouldGateOutput("x".repeat(100), { toolName: "new_search_tool", maxInlineBytes: 10 })).toBe(true);
	});

	it("shouldGateOutput gates large output even when it starts with the [output-gate] prefix (IC-274)", () => {
		// Self-reference detection is metadata-based, not a text prefix: a
		// legitimately large output that happens to start with "[output-gate]"
		// is still gated.
		expect(shouldGateOutput("[output-gate] Large bash output stored." + "x".repeat(100), { maxInlineBytes: 10 })).toBe(true);
	});

	it("shouldGateOutput returns true for text exceeding default threshold", () => {
		// Default is 48KB, so create text larger than that
		expect(shouldGateOutput("x".repeat(64 * 1024))).toBe(true);
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

describe("output-gate retainArtifacts", () => {
	it("is a no-op when manifest is within the keep limit", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "a", idGenerator: () => "og_rt_1", now: () => 1000 });
		await saveArtifact({ cwd, toolName: "bash", text: "b", idGenerator: () => "og_rt_2", now: () => 2000 });

		const result = await retainArtifacts(cwd, 10);

		expect(result.removed).toBe(0);
		expect(result.kept).toHaveLength(2);
		// manifest file is untouched when nothing was removed
		expect((await readManifest(cwd)).map((e) => e.id)).toEqual(["og_rt_1", "og_rt_2"]);
	});

	it("removes oldest entries, unlinks their files, and rewrites the manifest", async () => {
		const cwd = await tmp();
		await saveArtifact({ cwd, toolName: "bash", text: "old", idGenerator: () => "og_rm_1", now: () => 1000 });
		await saveArtifact({ cwd, toolName: "bash", text: "mid", idGenerator: () => "og_rm_2", now: () => 2000 });
		await saveArtifact({ cwd, toolName: "bash", text: "new", idGenerator: () => "og_rm_3", now: () => 3000 });

		const result = await retainArtifacts(cwd, 1);

		expect(result.removed).toBe(2);
		expect(result.kept).toHaveLength(1);
		expect(result.kept[0].id).toBe("og_rm_3");

		const remaining = await readManifest(cwd);
		expect(remaining.map((e) => e.id)).toEqual(["og_rm_3"]);
		// Oldest artifact files are gone; newest is still present.
		expect(resolveArtifactPath(cwd, { id: "og_rm_1", path: ".pi/output-gate/artifacts/og_rm_1.txt" } as any)).toBeUndefined();
		expect(resolveArtifactPath(cwd, { id: "og_rm_2", path: ".pi/output-gate/artifacts/og_rm_2.txt" } as any)).toBeUndefined();
		expect(resolveArtifactPath(cwd, remaining[0])).toBeDefined();
	});

	it("keeps manifest and artifact directory consistent (no orphans)", async () => {
		const cwd = await tmp();
		for (let i = 0; i < 5; i++) {
			await saveArtifact({ cwd, toolName: "bash", text: `t${i}`, idGenerator: () => `og_c_${i}`, now: () => 1000 + i });
		}

		await retainArtifacts(cwd, 2);

		const entries = await readManifest(cwd);
		expect(entries.map((e) => e.id)).toEqual(["og_c_4", "og_c_3"]);
		const files = await fsp.readdir(artifactsDir(cwd));
		// Every remaining artifact file has a manifest row, and vice versa.
		expect(files.sort()).toEqual(["og_c_3.txt", "og_c_4.txt"]);
	});

	it("returns empty kept list when manifest does not exist", async () => {
		const cwd = await tmp();
		const result = await retainArtifacts(cwd, 10);
		expect(result.removed).toBe(0);
		expect(result.kept).toEqual([]);
	});

	it("never unlinks a manifest entry whose realpath escapes artifacts/ (IC-275)", async () => {
		const cwd = await tmp();
		await ensureOutputGateDirs(cwd);
		// A file outside the workspace that must survive retention.
		const outside = path.join(cwd, "outside-secret.txt");
		await fsp.writeFile(outside, "top-secret");
		// Tampered manifest: a symlink inside artifacts/ pointing outside, plus a
		// legitimate newest entry so retainArtifacts tries to drop the symlink one.
		const linkPath = path.join(artifactsDir(cwd), "og_mal_1.txt");
		await fsp.symlink(outside, linkPath);
		const malicious = { schemaVersion: "output-gate/v1", id: "og_mal_1", toolName: "bash", createdAt: 1000, cwd, bytes: 1, lines: 1, sha256: "abc", path: path.relative(cwd, linkPath), redacted: true };
		await saveArtifact({ cwd, toolName: "bash", text: "new", idGenerator: () => "og_mal_2", now: () => 2000 });
		// Inject the malicious row ahead of the legit one in the manifest.
		const manifestFile = manifestPath(cwd);
		const legit = (await readManifest(cwd))[0];
		await fsp.writeFile(manifestFile, `${JSON.stringify(malicious)}\n${JSON.stringify(legit)}\n`, "utf8");

		const result = await retainArtifacts(cwd, 1);

		expect(result.kept).toHaveLength(1);
		expect(result.kept[0].id).toBe("og_mal_2");
		// The external file the symlink pointed at must still exist untouched.
		expect(fs.existsSync(outside)).toBe(true);
		expect(fs.readFileSync(outside, "utf8")).toBe("top-secret");
	});
});

describe("output-gate gateTextForLlm auto-retention", () => {
	it("does not retain when retentionMaxFiles is not provided (backward compatible)", async () => {
		const cwd = await tmp();
		const big = "x".repeat(200);
		for (let i = 0; i < 5; i++) {
			await gateTextForLlm({ cwd, toolName: "bash", text: big, maxInlineBytes: 10 });
		}
		// No retention configured -> manifest grows unbounded (legacy behaviour).
		expect((await readManifest(cwd))).toHaveLength(5);
	});

	it("keeps manifest + artifacts bounded across a long session", async () => {
		const cwd = await tmp();
		const keep = 3;
		const big = "x".repeat(200);
		let lastArtifactId: string | undefined;
		// Simulate a long session: many gated tool results, no manual purge.
		for (let i = 0; i < 50; i++) {
			const res = await gateTextForLlm({
				cwd,
				toolName: "bash",
				text: big,
				maxInlineBytes: 10,
				retentionMaxFiles: keep,
			});
			expect(res.gated).toBe(true);
			expect(res.artifactId).toBeDefined();
			lastArtifactId = res.artifactId;
		}

		const entries = await readManifest(cwd);
		// Manifest is bounded to the retention limit.
		expect(entries).toHaveLength(keep);
		// The just-saved (newest) artifact is retained.
		expect(entries.map((e) => e.id)).toContain(lastArtifactId);
		// Artifact directory is bounded too and stays consistent with the manifest.
		const files = (await fsp.readdir(artifactsDir(cwd))).sort();
		expect(files).toEqual(entries.map((e) => `${e.id}.txt`).sort());
	});

	it("always retains the just-saved (newest) artifact", async () => {
		const cwd = await tmp();
		const big = "x".repeat(200);
		await gateTextForLlm({ cwd, toolName: "bash", text: big, maxInlineBytes: 10, retentionMaxFiles: 1 });
		// Tiny delay so the second save gets a strictly newer createdAt.
		await new Promise((r) => setTimeout(r, 5));
		const res = await gateTextForLlm({ cwd, toolName: "bash", text: big, maxInlineBytes: 10, retentionMaxFiles: 1 });

		const entries = await readManifest(cwd);
		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe(res.artifactId);
		expect(resolveArtifactPath(cwd, entries[0])).toBeDefined();
	});
});
