import { describe, expect, it } from "vitest";

import { parseIssueArgs } from "./args.js";

describe("parseIssueArgs", () => {
	it("treats no args as interactive mode", () => {
		expect(parseIssueArgs([])).toEqual({ ok: true, value: { mode: "interactive", resultPath: undefined } });
	});

	it("parses the cleanup subcommand", () => {
		expect(parseIssueArgs(["cleanup"])).toEqual({ ok: true, value: { mode: "cleanup", resultPath: undefined } });
	});

	it("parses the autopilot subcommand", () => {
		expect(parseIssueArgs(["autopilot"])).toEqual({ ok: true, value: { mode: "autopilot", resultPath: undefined } });
	});

	it("parses --issue <number> as direct mode", () => {
		expect(parseIssueArgs(["--issue", "42"])).toEqual({ ok: true, value: { mode: "direct", issueNumber: 42, resultPath: undefined } });
	});

	it("rejects --issue without a number", () => {
		const result = parseIssueArgs(["--issue"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/--issue <number>/);
	});

	it("rejects a non-positive --issue number", () => {
		const result = parseIssueArgs(["--issue", "0"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/Invalid issue number/);
	});

	it("rejects a non-numeric --issue value", () => {
		const result = parseIssueArgs(["--issue", "abc"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/Invalid issue number/);
	});

	// Regression: `/issue <number>` used to be hardwired to orchestrate-only, so
	// leaf issues printed "nothing to orchestrate" and opened nothing. The bare
	// number now maps to the smart-dispatch "open" mode (orchestrate-if-parent,
	// otherwise direct open), mirroring the interactive list's single-select.
	it("parses a bare numeric argument as open mode (smart dispatch)", () => {
		expect(parseIssueArgs(["190"])).toEqual({ ok: true, value: { mode: "open", issueNumber: 190, resultPath: undefined } });
	});

	it("rejects a bare number with extra arguments", () => {
		expect(parseIssueArgs(["42", "43"]).ok).toBe(false);
	});

	it("rejects an unknown first argument", () => {
		expect(parseIssueArgs(["foo"]).ok).toBe(false);
	});

	it("extracts --result and still resolves the mode from the remaining args", () => {
		expect(parseIssueArgs(["--result", "/tmp/r.json", "42"])).toEqual({
			ok: true,
			value: { mode: "open", issueNumber: 42, resultPath: "/tmp/r.json" },
		});
	});

	it("rejects --result without a path", () => {
		const result = parseIssueArgs(["--result"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/--result <path>/);
	});
});
