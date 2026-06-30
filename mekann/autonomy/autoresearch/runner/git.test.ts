/**
 * runner/git.test.ts — git 操作・run id 生成の focused test。
 * {@link "./git.js"} を直接 import して単体検証する。
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	generatePiRunId,
	generateRunId,
	getChangedFiles,
	getGitFullHash,
	getGitShortHash,
	isGitDirty,
} from "./git.js";

describe("generatePiRunId", () => {
	it("embeds the -pi- segment and a 6-hex random suffix", () => {
		const id = generatePiRunId(process.cwd());
		expect(id).toContain("-pi-");
		const tail = id.split("-pi-")[1];
		// tail = <gitShortSha>-<random6hex>; random suffix is the last dash segment
		const random = tail.split("-").pop();
		expect(random).toMatch(/^[0-9a-f]{6}$/);
	});

	it("starts with a sortable UTC timestamp prefix (YYYYMMDD...)", () => {
		const id = generatePiRunId(process.cwd());
		// Prefix before "-pi-" is the ISO-UTC timestamp with separators stripped,
		// which sorts lexicographically with wall-clock order. Sanity-check its shape.
		const ts = id.split("-pi-")[0];
		expect(id.slice(0, 8)).toMatch(/^\d{8}$/); // YYYYMMDD
		expect(ts).toMatch(/^\d{8}T\d{6}/); // YYYYMMDDTHHMMSS...
	});
});

describe("generateRunId (deprecated)", () => {
	it("delegates to generatePiRunId with cwd='.'", () => {
		expect(generateRunId()).toContain("-pi-");
	});
});

describe("getGitShortHash / getGitFullHash", () => {
	it("returns 'unknown' for a directory that is not a git repo", () => {
		const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), "runner-git-nonrepo-"));
		expect(getGitShortHash(nonGit)).toBe("unknown");
		expect(getGitFullHash(nonGit)).toBe("unknown");
	});

	it("returns a real hash for the current repo and caches within TTL", () => {
		const hash = getGitShortHash(process.cwd());
		expect(hash).not.toBe("unknown");
		expect(hash.length).toBeGreaterThanOrEqual(7);
		// cached value is returned immediately and is identical
		expect(getGitShortHash(process.cwd())).toBe(hash);
	});
});

describe("isGitDirty / getChangedFiles", () => {
	it("returns a boolean and an array without throwing in a non-git dir", () => {
		const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), "runner-git-dirty-"));
		expect(typeof isGitDirty(nonGit)).toBe("boolean");
		expect(isGitDirty(nonGit)).toBe(true); // no git → treated as dirty
		expect(Array.isArray(getChangedFiles(nonGit))).toBe(true);
		expect(getChangedFiles(nonGit)).toEqual([]);
	});
});
