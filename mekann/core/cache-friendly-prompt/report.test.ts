import { describe, expect, it } from "vitest";
import { formatUnknownRoleNote } from "./report.js";

describe("formatUnknownRoleNote", () => {
	it("returns an empty string when there is no data", () => {
		expect(formatUnknownRoleNote(0, 0)).toBe("");
	});

	it("reports 0% without the above-target flag", () => {
		const note = formatUnknownRoleNote(0, 100);
		expect(note).toContain("0 / 100");
		expect(note).toContain("(0.0%)");
		expect(note).not.toContain("above 10% target");
	});

	it("reports below-target ratios without the flag", () => {
		const note = formatUnknownRoleNote(9, 100);
		expect(note).toContain("9 / 100");
		expect(note).toContain("(9.0%)");
		expect(note).not.toContain("above 10% target");
	});

	it("flags ratios at or above the 10% target", () => {
		const note = formatUnknownRoleNote(31, 100);
		expect(note).toContain("31 / 100");
		expect(note).toContain("(31.0%)");
		expect(note).toContain("above 10% target");
	});

	it("rounds the percentage to one decimal", () => {
		const note = formatUnknownRoleNote(2, 3);
		expect(note).toContain("(66.7%)");
	});
});
