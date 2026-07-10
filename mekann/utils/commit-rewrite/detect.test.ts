import { describe, expect, it } from "vitest";
import { DEFAULT_WEAK_PATTERNS, isWeakMessage, parseWeakPatterns } from "./detect.js";

describe("parseWeakPatterns", () => {
	it("falls back to defaults when input is empty", () => {
		expect(parseWeakPatterns("")).toEqual(DEFAULT_WEAK_PATTERNS);
		expect(parseWeakPatterns(undefined)).toEqual(DEFAULT_WEAK_PATTERNS);
		expect(parseWeakPatterns("   ")).toEqual(DEFAULT_WEAK_PATTERNS);
	});

	it("parses a comma-separated list, lower-cased and trimmed", () => {
		expect(parseWeakPatterns("Add, WIP ,foo")).toEqual(["add", "wip", "foo"]);
	});

	it("falls back to defaults when all tokens are empty", () => {
		expect(parseWeakPatterns(" , , ")).toEqual(DEFAULT_WEAK_PATTERNS);
	});
});

describe("isWeakMessage", () => {
	it("flags empty subjects", () => {
		expect(isWeakMessage("")).toBe(true);
		expect(isWeakMessage("   ")).toBe(true);
	});

	it("flags single-token subjects", () => {
		expect(isWeakMessage("add")).toBe(true);
		expect(isWeakMessage("wip")).toBe(true);
		expect(isWeakMessage("FIX")).toBe(true);
	});

	it("flags exact matches against the weak-pattern list", () => {
		expect(isWeakMessage("cleanup")).toBe(true);
	});

	it("does NOT flag Conventional Commits messages, even when they contain 'add'", () => {
		expect(isWeakMessage("feat(utils): add terminal shortcut")).toBe(false);
		expect(isWeakMessage("fix: correct off-by-one")).toBe(false);
		expect(isWeakMessage("chore(release): 1.2.3")).toBe(false);
		expect(isWeakMessage("refactor!: drop legacy API")).toBe(false);
	});

	it("flags short non-conventional messages below the word threshold", () => {
		expect(isWeakMessage("update readme", DEFAULT_WEAK_PATTERNS, 3)).toBe(true); // 2 words
		expect(isWeakMessage("fix bug", DEFAULT_WEAK_PATTERNS, 3)).toBe(true); // 2 words
	});

	it("does NOT flag longer non-conventional messages that meet the word threshold", () => {
		expect(isWeakMessage("rewrite the entire message generation pipeline", DEFAULT_WEAK_PATTERNS, 3)).toBe(false);
	});

	it("respects a custom pattern list", () => {
		expect(isWeakMessage("yolo", ["yolo"], 3)).toBe(true);
		expect(isWeakMessage("add", ["yolo"], 3)).toBe(true); // still single-token → weak
	});
});
