import { describe, expect, it } from "vitest";
import * as fsp from "node:fs/promises";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { artifactsDir, countLines, createArtifactId, ensureOutputGateDirs, manifestPath, readManifest, saveArtifact, sha256 } from "./store.js";

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
});
