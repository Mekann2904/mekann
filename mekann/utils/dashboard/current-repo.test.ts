import { describe, expect, it } from "vitest";
import { formatCurrentRepoLine } from "./view-model.js";
import { parseAheadBehind, parsePorcelainStatus } from "./current-repo.js";

describe("current repo parsing", () => {
	it("splits staged, unstaged, and untracked changes", () => {
		expect(parsePorcelainStatus("M  staged.ts\n M unstaged.ts\nMM both.ts\n?? new.ts\n")).toEqual({ staged: 2, unstaged: 2, untracked: 1 });
	});

	it("parses git rev-list ahead/behind output", () => {
		expect(parseAheadBehind("3\t5\n")).toEqual({ kind: "counts", behind: 3, ahead: 5 });
	});

	it("formats the current repo line", () => {
		expect(formatCurrentRepoLine({ ok: true, repoName: "mekann", branch: "main", changes: { staged: 1, unstaged: 2, untracked: 3 }, aheadBehind: { kind: "counts", ahead: 4, behind: 5 }, latestCommit: { hash: "abc123", subject: "test" } })).toContain("1 staged / 2 unstaged / 3 untracked");
	});
});
