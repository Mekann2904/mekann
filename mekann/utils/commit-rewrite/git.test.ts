import { describe, expect, it } from "vitest";
import { parseCommitList } from "./git.js";

describe("parseCommitList", () => {
	it("parses tab-separated sha/author/subject rows", () => {
		const raw = ["abc123\tdoe\tfeat: init", "def456\tmek\tadd", ""].join("\n");
		const commits = parseCommitList(raw);
		expect(commits).toEqual([
			{ sha: "abc123", author: "doe", subject: "feat: init" },
			{ sha: "def456", author: "mek", subject: "add" },
		]);
	});

	it("preserves tabs in the subject (joins remainder)", () => {
		const commits = parseCommitList("deadbeef\tmek\tadd\textra\tcol");
		expect(commits[0].subject).toBe("add\textra\tcol");
	});

	it("ignores blank and malformed lines", () => {
		const commits = parseCommitList("\n\nonly-one-field\n");
		expect(commits).toEqual([]);
	});

	it("handles empty input", () => {
		expect(parseCommitList("")).toEqual([]);
	});
});
