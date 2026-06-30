import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { archiveFile } from "./commandHandler.js";

async function tmp(): Promise<string> {
	return fsp.mkdtemp(path.join(os.tmpdir(), "archive-file-"));
}

const EXDEV = (): never => {
	const e = new Error("cross-device link not permitted") as NodeJS.ErrnoException;
	e.code = "EXDEV";
	throw e;
};

describe("autoresearch archiveFile", () => {
	let cwd: string;
	beforeEach(async () => { cwd = await tmp(); });
	afterEach(async () => { await fsp.rm(cwd, { recursive: true, force: true }); });

	it("same-volume rename: moves the file into .autoresearch/archived with a timestamp suffix", () => {
		fs.writeFileSync(path.join(cwd, "autoresearch.md"), "BODY");
		const warnings: string[] = [];
		archiveFile(cwd, "autoresearch.md", warnings);
		expect(warnings).toEqual([]);
		// source is gone
		expect(fs.existsSync(path.join(cwd, "autoresearch.md"))).toBe(false);
		const archivedDir = path.join(cwd, ".autoresearch", "archived");
		const files = fs.readdirSync(archivedDir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^autoresearch\.md\.\d{4}-\d{2}-\d{2}T/);
		expect(fs.readFileSync(path.join(archivedDir, files[0]), "utf8")).toBe("BODY");
		// no leftover temp from an atomic move
		expect(files.find((f) => f.endsWith(".tmp"))).toBeUndefined();
	});

	it("is a no-op when the source does not exist", () => {
		const warnings: string[] = [];
		archiveFile(cwd, "missing.md", warnings);
		expect(warnings).toEqual([]);
		expect(fs.existsSync(path.join(cwd, ".autoresearch"))).toBe(false);
	});

	it("cross-volume (EXDEV) fallback: atomically archives via temp+rename and removes the source", () => {
		fs.writeFileSync(path.join(cwd, "autoresearch.plan.md"), "PLAN");
		const warnings: string[] = [];
		// Inject a rename that mimics a cross-device link error so the
		// copy-via-temp-then-rename fallback is exercised on a single-volume tmpdir.
		archiveFile(cwd, "autoresearch.plan.md", warnings, { renameSync: EXDEV });
		expect(warnings).toEqual([]);
		// source removed only after the durable archive was in place
		expect(fs.existsSync(path.join(cwd, "autoresearch.plan.md"))).toBe(false);
		const archivedDir = path.join(cwd, ".autoresearch", "archived");
		const files = fs.readdirSync(archivedDir);
		expect(files).toHaveLength(1);
		expect(fs.readFileSync(path.join(archivedDir, files[0]), "utf8")).toBe("PLAN");
		// no partial temp left behind
		expect(files.find((f) => f.endsWith(".tmp"))).toBeUndefined();
	});

	it("non-EXDEV rename failure leaves the source intact and records a warning (no torn copy)", () => {
		fs.writeFileSync(path.join(cwd, "autoresearch.md"), "BODY");
		const warnings: string[] = [];
		archiveFile(cwd, "autoresearch.md", warnings, {
			renameSync: () => { const e = new Error("permission denied") as NodeJS.ErrnoException; e.code = "EACCES"; throw e; },
		});
		// source preserved; no fallback copy attempted for non-EXDEV errors
		expect(fs.existsSync(path.join(cwd, "autoresearch.md"))).toBe(true);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("退避に失敗");
		// no archived file was produced (no torn copy)
		const archivedDir = path.join(cwd, ".autoresearch", "archived");
		expect(fs.existsSync(archivedDir) ? fs.readdirSync(archivedDir) : []).toEqual([]);
	});

	// chmod-based: skip when running as root (root bypasses permission bits).
	const itNonRoot = (typeof process.getuid === "function" && process.getuid() === 0) ? it.skip : it;

	itNonRoot("cross-volume fallback: a mid-copy failure leaves the source intact and no torn archive", async () => {
		const src = path.join(cwd, "autoresearch.ideas.md");
		fs.writeFileSync(src, "IDEAS");
		// Make the source unreadable so the real copyFileSync fails inside the
		// fallback. The source must never be removed when the archive is not durable.
		await fsp.chmod(src, 0o000);
		const warnings: string[] = [];
		try {
			archiveFile(cwd, "autoresearch.ideas.md", warnings, { renameSync: EXDEV });
		} finally {
			await fsp.chmod(src, 0o600); // restore so the afterEach cleanup can remove it
		}
		// source preserved
		expect(fs.existsSync(src)).toBe(true);
		// no archive file created
		const archivedDir = path.join(cwd, ".autoresearch", "archived");
		expect(fs.existsSync(archivedDir) ? fs.readdirSync(archivedDir) : []).toEqual([]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("退避に失敗");
	});
});
